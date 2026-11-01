import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { staleReason } from "../build-if-stale.mjs";

const OLD = new Date("2026-01-01T00:00:00Z");
const BUILT = new Date("2026-01-02T00:00:00Z");
const NEW = new Date("2026-01-03T00:00:00Z");

let packageDir: string;

const writeAt = (relativePath: string, time: Date) => {
  const path = join(packageDir, relativePath);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, "");
  utimesSync(path, time, time);
};

const settleFoldersAt = (time: Date) => {
  for (const folder of ["src", "src/plugins", "src/plugins/__tests__"]) {
    utimesSync(join(packageDir, folder), time, time);
  }
};

beforeEach(() => {
  packageDir = mkdtempSync(join(tmpdir(), "release-cli-"));
  writeAt("package.json", OLD);
  writeAt("tsdown.config.ts", OLD);
  writeAt("tsconfig.build.json", OLD);
  writeAt("src/cli.ts", OLD);
  writeAt("src/plugins/fly.ts", OLD);
  writeAt("src/plugins/__tests__/fly.test.ts", OLD);
  writeAt("dist/cli.js", BUILT);
  settleFoldersAt(OLD);
});

afterEach(() => {
  rmSync(packageDir, { recursive: true, force: true });
});

describe("whether the release CLI needs a build before it runs", () => {
  it("given a CLI built after every source, when the check runs, then it runs as built", () => {
    expect(staleReason(packageDir)).toBeUndefined();
  });

  it("given no built CLI, when the check runs, then it builds", () => {
    rmSync(join(packageDir, "dist"), { recursive: true });

    expect(staleReason(packageDir)).toBe("it was never built");
  });

  it("given a source edited after the build, when the check runs, then it builds", () => {
    writeAt("src/plugins/fly.ts", NEW);

    expect(staleReason(packageDir)).toBe("its sources changed");
  });

  it("given a source deleted after the build, when the check runs, then it builds", () => {
    utimesSync(join(packageDir, "src/plugins"), NEW, NEW);

    expect(staleReason(packageDir)).toBe("its sources changed");
  });

  it.each(["package.json", "tsdown.config.ts", "tsconfig.build.json"])(
    "given %s edited after the build, when the check runs, then it builds",
    (file) => {
      writeAt(file, NEW);

      expect(staleReason(packageDir)).toBe("its sources changed");
    },
  );

  it("given only a test edited after the build, when the check runs, then it runs as built", () => {
    writeAt("src/plugins/__tests__/fly.test.ts", NEW);
    settleFoldersAt(OLD);

    expect(staleReason(packageDir)).toBeUndefined();
  });
});
