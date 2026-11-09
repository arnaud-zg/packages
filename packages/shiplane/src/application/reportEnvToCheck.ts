import type { Environment } from "../domain/environment";
import type { PlatformEnvPort } from "../ports/platform-env.port";
import type { Shell } from "../ports/shell.port";
import type { Output } from "../ports/terminal.port";
import type { Checked } from "./checkEnvBeforeDeploy";
import type { Release } from "./config/loadRelease";
import { findUnset } from "../domain/checkEnvBeforeDeploy";
import { ENVIRONMENTS } from "../domain/environment";
import { listing, platformEnvOf, STEP } from "./checkEnvBeforeDeploy";
import { paint } from "./say";

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
  const checked = listing(release.units);
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
    const port = platformEnvOf({ release, shell }, entry.unit);
    if ("cannotList" in port) {
      doctorLine(
        output,
        paint("yellow", "!"),
        `${entry.unit.name}: can't check env on ${port.cannotList}`,
      );
      continue;
    }
    for (const environment of ENVIRONMENTS) {
      allSet = (await reportUnit(output, port, entry, environment)) && allSet;
    }
  }
  return allSet;
};
