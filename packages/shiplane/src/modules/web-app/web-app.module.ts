import type { DeliveryAdapter } from "../../ports/adapter.port";
import type { StaticHostingPort } from "../../ports/static-hosting.port";
import type { Named } from "../deliveryModule";
import type { ReleaseModule } from "../module";
import { deliveryModule } from "../deliveryModule";

/** A static site, built against the environment it ships to. */
export const webApp = ({
  name,
  staticHosting,
}: Named & { staticHosting: DeliveryAdapter<StaticHostingPort> }): ReleaseModule =>
  deliveryModule("web-app", staticHosting, name);
