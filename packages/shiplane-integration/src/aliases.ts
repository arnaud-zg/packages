import { createRequire } from "node:module";

const PLUGINS = ["git", "github", "changesets", "fly", "cloudflare-pages", "eas", "npm"];

const resolved = createRequire(import.meta.url).resolve;

/** What a config written by init imports, resolved to the built workspace packages. */
export const PLUGIN_ALIASES: Record<string, string> = Object.fromEntries([
  ...["", "/plugin", "/memory", "/testing"].map((sub) => [
    `shiplane${sub}`,
    resolved(`shiplane${sub}`),
  ]),
  ...PLUGINS.map((plugin) => [`@shiplane/${plugin}`, resolved(`@shiplane/${plugin}`)]),
]);
