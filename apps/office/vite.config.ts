import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

/** Separate HTML entries isolate product renderers and global input listeners on one origin. */
export default defineConfig(({ mode }) => {
 const env = loadEnv(mode, process.cwd(), '');
 const apiTarget = process.env.OFFICE_API_PROXY_TARGET || env.OFFICE_API_PROXY_TARGET || 'http://127.0.0.1:4100';
 const authMode = process.env.VITE_OFFICE_AUTH_MODE || env.VITE_OFFICE_AUTH_MODE;
 if (!/^http:\/\/(127\.0\.0\.1|localhost):\d{1,5}$/.test(apiTarget)) throw new Error('OFFICE_API_PROXY_TARGET must be a loopback HTTP origin');
 return {
  plugins: [react(), tailwind()],
  server: {
   port: 5186,
   strictPort: authMode === 'oidc',
   proxy: authMode === 'oidc' ? {
    '/api': { target: apiTarget, changeOrigin: false, rewrite: path => path.replace(/^\/api(?=\/|$)/, '/v1') },
   } : undefined,
  },
  build: { rollupOptions: { input: Object.fromEntries(['index.html', 'design-system/index.html', ...['note', 'word', 'slides', 'site'].map(product => `products/${product}/index.html`)].map(path => [path, fileURLToPath(new URL(path, import.meta.url))])) } }
 };
});
