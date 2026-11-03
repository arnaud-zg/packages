import path from "node:path";

import type { Requirement } from "../ports/delivery.port";
import type { SetupContext } from "./setupContext";
import { UNIT_FILE } from "./config/readUnitFile";
import { releaseOrder } from "./releaseOrder";
import { checkStatus, requirementsOf } from "./requirements";
import { paint } from "./say";
import { refreshEditorSchema } from "./setupFiles";
import { commandLine } from "./targets";

/**
 * `shiplane doctor`: the config as written, the editor schema refreshed, the release order, a warning
 * for each module no app names, then every tool and sign-in the flow, modules and features need, each
 * failure with the command that fixes it, offered to run.
 */
export const doctor = async (context: SetupContext): Promise<boolean> => {
  const { output, files, shell, prompter, root } = context;
  output.line();
  output.line(`${paint("cyan", "◆")}  ${paint("bold", "shiplane doctor")}`);
  const release = await context.load();
  if (release.problems.length > 0) {
    release.problems.forEach(({ file, line, message, hint }) => {
      output.line(
        `${paint("red", "✗")}  ${paint("bold", line === undefined ? file : `${file}:${line}`)}  ${message}`,
      );
      if (hint) output.line(`   ${paint("dim", hint)}`);
    });
    return false;
  }
  refreshEditorSchema(files, release);
  const appsOf = (name: string) => release.units.filter(({ module }) => module === name);
  if (release.units.length > 0) {
    output.line(`${paint("dim", "│")}  Order  ${paint("dim", releaseOrder(release.units))}`);
  }
  release.modules
    .filter((module) => appsOf(module.name).length === 0)
    .forEach(({ name }) =>
      output.line(
        `${paint("dim", "│")}  ${paint("yellow", "!")} ${name}  ${paint("dim", `no app names it: module: ${name} in a ${UNIT_FILE}`)}`,
      ),
    );
  (release.renames ?? []).forEach(({ from, to }) =>
    output.line(
      `${paint("dim", "│")}  ${paint("yellow", "!")} ${paint("dim", `rename ${from} to ${to}: the old name still works for now`)}`,
    ),
  );
  (release.deprecations ?? []).forEach((message) =>
    output.line(`${paint("dim", "│")}  ${paint("yellow", "!")} ${paint("dim", message)}`),
  );
  const unique = requirementsOf(release);
  const failing: Requirement[] = [];
  const missing = new Set<string>();
  for (const requirement of unique) {
    const { check } = requirement;
    const status = await checkStatus(shell, root, requirement);
    if (status === 0) {
      output.line(`${paint("dim", "│")}  ${paint("green", "✓")} ${requirement.label}`);
    } else {
      failing.push(requirement);
      if (status === 127) missing.add(check.command);
      const fix =
        status === 127
          ? `not installed: ${check.command}`
          : requirement.fix
            ? `fix: ${commandLine(requirement.fix)}`
            : "not available here";
      output.line(
        `${paint("dim", "│")}  ${paint("red", "✗")} ${requirement.label}  ${paint("dim", fix)}`,
      );
    }
  }
  for (const { fix } of failing) {
    if (!fix || !prompter.interactive || missing.has(fix.command)) continue;
    if (await prompter.confirm(`Run ${commandLine(fix)} now?`)) {
      await shell.attach(fix.command, fix.args, {
        cwd: path.join(root, fix.cwd ?? ""),
        env: fix.env,
      });
    }
  }
  output.line(
    `${paint("dim", "└")}  Next: ${paint("cyan", failing.length > 0 ? "shiplane doctor" : "shiplane status")}`,
  );
  return failing.length === 0;
};
