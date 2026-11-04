import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "../config";

let tmpDir: string;
let originalCwd: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-budget-config-test-"));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(() => {
  vi.restoreAllMocks();
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("loading the analysis config", () => {
  describe("given no config file exists", () => {
    it("when loaded, then today's hardcoded defaults are returned", () => {
      const config = loadConfig();

      expect(config).toEqual({
        charsPerToken: 4,
        root: {
          file: "CLAUDE.md",
          referencePattern: "`(\\.planning/codebase/[^`]+\\.md)`",
          threshold: 3500,
        },
        references: {
          threshold: 2000,
          failOnExceed: false,
        },
        subdir: {
          dirs: ["apps", "packages"],
          threshold: 1500,
          failOnExceed: false,
        },
        health: {
          goodBelow: 0.6,
          normalBelow: 0.85,
        },
        planningDir: ".planning/codebase",
      });
    });
  });

  describe("given a config file with a partial override", () => {
    it("when loaded, then the override is deep-merged over the defaults", () => {
      fs.writeFileSync(
        path.join(tmpDir, "agent-context-budget.config.json"),
        JSON.stringify({ root: { threshold: 5000 } }),
      );

      const config = loadConfig();

      expect(config.root.threshold).toBe(5000);
      expect(config.root.file).toBe("CLAUDE.md");
      expect(config.references.threshold).toBe(2000);
      expect(config.subdir.dirs).toEqual(["apps", "packages"]);
    });
  });

  describe("given an explicit config path", () => {
    it("when loaded, then that file's overrides are used instead of the default filename", () => {
      const customPath = path.join(tmpDir, "custom-config.json");
      fs.writeFileSync(customPath, JSON.stringify({ health: { goodBelow: 0.5 } }));

      const config = loadConfig(customPath);

      expect(config.health.goodBelow).toBe(0.5);
      expect(config.health.normalBelow).toBe(0.85);
    });
  });

  describe("given the default config file is absent but an explicit path is not provided", () => {
    it("when loaded, then it does not throw", () => {
      expect(() => loadConfig()).not.toThrow();
    });
  });

  describe("given only the legacy config file exists", () => {
    it("when loaded, then it is still read and a deprecation warning names the new file", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      fs.writeFileSync(
        path.join(tmpDir, "context-budget.config.json"),
        JSON.stringify({ root: { threshold: 5000 } }),
      );

      const config = loadConfig();

      expect(config.root.threshold).toBe(5000);
      expect(warn).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("will be removed in the next release"),
      );
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("agent-context-budget.config.json"),
      );
    });

    it("when loaded by explicit path, then no deprecation warning is shown", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const legacyPath = path.join(tmpDir, "context-budget.config.json");
      fs.writeFileSync(legacyPath, JSON.stringify({ root: { threshold: 5000 } }));

      expect(loadConfig(legacyPath).root.threshold).toBe(5000);
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe("given both the new and the legacy config files exist", () => {
    it("when loaded, then the new file wins and the warning says the legacy one is ignored", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      fs.writeFileSync(
        path.join(tmpDir, "agent-context-budget.config.json"),
        JSON.stringify({ root: { threshold: 5000 } }),
      );
      fs.writeFileSync(
        path.join(tmpDir, "context-budget.config.json"),
        JSON.stringify({ root: { threshold: 9000 } }),
      );

      const config = loadConfig();

      expect(config.root.threshold).toBe(5000);
      expect(warn).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("is ignored"));
    });
  });

  describe("given only the new config file exists", () => {
    it("when loaded, then no warning is shown", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      fs.writeFileSync(
        path.join(tmpDir, "agent-context-budget.config.json"),
        JSON.stringify({ root: { threshold: 5000 } }),
      );

      loadConfig();

      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe("given goodBelow above normalBelow", () => {
    it("when loaded, then the inverted health bands are rejected", () => {
      fs.writeFileSync(
        path.join(tmpDir, "agent-context-budget.config.json"),
        JSON.stringify({ health: { goodBelow: 0.9, normalBelow: 0.5 } }),
      );

      expect(() => loadConfig()).toThrow();
    });
  });
});
