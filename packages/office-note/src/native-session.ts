import type { Editor } from '@barocss/editor-core';
import { transaction, op } from '@barocss/model';
import { validateTree } from '@barocss/schema';
import { readNoteSnapshotFile, serializeNoteFile, type NoteNativeDocument } from './note-file-codec';
import { NativeNoteError, isNativeNoteContext, assertSupportedNativeNoteDocument as supported, type NativeNoteContext } from './native2-context';
export { createNoteNative2Context, NativeNoteError, type NativeNoteContext } from './native2-context';
import { captureNoteChildIntent, rememberNoteNativeSource, noteNodeTreeOf, openNoteTree, type NoteSession } from './session';

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
function equal(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((value, index) => equal(value, right[index]));
  if (!record(left) || !record(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && equal(left[key], right[key]));
}

export interface NativeNoteSession extends NoteSession {
  readonly context: NativeNoteContext;
  /** Whole live model with native key provenance; this is checked before any raw fastpath. */
  exportNativeDocument(): NoteNativeDocument;
  exportSnapshot(): string;
  /** Open the captured resource as a child of this exact native session. */
  openChildResource(resourceId: string): NoteSession;
  /** Deliver an existing isolated child body through guarded atomic engine history. */
  commitChildResource(resourceId: string, child: NoteSession): Promise<boolean>;
}
export interface NativeNoteOptions {
  authority?: Editor;
  session?: string;
  after?: number;
  onSnapshotChange?: (snapshotText: string) => void;
}

export function openNoteNativeSnapshot(context: NativeNoteContext, options: NativeNoteOptions = {}): NativeNoteSession {
  if (!isNativeNoteContext(context)) throw new NativeNoteError('invalid_native_context');
  supported(context.document); // Refuse B's literal strike before constructing an editor or touching its parent.
  const authority = options.authority;
  const parentEpoch = authority?.dataStore.getDocumentEpoch(), parentRoot = authority?.getRootId(), parentSession = authority?.dataStore.getSessionId();
  let closed = false;
  const children = new WeakMap<NoteSession, { resourceId: string; valid: () => boolean }>();
  const current = () => !closed && (!authority || authority.dataStore.getDocumentEpoch() === parentEpoch &&
    authority.getRootId() === parentRoot && authority.dataStore.getSessionId() === parentSession);
  const session = openNoteTree(structuredClone(context.document), { nativeSource: true, authority, session: options.session, after: options.after,
    onChange: () => { if (!current() || !result) throw new NativeNoteError('native_context_changed'); options.onSnapshotChange?.(result.exportSnapshot()); } });
  const exportNativeDocument = (): NoteNativeDocument => {
    if (!current()) throw new NativeNoteError('native_context_changed');
    const tree = noteNodeTreeOf(session.editor.dataStore, session.rootId);
    if (!tree) throw new NativeNoteError('native_snapshot_unavailable');
    supported(tree);
    // The codec validates live whole-body values against the unchanged full context, not the original body.
    let serialized: string;
    try { serialized = serializeNoteFile(tree, { fileVersion: 2, schemaBundle: context.schemaBundle,
      ...(context.savedAt !== undefined ? { savedAt: context.savedAt } : {}) }); }
    catch (error) { throw new NativeNoteError('native_snapshot_unavailable', String(error)); }
    const read = readNoteSnapshotFile(serialized);
    if ('error' in read || !('fileVersion' in read)) throw new NativeNoteError('native_snapshot_unavailable');
    return read.document;
  };
  const result: NativeNoteSession = {
    editor: session.editor, session: session.session, get rootId() { return session.rootId; }, context,
    flush: () => session.flush(),
    close: () => { if (closed) return; try { session.close(); } finally { closed = true; } },
    exportNativeDocument,
    openChildResource: resourceId => {
      if (!current()) throw new NativeNoteError('native_context_changed');
      const resource = session.editor.dataStore.getNode(resourceId);
      if (resource?.stype !== 'richText') throw new NativeNoteError('native_snapshot_unavailable', 'Captured resource is missing');
      const body = noteNodeTreeOf(session.editor.dataStore, resourceId);
      if (!body || !Array.isArray(body.content)) throw new NativeNoteError('native_snapshot_unavailable');
      const child = openNoteTree({ stype: 'note', content: body.content }, { authority: session.editor, after: options.after,
        onChange: () => {} });
      const parentEpoch = session.editor.dataStore.getDocumentEpoch(), childEpoch = child.editor.dataStore.getDocumentEpoch();
      const childRoot = child.rootId;
      const lifetime = captureNoteChildIntent(child, session.editor);
      const resourceKey = resource.attributes?.id;
      const attached = () => {
        const seen = new Set<string>(); let id: string | undefined = resourceId;
        if (session.editor.dataStore.getNode(resourceId)?.attributes?.id !== resourceKey) return false;
        while (id && !seen.has(id)) {
          if (id === session.rootId) return true;
          seen.add(id); const node = session.editor.dataStore.getNode(id), parent = node?.parentId ? session.editor.dataStore.getNode(node.parentId) : undefined;
          if (!parent?.content?.includes(id)) return false;
          id = node?.parentId;
        }
        return false;
      };
      children.set(child, { resourceId, valid: () => current() && lifetime() && attached() && session.editor.dataStore.getDocumentEpoch() === parentEpoch
        && child.editor.dataStore.getDocumentEpoch() === childEpoch && child.rootId === childRoot });
      return child;
    },
    commitChildResource: async (resourceId, child) => {
      const binding = children.get(child), editor = session.editor, store = editor.dataStore;
      if (!binding || binding.resourceId !== resourceId || !binding.valid()) return false;
      const resource = store.getNode(resourceId), body = noteNodeTreeOf(child.editor.dataStore, child.rootId);
      if (resource?.stype !== 'richText' || !body || !Array.isArray(body.content)) return false;
      const prior = noteNodeTreeOf(store, resourceId);
      if (!prior) return false;
      const candidate = { ...prior, content: body.content };
      supported(candidate);
      const schema = store.getActiveSchema();
      if (!schema || validateTree(schema, candidate).length) throw new NativeNoteError('native_snapshot_unavailable', 'Child body is not valid in the captured trusted schema');
      // Validate the whole candidate and fixed pins before any operation. This is a
      // native session delivery, not a clipboard conversion between schema identities.
      const stagedTree = (id: string): Record<string, unknown> => {
        if (id === resourceId) return candidate;
        const value = noteNodeTreeOf(store, id), held = store.getNode(id);
        if (!value || !held) throw new NativeNoteError('native_snapshot_unavailable');
        if (Array.isArray(value.content)) value.content = (held.content ?? []).map(childId => {
          if (typeof childId !== 'string') throw new NativeNoteError('native_snapshot_unavailable');
          return stagedTree(childId);
        });
        return value;
      };
      serializeNoteFile(stagedTree(session.rootId), { fileVersion: 2, schemaBundle: context.schemaBundle,
        ...(context.savedAt !== undefined ? { savedAt: context.savedAt } : {}) });
      if (equal(prior.content, body.content)) return true;
      const revision = store.getEditRevision(), childRevision = child.editor.dataStore.getEditRevision();
      const intent = captureNoteChildIntent(child, editor);
      let started = false;
      const valid = () => binding.valid() && intent() && (started || store.getEditRevision() === revision)
        && child.editor.dataStore.getEditRevision() === childRevision && store.getNode(resourceId)?.stype === 'richText';
      const applied = await transaction(editor, [
        op(() => { if (store.getEditRevision() !== revision) throw new NativeNoteError('native_context_changed'); started = true; return { success: true }; }),
        ...(resource.content ?? []).map(childId => ({ type: 'removeChild', payload: { parentId: resourceId, childId } })),
        ...body.content.map(value => ({ type: 'addChild', payload: { parentId: resourceId, child: value } })),
        op(() => { rememberNoteNativeSource(store, candidate, resourceId, true, true); return { success: true }; })
      ], { validateIntent: () => valid() ? undefined : 'Captured native child delivery changed.', applySelectionToView: false }).commit();
      if (!applied.success || applied.committed !== true) throw new NativeNoteError('native_snapshot_unavailable', `Child transaction refused: ${JSON.stringify(applied.errors)}`);
      return true;
    },
    exportSnapshot: () => {
      const document = exportNativeDocument();
      // Byte reuse is allowed only AFTER the live materialized/exported tree passed whole native validation.
      if (equal(document, context.document)) return context.rawSnapshotText;
      return serializeNoteFile(document, { fileVersion: 2, schemaBundle: context.schemaBundle,
        ...(context.savedAt !== undefined ? { savedAt: context.savedAt } : {}) });
    }
  };
  const originalLoad = session.editor.loadDocument;
  session.editor.loadDocument = () => { throw new NativeNoteError('native_context_changed', 'Bare root replacement has no matching native context'); };
  const originalClose = result.close;
  result.close = () => {
    if (closed) return;
    // A failed local delivery must keep the latest materialized model available to its host.
    try { session.flush(); } catch (error) { session.editor.setEditable(false); throw error; }
    session.editor.loadDocument = originalLoad; originalClose();
  };
  return result;
}
