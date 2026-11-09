import type { EnvToCheck, EnvVarName } from "../domain/checkEnvBeforeDeploy";
import type { Environment } from "../domain/environment";
import type { ReleaseUnit } from "../domain/unit";
import type { PlatformEnvPort } from "../ports/platform-env.port";
import type { Shell } from "../ports/shell.port";
import type { Release } from "./config/loadRelease";
import type { ReleaseContext } from "./context";
import { findUnset } from "../domain/checkEnvBeforeDeploy";
import { paint } from "./say";
import { resolvedOptions } from "./targets";

export const STEP = "Check env before deploy";
const SET_THEM = "Are they set now?";
const READ_AGAIN = "Read the platform again?";

export type Checked = { unit: ReleaseUnit; toCheck: EnvToCheck };

/** The units that list env to check, each with its list. */
export const listing = (units: readonly ReleaseUnit[]): Checked[] =>
  units.flatMap((unit) =>
    unit.checkEnvBeforeDeploy ? [{ unit, toCheck: unit.checkEnvBeforeDeploy }] : [],
  );

type WithoutOptions<Input> = Omit<Input, "options">;

/** A unit's platform env, its settings for each environment filled in. */
export interface UnitPlatformEnv {
  listNames: (
    input: WithoutOptions<Parameters<PlatformEnvPort["listNames"]>[0]>,
  ) => Promise<ReadonlySet<EnvVarName>>;
  setCommand: (input: WithoutOptions<Parameters<PlatformEnvPort["setCommand"]>[0]>) => string;
}

/** The unit's platform env, or the provider that cannot list names. */
export const platformEnvOf = (
  { release, shell }: { release: Release; shell: Shell },
  unit: ReleaseUnit,
): UnitPlatformEnv | { cannotList: string } => {
  const module = release.modules.find(({ name }) => name === unit.module);
  if (!module?.env) return { cannotList: module?.provider ?? unit.module };
  const port = module.env({ root: release.root, shell });
  const options = (environment: Environment) =>
    resolvedOptions(module, unit, environment, release.units);
  return {
    listNames: (input) => port.listNames({ ...input, options: options(input.environment) }),
    setCommand: (input) => port.setCommand({ ...input, options: options(input.environment) }),
  };
};

const line = ({ output }: ReleaseContext, mark: string, text: string) =>
  output.line(`${mark}  ${paint("bold", STEP)}  ${text}`);

/** The names the platform holds, or null when the person stops, or CI cannot read it. */
const readNames = async (
  context: ReleaseContext,
  port: UnitPlatformEnv,
  input: { unit: ReleaseUnit; environment: Environment },
): Promise<ReadonlySet<EnvVarName> | null> => {
  try {
    return await port.listNames(input);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    line(context, paint("red", "✗"), `${input.unit.name} on ${input.environment}: ${reason}`);
    const retry =
      context.prompter.interactive &&
      !context.options.yes &&
      (await context.prompter.confirm(READ_AGAIN, true));
    return retry ? readNames(context, port, input) : null;
  }
};

const canWait = ({ prompter, options }: ReleaseContext) => prompter.interactive && !options.yes;

/** One unit on one environment: true once every listed name is on its platform. */
const checkUnit = async (
  context: ReleaseContext,
  port: UnitPlatformEnv,
  { unit, toCheck }: Checked,
  environment: Environment,
): Promise<boolean> => {
  const expected = toCheck.for(environment);
  const where = `${unit.name} on ${environment}`;
  const setOnPlatform = await readNames(context, port, { unit, environment });
  if (!setOnPlatform) return false;
  const unset = findUnset({ expected, setOnPlatform });
  if (unset.isEmpty()) {
    line(context, paint("green", "✓"), `${where}: ${expected.size} of ${expected.size} set`);
    return true;
  }
  const { output } = context;
  const command = port.setCommand({ unit, environment, names: unset.names() });
  line(
    context,
    paint("yellow", "!"),
    `${where}: ${unset.names().length} unset env vars, the deploy waits`,
  );
  unset.names().forEach((name) => output.line(`      ${name}`));
  if (!canWait(context)) {
    output.line(`    ${paint("dim", "Nothing was written. Set them, then run again:")}`);
    output.line(`      ${command}`);
    return false;
  }
  output.line(
    `    ${paint("dim", "You set these values; shiplane never does. Run, with your values:")}`,
  );
  output.line(`      ${command}`);
  if (!(await context.prompter.confirm(SET_THEM, true))) return false;
  return checkUnit(context, port, { unit, toCheck }, environment);
};

/**
 * Before a deploy: each unit that lists env to check has every name on its platform. A person sets
 * the values; shiplane only reads names. False when a name is still unset and nothing should ship.
 */
export const checkEnvBeforeDeploy = async (
  context: ReleaseContext,
  { environment, units }: { environment: Environment; units: readonly ReleaseUnit[] },
): Promise<boolean> => {
  for (const entry of listing(units)) {
    const port = platformEnvOf(context, entry.unit);
    if ("cannotList" in port) {
      line(
        context,
        paint("yellow", "!"),
        `${entry.unit.name}: can't check env on ${port.cannotList}, the deploy goes on`,
      );
      continue;
    }
    if (!(await checkUnit(context, port, entry, environment))) return false;
  }
  return true;
};
