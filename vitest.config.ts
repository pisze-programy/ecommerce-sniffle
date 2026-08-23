import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/src/**/*.test.ts", "orchestrator/src/**/*.test.ts", "backend/src/**/*.test.ts"],
    environment: "node",
  },
});
