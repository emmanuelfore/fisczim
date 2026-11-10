import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  test: {
    environment: "node",
    include: ["client/src/**/*.test.ts", "server/**/*.test.ts"],
    // server/db.ts throws the moment it is evaluated without DATABASE_URL, and pure unit
    // suites such as the Lekuka tax preflight reach it transitively through the
    // fiscalization layer. No suite connects for real - anything touching rows mocks
    // ../db.js - so a parseable placeholder keeps the app's fail-fast guard while letting
    // `npm test` run on a machine with no database in the environment.
    env: { DATABASE_URL: "postgres://vitest@127.0.0.1:1/vitest" },
  },
});
