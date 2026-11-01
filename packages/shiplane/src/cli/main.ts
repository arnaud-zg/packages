import { parseArgs } from "node:util";
import { z } from "zod";

import type { ReleaseContext } from "../application/context";
import type { ContextIo } from "./compose";
import { nodeFiles } from "../adapters/files/node-files.adapter";
import { addUnit, removeUnit } from "../application/addUnit";
import { loadRelease } from "../application/config/loadRelease";
import { docsFor } from "../application/docsFor";
import { doctor } from "../application/doctor";
import { initRelease } from "../application/initRelease";
import { newAdapter } from "../application/newAdapter";
import { openReleasePr } from "../application/openReleasePr";
import { pickScope } from "../application/pickScope";
import { planShips } from "../application/planShips";
import { prepareRelease } from "../application/prepareRelease";
import { promote } from "../application/promote";
import { releaseToPreview } from "../application/releaseToPreview";
import { refreshEditorSchema } from "../application/setupFiles";
import { shipTo } from "../application/ship";
import { missingTags, tagRelease } from "../application/tagRelease";
import { ENVIRONMENTS } from "../domain/environment";
import { composeContext, composeSetup } from "./compose";
import { findRoot } from "./findRoot";
import { out, paint, printProblems } from "./output";
import { pluginsCommand } from "./pluginsCommand";
import { statusCommand } from "./statusCommand";

const HELP = `${paint("bold", "shiplane")}: detect what changed, version it, trigger each app's deploy.

  shiplane                        the next step to preview: release PR, merge, tags, ship
  shiplane promote                production, from what preview runs (--channel production too)
  shiplane status [--json]        where every unit stands, and what to run next
  shiplane version                open the release PR for what is pending
  shiplane tag                    tag merged versions and publish their release notes
  shiplane ship [unit...]         trigger each tagged unit's deploy, then return
  shiplane plan                   every command a ship would run, run nothing
  shiplane plugins [--json]       the flow, the modules in release order and who uses each, the features

  shiplane init [--yes|--blank]   find what ships, write a unit file per app, then doctor
  shiplane add <folder>           init's questions for one folder
  shiplane remove <unit>          stop shipping a unit; it stays versioned
  shiplane doctor                 check the config, tools and sign-ins, offer each fix
  shiplane adapter new <name>     scaffold a server hosting adapter, its contract test and its module
  shiplane docs <name>            every key a module's or an adapter's unit files take
  shiplane help                   this

  --channel preview|production    where status reads (preview by default)
  --via github|local              ship through GitHub Actions or this machine, without asking
  --yes                           answer yes to every question (never on production)
  --verbose / --no-verbose        say each thing it reads and runs, with a progress bar (on by default)
  --mascot / --no-mascot          the mascot beside it, still in CI or under NO_MOTION=1 (on by default)
                                  Both defaults live in shiplane.config.ts: display: { verbose, mascot }
`;

/** The CLI as a person runs it, from its arguments and folder; resolves to its exit code. */
export const runCli = async (argv: string[], cwd: string, io: ContextIo = {}): Promise<number> => {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    allowNegative: true,
    options: {
      verbose: { type: "boolean" },
      mascot: { type: "boolean" },
      json: { type: "boolean", default: false },
      yes: { type: "boolean", short: "y", default: false },
      channel: { type: "string", default: "preview" },
      via: { type: "string" },
      blank: { type: "boolean", default: false },
    },
  });

  const [command = "next", ...units] = positionals;
  const environment = z.enum(ENVIRONMENTS).parse(values.channel);
  const via = values.via === undefined ? undefined : z.enum(["github", "local"]).parse(values.via);

  const commands: Record<string, (context: ReleaseContext) => Promise<boolean | void>> = {
    next: (context) =>
      environment === "preview" ? releaseToPreview(context) : promote(context, via),
    promote: (context) => promote(context, via),
    status: (context) => statusCommand(context, { environment, json: values.json }),
    version: async (context) => {
      const picked = await pickScope(context, "preview");
      if (!picked || picked.scope.size === 0) return true;
      return (await openReleasePr(context, await prepareRelease(context, picked.scope))) !== null;
    },
    tag: async (context) => tagRelease(context, await missingTags(context)),
    ship: (context) =>
      shipTo(context, environment, { via, ...(units.length > 0 ? { scope: new Set(units) } : {}) }),
    plan: (context) => planShips(context, environment),
    plugins: (context) => Promise.resolve(pluginsCommand(context.release, { json: values.json })),
  };

  const [first = ""] = units;
  const setupCommands: Record<
    string,
    (context: Awaited<ReturnType<typeof composeSetup>>) => Promise<boolean>
  > = {
    init: (context) => initRelease(context, { yes: values.yes, blank: values.blank }),
    add: (context) => addUnit(context, first),
    remove: (context) => removeUnit(context, first),
    doctor: (context) => doctor(context),
    adapter: (context) => {
      if (first === "new" && units[1]) return newAdapter(context, units[1]);
      out(`${paint("red", "✗")}  shiplane adapter new <name>`);
      return Promise.resolve(false);
    },
    docs: (context) => docsFor(context, first),
  };

  const run = commands[command];
  const setup = setupCommands[command];
  if (setup) return (await setup(await composeSetup(findRoot(cwd)))) ? 0 : 1;
  if (command === "help") {
    out(HELP);
    return 0;
  }
  if (!run) {
    out(`${paint("red", "✗")}  no command "${command}"`);
    out(HELP);
    return 1;
  }
  const release = await loadRelease(findRoot(cwd), { aliases: io.aliases });
  if (release.problems.length > 0) {
    printProblems(release.problems);
    return 2;
  }
  (release.renames ?? []).forEach(({ from, to }) =>
    out(`${paint("yellow", "!")}  rename ${from} to ${to}: the old name still works for now`),
  );
  refreshEditorSchema(nodeFiles(release.root), release);
  const context = composeContext(
    release,
    { yes: values.yes, display: { verbose: values.verbose, mascot: values.mascot } },
    io,
  );
  return (await run(context)) === false ? 1 : 0;
};
