import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Integration tests need the running stack: npm run test:integration
    exclude: ['test/integration/**', '**/node_modules/**'],
    environment: 'node',
    // The first test that builds the app loads Fastify, Swagger and Prisma from a
    // cold disk cache; on a fresh clone or a CI runner that alone can take 8 s.
    testTimeout: 30_000,
  },
});
