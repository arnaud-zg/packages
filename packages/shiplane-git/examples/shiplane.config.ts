import { changesetsVersioning } from "@shiplane/changesets";
import { gitSourceControl } from "@shiplane/git";
import { gitHubActionsCiPipeline, gitHubCodeHost } from "@shiplane/github";
import { defineRelease, internalTool, releaseFlow } from "shiplane";

export default defineRelease({
  flow: releaseFlow({
    // Releases start from trunk; the release commit is formatted like any other.
    sourceControl: gitSourceControl({
      main: "trunk",
      format: ["pnpm", "exec", "prettier", "--write", "--ignore-unknown"],
    }),
    codeHost: gitHubCodeHost(),
    ciPipeline: gitHubActionsCiPipeline(),
    versioning: changesetsVersioning(),
  }),
  modules: [internalTool()],
});
