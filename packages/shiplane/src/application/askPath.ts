import type { ActionsMinutes } from "../domain/budget";
import type { DeployPath, ShipItem } from "../domain/deploys";
import type { Environment } from "../domain/environment";
import type { ReleaseContext } from "./context";
import { deployEstimate, minutesBudget } from "../domain/budget";
import { fail, paint } from "./say";

export interface Shipment {
  item: ShipItem;
  /** The workflow its jobs dispatch on GitHub Actions, if any. */
  workflows: string[];
  typicalMinutes: number | undefined;
}

export const PATH_LABEL: Record<DeployPath, string> = {
  github: "GitHub Actions",
  local: "this machine",
};

/** The minutes block above the question: status, what is left, this release shaded in, the pace. */
const showMinutes = (
  { output, clock }: ReleaseContext,
  budget: ActionsMinutes,
  estimate: ReturnType<typeof deployEstimate>,
) => {
  const drawn = minutesBudget(budget, clock.now(), 30, estimate.total);
  output.line();
  output.line(`  ${paint("bold", drawn.title)}   ${paint(["bold", drawn.tone], drawn.status)}`);
  output.line(`  ${paint(drawn.tone, drawn.bar)}  ${paint(["bold", drawn.tone], drawn.amount)}`);
  if (drawn.after) {
    output.line(`  ${drawn.after}`);
    const each = estimate.lines.map(
      ({ app, minutes, measured }) =>
        `${app} ~${minutes} ${measured ? "(its last runs)" : "(typical, no run yet)"}`,
    );
    output.line(`  ${paint("dim", `  ${each.join(" · ")}`)}`);
  }
  output.line(`  ${paint("dim", drawn.pace)}`);
  output.line();
};

/**
 * How each unit ships, asked one by one with this month's Actions minutes shown once: GitHub Actions
 * or this machine, in the order given. Null when cancelled or without a terminal to ask.
 */
export const askPaths = async (
  context: ReleaseContext,
  environment: Environment,
  shipments: readonly Shipment[],
): Promise<DeployPath[] | null> => {
  const { services, prompter, clock } = context;
  const measured = Object.fromEntries(
    await Promise.all(
      shipments.map(async ({ item, workflows }) => [
        item.app,
        (
          await Promise.all(
            workflows.map((workflow) => services.ciPipeline.measuredMinutes(workflow)),
          )
        ).flat(),
      ]),
    ),
  );
  const typical = Object.fromEntries(
    shipments.flatMap(({ item, typicalMinutes }) =>
      typicalMinutes === undefined ? [] : [[item.app, typicalMinutes]],
    ),
  );
  const estimate = deployEstimate(
    shipments.map(({ item }) => item),
    measured,
    typical,
  );
  const budget = await services.ciPipeline.minutes();
  if (budget) showMinutes(context, budget, estimate);
  if (!prompter.interactive) {
    fail(context, "Not a terminal", "say how to ship.", [
      "shiplane ship --via github",
      "shiplane ship --via local",
    ]);
    return null;
  }
  const low =
    budget !== null && minutesBudget(budget, clock.now(), 30, estimate.total).tone === "red";
  const paths: DeployPath[] = [];
  for (const { item } of shipments) {
    const minutes = estimate.lines.find(({ app }) => app === item.app)?.minutes;
    const path = await prompter.select<DeployPath>(
      `How should ${item.tag} ship to ${environment}?`,
      [
        {
          value: "github",
          label: PATH_LABEL.github,
          hint: budget
            ? `runs on GitHub from its tag, about ${minutes} of ${budget.left.toLocaleString("en-US")} minutes left`
            : "its workflow runs on GitHub, from its tag",
        },
        {
          value: "local",
          label: PATH_LABEL.local,
          hint: "the same commands, run here: no Actions minutes",
        },
      ],
      low ? "local" : "github",
    );
    if (!path) return null;
    paths.push(path);
  }
  return paths;
};
