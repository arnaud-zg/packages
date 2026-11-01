import { z } from "zod";

import type { Named } from "../deliveryModule";
import type { ReleaseModule } from "../module";

/**
 * An app nothing deploys, such as a CLI run from the repository: a release versions it, tags it and
 * publishes its notes, and every environment counts it as shipped once tagged.
 */
export const internalTool = ({ name = "internal-tool" }: Named = {}): ReleaseModule => ({
  type: "module",
  name,
  kind: "internal-tool",
  // What output named it before modules: the release PR and status keep saying it.
  provider: "release-only",
  settings: z.object({}),
  adapters: [],
  releaseOnly: true,
  ship: () => ({ where: "its tag and release notes, nothing deploys it", jobs: [] }),
  decide: () => Promise.resolve({ action: "none", status: "released, nothing deploys it" }),
});
