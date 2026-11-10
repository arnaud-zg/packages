import type { DeployPath, WebShip } from "../domain/deploys";
import type { Environment } from "../domain/environment";
import type { ReleaseUnit } from "../domain/unit";
import type { AppInput, ReleaseModule } from "../modules/module";
import type { Deploy } from "../ports/code-host.port";
import type { Decision, Job } from "../ports/delivery.port";
import type { Shipment } from "./askPath";
import type { ReleaseContext } from "./context";
import { onlyVersionFiles, shipsFrom, webShip } from "../domain/deploys";
import { tagName } from "../domain/tags";
import { askPaths, PATH_LABEL } from "./askPath";
import { checkEnvBeforeDeploy } from "./checkEnvBeforeDeploy";
import { runFollowUps } from "./followUps";
import { pullRequestFirst } from "./pullRequestFirst";
import { deployedOn } from "./readScope";
import { signIn, signInsOf } from "./requirements";
import { confirm, fail, paint } from "./say";
import {
  decideContext,
  destination,
  dispatchShip,
  environmentLabel,
  jobInput,
  moduleOf,
  runHere,
  shipPlanOf,
  versionFiles,
} from "./targets";

type Kind = Extract<Decision, { action: "ship" }>["kind"];

interface Ready {
  unit: ReleaseUnit;
  module: ReleaseModule;
  input: AppInput;
  kind: Kind;
  jobs: Job[];
  /** Its module decided for itself: the moved-past check is already its own. */
  decided: boolean;
  /** Why this machine cannot ship it, as its module decided. */
  notLocal: string | null;
}

/** Builds and submits run on their own platform: a build asks only when a workflow can start it. */
const choosesPath = ({ kind, jobs }: Ready) =>
  kind === "update" || kind === "deploy" || (kind === "build" && jobs.every(({ ci }) => ci));

const WEB_STATUS: Record<Exclude<WebShip, "deploy">, string> = {
  deploying: "deploying already",
  shipped: "already there",
  "not-on-preview": "not on preview yet: ship it there first",
};

/** A web unit decides from GitHub Deployments, which a ship records once it rolled out. */
const webDecision = (
  context: ReleaseContext,
  module: ReleaseModule,
  input: AppInput,
  history: Deploy[],
): Decision => {
  const { jobs } = shipPlanOf(context, module, input);
  const ship = webShip({
    environment: input.environment,
    run: deployedOn(history, input.tag, input.environment),
    onPreview: deployedOn(history, input.tag, "preview") === "done",
  });
  return ship === "deploy"
    ? { action: "ship", kind: "deploy", jobs }
    : { action: "none", status: WEB_STATUS[ship] };
};

/** Where a choice stands, then the person's pick: its jobs ship, or nothing does and it is held. */
const chosen = async (
  context: ReleaseContext,
  choice: Extract<Decision, { action: "choose" }>,
): Promise<Extract<Decision, { action: "ship" | "none" }>> => {
  const { output, prompter } = context;
  output.line();
  choice.lines.forEach((line) => output.line(`  ${line}`));
  output.line();
  const value = prompter.interactive
    ? await prompter.select(
        choice.question,
        choice.options.map(({ value, label, hint, disabled }) => ({
          value,
          label,
          hint,
          disabled,
        })),
        choice.suggested,
      )
    : null;
  const jobs = choice.options.find((option) => option.value === value)?.jobs ?? [];
  return jobs.length > 0
    ? { action: "ship", kind: "update", jobs }
    : { action: "none", status: choice.held };
};

/**
 * What every picked unit needs on the environment, in dispatch order, said as it goes. A module may
 * first need a small PR merged (a version moving): it opens, merges, and the module decides again.
 * Null when one of them refused.
 */
const decideAll = async (
  context: ReleaseContext,
  environment: Environment,
  scope: ReadonlySet<string> | undefined,
): Promise<Ready[] | null> => {
  const { release, services, output } = context;
  const recorded = await services.codeHost.deployments().catch(() => []);
  const ready: Ready[] = [];
  for (const unit of release.units) {
    const module = moduleOf(context, unit);
    if ((scope && !scope.has(unit.name)) || !module) continue;
    const tag = tagName(unit.name, unit.version, context.release.tagFormat);
    if (!module.decide && !(await services.sourceControl.tagCommit(tag))) continue;
    const decide = async () => {
      const { head } = await services.sourceControl.position();
      const input = jobInput(context, module, unit, { tag, environment, commit: head });
      const decision = module.decide
        ? await module.decide(decideContext(context), input)
        : webDecision(context, module, input, recorded);
      return { input, decision };
    };
    const checked = module.kind === "published-package" ? module.provider : environment;
    let { input, decision } = await context.progress.during(
      module.releaseOnly
        ? `Checking what ${tag} needs`
        : `Checking what ${tag} needs on ${checked}`,
      "thinking",
      decide,
    );
    while (decision.action === "pull-request") {
      const merged = await pullRequestFirst(context, decision);
      if (merged === "failed") return null;
      if (merged === "declined") {
        decision = { action: "none", status: "left for later" };
        break;
      }
      ({ input, decision } = await decide());
    }
    if (decision.action === "choose") decision = await chosen(context, decision);
    if (decision.action === "fail") {
      fail(context, decision.title, decision.detail, decision.commands);
      return null;
    }
    if (decision.action === "none") {
      output.line(`  ${paint("dim", "·")} ${tag}  ${paint("dim", decision.status)}`);
      continue;
    }
    ready.push({
      unit,
      module,
      input,
      kind: decision.kind,
      jobs: decision.jobs,
      decided: module.decide !== undefined,
      notLocal: decision.notLocal ?? null,
    });
  }
  return ready;
};

/** Why a path cannot ship a unit, or null when it can. */
const blockedOn = async (
  context: ReleaseContext,
  path: DeployPath,
  { input, jobs, decided, notLocal }: Ready,
): Promise<string | null> => {
  const { services } = context;
  if (path === "github") {
    const workflow = services.ciPipeline.shipWorkflow;
    for (const { ci } of jobs) {
      if (!ci) return "only ships from this machine";
      // GitHub runs the workflow file the ref holds.
      const file = `.github/workflows/${workflow}`;
      if ((await services.sourceControl.fileAt(ci.ref, file)) !== null) continue;
      const onMain =
        ci.ref !== "main" && (await services.sourceControl.fileAt("main", file)) !== null;
      return onMain ? `predates ${workflow}` : `no ${workflow}`;
    }
    return null;
  }
  if (decided) return notLocal;
  const changed = await services.sourceControl.diffNames(input.tag, "HEAD");
  const sinceTagOnlyVersionFiles = onlyVersionFiles(changed, versionFiles(context));
  return shipsFrom(path, { sinceTagOnlyVersionFiles }) ? null : "main moved past it";
};

const OTHER_PATH: Record<DeployPath, DeployPath> = { github: "local", local: "github" };

/** What to do instead, when the path a person forced cannot ship a unit. */
const INSTEAD: Record<DeployPath, string> = {
  github: "ship it from this machine",
  local: "this machine builds its checkout, ship it through GitHub Actions",
};

const TAKES: Record<DeployPath, string> = {
  github: "ships through GitHub Actions",
  local: "ships from this machine",
};

/**
 * The way a unit ships: the forced one when it can, the only one left when the other cannot, or
 * asked. Said whenever it is not asked.
 */
const routeOf = async (
  context: ReleaseContext,
  entry: Ready,
  forced: DeployPath | undefined,
): Promise<DeployPath | "ask" | "skip" | "stuck"> => {
  const say = (mark: string, why: string) =>
    context.output.line(`  ${mark} ${entry.input.tag}  ${paint("dim", why)}`);
  if (forced) {
    const why = await blockedOn(context, forced, entry);
    if (!why) return forced;
    say(paint("yellow", "!"), `${why}: ${INSTEAD[forced]}`);
    return "skip";
  }
  const github = await blockedOn(context, "github", entry);
  const local = await blockedOn(context, "local", entry);
  if (github && local) {
    say(paint("red", "✗"), `${github}, and ${local}: nothing can ship it`);
    return "stuck";
  }
  const blocked = github ? "github" : local ? "local" : null;
  if (!blocked) return "ask";
  say(paint("dim", "·"), `${github ?? local}: ${TAKES[OTHER_PATH[blocked]]}`);
  return OTHER_PATH[blocked];
};

const shipmentOf =
  (shipWorkflow: string) =>
  ({ unit, module, input, jobs }: Ready): Shipment => ({
    item: { app: unit.name, tag: input.tag, kind: "deploy" },
    workflows: jobs.some(({ ci }) => ci) ? [shipWorkflow] : [],
    typicalMinutes: module.typicalMinutes,
  });

/**
 * The ship workflow's runs: one per ref, each naming its units. A tag on main's commit runs from
 * main, so a release whose tags all sit there costs one run.
 */
const shipRuns = async ({ services }: ReleaseContext, entries: readonly Ready[]) => {
  const { originMain } = await services.sourceControl.position();
  const runs = new Map<string, string[]>();
  for (const { unit, jobs } of entries) {
    for (const { ci } of jobs) {
      if (!ci) continue;
      const commit =
        ci.ref === "main" ? originMain : await services.sourceControl.tagCommit(ci.ref);
      const ref = commit === originMain ? "main" : ci.ref;
      const units = runs.get(ref) ?? [];
      if (!units.includes(unit.name)) runs.set(ref, [...units, unit.name]);
    }
  }
  return [...runs.entries()].map(([ref, units]) => ({ ref, units }));
};

/** `Ship a through GitHub Actions`, or each tag with its way when they differ. */
const shipQuestion = (
  going: Ready[],
  paths: ReadonlyMap<Ready, DeployPath>,
  environment: string,
  context: ReleaseContext,
) => {
  const label = environmentLabel(
    context,
    going.map(({ unit }) => unit.name),
    environment,
  );
  const used = [...new Set(going.flatMap((entry) => paths.get(entry) ?? []))];
  const [only] = used;
  const names = going
    .map((entry) => {
      const path = paths.get(entry);
      return used.length > 1 && path ? `${entry.input.tag} (${PATH_LABEL[path]})` : entry.input.tag;
    })
    .join(", ");
  const how = used.length === 1 && only ? ` through ${PATH_LABEL[only]}` : "";
  return `Ship ${names} ${label === "live" ? "live" : `to ${label}`}${how}?`;
};

/**
 * Ships every picked unit its environment does not run yet, and returns once each one is
 * triggered: EAS builds and workflows go on on their own, a Fly deploy from here once rolled out.
 * Production asks for its name first. False on a failure.
 */
export const shipTo = async (
  context: ReleaseContext,
  environment: Environment,
  {
    scope,
    via,
    envChecked = new Set(),
  }: {
    scope?: ReadonlySet<string>;
    via?: DeployPath;
    /** Units whose env this run already checked on this environment. */
    envChecked?: ReadonlySet<string>;
  },
): Promise<boolean> => {
  const { output, prompter, options, services } = context;
  // On a runner, the person typed production before the dispatch that started it.
  if (environment === "production" && !options.ci) {
    if (options.yes) {
      fail(context, "No --yes on production", "every production step asks a person.", [
        "shiplane ship --channel production",
      ]);
      return false;
    }
    if (!(await prompter.typed('Type "production" to start:', "production"))) {
      output.line(paint("dim", "Nothing ran."));
      return false;
    }
  }
  const ready = await decideAll(context, environment, scope);
  if (!ready) return false;
  if (ready.length === 0) {
    context.progress.say(
      "resting",
      paint("dim", `Nothing to ship ${destination(context, scope ?? [], environment)}.`),
    );
    return true;
  }
  const toCheck = ready.map(({ unit }) => unit).filter(({ name }) => !envChecked.has(name));
  const listing = new Set(
    toCheck.filter((unit) => unit.checkEnvBeforeDeploy).map(({ name }) => name),
  );
  const signedIn =
    listing.size === 0 ||
    (await signIn(context, {
      requirements: signInsOf(context.release, listing),
      again: "ship again",
    }));
  if (!signedIn) return false;
  if (!(await checkEnvBeforeDeploy(context, { environment, units: toCheck }))) return false;
  // On a CI runner, dispatching another workflow would pay for two: this runner ships.
  const forced = options.ci ? "local" : via;
  const paths = new Map<Ready, DeployPath>();
  const unanswered: Ready[] = [];
  // A picked unit nothing can ship fails the run, after the others shipped.
  let stuck = false;
  for (const entry of ready.filter(choosesPath)) {
    const route = await routeOf(context, entry, forced);
    if (route === "ask") unanswered.push(entry);
    else if (route === "stuck") stuck = true;
    else if (route !== "skip") paths.set(entry, route);
  }
  if (unanswered.length > 0) {
    const answers = await askPaths(
      context,
      environment,
      unanswered.map(shipmentOf(services.ciPipeline.shipWorkflow)),
    );
    if (!answers) {
      output.line(paint("dim", "  Nothing shipped."));
      // Cancelled by the person is fine; no terminal to ask is a failure a script should see.
      return prompter.interactive;
    }
    unanswered.forEach((entry, index) => {
      const answer = answers[index];
      if (answer) paths.set(entry, answer);
    });
  }
  const going = ready.filter((entry) => !choosesPath(entry) || paths.has(entry));
  if (going.length === 0) return !stuck;
  const runsHere = going.some((entry) => paths.get(entry) === "local");
  if (runsHere && !(await services.sourceControl.isClean())) {
    fail(
      context,
      "Uncommitted changes",
      "this machine ships its checkout: commit or stash them first.",
    );
    return false;
  }
  if (
    !(await confirm(
      context,
      shipQuestion(going, paths, environment, context),
      environment === "preview",
    ))
  ) {
    // Production still asks for its name and decides each unit on its own rules.
    if (
      environment === "preview" &&
      prompter.interactive &&
      (await prompter.confirm("Ship to production instead?"))
    ) {
      return shipTo(context, "production", { scope, via });
    }
    context.progress.say("resting", paint("dim", "Nothing shipped."));
    return true;
  }
  const here = going.filter((entry) => paths.get(entry) !== "github");
  const jobs = here.flatMap((entry) => entry.jobs.map((job) => ({ entry, job })));
  const runs = await shipRuns(
    context,
    going.filter((entry) => paths.get(entry) === "github"),
  );
  const total = jobs.length + runs.length;
  for (const [index, { entry, job }] of jobs.entries()) {
    try {
      await context.progress.during(
        job.label,
        "working",
        () => runHere(context, job, entry.input),
        { index, total },
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      fail(context, `${job.label} failed`, `${reason}, nothing after it ran.`);
      return false;
    }
  }
  const workflow = services.ciPipeline.shipWorkflow;
  for (const [index, run] of runs.entries()) {
    const label = `ship ${run.units.join(", ")} from ${run.ref} (${workflow})`;
    try {
      await context.progress.during(
        label,
        "working",
        () => dispatchShip(context, run, environment),
        { index: jobs.length + index, total },
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      fail(context, `${label} failed`, `${reason}, nothing after it ran.`);
      return false;
    }
  }
  const names = going.map(({ input }) => input.tag).join(", ");
  const where = destination(
    context,
    going.map(({ unit }) => unit.name),
    environment,
  );
  output.line();
  context.progress.say(
    "happy",
    `${paint(["bold", "green"], "✓ Triggered.")} ${paint("dim", `${names}, shipping ${where} on their own.`)}`,
  );
  await runFollowUps(
    context,
    going.map(({ unit, input }) => ({ unit, tag: input.tag, environment })),
  );
  if (runs.length > 0) {
    output.line(`    ${paint("cyan", "gh run list --limit 5")}`);
  }
  // A package has no channel to read, so status has nothing to show for one.
  if (going.some(({ module }) => module.kind !== "published-package")) {
    output.line(`    ${paint("cyan", `shiplane status --channel ${environment}`)}`);
  }
  output.line();
  return !stuck;
};
