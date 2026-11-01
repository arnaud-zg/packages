import type { DeliveryAdapter } from "../../ports/adapter.port";
import type { MobileDistributionPort } from "../../ports/mobile-distribution.port";
import type { Named } from "../deliveryModule";
import type { ReleaseModule } from "../module";
import { deliveryModule } from "../deliveryModule";

/**
 * A mobile app: its distribution decides between a store build and an over-the-air update, adds to
 * the release PR, and says how a version does before it is promoted.
 */
export const mobileApp = ({
  name,
  mobileDistribution,
}: Named & { mobileDistribution: DeliveryAdapter<MobileDistributionPort> }): ReleaseModule => ({
  ...deliveryModule("mobile-app", mobileDistribution, name),
  versionFiles: (unit, units, open) => open(mobileDistribution).versionFiles?.(unit, units) ?? [],
  version: async (context, input) => {
    const port = context.open(mobileDistribution);
    return port.beforeVersion
      ? port.beforeVersion(context, input)
      : { added: [], writes: [], summary: [], onMerge: "" };
  },
  decide: (context, input) => context.open(mobileDistribution).decide(context, input),
  health: async (context, input) => {
    const port = context.open(mobileDistribution);
    return port.health ? port.health(context, input) : null;
  },
  inspect: async (context, input) => {
    const port = context.open(mobileDistribution);
    return port.inspect ? port.inspect(context, input) : undefined;
  },
});
