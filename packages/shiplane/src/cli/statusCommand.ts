import type { ReleaseContext } from "../application/context";
import type { Environment } from "../domain/environment";
import { readStatus } from "../application/readStatus";
import { environmentLabel } from "../application/targets";
import { out, paint } from "./output";

const NEXT: Record<string, string> = {
  "release-pr": "open the release PR: shiplane",
  "wait-merge": "merge the release PR, then: shiplane",
  ship: "tag what was versioned and ship it: shiplane",
};

/** The next step as a person reads it; a ship with nothing pending anywhere is nothing to do. */
export const nextLabel = ({
  next,
  units,
  untagged,
}: {
  next: { step: string };
  units: readonly { pending: boolean }[];
  untagged: readonly unknown[];
}) =>
  next.step === "ship" && untagged.length === 0 && !units.some(({ pending }) => pending)
    ? "nothing to release: queue a change with pnpm changeset"
    : (NEXT[next.step] ?? "");

/** `shiplane status`: where every unit stands on an environment, and what to run next. Reads only. */
export const statusCommand = async (
  context: ReleaseContext,
  { environment, json }: { environment: Environment; json: boolean },
) => {
  const status = await readStatus(context, environment);
  if (json) {
    out(JSON.stringify(status, null, 2));
    return;
  }
  const dot = paint("dim", "·");
  out();
  const label = environmentLabel(context, [], environment);
  out(`  ${paint("bold", "Release status")}  ${dot}  ${label}`);
  out();
  const width = Math.max(8, ...status.units.map(({ unit }) => unit.length)) + 2;
  out(
    paint(
      "dim",
      `  ${"Unit".padEnd(width)}${"Version".padEnd(12)}${"Target".padEnd(18)}Where it stands`,
    ),
  );
  status.units.forEach(({ unit, version, target, pending, hint }) => {
    const mark = pending ? paint("yellow", "↑") : paint("dim", "·");
    out(`  ${unit.padEnd(width)}${version.padEnd(12)}${target.padEnd(18)}${mark} ${hint}`);
  });
  status.releasePrs.forEach(({ url }) => out(`\n  ${paint("cyan", "Release PR")}  ${url}`));
  if (status.untagged.length > 0) {
    out(`  ${paint("yellow", "Untagged")}  ${status.untagged.map(({ tag }) => tag).join(", ")}`);
  }
  out();
  out(`${paint(["bold", "green"], "→ Next:")} ${nextLabel(status)}`);
  out();
};
