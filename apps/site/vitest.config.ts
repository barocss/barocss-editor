import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: { include: ['test/**/*.{test,spec}.{ts,tsx}'], environment: 'node' }
});
