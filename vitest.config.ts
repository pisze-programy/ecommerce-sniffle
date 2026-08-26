import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['_tests/**/*.test.ts'],
    environment: 'node',
  },
});
