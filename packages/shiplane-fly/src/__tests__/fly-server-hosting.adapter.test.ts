import { RecordingShell, testUnit } from "shiplane/testing";
import { describe, expect, it } from "vitest";

import { flyServerHosting } from "../fly-server-hosting.adapter";

const fly = flyServerHosting();

type Folder = Parameters<NonNullable<typeof fly.detect>>[0];

const folder = (files: Record<string, string>): Folder => ({
  dir: "apps/api",
  name: "api",
  files: Object.keys(files),
  has: (file) => file in files,
  read: (file) => files[file] ?? null,
});

describe("recognising an app Fly ships", () => {
  it("given one fly.toml, when init looks at the folder, then it is found with the app the toml names", () => {
    expect(fly.detect?.(folder({ "fly.toml": 'app = "acme-api"\n' }))).toEqual({
      certainty: "found",
      reason: "fly.toml",
      options: { app: "acme-api" },
    });
  });

  it("given a toml per environment, when init looks at the folder, then each environment gets its own app and toml", () => {
    const found = fly.detect?.(
      folder({
        "fly-preview.toml": 'app = "acme-api-preview"\n',
        "fly-production.toml": 'app = "acme-api"\n',
      }),
    );

    expect(found?.options).toEqual({
      app: { preview: "acme-api-preview", production: "acme-api" },
      config: { preview: "fly-preview.toml", production: "fly-production.toml" },
    });
  });

  it("given a Dockerfile and no fly.toml, when init looks at the folder, then Fly is only a possibility", () => {
    expect(fly.detect?.(folder({ Dockerfile: "FROM node:24\n" }))?.certainty).toBe("possible");
  });
});

describe("deploying to Fly", () => {
  const port = fly.create({ root: "/repo", shell: new RecordingShell() });

  it("given build secrets, when the deploy job is built, then each is passed by name and never by value", () => {
    const unit = testUnit("api", { module: "backend-service" });
    const [job] = port.jobs({
      unit,
      tag: "api@1.0.0",
      environment: "preview",
      commit: "abc1234",
      options: {
        app: "acme-api-preview",
        config: "fly.toml",
        dockerfile: "Dockerfile",
        buildSecrets: ["SENTRY_AUTH_TOKEN"],
      },
    });

    expect(job?.local[0]?.secrets).toEqual([{ flag: "--build-secret", name: "SENTRY_AUTH_TOKEN" }]);
    expect(job?.record).toBe(true);
  });
});
