import { describe, expect, it } from "vitest";

import {
  customFiles,
  isFactoryName,
  kebab,
  renderCustomAdapter,
  renderCustomTest,
  suggestedName,
} from "../customAdapter";

describe("Feature: a custom adapter's name", () => {
  it("given a camelCase name, when its file is named, then it is kebab-case under shiplane/adapters", () => {
    expect(kebab("jenkinsCiPipeline")).toBe("jenkins-ci-pipeline");
    expect(customFiles("jenkinsCiPipeline")).toEqual({
      file: "shiplane/adapters/jenkins-ci-pipeline.ts",
      test: "shiplane/adapters/jenkins-ci-pipeline.test.ts",
      from: "./shiplane/adapters/jenkins-ci-pipeline",
    });
  });

  it("given names a person might type, when they are checked, then only a factory name passes", () => {
    expect(isFactoryName("botDelivery")).toBe(true);
    expect(isFactoryName("bot-delivery")).toBe(false);
    expect(isFactoryName("1bot")).toBe(false);
    expect(isFactoryName("")).toBe(false);
  });

  it("given a port, when a name is offered first, then it says custom and the port", () => {
    expect(suggestedName("ciPipeline")).toBe("customCiPipeline");
  });
});

describe("Feature: a custom adapter's starting code", () => {
  it("given a flow port, when its adapter is written, then it starts from the in-memory one under its own name", () => {
    const text = renderCustomAdapter("ciPipeline", "jenkinsCiPipeline", "shiplane");

    expect(text).toContain('import { ciPipelineMemory } from "shiplane/memory";');
    expect(text).toContain("export const jenkinsCiPipeline = (): ServiceAdapter<CiPipelinePort>");
    expect(text).toContain('name: "jenkinsCiPipeline"');
    expect(text).toContain("TODO");
  });

  it("given a delivery port, when its adapter is written, then it takes no settings until the author adds some", () => {
    const text = renderCustomAdapter("staticHosting", "siteDelivery", "shiplane");

    expect(text).toContain("DeliveryAdapter<StaticHostingPort>");
    expect(text).toContain("...staticHostingMemory()");
    expect(text).toContain("settings: z.object({})");
  });

  it("given any custom adapter, when it is written, then it says how to share it", () => {
    expect(renderCustomAdapter("versioning", "myVersioning", "shiplane")).toContain(
      "publish it as shiplane-my-versioning",
    );
  });

  it("given a flow port, when its test is written, then it runs that port's contract on the adapter", () => {
    const text = renderCustomTest("codeHost", "giteaCodeHost", "shiplane");

    expect(text).toContain('codeHostContract("giteaCodeHost"');
    expect(text).toContain('import { giteaCodeHost } from "./gitea-code-host";');
  });

  it("given a delivery port, when its test is written, then it runs the delivery contract with empty settings", () => {
    expect(renderCustomTest("serverHosting", "botDelivery", "shiplane")).toContain(
      "serverHostingContract([{ adapter: botDelivery(), settings: {} }]);",
    );
  });
});
