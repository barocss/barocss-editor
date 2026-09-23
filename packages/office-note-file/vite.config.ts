import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [dts({ entryRoot: resolve(root, 'src'), outDir: resolve(root, 'dist'), include: [resolve(root, 'src/**/*')] })],
  build: {
    lib: { entry: resolve(root, 'src/index.ts'), formats: ['es'], fileName: 'index' },
    rollupOptions: { external: [] }
  }
});
