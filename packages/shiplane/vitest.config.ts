import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    watch: false,
    // Real-folder tests take up to 7.5s each on CI's 1-CPU ubuntu-slim runner.
    testTimeout: 20_000,
  },
});
