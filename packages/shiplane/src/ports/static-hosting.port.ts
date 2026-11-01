import type { Delivery } from "./delivery.port";

/** Serves a static build, built against its environment: Cloudflare Pages today. */
export interface StaticHostingPort<Options = Record<string, unknown>> extends Delivery<Options> {
  readonly capability: "static-hosting";
}
