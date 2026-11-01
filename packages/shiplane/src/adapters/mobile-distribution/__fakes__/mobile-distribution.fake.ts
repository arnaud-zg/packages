import { z } from "zod";

import type { Environment } from "../../../domain/environment";
import type { DeliveryAdapter } from "../../../ports/adapter.port";
import type {
  DecideContext,
  Decision,
  Health,
  Job,
  JobInput,
  Requirement,
} from "../../../ports/delivery.port";
import type { MobileDistributionPort } from "../../../ports/mobile-distribution.port";

const MobileSettings = z.object({
  app: z.string().describe("The app it ships to the stores and over the air"),
});

const DECIDED_BY = {
  platform: "the fake platform",
  choice: "update or nothing",
  check: "shiplane status",
};

interface MobileState {
  /** The version each environment runs. */
  live: Partial<Record<Environment, string>>;
  /** How each tag does where it runs. */
  health: Record<string, Health>;
  requirements: Requirement[];
}

/** What a module asked of it. */
export interface Asked {
  stage: "jobs" | "decide" | "health" | "inspect";
  tag: string;
  environment: Environment;
}

/**
 * A mobile platform held in memory: seed what each environment runs and how a tag does; a version
 * not live yet ships as an update.
 */
export class MobileDistributionFake implements MobileDistributionPort {
  readonly capability = "mobile-distribution";

  private state: MobileState = { live: {}, health: {}, requirements: [] };
  readonly received: Asked[] = [];

  seed(state: Partial<MobileState>) {
    this.state = { ...this.state, ...state };
    return this;
  }

  private ask(stage: Asked["stage"], { tag, environment }: JobInput<Record<string, unknown>>) {
    this.received.push({ stage, tag, environment });
  }

  describe = ({ options, environment }: JobInput<Record<string, unknown>>) =>
    `${MobileSettings.parse(options).app} on ${environment} (fake)`;

  jobs = (input: JobInput<Record<string, unknown>>): Job[] => {
    this.ask("jobs", input);
    const { tag, environment, options } = input;
    const { app } = MobileSettings.parse(options);
    return [
      {
        label: `publish ${tag} to ${app} on ${environment} (fake)`,
        local: [{ command: "echo", args: ["update", app, tag] }],
        ci: { ref: tag },
      },
    ];
  };

  decide = (_context: DecideContext, input: JobInput<Record<string, unknown>>) => {
    this.ask("decide", input);
    const { unit, environment } = input;
    const decision: Decision =
      this.state.live[environment] === unit.version
        ? { action: "none", status: `${unit.name} ${unit.version} is on ${environment}` }
        : { action: "ship", kind: "update", jobs: this.jobs(input) };
    return Promise.resolve(decision);
  };

  health = (_context: DecideContext, input: JobInput<Record<string, unknown>>) => {
    this.ask("health", input);
    return Promise.resolve(this.state.health[input.tag] ?? null);
  };

  inspect = (_context: DecideContext, input: JobInput<Record<string, unknown>>) => {
    this.ask("inspect", input);
    return Promise.resolve({ live: this.state.live[input.environment] ?? null });
  };

  requirements = () => this.state.requirements;
}

/** The Fake as a config holds an adapter; `.fake` is what a test seeds and reads. */
export const mobileDistributionFake = (
  fake = new MobileDistributionFake(),
): DeliveryAdapter<MobileDistributionPort> & { fake: MobileDistributionFake } => ({
  name: "fake",
  capability: "mobile-distribution",
  settings: MobileSettings,
  typicalMinutes: 1,
  decidedBy: DECIDED_BY,
  requirements: () => fake.requirements(),
  create: () => fake,
  fake,
});
