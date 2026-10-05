// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PageFrame } from '@barocss/office-site/ui';
import { createSampleSite, pagesOf } from '@barocss/office-site';
import { createSiteRuntime, type SiteRuntime } from '../src/runtime';
let runtime: SiteRuntime, root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('CSS', { escape: (text: string) => text });
});
afterEach(async () => { await act(async () => root?.unmount()); runtime?.dispose(); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('keeps each page board readonly across preview toggles and current authority changes', async () => {
  const host = document.createElement('div'), board = document.createElement('div'); document.body.append(host, board);
  runtime = createSiteRuntime(host, { initialDocument: createSampleSite(), editable: false }); root = createRoot(board);
  const page = pagesOf({ rootId: runtime.editor.getRootId()!, getNode: id => runtime.editor.dataStore.getNode(id) })[0];
  const render = (preview: boolean) => act(async () => root.render(createElement(PageFrame, {
    registry: runtime.registry, editor: runtime.editor, page: page.sid, breakpoint: 'desktop', width: 1024, label: 'Desktop', preview
  })));
  await render(false);
  const content = () => board.querySelector<HTMLElement>('[contenteditable]')!;
  expect(content().getAttribute('contenteditable')).toBe('false');
  await render(true); await render(false);
  expect(content().getAttribute('contenteditable')).toBe('false');
  const denied = new InputEvent('beforeinput', { inputType: 'insertText', data: 'blocked', cancelable: true, bubbles: true });
  content().dispatchEvent(denied); expect(denied.defaultPrevented).toBe(true);
  await act(async () => runtime.editor.setEditable(true));
  expect(content().getAttribute('contenteditable')).toBe('true');
  await act(async () => runtime.editor.setEditable(false));
  expect(content().getAttribute('contenteditable')).toBe('false');
});

for (const failure of ['composition', 'retired owner', 'failed delivery']) it(`retains actual page-frame input refusal for ${failure}`, async () => {
  const host = document.createElement('div'), board = document.createElement('div'); document.body.append(host, board);
  runtime = createSiteRuntime(host, { initialDocument: createSampleSite(), editable: true }); root = createRoot(board);
  const page = pagesOf({ rootId: runtime.editor.getRootId()!, getNode: id => runtime.editor.dataStore.getNode(id) })[0];
  let delivery!: (current?: () => boolean) => Promise<boolean>; let live!: SiteRuntime['view']; const unregister = vi.fn();
  const registerInputDelivery = (flush: typeof delivery, view: typeof live) => { delivery = flush; live = view; return unregister; };
  await act(async () => root.render(createElement(PageFrame, { registry: runtime.registry, editor: runtime.editor, page: page.sid, breakpoint: 'desktop', width: 1024, label: 'Desktop', registerInputDelivery })));
  expect(await delivery()).toBe(true);
  const run = [...board.querySelectorAll<HTMLElement>('[data-bc-sid]')].find(element => {
    const node = runtime.editor.dataStore.getNode(element.dataset.bcSid!); return node?.stype === 'inline-text' && !!node.text;
  })!;
  const text = document.createTreeWalker(run, NodeFilter.SHOW_TEXT).nextNode() as Text;
  const select = () => { const range = document.createRange(); range.setStart(text, text.length); range.collapse(true); window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range); runtime.editor.setRange({ type: 'range', startNodeId: run.dataset.bcSid!, endNodeId: run.dataset.bcSid!, startOffset: text.length, endOffset: text.length, collapsed: true }); };
  select(); const before = structuredClone({ native: runtime.exportNativeDocument(), history: runtime.editor.historyManager.getHistory() });
  if (failure === 'composition') live.contentEditableElement.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  if (failure === 'failed delivery') vi.spyOn(runtime.editor, 'executeCommand').mockImplementation(async () => false);
  live.contentEditableElement.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText', data: '!' }));
  text.data += '!'; select();
  expect(await delivery(() => failure !== 'retired owner')).toBe(false);
  expect({ native: runtime.exportNativeDocument(), history: runtime.editor.historyManager.getHistory() }).toEqual(before);
  expect(text.data.endsWith('!')).toBe(true);
  await act(async () => root.unmount());
  expect(unregister).not.toHaveBeenCalled(); expect(await delivery()).toBe(false);
});
it('renews a clean same-identity frame owner after real document replacement and recovers composition', async () => {
  const host = document.createElement('div'), board = document.createElement('div'); document.body.append(host, board);
  runtime = createSiteRuntime(host, { initialDocument: createSampleSite(), editable: true }); root = createRoot(board);
  const page = pagesOf({ rootId: runtime.editor.getRootId()!, getNode: id => runtime.editor.dataStore.getNode(id) })[0];
  const deliveries = new Map<(current?: () => boolean) => Promise<boolean>, SiteRuntime['view']>();
  const registerInputDelivery = (flush: (current?: () => boolean) => Promise<boolean>, view: SiteRuntime['view']) => { deliveries.set(flush, view); return () => { deliveries.delete(flush); }; };
  await act(async () => root.render(createElement(PageFrame, { registry: runtime.registry, editor: runtime.editor, page: page.sid, breakpoint: 'desktop', width: 1024, label: 'Desktop', registerInputDelivery })));
  const initial = [...deliveries.keys()][0]; expect(await initial()).toBe(true);
  await act(async () => runtime.editor.loadDocument(runtime.editor.exportDocument()));
  expect(deliveries.size).toBe(1); const next = [...deliveries.keys()][0]; expect(next).not.toBe(initial);
  expect(await initial()).toBe(false); const before = structuredClone({ native: runtime.exportNativeDocument(), history: runtime.editor.historyManager.getHistory() });
  const view = deliveries.get(next)!;
  view.contentEditableElement.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); expect(await next()).toBe(false);
  view.contentEditableElement.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
  // The real view completes its generation-owned composition-end task before it admits delivery.
  await vi.waitFor(async () => { expect(await next()).toBe(true); });
  expect({ native: runtime.exportNativeDocument(), history: runtime.editor.historyManager.getHistory() }).toEqual(before);
});
