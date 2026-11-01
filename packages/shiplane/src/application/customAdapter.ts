/** A port a custom adapter fills: the flow's four, then the four ways an app is delivered. */
export interface CustomPort {
  /** `ciPipeline`: the key it takes in `releaseFlow`, or the module option. */
  key: string;
  /** `CiPipelinePort`. */
  type: string;
  /** "CI pipeline", as a person reads it. */
  label: string;
  kind: "flow" | "delivery";
  /** The contract's subject beyond `port`, or the settings a delivery contract runs with. */
  subject: string;
}

export const CUSTOM_PORTS = {
  sourceControl: {
    key: "sourceControl",
    type: "SourceControlPort",
    label: "source control",
    kind: "flow",
    subject: `head: async () => (await port.position()).head,
    // TODO: write a file the repository does not track yet.
    change: () => Promise.resolve(),`,
  },
  codeHost: {
    key: "codeHost",
    type: "CodeHostPort",
    label: "code host",
    kind: "flow",
    subject: `// TODO: a branch pushed with one commit, a tag, an issue comments can go on.
    branch: (name) => Promise.resolve(name),
    tag: () => Promise.resolve("app@1.0.0"),
    issue: { repository: "acme/repo", number: 1 },`,
  },
  ciPipeline: {
    key: "ciPipeline",
    type: "CiPipelinePort",
    label: "CI pipeline",
    kind: "flow",
    subject: `// TODO: a workflow that exists and has never run.
    idle: "ship.yml",`,
  },
  versioning: {
    key: "versioning",
    type: "VersioningPort",
    label: "versioning",
    kind: "flow",
    subject: `// TODO: a package this workspace holds, and its folder.
    workspace: { name: "@acme/api", folder: "apps/api" },`,
  },
  serverHosting: {
    key: "serverHosting",
    type: "ServerHostingPort",
    label: "server hosting",
    kind: "delivery",
    subject: `{}`,
  },
  staticHosting: {
    key: "staticHosting",
    type: "StaticHostingPort",
    label: "static hosting",
    kind: "delivery",
    subject: `{}`,
  },
  mobileDistribution: {
    key: "mobileDistribution",
    type: "MobileDistributionPort",
    label: "mobile distribution",
    kind: "delivery",
    subject: `{}`,
  },
  packageRegistry: {
    key: "packageRegistry",
    type: "PackageRegistryPort",
    label: "package registry",
    kind: "delivery",
    subject: `{}`,
  },
} as const satisfies Record<string, CustomPort>;

export type CustomPortKey = keyof typeof CUSTOM_PORTS;

/** `jenkinsCiPipeline` → `jenkins-ci-pipeline`. */
export const kebab = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

/** A factory name a person can type: a letter, then letters and digits. */
export const isFactoryName = (name: string) => /^[a-z][a-zA-Z0-9]*$/.test(name);

/** The name offered first: `customCiPipeline`. */
export const suggestedName = (port: CustomPortKey) =>
  `custom${port.charAt(0).toUpperCase()}${port.slice(1)}`;

/** Where a custom adapter lives, and what the config imports it from. */
export const customFiles = (name: string) => ({
  file: `shiplane/adapters/${kebab(name)}.ts`,
  test: `shiplane/adapters/${kebab(name)}.test.ts`,
  from: `./shiplane/adapters/${kebab(name)}`,
});

const share = (name: string) =>
  ` * Works? Share it: publish it as shiplane-${kebab(name)}, or open a pull request at
 * https://github.com/arnaud-zg/packages so everyone gets it.`;

/** The adapter's file: shiplane's in-memory one under your name, ready to be replaced. */
export const renderCustomAdapter = (port: CustomPortKey, name: string, pkg: string) => {
  const { type, label, kind } = CUSTOM_PORTS[port];
  const memory = `${port}Memory`;
  if (kind === "delivery") {
    return `import type { DeliveryAdapter, ${type} } from "${pkg}";
import { z } from "${pkg}";
import { ${memory} } from "${pkg}/memory";

/**
 * ${name}: your own ${label}. It starts in memory: it records each delivery it is asked for and
 * ships nothing, so the release runs end to end while you write it. To make it real, replace the
 * spread with define${type.replace(/Port$/, "")}({ ... }) from "${pkg}" (see: shiplane docs ${port}).
 * ${kebab(name)}.test.ts runs the contract every ${label} passes.
${share(name)}
 */
export const ${name} = (): DeliveryAdapter<${type}> => ({
  ...${memory}(),
  name: "${name}",
  // The keys an app's unit file gives it: add yours, such as z.object({ service: z.string() }).
  settings: z.object({}),
});
`;
  }
  return `import type { ${type}, ServiceAdapter } from "${pkg}";
import { ${memory} } from "${pkg}/memory";

/**
 * ${name}: your own ${label}. It starts in memory: it records each call and does nothing real, so
 * the release runs end to end while you write it. Replace its methods one at a time;
 * ${kebab(name)}.test.ts runs the contract every ${label} passes.
${share(name)}
 */
export const ${name} = (): ServiceAdapter<${type}> => ({
  name: "${name}",
  create: (context) => {
    const port: ${type} = ${memory}().create(context);
    // TODO: replace what it does with your own calls, for example:
    // port.someMethod = async (...args) => { ... };
    return port;
  },
});
`;
};

/** Its test: the port's contract, run on it. */
export const renderCustomTest = (port: CustomPortKey, name: string, pkg: string) => {
  const { kind, subject } = CUSTOM_PORTS[port];
  const contract = `${port}Contract`;
  const file = `./${kebab(name)}`;
  if (kind === "delivery") {
    return `import { ${contract} } from "${pkg}/testing";

import { ${name} } from "${file}";

// The contract every ${CUSTOM_PORTS[port].label} passes. TODO: the settings an app gives it.
${contract}([{ adapter: ${name}(), settings: ${subject} }]);
`;
  }
  return `import { ${contract}, systemShell } from "${pkg}/testing";

import { ${name} } from "${file}";

// The contract every ${CUSTOM_PORTS[port].label} passes: green means ${name} is done.
${contract}("${name}", () => {
  const port = ${name}().create({ root: process.cwd(), shell: systemShell });
  return Promise.resolve({
    port,
    ${subject}
  });
});
`;
};
