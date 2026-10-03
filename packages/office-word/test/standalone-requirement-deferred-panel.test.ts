import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { BusinessPairPanel } from '../../../apps/word/src/business-pair-panel';
import { mountWordRuntime } from '../../../apps/word/src/runtime';
import { createStarterDocument } from '../src/starter-document';
import { wordFileText } from '../src/word-file';

async function fixture() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const source = createStarterDocument();
  const surface = source.content!.find(node => typeof node === 'object' && node.stype === 'surface');
  if (!surface || typeof surface !== 'object') throw Error('Missing native surface');
  surface.content = [
    { stype: 'paragraph', attributes: { styleId: 'Body' }, content: [{ stype: 'inline-text', text: 'Keep the authored requirement.', marks: [{ stype: 'bold', range: [0, 4] }] }] },
    { stype: 'paragraph', attributes: { styleId: 'Body' }, content: [{ stype: 'inline-text', text: 'Choose the native decision.' }] }
  ];
  const renderView = vi.spyOn(EditorViewDOM.prototype, 'render').mockImplementation(() => {});
  const host = document.createElement('div'), container = document.createElement('div');
  document.body.append(host, container);
  const runtime = mountWordRuntime(host, { initialDocument: source, editable: true });
  const root = createRoot(container);
  const render = async (readOnly = false) => { await act(async () => root.render(createElement(BusinessPairPanel, { runtime, readOnly }))); };
  const button = (label: string) => {
    const found = [...container.querySelectorAll('button')].find(element => element.textContent === label);
    if (!found) throw Error(`Missing button: ${label}`);
    return found;
  };
  const click = async (label: string, completeText: string) => {
    await act(async () => { button(label).click(); });
    await vi.waitFor(async () => {
      await act(async () => { await Promise.resolve(); });
      expect(container.textContent).toContain(completeText);
    });
  };
  const selectParagraph = async (text: string) => {
    const run = runtime.editor.dataStore.getAllNodes().find(node => node.text === text)!;
    expect(run).toBeDefined();
    await act(async () => runtime.editor.updateSelection({ type: 'range', startNodeId: run.sid!, endNodeId: run.sid!, startOffset: 0, endOffset: 0, collapsed: true }));
  };
  await render();
  return { runtime, container, render, button, click, selectParagraph,
    native: () => wordFileText(runtime.exportNativeDocument(), ''),
    async dispose() { await act(async () => root.unmount()); runtime.dispose(); host.remove(); container.remove(); renderView.mockRestore(); vi.unstubAllGlobals(); }
  };
}

it.each([
  ['record', 'permission-aba'], ['record', 'selection-aba'], ['record', 'root-replacement'],
  ['link', 'permission-aba'], ['link', 'selection-aba'], ['link', 'root-replacement']
] as const)('refuses clicked %s after %s while the deepest native flush awaits', async (operation, mutation) => {
  const f = await fixture();
  let release: (() => void) | undefined;
  let restoreFlush: (() => void) | undefined;
  try {
    await f.selectParagraph('Keep the authored requirement.');
    await f.click('요구사항 문단 지정', '요구사항 지정됨');
    if (operation === 'link') {
      await f.click('요구사항 기록', '결정 미연결');
      await f.selectParagraph('Choose the native decision.');
      await f.click('연결할 결정 문단 지정', '결정 지정됨');
      await act(async () => {
        const select = f.container.querySelector('select')!;
        select.value = '1'; select.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
    const initial = f.native(), initialHistory = f.runtime.editor.historyManager.getHistory().length;
    const originalSelection = structuredClone(f.runtime.editor.selection);
    const flush = f.runtime.flushCommands.bind(f.runtime);
    let entered!: () => void;
    const paused = new Promise<void>(resolve => { entered = resolve; });
    const resume = new Promise<void>(resolve => { release = resolve; });
    const spy = vi.spyOn(f.runtime, 'flushCommands').mockImplementation(async () => {
      // The actual native lock and entered commands finish before the external pause.
      await flush(); entered(); await resume;
    });
    restoreFlush = () => spy.mockRestore();
    await act(async () => { f.button(operation === 'record' ? '요구사항 기록' : '결정 연결').click(); await paused; });
    expect(f.native()).toBe(initial);
    expect(f.runtime.editor.historyManager.getHistory()).toHaveLength(initialHistory);
    if (mutation === 'permission-aba') { await f.render(true); await f.render(false); }
    if (mutation === 'selection-aba') {
      await act(async () => { f.runtime.editor.updateSelection(null); f.runtime.editor.updateSelection(originalSelection); });
    }
    if (mutation === 'root-replacement') {
      await act(async () => f.runtime.loadNativeDocument(f.runtime.exportNativeDocument()));
    }
    const beforeRelease = f.native(), beforeHistory = f.runtime.editor.historyManager.getHistory().length;
    await act(async () => { release!(); });
    await vi.waitFor(async () => {
      await act(async () => { await Promise.resolve(); });
      expect(f.container.querySelector('[role="alert"]')?.textContent).toContain('문서 또는 권한이 변경');
    });
    expect(f.native()).toBe(beforeRelease);
    expect(f.runtime.editor.historyManager.getHistory()).toHaveLength(beforeHistory);
    if (mutation !== 'root-replacement') {
      expect(f.native()).toBe(initial);
      expect(f.runtime.editor.historyManager.getHistory()).toHaveLength(initialHistory);
      expect(f.container.textContent).toContain(operation === 'record' ? '요구사항 지정됨' : '결정 지정됨');
      if (operation === 'link') expect(f.container.querySelector('select')!.value).toBe('1');
      expect(f.button(operation === 'record' ? '요구사항 기록' : '결정 연결').disabled).toBe(false);
    }
  } finally { release?.(); restoreFlush?.(); await f.dispose(); }
});
