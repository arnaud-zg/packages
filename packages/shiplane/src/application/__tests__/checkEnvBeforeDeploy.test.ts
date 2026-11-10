import { describe, expect, it } from "vitest";

import type { EnvVarName } from "../../domain/checkEnvBeforeDeploy";
import type { Environment } from "../../domain/environment";
import type { PlatformEnvPort } from "../../ports/platform-env.port";
import { serverHostingFake } from "../../adapters/server-hosting/__fakes__/server-hosting.fake";
import { EnvToCheck, isEnvVarName } from "../../domain/checkEnvBeforeDeploy";
import { backendService } from "../../modules/backend-service/backend-service.module";
import { testContext, testUnit } from "../../testing/releaseContext";
import { checkEnvBeforeDeploy } from "../checkEnvBeforeDeploy";

const names = (...list: string[]) => list.filter(isEnvVarName);

const SET_THEM = "Are they set now?";

/** A platform holding names per environment; `later` is what it holds once the person set them. */
class PlatformEnvFake implements PlatformEnvPort {
  reads = 0;
  failures = 0;

  constructor(
    private held: Partial<Record<Environment, EnvVarName[]>>,
    private readonly later?: Partial<Record<Environment, EnvVarName[]>>,
  ) {}

  failNext(times: number) {
    this.failures = times;
    return this;
  }

  listNames = ({ environment }: { environment: Environment }) => {
    this.reads += 1;
    if (this.failures > 0) {
      this.failures -= 1;
      return Promise.reject(new Error("fly: not signed in"));
    }
    const now = new Set(this.held[environment] ?? []);
    if (this.later) this.held = this.later;
    return Promise.resolve(now);
  };

  setCommand = ({
    names: unset,
    options,
  }: {
    names: readonly EnvVarName[];
    options: Record<string, unknown>;
  }) =>
    `fly secrets set --stage -a ${String(options.service)} ${unset.map((name) => `${name}=...`).join(" ")}`;
}

const setUp = ({
  platform,
  toCheck = new EnvToCheck({
    all: names("SENTRY_DSN", "WAITLIST_CONFIRM_URL"),
    production: names("REVENUECAT_PROJECT_ID"),
  }),
  interactive = true,
  yes = false,
  withEnv = true,
}: {
  platform: PlatformEnvFake;
  toCheck?: EnvToCheck | null;
  interactive?: boolean;
  yes?: boolean;
  withEnv?: boolean;
}) => {
  const hosting = serverHostingFake();
  const adapter = withEnv ? { ...hosting, env: () => platform } : hosting;
  const api = testUnit("api", {
    module: "backend-service",
    options: { service: "acme-api" },
    ...(toCheck ? { checkEnvBeforeDeploy: toCheck } : {}),
  });
  const world = testContext({
    units: [api],
    modules: [backendService({ serverHosting: adapter })],
    interactive,
    yes,
  });
  const run = (environment: Environment) =>
    checkEnvBeforeDeploy(world.context, { environment, units: [api] });
  return { ...world, run };
};

describe("checking the env before a deploy", () => {
  it("given every listed name on the platform, when preview is checked, then the deploy goes on with one line and no question", async () => {
    const platform = new PlatformEnvFake({ preview: names("SENTRY_DSN", "WAITLIST_CONFIRM_URL") });
    const { run, output, prompter } = setUp({ platform });

    expect(await run("preview")).toBe(true);
    expect(output.text).toContain("Check env before deploy  api on preview: 2 of 2 set");
    expect(prompter.asked).toEqual([]);
  });

  it("given production adds its own name, when production is checked, then that name is checked too", async () => {
    const platform = new PlatformEnvFake({
      production: names("SENTRY_DSN", "WAITLIST_CONFIRM_URL"),
    });
    const { run, output } = setUp({ platform, interactive: false });

    expect(await run("production")).toBe(false);
    expect(output.text).toContain("REVENUECAT_PROJECT_ID");
  });

  it("given two names unset in a terminal, when the person sets them and says so, then the platform is read again and the deploy goes on", async () => {
    const platform = new PlatformEnvFake(
      { preview: [] },
      { preview: names("SENTRY_DSN", "WAITLIST_CONFIRM_URL") },
    );
    const { run, output, prompter } = setUp({ platform });
    prompter.answer(true);

    expect(await run("preview")).toBe(true);
    expect(output.text).toContain("api on preview: 2 unset env vars, the deploy waits");
    expect(output.text).toContain("You set these values; shiplane never does.");
    expect(output.text).toContain(
      "fly secrets set --stage -a acme-api SENTRY_DSN=... WAITLIST_CONFIRM_URL=...",
    );
    expect(prompter.asked).toEqual([SET_THEM]);
    expect(platform.reads).toBe(2);
  });

  it("given names unset in a terminal, when the person stops, then nothing deploys", async () => {
    const platform = new PlatformEnvFake({ preview: [] });
    const { run, prompter } = setUp({ platform });
    prompter.answer(false);

    expect(await run("preview")).toBe(false);
  });

  it("given names unset in CI, when checked, then the deploy stops with the command to run and asks nothing", async () => {
    const platform = new PlatformEnvFake({ preview: names("SENTRY_DSN") });
    const { run, output, prompter } = setUp({ platform, interactive: false });

    expect(await run("preview")).toBe(false);
    expect(output.text).toContain("Nothing was written. Set them, then run again:");
    expect(output.text).toContain("fly secrets set --stage -a acme-api WAITLIST_CONFIRM_URL=...");
    expect(prompter.asked).toEqual([]);
  });

  it("given names unset and --yes, when checked, then it stops like CI, since only a person can set a value", async () => {
    const platform = new PlatformEnvFake({ preview: [] });
    const { run, prompter } = setUp({ platform, yes: true });

    expect(await run("preview")).toBe(false);
    expect(prompter.asked).toEqual([]);
  });

  it("given a unit that lists nothing to check, when checked, then the platform is never read and nothing is printed", async () => {
    const platform = new PlatformEnvFake({ preview: [] });
    const { run, output } = setUp({ platform, toCheck: null });

    expect(await run("preview")).toBe(true);
    expect(platform.reads).toBe(0);
    expect(output.text).toBe("");
  });

  it("given a platform plugin that cannot list names, when checked, then it warns and the deploy goes on", async () => {
    const platform = new PlatformEnvFake({ preview: [] });
    const { run, output } = setUp({ platform, withEnv: false });

    expect(await run("preview")).toBe(true);
    expect(output.text).toContain("can't check env on fake");
  });

  it("given a platform that cannot be read in CI, when checked, then the deploy stops and nothing counts as set", async () => {
    const platform = new PlatformEnvFake({
      preview: names("SENTRY_DSN", "WAITLIST_CONFIRM_URL"),
    }).failNext(1);
    const { run, output } = setUp({ platform, interactive: false });

    expect(await run("preview")).toBe(false);
    expect(output.text).toContain("fly: not signed in");
  });

  it("given a platform that cannot be read in a terminal, when the person retries, then it reads again", async () => {
    const platform = new PlatformEnvFake({
      preview: names("SENTRY_DSN", "WAITLIST_CONFIRM_URL"),
    }).failNext(1);
    const { run, prompter } = setUp({ platform });
    prompter.answer(true);

    expect(await run("preview")).toBe(true);
    expect(prompter.asked).toEqual(["Read the platform again?"]);
  });
});
