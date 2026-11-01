import { describe, expect, it } from "vitest";

import type { PlannedChangeset } from "../../domain/changes";
import { planFrom } from "../../testing/plans";
import { changesetText, testContext, testUnit } from "../../testing/releaseContext";
import { releaseToPreview } from "../releaseToPreview";
import { runSteps } from "../steps";

const PLANT: PlannedChangeset = {
  id: "plant-not-in-catalog",
  summary: "A plant not in the catalog yet never blocks its page.",
  releases: [{ name: "@acme/api", type: "patch" }],
};

describe("showing where the release is", () => {
  it("given two steps, when they run, then each is shown as working with its place in the run", async () => {
    const { context, progress } = testContext({ units: [] });

    await runSteps(context, [
      { label: "push main", run: () => Promise.resolve() },
      { label: "open the pull request", run: () => Promise.resolve() },
    ]);

    expect(progress.events).toEqual([
      { kind: "during", mood: "working", text: "push main", step: { index: 0, total: 2 } },
      {
        kind: "during",
        mood: "working",
        text: "open the pull request",
        step: { index: 1, total: 2 },
      },
    ]);
  });

  it("given a step that throws, when it runs, then the mascot is worried and says what failed", async () => {
    const { context, progress, output } = testContext({ units: [] });

    const done = await runSteps(context, [
      { label: "push main", run: () => Promise.reject(new Error("rejected by origin")) },
    ]);

    expect(done).toBe(false);
    expect(progress.events.at(-1)).toEqual(
      expect.objectContaining({ kind: "say", mood: "worried" }),
    );
    expect(output.text).toContain("push main failed: rejected by origin");
  });

  it("given a changeset for api, when the release runs up to its summary, then the journey shows each stage it reached and what it read", async () => {
    const { context, progress, prompter, versioning } = testContext({
      units: [testUnit("api", { version: "0.0.1" })],
    });
    versioning.seed({
      pending: [{ id: PLANT.id, text: changesetText({ "@acme/api": "patch" }, PLANT.summary) }],
      plan: planFrom([PLANT], { "@acme/api": "0.0.1" }),
    });
    prompter.answer(["api"], false);

    await releaseToPreview(context);

    expect(progress.events.filter(({ kind }) => kind === "stage").map(({ text }) => text)).toEqual([
      "What to release",
      "Versions",
      "Release PR",
    ]);
    expect(
      progress.events.filter(({ kind, mood }) => kind === "during" && mood === "thinking").length,
    ).toBeGreaterThan(0);
  });

  it("given nothing to release, when the release runs, then the mascot rests and says so", async () => {
    const { context, progress, source, host } = testContext({
      units: [testUnit("api", { version: "0.0.1" })],
    });
    source.seed({ tags: { "api@0.0.1": "t0" } });
    host.seed({ deployments: [{ title: "Deploy api@0.0.1 to preview", state: "done" }] });

    await releaseToPreview(context);

    expect(progress.events.at(-1)).toEqual(
      expect.objectContaining({ kind: "say", mood: "resting" }),
    );
  });
});
