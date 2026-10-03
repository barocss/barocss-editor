import { DocumentSession, type DocumentSessionOptions } from './document-session';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertProductDocumentOpen, isProductDocumentTrashed, ProductDocumentTrashedError, captureProductNavigation, prepareProductNavigation, registerProductDocumentHost } from './product-host';

const catalog = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../document-library/document-library', async importOriginal => ({ ...await importOriginal<typeof import('../document-library/document-library')>(), documentLibrary: () => catalog }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });

describe('product navigation ownership', () => {
  it('does not navigate without a ready document or after a failed save', async () => {
    expect(await prepareProductNavigation()).toBe(false);
    const close = registerProductDocumentHost({ product: 'word', id: () => 'one', beforeNavigate: async () => false });
    expect(await prepareProductNavigation()).toBe(false); close();
  });
  it('refuses a navigation prepared for a document replaced while its save was pending', async () => {
    let id = 'one';
    const close = registerProductDocumentHost({ product: 'slides', id: () => id, beforeNavigate: async () => { id = 'two'; return true; } });
    expect(await prepareProductNavigation()).toBe(false); close();
  });
  it('cleanup from an old mounted host cannot unregister a newer host', async () => {
    const old = registerProductDocumentHost({ product: 'word', id: () => 'old', beforeNavigate: async () => false });
    const current = registerProductDocumentHost({ product: 'site', id: () => 'current', beforeNavigate: async () => true });
    old(); expect(await prepareProductNavigation()).toBe(true); current();
  });
  it('refuses a save completed after the same host was registered again', async () => {
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const host = { product: 'word' as const, id: () => 'original', beforeNavigate: async () => { await waiting; return true; } };
    const old = registerProductDocumentHost(host);
    const pending = prepareProductNavigation();
    const close = registerProductDocumentHost(host);
    release();
    try { expect(await pending).toBe(false); } finally { old(); close(); }
  });
  it('old cleanup cannot retire the same host registered for a new lifetime', async () => {
    const host = { product: 'site' as const, id: () => 'original', beforeNavigate: async () => true };
    const old = registerProductDocumentHost(host), close = registerProductDocumentHost(host);
    old();
    try { expect(await prepareProductNavigation()).toBe(true); } finally { close(); }
  });
  it('pins an opening guard through save and subsequent catalog awaits', async () => {
    const host = { product: 'slides' as const, id: () => 'original', beforeNavigate: vi.fn(async () => true) };
    const old = registerProductDocumentHost(host);
    const guard = captureProductNavigation()!;
    try {
      expect(guard.product).toBe('slides'); expect(guard.id).toBe('original');
      expect(await guard.prepare()).toBe(true);
      let release!: () => void;
      const catalog = new Promise<void>(resolve => { release = resolve; });
      const pending = catalog.then(() => guard.isCurrent());
      const close = registerProductDocumentHost(host);
      release();
      try { expect(await pending).toBe(false); expect(await guard.prepare()).toBe(false); }
      finally { close(); }
      expect(host.beforeNavigate).toHaveBeenCalledTimes(1);
    } finally { old(); }
  });
  it('refuses A to B to A identity changes reported by the owning host', async () => {
    let id = 'a', epoch = 0, release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const close = registerProductDocumentHost({ product: 'note', id: () => id, identityEpoch: () => epoch,
      beforeNavigate: async () => { await waiting; return true; } });
    const guard = captureProductNavigation()!, pending = guard.prepare();
    id = 'b'; epoch++; id = 'a'; epoch++; release();
    try { expect(await pending).toBe(false); expect(guard.isCurrent()).toBe(false); } finally { close(); }
  });
  it('does not invalidate an unchanged host merely because its save completed', async () => {
    const close = registerProductDocumentHost({ product: 'word', id: () => 'original', identityEpoch: () => 7, beforeNavigate: async () => true });
    const guard = captureProductNavigation()!;
    try { expect(await guard.prepare()).toBe(true); expect(guard.isCurrent()).toBe(true); }
    finally { close(); }
    expect(guard.isCurrent()).toBe(false);
    expect(captureProductNavigation()).toBeUndefined();
  });

  it('keeps unsupported native opening unavailable', () => {
    const close = registerProductDocumentHost({ product: 'note', id: () => 'one', beforeNavigate: async () => true });
    try { expect(captureProductNavigation()!.open).toBeUndefined(); } finally { close(); }
  });
  it('opens through the product owner and verifies the installed target', async () => {
    let id = 'one', epoch = 0;
    const prepare = vi.fn(async () => true);
    const close = registerProductDocumentHost({ product: 'word', id: () => id, identityEpoch: () => epoch,
      beforeNavigate: prepare, requestOpen: async (target, isCurrent) => {
        if (!isCurrent()) return false;
        id = target; epoch++; return captureProductNavigation()!;
      } });
    const guard = captureProductNavigation()!;
    try { expect((await guard.open!('two')) && captureProductNavigation()!.id).toBe('two'); expect(guard.isCurrent()).toBe(false);
      expect(captureProductNavigation()!.id).toBe('two'); expect(prepare).not.toHaveBeenCalled();
    } finally { close(); }
  });
  it('rejects retired callbacks and never invokes their opening command', async () => {
    const requestOpen = vi.fn(async () => captureProductNavigation()!);
    const old = registerProductDocumentHost({ product: 'word', id: () => 'one', beforeNavigate: async () => true, requestOpen });
    const guard = captureProductNavigation()!;
    const close = registerProductDocumentHost({ product: 'word', id: () => 'one', beforeNavigate: async () => true });
    try { expect(await guard.open!('two')).toBe(false); expect(requestOpen).not.toHaveBeenCalled(); }
    finally { old(); close(); }
  });
  it('passes the captured lifetime through delayed product preparation and refuses a duplicate', async () => {
    let release!: () => void, id = 'one', epoch = 0;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const requestOpen = vi.fn(async (target: string, isCurrent: () => boolean) => {
      await waiting;
      if (!isCurrent()) return false;
      id = target; epoch++; return captureProductNavigation()!;
    });
    const close = registerProductDocumentHost({ product: 'word', id: () => id, identityEpoch: () => epoch,
      beforeNavigate: async () => true, requestOpen });
    const guard = captureProductNavigation()!;
    try {
      const pending = guard.open!('two');
      expect(await captureProductNavigation()!.open!('three')).toBe(false);
      id = 'two'; epoch++; id = 'one'; epoch++;
      release(); expect(await pending).toBe(false); expect(id).toBe('one'); expect(requestOpen).toHaveBeenCalledTimes(1);
    } finally { release(); close(); }
  });
  it('refuses a reported success that did not install the requested original and releases after failure', async () => {
    const requestOpen = vi.fn().mockRejectedValueOnce(new Error('save failed')).mockImplementation(async () => captureProductNavigation()!);
    const close = registerProductDocumentHost({ product: 'word', id: () => 'one', beforeNavigate: async () => true, requestOpen });
    try {
      await expect(captureProductNavigation()!.open!('two')).rejects.toThrow('save failed');
      expect(await captureProductNavigation()!.open!('two')).toBe(false);
      expect(requestOpen).toHaveBeenCalledTimes(2);
    } finally { close(); }
  });

  it('accepts the exact target witness when installation registers its new native owner', async () => {
    let removeTarget: (() => void) | undefined;
    const close = registerProductDocumentHost({ product: 'word', id: () => 'one', beforeNavigate: async () => true,
      requestOpen: async () => {
        removeTarget = registerProductDocumentHost({ product: 'word', id: () => 'two', beforeNavigate: async () => true });
        return captureProductNavigation()!;
      } });
    try { const opened = await captureProductNavigation()!.open!('two'); expect(opened && opened.isCurrent()).toBe(true); }
    finally { close(); removeTarget?.(); }
  });

  it('rejects completion from a target registration replaced before delivery', async () => {
    const cleanups: (() => void)[] = [];
    const owner = { product: 'word' as const, id: () => 'two', beforeNavigate: async () => true };
    cleanups.push(registerProductDocumentHost({ product: 'word', id: () => 'one', beforeNavigate: async () => true,
      requestOpen: async () => {
        cleanups.push(registerProductDocumentHost(owner));
        const installed = captureProductNavigation()!;
        cleanups.push(registerProductDocumentHost(owner));
        return installed;
      } }));
    try { expect(await captureProductNavigation()!.open!('two')).toBe(false); }
    finally { cleanups.forEach(close => close()); }
  });
  it('does not let an unresolved retired opening lock a new native host', async () => {
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const old = registerProductDocumentHost({ product: 'word', id: () => 'one', beforeNavigate: async () => true,
      requestOpen: async (_target, isCurrent) => { await waiting; return isCurrent() ? captureProductNavigation()! : false; } });
    const pending = captureProductNavigation()!.open!('two');
    let id = 'new';
    const close = registerProductDocumentHost({ product: 'word', id: () => id, beforeNavigate: async () => true,
      requestOpen: async target => { id = target; return captureProductNavigation()!; } });
    try { old(); expect((await captureProductNavigation()!.open!('three')) && id).toBe('three');
      release(); expect(await pending).toBe(false); expect(id).toBe('three');
    } finally { release(); old(); close(); }
  });

  it('retires an unresolved opening after the same host identity epoch changes', async () => {
    let release!: () => void, id = 'one', epoch = 0, requests = 0;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const close = registerProductDocumentHost({ product: 'word', id: () => id, identityEpoch: () => epoch,
      beforeNavigate: async () => true, requestOpen: async (target, isCurrent) => {
        if (++requests === 1) await waiting;
        if (!isCurrent()) return false;
        id = target; epoch++; return captureProductNavigation()!;
      } });
    const pending = captureProductNavigation()!.open!('two'); epoch++;
    try { expect((await captureProductNavigation()!.open!('three')) && id).toBe('three');
      release(); expect(await pending).toBe(false); expect(id).toBe('three');
    } finally { release(); close(); }
  });

  it('tracks actual DocumentSession reopen ABA without changing original saved bytes', async () => {
    history.replaceState(null, '', '#');
    let native = JSON.stringify({ paragraph: 'original', attributes: { objectId: 'stable' } });
    let changed: (replaced?: boolean) => void = () => {};
    const records = new Map<string, { row: { name: string; revision: number }; text: string }>();
    const store = {
      read: async (id: string) => records.get(id),
      keep: async (row: { name: string }, text: string) => {
        const saved = { name: row.name, revision: (records.get(row.name)?.row.revision ?? 0) + 1 };
        records.set(row.name, { row: saved, text }); return saved;
      }
    };
    const options: DocumentSessionOptions = { key: 'word', documents: store as never, drafts: store as never,
      snapshot: () => ({ text: native, title: 'original', count: 1 }),
      replace: text => { native = text; changed(true); },
      subscribe: listener => { changed = listener; return () => {}; } };
    const session = new DocumentSession(options);
    try {
      await session.start(); expect(await session.flush()).toBe(true);
      const original = session.id, saved = structuredClone(records.get(original));
      const guard = captureProductNavigation()!;
      expect(await guard.prepare()).toBe(true);
      records.set('other', { row: { name: 'other', revision: 1 }, text: '{"paragraph":"other"}' });
      expect(await session.open('other')).toBe(true); expect(await session.open(original)).toBe(true);
      expect(session.id).toBe(original); expect(records.get(original)).toEqual(saved);
      expect(guard.isCurrent()).toBe(false); expect(await captureProductNavigation()!.prepare()).toBe(true);
      const current = captureProductNavigation()!;
      native = JSON.stringify({ paragraph: 'final input', attributes: { objectId: 'stable' } });
      changed(false);
      expect(await current.prepare()).toBe(true); expect(current.isCurrent()).toBe(true);
      expect(records.get(original)?.text).toBe(native);
      const beforeReplacement = captureProductNavigation()!;
      native = '{"paragraph":"new document"}'; changed(true);
      expect(beforeReplacement.isCurrent()).toBe(false);
    } finally { session.stop(); history.replaceState(null, '', '#'); }
  });

});


describe('workspace trash policy for product libraries', () => {
  const workspace = () => {
    vi.stubGlobal('location', { search: '?workspace=one' });
    vi.stubGlobal('localStorage', { getItem: () => 'one' });
  };
  it('filters trash without changing the product store and checks again before opening', async () => {
    workspace();
    catalog.read.mockResolvedValueOnce({ text: '{"trashedAt":null}' });
    expect(await isProductDocumentTrashed('slides', 'a')).toBe(false);
    catalog.read.mockResolvedValueOnce({ text: '{"trashedAt":0}' });
    await expect(assertProductDocumentOpen('slides', 'a')).rejects.toBeInstanceOf(ProductDocumentTrashedError);
    expect(catalog.read).toHaveBeenNthCalledWith(1, 'slides:a');
    expect(catalog.read).toHaveBeenNthCalledWith(2, 'slides:a');
  });
  it('opens the same original identity after workspace restoration', async () => {
    workspace();
    catalog.read.mockResolvedValueOnce({ text: '{"trashedAt":123}' });
    expect(await isProductDocumentTrashed('word', 'original-a')).toBe(true);
    catalog.read.mockResolvedValueOnce({ text: '{"trashedAt":null}' });
    await expect(assertProductDocumentOpen('word', 'original-a')).resolves.toBeUndefined();
    expect(catalog.read).toHaveBeenLastCalledWith('word:original-a');
  });
  it('keeps standalone libraries available and preserves the workspace mismatch denial', async () => {
    vi.stubGlobal('location', { search: '' });
    expect(await isProductDocumentTrashed('site', 'a')).toBe(false);
    await expect(assertProductDocumentOpen('site', 'a')).resolves.toBeUndefined();
    vi.stubGlobal('location', { search: '?workspace=other' });
    vi.stubGlobal('localStorage', { getItem: () => 'one' });
    await expect(assertProductDocumentOpen('site', 'a')).rejects.toThrow('다른 작업 공간');
    expect(catalog.read).not.toHaveBeenCalled();
  });
  it('retains catalog read errors instead of treating unknown trash state as available', async () => {
    workspace();
    catalog.read.mockRejectedValue(new Error('catalog unavailable'));
    await expect(isProductDocumentTrashed('site', 'a')).rejects.toThrow('catalog unavailable');
    await expect(assertProductDocumentOpen('site', 'a')).rejects.toThrow('catalog unavailable');
  });
});
