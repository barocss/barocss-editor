import { DataStore } from '@barocss/datastore';
import { RendererRegistry, intoRegistry } from '@barocss/dsl';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { createSchema } from '@barocss/schema';
import { Editor } from '@barocss/editor-core';
import { rememberNoteNativeSource } from '@barocss/office-note';
import { registerTransactionIntentGuardFactory } from '@barocss/model';
import { WORD_ENV_KEY, createTextEnv, installCellSelection } from '@barocss/office-text';
import { createSiteEditor, getSiteSchemaDefinition, registerSiteRenderers, PAGE_CSS, exportSite, siteFileText, readSiteFile, refsIn, refFaults } from '@barocss/office-site';
import { hasUniqueSiteResourceIdentities } from './server-file';

export interface SiteRuntime {
  editor: Editor;
  view: EditorViewDOM;
  registry: RendererRegistry;
  exportSite: () => ReturnType<typeof exportSite>;
  flushPendingInput: (isReady: () => boolean) => Promise<boolean>;
  captureInputIntent: () => (() => boolean) | null;
  commandFailure: () => { error: unknown; acknowledge(isCurrent: () => boolean): boolean } | undefined;
  dispose: () => void;
  flushCommands: () => Promise<void>;
  loadNativeDocument: (document: unknown) => void;
  exportNativeDocument: () => unknown;
}
export interface SiteRuntimeOptions {
  initialDocument: unknown;
  editable: boolean;
  debug?: boolean;
  isActive?: () => boolean;
  getAuthorityEpoch?: () => number;
  isAuthorized?: () => boolean;
}

type NativeSourceShape = { metadata: unknown; hasMetadata: boolean; hasAttributes: boolean; loadedAt: unknown; emptyContent: boolean };

const nativeTree = (value: unknown): unknown => {
  const file = readSiteFile(siteFileText(value));
  if ('error' in file) throw new Error(file.error);
  return file.document;
};
const canonical = (value: unknown): string => {
  const ordered = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(ordered);
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item)
      .filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, ordered(child)]));
    return item;
  };
  return JSON.stringify(ordered(value));
};
const reconcile = (tree: unknown, shapes: Map<string, NativeSourceShape>): unknown => {
  const restore = (value: unknown): unknown => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const node = value as Record<string, unknown>;
    const shape = typeof node.sid === 'string' ? shapes.get(node.sid) : undefined;
    const copy = { ...node };
    if (shape && copy.metadata && typeof copy.metadata === 'object') {
      const metadata = { ...copy.metadata as Record<string, unknown> };
      const original = shape.metadata as Record<string, unknown> | undefined;
      if (metadata.loadedAt === shape.loadedAt) {
        if (original && Object.hasOwn(original, 'loadedAt')) metadata.loadedAt = original.loadedAt;
        else delete metadata.loadedAt;
      }
      if (shape.hasMetadata || Object.keys(metadata).length) copy.metadata = metadata;
      else delete copy.metadata;
    }
    if (shape && !shape.hasAttributes && copy.attributes && typeof copy.attributes === 'object'
      && Object.keys(copy.attributes).length === 0) delete copy.attributes;
    if (shape?.emptyContent && copy.content === undefined) copy.content = [];
    if (Array.isArray(copy.content)) copy.content = copy.content.map(restore);
    return copy;
  };
  return nativeTree(restore(tree));
};
function mapNativeSource(source: unknown, loaded: unknown): Map<string, NativeSourceShape> {
  const mapped = new Map<string, NativeSourceShape>();
  const mapSource = (original: unknown, loaded: unknown): void => {
    if (!original || typeof original !== 'object' || !loaded || typeof loaded !== 'object')
      throw new Error('Site document cannot be loaded without changes.');
    const a = original as Record<string, unknown>, b = loaded as Record<string, unknown>;
    if (typeof b.sid !== 'string') throw new Error('Site document has no session identity.');
    mapped.set(b.sid, { metadata: a.metadata, hasMetadata: Object.hasOwn(a, 'metadata'), hasAttributes: Object.hasOwn(a, 'attributes'), loadedAt: (b.metadata as Record<string, unknown> | undefined)?.loadedAt, emptyContent: Array.isArray(a.content) && a.content.length === 0 });
    const children = Array.isArray(a.content) ? a.content : [];
    const actual = Array.isArray(b.content) ? b.content : [];
    if (children.length !== actual.length) throw new Error('Site document content changed while loading.');
    children.forEach((child, index) => mapSource(child, actual[index]));
  };
  mapSource(source, loaded);
  return mapped;
}

/** Refuse unsupported native input before an authenticated host replaces its current model. */
export function assertSiteNativeDocument(value: unknown): void {
  const source = nativeTree(value);
  if (!hasUniqueSiteResourceIdentities(source)) throw new Error('Site document has ambiguous resource identities.');
  const probe = createSiteEditor({ editable: false });
  try {
    probe.loadDocument(source as never, 'site-native-validation');
    if (probe.documentFaults.length) throw new Error('Site document does not match its native schema.');
    const doc = { rootId: probe.getRootId()!, getNode: (id: string) => probe.dataStore.getNode(id) };
    const unresolved = refFaults(doc, refsIn(doc)).filter(fault => fault.kind !== 'orphan');
    if (unresolved.length) throw new Error(`Site document has unresolved references: ${unresolved.map(fault => fault.said).join('; ')}`);
    const exported = probe.exportDocument();
    const roundtrip = reconcile(exported, mapNativeSource(source, exported));
    if (canonical(source) !== canonical(roundtrip)) throw new Error('Site document cannot be loaded without changes.');
  } finally { probe.destroy(); }
}


/** Create an owned editor lifetime without bootstrapping a page or opening a sample site. */
export function createSiteRuntime(container: HTMLElement, options: SiteRuntimeOptions): SiteRuntime {
  const registry = new RendererRegistry({ global: false });
  intoRegistry(registry, registerSiteRenderers);
  const schema = createSchema('site', getSiteSchemaDefinition());
  const dataStore = new DataStore(undefined, schema);
  const editor = createSiteEditor({ editable: options.editable, schema, dataStore });
  let disposed = false;
  let authorityGeneration = 0;
  let wasEditable = editor.isEditable;
  const trackAuthority = () => { if (wasEditable !== editor.isEditable) { wasEditable = editor.isEditable; authorityGeneration++; } };
  editor.on('editor:editable.change', trackAuthority);
  const removeIntent = registerTransactionIntentGuardFactory(editor, () => {
    const generation = authorityGeneration, epoch = dataStore.getDocumentEpoch(), outerEpoch = options.getAuthorityEpoch?.();
    return () => disposed || !(options.isActive?.() ?? true) || !editor.isEditable || generation !== authorityGeneration || outerEpoch !== options.getAuthorityEpoch?.() || epoch !== dataStore.getDocumentEpoch()
      ? 'The site authority or document changed.' : undefined;
  });
  const listeners = new AbortController();
  let inputVersion = 0, commandVersion = 0, composing = false;
  const active = () => !disposed && (options.isActive?.() ?? true);
  const inputChanged = () => { inputVersion++; };
  container.addEventListener('beforeinput', inputChanged, { capture: true, signal: listeners.signal });
  container.addEventListener('compositionstart', () => { composing = true; inputVersion++; }, { capture: true, signal: listeners.signal });
  container.addEventListener('compositionend', () => { composing = false; inputVersion++; }, { capture: true, signal: listeners.signal });
  const pendingCommands = new Set<Promise<boolean>>();
  const owner = () => disposed ? undefined : `${authorityGeneration}:${dataStore.getDocumentEpoch()}:${editor.getRootId()}`;
  let failure: { owner: unknown; error: unknown } | undefined;
  const executing = new Set<{ command: string; payload: unknown; owner: unknown }>();
  const commandFailed = ({ command, payload, error }: { command: string; payload?: unknown; error: unknown }) => {
    const matching = [...executing].filter(one => one.command === command && one.payload === payload && one.owner === owner());
    if (matching.length) failure = { owner: owner(), error };
  };
  editor.on('error:command', commandFailed);
  const captureOwner = () => {
    const root = editor.getRootId(), epoch = dataStore.getDocumentEpoch(), authority = authorityGeneration, outerEpoch = options.getAuthorityEpoch?.();
    return () => !disposed && (options.isAuthorized?.() ?? true) && outerEpoch === options.getAuthorityEpoch?.() && container.isConnected && editor.getRootId() === root && dataStore.getDocumentEpoch() === epoch && authorityGeneration === authority;
  };
  const flushCommands = async () => {
    const owns = captureOwner(), version = inputVersion;
    if (!owns() || composing) throw new Error('Finish the current Site input before leaving.');
    do {
      await Promise.all([...pendingCommands]);
      const lock = await dataStore.acquireLock('site-snapshot-input');
      dataStore.releaseLock(lock);
      if (!owns() || composing || version !== inputVersion || failure?.owner === owner())
        throw new Error('The Site input changed or failed while preparing its snapshot.');
    } while (pendingCommands.size);
  };
  const captureInputIntent = () => {
    if (disposed || composing || pendingCommands.size || failure?.owner === owner()) return null;
    const owns = captureOwner(), version = inputVersion, commands = commandVersion;
    return () => owns() && !composing && !pendingCommands.size && inputVersion === version && commandVersion === commands && failure?.owner !== owner();
  };
  const readerCommands = new Set(['setNode', 'setRange', 'setSelection', 'selectAll', 'copy', 'copyBlocks', 'nextCell', 'previousCell', 'exportSite', 'exportPage']);
  const canExecute = editor.canExecuteCommand.bind(editor);
  const execute = editor.executeCommand.bind(editor);
  editor.canExecuteCommand = (command, payload) => active() && (editor.isEditable || readerCommands.has(command)) && canExecute(command, payload);
  editor.executeCommand = (command, payload) => {
    if (!active() || (!editor.isEditable && !readerCommands.has(command))) return Promise.resolve(false);
    commandVersion++;
    const owns = captureOwner(), supplied = payload?.canApply as (() => boolean) | undefined;
    const ownedPayload = readerCommands.has(command) ? payload : { ...payload, canApply: () => active() && owns() && editor.isEditable && (!supplied || supplied()) };
    const captured = { command, payload: ownedPayload, owner: owner() }; executing.add(captured);
    const pending = execute(command, ownedPayload); pendingCommands.add(pending);
    void pending.then(() => { pendingCommands.delete(pending); executing.delete(captured); }, error => {
      if (captured.owner === owner()) failure = { owner: owner(), error };
      pendingCommands.delete(pending); executing.delete(captured);
    });
    return pending;
  };
  const viewHolder: { current?: EditorViewDOM } = {};
  const doc = { getNode: (id: string) => dataStore.getNode(id) as never, get rootId() { return editor.getRootId()!; } };
  const sourceShape = new Map<string, NativeSourceShape>();
  let loadingNative: unknown;
  const exportNativeDocument = (): unknown => {
    if (disposed) throw new Error('Site runtime is disposed.');
    return loadingNative === undefined ? reconcile(editor.exportDocument(), sourceShape) : nativeTree(loadingNative);
  };
  const loadNativeDocument = (value: unknown): void => {
    if (disposed) throw new Error('Site runtime is disposed.');
    assertSiteNativeDocument(value);
    const source = nativeTree(value);
    loadingNative = source;
    try {
      editor.loadDocument(source as never);
      const mapped = mapNativeSource(source, editor.exportDocument());
      rememberNoteNativeSource(dataStore, source, editor.getRootId()!);
      sourceShape.clear();
      for (const [id, shape] of mapped) sourceShape.set(id, shape);
      viewHolder.current?.setEnv({ [WORD_ENV_KEY]: createTextEnv(doc) });
    } finally { loadingNative = undefined; }
  };
  try { loadNativeDocument(options.initialDocument); }
  catch (error) {
    disposed = true; listeners.abort(); removeIntent();
    editor.off('editor:editable.change', trackAuthority); editor.off('error:command', commandFailed);
    editor.destroy(); throw error;
  }
  const mountedView = new EditorViewDOM(editor, { container, registry,
    env: { [WORD_ENV_KEY]: createTextEnv(doc) } });
  viewHolder.current = mountedView;
  const syncEditable = () => { mountedView.contentEditableElement.contentEditable = String(editor.isEditable); };
  syncEditable();
  editor.on('editor:editable.change', syncEditable);
  mountedView.render();
  const cells = installCellSelection(editor, container, doc as never);
  const refuseMutation = (event: Event) => {
    if (editor.isEditable) return;
    event.preventDefault(); event.stopImmediatePropagation();
  };
  for (const type of ['beforeinput', 'paste', 'cut', 'drop', 'compositionstart'])
    container.addEventListener(type, refuseMutation, { capture: true, signal: listeners.signal });
  container.addEventListener('keydown', event => {
    if (editor.isEditable) return;
    const navigation = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Tab', 'Escape'];
    const readerShortcut = (event.ctrlKey || event.metaKey) && !event.altKey
      && ['c', 'a', 'f', '+', '=', '-', '0'].includes(event.key.toLowerCase());
    if (!navigation.includes(event.key) && !readerShortcut) refuseMutation(event);
  }, { capture: true, signal: listeners.signal });
  const releasePageStyles = acquirePageStyles(container.ownerDocument);
  const diagnostics = container.ownerDocument.defaultView as (Window & { editor?: Editor; editorView?: EditorViewDOM; exportSite?: () => ReturnType<typeof exportSite> }) | null;
  const staticExport = () => exportSite(editor as never, registry);
  const flushPendingInput = async (isReady: () => boolean) => {
    const owns = captureOwner(), version = inputVersion;
    const current = () => owns() && isReady() && !composing && inputVersion === version;
    if (!current() || !await mountedView.deliverInput(current) || !current()) return false;
    try { await flushCommands(); } catch { return false; }
    return current();
  };
  const commandFailure = () => {
    const captured = failure;
    if (!captured || captured.owner !== owner()) return;
    return Object.freeze({ error: captured.error, acknowledge: (isCurrent: () => boolean) => {
      if (failure !== captured || pendingCommands.size || captured.owner !== owner() || !isCurrent()) return false;
      failure = undefined; return true;
    } });
  };
  if (options.debug && diagnostics) { diagnostics.editor = editor; diagnostics.editorView = mountedView; diagnostics.exportSite = staticExport; }
  return { editor, view: mountedView, registry, exportSite: staticExport, flushPendingInput, captureInputIntent, commandFailure, loadNativeDocument, exportNativeDocument, flushCommands, dispose: () => {
    if (disposed) return;
    disposed = true;
    editor.setEditable(false);
    editor.off('editor:editable.change', trackAuthority);
    editor.off('error:command', commandFailed);
    removeIntent();
    editor.off('editor:editable.change', syncEditable);
    listeners.abort(); cells.destroy(); releasePageStyles(); sourceShape.clear(); mountedView.destroy(); editor.destroy();
    if (options.debug && diagnostics?.editor === editor) { delete diagnostics.editor; delete diagnostics.editorView; }
    if (options.debug && diagnostics?.exportSite === staticExport) delete diagnostics.exportSite;
  } };
}
export const mountSiteRuntime = createSiteRuntime;


const pageStyles = new WeakMap<Document, { element: HTMLStyleElement; owners: number; created: boolean }>();
function acquirePageStyles(document: Document): () => void {
  let held = pageStyles.get(document);
  if (!held) {
    const existing = document.querySelector<HTMLStyleElement>('style[data-site-page]');
    const element = existing ?? document.createElement('style');
    if (!existing) { element.dataset.sitePage = 'true'; element.textContent = PAGE_CSS; document.head.append(element); }
    held = { element, owners: 0, created: !existing };
    pageStyles.set(document, held);
  }
  held.owners += 1;
  return () => {
    if (--held.owners) return;
    if (held.created) held.element.remove();
    pageStyles.delete(document);
  };
}
