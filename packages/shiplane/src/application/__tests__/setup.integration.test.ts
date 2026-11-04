import { describe, expect, it } from "vitest";

import { packageRegistryFake } from "../../adapters/package-registry/__fakes__/package-registry.fake";
import { serverHostingFake } from "../../adapters/server-hosting/__fakes__/server-hosting.fake";
import { staticHostingFake } from "../../adapters/static-hosting/__fakes__/static-hosting.fake";
import { detecting, memoryRepository } from "../../testing/memoryRepository";
import { setup } from "../setup";

// Every scenario runs in memory: files, shell, person and adapters are Fakes. Nothing on this
// machine is read, written, pushed, published or deployed.

const fly = () =>
  detecting(serverHostingFake(), "fly", "fly.toml", (folder) => ({ service: folder.name }));
const pages = () => ({
  ...detecting(staticHostingFake(), "pages", "wrangler.toml", (folder) => ({ site: folder.name })),
  questions: (_folder: unknown, found: Record<string, unknown>) =>
    found.site ? [] : [{ key: "site", message: "Site name?", initial: "web" }],
});
const ADAPTERS = () => [fly(), pages(), packageRegistryFake()];

const manifest = (name: string, scripts: Record<string, string> = { build: "tsc" }) =>
  JSON.stringify({ name, version: "0.1.0", scripts });

/** A repository whose git, GitHub, Actions and Changesets are all proven. */
const PROVEN = {
  "package.json": JSON.stringify({ name: "acme", private: true }),
  "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
  ".git/HEAD": "ref: refs/heads/main\n",
  ".github/workflows/ci.yml": "on: push\n",
  ".changeset/config.json": "{}\n",
  "apps/api/package.json": manifest("@acme/api"),
  "apps/api/fly.toml": 'app = "acme-api"\n',
};

const given = (files: Record<string, string>, options?: { interactive?: boolean }) => {
  const repo = memoryRepository(files, ADAPTERS(), options);
  repo.shell.seed("git remote get-url origin", { stdout: "git@github.com:acme/mono.git\n" });
  return repo;
};

/** No command that leaves this machine ran: no push, no publish, no deploy, no workflow. */
const touchedNothingOutside = (calls: { command: string; args: string[] }[]) =>
  calls.every(
    ({ command, args }) =>
      !(command === "git" && ["push", "tag", "commit"].includes(args[0] ?? "")) &&
      !["gh", "flyctl", "wrangler", "eas"].includes(command) &&
      !(command === "npm" && args[0] === "publish"),
  );

describe("Feature: setting up a new repository", () => {
  it("given every flow part proven and an app an adapter is sure of, when setup runs, then two answers make it ready", async () => {
    const { context, prompter, output, files, shell } = given(PROVEN);
    prompter.answer(true, true);

    const done = await setup(context, { yes: false });

    expect(done).toBe(true);
    expect(prompter.asked).toEqual([
      "Your apps and packages are in apps/* (1 folders)?",
      "Releasable. Write it?",
    ]);
    expect(output.text).toContain("proof: fly.toml");
    expect(files.read("shiplane.config.ts")).toContain("gitHubActionsCiPipeline()");
    expect(files.read("apps/api/shiplane.unit.yml")).toContain("service: api");
    expect(touchedNothingOutside(shell.calls)).toBe(true);
  });

  it("given a folder no adapter is sure of, when setup runs, then it asks what it is, where it goes and what that needs", async () => {
    const { context, prompter, files } = given({
      ...PROVEN,
      "apps/web/package.json": manifest("@acme/web"),
    });
    prompter.answer(true, "static-hosting", "pages", "acme-web", true);

    expect(await setup(context, { yes: false })).toBe(true);

    expect(prompter.asked).toContain("What is apps/web?");
    expect(prompter.asked).toContain("Where does apps/web go?");
    expect(prompter.asked).toContain("apps/web · Site name?");
    expect(files.read("apps/web/shiplane.unit.yml")).toContain("site: acme-web");
  });

  it("given an internal tool, when setup asks what it is, then it is versioned and gets no unit file", async () => {
    const { context, prompter, files } = given({
      ...PROVEN,
      "apps/scripts/package.json": manifest("@acme/scripts"),
    });
    prompter.answer(true, "skip", true);

    expect(await setup(context, { yes: false })).toBe(true);

    expect(files.exists("apps/scripts/shiplane.unit.yml")).toBe(false);
  });

  it("given no workspace folders, when setup asks where the apps are, then a path matching nothing is asked again", async () => {
    const { context, prompter, files } = given({
      ...PROVEN,
      "pnpm-workspace.yaml": "packages:\n  - services/*\n",
      "tools/cli/package.json": manifest("@acme/cli"),
      "tools/cli/fly.toml": "",
    });
    prompter.answer("nowhere/*", "tools/*", true);

    expect(await setup(context, { yes: false })).toBe(true);

    expect(
      prompter.asked.filter((question) => question.startsWith("Where are your apps")),
    ).toHaveLength(2);
    expect(files.read("shiplane.config.ts")).toContain('units: ["tools/*"]');
  });

  it("given a folder without a build script, when setup asks how to build it, then the answer is saved as buildCommand", async () => {
    const { context, prompter, files, shell } = given({
      ...PROVEN,
      "apps/api/package.json": manifest("@acme/api", {}),
    });
    prompter.answer(true, "make api", true);

    expect(await setup(context, { yes: false })).toBe(true);

    expect(files.read("apps/api/shiplane.unit.yml")).toContain("buildCommand: make api");
    expect(shell.calls).toContainEqual(
      expect.objectContaining({ command: "sh", args: ["-c", "make api"] }),
    );
  });
});

describe("Feature: custom adapters", () => {
  it("given a CI pipeline nothing proves, when Custom is picked and named, then its adapter and contract test are written and imported", async () => {
    const { ".github/workflows/ci.yml": _ci, ...noActions } = PROVEN;
    const { context, prompter, files } = given(noActions);
    prompter.answer("ready", "ready", "custom", "jenkinsCiPipeline", "ready", true, true);

    expect(await setup(context, { yes: false })).toBe(true);

    expect(files.read("shiplane.config.ts")).toContain(
      'import { jenkinsCiPipeline } from "./shiplane/adapters/jenkins-ci-pipeline";',
    );
    expect(files.read("shiplane/adapters/jenkins-ci-pipeline.ts")).toContain("ciPipelineMemory");
    expect(files.read("shiplane/adapters/jenkins-ci-pipeline.test.ts")).toContain(
      "ciPipelineContract",
    );
  });

  it("given a name that is not a factory name, when it is typed, then it is asked again", async () => {
    const { ".github/workflows/ci.yml": _ci, ...noActions } = PROVEN;
    const { context, prompter, output } = given(noActions);
    prompter.answer("ready", "ready", "custom", "jenkins-ci", "jenkinsCi", "ready", true, true);

    expect(await setup(context, { yes: false })).toBe(true);

    expect(output.text).toContain("jenkins-ci: a name like customCiPipeline");
  });

  it("given an app no installed adapter fits, when Custom is picked, then a named module ships it", async () => {
    const { context, prompter, files } = given({
      ...PROVEN,
      "apps/app/package.json": manifest("@acme/app"),
    });
    prompter.answer(true, "mobile-distribution", "appDelivery", true);

    expect(await setup(context, { yes: false })).toBe(true);

    expect(prompter.asked).not.toContain("Where does apps/app go?");
    expect(files.read("apps/app/shiplane.unit.yml")).toContain("module: app-delivery");
    expect(files.read("shiplane/adapters/app-delivery.ts")).toContain("mobileDistributionMemory");
  });

  it("given a config whose own module already ships an app, when a new folder is unclear, then that module is offered first", async () => {
    const { context, prompter, files } = given({
      ...PROVEN,
      "apps/bot/package.json": manifest("@acme/bot"),
    });
    prompter.answer(true, "server-hosting", "custom", "botDelivery", true);
    await setup(context, { yes: false });
    files.write("apps/worker/package.json", manifest("@acme/worker"));
    prompter.answer("module:bot-delivery", true);

    expect(await setup(context, { yes: false })).toBe(true);

    const offered = prompter.choices["What is apps/worker?"]?.map(({ label }) => label) ?? [];
    expect(offered).toContain("Like bot-delivery");
    expect(offered.indexOf("Like bot-delivery")).toBeLessThan(offered.indexOf("Backend service"));
    expect(files.read("apps/worker/shiplane.unit.yml")).toContain("module: bot-delivery");
  });
});

describe("Feature: nothing is written until a release would work", () => {
  it("given a failing build, when setup rehearses, then it shows why and puts every file back", async () => {
    const { context, prompter, output, files, shell } = given(PROVEN);
    const before = files.all;
    shell.seed("npm run build", { status: 1, stderr: "error TS2304: cannot find name" });
    prompter.answer(true);

    expect(await setup(context, { yes: false })).toBe(false);

    expect(output.text).toContain("cannot find name");
    expect(output.text).toContain("Nothing written.");
    expect(files.all).toEqual(before);
  });

  it("given a rehearsal that passes, when the person says no, then every file is put back", async () => {
    const { context, prompter, files } = given(PROVEN);
    prompter.answer(true, false);

    expect(await setup(context, { yes: false })).toBe(false);

    expect(files.exists("shiplane.config.ts")).toBe(false);
    expect(files.exists("apps/api/shiplane.unit.yml")).toBe(false);
  });

  it("given --yes and a folder no adapter is sure of, when setup runs, then it lists what needs a person and writes nothing", async () => {
    const { context, output, files } = given(
      { ...PROVEN, "apps/web/package.json": manifest("@acme/web") },
      { interactive: false },
    );

    expect(await setup(context, { yes: true })).toBe(false);

    expect(output.text).toContain("apps/web (no adapter is sure what it is)");
    expect(files.changes).toEqual([]);
  });

  it("given --yes and a flow nothing proves, when setup runs, then it names each unproven part and writes nothing", async () => {
    const { context, output, files } = given(
      {
        "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
        "apps/api/package.json": manifest("@acme/api"),
      },
      { interactive: false },
    );

    expect(await setup(context, { yes: true })).toBe(false);

    expect(output.text).toContain("the source control (nothing proves one)");
    expect(files.changes).toEqual([]);
  });
});

describe("Feature: choosing how a repository releases", () => {
  const NO_CHANGESETS = Object.fromEntries(
    Object.entries(PROVEN).filter(([file]) => file !== ".changeset/config.json"),
  );
  const QUESTION = "How do you want to release?";

  const devDependencies = (files: { read: (file: string) => string | null }) =>
    (JSON.parse(files.read("package.json") ?? "{}") as { devDependencies?: Record<string, string> })
      .devDependencies;

  it("given no changesets config, when commits are picked, then setup configures them and says what is left", async () => {
    const { context, prompter, output, files } = given({ ...NO_CHANGESETS, "pnpm-lock.yaml": "" });
    prompter.answer("commits", true, true);

    expect(await setup(context, { yes: false })).toBe(true);

    expect(prompter.asked).toEqual([
      QUESTION,
      "Your apps and packages are in apps/* (1 folders)?",
      "Releasable. Write it?",
    ]);
    expect(prompter.initials[QUESTION]).toBe("commits");
    expect(files.read("shiplane.config.ts")).toContain("versioning: commitsVersioning()");
    expect(JSON.parse(files.read(".changeset/config.json") ?? "{}")).toMatchObject({
      baseBranch: "main",
      privatePackages: { version: true, tag: false },
    });
    expect(devDependencies(files)).toHaveProperty("@changesets/cli");
    expect(output.text).toContain("Run pnpm install, then merge a commit");
    expect(output.text).not.toMatch(/a changeset/);
  });

  it("given no changesets config, when changesets are picked, then the config is written the same and it says to add one", async () => {
    const { context, prompter, output, files } = given(NO_CHANGESETS);
    prompter.answer("changesets", true, true);

    expect(await setup(context, { yes: false })).toBe(true);

    expect(files.read("shiplane.config.ts")).toContain("versioning: changesetsVersioning()");
    expect(files.exists(".changeset/config.json")).toBe(true);
    expect(output.text).toContain("then add a changeset, merge");
  });

  it("given --yes and no changesets config, when setup runs, then it takes commits and asks nothing", async () => {
    const { context, prompter, files } = given(NO_CHANGESETS, { interactive: false });

    expect(await setup(context, { yes: true })).toBe(true);

    expect(prompter.asked).toEqual([]);
    expect(files.read("shiplane.config.ts")).toContain("commitsVersioning()");
    expect(files.exists(".changeset/config.json")).toBe(true);
  });

  it("given @changesets/cli already there, when setup runs, then package.json is left alone and no install is asked for", async () => {
    const manifestWithCli = JSON.stringify({
      name: "acme",
      private: true,
      devDependencies: { "@changesets/cli": "^2.0.0" },
    });
    const { context, prompter, output, files } = given({
      ...NO_CHANGESETS,
      "package.json": manifestWithCli,
    });
    prompter.answer("commits", true, true);

    await setup(context, { yes: false });

    expect(files.read("package.json")).toBe(manifestWithCli);
    expect(output.text).toContain("Ready. Merge a commit");
  });

  it("given a failing build, when setup rehearses, then the changesets files are put back too", async () => {
    const { context, prompter, files, shell } = given(NO_CHANGESETS);
    const before = files.all;
    shell.seed("npm run build", { status: 1, stderr: "error TS2304: cannot find name" });
    prompter.answer("commits", true);

    expect(await setup(context, { yes: false })).toBe(false);

    expect(files.all).toEqual(before);
  });
});

describe("Feature: running setup again", () => {
  it("given nothing changed, when setup runs again, then it asks nothing and says all is set", async () => {
    const { context, prompter, output } = given(PROVEN);
    prompter.answer(true, true);
    await setup(context, { yes: false });
    const asked = prompter.asked.length;

    expect(await setup(context, { yes: false })).toBe(true);

    expect(prompter.asked).toHaveLength(asked);
    expect(output.lines.at(-1)).toContain("all set");
  });

  it("given a misspelt module in a unit file, when setup runs again, then it names the file and line and writes nothing", async () => {
    const { context, prompter, output, files } = given(PROVEN);
    prompter.answer(true, true);
    await setup(context, { yes: false });
    files.write("apps/api/shiplane.unit.yml", "module: backend-servic\n");
    const writes = files.changes.length;

    expect(await setup(context, { yes: false })).toBe(false);

    expect(output.text).toContain("apps/api/shiplane.unit.yml:1");
    expect(files.changes).toHaveLength(writes);
  });

  it("given a new folder an adapter is sure of, when setup runs again, then only that folder is added", async () => {
    const { context, prompter, files } = given(PROVEN);
    prompter.answer(true, true);
    await setup(context, { yes: false });
    const api = files.read("apps/api/shiplane.unit.yml");
    files.write("apps/admin/package.json", manifest("@acme/admin"));
    files.write("apps/admin/wrangler.toml", "");
    prompter.answer(true);

    expect(await setup(context, { yes: false })).toBe(true);

    expect(files.read("apps/admin/shiplane.unit.yml")).toContain("site: admin");
    expect(files.read("apps/api/shiplane.unit.yml")).toBe(api);
  });
});
