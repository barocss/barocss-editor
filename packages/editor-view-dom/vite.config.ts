import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'BarocssEditorViewDOM',
      fileName: 'index'
    },
    rollupOptions: {
      external: ['@barocss/editor-core', '@barocss/renderer-dom'],
      output: {
        globals: {
          '@barocss/editor-core': 'BarocssEditorCore',
          '@barocss/renderer-dom': 'BarocssRendererDOM'
        }
      }
    }
  }
});