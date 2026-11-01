import type { DeliveryAdapter } from "../../ports/adapter.port";
import type { ServerHostingPort } from "../../ports/server-hosting.port";
import type { Named } from "../deliveryModule";
import type { ReleaseModule } from "../module";
import { deliveryModule } from "../deliveryModule";

/** A long-lived service, such as an API: deployed from its tag, recorded with the code host. */
export const backendService = ({
  name,
  serverHosting,
}: Named & { serverHosting: DeliveryAdapter<ServerHostingPort> }): ReleaseModule =>
  deliveryModule("backend-service", serverHosting, name);
