import { readNoteSnapshotFile, type NoteNativeDocument, type RegistryBundle } from './note-file-codec';

export interface NativeNoteContext {
  readonly fileVersion: 2;
  readonly rawSnapshotText: string;
  readonly document: NoteNativeDocument;
  readonly schemaBundle: RegistryBundle;
  readonly savedAt?: string;
}
export class NativeNoteError extends Error {
  constructor(public readonly code: 'invalid_native_context' | 'unsupported_native_editor' | 'native_context_changed' | 'native_snapshot_unavailable',
    public readonly detail?: string) { super(code); }
}
const contexts = new WeakSet<NativeNoteContext>();
function freeze(value: unknown): void {
  if (value !== null && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
}
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
/** Intrinsic file context only. It never grants server or local editing permission. */
export function createNoteNative2Context(rawSnapshotText: string): NativeNoteContext {
  const parsed = readNoteSnapshotFile(rawSnapshotText);
  if ('error' in parsed || !('fileVersion' in parsed) || parsed.fileVersion !== 2) throw new NativeNoteError('invalid_native_context');
  const context: NativeNoteContext = { fileVersion: 2, rawSnapshotText, document: parsed.document, schemaBundle: parsed.schemaBundle,
    ...(parsed.savedAt !== undefined ? { savedAt: parsed.savedAt } : {}) };
  const names = new Set<string>();
  for (const selected of context.schemaBundle.selected) {
    const entry = context.schemaBundle.definitions.find(one => one.reference.schemaId === selected.schemaId && one.reference.version === selected.version);
    if (!entry) throw new NativeNoteError('invalid_native_context');
    const definition: unknown = JSON.parse(entry.definitionText);
    if (!record(definition) || !record(definition.dataset) || typeof definition.dataset.name !== 'string' || names.has(definition.dataset.name)) {
      throw new NativeNoteError('invalid_native_context', 'Ambiguous selected dataset names');
    }
    names.add(definition.dataset.name);
  }
  freeze(context); contexts.add(context); return context;
}

// Closed first-bridge vocabulary, verified by full authored A/A2/C fixtures and local desktop tests.
// Resources/dataset are preserved data regions, not arbitrary renderer/plugin declarations.
const nodes = new Set(['note', 'heading', 'paragraph', 'inline-text', 'codeBlock', 'bTable', 'bTableBody', 'bTableRow', 'bTableCell',
  'pageReference', 'resources', 'richText', 'dataset']);
const marks = new Set(['bold', 'italic', 'underline', 'strike']);
export function assertSupportedNativeNoteDocument(document: unknown): void {
  const walk = (value: unknown) => {
    if (!record(value) || typeof value.stype !== 'string' || !nodes.has(value.stype)) throw new NativeNoteError('unsupported_native_editor', 'node');
    // These model bookkeeping names have ambiguous authored meaning. Keep their raw context closed.
    if (['sid', 'parentId', 'version', 'createdAt', 'updatedAt'].some(key => Object.hasOwn(value, key))) throw new NativeNoteError('unsupported_native_editor', 'session-field');
    if (Object.keys(value).some(key => !['stype', 'attributes', 'text', 'content', 'marks', 'metadata'].includes(key))) throw new NativeNoteError('unsupported_native_editor', 'node-field');
    if (Array.isArray(value.marks)) for (const mark of value.marks) {
      if (!record(mark) || typeof mark.stype !== 'string' || !marks.has(mark.stype)) throw new NativeNoteError('unsupported_native_editor', 'mark');
    }
    if (Array.isArray(value.content)) value.content.forEach(walk);
  };
  walk(document);
}

/** Same-context identity only; this intrinsic brand grants no editing authority. */
export function isNativeNoteContext(context: NativeNoteContext): boolean { return contexts.has(context); }
