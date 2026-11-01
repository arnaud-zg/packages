// Each port gets an adapter; a module per kind of app takes the adapter that ships it.
import { changesetsVersioning } from "@shiplane/changesets";
import { cloudflarePagesStaticHosting } from "@shiplane/cloudflare-pages";
import { flyServerHosting } from "@shiplane/fly";
import { gitSourceControl } from "@shiplane/git";
import { gitHubActionsCiPipeline, gitHubCodeHost } from "@shiplane/github";
import { backendService, defineRelease, releaseFlow, webApp } from "shiplane";

export default defineRelease({
  flow: releaseFlow({
    sourceControl: gitSourceControl(),
    codeHost: gitHubCodeHost(),
    ciPipeline: gitHubActionsCiPipeline(),
    versioning: changesetsVersioning(),
  }),
  modules: [
    backendService({ serverHosting: flyServerHosting() }),
    webApp({ staticHosting: cloudflarePagesStaticHosting() }),
  ],
});
