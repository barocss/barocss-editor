// Loopback-only test fixture. This file is never imported by the production Worker.
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { openTestDB } from '../../note/cloud-workspace/test-db.mjs';
const worker = (await import(pathToFileURL(process.env.OFFICE_WORKER_PATH ?? new URL('./dist/server/index.js', import.meta.url).pathname).href)).default;
const database = openTestDB();
createServer(async (incoming, outgoing) => {
  try {
    const headers = new Headers(incoming.headers);
    // Simulate the trusted dispatch boundary; a caller-supplied identity header is never forwarded.
    headers.delete('oai-authenticated-user-id');
    const actor = (incoming.headers.cookie ?? '').match(/(?:^|;\s*)qa_office_actor=(qa-[a-z\d-]{1,100})(?:;|$)/)?.[1];
    if (actor) headers.set('oai-authenticated-user-id', `fictional-office:${actor}`);
    const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
    const request = new Request(`http://127.0.0.1:5394${incoming.url}`, { method: incoming.method, headers,
      ...(!['GET', 'HEAD'].includes(incoming.method) ? { body: Buffer.concat(chunks) } : {}) });
    const response = await worker.fetch(request, { DB: database.api });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch { outgoing.writeHead(500); outgoing.end('Test harness failure'); }
}).listen(5394, '127.0.0.1');
