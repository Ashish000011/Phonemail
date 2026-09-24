import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Integration tests need the running stack: npm run test:integration
    exclude: ['test/integration/**', '**/node_modules/**'],
    environment: 'node',
  },
});
