import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LIVE, systemShell, versioningContract } from "shiplane/testing";
import { afterAll, describe } from "vitest";

import { changesetsVersioning } from "../changesets-versioning.adapter";

const WORKSPACE = { name: "@acme/api", folder: "apps/api" };

const made: string[] = [];
afterAll(() => made.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

describe.skipIf(!LIVE)("live", () => {
  versioningContract("changesets", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-changesets-contract-"));
    made.push(root);
    fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
    fs.mkdirSync(path.join(root, ".changeset"));
    fs.mkdirSync(path.join(root, WORKSPACE.folder), { recursive: true });
    fs.writeFileSync(
      path.join(root, WORKSPACE.folder, "package.json"),
      JSON.stringify({ name: WORKSPACE.name, version: "1.0.0" }),
    );
    const port = changesetsVersioning().create({ root, shell: systemShell });
    return Promise.resolve({ port, workspace: WORKSPACE });
  });
});
