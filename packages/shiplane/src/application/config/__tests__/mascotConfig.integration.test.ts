import { afterEach, describe, expect, it } from "vitest";

import type { Workspace } from "../../../testing/workspace";
import { resolveDisplay } from "../../../domain/display";
import { MODULE_CONFIG } from "../../../testing/moduleConfig";
import { createWorkspace, SOURCE_ALIASES } from "../../../testing/workspace";
import { loadRelease } from "../loadRelease";

let workspace: Workspace | undefined;
afterEach(() => workspace?.remove());

const terminal = { tty: true, ci: false, noMotion: false };

/** The test config, its display set to `display`, written as a person writes shiplane.config.ts. */
const withDisplay = (display: string) =>
  MODULE_CONFIG.replace(
    "export default defineRelease({",
    `export default defineRelease({\n  display: ${display},`,
  );

const loaded = async (display: string) => {
  workspace = createWorkspace({
    "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
    "shiplane.config.ts": withDisplay(display),
  });
  const release = await loadRelease(workspace.root, { aliases: SOURCE_ALIASES });
  return resolveDisplay(release.display ?? {}, {}, terminal).mascot;
};

describe("Feature: a mascot in shiplane.config.ts", () => {
  it("given frames in the config, when the release loads, then they are drawn", async () => {
    const mascot = await loaded('{ mascot: { happy: ["(=^▽^=) ✦"] } }');

    expect(mascot?.draw({ mood: "happy", tick: 0, label: "" }).trimEnd()).toBe("(=^▽^=) ✦");
  });

  it("given a function in the config, when the release loads, then it draws each moment", async () => {
    const mascot = await loaded('{ mascot: ({ mood }) => (mood === "worried" ? "x_x" : "^_^") }');

    expect(mascot?.draw({ mood: "worried", tick: 0, label: "" }).trimEnd()).toBe("x_x");
  });

  it("given mascot: false in the config, when the release loads, then there is none", async () => {
    expect(await loaded("{ mascot: false }")).toBeNull();
  });

  it("given a mascot that is neither frames nor a function, when the release loads, then the hedgehog is drawn", async () => {
    expect((await loaded('{ mascot: "cat" }'))?.hedgehog).toBe(true);
  });
});
