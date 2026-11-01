import { changesetsVersioning } from "@shiplane/changesets";
import { gitSourceControl } from "@shiplane/git";
import { gitHubActionsCiPipeline, gitHubCodeHost, releaseComments } from "@shiplane/github";
import { backendService, defineRelease, releaseFlow, shellServerHosting } from "shiplane";

const sourceControl = gitSourceControl();
const codeHost = gitHubCodeHost();

export default defineRelease({
  flow: releaseFlow({
    sourceControl,
    codeHost,
    // A ship through GitHub Actions dispatches deploy.yml with `units` and `environment`.
    ciPipeline: gitHubActionsCiPipeline({ shipWorkflow: "deploy.yml" }),
    versioning: changesetsVersioning(),
  }),
  modules: [backendService({ serverHosting: shellServerHosting() })],
  // After a ship, each PR in the version and each issue it relates to hears about it.
  features: [releaseComments({ codeHost, sourceControl })],
});
