import { serverHostingContract } from "shiplane/testing";

import { flyServerHosting } from "../fly-server-hosting.adapter";

serverHostingContract([
  { adapter: flyServerHosting(), settings: { app: { preview: "api-preview", production: "api" } } },
]);
