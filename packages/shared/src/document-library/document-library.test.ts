import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentLibrary, freeLibraryName, LibraryRevisionConflict } from './document-library';

/**
 * **문서를 무엇이라 부를 것인가** — 라이브러리에서 이름은 링크가 붙잡는 것이다.
 *
 * 이름과 저장 완료 알림의 의미를 검사한다. IndexedDB 자체의 구현은 브라우저 검사가 맡는다.
 */
describe('쓰이지 않은 이름을 짓는다', () => {
  it('제목을 슬러그로 만든다', () => {
    expect(freeLibraryName([], 'One engine, two products', 'doc')).toBe('one-engine-two-products');
  });

  it('한글은 그대로 남는다 — 슬러그가 낱말을 지우면 안 된다', () => {
    expect(freeLibraryName([], '가격표', 'doc')).toBe('가격표');
  });

  /**
   * **넓혔고, 그것이 이 이동의 값 하나다.**
   *
   * `office-slides` 의 판은 `[^a-z0-9가-힣]` 이었다. 라틴과 한글만 남기므로 일본어나 중국어나
   * 키릴 문자로 된 제목은 **통째로 지워지고 `deck` 이 된다** — 그런 제목을 가진 독자에게는 모든
   * 문서가 `deck`, `deck-2`, `deck-3` 이다. 제품 하나의 결함으로 보였지만 제품의 것이 아니었다.
   */
  it('라틴과 한글만이 아니다 — 어느 문자든 낱말이면 남는다', () => {
    expect(freeLibraryName([], '発表資料', 'doc')).toBe('発表資料');
    expect(freeLibraryName([], 'Отчёт', 'doc')).toBe('отчёт');
  });

  it('앞뒤의 이음표를 뗀다', () => {
    expect(freeLibraryName([], '  ...초안...  ', 'doc')).toBe('초안');
  });

  it('제목이 없거나 낱말이 하나도 없으면 대신할 이름을 쓴다', () => {
    expect(freeLibraryName([], undefined, 'doc')).toBe('doc');
    expect(freeLibraryName([], '???', 'doc')).toBe('doc');
  });

  it('아주 긴 제목을 자른다', () => {
    expect(freeLibraryName([], 'a'.repeat(200), 'doc').length).toBeLessThanOrEqual(40);
  });

  it('쓰이고 있으면 숫자를 붙이고, 그 숫자도 쓰이면 넘어간다', () => {
    expect(freeLibraryName(['가격표'], '가격표', 'doc')).toBe('가격표-2');
    expect(freeLibraryName(['가격표', '가격표-2'], '가격표', 'doc')).toBe('가격표-3');
  });

  /**
   * 이름은 링크가 붙잡는 것이고, 링크는 *이름인가 주소인가* 를 슬래시·점·콜론으로 가린다
   * (`office-slides` 의 `isLibraryName`). 슬러그가 그 셋을 남기면 그 판정이 무너진다.
   */
  it('이름에는 구분자가 없다 — 주소와 구별되어야 한다', () => {
    const made = freeLibraryName([], 'a/b.c:d?e#f g', 'doc');
    expect(/[/.:?#\s]/.test(made)).toBe(false);
  });
});

describe('document storage completion', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  const storage = (current?: Record<string, unknown>) => {
    const request = { result: 'meeting', error: null as Error | null, onsuccess: undefined as (() => void) | undefined, onerror: undefined as (() => void) | undefined };
    const put = vi.fn(() => request);
    const read = { result: current, error: null, onsuccess: undefined as (() => void) | undefined, onerror: undefined as (() => void) | undefined };
    const get = vi.fn(() => { queueMicrotask(() => read.onsuccess?.()); return read; });
    const tx = {
      error: null as Error | null,
      objectStore: () => ({ put, get }),
      abort: () => tx.onabort?.(),
      oncomplete: undefined as (() => void) | undefined,
      onabort: undefined as (() => void) | undefined,
      onerror: undefined as (() => void) | undefined
    };
    const db = { transaction: () => tx, close: vi.fn() };
    const opened = { result: db, onsuccess: undefined as (() => void) | undefined };
    vi.stubGlobal('indexedDB', { open: () => {
      queueMicrotask(() => opened.onsuccess?.());
      return opened;
    } });
    return { request, read, tx, db, put, get, library: documentLibrary({ db: 'test', store: 'notes' }) };
  };

  it('rejects a synchronous cloning failure inside the compare-and-write callback', async () => {
    const { library, put, db } = storage();
    const error = new DOMException('Cannot clone metadata', 'DataCloneError');
    put.mockImplementationOnce(() => { throw error; });
    await expect(library.keep({ name: 'meeting' }, '{}', { expectedRevision: null })).rejects.toBe(error);
    expect(db.close).toHaveBeenCalled();
  });

  it('does not report saved until the transaction completes', async () => {
    const { request, tx, db, put, library } = storage();
    const saved = vi.fn();
    const pending = library.keep({ name: 'meeting' }, '{}').then(saved);
    await vi.waitFor(() => expect(put).toHaveBeenCalled());
    request.onsuccess?.();
    await new Promise((done) => setTimeout(done, 0));
    expect(saved).not.toHaveBeenCalled();
    tx.oncomplete?.();
    await pending;
    expect(saved).toHaveBeenCalledTimes(1);
    expect(db.close).toHaveBeenCalled();
  });

  it('keeps optional product metadata in the same completed write as document bytes', async () => {
    const { tx, put, library } = storage();
    const metadata = { version: 1, favorite: true, parentId: 'parent', trashedAt: null };
    const pending = library.keep({ name: 'meeting', title: '회의록', metadata }, '{"body":"intact"}');
    await vi.waitFor(() => expect(put).toHaveBeenCalled());
    expect(put).toHaveBeenCalledWith(expect.objectContaining({ name: 'meeting', metadata, text: '{"body":"intact"}' }));
    tx.oncomplete?.();
    expect(await pending).toMatchObject({ name: 'meeting', metadata });
  });

  it('rejects an abort even after the write request succeeded', async () => {
    const { request, tx, db, put, library } = storage();
    const failure = new Error('storage transaction aborted');
    const pending = library.keep({ name: 'meeting' }, '{}');
    const outcome = pending.then(() => 'saved', (error: unknown) => error);
    await vi.waitFor(() => expect(put).toHaveBeenCalled());
    request.onsuccess?.();
    tx.error = failure;
    tx.onabort?.();
    expect(await outcome).toBe(failure);
    expect(db.close).toHaveBeenCalled();
  });

  it('rejects a failed request and closes the connection', async () => {
    const { request, db, put, library } = storage();
    const failure = new Error('quota exceeded');
    const pending = library.keep({ name: 'meeting' }, '{}');
    const outcome = pending.catch((error: unknown) => error);
    await vi.waitFor(() => expect(put).toHaveBeenCalled());
    request.error = failure;
    request.onerror?.();
    expect(await outcome).toBe(failure);
    expect(db.close).toHaveBeenCalled();
  });
  it('checks an expected revision before writing and returns the completed next revision', async () => {
    const { tx, put, library } = storage({ name: 'meeting', text: 'before', savedAt: 1, revision: 7 });
    const pending = library.keep({ name: 'meeting' }, 'after', { expectedRevision: 7 });
    await vi.waitFor(() => expect(put).toHaveBeenCalled());
    expect(put).toHaveBeenCalledWith(expect.objectContaining({ text: 'after', revision: 8 }));
    tx.oncomplete?.(); expect((await pending).revision).toBe(8);
  });

  it('preserves the newest bytes on conflict and supplies their exact revision to recovery', async () => {
    const { put, db, library } = storage({ name: 'meeting', title: 'Latest', text: 'newest', savedAt: 2, revision: 9 });
    const error = await library.keep({ name: 'meeting' }, 'stale', { expectedRevision: 7 }).catch(error => error);
    expect(error).toBeInstanceOf(LibraryRevisionConflict);
    expect(error.latest).toMatchObject({ row: { revision: 9, title: 'Latest' }, text: 'newest' });
    expect(put).not.toHaveBeenCalled(); expect(db.close).toHaveBeenCalled();
  });

  it('distinguishes creation from legacy revision zero and detects deleted documents', async () => {
    const old = storage({ name: 'meeting', text: 'legacy', savedAt: 1 });
    await expect(old.library.keep({ name: 'meeting' }, 'replacement', { expectedRevision: null })).rejects.toBeInstanceOf(LibraryRevisionConflict);
    expect(old.put).not.toHaveBeenCalled();
    const saved = old.library.keep({ name: 'meeting' }, 'updated', { expectedRevision: 0 });
    await vi.waitFor(() => expect(old.put).toHaveBeenCalled()); old.tx.oncomplete?.();
    expect((await saved).revision).toBe(1);
    const deleted = storage();
    await expect(deleted.library.keep({ name: 'meeting' }, 'stale', { expectedRevision: 1 })).rejects.toBeInstanceOf(LibraryRevisionConflict);
    expect(deleted.put).not.toHaveBeenCalled();
  });

  it('keeps unconditional callers compatible while advancing their revision', async () => {
    const { library, put, tx } = storage({ name: 'meeting', text: 'before', savedAt: 1, revision: 4 });
    const pending = library.keep({ name: 'meeting' }, 'legacy caller');
    await vi.waitFor(() => expect(put).toHaveBeenCalled()); tx.oncomplete?.();
    expect((await pending).revision).toBe(5);
  });

  it('bulk saves resolve only after transaction completion, even after all puts succeed', async () => {
    const { library, put, tx } = storage();
    let resolved = false;
    const saving = library.keepMany([{ entry: { name: 'meeting' }, text: 'new', expectedRevision: null }]).then(rows => { resolved = true; return rows; });
    await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    await Promise.resolve(); expect(resolved).toBe(false);
    tx.oncomplete?.();
    expect(await saving).toEqual([expect.objectContaining({ name: 'meeting', revision: 1 })]);
  });

  it('bulk conflict issues no puts and reports the exact latest snapshot', async () => {
    const { library, put } = storage({ name: 'meeting', text: 'winner', savedAt: 1, revision: 2 });
    const error = await library.keepMany([{ entry: { name: 'meeting' }, text: 'stale', expectedRevision: 1 }]).catch(error => error);
    expect(error).toBeInstanceOf(LibraryRevisionConflict);
    expect(error.latest).toMatchObject({ text: 'winner', row: { revision: 2 } });
    expect(put).not.toHaveBeenCalled();
  });

});
