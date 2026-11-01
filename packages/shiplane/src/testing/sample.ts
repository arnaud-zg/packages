import type { UnitRef } from "../domain/changes";
import type { DecidedBy } from "../domain/scope";

/** This repository's four shipping units, as the rule tests were written against them. */
export const SAMPLE_UNITS: UnitRef[] = ["expo", "api", "admin", "landing"].map((name) => ({
  name,
  packageName: `@acme/${name}`,
}));

export const SAMPLE_VERSION_FILES = new Set([
  "apps/expo/app-version.json",
  "apps/api/public/app-version.preview.json",
  "apps/api/public/app-version.production.json",
]);

// Billed minutes per deploy with no successful run to measure: the api validates before deploying.
export const SAMPLE_TYPICAL_MINUTES: Record<string, number> = {
  api: 13,
  admin: 5,
  landing: 4,
  expo: 8,
};

export const EAS_DECIDES: DecidedBy = {
  platform: "EAS",
  choice: "build or update",
  check: "shiplane status",
};
