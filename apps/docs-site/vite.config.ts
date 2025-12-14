import { defineConfig } from 'vite';
import { resolve } from 'path';

// Vite config for building editor demo bundle
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/editor-demo.ts'),
      name: 'BarocssEditorDemo',
      fileName: 'editor-demo',
      formats: ['iife'], // IIFE format for direct browser use
    },
    rollupOptions: {
      output: {
        // Single file bundle
        inlineDynamicImports: true,
      },
    },
    outDir: '.',
    emptyOutDir: false, // Don't clear the entire docs-site directory
  },
  resolve: {
    alias: {
      '@barocss/datastore': resolve(__dirname, '../packages/datastore/src'),
      '@barocss/editor-core': resolve(__dirname, '../packages/editor-core/src'),
      '@barocss/editor-view-dom': resolve(__dirname, '../packages/editor-view-dom/src'),
      '@barocss/schema': resolve(__dirname, '../packages/schema/src'),
      '@barocss/dsl': resolve(__dirname, '../packages/dsl/src'),
      '@barocss/extensions': resolve(__dirname, '../packages/extensions/src'),
      '@barocss/renderer-dom': resolve(__dirname, '../packages/renderer-dom/src'),
      '@barocss/model': resolve(__dirname, '../packages/model/src'),
      '@barocss/shared': resolve(__dirname, '../packages/shared/src'),
      '@barocss/dom-observer': resolve(__dirname, '../packages/dom-observer/src'),
      '@barocss/text-analyzer': resolve(__dirname, '../packages/text-analyzer/src'),
    },
  },
});
