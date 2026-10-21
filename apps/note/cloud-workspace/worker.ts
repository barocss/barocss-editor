import { handleWorkspaceApi, type WorkspaceDB } from './server';

export interface EmbeddedAsset { body: string; type: string }
/** A single Worker serves bundled immutable app assets and the D1-backed API. No Node runtime. */
export function createWorker(assets: Record<string, EmbeddedAsset>) {
  return {
    async fetch(request: Request, env: { DB?: WorkspaceDB }): Promise<Response> {
      const api = await handleWorkspaceApi(request, env.DB);
      if (api) return api;
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
      const path = new URL(request.url).pathname;
      const asset = assets[path === '/' ? '/index.html' : path];
      if (!asset) return new Response('Not found', { status: 404 });
      const headers = {
        'Content-Type': asset.type,
        'Cache-Control': path.startsWith('/assets/') ? 'private, max-age=31536000, immutable' : 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'same-origin',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'"
      };
      return new Response(request.method === 'HEAD' ? null : Uint8Array.from(atob(asset.body), one => one.charCodeAt(0)), { headers });
    }
  };
}
