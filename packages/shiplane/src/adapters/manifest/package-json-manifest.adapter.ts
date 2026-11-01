import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

import type { ManifestReader } from "../../ports/manifest.port";

const PackageSchema = z.object({ name: z.string(), version: z.string() });

export const packageJsonManifest: ManifestReader = {
  read: (root, dir) => {
    const file = path.join(root, dir, "package.json");
    if (!fs.existsSync(file)) return null;
    const parsed = PackageSchema.safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
    return parsed.success ? parsed.data : null;
  },
};
