import type {
  DecideContext,
  Decision,
  DeliveryAdapter,
  Job,
  JobInput,
  PackageRegistryPort,
  Resolved,
} from "shiplane/plugin";
import { definePackageRegistry, onlyVersionFiles, perEnv, z } from "shiplane/plugin";

const NpmOptions = z.object({
  publishAs: z
    .string()
    .optional()
    .describe("The name it publishes under, when its workspace name is not a valid npm name"),
  access: z.enum(["public", "restricted"]).default("public").describe("Who can install it"),
  tag: perEnv(z.string())
    .default({ preview: "latest", production: "latest" })
    .describe(
      "The dist-tag each environment moves: { preview: next, production: latest } to stage",
    ),
});

type Options = Resolved<z.output<typeof NpmOptions>>;

const ManifestSchema = z.object({
  private: z.boolean().optional(),
  bin: z.unknown().optional(),
  exports: z.unknown().optional(),
  main: z.unknown().optional(),
});

const nameOf = ({ unit, options }: JobInput<Options>) => options.publishAs ?? unit.packageName;

const published = async (context: DecideContext, name: string, version: string) => {
  const result = await context.shell.capture("npm", ["view", `${name}@${version}`, "version"]);
  return result.status === 0 && result.stdout.trim() === version;
};

const distTags = async (context: DecideContext, name: string) => {
  const result = await context.shell.capture("npm", ["view", name, "dist-tags", "--json"]);
  const parsed = z
    .record(z.string(), z.string())
    .safeParse(result.status === 0 ? JSON.parse(result.stdout || "{}") : {});
  return parsed.success ? parsed.data : {};
};

/** Publish the version under the environment's tag, renamed for the registry and back after. */
const publishJob = (input: JobInput<Options>): Job => {
  const { unit, options } = input;
  const name = nameOf(input);
  const rename = (to: string) => ({
    command: "npm",
    args: ["pkg", "set", `name=${to}`],
    cwd: unit.dir,
  });
  return {
    label: `publish ${name}@${unit.version} under ${options.tag}`,
    local: [
      ...(options.publishAs ? [rename(options.publishAs)] : []),
      {
        command: "pnpm",
        args: ["publish", "--no-git-checks", "--access", options.access, "--tag", options.tag],
        cwd: unit.dir,
      },
    ],
    ...(options.publishAs ? { cleanup: [rename(unit.packageName)] } : {}),
  };
};

const moveTagJob = (input: JobInput<Options>): Job => ({
  label: `move ${input.options.tag} to ${nameOf(input)}@${input.unit.version}`,
  local: [
    {
      command: "npm",
      args: ["dist-tag", "add", `${nameOf(input)}@${input.unit.version}`, input.options.tag],
    },
  ],
});

const decide = async (context: DecideContext, input: JobInput<Options>): Promise<Decision> => {
  const { unit, tag, environment, options } = input;
  const name = nameOf(input);
  const tagged = await context.sourceControl.tagCommit(tag);
  if (!tagged) return { action: "none", status: "not released yet" };
  if (!(await published(context, name, unit.version))) {
    if (environment === "production") {
      return { action: "none", status: "not on npm yet: ship it to preview first" };
    }
    // npm publishes this checkout: it has to be the code the tag named.
    const changed = await context.sourceControl.diffNames(tagged, input.commit);
    if (!onlyVersionFiles(changed, context.versionFiles)) {
      return {
        action: "fail",
        title: `main moved past ${tag}`,
        detail: "npm publishes this checkout, which now holds code no release named.",
        commands: [`git switch --detach ${tag}`, "shiplane ship"],
      };
    }
    return { action: "ship", kind: "publish", jobs: [publishJob(input)] };
  }
  const tags = await distTags(context, name);
  return tags[options.tag] === unit.version
    ? { action: "none", status: `on npm under ${options.tag}` }
    : { action: "ship", kind: "publish", jobs: [moveTagJob(input)] };
};

const live = async (context: DecideContext, input: JobInput<Options>) => {
  const name = nameOf(input);
  if (!(await published(context, name, input.unit.version))) return false;
  return (await distTags(context, name))[input.options.tag] === input.unit.version;
};

/**
 * A package on npm. A release publishes the version straight under `latest`; with
 * `tag: { preview: next, production: latest }`, preview publishes under `next` and production moves
 * `latest` to it, never publishing twice.
 */
export type NpmPackageRegistryAdapter = DeliveryAdapter<PackageRegistryPort>;

export const npmPackageRegistry = (): NpmPackageRegistryAdapter =>
  definePackageRegistry({
    name: "npm",
    settings: NpmOptions,
    describe: (input) => `${nameOf(input)} on npm (${input.options.tag})`,
    jobs: (input) => [publishJob(input), moveTagJob(input)],
    decide,
    live,
    detect: (folder) => {
      const manifest = ManifestSchema.safeParse(JSON.parse(folder.read("package.json") ?? "{}"));
      if (!manifest.success || manifest.data.private) return null;
      const entry = (["bin", "exports", "main"] as const).find(
        (key) => manifest.data[key] !== undefined,
      );
      return entry
        ? { certainty: "found", reason: `package.json, public, ${entry}`, options: {} }
        : null;
    },
    requirements: () => [
      {
        label: "npm",
        check: { command: "npm", args: ["whoami"] },
        fix: { command: "npm", args: ["login"] },
      },
    ],
  });
