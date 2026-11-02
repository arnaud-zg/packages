import path from "node:path";
import { z } from "zod";

import type { Release } from "../application/config/loadRelease";
import type { SetupContext } from "../application/setupContext";
import type { ReleaseFlow, ReleaseModule } from "../modules/module";
import type { AnyDeliveryAdapter } from "../modules/suggest";
import type { Detection, FolderView } from "../ports/delivery.port";
import { ciPipelineFake } from "../adapters/ci-pipeline/__fakes__/ci-pipeline.fake";
import { codeHostFake } from "../adapters/code-host/__fakes__/code-host.fake";
import { MemoryFiles } from "../adapters/files/__fakes__/memory-files.fake";
import { serverHostingFake } from "../adapters/server-hosting/__fakes__/server-hosting.fake";
import { RecordingShell } from "../adapters/shell/__fakes__/shell.fake";
import { sourceControlFake } from "../adapters/source-control/__fakes__/source-control.fake";
import { MemoryOutput, ScriptedPrompter } from "../adapters/terminal/__fakes__/terminal.fake";
import { versioningFake } from "../adapters/versioning/__fakes__/versioning.fake";
import { readUnitFile, UNIT_FILES } from "../application/config/readUnitFile";
import { expandPatterns, workspacePatterns } from "../application/config/workspaceFolders";
import { releaseFlow } from "../application/releaseFlow";
import { CONFIG_FILE } from "../application/setupFiles";
import { DEFAULT_TAG_FORMAT } from "../domain/tags";
import { moduleFor, suggestedModule } from "../modules/suggest";

/** A flow of Fakes: nothing reaches git, a code host or CI. */
export const fakeFlow = (): ReleaseFlow =>
  releaseFlow({
    sourceControl: sourceControlFake(),
    codeHost: codeHostFake(),
    ciPipeline: ciPipelineFake(),
    versioning: versioningFake(),
  });

/** An in-memory adapter that is sure of a folder holding `marker`, as a real plugin's detect is. */
export const detecting = <Adapter extends AnyDeliveryAdapter>(
  adapter: Adapter,
  name: string,
  marker: string,
  options: (folder: FolderView) => Record<string, unknown> = () => ({}),
): Adapter => ({
  ...adapter,
  name,
  detect: (folder: FolderView): Detection | null =>
    folder.has(marker) ? { certainty: "found", reason: marker, options: options(folder) } : null,
});

/**
 * The release as it would load, read from files in memory: the config's flow and modules are given
 * (a config is code, and this never runs it), every unit file is read and checked for real.
 */
export const memoryLoad =
  (root: string, files: MemoryFiles, compose: () => { modules: ReleaseModule[] }) =>
  (): Promise<Release> => {
    const empty = { root, flow: fakeFlow(), tagFormat: DEFAULT_TAG_FORMAT, features: [] };
    if (!files.exists(CONFIG_FILE)) {
      return Promise.resolve({
        ...empty,
        modules: [],
        units: [],
        problems: [{ file: CONFIG_FILE, message: "No shiplane.config.ts in this repository" }],
      });
    }
    const { modules } = compose();
    const read = expandPatterns(files, workspacePatterns(files)).flatMap((dir) => {
      const file = UNIT_FILES.map((name) => path.posix.join(dir, name)).find((at) =>
        files.exists(at),
      );
      if (!file) return [];
      const result = readUnitFile(file, files.read(file) ?? "", modules);
      const manifest = JSON.parse(files.read(path.posix.join(dir, "package.json")) ?? "{}") as {
        name?: string;
        version?: string;
      };
      return [{ dir, file, result, manifest }];
    });
    return Promise.resolve({
      ...empty,
      modules,
      problems: read.flatMap(({ result }) => result.problems),
      units: read.flatMap(({ dir, file, result, manifest }) =>
        result.unit
          ? [
              {
                name: path.posix.basename(dir),
                dir,
                file,
                packageName: manifest.name ?? dir,
                version: manifest.version ?? "0.0.0",
                module: result.unit.module,
                ...(result.unit.buildCommand ? { buildCommand: result.unit.buildCommand } : {}),
                options: result.unit.options,
                after: [],
              },
            ]
          : [],
      ),
    });
  };

/** A whole setup run in memory: files, shell, person and output are Fakes; adapters are given. */
export const memoryRepository = (
  files: Record<string, string>,
  adapters: AnyDeliveryAdapter[],
  { interactive = true }: { interactive?: boolean } = {},
) => {
  const root = "/memory/acme";
  const memory = new MemoryFiles(files);
  const shell = new RecordingShell();
  const prompter = new ScriptedPrompter(interactive);
  const output = new MemoryOutput();
  // The modules a written config composes: one per kind its unit files name, from these adapters.
  const compose = () => {
    const named = new Set(
      Object.entries(memory.all)
        .filter(([file]) => UNIT_FILES.some((name) => file.endsWith(name)))
        .map(([, text]) => /^module:\s*(\S+)/m.exec(text)?.[1] ?? ""),
    );
    const modules = adapters.map((adapter) => moduleFor(adapter, suggestedModule(adapter).kind));
    const custom = [...named]
      .filter((name) => !modules.some((module) => module.name === name))
      .filter((name) => memory.exists(`shiplane/adapters/${name}.ts`))
      // A custom adapter is code this never runs: it stands in as the in-memory one it starts as.
      .map((name) => moduleFor({ ...serverHostingFake(), name, settings: z.object({}) }, name));
    return { modules: [...modules, ...custom] };
  };
  const context: SetupContext = {
    root,
    files: memory,
    shell,
    prompter,
    output,
    adapters,
    load: memoryLoad(root, memory, compose),
  };
  return { context, files: memory, shell, prompter, output };
};
