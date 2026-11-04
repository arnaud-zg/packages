import { describe, expect, it } from "vitest";

import type { PlannedChangeset } from "../../domain/changes";
import type { ReleaseModule } from "../../modules/module";
import { internalTool } from "../../modules/internal-tool/internal-tool.module";
import { planFrom } from "../../testing/plans";
import { changesetText, testContext, testUnit } from "../../testing/releaseContext";
import { openReleasePr } from "../openReleasePr";
import { prepareRelease } from "../prepareRelease";

const VERSION = "Release these to preview as (Esc cancels)";
const WHY_MAJOR = "Why 1.0.0? Tell users what changed, in one line.";
const WHY_PATCH = "Why 0.4.1? Tell users what changed, in one line.";

const RATE_LIMIT: PlannedChangeset = {
  id: "rate-limit",
  summary: "Rate limits every route.",
  releases: [{ name: "@acme/api", type: "minor" }],
};

const SITE_FIX: PlannedChangeset = {
  id: "site-fix",
  summary: "Fixes the footer.",
  releases: [{ name: "@acme/site", type: "patch" }],
};

const pendingOf = (changesets: PlannedChangeset[]) =>
  changesets.map(({ id, summary, releases }) => ({
    id,
    text: changesetText(
      Object.fromEntries(releases.map(({ name, type }) => [name, type])),
      summary,
    ),
  }));

const setUp = ({
  site = "0.1.0",
  ...options
}: {
  site?: string;
  yes?: boolean;
  interactive?: boolean;
} = {}) => {
  const changesets = [RATE_LIMIT, SITE_FIX];
  const world = testContext({
    units: [testUnit("api", { version: "0.4.0" }), testUnit("site", { version: site })],
    ...options,
  });
  world.versioning.seed({
    pending: pendingOf(changesets),
    plan: planFrom(changesets, { "@acme/api": "0.4.0", "@acme/site": site }),
  });
  world.source.seed({ changed: ["apps/api/package.json", "apps/api/CHANGELOG.md"] });
  return world;
};

const release = async (world: ReturnType<typeof setUp>, scope = ["api"]) =>
  openReleasePr(world.context, await prepareRelease(world.context, new Set(scope)));

const titles = ({ host }: ReturnType<typeof setUp>) =>
  host.received.flatMap((event) => (event.type === "pr" ? [event.title] : []));

const bodies = ({ host }: ReturnType<typeof setUp>) =>
  host.received.flatMap((event) => (event.type === "pr" ? [event.body] : []));

describe("seeing the computed version", () => {
  it("given one version moving, when the release is offered, then each level shows its version and the computed one is preselected", async () => {
    const world = setUp();
    world.prompter.answer(null);

    await release(world);

    expect(world.prompter.choices[VERSION]?.map(({ label }) => label)).toEqual([
      "1.0.0  major",
      "0.5.0  minor, computed",
      "0.4.1  patch",
    ]);
    expect(world.prompter.initials[VERSION]).toBe("minor");
  });

  it("given the computed version kept, when the release opens, then no reason is asked and nothing is forced", async () => {
    const world = setUp();
    world.prompter.answer("minor");

    await release(world);

    expect(world.prompter.asked).toEqual([VERSION]);
    expect(world.versioning.applied[0]).toMatchObject({ added: [], ceiling: undefined });
    expect(titles(world)).toEqual(["chore(api): release v0.5.0"]);
  });

  it("given the person cancels, when the release is offered, then nothing is written", async () => {
    const world = setUp();
    world.prompter.answer(null);

    await release(world);

    expect(world.versioning.applied).toEqual([]);
    expect(world.source.received).toEqual([]);
    expect(world.output.text).toContain("Nothing ran.");
  });
});

describe("forcing another version", () => {
  it("given a bigger version and a reason, when the release opens, then it ships at that version with why in its notes", async () => {
    const world = setUp();
    world.prompter.answer("major", "Drops subjectsSince from SourceControlPort");

    await release(world);

    expect(world.prompter.asked).toEqual([VERSION, WHY_MAJOR]);
    expect(titles(world)).toEqual(["chore(api): release v1.0.0"]);
    expect(bodies(world)[0]).toContain(
      "Version forced to 1.0.0 instead of 0.5.0: Drops subjectsSince from SourceControlPort",
    );
    expect(world.versioning.applied[0]).toMatchObject({
      ceiling: "major",
      added: [expect.objectContaining({ releases: [{ name: "@acme/api", type: "major" }] })],
    });
    expect(world.output.text).toContain(
      "! 1.0.0 instead of 0.5.0: Drops subjectsSince from SourceControlPort",
    );
  });

  it("given a smaller version and a reason, when the release opens, then the changeset's own bump gives way", async () => {
    const world = setUp();
    world.prompter.answer("patch", "Docs and wording only");

    await release(world);

    expect(world.prompter.asked).toEqual([VERSION, WHY_PATCH]);
    expect(titles(world)).toEqual(["chore(api): release v0.4.1"]);
    expect(world.versioning.applied[0]?.ceiling).toBe("patch");
    expect(world.output.text).toContain("! 0.4.1 instead of 0.5.0: Docs and wording only");
  });

  it("given a reason with spaces around it, when forced, then the notes keep only the words", async () => {
    const world = setUp();
    world.prompter.answer("patch", "  Docs only  ");

    await release(world);

    expect(bodies(world)[0]).toContain("Version forced to 0.4.1 instead of 0.5.0: Docs only\n");
  });

  it("given an empty reason, when asked why, then it goes back to the versions and forces nothing", async () => {
    const world = setUp();
    world.prompter.answer("major", "   ", "minor");

    await release(world);

    expect(world.prompter.asked).toEqual([VERSION, WHY_MAJOR, VERSION]);
    expect(titles(world)).toEqual(["chore(api): release v0.5.0"]);
  });

  it("given Esc on the reason then on the versions, when asked, then nothing is written", async () => {
    const world = setUp();
    world.prompter.answer("major", null, null);

    await release(world);

    expect(world.prompter.asked).toEqual([VERSION, WHY_MAJOR, VERSION]);
    expect(world.versioning.applied).toEqual([]);
  });

  it("given every unit moving to one version, when forced, then one PR carries the reason for each", async () => {
    const changesets: PlannedChangeset[] = ["api", "site"].map((name) => ({
      id: `${name}-change`,
      summary: `${name} does more.`,
      releases: [{ name: `@acme/${name}`, type: "minor" }],
    }));
    const world = setUp({ site: "0.4.0" });
    world.versioning.seed({
      pending: pendingOf(changesets),
      plan: planFrom(changesets, { "@acme/api": "0.4.0", "@acme/site": "0.4.0" }),
    });
    world.prompter.answer("major", "First stable release");

    await release(world, ["api", "site"]);

    expect(world.host.received.filter(({ type }) => type === "pr")).toHaveLength(1);
    expect(world.versioning.applied[0]?.added[0]?.releases).toEqual([
      { name: "@acme/api", type: "major" },
      { name: "@acme/site", type: "major" },
    ]);
  });

  it("given a unit left out, when forced, then its changeset still waits", async () => {
    const world = setUp();
    world.prompter.answer("major", "Breaks the route names");

    await release(world, ["api"]);

    expect(world.versioning.applied[0]?.held).toEqual([
      expect.objectContaining({ id: "site-fix" }),
    ]);
  });

  it("given versioning that cannot land on the version, when forced, then it says so and writes nothing", async () => {
    const world = setUp();
    const computed = planFrom([RATE_LIMIT, SITE_FIX], { "@acme/api": "0.4.0" });
    world.versioning.seed({ plan: (added, held) => computed(added, held) });
    world.prompter.answer("patch", "Docs only");

    await release(world);

    expect(world.output.text).toContain("✗ Can't force 0.4.1: api would go to 0.5.0.");
    expect(world.versioning.applied).toEqual([]);
    expect(world.source.received).toEqual([]);
  });

  it("given a plugin refusing the forced version, when forced, then its refusal stops the release", async () => {
    const refusing: ReleaseModule = {
      ...internalTool({ name: "refusing" }),
      version: (_context, { bump }) =>
        Promise.resolve({
          added: [],
          writes: [],
          summary: [],
          onMerge: "Ship it",
          ...(bump?.to === "1.0.0"
            ? {
                blocked: {
                  title: "Stores refuse 1.0.0",
                  detail: "bump the build first.",
                  commands: [],
                },
              }
            : {}),
        }),
    };
    const world = testContext({
      units: [testUnit("api", { version: "0.4.0", module: "refusing" })],
      modules: [refusing],
    });
    world.versioning.seed({
      pending: pendingOf([RATE_LIMIT]),
      plan: planFrom([RATE_LIMIT], { "@acme/api": "0.4.0" }),
    });
    world.prompter.answer("major", "Breaks the route names");

    await openReleasePr(world.context, await prepareRelease(world.context, new Set(["api"])));

    expect(world.output.text).toContain("✗ Stores refuse 1.0.0: bump the build first.");
    expect(world.versioning.applied).toEqual([]);
  });
});

describe("when no version is asked", () => {
  it("given units moving apart, when the release is offered, then it asks a plain yes", async () => {
    const world = setUp();
    world.prompter.answer(true);

    await release(world, ["api", "site"]);

    expect(world.prompter.asked).toEqual(["Release these to preview?"]);
    expect(world.prompter.initials["Release these to preview?"]).toBe(true);
    expect(world.versioning.applied[0]?.ceiling).toBeUndefined();
  });

  it("given --yes, when the release opens, then nothing is asked and the computed version ships", async () => {
    const world = setUp({ yes: true });

    await release(world);

    expect(world.prompter.asked).toEqual([]);
    expect(titles(world)).toEqual(["chore(api): release v0.5.0"]);
  });

  it("given no terminal, when the release is offered, then nothing is asked and nothing runs", async () => {
    const world = setUp({ interactive: false });

    await release(world);

    expect(world.prompter.asked).toEqual([]);
    expect(world.versioning.applied).toEqual([]);
    expect(world.output.text).toContain("Not a terminal: pass --yes to run it.");
  });
});
