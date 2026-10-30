import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { WorkspaceExportsOptions } from "../workspaceExports";
import { workspaceExports } from "../workspaceExports";

let root: string;

const writePackage = (
  group: string,
  dir: string,
  packageJson: object,
  files: Record<string, string> = {},
) => {
  const pkgDir = join(root, group, dir);
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(join(pkgDir, "package.json"), JSON.stringify(packageJson));

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(pkgDir, relativePath);
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, content);
  }
};

const resolve = (source: string, options?: WorkspaceExportsOptions) =>
  workspaceExports(root, options).resolveId(source);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "vite-workspace-resolver-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("workspaceExports", () => {
  it("given a bare package specifier, when the exports map has a '.' entry, then it resolves to that file", () => {
    writePackage(
      "packages",
      "tokens",
      { name: "@acme/tokens", exports: { ".": "./src/index.ts" } },
      { "src/index.ts": "export const x = 1;" },
    );

    expect(resolve("@acme/tokens")).toBe(join(root, "packages/tokens/src/index.ts"));
  });

  it("given a subpath specifier, when the exports map has a matching entry, then it resolves to that file", () => {
    writePackage(
      "packages",
      "sse",
      { name: "@acme/sse", exports: { ".": "./dist/index.js", "./core": "./dist/core.js" } },
      { "dist/core.js": "export const core = 1;" },
    );

    expect(resolve("@acme/sse/core")).toBe(join(root, "packages/sse/dist/core.js"));
  });

  it("given an unscoped package, when resolved with a subpath, then it resolves through the exports map", () => {
    writePackage(
      "packages",
      "utils",
      { name: "utils", exports: { "./math": "./src/math.ts" } },
      { "src/math.ts": "export {};" },
    );

    expect(resolve("utils/math")).toBe(join(root, "packages/utils/src/math.ts"));
  });

  it("given a deep src specifier, when the target file exists without an extension in the specifier, then it probes .ts", () => {
    writePackage(
      "packages",
      "theme",
      { name: "@acme/theme", exports: { ".": "./dist/index.js" } },
      { "src/config.ts": "export const config = {};" },
    );

    expect(resolve("@acme/theme/src/config")).toBe(join(root, "packages/theme/src/config.ts"));
  });

  it("given custom groups, when a package lives outside packages/, then it is found", () => {
    writePackage(
      "tooling",
      "theme",
      { name: "@acme/theme", exports: { ".": "./src/index.ts" } },
      { "src/index.ts": "export {};" },
    );

    expect(resolve("@acme/theme")).toBeNull();
    expect(resolve("@acme/theme", { groups: ["packages", "tooling"] })).toBe(
      join(root, "tooling/theme/src/index.ts"),
    );
  });

  it("given a package with a string exports field, when resolved bare, then it resolves that single target", () => {
    writePackage(
      "packages",
      "single-export",
      { name: "@acme/single-export", exports: "./src/index.ts" },
      { "src/index.ts": "export {};" },
    );

    expect(resolve("@acme/single-export")).toBe(join(root, "packages/single-export/src/index.ts"));
  });

  it("given an unknown package, when resolved, then it returns null so the default resolver takes over", () => {
    expect(resolve("@acme/does-not-exist")).toBeNull();
  });

  it("given a known package with no matching export key, when resolved, then it returns null", () => {
    writePackage("packages", "tokens", {
      name: "@acme/tokens",
      exports: { ".": "./src/index.ts" },
    });

    expect(resolve("@acme/tokens/nonexistent")).toBeNull();
  });

  it("given a non-workspace specifier, when resolved, then it returns null", () => {
    expect(resolve("react")).toBeNull();
  });

  it("given a relative or absolute specifier, when resolved, then it returns null", () => {
    expect(resolve("./local")).toBeNull();
    expect(resolve("/abs/path")).toBeNull();
  });
});
