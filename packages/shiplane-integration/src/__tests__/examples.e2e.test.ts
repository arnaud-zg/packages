import fs from "node:fs";
import path from "node:path";
import type { ConsumerRepository } from "shiplane/testing";
import { afterAll, describe, expect, it } from "vitest";

import { exampleRepository, quoted, REPOSITORY_ROOT } from "../examples";

interface Example {
  name: string;
  /** The package whose page quotes the example, and whose examples/ folder it is. */
  package: string;
  folder: string;
  /** The page that quotes it, in the package: its README unless said. */
  page?: string;
  /** The example files the README shows in full. */
  shows: string[];
  /** The commands whose output the README shows, run in the example repository. */
  runs: string[][];
  branch?: string;
}

// Each package's page quotes its example and what the built CLI prints for it, so neither drifts.
const EXAMPLES: Example[] = [
  // Runs packages/shiplane/examples/repository/shiplane.config.ts in a consumer repository.
  {
    name: "shiplane",
    package: "packages/shiplane",
    folder: "examples/repository",
    shows: ["shiplane.config.ts"],
    runs: [["plugins"]],
  },
  // Runs packages/shiplane/examples/render-server-hosting.ts (and writeAPlugin.test.ts).
  {
    name: "shiplane plugin to write",
    package: "packages/shiplane",
    folder: "examples",
    page: "../../docs/shiplane/plugins.md",
    shows: ["render-server-hosting.ts"],
    runs: [],
  },
  {
    name: "shiplane-fly",
    package: "packages/shiplane-fly",
    folder: "examples",
    shows: ["shiplane.config.ts", "apps/api/shiplane.unit.yml"],
    runs: [["plan"]],
  },
  {
    name: "shiplane-cloudflare-pages",
    package: "packages/shiplane-cloudflare-pages",
    folder: "examples",
    shows: ["shiplane.config.ts", "apps/site/shiplane.unit.yml"],
    runs: [["plan"]],
  },
  {
    name: "shiplane-eas",
    package: "packages/shiplane-eas",
    folder: "examples",
    shows: ["shiplane.config.ts", "apps/mobile/shiplane.unit.yml"],
    runs: [["plan"]],
  },
  {
    name: "shiplane-npm",
    package: "packages/shiplane-npm",
    folder: "examples",
    shows: ["shiplane.config.ts", "packages/toolkit/shiplane.unit.yml"],
    runs: [["plan"]],
  },
  {
    name: "shiplane-git",
    package: "packages/shiplane-git",
    folder: "examples",
    shows: ["shiplane.config.ts"],
    runs: [["status"]],
    branch: "trunk",
  },
  {
    name: "shiplane-github",
    package: "packages/shiplane-github",
    folder: "examples",
    shows: ["shiplane.config.ts"],
    runs: [["plan"]],
  },
  {
    name: "shiplane-changesets",
    package: "packages/shiplane-changesets",
    folder: "examples",
    shows: ["shiplane.config.ts", ".changeset/quiet-seeds-wait.md"],
    runs: [["status"]],
  },
];

const repositories: ConsumerRepository[] = [];
afterAll(() => repositories.forEach((repository) => repository.remove()));

describe.each(EXAMPLES)("the $name example", (example) => {
  const readme = () =>
    quoted(
      fs.readFileSync(
        path.join(REPOSITORY_ROOT, example.package, example.page ?? "README.md"),
        "utf8",
      ),
    );
  const exampleFolder = path.join(example.package, example.folder);

  it.each(example.shows)(
    "given its page, when a reader copies %s, then it is the file as it stands",
    (file) => {
      const text = fs.readFileSync(path.join(REPOSITORY_ROOT, exampleFolder, file), "utf8");

      expect(readme()).toContain(quoted(text));
    },
  );

  it.each(example.runs.map((args) => [args.join(" "), args]))(
    "given the example installed in a repository, when a consumer runs shiplane %s, then it exits 0 and prints what its page shows",
    (_command, args) => {
      const repository = exampleRepository(exampleFolder, { branch: example.branch });
      repositories.push(repository);

      const { status, output } = repository.shiplane(args);

      expect(status).toBe(0);
      expect(readme()).toContain(quoted(output));
    },
  );
});
