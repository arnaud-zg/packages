import type { SetupContext } from "./setupContext";
import { paint } from "./say";
import { addToConfig, CONFIG_FILE, factoryName, releasePackage } from "./setupFiles";

const adapterFile = (
  name: string,
  factory: string,
  pkg: string,
) => `import { defineServerHosting, z } from "${pkg}";

/** Hosts a server on ${name}. Replace the command with the one that deploys it. */
export const ${factory} = () =>
  defineServerHosting({
    name: "${name}",
    settings: z.object({
      service: z.string().describe("What to deploy"),
    }),
    describe: ({ options }) => \`\${options.service} on ${name}\`,
    jobs: ({ tag, options }) => [
      {
        label: \`deploy \${tag} to \${options.service}\`,
        local: [{ command: "echo", args: ["deploy", options.service] }],
      },
    ],
  });
`;

const testFile = (
  name: string,
  factory: string,
  pkg: string,
) => `import { serverHostingContract, serverHostingFake } from "${pkg}/testing";

import { ${factory} } from "./${name}";

// The contract every server host passes, run on this adapter and on the Fake tests use in its place.
serverHostingContract([
  { adapter: ${factory}(), settings: { service: "web-preview" } },
  { adapter: serverHostingFake(), settings: { service: "web-preview" } },
]);
`;

/**
 * `shiplane adapter new <name>`: a server hosting adapter, the port's contract suite run on it and on
 * its Fake, and a module for it in the root config.
 */
export const newAdapter = async (context: SetupContext, name: string): Promise<boolean> => {
  const { output, files } = context;
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    output.line(
      `${paint("red", "✗")}  an adapter name is lowercase words joined by dashes, like my-host`,
    );
    return false;
  }
  const factory = `${factoryName(name)}ServerHosting`;
  const pkg = releasePackage(files);
  const file = `release/adapters/${name}.ts`;
  if (files.exists(file)) {
    output.line(`${paint("red", "✗")}  ${file} already exists`);
    return false;
  }
  const config = addToConfig(
    files.read(CONFIG_FILE) ?? "",
    {
      factory: "backendService",
      port: "serverHosting",
      adapter: factory,
      name,
      from: `./release/adapters/${name}`,
    },
    pkg,
  );
  if (!config) {
    output.line(
      `${paint("red", "✗")}  ${CONFIG_FILE} has no modules list to add it to: run shiplane init first`,
    );
    return false;
  }
  files.write(file, adapterFile(name, factory, pkg));
  files.write(`release/adapters/${name}.test.ts`, testFile(name, factory, pkg));
  files.write(CONFIG_FILE, config);
  output.line(
    `${paint("green", "◇")}  Wrote ${file}, its contract test, and a ${name} module in ${CONFIG_FILE}`,
  );
  output.line(
    `${paint("dim", "└")}  Next: point an app at it with ${paint("cyan", `module: ${name}`)}`,
  );
  return Promise.resolve(true);
};
