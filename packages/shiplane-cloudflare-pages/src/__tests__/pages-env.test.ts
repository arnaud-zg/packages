import { isEnvVarName } from "shiplane/plugin";
import { RecordingShell, testUnit } from "shiplane/testing";
import { describe, expect, it } from "vitest";

import { cloudflarePagesStaticHosting } from "../cloudflare-pages-static-hosting.adapter";

const unit = testUnit("admin", { module: "web-app", dir: "apps/admin" });
const names = (...list: string[]) => list.filter(isEnvVarName);

const options = {
  project: "acme-admin",
  build: { env: { VITE_API_URL: "https://api-preview.example.com" } },
};

const envOf = (shell: RecordingShell) => {
  const env = cloudflarePagesStaticHosting().env;
  if (!env) throw new Error("the Pages adapter lists no env");
  return env({ root: "/repo", shell });
};

describe("the env Cloudflare Pages holds for a site", () => {
  it("given a secret on the preview environment and a build variable in the unit file, when listed, then both are names", async () => {
    const shell = new RecordingShell().seed("npx --yes wrangler@4.141.0 pages secret list", {
      stdout:
        'The "preview" environment of your Pages project "acme-admin" has access to the following secrets:\n  - TURNSTILE_SECRET: Value Encrypted\n',
    });

    const listed = await envOf(shell).listNames({ unit, environment: "preview", options });

    expect([...listed]).toEqual(["TURNSTILE_SECRET", "VITE_API_URL"]);
    expect(shell.calls[0]?.args).toEqual([
      "--yes",
      "wrangler@4.141.0",
      "pages",
      "secret",
      "list",
      "--project-name",
      "acme-admin",
      "--env",
      "preview",
    ]);
  });

  it("given wrangler is not signed in, when listed, then it fails naming the command and the reason", async () => {
    const shell = new RecordingShell().seed("npx --yes wrangler@4.141.0 pages secret list", {
      status: 1,
      stderr: "\n✘ [ERROR] You are not logged in\n",
    });

    await expect(
      envOf(shell).listNames({ unit, environment: "production", options }),
    ).rejects.toThrow(
      "wrangler pages secret list --env production: ✘ [ERROR] You are not logged in",
    );
  });

  it("given an unset name, when the set command is printed, then wrangler puts it on that environment of the project", () => {
    const command = envOf(new RecordingShell()).setCommand({
      unit,
      environment: "production",
      options,
      names: names("TURNSTILE_SECRET"),
    });

    expect(command).toBe(
      "npx --yes wrangler@4.141.0 pages secret put TURNSTILE_SECRET --project-name acme-admin --env production",
    );
  });
});
