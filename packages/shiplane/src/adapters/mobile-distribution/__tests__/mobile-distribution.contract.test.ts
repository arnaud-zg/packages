import { mobileDistributionFake } from "../__fakes__/mobile-distribution.fake";
import { mobileDistributionContract } from "../mobile-distribution.contract";

mobileDistributionContract([{ adapter: mobileDistributionFake(), settings: { app: "expo" } }]);
