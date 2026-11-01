import type { CiPipelinePort, Deploy, ServiceAdapter, Shell } from "shiplane/plugin";
import { actionsMinutes, billedMinutes, z } from "shiplane/plugin";

import { ghCli } from "./gh-cli";

const RunsSchema = z.array(
  z.object({ displayTitle: z.string(), status: z.string(), conclusion: z.string().nullish() }),
);
const UsageSummarySchema = z.object({
  usageItems: z.array(
    z.object({ sku: z.string(), grossQuantity: z.number(), unitType: z.string() }),
  ),
});
const JobsSchema = z.array(
  z.object({ startedAt: z.string().nullable(), completedAt: z.string().nullable() }),
);

/** Workflow runs, dispatches and the Actions minutes budget through the gh CLI. */
const githubActions = (root: string, shell: Shell, shipWorkflow: string): CiPipelinePort => {
  const { must, json } = ghCli(root, shell);
  const runs = async (workflow: string): Promise<Deploy[]> => {
    // A workflow not on the default branch yet has no runs, which gh reports as an error.
    const listed = await json([
      "run",
      "list",
      "--workflow",
      workflow,
      "--limit",
      "100",
      "--json",
      "displayTitle,status,conclusion",
    ]).catch(() => []);
    return RunsSchema.parse(listed).map(({ displayTitle, status, conclusion }) => ({
      title: displayTitle,
      state: status !== "completed" ? "running" : conclusion === "success" ? "done" : "none",
    }));
  };

  return {
    shipWorkflow,
    workflowRuns: runs,
    dispatch: async (workflow, ref, inputs) => {
      await must([
        "workflow",
        "run",
        workflow,
        "--ref",
        ref,
        ...Object.entries(inputs).flatMap(([key, value]) => ["-f", `${key}=${value}`]),
      ]);
    },
    minutes: async () => {
      try {
        const [plan, summary] = await Promise.all([
          must(["api", "orgs/{owner}", "--jq", ".plan.name"]),
          json(["api", "organizations/{owner}/settings/billing/usage/summary"]),
        ]);
        return actionsMinutes(plan.trim(), UsageSummarySchema.parse(summary).usageItems);
      } catch {
        return null;
      }
    },
    measuredMinutes: async (workflow) => {
      try {
        const ids = z
          .array(z.object({ databaseId: z.number() }))
          .parse(
            await json([
              "run",
              "list",
              "--workflow",
              workflow,
              "--status",
              "success",
              "--limit",
              "3",
              "--json",
              "databaseId",
            ]),
          );
        return await Promise.all(
          ids.map(async ({ databaseId }) =>
            billedMinutes(
              JobsSchema.parse(
                await json([
                  "api",
                  `repos/{owner}/{repo}/actions/runs/${databaseId}/jobs`,
                  "--jq",
                  "[.jobs[] | {startedAt: .started_at, completedAt: .completed_at}]",
                ]),
              ),
            ),
          ),
        );
      } catch {
        return [];
      }
    },
  };
};

export type GitHubActionsCiPipelineAdapter = ServiceAdapter<CiPipelinePort>;

/**
 * Workflow runs, dispatches and the minutes budget on GitHub Actions, through the gh CLI. Shipping
 * through it dispatches `shipWorkflow` (default `ship.yml`) with `units` and `environment`.
 */
export const gitHubActionsCiPipeline = ({
  shipWorkflow = "ship.yml",
}: { shipWorkflow?: string } = {}): GitHubActionsCiPipelineAdapter => ({
  name: "github-actions",
  requirements: () => [
    {
      label: "gh",
      check: { command: "gh", args: ["auth", "status"] },
      fix: { command: "gh", args: ["auth", "login"] },
    },
  ],
  create: ({ root, shell }) => githubActions(root, shell, shipWorkflow),
});
