import { serverHostingContract } from "shiplane/testing";

import { renderServerHosting } from "../../../../packages/shiplane/examples/render-server-hosting";

// The plugin the Plugins page writes holds the same contract as Fly and the shell adapter.
serverHostingContract([{ adapter: renderServerHosting(), settings: { service: "acme-api" } }]);
