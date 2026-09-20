import { afterEach, describe, expect, it } from 'vitest';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createConnection } from 'node:net';
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
    server.closeAllConnections();
    server.close(() => resolve());
  })));
});
async function listen() {
  const server = createApiServer();
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  return { server, port, url: `http://127.0.0.1:${port}` };
}
function child(env: NodeJS.ProcessEnv) {
  const process = spawn(globalThis.process.execPath, ['dist/main.js'], {
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

describe('compiled server process', () => {
  it.each(['SIGTERM', 'SIGINT'] as const)('serves HTTP and exits on %s', async signal => {
    const { server, port, url } = await listen();
    await new Promise<void>(resolve => server.close(() => resolve()));
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
    await new Promise<void>(resolve => server.close(() => resolve()));
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
