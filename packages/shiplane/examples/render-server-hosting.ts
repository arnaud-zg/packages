import { defineServerHosting, z } from "shiplane/plugin";

export const renderServerHosting = () =>
  defineServerHosting({
    name: "render",
    settings: z.object({ service: z.string().describe("The Render service") }),
    describe: ({ options }) => `${options.service} on Render`,
    requirements: () => [
      {
        label: "render",
        check: { command: "render", args: ["whoami"] },
        fix: { command: "render", args: ["login"] },
      },
    ],
    jobs: ({ tag, options }) => [
      {
        label: `deploy ${tag}`,
        local: [{ command: "render", args: ["deploys", "create", options.service] }],
      },
    ],
  });
