import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SourceTextModule, createContext, runInContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { openTestDB } from './test-db.mjs';
test('the actual built Worker loads, denies anonymous access, saves and serves assets without Node globals', async () => {
  // Web APIs keep their own implementation realm; the production module gets no Node globals.
  // Removing Buffer from Node itself would break Node's Web API implementation, not the Worker.
  const context = createContext({ Request, Response, Headers, URL, TextEncoder, TextDecoder,
    crypto, atob, btoa, setTimeout, clearTimeout, console, AbortController, structuredClone });
  assert.equal(runInContext('typeof process', context), 'undefined');
  assert.equal(runInContext('typeof Buffer', context), 'undefined');
  const module = new SourceTextModule(readFileSync(new URL('./dist/server/index.js', import.meta.url), 'utf8'), { context });
  await module.link(() => { throw new Error('A self-contained Worker must not import external modules'); });
  await module.evaluate();
  const worker = module.namespace.default, db = openTestDB();
  try {
    const origin = 'https://worker-runtime.test';
    const anonymous = await worker.fetch(new Request(`${origin}/api/workspace/documents`), { DB: db.api });
    assert.equal(anonymous.status, 401);
    const documentId = crypto.randomUUID();
    const snapshotText = JSON.stringify({ format: 'barocss-note', version: 1, document: {
      stype: 'note', attributes: { title: 'Web runtime', pageId: `note-${crypto.randomUUID()}` },
      content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Web globals only.' }] }]
    } });
    const response = await worker.fetch(new Request(`${origin}/api/workspace/documents`, {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'oai-authenticated-user-id': 'fictional-worker-owner', 'X-Workspace-Expected-Scope': 'fictional-worker-owner' },
      body: JSON.stringify({ documentId, baseRevision: 0, requestId: crypto.randomUUID(), snapshotText })
    }), { DB: db.api });
    assert.equal(response.status, 200);
    const opened = await worker.fetch(new Request(`${origin}/api/workspace/documents/${documentId}`, {
      headers: { 'oai-authenticated-user-id': 'fictional-worker-owner', 'X-Workspace-Expected-Scope': 'fictional-worker-owner' }
    }), { DB: db.api });
    assert.equal(opened.status, 200); assert.equal((await opened.json()).snapshotText, snapshotText);
    const asset = await worker.fetch(new Request(`${origin}/`), { DB: db.api });
    assert.equal(asset.status, 200); assert.equal(asset.headers.get('Content-Type'), 'text/html; charset=utf-8');
  } finally { db.close(); }
});
