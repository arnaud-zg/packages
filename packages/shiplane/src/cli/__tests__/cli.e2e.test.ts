import { afterEach, describe, expect, it } from "vitest";

import type { ConsumerRepository } from "../../testing/consumer";
import { consumerRepository } from "../../testing/consumer";

// What a consumer of the core alone writes: a host with no plugin, the release flow on Fakes.
const CONFIG = `import { backendService, defineRelease, releaseFlow, shellServerHosting } from "shiplane";
import {
  ciPipelineFake,
  codeHostFake,
  sourceControlFake,
  versioningFake,
} from "shiplane/testing";

export default defineRelease({
  flow: releaseFlow({
    sourceControl: sourceControlFake(),
    codeHost: codeHostFake(),
    ciPipeline: ciPipelineFake(),
    versioning: versioningFake(),
  }),
  modules: [backendService({ serverHosting: shellServerHosting() })],
  display: { verbose: false, mascot: false },
});
`;

let repository: ConsumerRepository | undefined;
afterEach(() => repository?.remove());

const install = (
  unitFile = "module: backend-service\ndeploy: [./deploy.sh, --fast]\n",
  config = CONFIG,
) => {
  repository = consumerRepository({
    files: {
      "package.json": JSON.stringify({ name: "acme", private: true, workspaces: ["apps/*"] }),
      "shiplane.config.ts": config,
      "apps/api/package.json": JSON.stringify({ name: "@acme/api", version: "1.0.0" }),
      "apps/api/shiplane.unit.yml": unitFile,
    },
  });
  return repository;
};

describe("the built shiplane CLI, installed in a repository", () => {
  it("when a person asks for help, then every command is listed and it exits 0", () => {
    const { status, output } = install().shiplane(["help"]);

    expect(status).toBe(0);
    for (const command of ["promote", "status", "plan", "init", "doctor", "docs <name>"]) {
      expect(output).toContain(`shiplane ${command}`);
    }
  });

  it("given a command shiplane does not know, when it runs, then it says so, prints the help and exits 1", () => {
    const { status, output } = install().shiplane(["deploy"]);

    expect(status).toBe(1);
    expect(output).toContain('no command "deploy"');
    expect(output).toContain("shiplane plan");
  });

  it("given a config still setting commitsWithoutChangeset, when a command runs, then it warns only changesets release and carries on", () => {
    const { status, output } = install(
      undefined,
      CONFIG.replace("defineRelease({", 'defineRelease({\n  commitsWithoutChangeset: "release",'),
    ).shiplane(["plan"]);

    expect(status).toBe(0);
    expect(output).toContain("commitsWithoutChangeset is deprecated and ignored");
    expect(output).toContain("pnpm changeset");
  });

  it("given a host no plugin covers, when the plan is asked, then it prints the unit file's own command and runs nothing", () => {
    const { status, output } = install().shiplane(["plan"]);

    expect(status).toBe(0);
    expect(output).toContain("api@1.0.0 → ./deploy.sh --fast  (not tagged yet: release first)");
    expect(output).toContain("      ./deploy.sh --fast");
    expect(output).toContain(
      "gh workflow run ship.yml --ref api@1.0.0 -f units=api -f environment=preview",
    );
  });

  it("given a unit file with a mistyped key, when any command runs, then it exits 2 naming the file, the line and the closest key", () => {
    const { status, output } = install(
      "module: backend-service\ndeploy: [./deploy.sh]\nulr: https://api.acme.dev\n",
    ).shiplane(["plan"]);

    expect(status).toBe(2);
    expect(output).toContain("apps/api/shiplane.unit.yml:3");
    expect(output).toContain('did you mean "url"?');
  });

  it("given the config composes a module, when its keys are asked, then each key the unit file takes is listed with its default", () => {
    const { status, output } = install().shiplane(["docs", "backend-service"]);

    expect(status).toBe(0);
    expect(output).toContain("module: backend-service  with shell");
    expect(output).toMatch(/deploy\s+The command that ships it/);
    expect(output).toMatch(/url\s+Where it answers/);
  });

  it("given the config injects its adapters, when the plugins are listed, then each port names the adapter the config gave it", () => {
    const { status, output } = install().shiplane(["plugins", "--json"]);

    expect(status).toBe(0);
    expect(JSON.parse(output)).toMatchObject({
      flow: { sourceControl: "fake", codeHost: "fake", ciPipeline: "fake", versioning: "fake" },
      modules: [{ name: "backend-service", provider: "shell", apps: ["api"] }],
    });
  });
});
