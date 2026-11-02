import { describe, expect, it } from "vitest";

import type { PlannedChangeset } from "../../domain/changes";
import type { Approval } from "../../domain/releasePr";
import { planFrom } from "../../testing/plans";
import { changesetText, testContext, testUnit } from "../../testing/releaseContext";
import { releaseToPreview } from "../releaseToPreview";

const RATE_LIMIT: PlannedChangeset = {
  id: "rate-limit",
  summary: "Rate limit per key.",
  releases: [{ name: "@acme/api", type: "minor" }],
};

const PR_12 = { number: 12, url: "https://github.com/acme/repo/pull/12", head: "pr12" };
const OPEN_12 = { branch: "shiplane/release-2026-10-11-0900", pr: PR_12 };

/** One app, api 0.0.1, with a changeset pending and a person who picks it. */
const setUp = ({
  approval,
  interactive = true,
  yes = false,
}: { approval?: Approval; interactive?: boolean; yes?: boolean } = {}) => {
  const world = testContext({
    units: [testUnit("api", { version: "0.0.1" })],
    approval,
    interactive,
    yes,
  });
  world.versioning.seed({
    pending: [
      { id: RATE_LIMIT.id, text: changesetText({ "@acme/api": "minor" }, RATE_LIMIT.summary) },
    ],
    plan: planFrom([RATE_LIMIT], { "@acme/api": "0.0.1" }),
  });
  world.source.seed({ tags: { "api@0.0.1": "t0" } });
  world.host.seed({ releasedTags: ["api@0.0.1"] });
  world.prompter.answer(["api"]);
  return world;
};

const opened = (world: ReturnType<typeof setUp>) =>
  world.host.received.filter(({ type }) => type === "pr");

describe("Feature: waiting for a release PR", () => {
  describe("Scenario: approval required, run from CI", () => {
    it("given #12 open and no terminal, when shiplane runs, then it leaves #12 for later with exit 0, never merging it", async () => {
      // given
      const world = setUp({ approval: "required", interactive: false, yes: true });
      world.host.seed({ openPrs: [OPEN_12] });

      // when
      const ok = await releaseToPreview(world.context);

      // then
      expect(ok).toBe(true);
      expect(world.output.text).toContain(PR_12.url);
      expect(world.output.text).toContain("Left #12 waiting. Run shiplane once it's approved.");
      expect(world.host.received.some(({ type }) => type === "merge")).toBe(false);
    });
  });

  describe("Scenario: approval required, in a terminal", () => {
    it("given #12 open, when shiplane waits, then it says leaving is safe and offers no merge key, even when m is pressed", async () => {
      // given
      const world = setUp({ approval: "required" });
      world.host.seed({ openPrs: [OPEN_12], prStates: { 12: ["OPEN", "OPEN", "MERGED"] } });
      world.prompter.press("m");

      // when
      await releaseToPreview(world.context);

      // then
      expect(world.output.text).toContain("Waiting for approval on #12");
      expect(world.output.text).toContain("It's safe to leave: run shiplane later");
      expect(world.output.lines).toContain(
        "    d see the diff   o open it on GitHub   Ctrl-C leave, continue later",
      );
      expect(world.host.received.some(({ type }) => type === "merge")).toBe(false);
    });
  });

  describe("Scenario: solo, no approval key", () => {
    it("given #12 open, when the person presses m, then it merges from the terminal as before, with the same hint line", async () => {
      // given
      const world = setUp();
      world.host.seed({ openPrs: [OPEN_12] });
      world.prompter.press("m").answer("--squash");

      // when
      await releaseToPreview(world.context);

      // then
      expect(world.output.lines).toContain(
        "    d see the diff   m merge it from here   o open it on GitHub   Ctrl-C leave, continue later",
      );
      expect(world.host.received).toContainEqual({ type: "merge", pr: PR_12, method: "--squash" });
    });
  });
});

describe("Feature: coming back to a release", () => {
  describe("Scenario: still open, main unchanged", () => {
    it("given someone left #12 waiting, when shiplane runs again, then it picks up #12 and opens no second PR", async () => {
      // given
      const world = setUp({ approval: "required", interactive: false, yes: true });
      world.host.seed({ openPrs: [OPEN_12] });

      // when
      const ok = await releaseToPreview(world.context);

      // then
      expect(ok).toBe(true);
      expect(world.output.text).toContain("↻ Picking up release #12: still waiting for approval");
      expect(world.output.text).toContain("To cancel it, close it on GitHub.");
      expect(opened(world)).toEqual([]);
    });
  });

  describe("Scenario: the reviewer merged it", () => {
    it("given #12 merged while nobody watched, when shiplane runs again, then it says what is left, tags and ships once", async () => {
      // given
      const world = setUp({ approval: "required" });
      world.source.seed({
        versionCommits: {
          "apps/api@0.1.0": { sha: "r2", subject: "chore(api): release v0.1.0 (#12)" },
        },
      });
      const merged = testUnit("api", { version: "0.1.0" });
      world.context.release = { ...world.context.release, units: [merged] };
      world.context.load = () => Promise.resolve(world.context.release);
      world.prompter.answer(true);

      // when
      await releaseToPreview(world.context);

      // then
      expect(world.output.text).toContain("↻ Picking up a merged release");
      expect(world.output.text).toContain("Left to do: tag 1 version → ship to preview");
      const tags = world.source.received.filter(({ type }) => type === "tag");
      expect(tags).toEqual([expect.objectContaining({ name: "api@0.1.0", sha: "r2" })]);
      expect(opened(world)).toEqual([]);
    });
  });

  describe("Scenario: cancelled on GitHub", () => {
    it("given #12 closed while waiting, when the wait ends, then it says nothing shipped with exit 0, and the next run opens a fresh PR", async () => {
      // given
      const world = setUp({ approval: "required" });
      world.host.seed({ openPrs: [OPEN_12], prStates: { 12: ["OPEN", "CLOSED"] } });

      // when
      const ok = await releaseToPreview(world.context);

      // then
      expect(ok).toBe(true);
      expect(world.output.text).toContain("○ Release #12 was closed: nothing shipped.");
      expect(world.output.text).toContain("Run shiplane to open a new release");

      // and when shiplane runs again
      world.host.seed({ openPrs: [], prStates: { 1800: ["OPEN", "MERGED"] } });
      world.prompter.answer(["api"], true);
      await releaseToPreview(world.context);

      // then
      expect(opened(world)).toHaveLength(1);
    });
  });
});

describe("Feature: main moved while the release PR waited", () => {
  const MOVED = {
    commits: {
      "pr12..head": [
        { subject: "feat(api): rate limit per key (#41)", files: [] },
        { subject: "fix(web): empty state on search (#43)", files: [] },
        { subject: "chore: bump eslint (#44)", files: [] },
      ],
    },
  };

  describe("Scenario: the stale PR is replaced", () => {
    it("given 3 commits on main after #12, when shiplane runs, then a new PR replaces #12 and #12 closes with the reason, the commits and a link", async () => {
      // given
      const world = setUp({ approval: "required", interactive: false, yes: true });
      world.host.seed({ openPrs: [OPEN_12] });
      world.source.seed(MOVED);

      // when
      const ok = await releaseToPreview(world.context);

      // then
      expect(ok).toBe(true);
      const [replacement] = opened(world);
      expect(replacement).toMatchObject({
        body: expect.stringMatching(/^Replaces #12, which went out of date when main moved\./),
      });
      const types = world.host.received.map(({ type }) => type);
      expect(types.indexOf("pr")).toBeLessThan(types.indexOf("close"));
      const close = world.host.received.find(({ type }) => type === "close");
      expect(close).toMatchObject({ pr: PR_12 });
      const comment = close && "comment" in close ? close.comment : "";
      expect(comment).toContain("3 commits were merged into main after this release PR was opened");
      expect(comment).toContain("Replaced by #1800");
      expect(comment).toContain("- feat(api): rate limit per key (#41)");
      expect(world.output.text).toContain(
        "↻ Release #12 is out of date: 3 commits landed on main since.",
      );
    });
  });

  describe("Scenario: the replacement fails to open", () => {
    it("given 3 commits on main after #12 and GitHub refusing new PRs, when shiplane runs, then #12 stays open with no comment and the run fails", async () => {
      // given
      const world = setUp({ approval: "required", interactive: false, yes: true });
      world.host.seed({ openPrs: [OPEN_12] });
      world.source.seed(MOVED);
      world.host.failCreate(new Error("GitHub is down"));

      // when
      const ok = await releaseToPreview(world.context);

      // then
      expect(ok).toBe(false);
      expect(world.host.received.some(({ type }) => type === "close")).toBe(false);
      expect(await world.host.openPrsFrom("shiplane/release-")).toContainEqual(PR_12);
    });
  });
});
