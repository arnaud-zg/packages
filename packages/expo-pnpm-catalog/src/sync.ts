/**
 * expo-pnpm-catalog sync
 *
 * Uses `expo install --fix` (same engine as expo-doctor) to determine the
 * correct dependency versions for the current Expo SDK across the entire
 * workspace, then writes those versions back into the matching `catalogs.*`
 * section of pnpm-workspace.yaml while preserving all `catalog:*` references
 * in every package.json.
 */
import { execSync } from "child_process";
import readline from "readline";
import chalk from "chalk";
import ora from "ora";

import type { CatalogPaths } from "./catalogUtils";
import { CatalogUpdate } from "./catalogUpdate";
import { SEPARATOR } from "./catalogUtils";
import { CatalogWorkspace } from "./catalogWorkspace";
import { ExpoAppManifest } from "./expoAppManifest";
import { ExpoManifestResolver } from "./expoManifestResolver";
import { WorkspaceCatalogExpoScanner } from "./workspaceCatalogExpoScanner";

export type SyncOptions = {
  dryRun: boolean;
  yes: boolean;
};

// ── Updates table ─────────────────────────────────────────────────────────────

function printUpdatesTable(updates: CatalogUpdate[]): void {
  const nameWidth = Math.max(...updates.map((u) => u.name.length), 20);
  const fromWidth = Math.max(...updates.map((u) => u.from.length), 8);

  console.info("");
  console.info(
    "  " +
      chalk.dim("Package".padEnd(nameWidth + 2)) +
      chalk.dim("From".padEnd(fromWidth + 4)) +
      chalk.dim("To"),
  );
  console.info("  " + chalk.dim("─".repeat(nameWidth + fromWidth + 20)));

  for (const { name, from, to } of updates) {
    console.info(
      "  " +
        chalk.white(name.padEnd(nameWidth + 2)) +
        chalk.yellow(from.padEnd(fromWidth + 4)) +
        chalk.dim("→  ") +
        chalk.green(to),
    );
  }

  console.info("");
}

// ── Confirmation prompt ───────────────────────────────────────────────────────

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question(`${message} ${chalk.dim("[Y/n] ")}`, (input) => {
      rl.close();
      resolve(input.trim().toLowerCase());
    });
  });
  return answer === "" || answer === "y" || answer === "yes";
}

// ── expo install --fix runner ─────────────────────────────────────────────────

function runExpoInstallFix(resolved: ExpoAppManifest, appDir: string): ExpoAppManifest {
  const spinner = ora(chalk.dim("Running expo install --fix...")).start();

  try {
    resolved.write();
    spinner.stop();
    console.info(SEPARATOR);

    execSync("npx expo install --fix", {
      cwd: appDir,
      stdio: "inherit",
      env: { ...process.env, APP_VARIANT: "development" },
    });

    console.info(SEPARATOR);

    const fixedData = resolved.readFixed();
    return resolved.withDeps(fixedData.dependencies ?? {}, fixedData.devDependencies ?? {});
  } finally {
    resolved.restore();
  }
}

// ── Update computation ────────────────────────────────────────────────────────

function computeUpdates(
  catalogPackages: Set<string>,
  excludedPackages: Set<string>,
  allCatalogVersions: Record<string, string>,
  fixedManifest: ExpoAppManifest,
): CatalogUpdate[] {
  const fixedDeps = {
    ...fixedManifest.data.dependencies,
    ...fixedManifest.data.devDependencies,
  };

  const updates: CatalogUpdate[] = [];
  for (const name of catalogPackages) {
    const current = allCatalogVersions[name];
    if (excludedPackages.has(name) || current === undefined) continue;
    const update = CatalogUpdate.between(name, current, fixedDeps[name] ?? "");
    if (update) updates.push(update);
  }

  return updates;
}

// ── Apply updates ─────────────────────────────────────────────────────────────

function applyUpdatesToYaml(workspace: CatalogWorkspace, updates: CatalogUpdate[]): void {
  const writeSpinner = ora("Updating pnpm-workspace.yaml...").start();

  let updated = workspace;
  for (const { name, to } of updates) {
    updated = updated.writeVersion(name, to);
  }

  updated.save();
  writeSpinner.succeed(chalk.green("pnpm-workspace.yaml updated"));
}

function runPnpmInstall(rootDir: string): void {
  console.info(SEPARATOR);
  execSync("pnpm install", { cwd: rootDir, stdio: "inherit" });
  console.info(SEPARATOR);
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runSync(paths: CatalogPaths, options: SyncOptions): Promise<void> {
  console.info("");
  console.info(
    chalk.bold("  Expo catalog sync") + (options.dryRun ? chalk.yellow("  [dry run]") : ""),
  );
  console.info("");

  const workspace = CatalogWorkspace.load(paths.workspaceYamlPath);
  const manifest = ExpoAppManifest.load(paths.packageJsonPath);
  const scanner = new WorkspaceCatalogExpoScanner(paths.rootDir, workspace.getWorkspaceDirs());

  const catalogPackages = manifest.catalogPackages();
  const extraPackages = scanner.scan(workspace.getAllCatalogVersions(), paths.packageJsonPath);
  const extraOnlyCount = Object.keys(extraPackages.versions).filter(
    (name) => !catalogPackages.has(name),
  ).length;

  for (const name of Object.keys(extraPackages.versions)) {
    catalogPackages.add(name);
  }

  console.info(
    chalk.dim(`  Scanning ${catalogPackages.size} catalog packages across workspace...`),
  );
  if (extraOnlyCount > 0) {
    console.info(chalk.dim(`  Including ${extraOnlyCount} packages from other workspace packages`));
  }
  console.info("");

  const resolved = ExpoManifestResolver.from(manifest)
    .withCatalogResolution(workspace)
    .mergeExtraPackages(extraPackages.versions)
    .build();

  const fixedManifest = runExpoInstallFix(resolved, paths.appDir);
  const updates = computeUpdates(
    catalogPackages,
    manifest.excludedPackages(),
    workspace.getAllCatalogVersions(),
    fixedManifest,
  );

  if (updates.length === 0) {
    console.info("");
    console.info(chalk.green("  ✓ catalogs are already in sync with the Expo SDK."));
    console.info("");
    return;
  }

  printUpdatesTable(updates);

  if (options.dryRun) {
    console.info(
      chalk.yellow(`  ${updates.length} update${updates.length === 1 ? "" : "s"} pending`) +
        chalk.dim(" — dry run, nothing written"),
    );
    console.info("");
    return;
  }

  if (!options.yes) {
    const proceed = await confirm(
      chalk.bold(
        `  Apply ${updates.length} update${updates.length === 1 ? "" : "s"} to pnpm-workspace.yaml?`,
      ),
    );

    if (!proceed) {
      console.info("");
      console.info(chalk.yellow("  Aborted."));
      console.info("");
      return;
    }
  }

  console.info("");
  applyUpdatesToYaml(workspace, updates);
  runPnpmInstall(paths.rootDir);
  console.info("");
  console.info(chalk.green("  ✓ Done — catalog and lockfile are in sync."));
  console.info("");
}
