import type { EnvToCheck, EnvVarName } from "../domain/checkEnvBeforeDeploy";
import type { Environment } from "../domain/environment";
import type { ReleaseUnit } from "../domain/unit";
import type { PlatformEnvPort } from "../ports/platform-env.port";
import type { Shell } from "../ports/shell.port";
import type { Output } from "../ports/terminal.port";
import type { Release } from "./config/loadRelease";
import type { ReleaseContext } from "./context";
import { findUnset } from "../domain/checkEnvBeforeDeploy";
import { ENVIRONMENTS } from "../domain/environment";
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

const doctorLine = (output: Output, mark: string, text: string) =>
  output.line(`${paint("dim", "│")}  ${mark} ${text}`);

/** One unit on one environment, for doctor: true when every listed name is on its platform. */
const reportUnit = async (
  output: Output,
  port: PlatformEnvPort,
  { unit, toCheck }: Checked,
  environment: Environment,
): Promise<boolean> => {
  const expected = toCheck.for(environment);
  const where = `${unit.name} on ${environment}`;
  const setOnPlatform = await port.listNames({ unit, environment }).catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error);
    doctorLine(output, paint("red", "✗"), `${where}: ${reason}`);
    return null;
  });
  if (!setOnPlatform) return false;
  const unset = findUnset({ expected, setOnPlatform });
  if (unset.isEmpty()) {
    doctorLine(output, paint("green", "✓"), `${where}: ${expected.size} of ${expected.size} set`);
    return true;
  }
  const names = unset.names();
  doctorLine(
    output,
    paint("red", "✗"),
    `${where}: ${names.length} unset env vars: ${names.join(", ")}`,
  );
  output.line(
    `${paint("dim", "│")}      ${paint("dim", `you set them: ${port.setCommand({ unit, environment, names })}`)}`,
  );
  return false;
};

/**
 * `doctor`'s env section: each unit that lists env to check, on every environment. Prints nothing
 * when no unit lists any. False when a name is unset or a platform cannot be read.
 */
export const reportEnvToCheck = async ({
  release,
  shell,
  output,
}: {
  release: Release;
  shell: Shell;
  output: Output;
}): Promise<boolean> => {
  const checked = release.units.flatMap((unit) =>
    unit.checkEnvBeforeDeploy ? [{ unit, toCheck: unit.checkEnvBeforeDeploy }] : [],
  );
  if (checked.length === 0) return true;
  doctorLine(output, "", paint("bold", STEP));
  let allSet = true;
  for (const entry of checked) {
    entry.toCheck
      .listedTwice()
      .forEach((name) =>
        doctorLine(
          output,
          paint("yellow", "!"),
          `${entry.unit.name}: ${name} is in all and listed again`,
        ),
      );
    const module = release.modules.find(({ name }) => name === entry.unit.module);
    if (!module?.env) {
      doctorLine(
        output,
        paint("yellow", "!"),
        `${entry.unit.name}: can't check env on ${module?.provider ?? entry.unit.module}`,
      );
      continue;
    }
    const port = module.env({ root: release.root, shell });
    for (const environment of ENVIRONMENTS) {
      allSet = (await reportUnit(output, port, entry, environment)) && allSet;
    }
  }
  return allSet;
};
