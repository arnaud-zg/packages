import type { AdapterContext, PlatformEnvPort } from "shiplane/plugin";
import { isEnvVarName } from "shiplane/plugin";

const NAME_LINE = /^([A-Za-z_][A-Za-z0-9_]*)=/;

const firstLine = (text: string) =>
  text
    .split("\n")
    .find((line) => line.trim())
    ?.trim();

/** The names of an EAS environment's variables; only names are kept, never values. */
export const easEnv = ({ shell }: AdapterContext): PlatformEnvPort => ({
  listNames: async ({ unit, environment }) => {
    const result = await shell.capture(
      "pnpm",
      ["exec", "eas", "env:list", environment, "--format", "short"],
      // eas reads app.config, which may branch on APP_VARIANT, from the app's folder.
      { cwd: unit.dir, env: { APP_VARIANT: environment } },
    );
    if (result.status !== 0) {
      const reason = firstLine(result.stderr) ?? `exit ${result.status}`;
      throw new Error(`eas env:list ${environment}: ${reason}`);
    }
    return new Set(
      result.stdout.split("\n").flatMap((line) => {
        const name = NAME_LINE.exec(line)?.[1];
        return name && isEnvVarName(name) ? [name] : [];
      }),
    );
  },
  setCommand: ({ unit, environment, names }) =>
    [
      `cd ${unit.dir}`,
      ...names.map(
        (name) =>
          `pnpm exec eas env:create --environment ${environment} --name ${name} --value ... --visibility secret`,
      ),
    ].join(" && "),
});
