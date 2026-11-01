import type { Release } from "../application/config/loadRelease";
import type { ReleaseContext } from "../application/context";
import type { ReleaseUnit } from "../domain/unit";
import type { Feature, ReleaseModule } from "../modules/module";
import { ciPipelineFake } from "../adapters/ci-pipeline/__fakes__/ci-pipeline.fake";
import { codeHostFake } from "../adapters/code-host/__fakes__/code-host.fake";
import { RecordingShell } from "../adapters/shell/__fakes__/shell.fake";
import { sourceControlFake } from "../adapters/source-control/__fakes__/source-control.fake";
import { RecordingProgress } from "../adapters/terminal/__fakes__/progress.fake";
import {
  FixedClock,
  MemoryOutput,
  ScriptedPrompter,
} from "../adapters/terminal/__fakes__/terminal.fake";
import { versioningFake } from "../adapters/versioning/__fakes__/versioning.fake";
import { releaseFlow } from "../application/releaseFlow";
import { DEFAULT_TAG_FORMAT } from "../domain/tags";

export const testUnit = (name: string, overrides: Partial<ReleaseUnit> = {}): ReleaseUnit => ({
  name,
  dir: `apps/${name}`,
  file: `apps/${name}/shiplane.unit.yml`,
  packageName: `@acme/${name}`,
  version: "0.1.0",
  module: "web-app",
  options: {},
  after: [],
  ...overrides,
});

/** The flow's Fakes, as adapters a config would hold. */
interface FlowFakes {
  sourceControl: ReturnType<typeof sourceControlFake>;
  codeHost: ReturnType<typeof codeHostFake>;
  ciPipeline: ReturnType<typeof ciPipelineFake>;
  versioning: ReturnType<typeof versioningFake>;
}

/**
 * A release over a Fake of every port the flow runs on, answered by a scripted person. The apps are
 * in release order as given: the first is the Latest release.
 */
export const testContext = ({
  units,
  modules = [],
  features = [],
  yes = false,
  interactive = true,
  root = "/repo",
  tagFormat = DEFAULT_TAG_FORMAT,
  commitsWithoutChangeset = "release",
}: {
  units: ReleaseUnit[];
  modules?: ReleaseModule[];
  /** The features, or how to make them from the flow's Fakes they share. */
  features?: Feature[] | ((flow: FlowFakes) => Feature[]);
  yes?: boolean;
  interactive?: boolean;
  root?: string;
  tagFormat?: string;
  /** A release skips commits no changeset names; the config default ignores them. */
  commitsWithoutChangeset?: "release" | "ignore";
}) => {
  const sourceControl = sourceControlFake();
  const codeHost = codeHostFake();
  const ciPipeline = ciPipelineFake();
  const versioning = versioningFake();
  const prompter = new ScriptedPrompter(interactive);
  const output = new MemoryOutput();
  const progress = new RecordingProgress(output);
  const shell = new RecordingShell();
  const fakes = { sourceControl, codeHost, ciPipeline, versioning };
  const flow = releaseFlow(fakes);
  const release: Release = {
    root,
    flow,
    modules,
    features: typeof features === "function" ? features(fakes) : features,
    units,
    problems: [],
    tagFormat,
    releasesCommits: commitsWithoutChangeset === "release",
  };
  const context: ReleaseContext = {
    release,
    load: () => Promise.resolve(release),
    services: {
      sourceControl: sourceControl.fake,
      codeHost: codeHost.fake,
      ciPipeline: ciPipeline.fake,
      versioning: versioning.fake,
    },
    open: (adapter) => adapter.create({ root, shell }),
    prompter,
    output,
    progress,
    clock: new FixedClock(new Date("2026-10-12T09:00:00Z")),
    shell,
    options: { yes, ci: false },
  };
  return {
    context,
    flow: fakes,
    source: sourceControl.fake,
    host: codeHost.fake,
    ci: ciPipeline.fake,
    versioning: versioning.fake,
    prompter,
    output,
    progress,
    shell,
  };
};

export const changesetText = (packages: Record<string, string>, summary: string) =>
  `---\n${Object.entries(packages)
    .map(([name, type]) => `"${name}": ${type}`)
    .join("\n")}\n---\n\n${summary}\n`;
