import { handleWorkspaceApi, type WorkspaceDB } from '../../note/cloud-workspace/server';
import { handleOfficeStorage } from './storage-server';

interface Asset { body: string; type: string }
const reserved = new Set(['api', 'assets', 'products', 'design-system', 'admin', 'operator',
  'signin-with-chatgpt', 'signout-with-chatgpt', 'callback', 'favicon.ico', 'robots.txt']);

/** Host the unchanged Office build; browser-local storage remains owned by the original app. */
export function createOfficeWorker(assets: Record<string, Asset>) {
  return {
    async fetch(request: Request, env: { DB?: WorkspaceDB }): Promise<Response> {
      const storage = await handleOfficeStorage(request, env.DB);
      if (storage) return storage;
      // Retain the previous test API/data without connecting Office's local mode to it.
      const api = await handleWorkspaceApi(request, env.DB);
      if (api) return api;
      if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
      const path = new URL(request.url).pathname;
      let asset = assets[path === '/' ? '/index.html' : path];
      if (!asset && path.endsWith('/')) asset = assets[`${path}index.html`];
      const parts = path.split('/').slice(1);
      if (!asset && (parts.length === 1 || parts.length === 2) && parts.every(Boolean) && !reserved.has(parts[0])) {
        // Serve in place: queries, native-frame markers and browser history belong to Office.
        asset = assets['/index.html'];
      }
      if (!asset) return new Response('Not found', { status: 404 });
      return new Response(request.method === 'HEAD' ? null : Uint8Array.from(atob(asset.body), byte => byte.charCodeAt(0)), {
        headers: {
          'Content-Type': asset.type,
          'Cache-Control': path.startsWith('/assets/') ? 'private, max-age=31536000, immutable' : 'no-store',
          'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin'
        }
      });
    }
  };
}
