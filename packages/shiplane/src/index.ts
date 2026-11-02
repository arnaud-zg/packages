// The API a shiplane.config.ts and an adapter import. Adapters share this zod, so their schemas mix.
export { z } from "zod";

export type { Environment } from "./domain/environment";
export type { Mascot, MascotMoment } from "./domain/display";
export type { ReleaseUnit } from "./domain/unit";
export type { PerEnv } from "./application/config/perEnv";
export { perEnv } from "./application/config/perEnv";
export type { ReleaseConfig } from "./application/config/defineRelease";
export { defineRelease } from "./application/config/defineRelease";
export type { Feature, ReleaseFlow, ReleaseModule } from "./modules/module";
export type {
  Adapter,
  AdapterContext,
  DeliveryAdapter,
  ServiceAdapter,
} from "./ports/adapter.port";
export type { CiPipelinePort } from "./ports/ci-pipeline.port";
export type { CodeHostPort } from "./ports/code-host.port";
export type { SourceControlPort } from "./ports/source-control.port";
export type { VersioningPort } from "./ports/versioning.port";
export type { MobileDistributionPort } from "./ports/mobile-distribution.port";
export type { PackageRegistryPort } from "./ports/package-registry.port";
export type { ServerHostingPort } from "./ports/server-hosting.port";
export type { StaticHostingPort } from "./ports/static-hosting.port";
export {
  defineMobileDistribution,
  definePackageRegistry,
  defineServerHosting,
  defineStaticHosting,
} from "./adapters/defineDelivery";
export { releaseFlow } from "./application/releaseFlow";
export { backendService } from "./modules/backend-service/backend-service.module";
export { internalTool } from "./modules/internal-tool/internal-tool.module";
export { mobileApp } from "./modules/mobile-app/mobile-app.module";
export { publishedPackage } from "./modules/published-package/published-package.module";
export { webApp } from "./modules/web-app/web-app.module";
// Built in: the escape hatch for a host no plugin covers.
export { shellServerHosting } from "./adapters/server-hosting/shell-server-hosting.adapter";
