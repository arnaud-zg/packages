import { describe, expect, it } from "vitest";

import type { EnvVarName } from "../checkEnvBeforeDeploy";
import { EnvToCheck, findUnset, isEnvVarName } from "../checkEnvBeforeDeploy";

const names = (...list: string[]) => list.filter(isEnvVarName);

describe("the env a deploy checks on the platform", () => {
  it("given one list, when read for each environment, then every environment checks the same names", () => {
    const toCheck = new EnvToCheck(names("SENTRY_DSN", "DATABASE_URL"));

    expect([...toCheck.for("preview")]).toEqual(["SENTRY_DSN", "DATABASE_URL"]);
    expect([...toCheck.for("production")]).toEqual(["SENTRY_DSN", "DATABASE_URL"]);
  });

  it("given all plus a list per environment, when read for production, then it checks all and production's extras only", () => {
    const toCheck = new EnvToCheck({
      all: names("SENTRY_DSN"),
      preview: names("DISABLE_PLANT_IMAGE_WRITES"),
      production: names("REVENUECAT_PROJECT_ID"),
    });

    expect([...toCheck.for("production")]).toEqual(["SENTRY_DSN", "REVENUECAT_PROJECT_ID"]);
  });

  it("given only all, when read for an environment with no list of its own, then it inherits all", () => {
    const toCheck = new EnvToCheck({ all: names("SENTRY_DSN") });

    expect([...toCheck.for("preview")]).toEqual(["SENTRY_DSN"]);
  });

  it("given a name in all and in an environment list, when read, then it is reported as listed twice", () => {
    const toCheck = new EnvToCheck({ all: names("SENTRY_DSN"), production: names("SENTRY_DSN") });

    expect(toCheck.listedTwice()).toEqual(["SENTRY_DSN"]);
  });

  it("given lowercase or dashed text, when checked, then it is not an env var name", () => {
    expect(["sentry_dsn", "SENTRY-DSN", "1_KEY", "SENTRY_DSN"].filter(isEnvVarName)).toEqual([
      "SENTRY_DSN",
    ]);
  });
});

describe("the env vars a platform is missing", () => {
  const expected = new Set(
    names("SENTRY_DSN", "WAITLIST_CONFIRM_URL", "CLOUDFLARE_R2_BUCKET_NAME"),
  );

  it("given a platform that holds every name, when compared, then nothing is unset", () => {
    expect(findUnset({ expected, setOnPlatform: expected }).isEmpty()).toBe(true);
  });

  it("given a platform missing two names, when compared, then those two are unset, in the listed order", () => {
    const setOnPlatform = new Set<EnvVarName>(names("CLOUDFLARE_R2_BUCKET_NAME", "OLD_KEY"));

    expect(findUnset({ expected, setOnPlatform }).names()).toEqual([
      "SENTRY_DSN",
      "WAITLIST_CONFIRM_URL",
    ]);
  });
});
