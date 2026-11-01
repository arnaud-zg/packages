import type { HostEvent } from "shiplane/testing";
import { backendService } from "shiplane/plugin";
import { planShips, serverHostingFake, shipTo, testContext, testUnit } from "shiplane/testing";
import { describe, expect, it } from "vitest";

import { releaseComments } from "../release-comments.feature";

const REPO = "acme/app";

const EXPO = testUnit("expo", {
  version: "0.4.2",
  module: "backend-service",
  options: { service: "expo" },
});

const ticket = (text: string) => `<!-- Ticket: ${text} -->\n\n## What & why\n\nSomething.`;

const setUp = (options: { apps?: string[] } = {}) => {
  const world = testContext({
    units: [EXPO],
    modules: [backendService({ serverHosting: serverHostingFake() })],
    features: ({ codeHost, sourceControl }) => [
      releaseComments({ codeHost, sourceControl, ...options }),
    ],
  });
  world.source.seed({
    tags: { "expo@0.4.0": "t40", "expo@0.4.1": "t41", "expo@0.4.2": "t42", "api@0.0.10": "a10" },
    commits: {
      "expo@0.4.1..expo@0.4.2": [
        {
          subject: "chore(expo): release v0.4.2 (#1920)",
          files: ["apps/expo/package.json", "apps/expo/CHANGELOG.md"],
        },
        { subject: "feat(api): plants load faster (#1914)", files: ["apps/api/src/plants.ts"] },
        { subject: "docs(app): a written rule (#1905)", files: ["docs/live-reads.md"] },
        {
          subject: "fix(release): mobile deploy runs name the version they ship (#1913)",
          files: ["apps/expo/eas.json"],
        },
        {
          subject: "fix(build): iOS preview builds bundle without running out of memory (#1912)",
          files: ["packages/app/src/index.ts"],
        },
        { subject: "fix(app): a typo in the yard (#1915)", files: ["packages/app/src/yard.ts"] },
      ],
    },
  });
  world.versioning.seed({
    dependencies: { "@acme/expo": ["@acme/app"] },
    folders: { "@acme/expo": "apps/expo", "@acme/app": "packages/app", "@acme/api": "apps/api" },
  });
  world.host.seed({
    pullRequests: {
      1912: {
        repository: REPO,
        number: 1912,
        body: ticket(`${REPO}#1549 (reference only, no "Closes #").`),
        closes: [],
      },
      1913: {
        repository: REPO,
        number: 1913,
        body: ticket("none (reference only). Stacked on #1912."),
        closes: [
          { repository: REPO, number: 1549 },
          { repository: REPO, number: 1550 },
        ],
      },
      1914: { repository: REPO, number: 1914, body: ticket("#1600"), closes: [] },
      1915: { repository: REPO, number: 1915, body: ticket("none"), closes: [] },
      1905: { repository: REPO, number: 1905, body: ticket("#1601"), closes: [] },
    },
  });
  return world;
};

const posted = (events: readonly HostEvent[]) =>
  events.flatMap((event) => (event.type === "comment" ? [event] : []));

const PRS = new Set([`${REPO}#1912`, `${REPO}#1913`, `${REPO}#1915`]);
const onIssues = (events: readonly HostEvent[]) =>
  posted(events).filter(({ issue }) => !PRS.has(issue));
const onPrs = (events: readonly HostEvent[]) =>
  posted(events).filter(({ issue }) => PRS.has(issue));

describe("telling PRs and issues a release shipped them", () => {
  it("given a version's merged PRs, when it ships to preview, then each PR gets one comment naming the environment, the version and its issues", async () => {
    const { context, host, prompter } = setUp();
    prompter.answer(true);

    await shipTo(context, "preview", {});

    expect(onPrs(host.received)).toEqual([
      {
        type: "comment",
        issue: `${REPO}#1912`,
        body: "🚀 Released to **preview** in version **0.4.2** (expo, issue #1549).\n\n<!-- shiplane-release: expo@0.4.2 preview -->",
      },
      {
        type: "comment",
        issue: `${REPO}#1913`,
        body: "🚀 Released to **preview** in version **0.4.2** (expo, issues #1549, #1550).\n\n<!-- shiplane-release: expo@0.4.2 preview -->",
      },
      {
        type: "comment",
        issue: `${REPO}#1915`,
        body: "🚀 Released to **preview** in version **0.4.2** (expo).\n\n<!-- shiplane-release: expo@0.4.2 preview -->",
      },
    ]);
  });

  it("given a version whose merged PRs relate to issues, when it ships to preview, then each issue gets one comment naming the environment, the version and its PRs", async () => {
    const { context, host, prompter } = setUp();
    prompter.answer(true);

    expect(await shipTo(context, "preview", {})).toBe(true);

    expect(onIssues(host.received)).toEqual([
      {
        type: "comment",
        issue: `${REPO}#1549`,
        body: "🚀 Released to **preview** in version **0.4.2** (expo, PR #1912, #1913).\n\n<!-- shiplane-release: expo@0.4.2 preview -->",
      },
      {
        type: "comment",
        issue: `${REPO}#1550`,
        body: "🚀 Released to **preview** in version **0.4.2** (expo, PR #1913).\n\n<!-- shiplane-release: expo@0.4.2 preview -->",
      },
    ]);
  });

  it("given PRs that reach another app, only touch docs, or are the release PR itself, when the version ships, then their issues are left alone", async () => {
    const { context, host, prompter } = setUp();
    prompter.answer(true);

    await shipTo(context, "preview", {});

    const issues = posted(host.received).map(({ issue }) => issue);
    expect(issues).not.toContain(`${REPO}#1600`);
    expect(issues).not.toContain(`${REPO}#1601`);
  });

  it("given a version with many merged PRs and issues, when it ships, then GitHub is read twice, whatever their number", async () => {
    const { context, host, prompter } = setUp();
    prompter.answer(true);

    await shipTo(context, "preview", {});

    expect(host.reads).toEqual(["pull-requests", "comments"]);
  });

  it("given the same ship run twice, when it ships again, then no PR or issue is commented twice", async () => {
    const { context, host, prompter } = setUp();
    prompter.answer(true, true);

    await shipTo(context, "preview", {});
    await shipTo(context, "preview", {});

    expect(posted(host.received)).toHaveLength(5);
  });

  it("given issues already told about preview, when the version is promoted to production, then they hear about production", async () => {
    const { context, host, prompter } = setUp();
    host.seed({
      deployments: [{ title: "Deploy expo@0.4.2 to preview", state: "done" }],
      comments: {
        [`${REPO}#1912`]: ["<!-- shiplane-release: expo@0.4.2 preview -->"],
        [`${REPO}#1549`]: ["<!-- shiplane-release: expo@0.4.2 preview -->"],
        [`${REPO}#1550`]: ["<!-- shiplane-release: expo@0.4.2 preview -->"],
      },
    });
    prompter.answer("production", true);

    await shipTo(context, "production", {});

    expect(posted(host.received).map(({ body }) => body.split("\n")[0])).toEqual([
      "🚀 Released to **production** in version **0.4.2** (expo, issue #1549).",
      "🚀 Released to **production** in version **0.4.2** (expo, issues #1549, #1550).",
      "🚀 Released to **production** in version **0.4.2** (expo).",
      "🚀 Released to **production** in version **0.4.2** (expo, PR #1912, #1913).",
      "🚀 Released to **production** in version **0.4.2** (expo, PR #1913).",
    ]);
  });

  it("given GitHub refuses the comment, when the version ships, then the release still succeeds and says which comment failed", async () => {
    const { context, host, prompter, output } = setUp();
    host.failComment(new Error("gh issue comment exited with 1: HTTP 403"));
    prompter.answer(true);

    expect(await shipTo(context, "preview", {})).toBe(true);

    expect(output.text).toContain(`comment on ${REPO}#1549: expo@0.4.2 on preview`);
    expect(output.text).toContain("HTTP 403");
  });

  it("given a PR GitHub cannot read, when the version ships, then the release still succeeds and says the hook could not read", async () => {
    const { context, host, prompter, output } = setUp();
    host.seed({ pullRequests: {} });
    prompter.answer(true);

    expect(await shipTo(context, "preview", {})).toBe(true);

    expect(posted(host.received)).toEqual([]);
    expect(output.text).toContain("release-comments  could not read: no pull request #1912");
  });

  it("given a unit left out of the plugin's units, when it ships, then its issues hear nothing", async () => {
    const { context, host, prompter } = setUp({ apps: ["api"] });
    prompter.answer(true);

    await shipTo(context, "preview", {});

    expect(posted(host.received)).toEqual([]);
  });

  it("given a unit's first release, when it ships, then nothing is commented", async () => {
    const { context, host, source, prompter } = setUp();
    source.seed({ tags: { "expo@0.4.2": "t42" } });
    prompter.answer(true);

    await shipTo(context, "preview", {});

    expect(posted(host.received)).toEqual([]);
  });

  it("given a plan, when it runs, then it lists the comments a ship would post and posts none", async () => {
    const { context, host, output } = setUp();

    await planShips(context, "preview");

    expect(output.text).toContain(`comment on ${REPO}#1912: expo@0.4.2 on preview`);
    expect(output.text).toContain(`comment on ${REPO}#1549: expo@0.4.2 on preview`);
    expect(output.text).toContain(`comment on ${REPO}#1550: expo@0.4.2 on preview`);
    expect(host.received).toEqual([]);
  });
});
