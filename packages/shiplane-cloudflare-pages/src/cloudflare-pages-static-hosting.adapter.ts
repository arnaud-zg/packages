import path from "node:path";
import type { DeliveryAdapter, StaticHostingPort } from "shiplane/plugin";
import { defineStaticHosting, perEnv, z } from "shiplane/plugin";

const WRANGLER = "wrangler@4.141.0";

const BUILT = /^(vite|astro|next|nuxt|svelte)\.config\.(ts|js|mjs|cjs)$/;

const PagesOptions = z.object({
  project: z.string().describe("The Cloudflare Pages project"),
  dist: z.string().default("dist").describe("What the build writes, relative to the unit's folder"),
  build: z
    .object({
      command: z
        .array(z.string())
        .optional()
        .describe("The build, run from the root; `pnpm turbo run build` of the unit by default"),
      env: z
        .record(z.string(), perEnv(z.string()))
        .optional()
        .describe("Variables the build reads, per environment"),
    })
    .default({}),
  branch: perEnv(z.string())
    .default({ preview: "preview", production: "main" })
    .describe("The Pages branch; production is the project's production branch"),
  wrangler: z.string().default(WRANGLER).describe("The wrangler npx runs, pinned"),
});

/** A static build on Cloudflare Pages: built against its environment, uploaded with wrangler. */
export type CloudflarePagesStaticHostingAdapter = DeliveryAdapter<StaticHostingPort>;

export const cloudflarePagesStaticHosting = (): CloudflarePagesStaticHostingAdapter =>
  defineStaticHosting({
    name: "cloudflare-pages",
    settings: PagesOptions,
    typicalMinutes: 5,
    describe: ({ options }) => `${options.project} on Pages (${options.branch})`,
    detect: (folder) => {
      const wrangler = folder.files.find((file) => /^wrangler\.(toml|jsonc?)$/.test(file));
      if (wrangler) {
        const project =
          /^name\s*=\s*"([^"]+)"/m.exec(folder.read(wrangler) ?? "")?.[1] ??
          /"name"\s*:\s*"([^"]+)"/.exec(folder.read(wrangler) ?? "")?.[1];
        return { certainty: "found", reason: wrangler, options: project ? { project } : {} };
      }
      const built = folder.files.find((file) => BUILT.test(file));
      if (!built) return null;
      // A Vite config without an index.html is usually a library, not a site.
      const site = !built.startsWith("vite.") || folder.has("index.html");
      return {
        certainty: site ? "likely" : "possible",
        reason: site && built.startsWith("vite.") ? `${built}, index.html` : built,
        options: {},
      };
    },
    questions: (folder, found, repository) =>
      found.project === undefined
        ? [{ key: "project", message: "Pages project?", initial: `${repository}-${folder.name}` }]
        : [],
    requirements: (unit) => {
      const wrangler = PagesOptions.parse(unit.options).wrangler;
      return [
        {
          label: "wrangler",
          check: { command: "npx", args: ["--yes", wrangler, "whoami"] },
          fix: { command: "npx", args: ["--yes", wrangler, "login"] },
        },
      ];
    },
    jobs: ({ unit, tag, options, commit }) => {
      const env = options.build.env;
      return [
        {
          label: `build ${tag} and upload it to ${options.project} (${options.branch})`,
          local: [
            {
              command: options.build.command?.[0] ?? "pnpm",
              args: options.build.command?.slice(1) ?? [
                "turbo",
                "run",
                "build",
                `--filter=${unit.packageName}`,
              ],
              ...(env && Object.keys(env).length > 0 ? { env } : {}),
            },
            {
              command: "npx",
              args: [
                "--yes",
                options.wrangler,
                "pages",
                "deploy",
                path.posix.join(unit.dir, options.dist),
                `--project-name=${options.project}`,
                // The upload is the deploy: it returns in seconds.
                `--branch=${options.branch}`,
                `--commit-hash=${commit}`,
                `--commit-message=${tag}`,
              ],
            },
          ],
          ci: { ref: tag },
          record: true,
        },
      ];
    },
  });
