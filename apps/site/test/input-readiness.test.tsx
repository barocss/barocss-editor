// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { getGlobalRegistry } from '@barocss/dsl';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { OfficeLocaleProvider } from '@barocss/office-ui';
import { WORD_ENV_KEY, createTextEnv } from '@barocss/office-text';
import { createSampleSite, createSiteEditor, getSiteSchemaDefinition, registerSiteRenderers, type siteSessionOptions } from '@barocss/office-site';
import { App } from '../src/app';

// Observe the real mounted App callback. All factory options and delivery remain real.
const captured = vi.hoisted(() => ({ beforeSnapshot: undefined as (() => Promise<void>) | undefined }));
vi.mock('@barocss/office-site', async importOriginal => {
  const actual = await importOriginal<typeof import('@barocss/office-site')>();
  return { ...actual, siteSessionOptions: (...args: Parameters<typeof siteSessionOptions>) => {
    captured.beforeSnapshot = args[1];
    return actual.siteSessionOptions(...args);
  } };
});

let root: Root | undefined;
let editor: ReturnType<typeof createSiteEditor>;
let view: EditorViewDOM;
const state = () => ({ original: editor.exportDocument(), selection: editor.selection, history: editor.getHistoryStats(), epoch: editor.dataStore.getDocumentEpoch() });

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  captured.beforeSnapshot = undefined;
  registerSiteRenderers();
  const schema = createSchema('site', getSiteSchemaDefinition());
  const store = new DataStore(undefined, schema);
  editor = createSiteEditor({ editable: true, schema, dataStore: store });
  editor.loadDocument(createSampleSite(), 'site');
  const mount = (container: HTMLElement) => {
    // This native host remains owned by AppShell across admin and canvas views.
    expect(container.closest('.st-shell')).not.toBeNull();
    const doc = { rootId: editor.getRootId()!, getNode: (sid: string) => store.getNode(sid) };
    view = new EditorViewDOM(editor, { container, registry: getGlobalRegistry(), env: { [WORD_ENV_KEY]: createTextEnv(doc) } });
    view.render();
    return { editor, view };
  };
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(createElement(OfficeLocaleProvider, { children: createElement(App, { mount }) })));
  expect(captured.beforeSnapshot).toBeTypeOf('function');
  expect(document.querySelector('.st-shell')).not.toBeNull();
  expect(document.querySelector('[data-admin-page]')).not.toBeNull();
  expect(document.querySelector('.st-canvas')).toBeNull();
  const open = document.querySelector<HTMLButtonElement>('[data-admin-open]');
  expect(open).not.toBeNull();
  await act(async () => open!.click());
  expect(document.querySelector('.st-canvas')).not.toBeNull();
});

afterEach(async () => {
  await act(async () => root?.unmount()); root = undefined;
  view?.destroy(); editor?.destroy(); document.body.replaceChildren();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

it('delivers the actual matching committed Site owner without changing its full original or history', async () => {
  const before = state(), deliver = vi.spyOn(view, 'deliverInput');
  await act(async () => { await captured.beforeSnapshot!(); });
  expect(deliver).toHaveBeenCalledTimes(1);
  expect(state()).toEqual(before);
});

for (const retirement of ['composition', 'replacement', 'editable ABA', 'unmount'] as const) it(`cancels actual Site readiness waiting after ${retirement} without admitting old input`, async () => {
  const deliver = vi.spyOn(view, 'deliverInput');
  let pending!: Promise<void>, afterRetirement!: ReturnType<typeof state>;
  const composeTarget = document.querySelector<HTMLInputElement>('.st-shell input');
  expect(composeTarget).not.toBeNull();
  let capturedEpoch = -1;
  act(() => {
    // The actual replacement notifies App before React commits its new inspector owner.
    const original = editor.exportDocument();
    editor.loadDocument(original, 'site');
    capturedEpoch = editor.dataStore.getDocumentEpoch();
    pending = captured.beforeSnapshot!();
    // Attach immediately: the production cancellation can reject before the next act.
    void pending.catch(() => {});
    expect(deliver).not.toHaveBeenCalled();
    if (retirement === 'composition') composeTarget!.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '가' }));
    else if (retirement === 'replacement') editor.loadDocument(editor.exportDocument(), 'site');
    else if (retirement === 'editable ABA') { editor.setEditable(false); editor.setEditable(true); }
    else { root!.unmount(); root = undefined; }
    afterRetirement = state();
  });
  await expect(pending).rejects.toThrow('문서가 변경되었습니다');
  expect(deliver).not.toHaveBeenCalled();
  expect(state()).toEqual(afterRetirement);
  if (retirement === 'replacement') expect(afterRetirement.epoch).toBeGreaterThan(capturedEpoch);
  if (retirement === 'composition') {
    await expect(captured.beforeSnapshot!()).rejects.toThrow('마지막 입력을 완료');
    expect(deliver).not.toHaveBeenCalled();
    await act(async () => {
      composeTarget!.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '가' }));
      await captured.beforeSnapshot!();
    });
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(state()).toEqual(afterRetirement);
  }
});
