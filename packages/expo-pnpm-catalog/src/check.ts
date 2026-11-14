/**
 * expo-pnpm-catalog check
 *
 * Mirrors what `expo-doctor` would see in CI: temporarily resolves all
 * `catalog:*` references to concrete versions — across every workspace
 * package, not just the Expo app — so that `npx expo-doctor` can read the
 * full dependency surface correctly, then restores the original file.
 */
import { execSync } from "child_process";
import path from "path";
import chalk from "chalk";
import ora from "ora";

import type { CatalogPaths, ExtraPackages } from "./catalogUtils";
import { isCatalogRef, SEPARATOR } from "./catalogUtils";
import { CatalogWorkspace } from "./catalogWorkspace";
import { ExpoAppManifest } from "./expoAppManifest";
import { ExpoManifestResolver } from "./expoManifestResolver";
import { WorkspaceCatalogExpoScanner } from "./workspaceCatalogExpoScanner";

export type CheckOptions = {
  dryRun: boolean;
};

// ── Dry-run table ─────────────────────────────────────────────────────────────

function isExtraOnly(
  packageName: string,
  extra: ExtraPackages,
  manifest: ExpoAppManifest,
): boolean {
  const allDeps = { ...manifest.data.dependencies, ...manifest.data.devDependencies };
  const isDeclaredInApp = packageName in allDeps && isCatalogRef(allDeps[packageName] ?? "");
  return packageName in extra.versions && !isDeclaredInApp;
}

function resolveSource(
  packageName: string,
  extra: ExtraPackages,
  manifest: ExpoAppManifest,
  appLabel: string,
): string {
  return isExtraOnly(packageName, extra, manifest)
    ? (extra.byPackage[packageName] ?? []).join(", ")
    : appLabel;
}

function printDryRunTable(
  manifest: ExpoAppManifest,
  extra: ExtraPackages,
  resolvedDeps: Record<string, string>,
  appLabel: string,
): void {
  const entries = Object.entries(resolvedDeps)
    .filter(([, version]) => !version.startsWith("catalog:"))
    .sort(([a], [b]) => a.localeCompare(b));

  const nameWidth = Math.max(...entries.map(([name]) => name.length), 20);
  const versionWidth = Math.max(...entries.map(([, version]) => version.length), 10);

  console.info(
    "  " +
      chalk.dim("Package".padEnd(nameWidth + 2)) +
      chalk.dim("Version".padEnd(versionWidth + 4)) +
      chalk.dim("Source"),
  );
  console.info("  " + chalk.dim("─".repeat(nameWidth + versionWidth + 20)));

  for (const [packageName, version] of entries) {
    console.info(
      "  " +
        chalk.white(packageName.padEnd(nameWidth + 2)) +
        chalk.cyan(version.padEnd(versionWidth + 4)) +
        chalk.dim(resolveSource(packageName, extra, manifest, appLabel)),
    );
  }

  console.info("");
  console.info(chalk.yellow("  [dry run]") + chalk.dim(" — nothing was written or run"));
}

// ── Scan header ───────────────────────────────────────────────────────────────

function printScanHeader(
  appCount: number,
  extra: ExtraPackages,
  manifest: ExpoAppManifest,
  isDryRun: boolean,
  appLabel: string,
): void {
  const extraOnlyNames = Object.keys(extra.byPackage).filter((name) =>
    isExtraOnly(name, extra, manifest),
  );
  const totalCount = appCount + extraOnlyNames.length;

  console.info(
    chalk.bold("  Expo catalog check") +
      chalk.dim(` — ${totalCount} packages`) +
      (isDryRun ? chalk.yellow("  [dry run]") : ""),
  );

  if (extraOnlyNames.length === 0) return;

  console.info(
    chalk.dim(
      `  ${appCount} from ${appLabel} · ${extraOnlyNames.length} additional from other workspace packages`,
    ),
  );
  for (const name of extraOnlyNames) {
    console.info(
      chalk.dim(`    + ${name}`) +
        chalk.dim.italic(` (${(extra.byPackage[name] ?? []).join(", ")})`),
    );
  }
}

// ── expo-doctor runner ────────────────────────────────────────────────────────

function runExpoDoctor(resolved: ExpoAppManifest, appDir: string): boolean {
  const spinner = ora(chalk.dim("Starting expo-doctor...")).start();
  let passed = false;

  // expo-doctor runs synchronously below — if the process is interrupted
  // (Ctrl-C, killed terminal) while it's running, the `finally` block never
  // executes, leaving the resolved (non-catalog) manifest on disk. Restore
  // on interrupt too so the app's package.json never ends up modified.
  const restoreAndExit = () => {
    resolved.restore();
    process.exit(1);
  };
  process.on("SIGINT", restoreAndExit);
  process.on("SIGTERM", restoreAndExit);

  try {
    resolved.write();
    spinner.stop();
    console.info(SEPARATOR);

    execSync("npx expo-doctor", {
      cwd: appDir,
      stdio: "inherit",
      env: { ...process.env, APP_VARIANT: "development" },
    });

    passed = true;
  } catch {
    passed = false;
  } finally {
    resolved.restore();
    process.off("SIGINT", restoreAndExit);
    process.off("SIGTERM", restoreAndExit);
  }

  return passed;
}

function printDoctorResult(passed: boolean): void {
  console.info(SEPARATOR);
  console.info("");

  if (passed) {
    console.info(chalk.green("  ✓ All checks passed"));
    return;
  }

  console.info(chalk.red("  ✗ expo-doctor reported issues"));
  console.info(
    chalk.yellow("  → Run ") +
      chalk.bold("expo-pnpm-catalog sync") +
      chalk.yellow(" to fix version drift"),
  );
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function runCheck(paths: CatalogPaths, options: CheckOptions): boolean {
  console.info("");

  const workspace = CatalogWorkspace.load(paths.workspaceYamlPath);
  const manifest = ExpoAppManifest.load(paths.packageJsonPath);
  const scanner = new WorkspaceCatalogExpoScanner(paths.rootDir, workspace.getWorkspaceDirs());

  const appLabel = path.relative(paths.rootDir, paths.appDir) || ".";
  const appCount = manifest.catalogPackages().size;
  const extra = scanner.scan(workspace.getAllCatalogVersions(), paths.packageJsonPath);

  printScanHeader(appCount, extra, manifest, options.dryRun, appLabel);
  console.info("");

  const resolved = ExpoManifestResolver.from(manifest)
    .withCatalogResolution(workspace)
    .mergeExtraPackages(extra.versions)
    .build();

  if (options.dryRun) {
    printDryRunTable(manifest, extra, resolved.data.dependencies ?? {}, appLabel);
    return true;
  }

  const passed = runExpoDoctor(resolved, paths.appDir);
  printDoctorResult(passed);
  console.info("");
  return passed;
}
