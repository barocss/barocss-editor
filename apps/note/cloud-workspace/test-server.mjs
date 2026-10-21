// Controlled local integration harness, never included in the Worker/deployment output.
// It is deliberately limited to loopback and injects fictional identities for browser tests.
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import worker from './dist/server/index.js';
import { openTestDB } from './test-db.mjs';

const port = Number(process.env.CLOUD_WORKSPACE_TEST_PORT ?? 5194);
const db = openTestDB();
const server = createServer(async (incoming, outgoing) => {
  try {
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) {
      if (!key.startsWith('oai-authenticated-') && typeof value === 'string') headers.set(key, value);
    }
    const cookie = incoming.headers.cookie?.match(/(?:^|;\s*)cw-test-identity=([^;]+)/)?.[1] ?? 'fictional-owner-a';
    if (cookie !== 'none') headers.set('oai-authenticated-user-id', cookie);
    const method = incoming.method ?? 'GET';
    const request = new Request(`http://127.0.0.1:${port}${incoming.url}`, {
      method, headers, ...(['GET', 'HEAD'].includes(method) ? {} : { body: Readable.toWeb(incoming), duplex: 'half' })
    });
    const response = await worker.fetch(request, { DB: db.api });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch { outgoing.writeHead(500); outgoing.end('Test harness error'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Controlled test harness: http://127.0.0.1:${port}`));
const stop = () => server.close(() => { db.close(); process.exit(0); });
process.on('SIGTERM', stop); process.on('SIGINT', stop);
