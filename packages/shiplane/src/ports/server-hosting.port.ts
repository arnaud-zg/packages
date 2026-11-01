import type { Delivery } from "./delivery.port";

/** Runs a long-lived service, such as an API, from a tag: Fly.io today. */
export interface ServerHostingPort<Options = Record<string, unknown>> extends Delivery<Options> {
  readonly capability: "server-hosting";
}
