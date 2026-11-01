import base from "@arnaud-zg/configs/eslint";
import tseslint from "typescript-eslint";

/**
 * Monorepo-wide base: @arnaud-zg/configs's framework-agnostic rules, plus typed linting wired to
 * every package's own tsconfig.json. An explicit glob (rather than typescript-eslint's
 * `projectService` auto-discovery) is what reliably resolves each file to its owning package's
 * project when a single `eslint .` invocation from the repo root lints all packages at once.
 */
export default tseslint.config(
  // shiplane configs sit outside every tsconfig.
  { ignores: ["shiplane.config.ts", "packages/shiplane*/*.config.ts"] },
  ...base,
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["**/dist/**"],
    languageOptions: {
      parserOptions: {
        // "tsconfig.json" covers packages whose editor tsconfig directly lists
        // src files; "tsconfig.lib.json" covers packages (e.g. expo-pnpm-catalog)
        // whose tsconfig.json is solution-style (a bare reference, no
        // `include`) and delegate the real file list to tsconfig.lib.json.
        project: [
          "packages/*/tsconfig.json",
          "packages/*/tsconfig.lib.json",
          "packages/*/tsconfig.typecheck.json",
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
