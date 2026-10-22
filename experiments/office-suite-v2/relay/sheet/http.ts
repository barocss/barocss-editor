import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { SHEET_RELAY_LIMITS, SHEET_RELAY_PATH } from '../../src/sheet-preview-protocol.ts';
import { RelayError } from './service.ts';
import { parseSheetRelayAppendRequest, parseSheetRelaySessionRequest } from '../../src/sheet-preview-protocol.ts';
import { attachSheetRelayWebSocket } from './websocket.ts';
import type { SheetRelayWebSocketOptions } from './websocket.ts';

function credential(request: IncomingMessage): string {
  const match = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.authorization ?? '');
  if (!match?.[1]) throw new RelayError('session-denied', 401);
  return match[1];
}
function body(request: IncomingMessage): Promise<unknown> {
  if (request.headers['content-type']?.split(';')[0] !== 'application/json') throw new RelayError('json-required', 415);
  return new Promise((resolve, reject) => {
    let length = 0; const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => { length += chunk.length; if (length <= SHEET_RELAY_LIMITS.httpBodyBytes) chunks.push(chunk); });
    request.on('end', () => {
      if (length > SHEET_RELAY_LIMITS.httpBodyBytes) return reject(new RelayError('http-body-limit', 413));
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new RelayError('invalid-json')); }
    });
    request.on('error', reject); request.on('aborted', () => reject(new RelayError('request-aborted')));
  });
}
function json(response: ServerResponse, status: number, value: unknown): void {
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text) > SHEET_RELAY_LIMITS.httpBodyBytes) throw new RelayError('http-response-limit', 500);
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); response.end(text);
}

export async function startSheetRelay(options: SheetRelayWebSocketOptions & { port: number }): Promise<{ url: string; port: number; close(): Promise<void> }> {
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) throw new RelayError('invalid-port');
  const origins = new Set(options.allowedOrigins ?? []);
  const server = createServer(async (request, response) => {
    try {
      if (request.headers.origin !== undefined && !origins.has(request.headers.origin)) throw new RelayError('origin-denied', 403);
      const address = server.address();
      if (!address || typeof address === 'string' || request.headers.host !== `127.0.0.1:${address.port}`) throw new RelayError('host-denied', 403);
      const path = request.url;
      if (request.method === 'POST' && path === `${SHEET_RELAY_PATH}/session`) {
        const session = options.service.issueSession(parseSheetRelaySessionRequest(await body(request)));
        // Keep the original HTTP/P1 persisted shape; live access is WS metadata.
        return json(response, 200, { protocolVersion: 1, controlled: true, credential: session.credential, identity: session.identity, context: session.context });
      }
      const token = credential(request);
      if (request.method === 'GET' && (path === `${SHEET_RELAY_PATH}/open` || path === `${SHEET_RELAY_PATH}/state`)) return json(response, 200, options.service.open(token));
      if (request.method === 'POST' && path === `${SHEET_RELAY_PATH}/append`) {
        const result = options.service.append(token, parseSheetRelayAppendRequest(await body(request)));
        if (result.status === 'acknowledgment-unknown') { response.destroy(); return; }
        // Controlled local fault seam. Acceptance is already complete before this wait.
        const delay = request.headers['x-sheet-relay-delay-ack-ms'];
        if (typeof delay === 'string' && /^(?:0|[1-9][0-9]{0,2}|1000)$/.test(delay)) await new Promise(resolve => setTimeout(resolve, Number(delay)));
        if (!response.destroyed) {
          const current = options.service.issueSession({ protocolVersion: 1, resumeCredential: token });
          if (current.access !== 'read-write') throw new RelayError('read-only-denied', 403);
          json(response, result.status === 'durable' ? 200 : 409, result);
        }
        return;
      }
      if (request.method === 'POST' && path === `${SHEET_RELAY_PATH}/checkpoint`) {
        const value: unknown = await body(request);
        if (value === null || typeof value !== 'object' || Object.keys(value).length !== 1 || Reflect.get(value, 'protocolVersion') !== 1) throw new RelayError('invalid-checkpoint-request');
        return json(response, 200, options.service.checkpoint(token));
      }
      throw new RelayError('route-not-found', 404);
    } catch (error) {
      if (response.destroyed) return;
      const status = error instanceof RelayError ? error.status : 400;
      const code = error instanceof RelayError ? error.code : 'invalid-request';
      json(response, status, { protocolVersion: 1, status: 'rejected', code });
    }
  });
  server.requestTimeout = 5000; server.headersTimeout = 2000;
  const websocket = attachSheetRelayWebSocket(server, options);
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(options.port, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
  } catch (error) { await websocket.close(); throw error; }
  const address = server.address();
  if (!address || typeof address === 'string') throw new RelayError('listen-failed', 500);
  let closing: Promise<void> | undefined;
  return { url: `http://127.0.0.1:${address.port}`, port: address.port,
    close: () => closing ??= (async () => {
      await websocket.close();
      await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
    })() };
}
