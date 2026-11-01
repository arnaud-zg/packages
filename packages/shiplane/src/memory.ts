// In-memory adapters, one per port: each records what it is asked and does nothing real. A custom
// adapter `shiplane setup` writes starts from one, so the release runs end to end while it is written.
export { sourceControlFake as sourceControlMemory } from "./adapters/source-control/__fakes__/source-control.fake";
export { codeHostFake as codeHostMemory } from "./adapters/code-host/__fakes__/code-host.fake";
export { ciPipelineFake as ciPipelineMemory } from "./adapters/ci-pipeline/__fakes__/ci-pipeline.fake";
export { versioningFake as versioningMemory } from "./adapters/versioning/__fakes__/versioning.fake";
export { serverHostingFake as serverHostingMemory } from "./adapters/server-hosting/__fakes__/server-hosting.fake";
export { staticHostingFake as staticHostingMemory } from "./adapters/static-hosting/__fakes__/static-hosting.fake";
export { mobileDistributionFake as mobileDistributionMemory } from "./adapters/mobile-distribution/__fakes__/mobile-distribution.fake";
export { packageRegistryFake as packageRegistryMemory } from "./adapters/package-registry/__fakes__/package-registry.fake";
