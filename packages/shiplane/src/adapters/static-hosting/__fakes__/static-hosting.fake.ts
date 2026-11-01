import { z } from "zod";

import type { Environment } from "../../../domain/environment";
import type { DeliveryAdapter } from "../../../ports/adapter.port";
import type { Job, JobInput, Requirement } from "../../../ports/delivery.port";
import type { StaticHostingPort } from "../../../ports/static-hosting.port";

const StaticSettings = z.object({
  site: z.string().describe("The site it uploads to"),
});

/** An upload a module asked for. */
export interface Asked {
  tag: string;
  environment: Environment;
  site: string;
}

/** A static host held in memory: it uploads nothing, and records each upload it was asked for. */
export class StaticHostingFake implements StaticHostingPort {
  readonly capability = "static-hosting";

  private needs: Requirement[] = [];
  readonly received: Asked[] = [];

  /** What doctor checks for each app it ships. */
  seed({ requirements }: { requirements: Requirement[] }) {
    this.needs = requirements;
    return this;
  }

  describe = ({ options, environment }: JobInput<Record<string, unknown>>) =>
    `${StaticSettings.parse(options).site} (fake, ${environment})`;

  jobs = ({ tag, environment, options }: JobInput<Record<string, unknown>>): Job[] => {
    const { site } = StaticSettings.parse(options);
    this.received.push({ tag, environment, site });
    return [
      {
        label: `build ${tag} and upload it to ${site} (fake)`,
        local: [{ command: "echo", args: ["upload", site, tag] }],
        ci: { ref: tag },
        record: true,
      },
    ];
  };

  requirements = () => this.needs;
}

/** The Fake as a config holds an adapter; `.fake` is what a test seeds and reads. */
export const staticHostingFake = (
  fake = new StaticHostingFake(),
): DeliveryAdapter<StaticHostingPort> & { fake: StaticHostingFake } => ({
  name: "fake",
  capability: "static-hosting",
  settings: StaticSettings,
  typicalMinutes: 1,
  requirements: () => fake.requirements(),
  create: () => fake,
  fake,
});
