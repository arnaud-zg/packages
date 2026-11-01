import { ciPipelineContract, LIVE, sandbox, systemShell } from "shiplane/testing";
import { describe } from "vitest";

import { gitHubActionsCiPipeline } from "../github-actions-ci-pipeline.adapter";

describe.skipIf(!LIVE)("live", () => {
  ciPipelineContract("github actions", () => {
    const port = gitHubActionsCiPipeline().create({ root: sandbox(), shell: systemShell });
    return Promise.resolve({ port, idle: "contract-idle.yml" });
  });
});
