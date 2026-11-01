import { defineLibraryConfig } from "@arnaud-zg/configs/tsdown";

// package.json keeps its exports by hand: the config API, the plugin API and the testing kit.
export default defineLibraryConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
    plugin: "src/plugin.ts",
    testing: "src/testing/public.ts",
  },
  // The testing kit runs inside its importer's vitest.
  deps: { neverBundle: ["vitest"] },
  exports: false,
});
