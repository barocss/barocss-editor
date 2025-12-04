import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@barocss/renderer-dom': resolve(__dirname, '../renderer-dom/src/index.ts'),
      '@barocss/editor-core': resolve(__dirname, '../editor-core/src/index.ts')
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts']
  }
});
