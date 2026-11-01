import { changesetsVersioning } from "@shiplane/changesets";
import { gitSourceControl } from "@shiplane/git";
import { gitHubActionsCiPipeline, gitHubCodeHost } from "@shiplane/github";
import { defineRelease, internalTool, releaseFlow } from "shiplane";

export default defineRelease({
  flow: releaseFlow({
    sourceControl: gitSourceControl(),
    codeHost: gitHubCodeHost(),
    ciPipeline: gitHubActionsCiPipeline(),
    // The root script versions, then refreshes the lockfile.
    versioning: changesetsVersioning({ version: ["pnpm", "-s", "changeset:version"] }),
  }),
  modules: [internalTool()],
});
