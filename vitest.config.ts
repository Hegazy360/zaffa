import { defineConfig } from "vitest/config";
import path from "node:path";

const alias = {
  "@": path.resolve(__dirname, "./src"),
};

export default defineConfig({
  resolve: { alias },
  test: {
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/lib/payments.ts",
        "src/lib/env-checks.ts",
        "src/lib/rate-limit.ts",
        "src/server/services/notifications/**",
        "src/server/routers/payments.ts",
        "src/middleware.ts",
      ],
      thresholds: {
        // Critical paths: keep these high so regressions in money + auth surface as a failing test run.
        "src/lib/payments.ts": {
          lines: 90,
          functions: 90,
          statements: 90,
          branches: 80,
        },
        "src/lib/env-checks.ts": {
          lines: 90,
          functions: 90,
          statements: 90,
          branches: 80,
        },
      },
    },
    projects: [
      {
        extends: true,
        resolve: { alias },
        test: {
          name: "node",
          environment: "node",
          include: [
            "src/**/*.test.ts",
            "tests/**/*.test.ts",
          ],
          exclude: [
            "tests/components/**",
            "tests/e2e/**",
            "node_modules/**",
          ],
        },
      },
      {
        extends: true,
        resolve: { alias },
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["tests/components/**/*.test.tsx"],
          setupFiles: ["tests/components/setup.ts"],
        },
      },
    ],
  },
});
