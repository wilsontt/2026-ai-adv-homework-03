import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    fileParallelism: false,
    include: ['tests/integration/**/*.test.js'],
    env: {
      DATABASE_PATH: ':memory:',
    },
    hookTimeout: 10000,
  },
});
