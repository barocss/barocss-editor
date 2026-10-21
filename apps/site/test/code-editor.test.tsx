// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { insertNewlineAndIndent } from '@codemirror/commands';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeEditor, type CodeEdit } from '../src/code-editor';

const edit: CodeEdit = {
  sid: 'block', runSid: 'run', code: 'const first = 1;', language: 'js',
  box: { left: 0, top: 0, width: 400, height: 200 }
};
let root: Root;
let container: HTMLDivElement;
let props: ComponentProps<typeof CodeEditor>;
let flushes: Set<() => Promise<void>>;
let onCommit: ReturnType<typeof vi.fn<(code: string) => void | Promise<void>>>;
let onClose: ReturnType<typeof vi.fn<() => void>>;
let onPendingChange: ReturnType<typeof vi.fn<(pending: boolean) => void>>;
const view = () => EditorView.findFromDOM(container.querySelector('.cm-editor')!)!;
const flush = () => [...flushes][0]();
const pending = () => onPendingChange.mock.lastCall?.[0];
const deferred = () => {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
async function render(next: Partial<ComponentProps<typeof CodeEditor>> = {}) {
  props = { ...props, ...next };
  await act(async () => root.render(createElement(CodeEditor, props)));
}
async function draft(code = 'const edited = 2;') {
  await act(async () => view().dispatch({
    changes: { from: 0, to: view().state.doc.length, insert: code },
    userEvent: 'input.type'
  }));
}
async function escape() {
  await act(async () => view().contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, 400, 200));
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() => [new DOMRect(0, 0, 400, 200)] as unknown as DOMRectList);
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect(0, 0, 10, 20) });
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  flushes = new Set();
  onCommit = vi.fn();
  onClose = vi.fn();
  onPendingChange = vi.fn();
  props = {
    edit, onCommit, onClose, onPendingChange,
    registerFlush: callback => { flushes.add(callback); return () => { flushes.delete(callback); }; }
  };
  await render();
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Site code draft lifecycle', () => {
  it('passes a live command owner that retires during an awaited target replacement', async () => {
    const entered = deferred(), release = deferred();
    const accepted: string[] = [];
    let owns: (() => boolean) | undefined;
    await render({ onCommit: async (code: string, current?: () => boolean) => {
      owns = current; entered.resolve(); await release.promise;
      if (current?.()) accepted.push(code);
    } });
    await draft();
    let operation!: Promise<void>;
    await act(async () => { operation = flush(); await entered.promise; });
    expect(owns).toBeTypeOf('function'); expect(owns!()).toBe(true);
    const rejected = expect(operation).rejects.toThrow('편집 권한 또는 문서가 변경');
    await render({ edit: { ...edit, sid: 'target', runSid: 'target-run', code: 'exact target buffer' } });
    expect(owns!()).toBe(false);
    await act(async () => { release.resolve(); await rejected; });
    expect(accepted).toEqual([]); expect(view().state.doc.toString()).toBe('exact target buffer');
    expect(onClose).not.toHaveBeenCalled(); expect(pending()).toBe(false);
  });
  it('registers a clean editor without writing the document and closes cleanly', async () => {
    expect(flushes.size).toBe(1);
    expect(view().state.doc.toString()).toBe(edit.code);
    expect(pending()).toBe(false);
    await act(async () => flush());
    expect(onCommit).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    await escape();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('awaits one whole-buffer commit, retains pending during the wait, and advances the accepted baseline', async () => {
    const commit = deferred();
    onCommit.mockReturnValue(commit.promise);
    await draft();
    expect(pending()).toBe(true);
    let save!: Promise<void>;
    let repeated!: Promise<void>;
    await act(async () => { save = flush(); repeated = flush(); });
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('const edited = 2;', expect.any(Function));
    expect(pending()).toBe(true);
    expect(view().state.facet(EditorState.readOnly)).toBe(true);
    expect(view().contentDOM.getAttribute('contenteditable')).toBe('false');
    await act(async () => { commit.resolve(); await Promise.all([save, repeated]); });
    expect(pending()).toBe(false);
    expect(view().state.facet(EditorState.readOnly)).toBe(false);
    await act(async () => flush());
    await escape();
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('propagates async rejection, preserves the real buffer across parent refreshes, and permits retry', async () => {
    const failure = new Error('Server refused this document generation');
    onCommit.mockRejectedValue(failure);
    await draft();
    await render({ edit: { ...edit, code: 'parent refresh' } });
    expect(view().state.doc.toString()).toBe('const edited = 2;');
    await act(async () => { await expect(flush()).rejects.toBe(failure); });
    expect(pending()).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(failure.message);
    await escape();
    expect(onClose).not.toHaveBeenCalled();
    expect(view().state.doc.toString()).toBe('const edited = 2;');
    onCommit.mockResolvedValue(undefined);
    await escape();
    expect(onClose).toHaveBeenCalledOnce();
    expect(pending()).toBe(false);
  });

  it('awaits Escape commit and does not close or commit twice while it is pending', async () => {
    const commit = deferred();
    onCommit.mockReturnValue(commit.promise);
    await draft();
    await escape();
    await escape();
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => commit.resolve());
    expect(onClose).toHaveBeenCalledOnce();
    expect(pending()).toBe(false);
  });

  it('makes the existing view read-only when authority changes and keeps the draft for retry', async () => {
    await draft();
    const originalView = view();
    await render({ editable: false });
    expect(view()).toBe(originalView);
    expect(view().state.facet(EditorState.readOnly)).toBe(true);
    expect(view().contentDOM.getAttribute('contenteditable')).toBe('false');
    expect(insertNewlineAndIndent(view())).toBe(false);
    await act(async () => { await expect(flush()).rejects.toThrow('읽기 전용'); });
    await escape();
    expect(onClose).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
    expect(pending()).toBe(true);
    expect(view().state.doc.toString()).toBe('const edited = 2;');
    await render({ editable: true });
    await act(async () => flush());
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('const edited = 2;', expect.any(Function));
    expect(pending()).toBe(false);
  });

  it('rejects an in-flight completion after authority is revoked and restored', async () => {
    const commit = deferred();
    onCommit.mockReturnValue(commit.promise);
    await draft();
    let result!: Promise<void>;
    await act(async () => { result = flush(); });
    const rejected = expect(result).rejects.toThrow('편집 권한 또는 문서가 변경');
    await render({ editable: false });
    await render({ editable: true });
    await act(async () => { commit.resolve(); await rejected; });
    expect(pending()).toBe(true);
    expect(view().state.doc.toString()).toBe('const edited = 2;');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('protects active composition and its final delayed input before taking a snapshot', async () => {
    vi.useFakeTimers();
    await act(async () => view().contentDOM.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
    expect(pending()).toBe(true);
    await act(async () => { await expect(flush()).rejects.toThrow('문자 입력을 마친 후'); });
    await escape();
    expect(onClose).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
    await act(async () => view().contentDOM.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
    await act(async () => { await expect(flush()).rejects.toThrow('문자 입력을 마친 후'); });
    expect(pending()).toBe(true);
    await draft('const 이름 = 2;');
    await act(async () => vi.advanceTimersByTimeAsync(50));
    expect(pending()).toBe(true);
    await act(async () => flush());
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('const 이름 = 2;', expect.any(Function));
    expect(pending()).toBe(false);
  });

  it('unregisters on retirement and refuses a retained callback without writing a later owner', async () => {
    await draft();
    const retiredFlush = [...flushes][0];
    await render({ edit: { ...edit, sid: 'another-block', runSid: 'another-run', code: 'next' } });
    expect(flushes.size).toBe(1);
    await act(async () => { await expect(retiredFlush()).rejects.toThrow('편집창이 변경'); });
    expect(view().state.doc.toString()).toBe('next');
    expect(onCommit).not.toHaveBeenCalled();
    expect(pending()).toBe(false);
  });

  it('can flush and close a clean read-only view without a document mutation', async () => {
    await render({ editable: false });
    expect(view().state.facet(EditorState.readOnly)).toBe(true);
    await act(async () => flush());
    await escape();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onCommit).not.toHaveBeenCalled();
  });
});
