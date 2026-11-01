// Two modules as a real shiplane.config.ts composes them, each given a local adapter.
export const MODULE_CONFIG = `
import {
  backendService,
  defineRelease,
  defineServerHosting,
  defineStaticHosting,
  perEnv,
  releaseFlow,
  webApp,
  z,
} from "shiplane";
import {
  ciPipelineFake,
  codeHostFake,
  sourceControlFake,
  versioningFake,
} from "shiplane/testing";

// A flow of Fakes: plugins fill these ports in a real repository.
const flow = releaseFlow({
  sourceControl: sourceControlFake(),
  codeHost: codeHostFake(),
  ciPipeline: ciPipelineFake(),
  versioning: versioningFake(),
});

// A feature as a plugin gives one, such as release comments.
const notes = {
  type: "feature" as const,
  name: "release-comments",
  adapters: [],
  afterShip: () => Promise.resolve([]),
};

const pages = defineStaticHosting({
  name: "pages",
  settings: z.object({
    project: z.string(),
    url: perEnv(z.string()).optional(),
    build: z.object({ env: z.record(z.string(), perEnv(z.string())) }).optional(),
  }),
  describe: () => "",
  jobs: () => [],
});

const server = defineServerHosting({
  name: "server",
  settings: z.object({ app: perEnv(z.string()), url: perEnv(z.string()) }),
  describe: () => "",
  jobs: () => [],
});

export default defineRelease({
  flow,
  modules: [backendService({ serverHosting: server }), webApp({ staticHosting: pages })],
});
`;

const MODULES =
  "modules: [backendService({ serverHosting: server }), webApp({ staticHosting: pages })]";

/** The same config composing other modules, and features when given. */
export const withModules = (modules: string, features?: string) =>
  MODULE_CONFIG.replace(
    MODULES,
    `modules: [${modules}]${features ? `,\n  features: [${features}]` : ""}`,
  );

export const SERVER_UNIT = `module: backend-service
app:
  preview: api-preview
  production: api-production
url:
  preview: https://api-preview.example.com
  production: https://api.example.com
`;

export const ADMIN_UNIT = `module: web-app
project: admin-site
build:
  env:
    API_URL: \${units.api.url}
`;
