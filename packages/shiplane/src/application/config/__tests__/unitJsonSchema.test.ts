import { describe, expect, it } from "vitest";

import {
  backendService,
  defineServerHosting,
  defineStaticHosting,
  perEnv,
  webApp,
  z,
} from "../../..";
import { unitJsonSchema } from "../unitSchema";

const pages = defineStaticHosting({
  name: "pages",
  settings: z.object({ project: z.string().describe("The Pages project name") }),
  describe: () => "",
  jobs: () => [],
});
const server = defineServerHosting({
  name: "server",
  settings: z.object({ app: perEnv(z.string()) }),
  describe: () => "",
  jobs: () => [],
});

describe("autocompletion in the editor", () => {
  it("given two composed modules, when the editor schema is generated, then the module an app names offers only its adapter's keys", () => {
    const schema = unitJsonSchema([
      webApp({ staticHosting: pages }),
      backendService({ serverHosting: server }),
    ]);
    const variants = JSON.stringify(schema);

    expect(schema).toMatchObject({ $schema: expect.stringContaining("json-schema.org") });
    expect(variants).toContain('"const":"web-app"');
    expect(variants).toContain('"const":"backend-service"');
    expect(variants).toContain("The Pages project name");
    expect(variants).toContain('"additionalProperties":false');
  });
});
