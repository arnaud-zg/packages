import type { DeliveryAdapter } from "../../ports/adapter.port";
import type { PackageRegistryPort } from "../../ports/package-registry.port";
import type { Named } from "../deliveryModule";
import type { ReleaseModule } from "../module";
import { deliveryModule } from "../deliveryModule";

/** A package others install: its registry, not deploy records, knows what is out. */
export const publishedPackage = ({
  name,
  packageRegistry,
}: Named & { packageRegistry: DeliveryAdapter<PackageRegistryPort> }): ReleaseModule => ({
  ...deliveryModule("published-package", packageRegistry, name),
  decide: (context, input) => context.open(packageRegistry).decide(context, input),
  live: (context, input) => context.open(packageRegistry).live(context, input),
});
