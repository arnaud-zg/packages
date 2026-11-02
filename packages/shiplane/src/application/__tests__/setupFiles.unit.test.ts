import { describe, expect, it } from "vitest";

import { DEFAULT_FLOW, renderConfig } from "../setupFiles";

const entry = {
  factory: "backendService",
  port: "serverHosting",
  adapter: "flyServerHosting",
  from: "@shiplane/fly",
};

describe("Feature: the config setup writes", () => {
  it("given today's flow, when the config is written, then each flow port names its plugin", () => {
    const text = renderConfig([entry], "shiplane");

    expect(text).toContain("sourceControl: gitSourceControl(),");
    expect(text).toContain("ciPipeline: gitHubActionsCiPipeline(),");
    expect(text).toContain(
      'import { gitHubActionsCiPipeline, gitHubCodeHost } from "@shiplane/github";',
    );
    expect(text).toContain("backendService({ serverHosting: flyServerHosting() })");
  });

  it("given a custom CI pipeline, when the config is written, then it is imported from its own file, after the plugins", () => {
    const flow = {
      ...DEFAULT_FLOW,
      ciPipeline: { factory: "jenkinsCiPipeline", from: "./shiplane/adapters/jenkins-ci-pipeline" },
    };

    const text = renderConfig([], "shiplane", flow);

    const lines = text.split("\n");
    const local = lines.findIndex((line) =>
      line.includes("./shiplane/adapters/jenkins-ci-pipeline"),
    );
    const plugin = lines.findIndex((line) => line.includes("@shiplane/github"));
    expect(text).toContain("ciPipeline: jenkinsCiPipeline(),");
    expect(local).toBeGreaterThan(plugin);
  });

  it("given apps outside the workspace file, when the config is written, then it lists where they are", () => {
    expect(renderConfig([], "shiplane", DEFAULT_FLOW, ["tools/*"])).toContain(
      'units: ["tools/*"],',
    );
  });

  it("given apps where the workspace file says, when the config is written, then it lists no folders", () => {
    expect(renderConfig([], "shiplane")).not.toContain("units:");
  });
});
