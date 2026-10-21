import { createCommandSettlement, type NativeCommandFailure } from './command-settlement';
import { DataStore } from '@barocss/datastore';
import { RendererRegistry, intoRegistry } from '@barocss/dsl';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { createSchema } from '@barocss/schema';
import { Editor } from '@barocss/editor-core';
import { WORD_ENV_KEY, installCellSelection } from '@barocss/office-text';
import { createSlidesEditor, getSlidesSchemaDefinition, registerSlidesRenderers,
  createConnectorPass, createDeckEnv, trackPropertyCss, normalizeSlidesNativeDocument } from '@barocss/office-slides';

export interface SlidesRuntime {
  editor: Editor;
  view: EditorViewDOM;
  /** Shared by every secondary view owned by this runtime. */
  registry: RendererRegistry;
  dispose: () => void;
  loadNativeDocument: (document: unknown) => void;
  exportNativeDocument: () => unknown;
  /** Started commands only. The host must first deliver child drafts and composition. */
  settleCommands: (isCurrent: () => boolean) => Promise<boolean>;
  commandFailure: () => NativeCommandFailure | undefined;
}
export interface SlidesRuntimeOptions {
  initialDocument: unknown;
  editable: boolean;
  debug?: boolean;
}

type NativeSourceShape = { metadata: unknown; hasMetadata: boolean; hasAttributes: boolean; loadedAt: unknown; emptyContent: boolean };

const optionalNativeFields = ['content', 'text', 'marks', 'metadata'] as const;
/** Native snapshots contain portable values; unsupported input must not be silently coerced. */
const assertPortableNative = (value: unknown): void => {
  const active = new Set<object>();
  const visit = (item: unknown): void => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (!item || typeof item !== 'object' || active.has(item)) throw new Error('Slides native data contains an unsupported value.');
    const prototype = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null)
      throw new Error('Slides native data contains an unsupported object.');
    if (Object.getOwnPropertySymbols(item).length) throw new Error('Slides native data contains an unsupported key.');
    active.add(item);
    try {
      if (Array.isArray(item)) {
        if (Object.getOwnPropertyNames(item).some(key => key !== 'length' &&
          (!Number.isSafeInteger(Number(key)) || Number(key) < 0 || Number(key) >= item.length || String(Number(key)) !== key)))
          throw new Error('Slides native data contains an unsupported array property.');
        for (let index = 0; index < item.length; index++) {
          if (!Object.hasOwn(item, index)) throw new Error('Slides native data contains a sparse array.');
          const descriptor = Object.getOwnPropertyDescriptor(item, index)!;
          if (!Object.hasOwn(descriptor, 'value')) throw new Error('Slides native data contains an unsupported accessor.');
          visit(descriptor.value);
        }
      } else for (const key of Object.getOwnPropertyNames(item)) {
        const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
        if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('Slides native data contains an unsupported accessor.');
        visit(descriptor.value);
      }
    } finally { active.delete(item); }
  };
  visit(value);
};
const nativeTree = (value: unknown): unknown => {
  assertPortableNative(value);
  return normalizeSlidesNativeDocument(value);
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
    // The loader/exporter materializes absent optional fields as own undefined keys.
    // Construct the portable node fields here; defined edits and explicit empties survive.
    for (const field of optionalNativeFields) if (copy[field] === undefined) delete copy[field];
    // Native formatting commands materialize optional mark attrs as own undefined.
    // Encode that absence without changing the model or any other mark field.
    if (Array.isArray(copy.marks)) {
      const descriptors: PropertyDescriptorMap = Object.getOwnPropertyDescriptors(copy.marks as object);
      for (let index = 0; index < copy.marks.length; index++) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) continue;
        const mark = descriptor.value;
        if (!mark || typeof mark !== 'object' || Array.isArray(mark)) continue;
        const attrs = Object.getOwnPropertyDescriptor(mark, 'attrs');
        if (!attrs || !attrs.enumerable || !Object.hasOwn(attrs, 'value') || attrs.value !== undefined) continue;
        const encoded = Object.create(Object.getPrototypeOf(mark), Object.getOwnPropertyDescriptors(mark));
        delete encoded.attrs;
        descriptor.value = encoded;
      }
      copy.marks = Object.defineProperties(Object.setPrototypeOf([], Object.getPrototypeOf(copy.marks)), descriptors);
    }
    if (Array.isArray(copy.content)) copy.content = copy.content.map(restore);
    return copy;
  };
  return nativeTree(restore(tree));
};
function mapNativeSource(source: unknown, loaded: unknown): Map<string, NativeSourceShape> {
  const mapped = new Map<string, NativeSourceShape>();
  const mapSource = (original: unknown, loaded: unknown): void => {
    if (!original || typeof original !== 'object' || !loaded || typeof loaded !== 'object')
      throw new Error('Slides document cannot be loaded without changes.');
    const a = original as Record<string, unknown>, b = loaded as Record<string, unknown>;
    if (typeof b.sid !== 'string') throw new Error('Slides document has no session identity.');
    mapped.set(b.sid, { metadata: a.metadata, hasMetadata: Object.hasOwn(a, 'metadata'), hasAttributes: Object.hasOwn(a, 'attributes'), loadedAt: (b.metadata as Record<string, unknown> | undefined)?.loadedAt, emptyContent: Array.isArray(a.content) && a.content.length === 0 });
    const children = Array.isArray(a.content) ? a.content : [];
    const actual = Array.isArray(b.content) ? b.content : [];
    if (children.length !== actual.length) throw new Error('Slides document content changed while loading.');
    children.forEach((child, index) => mapSource(child, actual[index]));
  };
  mapSource(source, loaded);
  return mapped;
}

/** Refuse unsupported native input before an authenticated host replaces its current model. */
export function assertSlidesNativeDocument(value: unknown): void {
  const source = nativeTree(value);
  const probe = createSlidesEditor({ editable: false });
  try {
    probe.loadDocument(source as never, 'slides-native-validation');
    if (probe.documentFaults.length) throw new Error('Slides document does not match its native schema.');
    const exported = probe.exportDocument();
    const roundtrip = reconcile(exported, mapNativeSource(source, exported));
    if (canonical(source) !== canonical(roundtrip)) throw new Error('Slides document cannot be loaded without changes.');
  } finally { probe.destroy(); }
}


/** Create an owned editor lifetime without bootstrapping a page or opening a local deck. */
export function createSlidesRuntime(container: HTMLElement, options: SlidesRuntimeOptions): SlidesRuntime {
  // Supported Slides renderers stay owned by this view while another product is staged.
  // Unknown extension types retain the DSL registry's existing global fallback.
  const registry = new RendererRegistry({ global: false });
  intoRegistry(registry, registerSlidesRenderers);
  const schema = createSchema('slides', getSlidesSchemaDefinition());
  const dataStore = new DataStore(undefined, schema);
  const editor = createSlidesEditor({ editable: options.editable, schema, dataStore });
  let disposed = false;
  let nativeEpoch = 0;
  const commandOwner = () => disposed ? undefined :
    `${nativeEpoch}:${dataStore.getDocumentEpoch()}:${editor.getRootId()}`;
  const commands = createCommandSettlement(commandOwner);
  const executing = new Set<{ command: string; payload: unknown; owner: unknown }>();
  const commandFailed = ({ command, payload, error }: { command: string; payload?: unknown; error: unknown }) => {
    const matching = [...executing].filter(held => held.command === command && held.payload === payload);
    // The core error event has no operation ID. Ambiguous concurrent calls refuse until explicit recovery.
    const owners = new Set(matching.map(held => held.owner));
    if (owners.size === 1) commands.fail(error, matching[0].owner);
    else if (owners.size > 1) commands.fail(error);
  };
  editor.on('error:command', commandFailed);
  // Slides commands predate readonly hosts. Enforce authority at their public entry points.
  const readerCommands = new Set(['setNode', 'setRange', 'setSelection', 'selectAll', 'copy', 'copySlides', 'copyBoxes', 'nextCell', 'previousCell']);
  const canExecute = editor.canExecuteCommand.bind(editor);
  const execute = editor.executeCommand.bind(editor);
  editor.canExecuteCommand = (command, payload) =>
    (editor.isEditable || readerCommands.has(command)) && canExecute(command, payload);
  editor.executeCommand = (command, payload) => {
    const held = { command, payload, owner: commandOwner() };
    executing.add(held);
    const result = commands.track(editor.isEditable || readerCommands.has(command) ? execute(command, payload) : Promise.resolve(false));
    void result.then(() => executing.delete(held), () => executing.delete(held));
    return result;
  };
  const sourceShape = new Map<string, NativeSourceShape>();
  let loadingNative: unknown;
  const exportNativeDocument = (): unknown => {
    if (disposed) throw new Error('Slides runtime is disposed.');
    return loadingNative === undefined ? reconcile(editor.exportDocument(), sourceShape) : nativeTree(loadingNative);
  };
  const loadNativeDocument = (value: unknown): void => {
    if (disposed) throw new Error('Slides runtime is disposed.');
    assertSlidesNativeDocument(value);
    const source = nativeTree(value);
    nativeEpoch++;
    loadingNative = source;
    try {
      editor.loadDocument(source as never, 'slides');
      const mapped = mapNativeSource(source, editor.exportDocument());
      sourceShape.clear();
      for (const [id, shape] of mapped) sourceShape.set(id, shape);
    } finally { loadingNative = undefined; }
  };
  try { loadNativeDocument(options.initialDocument); }
  catch (error) { editor.destroy(); throw error; }
  const doc = { getNode: (id: string) => dataStore.getNode(id) as never,
    get rootId() { return editor.getRootId()!; } };
  const view = new EditorViewDOM(editor, { container, registry,
    env: { [WORD_ENV_KEY]: createDeckEnv(doc as never) } });
  view.registerLayoutPass(createConnectorPass({ doc }) as never);
  const syncEditable = () => { view.contentEditableElement.contentEditable = String(editor.isEditable); };
  syncEditable();
  editor.on('editor:editable.change', syncEditable);
  view.render();
  const cells = installCellSelection(editor, container, doc as never);
  const listeners = new AbortController();
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
  const ownerDocument = container.ownerDocument;
  if (!ownerDocument.querySelector('style[data-sl-tracks]')) {
    const tracks = ownerDocument.createElement('style');
    tracks.dataset.slTracks = '';
    tracks.textContent = trackPropertyCss();
    ownerDocument.head.append(tracks);
  }
  const diagnostics = window as Window & { editor?: Editor; editorView?: EditorViewDOM };
  if (options.debug) { diagnostics.editor = editor; diagnostics.editorView = view; }
  return { editor, view, registry, loadNativeDocument, exportNativeDocument, settleCommands: commands.settle, commandFailure: commands.failure, dispose: () => {
    if (disposed) return;
    disposed = true;
    editor.off('editor:editable.change', syncEditable);
    editor.off('error:command', commandFailed);
    listeners.abort(); cells.destroy(); sourceShape.clear(); view.destroy(); editor.destroy();
    if (options.debug && diagnostics.editor === editor) { delete diagnostics.editor; delete diagnostics.editorView; }
  } };
}
export const mountSlidesRuntime = createSlidesRuntime;
