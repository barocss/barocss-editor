import { defineConfig, loadEnv, type ViteDevServer } from 'vite';
import { createNative2ReadProxyPolicy } from './src/native2-proxy-policy';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

/** Separate HTML entries isolate product renderers and global input listeners on one origin. */
export default defineConfig(({ mode }) => {
 const env = loadEnv(mode, process.cwd(), '');
 const apiTarget = process.env.OFFICE_API_PROXY_TARGET || env.OFFICE_API_PROXY_TARGET || 'http://127.0.0.1:4100';
 const authMode = process.env.VITE_OFFICE_AUTH_MODE || env.VITE_OFFICE_AUTH_MODE;
 const native2ReadProxy = createNative2ReadProxyPolicy({
  authMode,
  flag: process.env.VITE_OFFICE_NATIVE2_READ_BRIDGE || env.VITE_OFFICE_NATIVE2_READ_BRIDGE,
  target: process.env.SCHEMA_SERVER_PROXY_TARGET || env.SCHEMA_SERVER_PROXY_TARGET,
 });
 if (!/^http:\/\/(127\.0\.0\.1|localhost):\d{1,5}$/.test(apiTarget)) throw new Error('OFFICE_API_PROXY_TARGET must be a loopback HTTP origin');
 const native2ReadBoundary = {
  name: 'office-native2-read-boundary',
  configureServer(server: ViteDevServer) {
   const entries = Object.entries(native2ReadProxy);
   if (!entries.length) return;
   server.middlewares.use((request, response, next) => {
    const matched = entries.find(([context]) => new RegExp(context).test(request.url ?? ''));
    if (matched && matched[1].bypass?.(request, response, matched[1]) === false) {
     response.statusCode = 404;
     response.end();
     return;
    }
    next();
   });
   const middlewareMode = server.config.server.middlewareMode;
   const httpServer = server.httpServer ?? (typeof middlewareMode === 'object' ? middlewareMode.server : undefined);
   httpServer?.on('upgrade', (request, socket) => {
    if (entries.some(([context]) => new RegExp(context).test(request.url ?? ''))) {
     socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    }
   });
  },
 };

 return {
  plugins: [native2ReadBoundary, react(), tailwind()],
  server: {
   port: 5186,
   strictPort: authMode === 'oidc',
   proxy: authMode === 'oidc' ? {
    ...native2ReadProxy,
    '/api': { target: apiTarget, changeOrigin: false, rewrite: path => path.replace(/^\/api(?=\/|$)/, '') },
   } : undefined,
  },
  build: { rollupOptions: { input: Object.fromEntries(['index.html', 'design-system/index.html', ...['note', 'word', 'slides', 'site'].map(product => `products/${product}/index.html`)].map(path => [path, fileURLToPath(new URL(path, import.meta.url))])) } }
 };
});
