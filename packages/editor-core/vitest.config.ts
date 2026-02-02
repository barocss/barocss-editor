import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
  },
  resolve: {
    alias: {
      '@barocss/datastore': path.resolve(__dirname, '../datastore/src/index.ts'),
      '@barocss/model': path.resolve(__dirname, '../model/src/index.ts'),
      '@barocss/schema': path.resolve(__dirname, '../schema/src/index.ts'),
    }
  }
});
