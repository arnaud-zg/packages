import { describe, expect, it } from "vitest";

import { previousTag } from "../issues";

describe("the tag before a version", () => {
  it("given v<version> tags, when the version before 0.4.0 is read, then it is v0.3.1", () => {
    expect(
      previousTag(new Set(["v0.3.0", "v0.3.1", "v0.4.0"]), "configs", "0.4.0", "v{version}"),
    ).toBe("v0.3.1");
  });
});
