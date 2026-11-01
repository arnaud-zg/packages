import { describe, expect, it } from "vitest";

import { readUnitFile } from "../../../application/config/readUnitFile";
import { readStatus } from "../../../application/readStatus";
import { shipTo } from "../../../application/ship";
import { testContext, testUnit } from "../../../testing/releaseContext";
import { internalTool } from "../internal-tool.module";

const RELEASE = testUnit("release", { version: "0.3.0", module: "internal-tool" });

const setUp = () => {
  const world = testContext({ units: [RELEASE], modules: [internalTool()] });
  world.source.seed({ tags: { "release@0.3.0": "t1" } });
  return world;
};

describe("an app released but never deployed, like the release CLI", () => {
  it("given its unit file names only its module, when read, then it is an app with no problem", () => {
    const { unit, problems } = readUnitFile(
      "apps/shiplane/shiplane.unit.yml",
      "module: internal-tool\n",
      [internalTool()],
    );

    expect(problems).toEqual([]);
    expect(unit?.module).toBe("internal-tool");
  });

  it("given its unit file names a workflow, when read, then the key is refused since nothing deploys it", () => {
    const { problems } = readUnitFile(
      "apps/shiplane/shiplane.unit.yml",
      "module: internal-tool\nworkflow: deploy-release.yml\n",
      [internalTool()],
    );

    expect(problems.map(({ message }) => message)).toEqual([
      'unknown key "workflow" for internal-tool',
    ]);
  });

  it("given release@0.3.0 tagged, when shipped to preview, then nothing runs, nothing is asked, and it says nothing deploys it", async () => {
    const { context, host, shell, prompter, output } = setUp();

    expect(await shipTo(context, "preview", {})).toBe(true);

    expect(prompter.asked).toEqual([]);
    expect(shell.calls).toEqual([]);
    expect(host.received).toEqual([]);
    expect(output.text).toContain("release@0.3.0  released, nothing deploys it");
  });

  it("given release@0.3.0 tagged with nothing new, when the status is read, then nothing is pending on preview or production", async () => {
    const { context } = setUp();

    const preview = await readStatus(context, "preview");
    const production = await readStatus(context, "production");

    expect([...preview.units, ...production.units]).toEqual([
      expect.objectContaining({
        unit: "release",
        target: "release-only",
        pending: false,
        hint: "0.3.0 released, nothing deploys it",
      }),
      expect.objectContaining({
        unit: "release",
        pending: false,
        hint: "0.3.0 released, nothing deploys it",
      }),
    ]);
  });
});
