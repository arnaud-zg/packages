import type { ActionsMinutes } from "../domain/budget";
import type { Deploy } from "./code-host.port";

/** Where workflows run: dispatched on a ref, their runs read back, the minutes they cost. */
export interface CiPipelinePort {
  /** The one workflow that ships on CI: `shiplane ship` on a runner, given units and an environment. */
  readonly shipWorkflow: string;
  /** A workflow's runs, each titled `Deploy <tag> to <environment>` when it deploys. */
  workflowRuns: (workflow: string) => Promise<Deploy[]>;
  dispatch: (workflow: string, ref: string, inputs: Record<string, string>) => Promise<void>;
  /** This month's minutes, or null when the pipeline won't say. */
  minutes: () => Promise<ActionsMinutes | null>;
  /** Billed minutes of a workflow's last successful runs. */
  measuredMinutes: (workflow: string) => Promise<number[]>;
}
