import { describe, expect, it } from "vitest";

import type { VersioningPort } from "../../ports/versioning.port";

/** A workspace with one package, and the ways a test arranges it beyond the port. */
export interface VersioningSubject {
  port: VersioningPort;
  /** The package the workspace holds, and its folder. */
  workspace: { name: string; folder: string };
}

/** What every versioning does, whatever its provider. */
export const versioningContract = (name: string, subject: () => Promise<VersioningSubject>) =>
  describe(`${name}, as versioning`, () => {
    it("given a change written, when the pending changes are read, then it is there naming its package and bump", async () => {
      const { port, workspace } = await subject();

      await port.write({
        id: "contract-change",
        releases: [{ name: workspace.name, type: "minor" }],
        summary: "Written by the contract suite.",
      });

      const pending = await port.pending();
      expect(pending.map(({ id }) => id)).toContain("contract-change");
      expect(pending.find(({ id }) => id === "contract-change")?.text).toContain(
        `"${workspace.name}": minor`,
      );
    });

    it("given a person with nothing queued, when they are told what to do, then the port says it", async () => {
      const { port } = await subject();

      expect(port.nextChange).not.toBe("");
    });

    it("given a workspace package, when the folders are read, then it is found in its folder", async () => {
      const { port, workspace } = await subject();

      expect(await port.folders()).toMatchObject({ [workspace.name]: workspace.folder });
    });

    it("given a change and a folder, when their files are named, then they sit where a person looks", async () => {
      const { port, workspace } = await subject();

      expect(port.changesetFile("contract-change")).toBe(".changeset/contract-change.md");
      expect(port.changelogFile(workspace.folder)).toBe(`${workspace.folder}/CHANGELOG.md`);
    });
  });
