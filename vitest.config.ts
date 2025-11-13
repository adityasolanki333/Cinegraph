import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/api/**/*.test.ts', 'tests/ml/**/*.test.ts'],
    exclude: ['node_modules', 'tests/e2e'],
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ['tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './shared'),
      '@': path.resolve(__dirname, './client/src'),
    },
  },
});
