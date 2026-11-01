// Each port gets an adapter; a module per kind of app takes the adapter that ships it.
import { changesetsVersioning } from "@shiplane/changesets";
import { cloudflarePagesStaticHosting } from "@shiplane/cloudflare-pages";
import { easMobileDistribution } from "@shiplane/eas";
import { flyServerHosting } from "@shiplane/fly";
import { gitSourceControl } from "@shiplane/git";
import { gitHubActionsCiPipeline, gitHubCodeHost } from "@shiplane/github";
import { npmPackageRegistry } from "@shiplane/npm";
import {
  backendService,
  defineRelease,
  internalTool,
  mobileApp,
  publishedPackage,
  releaseFlow,
  webApp,
} from "shiplane";

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
    mobileApp({ mobileDistribution: easMobileDistribution() }),
    publishedPackage({ packageRegistry: npmPackageRegistry() }),
    internalTool(),
  ],
});
