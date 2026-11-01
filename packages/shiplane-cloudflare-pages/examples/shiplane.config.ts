import { changesetsVersioning } from "@shiplane/changesets";
import { cloudflarePagesStaticHosting } from "@shiplane/cloudflare-pages";
import { gitSourceControl } from "@shiplane/git";
import { gitHubActionsCiPipeline, gitHubCodeHost } from "@shiplane/github";
import { defineRelease, releaseFlow, webApp } from "shiplane";

export default defineRelease({
  flow: releaseFlow({
    sourceControl: gitSourceControl(),
    codeHost: gitHubCodeHost(),
    ciPipeline: gitHubActionsCiPipeline(),
    versioning: changesetsVersioning(),
  }),
  modules: [webApp({ staticHosting: cloudflarePagesStaticHosting() })],
});
