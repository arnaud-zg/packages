import { describe, expect, it } from "vitest";

import type { SourceControlPort } from "../../ports/source-control.port";

/** A repository on main with one commit, and the ways a test arranges it beyond the port. */
export interface SourceControlSubject {
  port: SourceControlPort;
  /** The commit main is on. */
  head: () => Promise<string>;
  /** Writes a file the repository does not track yet. */
  change: (file: string, text: string) => Promise<void>;
}

/** What every source control does, whatever its provider. */
export const sourceControlContract = (name: string, subject: () => Promise<SourceControlSubject>) =>
  describe(`${name}, as source control`, () => {
    it("given a fresh checkout, when its position is read, then it is on main with nothing to commit", async () => {
      const { port } = await subject();

      expect((await port.position()).branch).toBe("main");
      expect(await port.isClean()).toBe(true);
    });

    it("given a commit tagged, when the tags are read, then the tag is there and names that commit", async () => {
      const { port, head } = await subject();
      const sha = await head();

      await port.tag("app@1.0.0", sha, "app 1.0.0");

      expect(await port.tags()).toContain("app@1.0.0");
      expect(await port.tagCommit("app@1.0.0")).toBe(sha);
    });

    it("given tags in every format a config names, when the tags are read, then each one is there", async () => {
      const { port, head } = await subject();
      const sha = await head();
      for (const tag of ["arnaud-zg--v0.2.1", "v1.0.0", "app@1.0.0"]) {
        await port.tag(tag, sha, tag);
      }

      expect([...(await port.tags())].sort()).toEqual(["app@1.0.0", "arnaud-zg--v0.2.1", "v1.0.0"]);
    });

    it("given a tag deleted, when the tags are read, then it is gone and names no commit", async () => {
      const { port, head } = await subject();
      await port.tag("app@1.0.0", await head(), "app 1.0.0");

      await port.deleteTag("app@1.0.0");

      expect(await port.tags()).not.toContain("app@1.0.0");
      expect(await port.tagCommit("app@1.0.0")).toBeNull();
    });

    it("given a branch created, when the position is read, then it is on it, and switching back returns to main", async () => {
      const { port } = await subject();

      await port.createBranch("release/next");
      const onBranch = (await port.position()).branch;
      await port.switchTo("main");

      expect(onBranch).toBe("release/next");
      expect((await port.position()).branch).toBe("main");
    });

    it("given a new file committed, when the changes are read, then it is no longer among them", async () => {
      const { port, change } = await subject();
      await change("notes.md", "notes\n");
      const before = await port.changedFiles();

      await port.commit(["notes.md"], "docs: notes");

      expect(before).toContain("notes.md");
      expect(await port.changedFiles()).not.toContain("notes.md");
    });
  });
