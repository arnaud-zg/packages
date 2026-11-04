import { describe, expect, it } from "vitest";

import type { PlannedChangeset } from "../../domain/changes";
import { CommandFailed } from "../../ports/shell.port";
import { planFrom } from "../../testing/plans";
import { changesetText, testContext, testUnit } from "../../testing/releaseContext";
import { openReleasePr } from "../openReleasePr";
import { prepareRelease } from "../prepareRelease";

const PLANT: PlannedChangeset = {
  id: "plant-not-in-catalog",
  summary: "A plant not in the catalog yet never blocks its page.",
  releases: [{ name: "@acme/api", type: "patch" }],
};

const HISTORY: PlannedChangeset = {
  id: "admin-history",
  summary: "Admin shows every identification a user made.",
  releases: [{ name: "@acme/admin", type: "minor" }],
};

// One changeset naming both apps: they share a release PR.
const SHARED: PlannedChangeset = {
  ...HISTORY,
  releases: [...HISTORY.releases, { name: "@acme/api", type: "patch" }],
};

const setUp = ({ linked = true }: { linked?: boolean } = {}) => {
  const units = [testUnit("api", { version: "0.0.1" }), testUnit("admin", { version: "0.1.0" })];
  const world = testContext({ units });
  const changesets = [PLANT, linked ? SHARED : HISTORY];
  world.versioning.seed({
    pending: changesets.map(({ id, summary, releases }) => ({
      id,
      text: changesetText(
        Object.fromEntries(releases.map(({ name, type }) => [name, type])),
        summary,
      ),
    })),
    plan: planFrom(changesets, { "@acme/api": "0.0.1", "@acme/admin": "0.1.0" }),
  });
  world.source.seed({
    changed: [
      "apps/api/package.json",
      "apps/api/CHANGELOG.md",
      "apps/admin/package.json",
      "apps/admin/CHANGELOG.md",
      ".changeset/plant-not-in-catalog.md",
      "pnpm-lock.yaml",
    ],
  });
  return world;
};

describe("opening the release pull request", () => {
  it("given api and admin with changesets of their own, when the release opens, then each gets its own release PR from main", async () => {
    const { context, source, host, versioning, prompter } = setUp({ linked: false });
    prompter.answer(true);

    const prs = await openReleasePr(
      context,
      await prepareRelease(context, new Set(["api", "admin"])),
    );

    expect(
      host.received.flatMap((event) => (event.type === "pr" ? [[event.head, event.title]] : [])),
    ).toEqual([
      [
        expect.stringMatching(/^shiplane\/release-2026-10-12-\d{4}-api$/),
        "chore(api): release v0.0.2",
      ],
      [
        expect.stringMatching(/^shiplane\/release-2026-10-12-\d{4}-admin$/),
        "chore(admin): release v0.2.0",
      ],
    ]);
    expect(versioning.applied.map(({ held }) => held.map(({ id }) => id))).toEqual([
      ["admin-history"],
      ["plant-not-in-catalog"],
    ]);
    expect(source.received.map(({ type }) => type)).toEqual([
      "branch",
      "commit",
      "push",
      "switch",
      "branch",
      "commit",
      "push",
      "switch",
    ]);
    expect(prs).toHaveLength(2);
  });

  it("given four packages of one family, when the release opens, then the family is one release PR titled by its root", async () => {
    const units = ["kit", "kit-cli", "kit-react", "kit-vue"].map((name) =>
      testUnit(name, { version: "1.0.0", module: "published-package" }),
    );
    const world = testContext({ units });
    const changesets: PlannedChangeset[] = units.map(({ name }) => ({
      id: `${name}-change`,
      summary: `${name} does more.`,
      releases: [{ name: `@acme/${name}`, type: "minor" }],
    }));
    world.versioning.seed({
      pending: changesets.map(({ id, summary, releases }) => ({
        id,
        text: changesetText(
          Object.fromEntries(releases.map(({ name, type }) => [name, type])),
          summary,
        ),
      })),
      plan: planFrom(
        changesets,
        Object.fromEntries(units.map(({ packageName }) => [packageName, "1.0.0"])),
      ),
    });
    world.prompter.answer(true);

    await openReleasePr(
      world.context,
      await prepareRelease(world.context, new Set(units.map(({ name }) => name))),
    );

    expect(
      world.host.received.flatMap((event) => (event.type === "pr" ? [event.title] : [])),
    ).toEqual(["chore(kit): release v1.1.0"]);
  });

  it("given changesets for api and admin, when the release opens, then both are versioned on one branch with one PR saying what each ships", async () => {
    const { context, source, host, versioning, prompter } = setUp();
    prompter.answer(true);

    const prepared = await prepareRelease(context, new Set(["api", "admin"]));
    const prs = await openReleasePr(context, prepared);

    expect(prepared.bumps.map(({ app, from, to }) => `${app} ${from} → ${to}`)).toEqual([
      "api 0.0.1 → 0.0.2",
      "admin 0.1.0 → 0.2.0",
    ]);
    expect(versioning.applied).toEqual([{ added: [], held: [] }]);
    expect(source.received.map(({ type }) => type)).toEqual(["branch", "commit", "push", "switch"]);
    expect(source.received.filter(({ type }) => type === "branch")).toEqual([
      { type: "branch", name: expect.stringMatching(/^shiplane\/release-2026-10-12-\d{4}$/) },
    ]);
    expect(host.received).toEqual([
      expect.objectContaining({
        type: "pr",
        base: "main",
        head: expect.stringMatching(/^shiplane\/release-2026-10-12-\d{4}$/),
        title: "chore(release): api v0.0.2 and admin v0.2.0",
        label: "type: chore",
      }),
    ]);
    expect(prs?.map(({ number }) => number)).toEqual([1800]);
  });

  it("given api and admin released together, when the release opens, then one commit holds every changed file", async () => {
    const { context, source, prompter } = setUp();
    const changed = [
      "apps/api/package.json",
      "apps/api/CHANGELOG.md",
      "apps/admin/package.json",
      "apps/admin/CHANGELOG.md",
      ".changeset/admin-history.md",
      ".changeset/plant-not-in-catalog.md",
      "pnpm-lock.yaml",
    ];
    source.seed({ changed });
    prompter.answer(true);

    await openReleasePr(context, await prepareRelease(context, new Set(["api", "admin"])));

    expect(source.received.filter(({ type }) => type === "commit")).toEqual([
      expect.objectContaining({
        title: "chore(release): api v0.0.2 and admin v0.2.0",
        files: changed,
      }),
    ]);
  });

  it("given several apps released together, when the release opens, then the one PR's body covers each app and asks for one squash merge", async () => {
    const { context, host, prompter } = setUp();
    prompter.answer(true);

    await openReleasePr(context, await prepareRelease(context, new Set(["api", "admin"])));

    const bodies = host.received.flatMap((event) => (event.type === "pr" ? [event.body] : []));
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toContain("| api   | 0.0.1 → 0.0.2");
    expect(bodies[0]).toContain("| admin | 0.1.0 → 0.2.0");
    expect(bodies[0]).not.toContain("every release PR");
  });

  it("given only api released, when the release opens, then its PR and commit keep api's own title", async () => {
    const { context, host, prompter } = setUp();
    prompter.answer(true);

    await openReleasePr(context, await prepareRelease(context, new Set(["api"])));

    expect(host.received).toEqual([
      expect.objectContaining({ type: "pr", title: "chore(api): release v0.0.2" }),
    ]);
  });

  it("given admin left out, when the release PR is opened, then admin's changeset stays pending for a later release", async () => {
    const { context, versioning, prompter } = setUp();
    prompter.answer(true);

    const prepared = await prepareRelease(context, new Set(["api"]));
    await openReleasePr(context, prepared);

    expect(prepared.bumps.map(({ app }) => app)).toEqual(["api"]);
    expect(prepared.held).toEqual(["admin"]);
    expect(versioning.applied[0]?.held.map(({ id }) => id)).toEqual(["admin-history"]);
  });

  it("given a branch that is not main, when the release PR would open, then nothing is written and it says to switch to main", async () => {
    const { context, source, versioning, output } = setUp();
    source.seed({ position: { branch: "feat/x", head: "b1", originMain: "m1" } });

    const pr = await openReleasePr(context, await prepareRelease(context, new Set(["api"])));

    expect(pr).toBeNull();
    expect(versioning.applied).toEqual([]);
    expect(output.text).toContain("git switch main");
  });

  it("given uncommitted changes, when the release PR would open, then nothing is written", async () => {
    const { context, source, versioning } = setUp();
    source.seed({ clean: false });

    const pr = await openReleasePr(context, await prepareRelease(context, new Set(["api"])));

    expect(pr).toBeNull();
    expect(versioning.applied).toEqual([]);
  });

  it("given the person says no, when asked to release, then nothing is written", async () => {
    const { context, source, versioning, prompter } = setUp();
    prompter.answer(false);

    await openReleasePr(context, await prepareRelease(context, new Set(["api"])));

    expect(versioning.applied).toEqual([]);
    expect(source.received).toEqual([]);
  });

  it("given changesets to release, when it asks to release them to preview, then Yes is preselected", async () => {
    const { context, prompter } = setUp();
    prompter.answer(false);

    await openReleasePr(context, await prepareRelease(context, new Set(["api"])));

    expect(prompter.initials["Release these to preview?"]).toBe(true);
  });
});

const DROPPED = new CommandFailed(
  "git push exited with 128: Connection to github.com closed by remote host.",
  "Connection to github.com closed by remote host.\nfatal: the remote end hung up unexpectedly",
);

const openFailing = async (failing: (world: ReturnType<typeof setUp>) => void) => {
  const world = setUp();
  failing(world);
  world.prompter.answer(true);
  const prs = await openReleasePr(
    world.context,
    await prepareRelease(world.context, new Set(["api", "admin"])),
  );
  return { ...world, prs };
};

const ofType = <Type extends string>(events: { type: string }[], type: Type) =>
  events.filter((event) => event.type === type);

describe("a release that fails part way", () => {
  it("given the branch cannot be pushed, when the release opens, then the branch is deleted and it stands on a clean main", async () => {
    const { source, host, prs } = await openFailing(({ source }) =>
      source.failAt("push", 1, DROPPED),
    );

    expect(prs).toBeNull();
    expect(ofType(host.received, "pr")).toEqual([]);
    expect(ofType(source.received, "delete-remote")).toEqual([]);
    expect(ofType(source.received, "delete-branch")).toEqual([
      { type: "delete-branch", name: expect.stringMatching(/^shiplane\/release-.+\d{4}$/) },
    ]);
    expect((await source.position()).branch).toBe("main");
    expect(await source.changedFiles()).toEqual([]);
  });

  it("given a push that fails, when the release stops, then it shows everything git said about why", async () => {
    const { output } = await openFailing(({ source }) => source.failAt("push", 1, DROPPED));

    expect(output.text).toContain("fatal: the remote end hung up unexpectedly");
    expect(output.text).toContain("Cancelled");
  });

  it("given a failure before anything was written, when the release stops, then there is nothing to cancel", async () => {
    const { source, output } = await openFailing(({ source }) =>
      source.failAt("branch", 1, new Error("a branch with that name exists")),
    );

    expect(ofType(source.received, "delete-branch")).toEqual([]);
    expect(output.text).not.toContain("Cancelled");
  });

  it("given the PR is open and going back to main fails, when the release stops, then the PR is closed and the pushed branch deleted", async () => {
    const { source, host } = await openFailing(({ source }) =>
      source.failAt("switch", 1, new Error("a file is in the way")),
    );

    expect(ofType(host.received, "close")).toEqual([
      expect.objectContaining({ pr: expect.objectContaining({ number: 1800 }) }),
    ]);
    expect(ofType(source.received, "delete-remote")).toHaveLength(1);
  });

  it("given closing the PR fails while cancelling, when the release stops, then the rest is still taken back and it says what is left to do by hand", async () => {
    const { source, host, output } = await openFailing(({ source, host }) => {
      source.failAt("switch", 1, new Error("a file is in the way"));
      host.failClose(new Error("gh pr close exited with 1: HTTP 502"));
    });

    expect(ofType(source.received, "delete-branch")).toHaveLength(1);
    expect(ofType(host.received, "close")).toEqual([]);
    expect(output.text).toContain("HTTP 502");
    expect(output.text).toContain("gh pr close 1800");
  });
});

describe("the summary before a release", () => {
  it("given a unit named longer than the column, when the summary prints, then its version still stands apart", async () => {
    const world = testContext({
      units: [testUnit("vite-workspace-resolver", { version: "0.1.0" })],
    });
    world.versioning.seed({
      pending: [],
      plan: planFrom([], { "@acme/vite-workspace-resolver": "0.1.0" }),
    });

    world.prompter.answer(false);

    await openReleasePr(world.context, await prepareRelease(world.context, new Set()));

    expect(world.output.text).toMatch(/vite-workspace-resolver +0\.1\.0/);
  });
});

describe("the release commit's hooks", () => {
  const NAMES = [
    "customer-billing-gateway",
    "partner-onboarding-portal",
    "warehouse-inventory-sync",
    "support-ticket-dashboard",
  ];

  const setUpMany = () => {
    const units = NAMES.map((name) => testUnit(name, { version: "1.0.0" }));
    // One changeset naming all four: they must share one release PR.
    const changesets: PlannedChangeset[] = [
      {
        id: "shared-change",
        summary: "Every app does more.",
        releases: NAMES.map((name) => ({ name: `@acme/${name}`, type: "minor" as const })),
      },
    ];
    const world = testContext({ units });
    world.versioning.seed({
      pending: changesets.map(({ id, summary, releases }) => ({
        id,
        text: changesetText(
          Object.fromEntries(releases.map(({ name, type }) => [name, type])),
          summary,
        ),
      })),
      plan: planFrom(
        changesets,
        Object.fromEntries(NAMES.map((name) => [`@acme/${name}`, "1.0.0"])),
      ),
    });
    return world;
  };

  it("given four apps one changeset ties together, when their names overflow one header, then their one PR names them all and its commit skips the hooks", async () => {
    const { context, host, source, prompter } = setUpMany();
    prompter.answer(true);

    await openReleasePr(context, await prepareRelease(context, new Set(NAMES)));

    const title =
      "chore(release): customer-billing-gateway v1.1.0, partner-onboarding-portal v1.1.0, warehouse-inventory-sync v1.1.0 and support-ticket-dashboard v1.1.0";
    expect(host.received).toEqual([expect.objectContaining({ type: "pr", title })]);
    expect(source.received.filter(({ type }) => type === "commit")).toEqual([
      expect.objectContaining({ title, skipHooks: true }),
    ]);
  });

  it("given a title that fits, when the release opens, then its commit runs the hooks", async () => {
    const { context, source, prompter } = setUp();
    prompter.answer(true);

    await openReleasePr(context, await prepareRelease(context, new Set(["api", "admin"])));

    expect(source.received.find(({ type }) => type === "commit")).not.toHaveProperty("skipHooks");
  });
});
