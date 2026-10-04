import { DocumentSession, type DocumentSessionOptions } from './document-session';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertProductDocumentOpen, isProductDocumentTrashed, ProductDocumentTrashedError, captureProductNavigation, prepareProductNavigation, prepareProductAccountExit, registerProductDocumentHost, createNativeHostSlot, disposeNativeHostSlot, isNativeHostSlotActive, productDocumentHost, promoteProductNavigation, captureProductReplacementPreparation, registerProductReplacementPreparation, type ProductNavigationGuard } from './product-host';

const catalog = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../document-library/document-library', async importOriginal => ({ ...await importOriginal<typeof import('../document-library/document-library')>(), documentLibrary: () => catalog }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });

describe('mounted replacement preparation', () => {
  it('leaves standalone storage available and refuses a later integration owner', async () => {
    const standalone = captureProductReplacementPreparation();
    expect(standalone.isPrepared()).toBe(false);
    expect(await standalone.prepare()).toBe(true);
    const detach = registerProductReplacementPreparation(() => ({ prepare: async () => true, isPrepared: () => true }));
    try { expect(standalone.isPrepared()).toBe(false); } finally { detach(); }
    expect(standalone.isPrepared()).toBe(false);
    expect(await captureProductReplacementPreparation().prepare()).toBe(true);
  });
  it('refuses later input without changing the mounted host', async () => {
    let input = 0, saved = -1;
    const detach = registerProductReplacementPreparation(() => ({
      prepare: async () => { saved = input; return true; }, isPrepared: () => saved === input
    }));
    try {
      const witness = captureProductReplacementPreparation();
      expect(await witness.prepare()).toBe(true);
      input++;
      expect(witness.isPrepared()).toBe(false);
      expect(await witness.prepare()).toBe(true);
    } finally { detach(); }
  });
  it('cannot approve after A is replaced by B and the same A callback returns', async () => {
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const capture = () => ({ prepare: async () => { await waiting; return true; }, isPrepared: () => true });
    const old = registerProductReplacementPreparation(capture);
    const witness = captureProductReplacementPreparation(), prepared = witness.prepare();
    const newer = registerProductReplacementPreparation(capture);
    old();
    try {
      release(); expect(await prepared).toBe(false); expect(witness.isPrepared()).toBe(false);
      expect(await captureProductReplacementPreparation().prepare()).toBe(true);
    } finally { newer(); }
  });
});

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

it('a retired parent intent prevents installation and releases its held lease for a new parent', async () => {
  let epoch = 0, id = 'one', release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const install = vi.fn();
  const close = registerProductDocumentHost({ product: 'word', id: () => id, identityEpoch: () => epoch, beforeNavigate: async () => true,
    requestOpen: async (target, owns, parent) => {
      if (target === 'old') await held;
      if (!owns() || !parent?.()) return false;
      install(target); id = target; epoch++; return captureProductNavigation()!;
    } });
  let parentEpoch = 1;
  const original = captureProductNavigation()!, stale = original.open!('old', () => parentEpoch === 1);
  parentEpoch = 2;
  try {
    const latest = await original.open!('new', () => parentEpoch === 2);
    expect(latest && latest.id).toBe('new');
    release(); expect(await stale).toBe(false); expect(install.mock.calls).toEqual([['new']]);
  } finally { release(); close(); }
});
it('keeps the standalone parent witness valid after native host replacement and refuses completion after parent retirement', async () => {
  let release!: () => void, entered!: () => void, parent = true, targetClose = () => {};
  const waiting = new Promise<void>(resolve => { release = resolve; }), installed = new Promise<void>(resolve => { entered = resolve; });
  const close = registerProductDocumentHost({ product: 'note', id: () => 'one', beforeNavigate: async () => true,
    requestOpen: async (target, owns, parentCurrent) => {
      if (!owns()) return false;
      targetClose = registerProductDocumentHost({ product: 'note', id: () => target, beforeNavigate: async () => true });
      const witness = captureProductNavigation()!;
      expect(owns()).toBe(false); expect(parentCurrent?.()).toBe(true);
      entered(); await waiting; return witness;
    } });
  const opening = captureProductNavigation()!.open!('two', () => parent);
  await installed; parent = false; release();
  try { expect(await opening).toBe(false); } finally { close(); targetClose(); }
});


describe('staged native host promotion', () => {
  for (const promoted of [false, true]) it(`refuses an inactive target returned by the default active owner (${promoted ? 'promoted slot' : 'global registration'})`, async () => {
    const targetSlot = createNativeHostSlot(), sourceSlot = promoted ? createNativeHostSlot() : undefined;
    const close = registerProductDocumentHost({ product: 'word', id: () => 'source', beforeNavigate: async () => true,
      requestOpen: async () => captureProductNavigation(targetSlot)! }, sourceSlot);
    const targetClose = registerProductDocumentHost({ product: 'word', id: () => 'target', beforeNavigate: async () => true }, targetSlot);
    let initialClose = () => {};
    try {
      if (sourceSlot) {
        initialClose = registerProductDocumentHost({ product: 'note', id: () => 'initial', beforeNavigate: async () => true });
        expect(promoteProductNavigation(captureProductNavigation()!, captureProductNavigation(sourceSlot)!)).not.toBe(false);
      }
      const source = captureProductNavigation()!;
      expect(await source.open!('target')).toBe(false);
      expect(source.isCurrent()).toBe(true);
      expect(productDocumentHost()?.id()).toBe('source');
      expect(captureProductNavigation(targetSlot)!.isCurrent()).toBe(true);
      expect(isNativeHostSlotActive(targetSlot)).toBe(false);
    } finally { targetClose(); disposeNativeHostSlot(targetSlot); close(); if (sourceSlot) disposeNativeHostSlot(sourceSlot); initialClose(); }
  });

  it('keeps a ready staged host isolated until one exact synchronous promotion', async () => {
    const changed = vi.fn(), publicChange = vi.fn();
    window.addEventListener('wonffice:host-change', publicChange);
    const source = { product: 'note' as const, id: () => 'source', beforeNavigate: async () => true };
    const target = { product: 'slides' as const, id: () => 'target', beforeNavigate: async () => true };
    const removeSource = registerProductDocumentHost(source);
    const original = captureProductNavigation()!;
    const slot = createNativeHostSlot(changed);
    try {
      expect(captureProductNavigation(slot)).toBeUndefined();
      expect(isNativeHostSlotActive(slot)).toBe(false);
      const removeTarget = registerProductDocumentHost(target, slot);
      const staged = captureProductNavigation(slot)!;
      expect(changed).toHaveBeenCalledTimes(1);
      expect(changed.mock.calls[0][0].isCurrent()).toBe(true);
      expect(productDocumentHost()).toBe(source);
      expect(productDocumentHost(slot)).toBe(target);
      expect(original.isCurrent()).toBe(true);
      expect(publicChange).toHaveBeenCalledTimes(1);
      expect(await original.prepare()).toBe(true);
      const installed = promoteProductNavigation(original, staged);
      expect(installed && installed.product).toBe('slides');
      expect(installed && installed.id).toBe('target');
      expect(installed && installed.isCurrent()).toBe(true);
      expect(original.isCurrent()).toBe(false);
      expect(staged.isCurrent()).toBe(true);
      expect(isNativeHostSlotActive(slot)).toBe(true);
      expect(publicChange).toHaveBeenCalledTimes(2);
      removeSource(); expect(productDocumentHost()).toBe(target);
      removeTarget(); expect(productDocumentHost()).toBeUndefined();
      expect(staged.isCurrent()).toBe(false);
      expect(publicChange).toHaveBeenCalledTimes(3);
    } finally { removeSource(); disposeNativeHostSlot(slot); window.removeEventListener('wonffice:host-change', publicChange); }
  });

  it('refuses new source input during actual DocumentSession preparation and cancels only the target', async () => {
    history.replaceState(null, '', '#');
    let native = JSON.stringify({ paragraph: 'original', attributes: { objectId: 'stable' } });
    let changed: (replaced?: boolean) => void = () => {};
    const records = new Map<string, { row: { name: string; revision: number }; text: string }>();
    let holdWrite = false, release!: () => void, entered!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const writing = new Promise<void>(resolve => { entered = resolve; });
    const store = {
      read: async (id: string) => records.get(id),
      keep: async (row: { name: string }, text: string) => {
        if (holdWrite) { holdWrite = false; entered(); await waiting; }
        const saved = { name: row.name, revision: (records.get(row.name)?.row.revision ?? 0) + 1 };
        records.set(row.name, { row: saved, text }); return saved;
      }
    };
    const session = new DocumentSession({ key: 'word', documents: store as never, drafts: store as never,
      snapshot: () => ({ text: native, title: 'original', count: 1 }),
      replace: text => { native = text; changed(true); },
      subscribe: listener => { changed = listener; return () => {}; } });
    const slot = createNativeHostSlot();
    try {
      await session.start(); expect(await session.flush()).toBe(true);
      const source = productDocumentHost(), originalId = session.id;
      registerProductDocumentHost({ product: 'note', id: () => 'target', beforeNavigate: async () => true }, slot);
      const original = captureProductNavigation()!, staged = captureProductNavigation(slot)!;
      native = JSON.stringify({ paragraph: 'first edit', attributes: { objectId: 'stable' } }); changed();
      holdWrite = true;
      const preparing = original.prepare(); await writing;
      native = JSON.stringify({ paragraph: 'latest edit', attributes: { objectId: 'stable' } }); changed();
      release();
      const prepared = await preparing;
      expect(prepared).toBe(false);
      // The coordinator must honor native preparation, not treat lifetime equality as saved input.
      const promoted = prepared && promoteProductNavigation(original, staged);
      expect(promoted).toBe(false);
      disposeNativeHostSlot(slot);
      expect(productDocumentHost()).toBe(source);
      expect(original.isCurrent()).toBe(true);
      expect(session.id).toBe(originalId);
      expect(JSON.parse(native)).toEqual({ paragraph: 'latest edit', attributes: { objectId: 'stable' } });
      expect(await session.flush()).toBe(true);
      expect(records.get(originalId)?.text).toBe(native);
      expect(staged.isCurrent()).toBe(false);
    } finally { release(); disposeNativeHostSlot(slot); session.stop(); history.replaceState(null, '', '#'); }
  });

  it('refuses stale target roots and captured target registration ABA without retiring the source', async () => {
    const source = { product: 'word' as const, id: () => 'source', beforeNavigate: async () => true };
    const close = registerProductDocumentHost(source), original = captureProductNavigation()!;
    let epoch = 0;
    const target = { product: 'slides' as const, id: () => 'target', identityEpoch: () => epoch, beforeNavigate: async () => true };
    const slot = createNativeHostSlot();
    const first = registerProductDocumentHost(target, slot), staleRoot = captureProductNavigation(slot)!;
    try {
      epoch++; epoch++;
      expect(promoteProductNavigation(original, staleRoot)).toBe(false);
      const old = captureProductNavigation(slot)!;
      const second = registerProductDocumentHost(target, slot), latest = captureProductNavigation(slot)!;
      first();
      expect(promoteProductNavigation(original, old)).toBe(false);
      expect(latest.isCurrent()).toBe(true);
      expect(productDocumentHost()).toBe(source);
      expect(await original.prepare()).toBe(true);
      disposeNativeHostSlot(slot);
      expect(promoteProductNavigation(original, latest)).toBe(false);
      expect(productDocumentHost()).toBe(source);
      expect(original.isCurrent()).toBe(true);
      second();
    } finally { first(); disposeNativeHostSlot(slot); close(); }
  });

  it('requires captured witnesses and never activates a foreign or already active target', () => {
    const close = registerProductDocumentHost({ product: 'note', id: () => 'source', beforeNavigate: async () => true });
    const source = captureProductNavigation()!, slot = createNativeHostSlot();
    registerProductDocumentHost({ product: 'word', id: () => 'target', beforeNavigate: async () => true }, slot);
    const staged = captureProductNavigation(slot)!;
    try {
      expect(promoteProductNavigation({ ...source }, staged)).toBe(false);
      expect(promoteProductNavigation(source, { ...staged })).toBe(false);
      expect(promoteProductNavigation(source, source)).toBe(false);
      expect(source.isCurrent()).toBe(true);
      const promoted = promoteProductNavigation(source, staged);
      expect(promoted && promoted.isCurrent()).toBe(true);
      expect(promoteProductNavigation(captureProductNavigation()!, staged)).toBe(false);
    } finally { disposeNativeHostSlot(slot); close(); }
  });

  it('keeps active slot readiness re-registration current and retires it on unrelated replacement', () => {
    const close = registerProductDocumentHost({ product: 'note', id: () => 'source', beforeNavigate: async () => true });
    const slot = createNativeHostSlot(), source = captureProductNavigation()!;
    const host = { product: 'word' as const, id: () => 'target', beforeNavigate: async () => true };
    const first = registerProductDocumentHost(host, slot);
    const staged = captureProductNavigation(slot)!;
    const promoted = promoteProductNavigation(source, staged);
    expect(promoted && promoted.isCurrent()).toBe(true);
    first();
    expect(isNativeHostSlotActive(slot)).toBe(true);
    const second = registerProductDocumentHost(host, slot), latest = captureProductNavigation(slot)!;
    expect(productDocumentHost()).toBe(host);
    expect(latest.isCurrent()).toBe(true);
    expect(staged.isCurrent()).toBe(false);
    const other = { product: 'slides' as const, id: () => 'other', beforeNavigate: async () => true };
    const removeOther = registerProductDocumentHost(other);
    try {
      expect(latest.isCurrent()).toBe(false);
      expect(isNativeHostSlotActive(slot)).toBe(false);
      expect(captureProductNavigation(slot)).toBeUndefined();
      expect(() => registerProductDocumentHost(host, slot)).toThrow('Retired native host slot');
      second(); disposeNativeHostSlot(slot); close();
      expect(productDocumentHost()).toBe(other);
      expect(captureProductNavigation()!.isCurrent()).toBe(true);
    } finally { first(); second(); disposeNativeHostSlot(slot); removeOther(); close(); }
  });

  it('preserves source open serialization while a staged host opens in its own scope', async () => {
    let release!: () => void, targetId = 'staged', sourceId = 'source';
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const close = registerProductDocumentHost({ product: 'word', id: () => sourceId, beforeNavigate: async () => true,
      requestOpen: async (id, owns) => { await waiting; if (!owns()) return false; sourceId = id; return captureProductNavigation()!; } });
    const source = captureProductNavigation()!, pending = source.open!('next');
    const slot = createNativeHostSlot();
    registerProductDocumentHost({ product: 'slides', id: () => targetId, beforeNavigate: async () => true,
      requestOpen: async (id, owns) => { if (!owns()) return false; targetId = id; return captureProductNavigation(slot)!; } }, slot);
    try {
      expect(await source.open!('duplicate')).toBe(false);
      const opened = await captureProductNavigation(slot)!.open!('prepared');
      expect(opened && opened.id).toBe('prepared');
      expect(productDocumentHost()?.id()).toBe('source');
      release(); const installed = await pending;
      expect(installed && installed.id).toBe('next');
      expect(installed && installed.isCurrent()).toBe(true);
    } finally { release(); disposeNativeHostSlot(slot); close(); }
  });

  it('returns only the captured promoted target when a public observer registers another host', () => {
    const close = registerProductDocumentHost({ product: 'note', id: () => 'source', beforeNavigate: async () => true });
    const source = captureProductNavigation()!, slot = createNativeHostSlot();
    registerProductDocumentHost({ product: 'word', id: () => 'target', beforeNavigate: async () => true }, slot);
    let otherClose = () => {};
    const replace = () => { otherClose = registerProductDocumentHost({ product: 'slides', id: () => 'unrelated', beforeNavigate: async () => true }); };
    window.addEventListener('wonffice:host-change', replace, { once: true });
    try {
      const installed = promoteProductNavigation(source, captureProductNavigation(slot)!);
      expect(installed && installed.id).toBe('target');
      expect(installed && installed.isCurrent()).toBe(false);
      expect(productDocumentHost()?.id()).toBe('unrelated');
      disposeNativeHostSlot(slot); expect(productDocumentHost()?.id()).toBe('unrelated');
    } finally { window.removeEventListener('wonffice:host-change', replace); otherClose(); disposeNativeHostSlot(slot); close(); }
  });

  it('publishes scoped cancellation once and refuses reuse after disposal', () => {
    const changed = vi.fn<[ProductNavigationGuard | undefined], void>();
    const slot = createNativeHostSlot(changed);
    const unregister = registerProductDocumentHost({ product: 'note', id: () => 'target', beforeNavigate: async () => true }, slot);
    const staged = captureProductNavigation(slot)!;
    disposeNativeHostSlot(slot); disposeNativeHostSlot(slot); unregister();
    expect(changed).toHaveBeenCalledTimes(2);
    expect(changed.mock.calls[1]).toEqual([undefined]);
    expect(staged.isCurrent()).toBe(false);
    expect(captureProductNavigation(slot)).toBeUndefined();
    expect(() => registerProductDocumentHost({ product: 'note', id: () => 'target', beforeNavigate: async () => true }, slot)).toThrow('Retired native host slot');
  });
});


describe('account exit preparation', () => {
  it('protects private input without executing ordinary save-on-navigation', async () => {
    const publish = vi.fn(async () => true), protect = vi.fn(async () => true);
    const detach = registerProductDocumentHost({ product: 'word', id: () => 'source', beforeNavigate: publish, beforeAccountExit: protect });
    try {
      expect(await prepareProductAccountExit()).toBe(true);
      expect(protect).toHaveBeenCalledTimes(1); expect(publish).not.toHaveBeenCalled();
      expect(await prepareProductNavigation()).toBe(true); expect(publish).toHaveBeenCalledTimes(1);
    } finally { detach(); }
  });
  it('blocks account exit when durable protection is unavailable without retrying a save', async () => {
    const publish = vi.fn(async () => true);
    const detach = registerProductDocumentHost({ product: 'slides', id: () => 'source', beforeNavigate: publish });
    try { expect(await prepareProductAccountExit()).toBe(false); expect(publish).not.toHaveBeenCalled(); }
    finally { detach(); }
  });
  it('refuses a retired account-exit owner after asynchronous protection', async () => {
    let release!: (value: boolean) => void;
    const detach = registerProductDocumentHost({ product: 'word', id: () => 'source', beforeNavigate: async () => true,
      beforeAccountExit: () => new Promise<boolean>(resolve => { release = resolve; }) });
    const pending = prepareProductAccountExit();
    const next = registerProductDocumentHost({ product: 'word', id: () => 'source', beforeNavigate: async () => true, beforeAccountExit: async () => true });
    try { release(true); expect(await pending).toBe(false); expect(await prepareProductAccountExit()).toBe(true); }
    finally { next(); detach(); }
  });
});
