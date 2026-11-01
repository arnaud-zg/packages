import { describe, expect, it } from "vitest";

import type { StatusPlan } from "../../domain/changes";
import { changesetText, testContext, testUnit } from "../../testing/releaseContext";
import { openReleasePr } from "../openReleasePr";
import { prepareRelease } from "../prepareRelease";
import { pickPromotion } from "../promote";

describe("a preview release that takes apps along", () => {
  const setUp = () => {
    const world = testContext({
      units: [
        testUnit("expo", { version: "0.2.1" }),
        testUnit("api", { version: "0.0.7" }),
        testUnit("admin", { version: "0.1.4" }),
      ],
    });
    const plan: StatusPlan = {
      changesets: [
        {
          id: "inbox-copy",
          summary: "the mascot's inbox says when a result is new.",
          releases: [
            { name: "@acme/expo", type: "patch" },
            { name: "@acme/assets", type: "patch" },
          ],
        },
      ],
      releases: [
        {
          name: "@acme/expo",
          type: "patch",
          oldVersion: "0.2.1",
          newVersion: "0.2.2",
          changesets: ["inbox-copy"],
        },
        {
          name: "@acme/assets",
          type: "patch",
          oldVersion: "0.1.0",
          newVersion: "0.1.1",
          changesets: ["inbox-copy"],
        },
        {
          name: "@acme/api",
          type: "patch",
          oldVersion: "0.0.7",
          newVersion: "0.0.8",
          changesets: [],
        },
      ],
    };
    world.versioning.seed({
      pending: [
        {
          id: "inbox-copy",
          text: changesetText(
            { "@acme/expo": "patch", "@acme/assets": "patch" },
            "the mascot's inbox says when a result is new.",
          ),
        },
      ],
      plan: () => plan,
      dependencies: { "@acme/expo": ["@acme/assets"], "@acme/api": ["@acme/assets"] },
    });
    return world;
  };

  it("given only expo picked and its changes move a package api uses, when the release is summed up, then api is said to ship too, with the package and whose change moves it", async () => {
    const { context, output, prompter } = setUp();
    prompter.answer(false);

    const prepared = await prepareRelease(context, new Set(["expo"]));
    await openReleasePr(context, prepared);

    expect(prepared.companions.map(({ app }) => app)).toEqual(["api"]);
    expect(output.text).toContain("api is not picked but ships too");
    expect(output.text).toContain("uses @acme/assets, which expo's changes move");
  });
});

describe("promoting to production what preview ran together", () => {
  const changelog = (name: string, version: string, ...lines: string[]) =>
    `# @acme/${name}\n\n## ${version}\n\n### Patch Changes\n\n${lines.join("\n")}\n`;

  const setUp = () => {
    const world = testContext({
      units: [
        testUnit("expo", { version: "0.3.0" }),
        testUnit("api", { version: "0.0.8" }),
        testUnit("landing", { version: "0.1.3" }),
      ],
    });
    world.source.seed({
      tags: { "expo@0.3.0": "e3", "api@0.0.8": "a8", "landing@0.1.3": "l3" },
      files: {
        "expo@0.3.0:apps/expo/CHANGELOG.md": changelog(
          "expo",
          "0.3.0",
          "- 03acc29: An identification you left running is pushed to your phone when it ends.",
        ),
        "api@0.0.8:apps/api/CHANGELOG.md": changelog(
          "api",
          "0.0.8",
          "- 03acc29: An identification you left running is pushed to your phone when it ends.",
        ),
        "landing@0.1.3:apps/landing/CHANGELOG.md": changelog(
          "landing",
          "0.1.3",
          "- 5b6c7d8: Search results show the store links.",
        ),
      },
    });
    world.host.seed({
      deployments: ["expo@0.3.0", "api@0.0.8", "landing@0.1.3"].map((tag) => ({
        title: `Deploy ${tag} to preview`,
        state: "done" as const,
      })),
    });
    return world;
  };

  it("given expo picked alone and api went to preview with it, when promoting, then api is offered first-ticked with the change they share and goes when accepted", async () => {
    const { context, output, prompter } = setUp();
    prompter.answer(["expo"], true);

    const scope = await pickPromotion(context);

    expect(prompter.asked[1]).toBe("Promote api 0.0.8 too? Preview has only run it with expo.");
    expect(prompter.initials[prompter.asked[1] ?? ""]).toBe(true);
    expect(output.text).toContain(
      "went to preview with expo 0.3.0 for: An identification you left running is pushed to your phone when it ends.",
    );
    expect(output.text).not.toContain("landing  ");
    expect(scope && [...scope]).toEqual(["expo", "api"]);
  });

  it("given the person keeps api on preview, when promoting, then only expo goes and the release says what production runs it next to", async () => {
    const { context, output, prompter } = setUp();
    prompter.answer(["expo"], false);

    const scope = await pickPromotion(context);

    expect(scope && [...scope]).toEqual(["expo"]);
    expect(output.text).toContain(
      "api stays on preview: production runs expo 0.3.0 next to the api it has.",
    );
  });
});
