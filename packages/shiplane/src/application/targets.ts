import path from "node:path";

import type { Environment } from "../domain/environment";
import type { ReleaseUnit } from "../domain/unit";
import type { AfterShipContext, AppInput, ReleaseModule } from "../modules/module";
import type { Command, DecideContext, Job } from "../ports/delivery.port";
import type { ReleaseContext } from "./context";
import { changesReaching, codeFolders } from "../domain/codeScope";
import { optionsFor } from "./config/optionsFor";

/** The module that ships an app: the one its unit file names. */
export const moduleOf = ({ release }: ReleaseContext, unit: ReleaseUnit) =>
  release.modules.find(({ name }) => name === unit.module);

/** An app's settings for an environment, its module's defaults applied first. */
export const resolvedOptions = (
  module: ReleaseModule,
  unit: ReleaseUnit,
  environment: Environment,
  units: readonly ReleaseUnit[],
): Record<string, unknown> => {
  const withDefaults = module.settings.parse(unit.options);
  return optionsFor({ ...unit, options: withDefaults }, environment, units);
};

/** What a module's stages are told about one app's tag. */
export const jobInput = (
  context: ReleaseContext,
  module: ReleaseModule,
  unit: ReleaseUnit,
  { tag, environment, commit }: { tag: string; environment: Environment; commit: string },
): AppInput => ({
  unit,
  tag,
  environment,
  commit,
  options: resolvedOptions(module, unit, environment, context.release.units),
});

/** Where a tag lands and the jobs that ship it, as its module says. */
export const shipPlanOf = (context: ReleaseContext, module: ReleaseModule, input: AppInput) =>
  module.ship(decideContext(context), input);

/** Every file a release may move after a tag without changing what ships. */
export const versionFiles = (context: ReleaseContext) =>
  new Set(
    context.release.units.flatMap(
      (unit) =>
        moduleOf(context, unit)?.versionFiles?.(unit, context.release.units, context.open) ?? [],
    ),
  );

/** A command as a person would type it, variables first, secrets by name only. */
export const commandLine = ({ command, args, env, secrets }: Command) =>
  [
    ...Object.entries(env ?? {}).map(([key, value]) => `${key}=${value}`),
    command,
    ...args,
    ...(secrets ?? []).flatMap(({ flag, name }) => [flag, `${name}=$${name}`]),
  ].join(" ");

/** Runs a job's commands here in order, then records the deploy. Throws on the first failure. */
export const runHere = async (
  { shell, services, release, output }: ReleaseContext,
  job: Job,
  { tag, environment }: { tag: string; environment: Environment },
) => {
  const secretArgs = (step: Command) =>
    (step.secrets ?? []).flatMap(({ flag, name }) => {
      const value = shell.env(name);
      if (value) return [flag, `${name}=${value}`];
      output.line(`  ! ${name} is not set: ${flag} left out`);
      return [];
    });
  const run = (step: Command) =>
    shell.attach(step.command, [...step.args, ...secretArgs(step)], {
      cwd: path.join(release.root, step.cwd ?? ""),
      env: step.env,
    });
  try {
    for (const step of job.local) {
      const status = await run(step);
      if (status !== 0) throw new Error(`${step.command} exited with ${status}`);
    }
  } finally {
    for (const step of job.cleanup ?? []) await run(step);
  }
  if (job.record) await services.codeHost.recordDeployment(tag, environment);
};

/** Dispatches the ship workflow on a ref for its units and returns at once: the runner ships them. */
export const dispatchShip = async (
  { services }: ReleaseContext,
  { ref, units }: { ref: string; units: readonly string[] },
  environment: Environment,
) =>
  services.ciPipeline.dispatch(services.ciPipeline.shipWorkflow, ref, {
    units: units.join(" "),
    environment,
  });

/** Which changed files can reach what a unit ships. */
const reaching = async (context: ReleaseContext, unit: ReleaseUnit) => {
  const { versioning } = context.services;
  const [dependencies, folders] = await Promise.all([
    versioning.dependencies(),
    versioning.folders(),
  ]);
  const scope = {
    own: [unit.dir, ...codeFolders(unit.packageName, dependencies, folders)],
    workspace: Object.values(folders),
    versionFiles: versionFiles(context),
  };
  return (files: readonly string[]) => changesReaching(files, scope);
};

/** What a module's per-app stages may read and run. */
export const decideContext = (context: ReleaseContext): DecideContext => ({
  root: context.release.root,
  shell: context.shell,
  sourceControl: context.services.sourceControl,
  codeHost: context.services.codeHost,
  ciPipeline: context.services.ciPipeline,
  units: context.release.units,
  tagFormat: context.release.tagFormat,
  versionFiles: versionFiles(context),
  now: () => context.clock.now(),
  open: context.open,
  changedCode: async (unit, from, to) => {
    const [files, filter] = await Promise.all([
      context.services.sourceControl.diffNames(from, to),
      reaching(context, unit),
    ]);
    return filter(files);
  },
});

/** What a module may read once apps ship. */
export const afterShipContext = (context: ReleaseContext): AfterShipContext => ({
  open: context.open,
  tagFormat: context.release.tagFormat,
  subjectsReaching: async (unit, from, to) => {
    const [commits, filter] = await Promise.all([
      context.services.sourceControl.commitsBetween(from, to),
      reaching(context, unit),
    ]);
    return commits.filter(({ files }) => filter(files).length > 0).map(({ subject }) => subject);
  },
});
