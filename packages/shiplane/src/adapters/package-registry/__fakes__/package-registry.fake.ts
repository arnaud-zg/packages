import { z } from "zod";

import type { Environment } from "../../../domain/environment";
import type { DeliveryAdapter } from "../../../ports/adapter.port";
import type {
  DecideContext,
  Decision,
  Job,
  JobInput,
  Requirement,
} from "../../../ports/delivery.port";
import type { PackageRegistryPort } from "../../../ports/package-registry.port";

const PackageSettings = z.object({
  tag: z.string().default("latest").describe("The dist-tag a release moves"),
});

/** What a module asked of it. */
export interface Asked {
  stage: "jobs" | "decide";
  tag: string;
  environment: Environment;
}

/** A package registry held in memory: seed what is published, a version not there yet publishes. */
export class PackageRegistryFake implements PackageRegistryPort {
  readonly capability = "package-registry";

  /** `<package>@<version>` already published. */
  private published = new Set<string>();
  private needs: Requirement[] = [];
  readonly received: Asked[] = [];

  seed({
    published = [],
    requirements = [],
  }: {
    published?: string[];
    requirements?: Requirement[];
  }) {
    this.published = new Set(published);
    this.needs = requirements;
    return this;
  }

  describe = ({ unit, options }: JobInput<Record<string, unknown>>) =>
    `${unit.packageName} (fake, ${PackageSettings.parse(options).tag})`;

  jobs = ({ unit, tag, environment, options }: JobInput<Record<string, unknown>>): Job[] => {
    this.received.push({ stage: "jobs", tag, environment });
    return [
      {
        label: `publish ${unit.packageName}@${unit.version} under ${PackageSettings.parse(options).tag} (fake)`,
        local: [{ command: "echo", args: ["publish", unit.packageName, unit.version] }],
      },
    ];
  };

  decide = (_context: DecideContext, input: JobInput<Record<string, unknown>>) => {
    const { unit, tag, environment } = input;
    this.received.push({ stage: "decide", tag, environment });
    const decision: Decision = this.published.has(`${unit.packageName}@${unit.version}`)
      ? { action: "none", status: `${unit.packageName}@${unit.version} is published` }
      : { action: "ship", kind: "publish", jobs: this.jobs(input) };
    return Promise.resolve(decision);
  };

  live = (_context: DecideContext, { unit }: JobInput<Record<string, unknown>>) =>
    Promise.resolve(this.published.has(`${unit.packageName}@${unit.version}`));

  requirements = () => this.needs;
}

/** The Fake as a config holds an adapter; `.fake` is what a test seeds and reads. */
export const packageRegistryFake = (
  fake = new PackageRegistryFake(),
): DeliveryAdapter<PackageRegistryPort> & { fake: PackageRegistryFake } => ({
  name: "fake",
  capability: "package-registry",
  settings: PackageSettings,
  typicalMinutes: 1,
  requirements: () => fake.requirements(),
  create: () => fake,
  fake,
});
