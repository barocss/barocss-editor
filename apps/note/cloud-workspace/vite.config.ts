import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig(({ mode }) => mode === 'api' || mode === 'worker' ? {
  root, define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: { outDir: mode === 'api' ? 'dist/api' : 'dist/server', emptyOutDir: true, target: 'es2022',
    lib: { entry: mode === 'api' ? `${root}server.ts` : `${root}dist/entry.mjs`, formats: ['es'],
      fileName: () => mode === 'api' ? 'workspace-api.mjs' : 'index.js' } }
} : {
  root, plugins: [react(), tailwind()],
  build: { outDir: 'dist/client', emptyOutDir: true, target: 'es2022' },
  server: { host: '127.0.0.1', port: 5194, strictPort: true }
});
