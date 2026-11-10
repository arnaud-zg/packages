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
  const required: Requirement[] = [
    ...[
      release.flow.sourceControl,
      release.flow.codeHost,
      release.flow.ciPipeline,
      release.flow.versioning,
    ].flatMap((adapter) => adapter.requirements?.() ?? []),
    ...modulesRequire(release, apps),
    ...release.features.flatMap((feature) => feature.requirements?.() ?? []),
  ];
  return onceEach(required);
};

/** The sign-ins only the modules shipping those apps need, once each. */
export const signInsOf = (release: Release, apps: ReadonlySet<string>): Requirement[] =>
  onceEach(modulesRequire(release, apps));

const modulesRequire = (release: Release, apps?: ReadonlySet<string>) =>
  release.modules.flatMap((module) => {
    const shipped = release.units.filter(
      ({ module: name, name: app }) => name === module.name && (!apps || apps.has(app)),
    );
    return apps && shipped.length === 0 ? [] : (module.requirements?.(shipped) ?? []);
  });

const onceEach = (required: Requirement[]) => {
  const seen = new Set<string>();
  return required.filter(({ label }) => !seen.has(label) && Boolean(seen.add(label)));
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
export const preflight = (context: ReleaseContext, apps: ReadonlySet<string>) =>
  signIn(context, {
    requirements: requirementsOf(context.release, apps),
    again: "run the release again",
  });

/** Each requirement checked; a failing one offers its fix. False, with the commands, when one still fails. */
export const signIn = async (
  context: ReleaseContext,
  { requirements, again }: { requirements: readonly Requirement[]; again: string },
): Promise<boolean> => {
  const { shell, prompter, options, release } = context;
  const failing: Requirement[] = [];
  for (const requirement of requirements) {
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
    `nothing was written. Sign in, then ${again}.`,
    [...failing.flatMap(({ fix }) => (fix ? [commandLine(fix)] : [])), "shiplane"],
  );
  return false;
};
