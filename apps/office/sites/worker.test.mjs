import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SourceTextModule, createContext } from 'node:vm';
import { readFileSync } from 'node:fs';

test('original Office HTML, assets, compact paths and same-origin frames survive Worker hosting', async () => {
  let requestActive = false;
  const requestOnly = fn => (...args) => {
    if (!requestActive) throw new Error('Disallowed operation called within global scope');
    return fn(...args);
  };
  const context = createContext({ Request, Response, Headers, URL, TextEncoder, TextDecoder,
    crypto: { getRandomValues: requestOnly(crypto.getRandomValues.bind(crypto)),
      randomUUID: requestOnly(crypto.randomUUID.bind(crypto)),
      subtle: { digest: requestOnly(crypto.subtle.digest.bind(crypto.subtle)) } },
    atob, btoa, structuredClone, console, setTimeout: requestOnly(setTimeout), clearTimeout });
  const file = process.env.OFFICE_WORKER_PATH ?? new URL('./dist/server/index.js', import.meta.url);
  const module = new SourceTextModule(readFileSync(file, 'utf8'), { context });
  await module.link(() => { throw new Error('Worker must be self-contained'); });
  await module.evaluate();
  const fetch = async (path, method = 'GET') => {
    requestActive = true;
    try { return await module.namespace.default.fetch(new Request(`https://office.test${path}`, { method }), {
      DB: { prepare() { throw new Error('Office asset delivery must not access the legacy D1 data'); } }
    }); } finally { requestActive = false; }
  };
  const root = await fetch('/'), html = await root.text();
  assert.equal(root.status, 200); assert.match(html, /Wonffice · 내 작업 공간/);
  for (const path of ['/qa-workspace', '/qa-workspace/qa-document?__native_frame=example&view=library']) {
    const response = await fetch(path);
    assert.equal(response.status, 200); assert.equal(await response.text(), html);
    assert.equal(response.headers.get('location'), null); assert.equal(response.headers.get('x-frame-options'), null);
  }
  for (const product of ['note', 'word', 'slides', 'site']) {
    const response = await fetch(`/products/${product}/index.html?workspace=qa-workspace`);
    assert.equal(response.status, 200); assert.match(await response.text(), new RegExp(`Wonffice ${product}`, 'i'));
  }
  assert.equal((await fetch('/design-system/index.html')).status, 200);
  for (const path of ['/assets/missing.js', '/api/v1/me', '/products/missing/index.html']) {
    const response = await fetch(path); assert.equal(response.status, 404); assert.doesNotMatch(await response.text(), /<html/i);
  }
  const script = html.match(/src="([^"]+\.js)"/)[1];
  const asset = await fetch(script); assert.equal(asset.status, 200); assert.match(asset.headers.get('content-type'), /javascript/);
  assert.equal(await (await fetch('/qa-workspace/qa-document', 'HEAD')).text(), '');
  assert.equal((await fetch('/', 'POST')).status, 405);
  assert.equal((await fetch('/api/workspace/session')).status, 401);
});
