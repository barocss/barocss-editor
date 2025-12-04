import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
  },
  resolve: {
    alias: {
      '@barocss/datastore': '/Users/user/github/barocss/barocss-editor/packages/datastore/src/index.ts',
      '@barocss/model': '/Users/user/github/barocss/barocss-editor/packages/model/src/index.ts',
      '@barocss/schema': '/Users/user/github/barocss/barocss-editor/packages/schema/src/index.ts',
    }
  }
});
