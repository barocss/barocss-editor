// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { LibraryRevisionConflict } from '../document-library/document-library';
import { DocumentSession, type DocumentSessionOptions } from './document-session';
import { registerDocumentLocation } from './document-location';

function setup() {
  const records = new Map<string, { row: any; text: string }>();
  const store = {
    keep: vi.fn(async (row: any, text: string) => {
      const saved = { ...row, revision: (records.get(row.name)?.row.revision ?? 0) + 1, savedAt: Date.now() };
      records.set(row.name, { row: saved, text }); return saved;
    }),
    read: vi.fn(async (id: string) => records.get(id)),
    rows: vi.fn(async () => [...records.values()].map(value => value.row))
  };
  let content = 'initial';
  let changed: (replaced?: boolean) => void = () => {};
  const options: DocumentSessionOptions = {
    key: 'test', documents: store as never, drafts: store as never,
    snapshot: () => ({ text: content, title: content, count: 1 }),
    replace: text => { content = text; changed(true); },
    subscribe: listener => { changed = listener; return () => { changed = () => {}; }; }
  };
  const notify = vi.fn();
  const session = new DocumentSession(options, notify);
  return { session, options, records, store, notify, content: () => content,
    edit: (text: string, replaced = false) => { content = text; changed(replaced); } };
}

describe('local document session', () => {
  const running: DocumentSession[] = [];
  beforeEach(() => {
    vi.useFakeTimers(); vi.stubGlobal('crypto', { randomUUID });
    history.replaceState(null, '', '#');
  });
  afterEach(() => { running.splice(0).forEach(session => session.stop()); vi.useRealTimers(); vi.unstubAllGlobals(); });
  const start = async () => { const one = setup(); running.push(one.session); await one.session.start(); await one.session.flush(); return one; };

  it('reports an invalid host address without subscribing, saving a sample or replacing its route', async () => {
    const one = setup(); running.push(one.session);
    const subscription = vi.spyOn(one.options, 'subscribe');
    const remove = registerDocumentLocation({ product: 'test', workspaceId: 'w', readId: () => undefined, url: () => '/w/sample' });
    const originalURL = location.href;
    try {
      await one.session.start();
      expect(one.notify).toHaveBeenLastCalledWith('restore-error');
      expect(subscription).not.toHaveBeenCalled(); expect(one.store.keep).not.toHaveBeenCalled();
      expect(one.content()).toBe('initial'); expect(location.href).toBe(originalURL);
    } finally { remove(); }
  });

  it('does not install a delayed initial original after its validated address retires', async () => {
    const one = setup(); running.push(one.session);
    let current = true, finish!: (value: any) => void;
    const remove = registerDocumentLocation({ product: 'test', workspaceId: '', readId: () => 'original',
      url: id => `/w/${id}`, isCurrent: () => current });
    one.store.read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    try {
      const opening = one.session.start();
      await vi.waitFor(() => expect(one.store.read).toHaveBeenCalledWith('original'));
      current = false; history.replaceState(null, '', '/w/different');
      finish({ row: { name: 'original', revision: 1 }, text: 'original saved content' });
      await opening;
      expect(one.content()).toBe('initial'); expect(one.store.keep).not.toHaveBeenCalled();
      expect(one.session.id).not.toBe('original');
      expect(one.notify).toHaveBeenLastCalledWith('restore-error');
      expect(location.pathname).toBe('/w/different');
    } finally { remove(); }
  });

  it('reports loading/saved through the single status-code callback without altering saved native bytes', async () => {
    const one = setup(); running.push(one.session); await one.session.start();
    expect(one.notify).toHaveBeenLastCalledWith('saving');
    expect(await one.session.flush()).toBe(true);
    expect(one.notify).toHaveBeenLastCalledWith('saved');
    const original = one.session.id, saved = structuredClone(one.records.get(original));
    one.records.set('other', { row: { name: 'other', revision: 1 }, text: 'other native bytes' });
    expect(await one.session.open('other')).toBe(true);
    expect(one.notify.mock.calls.map(([code]) => code)).toContain('loading');
    expect(one.notify).toHaveBeenLastCalledWith('saved');
    expect(one.records.get(original)).toEqual(saved);
    expect(one.records.get('other')).toEqual({ row: { name: 'other', revision: 1 }, text: 'other native bytes' });
    expect(one.session.id).toBe('other'); expect(one.content()).toBe('other native bytes');
  });
  it('keeps stable file identities and saves the source before opening another', async () => {
    const one = await start(); const original = one.session.id;
    one.edit('edited'); await one.session.flush();
    one.edit('new document', true); await one.session.flush();
    expect(one.session.id).not.toBe(original);
    expect(await one.session.open(original)).toBe(true);
    expect(one.content()).toBe('edited');
    expect(one.session.id).toBe(original);
    expect(one.records.size).toBe(2);
  });
  it('flushes child input before capturing a snapshot', async () => {
    const one = await start();
    one.options.beforeSnapshot = async () => { one.edit('last child input'); };
    one.session.input(); await one.session.flush();
    expect(one.records.get(one.session.id)?.text).toBe('last child input');
    expect(one.notify).toHaveBeenLastCalledWith('saved');
  });
  it('does not navigate over an edit made while storage is reading', async () => {
    const one = await start(); const original = one.session.id;
    one.edit('second', true); await one.session.flush();
    let release!: (value: any) => void;
    one.store.read.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const opening = one.session.open(original);
    await vi.waitFor(() => expect(one.store.read).toHaveBeenCalled());
    one.edit('keep this new edit');
    release(one.records.get(original));
    expect(await opening).toBe(false);
    expect(one.content()).toBe('keep this new edit');
    expect(one.session.id).not.toBe(original);
  });
  it('retains a failed write and refuses replacement until retry succeeds', async () => {
    const one = await start();
    one.store.keep.mockRejectedValueOnce(new Error('full'));
    one.edit('preserve');
    expect(await one.session.beforeReplace()).toBe(false);
    expect(one.notify).toHaveBeenLastCalledWith('save-error');
    expect(await one.session.flush()).toBe(true);
    expect(one.records.get(one.session.id)?.text).toBe('preserve');
  });
  it('settles input that does not change the document instead of staying saving', async () => {
    const one = await start(); const writes = one.store.keep.mock.calls.length;
    one.session.input(); await one.session.flush();
    expect(one.store.keep).toHaveBeenCalledTimes(writes);
    expect(one.notify).toHaveBeenLastCalledWith('saved');
  });
  it('never writes a partially replaced B model under B after A fails', async () => {
    const one = await start();
    const b = one.session.id;
    const revision = one.records.get(b)?.row.revision;
    one.records.set('a', { row: { name: 'a', revision: 1 }, text: 'A saved' });
    one.options.replace = () => { one.edit('B partly replaced'); throw new Error('load failed'); };

    await expect(one.session.open('a')).rejects.toThrow('load failed');
    expect(one.session.id).toBe(b);
    expect(one.session.recoveryRequired).toBe(true);
    expect(one.notify).toHaveBeenLastCalledWith('recovery-required');
    await expect(one.session.open('a')).rejects.toThrow('Reopen the current saved document');
    one.edit('B edited after failure');
    expect(await one.session.flush()).toBe(false);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    one.session.stop();
    await Promise.resolve();
    expect(one.records.get(b)?.text).toBe('initial');
    expect(one.records.get(b)?.row.revision).toBe(revision);
  });
  it('keeps B and allows A retry after a read failure before replacement', async () => {
    const one = await start(); const b = one.session.id;
    one.records.set('a', { row: { name: 'a', revision: 1 }, text: 'A saved' });
    one.store.read.mockRejectedValueOnce(new Error('read failed'));
    await expect(one.session.open('a', true)).rejects.toThrow('read failed');
    expect(one.session.recoveryRequired).toBe(false);
    expect(one.session.id).toBe(b);
    expect(one.content()).toBe('initial');
    expect(one.notify).toHaveBeenLastCalledWith('saved');
    expect(await one.session.open('a', true)).toBe(true);
    expect(one.session.id).toBe('a');
    expect(one.content()).toBe('A saved');
  });
  it('reopens B from its saved copy before allowing another document', async () => {
    const one = await start(); const b = one.session.id;
    one.records.set('a', { row: { name: 'a', revision: 1 }, text: 'A saved' });
    const replace = one.options.replace;
    one.options.replace = () => { one.edit('partial A'); throw new Error('load failed'); };
    await expect(one.session.open('a')).rejects.toThrow('load failed');
    one.options.replace = replace;
    expect(await one.session.open(b)).toBe(true);
    expect(one.content()).toBe('initial');
    expect(one.session.recoveryRequired).toBe(false);
    expect(await one.session.open('a')).toBe(true);
    expect(one.content()).toBe('A saved');
  });
  it('reopens the saved current document after a missing startup document and failed replacement', async () => {
    history.replaceState(null, '', '#test=missing');
    const one = setup(); running.push(one.session);
    await one.session.start();
    expect(one.notify).toHaveBeenLastCalledWith('restore-error');

    one.edit('B saved after startup failure');
    const b = one.session.id;
    expect(await one.session.flush()).toBe(true);
    expect(one.records.get(b)?.text).toBe('B saved after startup failure');
    one.records.set('a', { row: { name: 'a', revision: 1 }, text: 'A saved' });
    const replace = one.options.replace;
    one.options.replace = () => { one.edit('partial A'); throw new Error('load failed'); };
    await expect(one.session.open('a')).rejects.toThrow('load failed');
    expect(one.session.recoveryRequired).toBe(true);
    one.options.replace = replace;
    expect(await one.session.open(b)).toBe(true);
    expect(one.content()).toBe('B saved after startup failure');
    expect(one.session.recoveryRequired).toBe(false);
  });
  it('reports stable conflict codes while preserving the original and exactly one recovery draft', async () => {
    const one = await start(), original = one.session.id;
    const saved = structuredClone(one.records.get(original));
    one.store.keep.mockRejectedValueOnce(new LibraryRevisionConflict(saved!.row.revision, saved));
    one.edit('keep this conflicting draft');
    expect(await one.session.flush()).toBe(true);
    expect(one.notify).toHaveBeenLastCalledWith('conflict');
    expect(one.records.get(original)).toEqual(saved);
    const drafts = [...one.records.entries()].filter(([name]) => name !== original);
    expect(drafts).toHaveLength(1); expect(drafts[0][1].text).toBe('keep this conflicting draft');
    expect(drafts[0][1].row.metadata.originalId).toBe(original);
    const writes = one.store.keep.mock.calls.length;
    one.session.input(); expect(one.notify).toHaveBeenLastCalledWith('saving');
    expect(await one.session.flush()).toBe(true);
    expect(one.notify).toHaveBeenLastCalledWith('conflict');
    expect(one.store.keep).toHaveBeenCalledTimes(writes);
    expect(one.records.size).toBe(2);
  });
  it('retries the original startup target when no current document was saved', async () => {
    history.replaceState(null, '', '#test=startup');
    const one = setup(); running.push(one.session);
    one.records.set('startup', { row: { name: 'startup', revision: 1 }, text: 'saved startup' });
    const replace = one.options.replace;
    one.options.replace = () => { one.edit('partial startup'); throw new Error('load failed'); };
    await one.session.start();
    expect(one.session.recoveryRequired).toBe(true);
    one.options.replace = replace;
    expect(await one.session.open('startup')).toBe(true);
    expect(one.content()).toBe('saved startup');
    expect(one.session.recoveryRequired).toBe(false);
  });
});
