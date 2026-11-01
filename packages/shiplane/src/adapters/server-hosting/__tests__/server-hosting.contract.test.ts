import { serverHostingFake } from "../__fakes__/server-hosting.fake";
import { serverHostingContract } from "../server-hosting.contract";
import { shellServerHosting } from "../shell-server-hosting.adapter";

serverHostingContract([
  { adapter: serverHostingFake(), settings: { service: "api" } },
  { adapter: shellServerHosting(), settings: { deploy: ["pnpm", "deploy:api"] } },
]);
