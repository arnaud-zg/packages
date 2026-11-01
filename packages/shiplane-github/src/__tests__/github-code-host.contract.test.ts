import { codeHostContract, inSandbox, LIVE, sandbox, systemShell } from "shiplane/testing";
import { describe } from "vitest";

import { gitHubCodeHost } from "../github-code-host.adapter";

describe.skipIf(!LIVE)("live", () => {
  codeHostContract("github", () => {
    const port = gitHubCodeHost().create({ root: sandbox(), shell: systemShell });
    const stamp = Date.now();
    return Promise.resolve({
      port,
      branch: (name) => {
        const head = `${name}-${stamp}`;
        inSandbox(["switch", "--quiet", "-c", head, "origin/main"]);
        inSandbox(["commit", "--quiet", "--allow-empty", "-m", "chore: contract"]);
        inSandbox(["push", "--quiet", "origin", head]);
        inSandbox(["switch", "--quiet", "main"]);
        return Promise.resolve(head);
      },
      tag: () => {
        const name = `contract@0.0.${stamp}`;
        inSandbox(["tag", name, "origin/main"]);
        inSandbox(["push", "--quiet", "origin", name]);
        return Promise.resolve(name);
      },
      issue: {
        repository: inSandbox(["remote", "get-url", "origin"])
          .replace(/^.*github\.com[:/]/, "")
          .replace(/\.git$/, ""),
        number: 1,
      },
    });
  });
});
