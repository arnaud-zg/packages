import { mobileDistributionContract } from "shiplane/testing";

import { easMobileDistribution } from "../eas-mobile-distribution.adapter";

mobileDistributionContract([
  {
    adapter: easMobileDistribution(),
    settings: { update: { preview: "eas:update:preview", production: "eas:update:production" } },
  },
]);
