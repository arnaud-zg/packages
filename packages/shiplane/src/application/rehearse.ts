import path from "node:path";

import type { ReleaseUnit } from "../domain/unit";
import type { SetupContext } from "./setupContext";
import { tagName } from "../domain/tags";
import { checkStatus, requirementsOf } from "./requirements";
import { paint } from "./say";
import { commandLine, jobInput, moduleOf, shipPlanOf } from "./targets";

class StepFailed extends Error {}

/** One rehearsal check under a spinner when there is one: true when `work` says it passed. */
const check = async (context: SetupContext, label: string, work: () => Promise<boolean>) => {
  const run = async () => {
    if (!(await work())) throw new StepFailed();
  };
  try {
    if (context.progress) await context.progress.during(label, "working", run);
    else {
      await run();
      context.output.line(`  ${paint("green", "✓")} ${label}`);
    }
    return true;
  } catch (error) {
    if (!(error instanceof StepFailed)) {
      context.output.line(`  ${paint("red", "✗")} ${label}`);
      context.output.line(
        `     ${paint("dim", error instanceof Error ? error.message : String(error))}`,
      );
    } else if (!context.progress) context.output.line(`  ${paint("red", "✗")} ${label}`);
    return false;
  }
};

/** The package manager this repository runs scripts with. */
const runner = (context: SetupContext) =>
  context.files.exists("pnpm-lock.yaml")
    ? "pnpm"
    : context.files.exists("yarn.lock")
      ? "yarn"
      : context.files.exists("bun.lock") || context.files.exists("bun.lockb")
        ? "bun"
        : "npm";

/** How a unit builds: its `buildCommand:`, else its package.json "build" script, else nothing. */
export const buildCommandOf = (context: SetupContext, unit: ReleaseUnit) => {
  if (unit.buildCommand)
    return { command: "sh", args: ["-c", unit.buildCommand], shown: unit.buildCommand };
  const manifest = JSON.parse(
    context.files.read(path.posix.join(unit.dir, "package.json")) ?? "{}",
  ) as { scripts?: Record<string, string> };
  if (!manifest.scripts?.build) return null;
  const pm = runner(context);
  return { command: pm, args: ["run", "build"], shown: `${pm} run build` };
};

/**
 * A release played through with nothing pushed, published or deployed: the config loads, every app
 * builds, every ship plan resolves, every sign-in is there. Each failure says how to fix it.
 */
export const rehearse = async (context: SetupContext): Promise<boolean> => {
  const { output, shell, root } = context;
  output.line();
  output.line(
    `  ${paint("bold", "Rehearsal")}  ${paint("dim", "· nothing is pushed, published or deployed")}`,
  );
  const release = await context.load();
  if (release.problems.length > 0) {
    release.problems.forEach(({ file, line, message, hint }) => {
      output.line(
        `  ${paint("red", "✗")} ${line === undefined ? file : `${file}:${line}`}  ${message}`,
      );
      if (hint) output.line(`     ${paint("dim", hint)}`);
    });
    return false;
  }
  const builds = release.units.flatMap((unit) => {
    const build = buildCommandOf(context, unit);
    return build ? [{ unit, build }] : [];
  });
  const results: {
    unit: ReleaseUnit;
    shown: string;
    failed: boolean;
    seconds: string;
    tail: string[];
  }[] = [];
  const built =
    builds.length === 0 ||
    (await check(
      context,
      `build ${builds.length} app${builds.length === 1 ? "" : "s"}`,
      async () => {
        results.push(
          ...(await Promise.all(
            builds.map(async ({ unit, build }) => {
              const started = Date.now();
              const result = await shell.capture(build.command, build.args, {
                cwd: path.join(root, unit.dir),
              });
              return {
                unit,
                shown: build.shown,
                failed: result.status !== 0,
                seconds: `${((Date.now() - started) / 1000).toFixed(1)}s`,
                tail: `${result.stderr}${result.stdout}`.trim().split("\n").slice(-3),
              };
            }),
          )),
        );
        return results.every(({ failed }) => !failed);
      },
    ));
  for (const { unit, shown, failed, seconds, tail } of results) {
    output.line(
      `     ${failed ? paint("red", "✗") : paint("green", "✓")} ${unit.dir.padEnd(18)}${paint("dim", `${shown}  ${seconds}`)}`,
    );
    if (!failed) continue;
    tail.forEach((line) => output.line(`         ${paint("dim", line)}`));
    output.line(`         ${paint("dim", `fix the build, or set buildCommand: in ${unit.file}`)}`);
  }

  const releaseContext = context.compose?.(release);
  const planned =
    !releaseContext ||
    (await check(context, `plan  ${release.units.length} apps, nothing runs`, async () => {
      const { head } = await releaseContext.services.sourceControl.position();
      for (const unit of release.units) {
        const module = moduleOf(releaseContext, unit);
        if (!module) continue;
        const tag = tagName(unit.name, unit.version, release.tagFormat);
        shipPlanOf(
          releaseContext,
          module,
          jobInput(releaseContext, module, unit, { tag, environment: "preview", commit: head }),
        );
      }
      return true;
    }));

  let signedIn = true;
  for (const requirement of requirementsOf(release)) {
    const status = await checkStatus(shell, root, requirement);
    if (await check(context, requirement.label, () => Promise.resolve(status === 0))) continue;
    signedIn = false;
    const fix =
      status === 127
        ? `not installed: ${requirement.check.command}`
        : requirement.fix
          ? `run ${commandLine(requirement.fix)}, then shiplane setup`
          : "not available here";
    output.line(`     ${paint("dim", fix)}`);
  }
  return built && planned && signedIn;
};
