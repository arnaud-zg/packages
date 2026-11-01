import { staticHostingFake } from "../__fakes__/static-hosting.fake";
import { staticHostingContract } from "../static-hosting.contract";

staticHostingContract([{ adapter: staticHostingFake(), settings: { site: "admin" } }]);
