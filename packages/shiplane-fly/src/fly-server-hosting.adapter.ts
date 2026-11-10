import fs from "node:fs";
import path from "node:path";
import type {
  AdapterContext,
  DeliveryAdapter,
  PlatformEnvPort,
  ServerHostingPort,
} from "shiplane/plugin";
import { defineServerHosting, isEnvVarName, perEnv, z } from "shiplane/plugin";

const FlyOptions = z.object({
  app: perEnv(z.string()).describe("The Fly app, per environment"),
  config: perEnv(z.string())
    .default("fly.toml")
    .describe("Its fly.toml, relative to the unit's folder"),
  dockerfile: z
    .string()
    .default("Dockerfile")
    .describe("Relative to the unit's folder; the image builds from the repository root"),
  url: perEnv(z.string()).optional().describe("Where it answers, for other units to read"),
  buildSecrets: z
    .array(z.string())
    .default([])
    .describe("Variables its image build reads as secrets, passed by name when set"),
});

// The settings of one environment, as the env check receives them.
const FlyTarget = z.object({ app: z.string(), config: z.string().default("fly.toml") });

// Older flyctl printed `Name`, current prints `name`.
const FlySecrets = z.array(
  z.union([z.object({ name: z.string() }), z.object({ Name: z.string() })]),
);

/** Keys of a fly.toml's `[env]` block: variables Fly sets next to its secrets. */
const tomlEnvKeys = (toml: string): string[] => {
  const lines = toml.split("\n");
  const start = lines.findIndex((line) => line.trim() === "[env]");
  if (start === -1) return [];
  const block = lines.slice(start + 1);
  const end = block.findIndex((line) => /^\s*\[/.test(line));
  return (end === -1 ? block : block.slice(0, end)).flatMap((line) => {
    const key = /^\s*([A-Z_][A-Z0-9_]*)\s*=/.exec(line)?.[1];
    return key ? [key] : [];
  });
};

const readToml = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "");

/** Secrets of the Fly app plus its toml's `[env]` keys; values are never read. */
const flyEnv = ({ root, shell }: AdapterContext): PlatformEnvPort => ({
  listNames: async ({ unit, options }) => {
    const { app, config } = FlyTarget.parse(options);
    const args = ["secrets", "list", "-a", app, "--json"];
    const result = await shell.capture("flyctl", args);
    if (result.status !== 0) {
      const reason =
        result.stderr.split("\n").find((line) => line.trim()) ?? `exit ${result.status}`;
      throw new Error(`flyctl secrets list -a ${app}: ${reason.trim()}`);
    }
    const secrets = FlySecrets.parse(JSON.parse(result.stdout)).map((secret) =>
      "name" in secret ? secret.name : secret.Name,
    );
    const toml = tomlEnvKeys(readToml(path.join(root, unit.dir, config)));
    return new Set([...secrets, ...toml].filter(isEnvVarName));
  },
  // --stage: the next deploy applies them, instead of a restart now.
  setCommand: ({ options, names }) =>
    `flyctl secrets set --stage -a ${FlyTarget.parse(options).app} ${names.map((name) => `${name}=...`).join(" ")}`,
});

/** Any Dockerfile on Fly.io: `flyctl deploy`, from this machine or the ship workflow on CI. */
export type FlyServerHostingAdapter = DeliveryAdapter<ServerHostingPort>;

export const flyServerHosting = (): FlyServerHostingAdapter =>
  defineServerHosting({
    name: "fly",
    settings: FlyOptions,
    env: flyEnv,
    // The ship workflow typechecks before Fly builds the image remotely.
    typicalMinutes: 13,
    describe: ({ options }) => `${options.app} (Fly)`,
    detect: (folder) => {
      const tomls = folder.files.filter((file) => /^fly(-[\w]+)?\.toml$/.test(file)).sort();
      if (tomls.length === 0) {
        return folder.has("Dockerfile")
          ? { certainty: "possible", reason: "Dockerfile", options: {} }
          : null;
      }
      const appOf = (file: string) => /^app\s*=\s*"([^"]+)"/m.exec(folder.read(file) ?? "")?.[1];
      const perEnvironment = ["fly-preview.toml", "fly-production.toml"].every((file) =>
        tomls.includes(file),
      );
      const options = perEnvironment
        ? {
            app: { preview: appOf("fly-preview.toml"), production: appOf("fly-production.toml") },
            config: { preview: "fly-preview.toml", production: "fly-production.toml" },
          }
        : {
            app: appOf(tomls[0] ?? "fly.toml"),
            ...(tomls[0] === "fly.toml" ? {} : { config: tomls[0] }),
          };
      return { certainty: "found", reason: tomls.join(", "), options };
    },
    questions: (folder, found, repository) =>
      found.app === undefined
        ? [{ key: "app", message: "Fly app?", initial: `${repository}-${folder.name}` }]
        : [],
    requirements: () => [
      {
        label: "flyctl",
        check: { command: "flyctl", args: ["auth", "whoami"] },
        fix: { command: "flyctl", args: ["auth", "login"] },
      },
    ],
    jobs: ({ unit, tag, options }) => [
      {
        label: `deploy ${tag} to ${options.app} (Fly)`,
        local: [
          {
            command: "flyctl",
            args: [
              "deploy",
              "--remote-only",
              // No --detach: the deploy is recorded as done, so it waits until the machines run it.
              "--config",
              path.posix.join(unit.dir, options.config),
              "--dockerfile",
              path.posix.join(unit.dir, options.dockerfile),
            ],
            secrets: options.buildSecrets.map((name) => ({ flag: "--build-secret", name })),
          },
        ],
        ci: { ref: tag },
        record: true,
      },
    ],
  });
