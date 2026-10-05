// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSampleSite, siteFileText } from '@barocss/office-site';
import { WORD_ENV_KEY } from '@barocss/office-text';
import { createSiteRuntime, assertSiteNativeDocument, type SiteRuntime } from '../src/runtime';

const diagnosticWindow = window as Window & { editor?: SiteRuntime['editor']; editorView?: SiteRuntime['view']; exportSite?: () => unknown };
const runtimes: SiteRuntime[] = [];
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('CSS', { escape: (text: string) => text });
});
afterEach(() => { runtimes.splice(0).forEach(runtime => runtime.dispose()); document.body.replaceChildren(); vi.unstubAllGlobals(); });
const native = (document: unknown) => JSON.parse(siteFileText(document, 'fixed')).document;
const start = (initialDocument: unknown = createSampleSite(), editable = true, debug = false) => {
  const host = document.createElement('div'); document.body.append(host);
  const runtime = createSiteRuntime(host, { initialDocument, editable, debug }); runtimes.push(runtime);
  return { runtime, host };
};

it('imports without mounting, replacing debug globals, or appending a page stylesheet', async () => {
  const styles = document.querySelectorAll('style[data-site-page]').length;
  const before = document.body.innerHTML;
  const diagnostics = { editor: diagnosticWindow.editor, view: diagnosticWindow.editorView, export: diagnosticWindow.exportSite };
  await import('../src/runtime');
  expect(document.body.innerHTML).toBe(before);
  expect(document.querySelectorAll('style[data-site-page]')).toHaveLength(styles);
  expect({ editor: diagnosticWindow.editor, view: diagnosticWindow.editorView, export: diagnosticWindow.exportSite }).toEqual(diagnostics);
});

it('retains full native metadata, references, empty content and attributes through repeated loads', () => {
  const source = native(createSampleSite());
  source.metadata = { createdBy: 'fixture', loadedAt: 'native-value', nested: { keep: ['x', 2] } };
  const { runtime } = start(source);
  expect(runtime.exportNativeDocument()).toEqual(source);
  const next = structuredClone(source);
  next.metadata.createdBy = 'next document';
  runtime.loadNativeDocument(next);
  expect(runtime.exportNativeDocument()).toEqual(next);
  runtime.loadNativeDocument(source);
  expect(runtime.exportNativeDocument()).toEqual(source);
  expect(runtime.exportSite().length).toBeGreaterThan(0);
});

it('refreshes the text environment and resolvers against the currently loaded root', () => {
  const { runtime } = start();
  const oldEnv = runtime.view.getEnv()[WORD_ENV_KEY] as { doc: { rootId: string }; styles: unknown };
  const oldRoot = runtime.editor.getRootId();
  runtime.loadNativeDocument(native(createSampleSite()));
  const env = runtime.view.getEnv()[WORD_ENV_KEY] as { doc: { rootId: string }; styles: unknown };
  expect(runtime.editor.getRootId()).not.toBe(oldRoot);
  expect(env.doc.rootId).toBe(runtime.editor.getRootId());
  expect(env.styles).not.toBe(oldEnv.styles);
});

it('refuses a lossy unsupported tree without replacing the current model', () => {
  const { runtime } = start(); const before = runtime.exportNativeDocument(); const root = runtime.editor.getRootId();
  const invalid = native(createSampleSite()); invalid.unsupportedNativeProperty = 'must not disappear';
  expect(() => assertSiteNativeDocument(invalid)).toThrow();
  expect(() => runtime.loadNativeDocument(invalid)).toThrow();
  expect(runtime.editor.getRootId()).toBe(root); expect(runtime.exportNativeDocument()).toEqual(before);
});

it('refuses unresolved rich-content references without replacing the current model', () => {
  const { runtime } = start(); const before = runtime.exportNativeDocument();
  const invalid = native(createSampleSite());
  const walk = (node: { stype?: string; content?: unknown[] }): void => {
    if (node.content) node.content = node.content.filter(child => (child as { stype?: string }).stype !== 'richText');
    node.content?.forEach(child => walk(child as typeof node));
  };
  walk(invalid);
  expect(() => runtime.loadNativeDocument(invalid)).toThrow(/reference/);
  expect(runtime.exportNativeDocument()).toEqual(before);
});

it('blocks viewer commands and input immediately and cleans only owned runtime styles and handles', async () => {
  const first = start(createSampleSite(), false, true);
  const second = start(createSampleSite(), true, true);
  const before = first.runtime.exportNativeDocument();
  expect(await first.runtime.editor.executeCommand('insertBodyText')).toBe(false);
  const input = new InputEvent('beforeinput', { inputType: 'insertText', data: 'blocked', bubbles: true, cancelable: true });
  first.host.dispatchEvent(input); expect(input.defaultPrevented).toBe(true);
  expect(first.runtime.exportNativeDocument()).toEqual(before);
  first.runtime.dispose(); first.runtime.dispose();
  expect(diagnosticWindow.editor).toBe(second.runtime.editor);
  expect(document.querySelectorAll('style[data-site-page]')).toHaveLength(1);
  expect(() => first.runtime.exportNativeDocument()).toThrow(/disposed/);
  second.runtime.dispose();
  expect(diagnosticWindow.editor).toBeUndefined(); expect(diagnosticWindow.exportSite).toBeUndefined();
  expect(document.querySelectorAll('style[data-site-page]')).toHaveLength(0);
});
it('waits for queued commands and rejects authority ABA without changing native content', async () => {
  const { runtime } = start(); const before = runtime.exportNativeDocument();
  const lock = await runtime.editor.dataStore.acquireLock('hold-runtime');
  const pending = runtime.editor.executeCommand('insertBodyText');
  let settled = false; const flushed = runtime.flushCommands().then(() => { settled = true; }, () => { settled = true; return false; });
  await Promise.resolve(); expect(settled).toBe(false);
  runtime.editor.setEditable(false); runtime.editor.setEditable(true);
  runtime.editor.dataStore.releaseLock(lock);
  expect(await pending).toBe(false); expect(await flushed).toBe(false);
  expect(runtime.exportNativeDocument()).toEqual(before);
});

it('keeps private drawing and all export command pages including 404 independent of a foreign global renderer', async () => {
  const { getGlobalRegistry, define, element, slot } = await import('@barocss/dsl');
  const { registerSiteRenderers, pagesOf, exportPage } = await import('@barocss/office-site');
  const { runtime } = start();
  const pages = pagesOf({ rootId: runtime.editor.getRootId()!, getNode: id => runtime.editor.dataStore.getNode(id) });
  const { setAttrs, transaction } = await import('@barocss/model');
  await transaction(runtime.editor, [setAttrs(pages[0].sid, { notFound: true })]).commit();
  const expected = runtime.exportSite(); const expectedNative = runtime.exportNativeDocument();
  registerSiteRenderers();
  define('paragraph', element('aside', { 'data-foreign-product': 'yes' }, slot('content')));
  const foreign = getGlobalRegistry().getComponent('paragraph');
  try {
    runtime.view.render(undefined, { sync: true });
    expect(exportPage(runtime.editor, pages[0].sid).html).toContain('data-foreign-product');
    expect(runtime.exportSite()).toEqual(expected);
    let result: { pages: { html: string }[]; files: { file: string; text?: string }[] } | undefined;
    const write = (value: typeof result) => { result = value; };
    expect(await runtime.editor.executeCommand('exportSite', { registry: runtime.registry, write })).toBe(true);
    expect(result!.pages).toEqual(expected);
    expect(result!.files.find(file => file.file === '404.html')?.text).toBe(expected[0].html);
    expect(await runtime.editor.executeCommand('exportPage', { registry: runtime.registry, pageId: pages[0].sid, write })).toBe(true);
    expect(result!.pages).toEqual([expected[0]]);
    expect(getGlobalRegistry().getComponent('paragraph')).toBe(foreign);
    expect(runtime.exportNativeDocument()).toEqual(expectedNative);
  } finally { registerSiteRenderers(); }
});

it('allows clean inactive staged-owner preparation but refuses inactive writes and expired intent', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const runtime = createSiteRuntime(host, { initialDocument: createSampleSite(), editable: true, isActive: () => false }); runtimes.push(runtime);
  const before = runtime.exportNativeDocument();
  expect(await runtime.flushPendingInput(() => true)).toBe(true);
  const intent = runtime.captureInputIntent(); expect(intent?.()).toBe(true);
  expect(await runtime.editor.executeCommand('insertBodyText')).toBe(false);
  expect(runtime.exportNativeDocument()).toEqual(before);
  runtime.editor.setEditable(false); runtime.editor.setEditable(true); expect(intent?.()).toBe(false);
});
it('retains the exact real command failure while no-op refusal and retired acknowledgement remain distinct', async () => {
  const { runtime } = start();
  runtime.editor.registerCommand({ name: 'currentNoop', execute: async () => false, canExecute: () => true });
  expect(await runtime.editor.executeCommand('currentNoop')).toBe(false); expect(runtime.commandFailure()).toBeUndefined();
  const error = new Error('actual native command rejection');
  runtime.editor.registerCommand({ name: 'currentFailure', execute: async () => { throw error; }, canExecute: () => true });
  const before = runtime.exportNativeDocument();
  expect(await runtime.editor.executeCommand('currentFailure')).toBe(false);
  const captured = runtime.commandFailure()!; expect(captured.error).toBe(error);
  expect(captured.acknowledge(() => false)).toBe(false); expect(runtime.commandFailure()?.error).toBe(error);
  runtime.editor.setEditable(false); runtime.editor.setEditable(true);
  expect(captured.acknowledge(() => true)).toBe(false); expect(runtime.exportNativeDocument()).toEqual(before);
});
it('preserves a complete unused native rich resource while retaining strict missing-reference refusal', () => {
  const source = native(createSampleSite());
  const resources = source.content.find((node: { stype: string }) => node.stype === 'resources');
  const body = structuredClone(resources.content.find((node: { stype: string }) => node.stype === 'richText'));
  body.attributes.id = 'unused-native-resource'; body.metadata = { owner: 'preserved', loadedAt: 'durable-native-time' };
  resources.content.push(body); const before = structuredClone(source);
  expect(() => assertSiteNativeDocument(source)).not.toThrow();
  const { runtime } = start(source); expect(runtime.exportNativeDocument()).toEqual(before);
  runtime.loadNativeDocument(before); expect(runtime.exportNativeDocument()).toEqual(before);
  expect(source).toEqual(before);
});

it.each(['richText', 'dataset'] as const)('refuses ambiguous root %s resources before replacing native history or selection', type => {
  const { runtime } = start();
  const before = structuredClone({ root: runtime.editor.getRootId(), native: runtime.exportNativeDocument(), history: runtime.editor.historyManager.getHistory(), selection: runtime.editor.selection });
  const source = native(createSampleSite());
  const resources = source.content.find((node: { stype: string }) => node.stype === 'resources');
  const duplicate = structuredClone(resources.content.find((node: { stype: string }) => node.stype === type));
  if (type === 'richText') duplicate.content = [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'ambiguous other body', marks: [] }] }];
  resources.content.push(duplicate);
  const untouched = structuredClone(source);
  expect(() => assertSiteNativeDocument(source)).toThrow(/resource identit/i);
  expect(() => runtime.loadNativeDocument(source)).toThrow(/resource identit/i);
  expect({ root: runtime.editor.getRootId(), native: runtime.exportNativeDocument(), history: runtime.editor.historyManager.getHistory(), selection: runtime.editor.selection }).toEqual(before);
  expect(source).toEqual(untouched);
});

it('preserves cross-type resource names and dataset-local shared row identities without widening uniqueness policy', () => {
  const source = native(createSampleSite());
  const resources = source.content.find((node: { stype: string }) => node.stype === 'resources');
  const dataset = resources.content.find((node: { stype: string }) => node.stype === 'dataset');
  const body = structuredClone(resources.content.find((node: { stype: string }) => node.stype === 'richText'));
  body.attributes.id = dataset.attributes.name;
  const second = structuredClone(dataset); second.attributes.name = 'independent-shared-row-ids';
  expect(second.attributes.rowIds).toEqual(dataset.attributes.rowIds);
  resources.content.push(body, second);
  const before = structuredClone(source);
  expect(() => assertSiteNativeDocument(source)).not.toThrow();
  const { runtime } = start(source); expect(runtime.exportNativeDocument()).toEqual(before);
  runtime.loadNativeDocument(before); expect(runtime.exportNativeDocument()).toEqual(before);
  expect(source).toEqual(before);
});

it('retires queued native input and snapshot witnesses across an outer authority epoch', async () => {
  let epoch = 1, authorized = true;
  const host = document.createElement('div'); document.body.append(host);
  const runtime = createSiteRuntime(host, { initialDocument: createSampleSite(), editable: true,
    isActive: () => authorized, isAuthorized: () => authorized, getAuthorityEpoch: () => epoch });
  runtimes.push(runtime);
  const before = runtime.exportNativeDocument(), witness = runtime.captureInputIntent();
  const lock = await runtime.editor.dataStore.acquireLock('hold-outer-authority');
  const pending = runtime.editor.executeCommand('insertBodyText');
  const flushed = runtime.flushCommands().then(() => true, () => false);
  authorized = false; epoch++;
  expect(witness?.()).toBe(false);
  authorized = true;
  runtime.editor.dataStore.releaseLock(lock);
  expect(await pending).toBe(false); expect(await flushed).toBe(false);
  expect(witness?.()).toBe(false);
  expect(runtime.exportNativeDocument()).toEqual(before);
  expect(runtime.captureInputIntent()?.()).toBe(true);
});
