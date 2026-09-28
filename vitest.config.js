import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    fileParallelism: false,
    exclude: ['**/node_modules/**', 'tests/integration/**', 'tests/e2e/**'],
    sequence: {
      files: [
        'tests/auth.test.js',
        'tests/products.test.js',
        'tests/cart.test.js',
        'tests/orders.test.js',
        'tests/adminProducts.test.js',
        'tests/adminOrders.test.js',
      ],
    },
    hookTimeout: 10000,
  },
});
