import type { DeliveryAdapter } from "../ports/adapter.port";
import type { MobileDistributionPort } from "../ports/mobile-distribution.port";
import type { PackageRegistryPort } from "../ports/package-registry.port";
import type { ServerHostingPort } from "../ports/server-hosting.port";
import type { StaticHostingPort } from "../ports/static-hosting.port";
import type { ReleaseModule } from "./module";
import { backendService } from "./backend-service/backend-service.module";
import { mobileApp } from "./mobile-app/mobile-app.module";
import { publishedPackage } from "./published-package/published-package.module";
import { webApp } from "./web-app/web-app.module";

/** An adapter of any delivery port, as `init` offers them. */
export type AnyDeliveryAdapter =
  | DeliveryAdapter<ServerHostingPort>
  | DeliveryAdapter<StaticHostingPort>
  | DeliveryAdapter<MobileDistributionPort>
  | DeliveryAdapter<PackageRegistryPort>;

/** The module a provider suggests: its kind, the factory a config calls, the port it fills. */
export interface Suggested {
  kind: string;
  factory: string;
  port: string;
}

const SUGGESTED: Record<AnyDeliveryAdapter["capability"], Suggested> = {
  "server-hosting": { kind: "backend-service", factory: "backendService", port: "serverHosting" },
  "static-hosting": { kind: "web-app", factory: "webApp", port: "staticHosting" },
  "mobile-distribution": {
    kind: "mobile-app",
    factory: "mobileApp",
    port: "mobileDistribution",
  },
  "package-registry": {
    kind: "published-package",
    factory: "publishedPackage",
    port: "packageRegistry",
  },
};

export const suggestedModule = (adapter: AnyDeliveryAdapter): Suggested =>
  SUGGESTED[adapter.capability];

/** The module a provider makes under a name, as `init` composes it before the config exists. */
export const moduleFor = (adapter: AnyDeliveryAdapter, name: string): ReleaseModule => {
  switch (adapter.capability) {
    case "server-hosting":
      return backendService({ name, serverHosting: adapter });
    case "static-hosting":
      return webApp({ name, staticHosting: adapter });
    case "mobile-distribution":
      return mobileApp({ name, mobileDistribution: adapter });
    case "package-registry":
      return publishedPackage({ name, packageRegistry: adapter });
  }
};
