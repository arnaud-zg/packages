import { afterEach, describe, expect, it } from "vitest";

import type { Workspace } from "../../../testing/workspace";
import { MODULE_CONFIG, SERVER_UNIT } from "../../../testing/moduleConfig";
import { createWorkspace, packageJson, SOURCE_ALIASES } from "../../../testing/workspace";
import { loadRelease } from "../loadRelease";

let workspace: Workspace | undefined;

const loadApi = async (unitFile: string) => {
  workspace = createWorkspace({
    "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
    "shiplane.config.ts": MODULE_CONFIG,
    "apps/api/package.json": packageJson("@acme/api", "0.4.2"),
    "apps/api/shiplane.unit.yml": unitFile,
  });
  return loadRelease(workspace.root, { aliases: SOURCE_ALIASES });
};

afterEach(() => workspace?.remove());

describe("checkEnvBeforeDeploy in a unit file", () => {
  it("given one list of names, when the release loads, then both environments check them and the module's settings never see the key", async () => {
    const release = await loadApi(
      `${SERVER_UNIT}checkEnvBeforeDeploy:\n  - SENTRY_DSN\n  - DATABASE_URL\n`,
    );

    const [api] = release.units;
    expect(release.problems).toEqual([]);
    expect([...(api?.checkEnvBeforeDeploy?.for("production") ?? [])]).toEqual([
      "SENTRY_DSN",
      "DATABASE_URL",
    ]);
    expect(api?.options).not.toHaveProperty("checkEnvBeforeDeploy");
  });

  it("given all plus a production list, when the release loads, then preview checks all and production adds its own", async () => {
    const release = await loadApi(
      `${SERVER_UNIT}checkEnvBeforeDeploy:\n  all:\n    - SENTRY_DSN\n  production:\n    - REVENUECAT_PROJECT_ID\n`,
    );

    const [api] = release.units;
    expect([...(api?.checkEnvBeforeDeploy?.for("preview") ?? [])]).toEqual(["SENTRY_DSN"]);
    expect([...(api?.checkEnvBeforeDeploy?.for("production") ?? [])]).toEqual([
      "SENTRY_DSN",
      "REVENUECAT_PROJECT_ID",
    ]);
  });

  it("given a lowercase name, when the release loads, then the problem points at the key", async () => {
    const release = await loadApi(`${SERVER_UNIT}checkEnvBeforeDeploy:\n  - sentry_dsn\n`);

    expect(release.problems).toEqual([
      expect.objectContaining({
        file: "apps/api/shiplane.unit.yml",
        message: expect.stringContaining("checkEnvBeforeDeploy"),
      }),
    ]);
  });

  it("given an environment shiplane does not know, when the release loads, then it is an unknown key", async () => {
    const release = await loadApi(
      `${SERVER_UNIT}checkEnvBeforeDeploy:\n  all:\n    - SENTRY_DSN\n  staging:\n    - DEBUG\n`,
    );

    expect(release.problems).toEqual([
      expect.objectContaining({ message: expect.stringContaining("checkEnvBeforeDeploy.staging") }),
    ]);
  });

  it("given a unit file without the key, when the release loads, then the unit loads as before with nothing to check", async () => {
    const release = await loadApi(SERVER_UNIT);

    const [api] = release.units;
    expect(release.problems).toEqual([]);
    expect(api).not.toHaveProperty("checkEnvBeforeDeploy");
  });
});
