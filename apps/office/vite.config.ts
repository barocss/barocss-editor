import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

/** Separate HTML entries isolate product renderers and global input listeners on one origin. */
export default defineConfig({
  plugins: [react(), tailwind()],
  server: { port: 5186 },
  build: { rollupOptions: { input: Object.fromEntries(['index.html', 'design-system/index.html', ...['note', 'word', 'slides', 'site'].map(product => `products/${product}/index.html`)].map(path => [path, fileURLToPath(new URL(path, import.meta.url))])) } }
});
