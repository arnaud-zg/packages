import { z } from "zod";

import type { Environment } from "../../../domain/environment";
import type { DeliveryAdapter } from "../../../ports/adapter.port";
import type { Job, JobInput, Requirement } from "../../../ports/delivery.port";
import type { ServerHostingPort } from "../../../ports/server-hosting.port";
import { perEnv } from "../../../application/config/perEnv";

const ServerSettings = z.object({
  service: z.string().describe("The service it deploys"),
  url: perEnv(z.string()).optional().describe("Where it answers, for other apps to read"),
});

const Resolved = z.object({ service: z.string() });

/** A deploy a module asked for. */
export interface Asked {
  tag: string;
  environment: Environment;
  service: string;
}

/** A server host held in memory: it deploys nothing, and records each deploy it was asked for. */
export class ServerHostingFake implements ServerHostingPort {
  readonly capability = "server-hosting";

  private needs: Requirement[] = [];
  readonly received: Asked[] = [];

  /** What doctor checks for each app it ships. */
  seed({ requirements }: { requirements: Requirement[] }) {
    this.needs = requirements;
    return this;
  }

  describe = ({ options }: JobInput<Record<string, unknown>>) =>
    `${Resolved.parse(options).service} (fake)`;

  jobs = ({ tag, environment, options }: JobInput<Record<string, unknown>>): Job[] => {
    const { service } = Resolved.parse(options);
    this.received.push({ tag, environment, service });
    return [
      {
        label: `deploy ${tag} to ${service} (fake)`,
        local: [{ command: "echo", args: ["deploy", service, tag] }],
        ci: { ref: tag },
        record: true,
      },
    ];
  };

  requirements = () => this.needs;
}

/** The Fake as a config holds an adapter; `.fake` is what a test seeds and reads. */
export const serverHostingFake = (
  fake = new ServerHostingFake(),
): DeliveryAdapter<ServerHostingPort> & { fake: ServerHostingFake } => ({
  name: "fake",
  capability: "server-hosting",
  settings: ServerSettings,
  typicalMinutes: 1,
  requirements: () => fake.requirements(),
  create: () => fake,
  fake,
});
