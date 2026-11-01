import type { Environment, Shell } from "shiplane/plugin";
import { z } from "shiplane/plugin";

import type { Platform, RunningBuild, ShippedBuild } from "./policy";

// eas-cli prints notices around its JSON: keep the outermost JSON value only.
const parseEasJson = (output: string): unknown => {
  const start = output.search(/[[{]/);
  const end = Math.max(output.lastIndexOf("]"), output.lastIndexOf("}"));
  return JSON.parse(output.slice(start, end + 1));
};

const SourceSchema = z.object({
  type: z.string(),
  filePath: z.string().optional(),
  id: z.string().optional(),
  hash: z.string().nullish(),
});
const FingerprintSchema = z.object({ hash: z.string(), sources: z.array(SourceSchema) });
const EasBuildSchema = z.object({
  id: z.string(),
  status: z.string(),
  buildProfile: z.string().nullish(),
  isForIosSimulator: z.boolean().nullish(),
  appVersion: z.string().nullish(),
  appBuildVersion: z.string().nullish(),
  gitCommitHash: z.string().nullish(),
  createdAt: z.string(),
  fingerprint: z.object({ hash: z.string() }).nullish(),
});
const UpdateListSchema = z.object({
  currentPage: z.array(
    // EAS lists rolloutPercentage only while a rollout holds the group back from part of the channel.
    z.object({ group: z.string(), rolloutPercentage: z.number().optional() }),
  ),
});
const UpdateViewSchema = z.array(
  z.object({ gitCommitHash: z.string().nullish(), createdAt: z.string().nullish() }),
);
const UpdateInsightsSchema = z.object({
  platforms: z.array(
    z.object({
      platform: z.enum(["ios", "android"]),
      totals: z.object({ installs: z.number(), failedInstalls: z.number() }),
    }),
  ),
});

const RUNNING = new Set(["NEW", "IN_QUEUE", "IN_PROGRESS"]);

// eas-cli rejects --non-interactive on these commands as a nonexistent flag.
const WITHOUT_NON_INTERACTIVE_FLAG = new Set(["update:view"]);

// The first stderr line is often eas-cli's upgrade notice: report its own error line instead.
const failureReason = (stderr: string): string => {
  const lines = stderr
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.find((line) => line.startsWith("Error:")) ?? lines.at(-1) ?? "";
};

/** The eas CLI, run in the app's folder with its environment as APP_VARIANT. */
export const easClient = (shell: Shell, cwd: string) => {
  const eas = async (args: string[], environment: Environment): Promise<unknown> => {
    const command = args[0] ?? "";
    const flags = WITHOUT_NON_INTERACTIVE_FLAG.has(command)
      ? ["--json"]
      : ["--json", "--non-interactive"];
    const { status, stdout, stderr } = await shell.capture(
      "pnpm",
      ["exec", "eas", ...args, ...flags],
      {
        cwd,
        env: { APP_VARIANT: environment },
      },
    );
    if (status !== 0) {
      throw new Error(`eas ${command} exited with ${status}: ${failureReason(stderr)}`);
    }
    return parseEasJson(stdout);
  };

  return {
    localFingerprint: async (platform: Platform, environment: Environment) =>
      FingerprintSchema.parse(
        await eas(["fingerprint:generate", "--platform", platform], environment),
      ).hash,

    // The simulator profile shares the preview channel: only the channel's own store profile counts.
    channelBuilds: async (platform: Platform, environment: Environment) => {
      const builds = z
        .array(EasBuildSchema)
        .parse(await eas(["build:list", "--platform", platform, "--limit", "30"], environment))
        .filter((build) => build.buildProfile === environment && !build.isForIosSimulator);
      const finished = builds.find((build) => build.status === "FINISHED");
      const running = builds.find((build) => RUNNING.has(build.status));
      return {
        shipped: finished
          ? ({
              id: finished.id,
              appVersion: finished.appVersion ?? null,
              buildNumber: finished.appBuildVersion ?? null,
              fingerprint: finished.fingerprint?.hash ?? null,
              gitCommit: finished.gitCommitHash ?? null,
              createdAt: finished.createdAt,
            } satisfies ShippedBuild)
          : null,
        running: running
          ? ({
              id: running.id,
              appVersion: running.appVersion ?? null,
              buildNumber: running.appBuildVersion ?? null,
            } satisfies RunningBuild)
          : null,
      };
    },

    // What differs between the last build's native layer and this commit's, for a "native changed".
    nativeChanges: async (buildId: string, environment: Environment): Promise<string[]> => {
      const { fingerprint1, fingerprint2 } = z
        .object({ fingerprint1: FingerprintSchema, fingerprint2: FingerprintSchema })
        .parse(await eas(["fingerprint:compare", "--build-id", buildId], environment));
      type Source = z.infer<typeof SourceSchema>;
      const key = (source: Source) => `${source.type}:${source.filePath ?? source.id ?? ""}`;
      const label = (source: Source) =>
        (source.filePath ?? source.id ?? source.type).replace(/^(\.\.\/)+/, "");
      const before = new Map(fingerprint1.sources.map((source) => [key(source), source]));
      const after = new Map(fingerprint2.sources.map((source) => [key(source), source]));
      return [
        ...[...after].flatMap(([id, source]) => {
          const old = before.get(id);
          if (!old) return [`+ ${label(source)}`];
          return old.hash === source.hash ? [] : [`~ ${label(source)}`];
        }),
        ...[...before].flatMap(([id, source]) => (after.has(id) ? [] : [`- ${label(source)}`])),
      ];
    },

    /** The newest update group on the channel, with the share of people it reaches. */
    lastUpdate: async (
      environment: Environment,
    ): Promise<{ group: string; rolloutPercentage: number } | null> => {
      const { currentPage } = UpdateListSchema.parse(
        await eas(["update:list", "--branch", environment, "--limit", "1"], environment),
      );
      const [last] = currentPage;
      return last ? { group: last.group, rolloutPercentage: last.rolloutPercentage ?? 100 } : null;
    },

    /** Each platform's launches of an update group over the last 7 days, and the failed ones. */
    updateLaunches: async (group: string, environment: Environment) =>
      UpdateInsightsSchema.parse(await eas(["update:insights", group], environment)).platforms.map(
        ({ platform, totals }) => ({ platform, ...totals }),
      ),

    /** The commit an update group was made from, and when it was published. */
    updateOrigin: async (group: string, environment: Environment) => {
      const [first] = UpdateViewSchema.parse(await eas(["update:view", group], environment));
      return { commit: first?.gitCommitHash ?? null, createdAt: first?.createdAt ?? null };
    },
  };
};
