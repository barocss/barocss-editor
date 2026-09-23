import { afterEach, describe, expect, it } from 'vitest';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createConnection } from 'node:net';
import { request as httpRequest } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { createApiServer } from '../src/server.js';
import { readConfig } from '../src/config.js';

const servers: ReturnType<typeof createApiServer>[] = [];
const children: ChildProcess[] = [];
const sockets: Socket[] = [];
afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.destroy();
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      await exited;
    }
  }
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.server.closeAllConnections();
    void server.close().then(() => resolve());
  })));
});
async function listen(server = createApiServer()) {
  servers.push(server);
  await server.listen({ port: 0, host: '127.0.0.1' });
  const port = (server.server.address() as AddressInfo).port;
  return { server, port, url: `http://127.0.0.1:${port}` };
}
function child(env: NodeJS.ProcessEnv) {
  const process = spawn(globalThis.process.execPath, [globalThis.process.env.OFFICE_API_TEST_ENTRY ?? 'dist/main.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...globalThis.process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(process);
  return process;
}

describe('configuration', () => {
  it('uses local defaults and accepts explicit container binding', () => {
    expect(readConfig({})).toEqual({ host: '127.0.0.1', port: 4100, shutdownTimeoutMs: 10000 });
    expect(readConfig({ OFFICE_API_HOST: '0.0.0.0', OFFICE_API_PORT: '4101' }).port).toBe(4101);
    expect(readConfig({ OFFICE_API_HOST: '::1' }).host).toBe('::1');
  });
  it.each(['', '0', '-1', '65536', '1.5', '4e3', '4100secret', ' 4100', 'Infinity'])(
    'rejects malformed or unsafe port %s', value => {
      expect(() => readConfig({ OFFICE_API_PORT: value })).toThrow('Invalid OFFICE_API_PORT');
    });
  it('rejects host and shutdown errors without returning their contents', () => {
    expect(() => readConfig({ OFFICE_API_HOST: 'secret.example' })).toThrow(/^Invalid OFFICE_API_HOST$/);
    expect(() => readConfig({ OFFICE_API_SHUTDOWN_TIMEOUT_MS: '60001' })).toThrow(/^Invalid OFFICE_API_SHUTDOWN_TIMEOUT_MS$/);
  });
});

describe('real HTTP boundary', () => {
  it('separates liveness from unconfigured readiness and prevents caching', async () => {
    const { url } = await listen();
    const live = await fetch(`${url}/health/live?probe=1`);
    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ status: 'alive' });
    expect(live.headers.get('cache-control')).toBe('no-store');
    const ready = await fetch(`${url}/health/ready`);
    expect(ready.status).toBe(503);
    expect(await ready.json()).toEqual({ status: 'service_not_configured' });
  });
  it('supports HEAD and rejects writes and unknown routes', async () => {
    const { url } = await listen();
    const head = await fetch(`${url}/health/live`, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    const write = await fetch(`${url}/health/live`, { method: 'POST', body: 'untrusted' });
    expect(write.status).toBe(405);
    expect(write.headers.get('allow')).toBe('GET, HEAD');
    const unknown = await fetch(`${url}/documents/secret`, {
      headers: { 'x-forwarded-host': 'customer.example' },
    });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ status: 'not_found' });
    expect(unknown.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('Fastify API contracts', () => {
  it('rejects schema violations without echoing input, and filters response fields', async () => {
    const app = createApiServer();
    app.post('/test-contract', {
      schema: {
        body: { type: 'object', required: ['title'], additionalProperties: false,
          properties: { title: { type: 'string', maxLength: 30 } } },
        response: { 200: { type: 'object', required: ['ok'], additionalProperties: false,
          properties: { ok: { type: 'boolean' } } } },
      },
    }, async () => ({ ok: true, privateValue: 'server-secret' }));
    const { url } = await listen(app);
    for (const payload of [{ title: 42 }, { title: 'ok', tenant: 'secret-tenant' }, {}]) {
      const response = await fetch(`${url}/test-contract`, { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ status: 'invalid_request' });
    }
    const valid = await fetch(`${url}/test-contract`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'ok' }) });
    expect(valid.status).toBe(200);
    expect(await valid.json()).toEqual({ ok: true });
  });
  it('hides internal failures and rejects malformed and oversized request bodies', async () => {
    const app = createApiServer();
    app.post('/test-error', async () => { throw new Error('private-database-credential'); });
    const { url } = await listen(app);
    for (const [body, expected, status] of [
      ['{}', 500, 'internal_error'],
      ['{secret', 400, 'invalid_request'],
    ] as const) {
      const response = await fetch(`${url}/test-error`, { method: 'POST',
        headers: { 'content-type': 'application/json' }, body });
      expect(response.status).toBe(expected);
      expect(await response.json()).toEqual({ status });
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    // The parser rejects oversized Content-Length before reading the body.
    // Inspect that response without racing an upload against a closed socket.
    const oversized = await new Promise<{ code?: number; body: string }>((resolve, reject) => {
      const request = httpRequest(`${url}/test-error`, { method: 'POST', headers: {
        'content-type': 'application/json', 'content-length': String(1024 * 1024 + 1),
      } }, response => {
        let body = '';
        response.setEncoding('utf8').on('data', chunk => { body += chunk; });
        response.on('end', () => resolve({ code: response.statusCode, body }));
      });
      request.on('error', reject);
      request.end();
    });
    expect(oversized.code).toBe(413);
    expect(JSON.parse(oversized.body)).toEqual({ status: 'request_too_large' });
  });
  it('does not use forwarded headers to determine the client or hostname', async () => {
    const app = createApiServer();
    app.get('/test-context', async request => ({ ip: request.ip, hostname: request.hostname }));
    const { url } = await listen(app);
    const response = await fetch(`${url}/test-context`, {
      headers: { 'x-forwarded-for': '203.0.113.1', 'x-forwarded-host': 'secret-tenant.example' },
    });
    const context = await response.json() as { ip: string; hostname: string };
    expect(context.ip).toBe('127.0.0.1');
    expect(context.hostname).toBe('127.0.0.1');
  });
});

describe('compiled server process', () => {
  it.each(['SIGTERM', 'SIGINT'] as const)('serves HTTP and exits on %s', async signal => {
    const { server, port, url } = await listen();
    await server.close();
    const running = child({ OFFICE_API_HOST: '127.0.0.1', OFFICE_API_PORT: String(port) });
    const exited = once(running, 'exit');
    const first = await Promise.race([
      once(running.stdout!, 'data').then(([data]) => String(data)),
      exited.then(() => 'exited_before_listen'),
    ]);
    expect(first).toContain('api_listening');
    expect((await fetch(`${url}/health/live`)).status).toBe(200);
    running.kill(signal);
    expect(await exited).toEqual([0, null]);
  });
  it('forces an incomplete request closed at the shutdown deadline', async () => {
    const { server, port } = await listen();
    await server.close();
    const running = child({ OFFICE_API_HOST: '127.0.0.1', OFFICE_API_PORT: String(port),
      OFFICE_API_SHUTDOWN_TIMEOUT_MS: '50' });
    const exited = once(running, 'exit');
    expect(String((await once(running.stdout!, 'data'))[0])).toContain('api_listening');
    const socket = createConnection({ host: '127.0.0.1', port });
    sockets.push(socket);
    await once(socket, 'connect');
    socket.write('GET /health/live HTTP/1.1\r\nHost: localhost\r\n');
    running.kill('SIGTERM');
    expect(await exited).toEqual([1, null]);
  });
  it('rejects invalid startup configuration without logging secret values', async () => {
    const running = child({ OFFICE_API_PORT: 'secret-value' });
    let stderr = '';
    running.stderr!.on('data', data => { stderr += String(data); });
    expect(await once(running, 'exit')).toEqual([1, null]);
    expect(stderr).toContain('api_start_failed');
    expect(stderr).not.toContain('secret-value');
  });
  it('exits with failure when the port is occupied', async () => {
    const { port } = await listen();
    const running = child({ OFFICE_API_HOST: '127.0.0.1', OFFICE_API_PORT: String(port) });
    expect(await once(running, 'exit')).toEqual([1, null]);
  });
});
