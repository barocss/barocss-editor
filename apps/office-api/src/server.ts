import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';

function reply(response: ServerResponse, status: number, code: string, head: boolean): void {
  const body = JSON.stringify({ status: code });
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(head ? undefined : body);
}

/** Bootstrap only: no authenticated data service exists yet. */
export function createApiServer() {
  return createServer({
    maxHeaderSize: 8192,
    headersTimeout: 10000,
    requestTimeout: 15000,
    keepAliveTimeout: 5000,
  }, (request, response) => {
    // Do not construct routes from untrusted Host or forwarded headers.
    const path = request.url?.split('?')[0];
    const head = request.method === 'HEAD';
    if (path !== '/health/live' && path !== '/health/ready') {
      reply(response, 404, 'not_found', head);
      return;
    }
    if (request.method !== 'GET' && !head) {
      response.setHeader('allow', 'GET, HEAD');
      reply(response, 405, 'method_not_allowed', false);
      return;
    }
    reply(response, path === '/health/live' ? 200 : 503,
      path === '/health/live' ? 'alive' : 'service_not_configured', head);
  });
}
