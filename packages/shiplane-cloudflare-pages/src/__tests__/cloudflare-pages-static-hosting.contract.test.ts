import { staticHostingContract } from "shiplane/testing";

import { cloudflarePagesStaticHosting } from "../cloudflare-pages-static-hosting.adapter";

staticHostingContract([
  { adapter: cloudflarePagesStaticHosting(), settings: { project: "admin-site" } },
]);
