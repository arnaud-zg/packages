import path from "node:path";

import type { Requirement } from "../ports/delivery.port";
import type { Shell } from "../ports/shell.port";
import type { Release } from "./config/loadRelease";
import type { ReleaseContext } from "./context";
import { fail } from "./say";
import { commandLine } from "./targets";

/**
 * Every tool and sign-in the flow, the features and the modules need, once each. With `apps`, only
 * the modules shipping one of those apps count.
 */
export const requirementsOf = (release: Release, apps?: ReadonlySet<string>): Requirement[] => {
  const appsOf = (name: string) =>
    release.units.filter(({ module, name: app }) => module === name && (!apps || apps.has(app)));
  const required: Requirement[] = [
    ...[
      release.flow.sourceControl,
      release.flow.codeHost,
      release.flow.ciPipeline,
      release.flow.versioning,
    ].flatMap((adapter) => adapter.requirements?.() ?? []),
    ...release.modules.flatMap((module) => {
      const shipped = appsOf(module.name);
      return apps && shipped.length === 0 ? [] : (module.requirements?.(shipped) ?? []);
    }),
    ...release.features.flatMap((feature) => feature.requirements?.() ?? []),
  ];
  return required.filter(
    (requirement, index) =>
      required.findIndex(({ label }) => label === requirement.label) === index,
  );
};

/** A requirement's check run from the root: its exit status, 127 when the tool is missing. */
export const checkStatus = async (shell: Shell, root: string, { check }: Requirement) =>
  (
    await shell.capture(check.command, check.args, {
      cwd: path.join(root, check.cwd ?? ""),
      env: check.env,
    })
  ).status;

/**
 * Before a release writes anything: each sign-in its picked units need. A failing one offers its
 * fix, then is checked again. False, with the commands to run, when one still fails.
 */
export const preflight = async (
  context: ReleaseContext,
  apps: ReadonlySet<string>,
): Promise<boolean> => {
  const { shell, prompter, options, release } = context;
  const failing: Requirement[] = [];
  for (const requirement of requirementsOf(release, apps)) {
    const status = await checkStatus(shell, release.root, requirement);
    if (status === 0) continue;
    const { fix } = requirement;
    const offered =
      fix !== undefined && status !== 127 && prompter.interactive && !options.yes
        ? await prompter.confirm(`Run ${commandLine(fix)} now?`, true)
        : false;
    if (offered && fix) {
      await shell.attach(fix.command, fix.args, {
        cwd: path.join(release.root, fix.cwd ?? ""),
        env: fix.env,
      });
      if ((await checkStatus(shell, release.root, requirement)) === 0) continue;
    }
    failing.push(requirement);
  }
  if (failing.length === 0) return true;
  fail(
    context,
    `Not signed in: ${failing.map(({ label }) => label).join(", ")}`,
    "nothing was written. Sign in, then run the release again.",
    [...failing.flatMap(({ fix }) => (fix ? [commandLine(fix)] : [])), "shiplane"],
  );
  return false;
};
