import type { FollowUp, Shipped } from "../modules/module";
import type { ReleaseContext } from "./context";
import { paint } from "./say";
import { afterShipContext } from "./targets";

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** What every feature asks for once these apps ship, in order. One that cannot read is said, then skipped. */
const followUpsOf = async (context: ReleaseContext, shipped: readonly Shipped[]) => {
  const all: FollowUp[] = [];
  if (shipped.length === 0) return all;
  for (const feature of context.release.features) {
    try {
      const asked = await context.progress.during(
        `${feature.name}: reading what to follow up`,
        "thinking",
        () => feature.afterShip(afterShipContext(context), shipped),
      );
      all.push(...asked);
    } catch (error) {
      context.output.line(
        `  ${paint("yellow", "!")} ${feature.name}  ${paint("dim", `could not read: ${reasonOf(error)}`)}`,
      );
    }
  }
  return all;
};

/** Runs what the features ask for once units shipped. A failure is said and never fails the release. */
export const runFollowUps = async (context: ReleaseContext, shipped: readonly Shipped[]) => {
  for (const { label, run } of await followUpsOf(context, shipped)) {
    try {
      await run();
      context.output.line(`  ${paint("green", "✓")} ${label}`);
    } catch (error) {
      context.output.line(`  ${paint("yellow", "!")} ${label}  ${paint("dim", reasonOf(error))}`);
    }
  }
};

/** What the features would do once these units ship, run nothing. */
export const planFollowUps = async (context: ReleaseContext, shipped: readonly Shipped[]) => {
  const all = await followUpsOf(context, shipped);
  if (all.length === 0) return;
  context.output.line();
  context.output.line(`  ${paint("bold", "Then")}  ${paint("dim", "once shipped")}`);
  all.forEach(({ label }) => context.output.line(`    ${label}`));
};
