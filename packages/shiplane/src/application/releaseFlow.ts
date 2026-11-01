import type { ReleaseFlow } from "../modules/module";
import type { ServiceAdapter } from "../ports/adapter.port";
import type { CiPipelinePort } from "../ports/ci-pipeline.port";
import type { CodeHostPort } from "../ports/code-host.port";
import type { SourceControlPort } from "../ports/source-control.port";
import type { VersioningPort } from "../ports/versioning.port";

/** How the release itself runs, given an adapter for each port it runs on. */
export const releaseFlow = (ports: {
  sourceControl: ServiceAdapter<SourceControlPort>;
  codeHost: ServiceAdapter<CodeHostPort>;
  ciPipeline: ServiceAdapter<CiPipelinePort>;
  versioning: ServiceAdapter<VersioningPort>;
}): ReleaseFlow => ({ type: "flow", ...ports });
