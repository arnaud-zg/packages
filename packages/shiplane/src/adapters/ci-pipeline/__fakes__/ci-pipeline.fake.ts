import type { ActionsMinutes } from "../../../domain/budget";
import type { ServiceAdapter } from "../../../ports/adapter.port";
import type { CiPipelinePort } from "../../../ports/ci-pipeline.port";
import type { Deploy } from "../../../ports/code-host.port";

interface PipelineState {
  workflowRuns: Record<string, Deploy[]>;
  minutes: ActionsMinutes | null;
  measured: Record<string, number[]>;
}

export interface Dispatched {
  type: "dispatch";
  workflow: string;
  ref: string;
  inputs: Record<string, string>;
}

/** A CI pipeline held in memory: seed its runs and minutes, read back what was dispatched. */
export class CiPipelineFake implements CiPipelinePort {
  private state: PipelineState = { workflowRuns: {}, minutes: null, measured: {} };

  readonly received: Dispatched[] = [];

  constructor(readonly shipWorkflow = "ship.yml") {}

  seed(state: Partial<PipelineState>) {
    this.state = { ...this.state, ...state };
    return this;
  }

  workflowRuns = (workflow: string) => Promise.resolve(this.state.workflowRuns[workflow] ?? []);

  dispatch = (workflow: string, ref: string, inputs: Record<string, string>) => {
    this.received.push({ type: "dispatch", workflow, ref, inputs });
    return Promise.resolve();
  };

  minutes = () => Promise.resolve(this.state.minutes);
  measuredMinutes = (workflow: string) => Promise.resolve(this.state.measured[workflow] ?? []);
}

/** The Fake as a config holds an adapter; `.fake` is what a test seeds and reads. */
export const ciPipelineFake = (
  fake = new CiPipelineFake(),
): ServiceAdapter<CiPipelinePort> & { fake: CiPipelineFake } => ({
  name: "fake",
  create: () => fake,
  fake,
});
