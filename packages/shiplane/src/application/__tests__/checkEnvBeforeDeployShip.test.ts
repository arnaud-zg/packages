import { describe, expect, it } from "vitest";

import type { PlannedChangeset } from "../../domain/changes";
import type { EnvVarName } from "../../domain/checkEnvBeforeDeploy";
import { serverHostingFake } from "../../adapters/server-hosting/__fakes__/server-hosting.fake";
import { EnvToCheck, isEnvVarName } from "../../domain/checkEnvBeforeDeploy";
import { backendService } from "../../modules/backend-service/backend-service.module";
import { planFrom } from "../../testing/plans";
import { changesetText, testContext, testUnit } from "../../testing/releaseContext";
import { releaseToPreview } from "../releaseToPreview";
import { shipTo } from "../ship";

const names = (...list: string[]) => list.filter(isEnvVarName);

const SENTRY: PlannedChangeset = {
  id: "sentry",
  summary: "Errors reach Sentry.",
  releases: [{ name: "@acme/api", type: "patch" }],
};

/** A platform that holds the same names on every environment. */
const platformHolding = (held: EnvVarName[]) => ({
  listNames: () => Promise.resolve(new Set(held)),
  setCommand: ({ names: unset }: { names: readonly EnvVarName[] }) =>
    `fly secrets set --stage -a acme-api ${unset.map((name) => `${name}=...`).join(" ")}`,
});

const setUp = (held: EnvVarName[], { yes = false }: { yes?: boolean } = {}) => {
  const hosting = serverHostingFake();
  const api = testUnit("api", {
    version: "0.1.0",
    module: "backend-service",
    options: { service: "acme-api" },
    checkEnvBeforeDeploy: new EnvToCheck(names("SENTRY_DSN")),
  });
  const world = testContext({
    units: [api],
    modules: [backendService({ serverHosting: { ...hosting, env: () => platformHolding(held) } })],
    interactive: false,
    yes,
  });
  world.source.seed({ tags: { "api@0.1.0": "t1" } });
  return { ...world, hosting: hosting.fake };
};

describe("a deploy with env to check", () => {
  it("given SENTRY_DSN unset on the platform, when api ships to preview from CI with --yes, then nothing runs", async () => {
    const { context, shell, output } = setUp([], { yes: true });

    expect(await shipTo(context, "preview", { via: "local" })).toBe(false);
    expect(shell.calls).toEqual([]);
    expect(output.text).toContain("SENTRY_DSN");
  });

  it("given SENTRY_DSN set on the platform, when api ships to preview from CI with --yes, then it deploys as before", async () => {
    const { context, shell } = setUp(names("SENTRY_DSN"), { yes: true });

    expect(await shipTo(context, "preview", { via: "local" })).toBe(true);
    expect(shell.calls.map(({ args }) => args)).toContainEqual(["deploy", "acme-api", "api@0.1.0"]);
  });

  it("given SENTRY_DSN unset and a changeset to release, when releasing to preview, then it stops before the release PR is opened", async () => {
    const world = setUp([]);
    world.versioning.seed({
      pending: [{ id: SENTRY.id, text: changesetText({ "@acme/api": "patch" }, SENTRY.summary) }],
      plan: planFrom([SENTRY], { "@acme/api": "0.1.0" }),
    });

    expect(await releaseToPreview(world.context)).toBe(false);
    expect(world.output.text).toContain("api on preview: 1 unset env vars");
    expect(world.host.received).toEqual([]);
  });
});
