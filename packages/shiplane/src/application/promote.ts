import type { Released } from "../domain/companions";
import type { DeployPath } from "../domain/deploys";
import type { ReleaseContext } from "./context";
import { releasedTogether } from "../domain/companions";
import { scopeChoices } from "../domain/scope";
import { changelogSection, tagName } from "../domain/tags";
import { pickScope } from "./pickScope";
import { confirm, listed, paint } from "./say";
import { shipTo } from "./ship";
import { decideContext, jobInput, moduleOf } from "./targets";

const STAGES = ["What to promote", "Ship"] as const;

/** Each unit's version on preview with its notes, read from its tag. */
const releasedVersions = async (
  { release, services }: ReleaseContext,
  apps: readonly string[],
): Promise<Released[]> =>
  Promise.all(
    release.units
      .filter(({ name }) => apps.includes(name))
      .map(async ({ name, dir, version }) => {
        const changelog = await services.sourceControl.fileAt(
          tagName(name, version, release.tagFormat),
          services.versioning.changelogFile(dir),
        );
        return { app: name, version, notes: changelogSection(changelog ?? "", version) };
      }),
  );

/**
 * Which units production gets: the person's pick, plus what preview only ever ran with it when they
 * accept. Offered ticked with why, never added silently. Null when cancelled.
 */
export const pickPromotion = async (context: ReleaseContext): Promise<Set<string> | null> => {
  const { output } = context;
  const picked = await pickScope(context, "production");
  if (!picked || picked.scope.size === 0) return null;
  const left = scopeChoices(picked.info, "production")
    .filter(({ app, pending }) => pending && !picked.scope.has(app))
    .map(({ app }) => app);
  if (left.length === 0) return picked.scope;
  const companions = await context.progress.during(
    "Reading the notes of what preview runs, to see what went there together",
    "thinking",
    async () =>
      releasedTogether(
        await releasedVersions(context, [...picked.scope]),
        await releasedVersions(context, left),
      ),
  );
  if (companions.length === 0) return picked.scope;
  const names = companions.map(({ app }) => app);
  const partners = [...new Set(companions.flatMap(({ with: partner }) => partner))];
  output.line();
  output.line(
    `  ${paint(["bold", "yellow"], "!")} ${paint("bold", `Preview runs ${listed(names)} with what you picked:`)}`,
  );
  companions.forEach(({ app, version, why }) =>
    output.line(`      ${app.padEnd(11)}${version.padEnd(10)}${paint("dim", why)}`),
  );
  output.line();
  const versions = companions.map(({ app, version }) => `${app} ${version}`);
  const them = companions.length === 1 ? "it" : "them";
  if (
    await confirm(
      context,
      `Promote ${listed(versions)} too? Preview has only run ${them} with ${listed(partners)}.`,
      true,
    )
  ) {
    return new Set([...picked.scope, ...names]);
  }
  const promoted = picked.info
    .filter(({ app }) => partners.includes(app))
    .map(({ app, version }) => `${app} ${version}`);
  output.line(
    paint(
      "dim",
      `  ${listed(names)} ${companions.length === 1 ? "stays" : "stay"} on preview: production runs ${listed(promoted)} next to the ${listed(names)} it has.`,
    ),
  );
  return picked.scope;
};

/** How each picked unit does on preview, said; when one looks unwell, asks before going on. */
const previewLooksWell = async (context: ReleaseContext, scope: ReadonlySet<string>) => {
  const { output, release, services } = context;
  const { head } = await services.sourceControl.position();
  const reads = await context.progress.during(
    "Reading how preview runs what you picked",
    "thinking",
    () =>
      Promise.all(
        release.units
          .filter(({ name }) => scope.has(name))
          .map(async (unit) => {
            const module = moduleOf(context, unit);
            if (!module?.health) return [];
            const tag = tagName(unit.name, unit.version, context.release.tagFormat);
            const input = jobInput(context, module, unit, {
              tag,
              environment: "preview",
              commit: head,
            });
            const health = await module.health(decideContext(context), input).catch(() => null);
            return health ? [{ tag, ...health }] : [];
          }),
      ),
  );
  const healths = reads.flat();
  if (healths.length === 0) return true;
  output.line();
  healths.forEach(({ tag, ok, summary }) =>
    output.line(
      `  ${ok ? paint("green", "✓") : paint(["bold", "yellow"], "!")} ${tag.padEnd(18)}${paint("dim", summary)}`,
    ),
  );
  output.line();
  const unwell = healths.filter(({ ok }) => !ok);
  if (unwell.length === 0) return true;
  const reasons = unwell.map(({ tag, why }) => `${tag}: ${why ?? "looks unwell"}`);
  return confirm(context, `Promote anyway? ${reasons.join("; ")}.`, false);
};

/** Production, from what preview runs: every unit picked, its name typed, each step asked. */
export const promote = async (context: ReleaseContext, via: DeployPath | undefined) => {
  context.progress.stage(STAGES, 0);
  const scope = await pickPromotion(context);
  if (!scope) return true;
  if (!(await previewLooksWell(context, scope))) {
    context.output.line(paint("dim", "  Nothing promoted."));
    return true;
  }
  context.progress.stage(STAGES, 1);
  return shipTo(context, "production", { scope, via });
};
