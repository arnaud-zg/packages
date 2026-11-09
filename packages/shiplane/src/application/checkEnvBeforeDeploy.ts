import type { EnvToCheck, EnvVarName } from "../domain/checkEnvBeforeDeploy";
import type { Environment } from "../domain/environment";
import type { ReleaseUnit } from "../domain/unit";
import type { PlatformEnvPort } from "../ports/platform-env.port";
import type { ReleaseContext } from "./context";
import { findUnset } from "../domain/checkEnvBeforeDeploy";
import { paint } from "./say";

const STEP = "Check env before deploy";
const SET_THEM = "Are they set now?";
const READ_AGAIN = "Read the platform again?";

type Checked = { unit: ReleaseUnit; toCheck: EnvToCheck };

const line = ({ output }: ReleaseContext, mark: string, text: string) =>
  output.line(`${mark}  ${paint("bold", STEP)}  ${text}`);

/** The names the platform holds, or null when the person stops, or CI cannot read it. */
const readNames = async (
  context: ReleaseContext,
  port: PlatformEnvPort,
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
  port: PlatformEnvPort,
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
  const checked = units.flatMap((unit) =>
    unit.checkEnvBeforeDeploy ? [{ unit, toCheck: unit.checkEnvBeforeDeploy }] : [],
  );
  for (const entry of checked) {
    const module = context.release.modules.find(({ name }) => name === entry.unit.module);
    if (!module?.env) {
      line(
        context,
        paint("yellow", "!"),
        `${entry.unit.name}: can't check env on ${module?.provider ?? entry.unit.module}, the deploy goes on`,
      );
      continue;
    }
    const port = module.env({ root: context.release.root, shell: context.shell });
    if (!(await checkUnit(context, port, entry, environment))) return false;
  }
  return true;
};
