import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('../../../', import.meta.url)),
  cacheDir: fileURLToPath(new URL('./.cache/portal/', import.meta.url)),
  resolve: {
    alias: { '@barocss/dsl': fileURLToPath(new URL('../../../packages/dsl/src/index.ts', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    include: ['experiments/office-suite-v2/verification/portal-independent.test.ts'],
    setupFiles: ['packages/renderer-dom/test/setup.ts'],
    maxWorkers: 1,
    fileParallelism: false,
  },
});
