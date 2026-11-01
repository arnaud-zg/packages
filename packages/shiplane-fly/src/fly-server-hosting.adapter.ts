import path from "node:path";
import type { DeliveryAdapter, ServerHostingPort } from "shiplane/plugin";
import { defineServerHosting, perEnv, z } from "shiplane/plugin";

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

/** Any Dockerfile on Fly.io: `flyctl deploy`, from this machine or the ship workflow on CI. */
export type FlyServerHostingAdapter = DeliveryAdapter<ServerHostingPort>;

export const flyServerHosting = (): FlyServerHostingAdapter =>
  defineServerHosting({
    name: "fly",
    settings: FlyOptions,
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
