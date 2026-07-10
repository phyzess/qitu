import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: "./wrangler.test.jsonc",
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    // Workers pool cold starts can exceed Vitest's 5s default during concurrent local builds.
    testTimeout: 30_000,
  },
});
