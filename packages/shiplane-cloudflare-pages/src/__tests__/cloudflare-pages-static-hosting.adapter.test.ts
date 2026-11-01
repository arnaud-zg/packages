import { RecordingShell, testUnit } from "shiplane/testing";
import { describe, expect, it } from "vitest";

import { cloudflarePagesStaticHosting } from "../cloudflare-pages-static-hosting.adapter";

const pages = cloudflarePagesStaticHosting();

type Folder = Parameters<NonNullable<typeof pages.detect>>[0];

const folder = (files: Record<string, string>): Folder => ({
  dir: "apps/site",
  name: "site",
  files: Object.keys(files),
  has: (file) => file in files,
  read: (file) => files[file] ?? null,
});

describe("recognising a site Cloudflare Pages ships", () => {
  it("given a wrangler.jsonc, when init looks at the folder, then it is found with the project it names", () => {
    expect(pages.detect?.(folder({ "wrangler.jsonc": '{ "name": "acme-site" }' }))).toEqual({
      certainty: "found",
      reason: "wrangler.jsonc",
      options: { project: "acme-site" },
    });
  });

  it("given a Vite config with an index.html, when init looks at the folder, then it is likely a site", () => {
    const found = pages.detect?.(
      folder({ "vite.config.ts": "export default {}", "index.html": "<!doctype html>" }),
    );

    expect(found?.certainty).toBe("likely");
  });

  it("given a Vite config with no index.html, when init looks at the folder, then it is only possibly a site, since it is usually a library", () => {
    expect(pages.detect?.(folder({ "vite.config.ts": "export default {}" }))?.certainty).toBe(
      "possible",
    );
  });
});

describe("building and uploading to Cloudflare Pages", () => {
  const port = pages.create({ root: "/repo", shell: new RecordingShell() });
  const unit = testUnit("site", { module: "web-app" });
  const jobFor = (build: { command?: string[]; env?: Record<string, string> }) =>
    port.jobs({
      unit,
      tag: "site@1.0.0",
      environment: "preview",
      commit: "abc1234",
      options: {
        project: "acme-site",
        dist: "dist",
        build,
        branch: "preview",
        wrangler: "wrangler@4.141.0",
      },
    })[0];

  it("given a build command of its own, when the job is built, then that command builds the site instead of turbo", () => {
    expect(jobFor({ command: ["pnpm", "--filter", "site", "build"] })?.local[0]).toMatchObject({
      command: "pnpm",
      args: ["--filter", "site", "build"],
    });
  });

  it("given variables the build reads, when the job is built, then the build gets them and the upload names the commit and tag", () => {
    const job = jobFor({ env: { PUBLIC_API_URL: "https://api-preview.acme.dev" } });

    expect(job?.local[0]?.env).toEqual({ PUBLIC_API_URL: "https://api-preview.acme.dev" });
    expect(job?.local[1]?.args).toEqual(
      expect.arrayContaining(["--commit-hash=abc1234", "--commit-message=site@1.0.0"]),
    );
  });
});
