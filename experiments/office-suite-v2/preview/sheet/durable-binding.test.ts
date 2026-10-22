import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { startDurableMode } from './durable-binding.ts';
import type { ClientLockManager } from './client-lock.ts';

class Control extends EventTarget {
  hidden = false; inert = false; disabled = false; href = ''; textContent = '';
  readonly dataset: Record<string, string> = {};
}
class Anchor extends Control {}
class Button extends Control {}
const ids = ['durable-controls', 'sheet-workbook', 'create-client', 'open-client', 'new-client', 'pause-relay',
  'retry-relay', 'alternative-panel', 'session-label', 'preview-scope', 'preview-status', 'durable-status',
  'client-identity', 'save-state', 'outbox-state'];

async function modeledPage(manager: ClientLockManager | undefined, run: (page: {
  controls: Map<string, Control>; window: EventTarget; reads: () => number; requests: () => number;
}) => Promise<void>): Promise<void> {
  const controls = new Map(ids.map(id => [id, id === 'open-client' || id === 'new-client' ? new Anchor() :
    id === 'pause-relay' || id === 'retry-relay' ? new Button() : new Control()]));
  const page = new EventTarget();
  let reads = 0, requests = 0;
  const values: Record<string, unknown> = {
    window: page, document: { getElementById: (id: string) => controls.get(id) },
    location: { origin: 'http://127.0.0.1:55264', pathname: '/', href: 'http://127.0.0.1:55264/?client=model-client&new=1' },
    history: { replaceState: () => {} }, HTMLAnchorElement: Anchor, HTMLButtonElement: Button,
    navigator: { locks: manager }, indexedDB: { open: () => { reads++; throw new Error('IDB must stay closed'); } },
    fetch: () => { requests++; throw new Error('Network must stay closed'); },
  };
  const previous = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, value });
    startDurableMode();
    await run({ controls, window: page, reads: () => reads, requests: () => requests });
  } finally {
    page.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: false }));
    await setImmediate();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

test('modeled page refuses duplicate writer before IDB or session request', async () => {
  const names: string[] = [];
  await modeledPage({ request: async (name, _options, callback) => { names.push(name); await callback(null); } }, async page => {
    await setImmediate();
    assert.deepEqual(names, ['wonffice-sheet-client:model-client']);
    assert.equal(page.reads(), 0); assert.equal(page.requests(), 0);
    assert.match(page.controls.get('durable-status')!.textContent, /already open in another tab/);
    assert.equal(page.controls.get('sheet-workbook')!.inert, true);
  });
});

test('modeled page with unavailable locking never opens data or network', async () => {
  await modeledPage(undefined, async page => {
    await setImmediate();
    assert.match(page.controls.get('durable-status')!.textContent, /locking is unavailable/);
    assert.equal(page.reads(), 0); assert.equal(page.requests(), 0);
  });
});

test('modeled nonpersisted pagehide before lock grant releases grant without opening IDB', async () => {
  let grant: ((lock: object | null) => Promise<void>) | undefined;
  await modeledPage({ request: async (_name, _options, callback) => { grant = callback; } }, async page => {
    assert.ok(grant);
    page.window.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: false }));
    await grant({});
    await setImmediate();
    assert.equal(page.reads(), 0); assert.equal(page.requests(), 0);
    assert.equal(page.controls.get('sheet-workbook')!.inert, true);
  });
});
