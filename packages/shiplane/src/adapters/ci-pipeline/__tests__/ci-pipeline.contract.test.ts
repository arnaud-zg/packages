import { CiPipelineFake } from "../__fakes__/ci-pipeline.fake";
import { ciPipelineContract } from "../ci-pipeline.contract";

ciPipelineContract("the fake", () =>
  Promise.resolve({
    port: new CiPipelineFake().seed({ minutes: { used: 600, included: 2000, left: 1400 } }),
    idle: "ship.yml",
  }),
);
