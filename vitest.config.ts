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
  },
});
