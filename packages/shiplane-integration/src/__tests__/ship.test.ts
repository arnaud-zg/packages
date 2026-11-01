import { cloudflarePagesStaticHosting } from "@shiplane/cloudflare-pages";
import { flyServerHosting } from "@shiplane/fly";
import { backendService, webApp } from "shiplane/plugin";
import { planShips, shipTo, testContext, testUnit } from "shiplane/testing";
import { describe, expect, it } from "vitest";

const API = testUnit("api", {
  version: "0.0.3",
  module: "backend-service",
  options: {
    app: { preview: "acme-api-preview", production: "acme-api-production" },
    config: { preview: "fly-preview.toml", production: "fly-production.toml" },
    url: { preview: "https://api-preview.acme.dev", production: "https://api.acme.dev" },
  },
});

const ADMIN = testUnit("admin", {
  version: "0.1.3",
  module: "web-app",
  after: ["api"],
  options: {
    project: "acme-admin",
    build: { env: { VITE_API_URL: "${units.api.url}" } },
  },
});

const MODULES = [
  backendService({ serverHosting: flyServerHosting() }),
  webApp({ staticHosting: cloudflarePagesStaticHosting() }),
];

const setUp = () => {
  const world = testContext({ units: [API, ADMIN], modules: MODULES });
  world.source.seed({
    position: { branch: "main", head: "c0ffee1", originMain: "c0ffee1" },
    tags: { "api@0.0.3": "t3", "admin@0.1.3": "t4" },
    files: {
      "api@0.0.3:.github/workflows/ship.yml": "on: workflow_dispatch",
      "admin@0.1.3:.github/workflows/ship.yml": "on: workflow_dispatch",
      "main:.github/workflows/ship.yml": "on: workflow_dispatch",
    },
  });
  world.ci.seed({ minutes: { used: 600, included: 2000, left: 1400 } });
  return world;
};

const HOW_API = "How should api@0.0.3 ship to preview?";
const HOW_ADMIN = "How should admin@0.1.3 ship to preview?";

describe("shipping to an environment, fire and forget", () => {
  it("given api and admin tagged on main's commit, when shipped through GitHub Actions, then one ship run covers both, from main", async () => {
    const { context, ci, source, prompter } = setUp();
    source.seed({ tags: { "api@0.0.3": "c0ffee1", "admin@0.1.3": "c0ffee1" } });
    prompter.answer("github", "github", true);

    expect(await shipTo(context, "preview", {})).toBe(true);

    expect(ci.received).toEqual([
      {
        type: "dispatch",
        workflow: "ship.yml",
        ref: "main",
        inputs: { units: "api admin", environment: "preview" },
      },
    ]);
  });

  it("given a repository with no ship workflow, when shipped, then nobody is asked how and it ships from this machine, saying why", async () => {
    const { context, ci, source, prompter, output } = setUp();
    source.seed({ files: {} });
    prompter.answer(true);

    expect(await shipTo(context, "preview", {})).toBe(true);

    expect(prompter.asked).not.toContain(HOW_API);
    expect(ci.received).toEqual([]);
    expect(output.text).toContain("api@0.0.3  no ship.yml: ships from this machine");
  });

  it("given a runner dispatched for production, when it ships, then it goes without asking for production's name again", async () => {
    const { context, host, prompter } = setUp();
    context.options.ci = true;
    context.options.yes = true;
    host.seed({
      deployments: [
        { title: "Deploy api@0.0.3 to preview", state: "done" },
        { title: "Deploy admin@0.1.3 to preview", state: "done" },
      ],
    });

    expect(await shipTo(context, "production", {})).toBe(true);

    expect(prompter.asked).toEqual([]);
    expect(host.received.map(({ type }) => type)).toEqual(["record", "record"]);
  });

  it("given a unit neither GitHub Actions nor this machine can ship, when shipped, then the others still go and the run fails", async () => {
    const { context, source, shell, prompter, output } = setUp();
    source.seed({
      files: { "main:.github/workflows/ship.yml": "on: workflow_dispatch" },
      diffs: { "admin@0.1.3..HEAD": ["apps/admin/src/main.tsx"] },
    });
    prompter.answer(true);

    expect(await shipTo(context, "preview", {})).toBe(false);

    expect(shell.calls.map(({ command }) => command)).toEqual(["flyctl"]);
    expect(output.text).toContain("admin@0.1.3  predates ship.yml, and main moved past it");
  });

  it("given api and admin tagged but not on preview, when shipped through GitHub Actions, then each workflow is dispatched on its tag, api first, and nothing waits for them", async () => {
    const { context, ci, shell, prompter, output } = setUp();
    prompter.answer("github", "github", true);

    expect(await shipTo(context, "preview", {})).toBe(true);

    expect(ci.received).toEqual([
      {
        type: "dispatch",
        workflow: "ship.yml",
        ref: "api@0.0.3",
        inputs: { units: "api", environment: "preview" },
      },
      {
        type: "dispatch",
        workflow: "ship.yml",
        ref: "admin@0.1.3",
        inputs: { units: "admin", environment: "preview" },
      },
    ]);
    expect(shell.calls).toEqual([]);
    expect(output.text).toContain("gh run list");
  });

  it("given the same release shipped from this machine, when it runs, then Fly deploys from the root and waits for its rollout, admin builds against preview's API and both deploys are recorded", async () => {
    const { context, host, shell, prompter } = setUp();
    prompter.answer("local", "local", true);

    expect(await shipTo(context, "preview", {})).toBe(true);

    expect(shell.calls).toEqual([
      {
        command: "flyctl",
        args: [
          "deploy",
          "--remote-only",
          "--config",
          "apps/api/fly-preview.toml",
          "--dockerfile",
          "apps/api/Dockerfile",
        ],
        cwd: "/repo",
        env: undefined,
      },
      {
        command: "pnpm",
        args: ["turbo", "run", "build", "--filter=@acme/admin"],
        cwd: "/repo",
        env: { VITE_API_URL: "https://api-preview.acme.dev" },
      },
      {
        command: "npx",
        args: [
          "--yes",
          "wrangler@4.141.0",
          "pages",
          "deploy",
          "apps/admin/dist",
          "--project-name=acme-admin",
          "--branch=preview",
          "--commit-hash=c0ffee1",
          "--commit-message=admin@0.1.3",
        ],
        cwd: "/repo",
        env: undefined,
      },
    ]);
    expect(host.received).toEqual([
      { type: "record", ref: "api@0.0.3", environment: "preview" },
      { type: "record", ref: "admin@0.1.3", environment: "preview" },
    ]);
  });

  it("given Fly's rollout fails, when shipped from this machine, then no deploy is recorded and nothing after it runs", async () => {
    const { context, host, shell, prompter } = setUp();
    shell.seed("flyctl deploy", { status: 1 });
    prompter.answer("local", "local", true);

    expect(await shipTo(context, "preview", {})).toBe(false);

    expect(shell.calls.map(({ command }) => command)).toEqual(["flyctl"]);
    expect(host.received).toEqual([]);
  });

  it("given no terminal and no --via, when shipped, then it says how to choose and fails", async () => {
    const world = testContext({
      units: [API, ADMIN],
      modules: MODULES,
      interactive: false,
    });
    world.source.seed({
      tags: { "api@0.0.3": "t3", "admin@0.1.3": "t4" },
      files: {
        "api@0.0.3:.github/workflows/ship.yml": "on: workflow_dispatch",
        "admin@0.1.3:.github/workflows/ship.yml": "on: workflow_dispatch",
      },
    });

    expect(await shipTo(world.context, "preview", {})).toBe(false);
    expect(world.output.text).toContain("shiplane ship --via github");
    expect(world.host.received).toEqual([]);
  });

  it("given it runs inside GitHub Actions, when shipped, then it ships from that runner without dispatching another workflow", async () => {
    const { context, host, shell, prompter } = setUp();
    context.options.ci = true;
    prompter.answer(true);

    await shipTo(context, "preview", {});

    expect(prompter.asked).not.toContain(HOW_API);
    expect(shell.calls.map(({ command }) => command)).toEqual(["flyctl", "pnpm", "npx"]);
    expect(host.received.map(({ type }) => type)).toEqual(["record", "record"]);
  });

  it("given the API needs a build secret that is set, when it ships from here, then flyctl gets it by name and a plan never shows its value", async () => {
    const { context, shell, prompter, output } = setUp();
    context.release.units[0] = {
      ...API,
      options: { ...API.options, buildSecrets: ["SENTRY_AUTH_TOKEN"] },
    };
    shell.seedEnv({ SENTRY_AUTH_TOKEN: "sntrys_secret" });
    prompter.answer("local", "local", true);

    await shipTo(context, "preview", {});
    await planShips(context, "preview");

    expect(shell.calls[0]?.args.slice(-2)).toEqual([
      "--build-secret",
      "SENTRY_AUTH_TOKEN=sntrys_secret",
    ]);
    expect(output.text).toContain("--build-secret SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN");
    expect(output.text).not.toContain("sntrys_secret");
  });

  it("given the build secret is not set, when the API ships from here, then it is left out and said", async () => {
    const { context, shell, prompter, output } = setUp();
    context.release.units[0] = {
      ...API,
      options: { ...API.options, buildSecrets: ["SENTRY_AUTH_TOKEN"] },
    };
    prompter.answer("local", "local", true);

    await shipTo(context, "preview", {});

    expect(shell.calls[0]?.args).not.toContain("--build-secret");
    expect(output.text).toContain("SENTRY_AUTH_TOKEN is not set");
  });

  it("given --via local, when shipped, then nobody is asked how", async () => {
    const { context, prompter } = setUp();
    prompter.answer(true);

    await shipTo(context, "preview", { via: "local" });

    expect(prompter.asked).not.toContain(HOW_API);
    expect(prompter.asked).not.toContain(HOW_ADMIN);
  });

  it("given api already on preview, when shipped, then only admin goes", async () => {
    const { context, host, ci, prompter } = setUp();
    host.seed({ deployments: [{ title: "Deploy api@0.0.3 to preview", state: "done" }] });
    prompter.answer("github", true);

    await shipTo(context, "preview", {});

    expect(prompter.asked).not.toContain(HOW_API);
    expect(ci.received.map(({ ref }) => ref)).toEqual(["admin@0.1.3"]);
  });

  it("given api through GitHub Actions and admin from this machine, when shipped, then api's workflow is dispatched and admin builds and deploys here", async () => {
    const { context, host, ci, shell, prompter, output } = setUp();
    prompter.answer("github", "local", true);

    await shipTo(context, "preview", {});

    expect(prompter.asked).toEqual(expect.arrayContaining([HOW_API, HOW_ADMIN]));
    expect(ci.received).toEqual([
      {
        type: "dispatch",
        workflow: "ship.yml",
        ref: "api@0.0.3",
        inputs: { units: "api", environment: "preview" },
      },
    ]);
    expect(host.received).toEqual([{ type: "record", ref: "admin@0.1.3", environment: "preview" }]);
    expect(shell.calls.map(({ command }) => command)).toEqual(["pnpm", "npx"]);
    expect(prompter.asked).toContain(
      "Ship api@0.0.3 (GitHub Actions), admin@0.1.3 (this machine) to preview?",
    );
    expect(output.text).toContain("gh run list");
  });

  it("given one unit's ship cancelled, when asked how, then nothing ships", async () => {
    const { context, host, ci, shell, prompter } = setUp();
    prompter.answer("github", null);

    expect(await shipTo(context, "preview", {})).toBe(true);

    expect(host.received).toEqual([]);
    expect(ci.received).toEqual([]);
    expect(shell.calls).toEqual([]);
  });

  it("given a tag older than its workflow, when asked how to ship, then it is not asked and ships from this machine, saying why", async () => {
    const { context, host, ci, source, prompter, output } = setUp();
    source.seed({
      files: {
        "api@0.0.3:.github/workflows/ship.yml": "on: workflow_dispatch",
        "main:.github/workflows/ship.yml": "on: workflow_dispatch",
      },
    });
    prompter.answer("github", true);

    await shipTo(context, "preview", {});

    expect(prompter.asked).not.toContain(HOW_ADMIN);
    expect(ci.received).toEqual([
      {
        type: "dispatch",
        workflow: "ship.yml",
        ref: "api@0.0.3",
        inputs: { units: "api", environment: "preview" },
      },
    ]);
    expect(host.received).toEqual([{ type: "record", ref: "admin@0.1.3", environment: "preview" }]);
    expect(output.text).toContain("admin@0.1.3  predates ship.yml: ships from this machine");
  });

  it("given a tag older than its workflow and --via github, when shipped, then it is left out and says so", async () => {
    const { context, ci, source, prompter, output } = setUp();
    source.seed({
      files: {
        "api@0.0.3:.github/workflows/ship.yml": "on: workflow_dispatch",
        "main:.github/workflows/ship.yml": "on: workflow_dispatch",
      },
    });
    prompter.answer(true);

    await shipTo(context, "preview", { via: "github" });

    expect(ci.received.map(({ ref }) => ref)).toEqual(["api@0.0.3"]);
    expect(output.text).toContain("admin@0.1.3  predates ship.yml: ship it from this machine");
  });

  it("given main moved past a tag, when asked how to ship, then it is not asked and goes through GitHub Actions, since this machine builds its checkout", async () => {
    const { context, host, ci, shell, source, prompter, output } = setUp();
    source.seed({ diffs: { "admin@0.1.3..HEAD": ["apps/admin/src/main.tsx"] } });
    prompter.answer("local", true);

    await shipTo(context, "preview", {});

    expect(prompter.asked).not.toContain(HOW_ADMIN);
    expect(shell.calls.map(({ command }) => command)).toEqual(["flyctl"]);
    expect(host.received.map(({ type }) => type)).toEqual(["record"]);
    expect(ci.received.map(({ ref }) => ref)).toEqual(["admin@0.1.3"]);
    expect(output.text).toContain("admin@0.1.3  main moved past it: ships through GitHub Actions");
  });

  it("given main moved past a tag and --via local, when shipped, then that unit is refused since this machine builds its checkout", async () => {
    const { context, shell, source, prompter, output } = setUp();
    source.seed({ diffs: { "admin@0.1.3..HEAD": ["apps/admin/src/main.tsx"] } });
    prompter.answer(true);

    await shipTo(context, "preview", { via: "local" });

    expect(shell.calls.map(({ command }) => command)).toEqual(["flyctl"]);
    expect(output.text).toContain("admin@0.1.3  main moved past it");
  });

  it("given 80 Actions minutes left this month, when asked how to ship, then this machine is offered first for each unit", async () => {
    const { context, ci, prompter, output } = setUp();
    ci.seed({ minutes: { used: 1920, included: 2000, left: 80 } });
    prompter.answer("local", "local", true);

    await shipTo(context, "preview", {});

    expect(prompter.initials[HOW_API]).toBe("local");
    expect(prompter.initials[HOW_ADMIN]).toBe("local");
    expect(output.text).toContain("about to run out");
  });

  it("given a ship to preview through GitHub Actions, when it asks to go ahead, then Yes is preselected", async () => {
    const { context, prompter } = setUp();
    prompter.answer("github", "github", false, false);

    await shipTo(context, "preview", {});

    const question = prompter.asked.find((asked) => asked.startsWith("Ship "));
    expect(question).toContain("to preview through GitHub Actions");
    expect(question && prompter.initials[question]).toBe(true);
  });

  it("given a ship to production, when it asks to go ahead, then No stays preselected", async () => {
    const { context, host, prompter } = setUp();
    host.seed({
      deployments: [
        { title: "Deploy api@0.0.3 to preview", state: "done" },
        { title: "Deploy admin@0.1.3 to preview", state: "done" },
      ],
    });
    prompter.answer("production", "local", "local", false);

    await shipTo(context, "production", {});

    const question = prompter.asked.find((asked) => asked.startsWith("Ship "));
    expect(question && prompter.initials[question]).toBe(false);
  });

  it("given production, when the person does not type its name, then nothing ships", async () => {
    const { context, host, shell, prompter } = setUp();
    host.seed({
      deployments: [
        { title: "Deploy api@0.0.3 to preview", state: "done" },
        { title: "Deploy admin@0.1.3 to preview", state: "done" },
      ],
    });
    prompter.answer("prod");

    expect(await shipTo(context, "production", {})).toBe(false);
    expect(host.received).toEqual([]);
    expect(shell.calls).toEqual([]);
  });

  it("given production and its name typed, when shipped, then admin builds against the production API on Pages' production branch", async () => {
    const { context, host, shell, prompter } = setUp();
    host.seed({
      deployments: [
        { title: "Deploy api@0.0.3 to preview", state: "done" },
        { title: "Deploy admin@0.1.3 to preview", state: "done" },
      ],
    });
    prompter.answer("production", "local", "local", true);

    await shipTo(context, "production", {});

    expect(shell.calls[1]?.env).toEqual({ VITE_API_URL: "https://api.acme.dev" });
    expect(shell.calls[2]?.args).toContain("--branch=main");
    expect(host.received.map(({ type }) => type)).toEqual(["record", "record"]);
  });
});

describe("declining preview", () => {
  const INSTEAD = "Ship to production instead?";

  it("given preview declined, when asked what next, then production is offered with No preselected and nothing ships on a No", async () => {
    const { context, host, ci, shell, prompter } = setUp();
    prompter.answer("github", "github", false, false);

    expect(await shipTo(context, "preview", {})).toBe(true);

    expect(prompter.asked).toContain(INSTEAD);
    expect(prompter.initials[INSTEAD]).toBe(false);
    expect(host.received).toEqual([]);
    expect(ci.received).toEqual([]);
    expect(shell.calls).toEqual([]);
  });

  it("given preview declined and production picked instead, when production's name is typed, then what preview validated ships to production", async () => {
    const { context, host, prompter } = setUp();
    host.seed({ deployments: [{ title: "Deploy api@0.0.3 to preview", state: "done" }] });
    prompter.answer("local", false, true, "production", "local", true);

    expect(await shipTo(context, "preview", {})).toBe(true);

    expect(prompter.asked).toContain('Type "production" to start:');
    expect(host.received).toEqual([
      { type: "record", ref: "api@0.0.3", environment: "production" },
    ]);
  });

  it("given --yes, when shipping to preview, then production is never offered", async () => {
    const { context, prompter } = setUp();
    prompter.answer("github", "github");

    await shipTo({ ...context, options: { ...context.options, yes: true } }, "preview", {});

    expect(prompter.asked).not.toContain(INSTEAD);
  });
});

describe("a dry run", () => {
  it("given api and admin, when planned, then every command is printed and nothing runs or is asked", async () => {
    const { context, host, shell, prompter, output } = setUp();

    await planShips(context, "preview");

    expect(output.text).toContain("flyctl deploy --remote-only --config apps/api/fly-preview.toml");
    expect(output.text).toContain(
      "gh workflow run ship.yml --ref api@0.0.3 -f units=api -f environment=preview",
    );
    expect(output.text).toContain(
      "VITE_API_URL=https://api-preview.acme.dev pnpm turbo run build --filter=@acme/admin",
    );
    expect(shell.calls).toEqual([]);
    expect(host.received).toEqual([]);
    expect(prompter.asked).toEqual([]);
  });
});
