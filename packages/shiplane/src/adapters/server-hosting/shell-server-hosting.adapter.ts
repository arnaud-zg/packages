import { z } from "zod";

import type { DeliveryAdapter } from "../../ports/adapter.port";
import type { ServerHostingPort } from "../../ports/server-hosting.port";
import { perEnv } from "../../application/config/perEnv";
import { defineServerHosting } from "../defineDelivery";

const ShellOptions = z.object({
  deploy: perEnv(z.array(z.string()).min(1)).describe(
    "The command that ships it, run from the root, as a list: [npx, my-tool, deploy]",
  ),
  url: perEnv(z.string()).optional().describe("Where it answers, for other units to read"),
});

/** Anything a command ships: the escape hatch until a host has its own adapter. */
export type ShellServerHostingAdapter = DeliveryAdapter<ServerHostingPort>;

export const shellServerHosting = (): ShellServerHostingAdapter =>
  defineServerHosting({
    name: "shell",
    settings: ShellOptions,
    describe: ({ options }) => options.deploy.join(" "),
    jobs: ({ tag, environment, options }) => {
      const [command = "true", ...args] = options.deploy;
      return [
        {
          label: `ship ${tag}: ${options.deploy.join(" ")}`,
          local: [{ command, args }],
          ci: { ref: tag },
          record: true,
        },
      ];
    },
  });
