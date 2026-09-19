// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DocumentSession, type DocumentSessionOptions } from './document-session';

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
    expect(one.notify).toHaveBeenLastCalledWith('저장됨');
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
    expect(one.notify).toHaveBeenLastCalledWith('저장 실패');
    expect(await one.session.flush()).toBe(true);
    expect(one.records.get(one.session.id)?.text).toBe('preserve');
  });
  it('settles input that does not change the document instead of staying saving', async () => {
    const one = await start(); const writes = one.store.keep.mock.calls.length;
    one.session.input(); await one.session.flush();
    expect(one.store.keep).toHaveBeenCalledTimes(writes);
    expect(one.notify).toHaveBeenLastCalledWith('저장됨');
  });
});
