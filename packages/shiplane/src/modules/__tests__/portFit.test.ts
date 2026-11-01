import { describe, expect, it } from "vitest";

import type { ReleaseConfig } from "../../application/config/defineRelease";
import type { Feature } from "../module";
import { ciPipelineFake } from "../../adapters/ci-pipeline/__fakes__/ci-pipeline.fake";
import { codeHostFake } from "../../adapters/code-host/__fakes__/code-host.fake";
import { serverHostingFake } from "../../adapters/server-hosting/__fakes__/server-hosting.fake";
import { sourceControlFake } from "../../adapters/source-control/__fakes__/source-control.fake";
import { staticHostingFake } from "../../adapters/static-hosting/__fakes__/static-hosting.fake";
import { versioningFake } from "../../adapters/versioning/__fakes__/versioning.fake";
import { releaseFlow } from "../../application/releaseFlow";
import { backendService } from "../backend-service/backend-service.module";
import { mobileApp } from "../mobile-app/mobile-app.module";
import { webApp } from "../web-app/web-app.module";

const flow = releaseFlow({
  sourceControl: sourceControlFake(),
  codeHost: codeHostFake(),
  ciPipeline: ciPipelineFake(),
  versioning: versioningFake(),
});

describe("a module only takes the port it expects", () => {
  it("given adapters of other ports, when a config is written with them, then it does not compile", () => {
    // @ts-expect-error: a server host is not a mobile distribution.
    const mobile = () => mobileApp({ mobileDistribution: serverHostingFake() });
    // @ts-expect-error: a static host is not a server host.
    const backend = () => backendService({ serverHosting: staticHostingFake() });
    const notes: Feature = {
      type: "feature",
      name: "notes",
      adapters: [],
      afterShip: () => Promise.resolve([]),
    };
    const features = [notes];
    // @ts-expect-error: a feature is not a module.
    const config: ReleaseConfig = { flow, modules: features };

    expect([mobile, backend, config]).toHaveLength(3);
  });

  it("given the adapter each port expects, when a config is written with them, then it compiles", () => {
    const config: ReleaseConfig = {
      flow,
      modules: [
        backendService({ serverHosting: serverHostingFake() }),
        webApp({ staticHosting: staticHostingFake() }),
      ],
    };

    expect(config.modules.map(({ name }) => name)).toEqual(["backend-service", "web-app"]);
  });
});
