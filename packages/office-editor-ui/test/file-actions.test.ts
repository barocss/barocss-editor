// @vitest-environment jsdom
import { act, createElement, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileActions, type DocumentFileActions, type FileActionsProps } from '../src/file-actions';
let root: Root | undefined;
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });
async function mount(beforeSave?: () => boolean | void | Promise<boolean | void>, options: Pick<FileActionsProps, 'confirmReplace' | 'beforeReplace'> = {}) {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const ref = createRef<DocumentFileActions>();
  const snapshot = vi.fn(() => ({ content: ['latest'] }));
  const serialize = vi.fn(() => '{}');
  const load = vi.fn();
  const read = vi.fn(() => ({ document: {}, version: 1 }));
  const editor = { exportDocument: snapshot, loadDocument: load, canUndo: () => false, getRootId: () => 'current' };
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  await act(async () => root!.render(createElement(FileActions, { ref, editor: editor as never, beforeSave, ...options,
    kind: { session: 'test', text: serialize, read, fileName: () => 'test.json', starter: () => ({}) }
  })));
  return { ref, snapshot, serialize, click, load, read, editor };
}
describe('file snapshot preparation', () => {
  it('treats declined product confirmation as cancellation before persistence', async () => {
    const confirmReplace = vi.fn(() => false), beforeReplace = vi.fn(async () => true);
    const { ref, load } = await mount(undefined, { confirmReplace, beforeReplace });
    await act(async () => { await ref.current!.create(); });
    expect(confirmReplace).toHaveBeenCalledTimes(1);
    expect(beforeReplace).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.body.textContent).toContain('취소됨');
  });
  it('runs persistence only after confirmation and keeps the document when saving fails', async () => {
    const order: string[] = [];
    const { ref, load } = await mount(undefined, {
      confirmReplace: () => { order.push('confirm'); return true; },
      beforeReplace: async () => { order.push('save'); return false; },
    });
    await act(async () => { await ref.current!.create(); });
    expect(order).toEqual(['confirm', 'save']);
    expect(load).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('현재 자료를 저장하지 못했습니다');
  });
  it('does not repeat a product confirmation when no persistence hook is supplied', async () => {
    const confirmReplace = vi.fn(() => true);
    const confirm = vi.spyOn(window, 'confirm');
    const { ref, load, editor } = await mount(undefined, { confirmReplace });
    editor.canUndo = () => true;
    await act(async () => { await ref.current!.create(); });
    expect(confirmReplace).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('awaits child delivery before taking the snapshot', async () => {
    let release!: () => void;
    const prepared = new Promise<void>(resolve => { release = resolve; });
    const { ref, snapshot, click } = await mount(() => prepared);
    let saving: unknown;
    await act(async () => { saving = ref.current!.save(); });
    expect(snapshot).not.toHaveBeenCalled(); expect(click).not.toHaveBeenCalled();
    expect(document.querySelector('.office-task-status')?.getAttribute('data-phase')).toBe('running');
    expect(document.querySelector('progress')).toBeNull();
    await act(async () => { await ref.current!.save(); await ref.current!.create(); });
    await act(async () => { release(); await saving; });
    expect(snapshot).toHaveBeenCalledTimes(1); expect(click).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain('다운로드 요청됨');
  });
  it.each([false, new Error('본문을 반영하지 못했습니다')])('does not download on a refused or failed preparation: %s', async result => {
    const { ref, snapshot, click } = await mount(async () => { if (result instanceof Error) throw result; return result; });
    await act(async () => { await ref.current!.save(); });
    expect(snapshot).not.toHaveBeenCalled(); expect(click).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('반영하지 못했습니다');
  });
  it('keeps hosts without a hook working', async () => {
    const { ref, snapshot, click } = await mount();
    await act(async () => { await ref.current!.save(); });
    expect(snapshot).toHaveBeenCalledTimes(1); expect(click).toHaveBeenCalledTimes(1);
  });
  it('reports serialization failures and retries only on request', async () => {
    const { ref, serialize, click } = await mount();
    serialize.mockImplementationOnce(() => { throw new Error('파일 변환 실패'); });
    await act(async () => { await ref.current!.save(); });
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('파일 변환 실패');
    expect(click).not.toHaveBeenCalled();
    await act(async () => { Array.from(document.querySelectorAll('button')).find(button => button.textContent === '다시 시도')!.click(); });
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });
  it('catches file read failures without replacing the document', async () => {
    const { load } = await mount();
    const input = document.querySelector('input')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [{ name: 'broken.json', text: () => Promise.reject(new Error('파일 읽기 실패')) }] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(load).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('파일 읽기 실패');
    expect(document.body.textContent).toContain('다른 파일 선택');
  });
  it('does not replace another document after an asynchronous file read', async () => {
    const { load, editor } = await mount();
    let finish!: (text: string) => void;
    const input = document.querySelector('input')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [{ name: 'old.json', text: () => new Promise<string>(resolve => { finish = resolve; }) }] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    editor.getRootId = () => 'other';
    await act(async () => { finish('{}'); });
    expect(load).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('문서가 변경되었습니다');
  });
});
