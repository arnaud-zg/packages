import type { z } from "zod";

import type { DeliveryAdapter } from "../ports/adapter.port";
import type { Resolved } from "../ports/delivery.port";
import type { MobileDistributionPort } from "../ports/mobile-distribution.port";
import type { PackageRegistryPort } from "../ports/package-registry.port";
import type { ServerHostingPort } from "../ports/server-hosting.port";
import type { StaticHostingPort } from "../ports/static-hosting.port";

/**
 * What an adapter author writes in one object: the recipe's static parts (name, settings, what init
 * and doctor ask) and the port's members, which read the settings typed.
 */
type Authored<Port extends { capability: string }, Schema extends z.ZodObject> = Omit<
  Port,
  "capability"
> &
  Omit<DeliveryAdapter<Port>, "create" | "settings" | "capability"> & {
    readonly settings: Schema;
  };

type Typed<Schema extends z.ZodObject> = Resolved<z.output<Schema>>;

// Its members take the settings its schema parses; the release flow only ever passes those.
const widen = <Port>(port: object): Port => port as Port;

const recipe = <Port extends { capability: string }>(
  {
    name,
    settings,
    typicalMinutes,
    decidedBy,
    detect,
    questions,
    requirements,
    env,
    ...port
  }: Omit<DeliveryAdapter<Port>, "create" | "capability">,
  capability: Port["capability"],
): DeliveryAdapter<Port> => ({
  name,
  capability,
  settings,
  typicalMinutes,
  decidedBy,
  detect,
  questions,
  requirements,
  ...(env ? { env } : {}),
  create: () => widen({ ...port, capability }),
});

export const defineServerHosting = <const Schema extends z.ZodObject>(
  adapter: Authored<ServerHostingPort<Typed<Schema>>, Schema>,
): DeliveryAdapter<ServerHostingPort> => recipe<ServerHostingPort>(adapter, "server-hosting");

export const defineStaticHosting = <const Schema extends z.ZodObject>(
  adapter: Authored<StaticHostingPort<Typed<Schema>>, Schema>,
): DeliveryAdapter<StaticHostingPort> => recipe<StaticHostingPort>(adapter, "static-hosting");

export const defineMobileDistribution = <const Schema extends z.ZodObject>(
  adapter: Authored<MobileDistributionPort<Typed<Schema>>, Schema> &
    Required<Pick<DeliveryAdapter<MobileDistributionPort>, "decidedBy">>,
): DeliveryAdapter<MobileDistributionPort> =>
  recipe<MobileDistributionPort>(adapter, "mobile-distribution");

export const definePackageRegistry = <const Schema extends z.ZodObject>(
  adapter: Authored<PackageRegistryPort<Typed<Schema>>, Schema>,
): DeliveryAdapter<PackageRegistryPort> => recipe<PackageRegistryPort>(adapter, "package-registry");
