import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: { target: 'es2022', outDir: `${here}dist/server`, emptyOutDir: true,
    lib: { entry: `${here}dist/entry.mjs`, formats: ['es'], fileName: () => 'index.js' } }
});
