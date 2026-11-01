import type { ShipItem } from "./deploys";

// Minutes a private repository's plan includes each month, and how GitHub weighs each runner.
const INCLUDED_MINUTES: Record<string, number> = { free: 2000, team: 3000, enterprise: 50000 };
const MINUTE_WEIGHT: Record<string, number> = { actions_windows: 2, actions_macos: 10 };

export interface ActionsMinutes {
  used: number;
  included: number;
  left: number;
}

/** This month's Actions minutes against the plan's allowance, from GitHub's usage summary. */
export const actionsMinutes = (
  plan: string,
  usage: { sku: string; grossQuantity: number; unitType: string }[],
): ActionsMinutes | null => {
  const included = INCLUDED_MINUTES[plan];
  if (!included) return null;
  const used = Math.round(
    usage
      .filter(({ unitType }) => unitType === "minutes")
      .reduce((sum, { sku, grossQuantity }) => sum + grossQuantity * (MINUTE_WEIGHT[sku] ?? 1), 0),
  );
  return { used, included, left: Math.max(0, included - used) };
};

export interface MinutesBudget {
  tone: "green" | "yellow" | "red";
  title: string;
  /** What is left, with what this release will spend shaded in. */
  bar: string;
  amount: string;
  pace: string;
  /** The status chip: enough, running short, or about to run out. */
  status: string;
  /** What is left after this release, or null when it spends nothing on GitHub. */
  after: string | null;
}

const LOW_MINUTES = 100;

const STATUS: Record<MinutesBudget["tone"], string> = {
  green: "● enough minutes this month",
  yellow: "● running short this month",
  red: "● about to run out: deploy from this machine",
};

/**
 * The minutes as the deploy question draws them: a bar of what is left, what this release spends,
 * and where this month ends if the pace so far holds. GitHub resets the allowance on the 1st, UTC.
 */
export const minutesBudget = (
  budget: ActionsMinutes,
  now: Date,
  width = 30,
  spend = 0,
): MinutesBudget => {
  const { used, included, left } = budget;
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const elapsed = Math.max((now.getTime() - start) / (end - start), 1 / (31 * 24));
  const projected = Math.round(used / elapsed) + spend;
  const leftAfter = Math.max(0, left - spend);
  const month = (format: Intl.DateTimeFormatOptions) =>
    new Date(start).toLocaleDateString("en-US", { ...format, timeZone: "UTC" });
  const lastDay = new Date(end - 1).getUTCDate();
  const filled = Math.round((left / included) * width);
  const filledAfter = Math.round((leftAfter / included) * width);
  const number = (value: number) => value.toLocaleString("en-US");
  const tone: MinutesBudget["tone"] =
    leftAfter < LOW_MINUTES
      ? "red"
      : leftAfter / included < 0.5 || projected > included
        ? "yellow"
        : "green";
  const pace = `At this pace${spend > 0 ? ", with this release," : ""} about ${number(projected)} used by ${month({ month: "long" })} ${lastDay}`;
  return {
    tone,
    title: `GitHub Actions minutes · ${month({ month: "long", year: "numeric" })}`,
    bar: `${"█".repeat(filledAfter)}${"▒".repeat(filled - filledAfter)}${"░".repeat(width - filled)}`,
    amount: `${number(left)} of ${number(included)} left · ${Math.round((used / included) * 100)}% used`,
    pace:
      projected > included
        ? `${pace}, over the ${number(included)} included: prefer this machine.`
        : `${pace}, within the ${number(included)} included.`,
    status: STATUS[tone],
    after:
      spend > 0
        ? `This release: about ${spend} min on GitHub, about ${number(leftAfter)} left after it`
        : null,
  };
};

/** Minutes GitHub bills for a run: each job rounds up to the minute; unfinished jobs are skipped. */
export const billedMinutes = (jobs: { startedAt: string | null; completedAt: string | null }[]) =>
  jobs.reduce((sum, { startedAt, completedAt }) => {
    if (!startedAt || !completedAt) return sum;
    const seconds = (Date.parse(completedAt) - Date.parse(startedAt)) / 1000;
    return sum + Math.max(1, Math.ceil(seconds / 60));
  }, 0);

// A deploy with no measured run and no typical figure: about what a small web deploy bills.
const FALLBACK_MINUTES = 5;

/**
 * What the GitHub path costs for these items: each workflow's recent runs when measured, typical
 * figures otherwise. An EAS build runs on EAS and costs no Actions minutes.
 */
export const deployEstimate = (
  items: ShipItem[],
  measured: Partial<Record<string, number[]>>,
  typical: Record<string, number>,
) => {
  const lines = items
    .filter(({ kind }) => kind !== "build")
    .map(({ app }) => {
      const runs = measured[app] ?? [];
      return runs.length > 0
        ? { app, minutes: Math.ceil(runs.reduce((a, b) => a + b, 0) / runs.length), measured: true }
        : { app, minutes: typical[app] ?? FALLBACK_MINUTES, measured: false };
    });
  return { total: lines.reduce((sum, { minutes }) => sum + minutes, 0), lines };
};
