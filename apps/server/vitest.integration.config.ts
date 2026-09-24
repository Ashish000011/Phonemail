import { defineConfig } from 'vitest/config';

/**
 * Black-box tests against the running stack (docker compose up -d):
 * real HTTP through nginx and real SMTP on port 2525.
 *   npm run test:integration -w apps/server
 */
export default defineConfig({
  test: {
    include: ['test/integration/**/*.int.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
