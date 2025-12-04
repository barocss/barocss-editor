import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5175,
    open: true
  },
  resolve: {
    alias: {
      '@barocss/renderer-dom': '/Users/user/github/barocss/barocss-editor/packages/renderer-dom/src/index.ts',
      '@barocss/editor-view-dom': '/Users/user/github/barocss/barocss-editor/packages/editor-view-dom/src/index.ts',
      '@barocss/editor-core': '/Users/user/github/barocss/barocss-editor/packages/editor-core/src/index.ts',
      '@barocss/schema': '/Users/user/github/barocss/barocss-editor/packages/schema/src/index.ts',
      '@barocss/datastore': '/Users/user/github/barocss/barocss-editor/packages/datastore/src/index.ts',
      '@barocss/model': '/Users/user/github/barocss/barocss-editor/packages/model/src/index.ts',
      '@barocss/dsl': '/Users/user/github/barocss/barocss-editor/packages/dsl/src/index.ts'
    }
  }
});
