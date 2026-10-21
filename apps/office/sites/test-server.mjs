// Loopback-only production-build harness; no identity injection and no production binding.
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
const worker = (await import(pathToFileURL(process.env.OFFICE_WORKER_PATH ?? new URL('./dist/server/index.js', import.meta.url).pathname).href)).default;
createServer(async (incoming, outgoing) => {
  try {
    const request = new Request(`http://127.0.0.1:5394${incoming.url}`, { method: incoming.method, headers: incoming.headers });
    const response = await worker.fetch(request, {});
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch { outgoing.writeHead(500); outgoing.end('Test harness failure'); }
}).listen(5394, '127.0.0.1');
