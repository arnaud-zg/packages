import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const BUILD_CONFIG = /^(package\.json|tsdown\.config\..+|tsconfig.*\.json)$/;

/** @param {string} packageDir */
const buildInputs = (packageDir) => {
  const src = join(packageDir, "src");
  const sources = readdirSync(src, { recursive: true, encoding: "utf8" })
    .filter((path) => !path.split(sep).includes("__tests__"))
    .map((path) => join(src, path));
  const configs = readdirSync(packageDir)
    .filter((name) => BUILD_CONFIG.test(name))
    .map((name) => join(packageDir, name));
  return [src, ...sources, ...configs];
};

/**
 * Why the CLI in `dist` cannot run as built, or undefined when it can.
 * @param {string} packageDir
 * @returns {string | undefined}
 */
export const staleReason = (packageDir) => {
  const cli = join(packageDir, "dist", "cli.js");
  if (!existsSync(cli)) return "it was never built";
  const builtAt = statSync(cli).mtimeMs;
  const changed = buildInputs(packageDir).some((path) => statSync(path).mtimeMs > builtAt);
  return changed ? "its sources changed" : undefined;
};

const main = () => {
  const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
  const reason = staleReason(packageDir);
  if (!reason) return;
  console.error(`Building shiplane: ${reason}`);
  const build = spawnSync("pnpm", ["-s", "build"], {
    cwd: packageDir,
    stdio: ["ignore", "ignore", "inherit"],
  });
  if (build.error) console.error(build.error.message);
  process.exitCode = build.status ?? 1;
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
