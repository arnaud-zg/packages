import type { DeliveryAdapter } from "../ports/adapter.port";
import type { Delivery } from "../ports/delivery.port";
import type { ReleaseModule } from "./module";

/** What every module of apps takes besides its adapter: a name, when two of a kind sit side by side. */
export interface Named {
  /** What an app's unit file names; the module's kind by default. */
  name?: string;
}

/** The stages every delivery adapter answers: its settings, where a tag lands and its jobs. */
export const deliveryModule = <Port extends Delivery & { capability: string }>(
  kind: string,
  adapter: DeliveryAdapter<Port>,
  name = kind,
): ReleaseModule => ({
  type: "module",
  name,
  kind,
  provider: adapter.name,
  settings: adapter.settings,
  adapters: [adapter],
  decidedBy: adapter.decidedBy,
  typicalMinutes: adapter.typicalMinutes,
  requirements: (apps) => apps.flatMap((unit) => adapter.requirements?.(unit) ?? []),
  ship: ({ open }, input) => {
    const port = open(adapter);
    return { where: port.describe(input), jobs: port.jobs(input) };
  },
});
