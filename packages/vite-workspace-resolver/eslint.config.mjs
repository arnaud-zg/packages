import tseslint from "typescript-eslint";

import rootConfig from "../../eslint.config.mjs";

/**
 * @type {import('typescript-eslint').Config}
 */
export default tseslint.config(rootConfig, {
  files: ["**/*.{js,ts,tsx}"],
  ignores: ["dist/**"],
  rules: {
    // Package-specific rules can be added here
  },
});
