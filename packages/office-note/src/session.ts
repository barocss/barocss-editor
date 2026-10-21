import { normalizeProseTree } from '@barocss/office-text';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import type { Editor } from '@barocss/editor-core';
import { createNoteEditor } from './note-kit';
import { registerTransactionIntentGuardFactory } from '@barocss/model';
import { getNoteSchemaDefinition } from './note-schema';

/** What a store hands back, and all this needs of one. */
type Node = { stype?: unknown; text?: unknown; attributes?: Record<string, unknown>; content?: unknown[]; marks?: unknown[]; metadata?: Record<string, unknown> };
const nativeRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
function nativeField(value: unknown, key: string): unknown {
  if (!nativeRecord(value) || !Object.hasOwn(value, key)) throw new Error('The native Note lost an authored field.');
  return value[key];
}

/** The existing mark operation emits an optional attrs key even when absent.
 * Omit only that known engine omission for admitted native marks. Every other
 * field and invalid value remains visible to the strict whole-file validator.
 */
function nativeNoteMarks(marks: unknown[]): unknown[] {
  return marks.map(mark => {
    const copy: unknown = structuredClone(mark);
    if (nativeRecord(copy) && ['bold', 'italic', 'underline', 'strike'].includes(String(copy.stype)) &&
        Object.hasOwn(copy, 'attrs') && copy.attrs === undefined) delete copy.attrs;
    return copy;
  });
}

type Access = { getNode: (sid: string) => Node | undefined };

/**
 * **독립된 에디팅 상태** — a note's own store, its own schema and its own history.
 *
 * ## The bug this is the fix for, not a refactor
 *
 * A body was edited by a second **view** over the host's editor. One editor means one selection, and
 * a selection is applied by *every* view: the site's boards were told the caret is at `site:597`, a
 * node they do not draw, so they searched their own DOM for it and gave up out loud —
 * `[EditorViewDOM] selection retry exceeded` on every click into a body. Read exactly right from the
 * outside: *난 분명 office-note 를 드래그 했는데 office-site 의 editor 가 selection 을 넣는 느낌이야.*
 *
 * Two editors over one store is not the answer and was measured: `Editor`'s constructor makes an
 * empty document and **writes it into the store it was given**, so the second one erases the first.
 *
 * So: a store of its own, loaded with a copy of the body.
 *
 * ## And then the copy has to go back
 *
 * Which is the price, and it is worth naming rather than hiding. The site keeps a body as nodes in
 * its own document — that is what lets a card draw one, the reference index see it and the orphan
 * check work — so a session that edits a copy has to write the copy home.
 *
 * `mirror` is that, on an idle delay rather than per keystroke: a designer watching a card wants it
 * to follow, and a subtree replaced on every character is a transaction per character in the host's
 * history. A pause is when the card catches up.
 */
export interface NoteSession {
  /** The editor to hand `NoteEditor` — its own selection, its own history. */
  editor: Editor;
  /** What every sid in this body is prefixed with — see `NoteOptions.session`. */
  session: string;
  /** Current body root, including after the host loads a restored document. */
  rootId: string;
  /** Deliver pending changes without closing the editor; the host awaits its own storage work. */
  flush: () => void;
  /** Deliver pending changes synchronously, then release the editor. Safe to call again. */
  close: () => void;
}

/**
 * The body's blocks as a plain tree — what crosses between the two documents.
 *
 * **Without sids.** A sid belongs to the store that minted it, and carrying one across would make
 * two documents claim the same node. The stypes, the attributes, the text and the marks are the
 * shared vocabulary; the identity is not.
 */
export function noteNodeTreeOf(doc: Access, sid: string): Record<string, unknown> | undefined {
  const node = doc.getNode(sid);
  if (!node) return undefined;

  const shapes = nativeSources.get(doc);
  const copy = (one: Node & { sid?: unknown }): Record<string, unknown> => {
    const shape = (typeof one.sid === 'string' ? shapes?.get(one.sid) : undefined)
      ?? (one.metadata ? metadataSources.get(one.metadata) : undefined);
    const metadata = one.metadata ? structuredClone(one.metadata) : undefined;
    if (metadata && shape && metadata.loadedAt === shape.loadedAt) {
      if (shape.metadata && Object.hasOwn(shape.metadata, 'loadedAt')) metadata.loadedAt = shape.metadata.loadedAt;
      else delete metadata.loadedAt;
    }
    const attributes = one.attributes ? structuredClone(one.attributes) : undefined;
    const children = ((one.content ?? []) as unknown[]).map(child => {
      if (typeof child !== 'string' || !doc.getNode(child)) throw new Error('The note body has missing content.');
      return copy(doc.getNode(child)!);
    });
    const extras: Record<string, unknown> = {};
    if (shape?.native) for (const key of shape.extraKeys) {
      extras[key] = structuredClone(nativeField(one, key));
    }
    const nativeMetadata = (shape?.native && shape.metadataNull || !shape && !!shapes && one.metadata === null) && (!metadata || !Object.keys(metadata).length)
      ? { metadata: null } : metadata && (shape?.hasMetadata || Object.keys(metadata).length) ? { metadata } : {};
    return {
      ...extras,
      stype: one.stype,
      ...(one.text !== undefined ? { text: one.text } : {}),
      ...(attributes && (shape?.hasAttributes !== false || Object.keys(attributes).length) ? { attributes } : {}),
      ...(one.marks && (!shape?.native || shape.hasMarks || one.marks.length) ? { marks: shape?.native || !shape && !!shapes ? nativeNoteMarks(one.marks) : structuredClone(one.marks) } : {}),
      ...nativeMetadata,
      ...(children.length || shape?.hasContent || (!shape && Array.isArray(one.content)) ? { content: children } : {})
    };
  };

  return copy(node);
}

export function noteTreeOf(doc: Access, sid: string): Record<string, unknown> | undefined {
  const body = noteNodeTreeOf(doc, sid);
  return body ? { stype: 'note', content: body.content ?? [] } : undefined;
}

/**
 * Open a body in a session of its own.
 *
 * `from` is the host's document and `sid` the node whose children are the body. What comes back is
 * an editor a `NoteEditor` can be handed, and a `close` the host calls when the surface goes.
 */
export function openNote(
  from: Access,
  sid: string,
  options: NoteOptions = {}
): NoteSession {
  const tree = noteTreeOf(from, sid);
  if (!tree) throw new Error('The note body no longer exists.');
  return start(tree, options);
}

/**
 * Open a body a host already has **as a tree** — the other kind of host.
 *
 * `openNote` reads out of a store, because a site keeps a body as nodes in its own document. A CMS
 * keeps one as a row in a database and hands over what it parsed; an app testing this package hands
 * over a literal. Neither has sids to walk, and `noteTreeOf` walks sids — so the first thing written
 * against this package from outside drew an **empty body**, silently, because every child was
 * filtered out as *not a string*.
 *
 * Found by `apps/note` on its first run, which is what that app is for.
 */
export function openNoteTree(tree: unknown, options: NoteOptions = {}): NoteSession {
  return start(tree, options);
}

interface NoteOptions {
  /** Explicit native2 factory/descendant control, never inferred from a file attribute. */
  nativeSource?: boolean;
  /** The current authority of the owning document. Child history and input share this lifetime. */
  authority?: Editor;
  /**
   * **이 노트의 이름** — what every sid in it is prefixed with.
   *
   * A sid is `${session}:${n}`, and the session used to be the word `note` for every body on the
   * page. Twelve notes therefore all minted `note:1`, `note:2` … and only a **static** counter in
   * `DataStore` kept them apart — which worked within one page and not between two. A body saved
   * from one page load and a body saved from another both start near `note:1`, so a host holding
   * both — a site with two bodies in `resources`, a CMS with a list of posts — has two different
   * nodes under one name.
   *
   * Reported as *sid 가 가장 큰 문제인데, instance 별로 달라야해*, and measured on this app: seven of
   * twelve sessions shared a root id, because that one was `doc-${Date.now()}`.
   *
   * Minted when not given. **Given** is better when the host has a durable name for this body — a
   * post's id, a row's key — because then the sids are the same every time it is opened, which is
   * what makes a comment, a bookmark or a diff able to point into one.
   */
  session?: string;
    /**
     * Write the body home on a pause, or synchronously on close if changes are pending.
     * This delivers a snapshot; durable storage remains the host's responsibility.
     *
     * A callback rather than this package writing into the host's store: whose document that is, and
     * what a transaction there costs, is the host's business. `office-note` knows about a body.
     */
    onChange?: (blocks: unknown[]) => void;
  /** How long a pause is, in milliseconds. */
  after?: number;
}

function start(tree: unknown, options: NoteOptions): NoteSession {
  const nativeSource = options.nativeSource === true || !!options.authority && nativeEditors.has(options.authority);
  const schema = createSchema('note', getNoteSchemaDefinition({ literalStrike: nativeSource }));
  const store = new DataStore(undefined as never, schema as never);
  const editor = createNoteEditor({ dataStore: store, schema, editable: options.authority?.isEditable ?? !nativeSource, strikeMark: nativeSource ? 'strike' : 'strikethrough' });
  if (nativeSource) nativeEditors.add(editor);

  /* One name per body — see `NoteOptions.session` for what sharing one costs. */
  const session = options.session ?? DataStore.mintSessionId('note');
  const load = editor.loadDocument.bind(editor);
  editor.loadDocument = (document, namedSession) => {
    const source = nativeSource ? structuredClone(document) : document;
    load(document, namedSession);
    rememberNoteNativeSource(store, source, editor.getRootId()!, nativeSource);
  };
  editor.loadDocument(nativeSource ? structuredClone(tree) : normalizeProseTree(tree), session);

  /* Always a string after `loadDocument` — the engine types it optional for a store with no root. */
  const rootId = editor.getRootId() ?? '';

  let timer: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;
  let pendingIntent: (() => boolean) | undefined;
  let closed = false;
  const authority = options.authority;
  const parentEpoch = authority?.dataStore.getDocumentEpoch();
  const parentRoot = authority?.getRootId();
  const parentSession = authority?.dataStore.getSessionId();
  let generation = 0;
  let parentGeneration = 0, parentEditable = authority?.isEditable;
  let lastEditable = editor.isEditable;
  const currentParent = () => !authority || (authority.dataStore.getDocumentEpoch() === parentEpoch
    && authority.getRootId() === parentRoot && authority.dataStore.getSessionId() === parentSession);
  const allowed = () => !closed && editor.isEditable && currentParent() && (!authority || authority.isEditable);
  const ownEditable = () => { if (editor.isEditable !== lastEditable) { lastEditable = editor.isEditable; generation++; } };
  const syncAuthority = () => {
    if (authority?.isEditable !== parentEditable) { parentEditable = authority?.isEditable; parentGeneration++; }
    const editable = !closed && currentParent() && !!authority?.isEditable;
    if (editor.isEditable !== editable) editor.setEditable(editable);
  };
  editor.on('editor:editable.change', ownEditable);
  if (authority) {
    noteParents.set(editor, authority);
    authority.on('editor:editable.change', syncAuthority);
    authority.on('editor:content.change', syncAuthority);
  }
  const capture = () => {
    const at = generation, epoch = editor.dataStore.getDocumentEpoch();
    return () => allowed() && generation === at && editor.dataStore.getDocumentEpoch() === epoch;
  };
  noteIntents.set(editor, capture);
  const removeIntent = registerTransactionIntentGuardFactory(editor, () => {
    const valid = capture();
    return () => valid() ? undefined : 'The note authority or document changed.';
  });
  const flush = () => {
    if (!dirty) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (nativeSource && pendingIntent && !pendingIntent()) throw new Error('The pending native Note authority changed.');
    dirty = false;
    const doc = store;
    // A host history restore may have loaded a new root into this same editor.
    const said = noteTreeOf(doc, editor.getRootId() ?? rootId);
    try { options.onChange?.((said?.content as unknown[]) ?? []); }
    catch (error) { if (!closed) dirty = true; throw error; }
  };
  const told = () => {
    if (closed) return;
    notifyNotePending(editor);
    if (!options.onChange) return;
    dirty = true;
    const parentAt = parentGeneration, documentAt = store.getDocumentEpoch();
    pendingIntent = () => currentParent() && parentGeneration === parentAt && store.getDocumentEpoch() === documentAt;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(flush, options.after ?? 350);
  };

  editor.on('editor:content.change' as never, told);

  return {
    editor,
    session,
    get rootId() { return editor.getRootId() ?? rootId; },
    flush,
    close: () => {
      if (closed) return;
      if (nativeSource) flush();
      closed = true;
      editor.off('editor:content.change' as never, told);
      try {
        flush();
      } finally {
        editor.setEditable(false);
        authority?.off('editor:editable.change', syncAuthority);
        authority?.off('editor:content.change', syncAuthority);
        editor.off('editor:editable.change', ownEditable);
        removeIntent(); noteIntents.delete(editor); noteParents.delete(editor); nativeSources.delete(store); nativeEditors.delete(editor);
        editor.destroy();
      }
    }
  };
}

const noteIntents = new WeakMap<Editor, () => () => boolean>();
/** Internal local lifetime check; file context never supplies this relationship. */
export function captureNoteChildIntent(child: NoteSession, parent: Editor): () => boolean {
  if (noteParents.get(child.editor) !== parent || !nativeEditors.has(child.editor)) return () => false;
  return noteIntents.get(child.editor)?.() ?? (() => false);
}
const noteParents = new WeakMap<Editor, Editor>();
const nativeEditors = new WeakSet<Editor>();
/** Explicit factory identity, never a document attribute or an authority grant. */
export function isNative2NoteEditor(editor: Editor): boolean { return nativeEditors.has(editor); }
const pendingObservers = new WeakMap<Editor, Set<() => void>>();
/** Immediate dirty-input signal, bubbled to each owning editor. Successful flush settles separately. */
export function observeNoteSessionChanges(editor: Editor, changed: () => void): () => void {
  let listeners = pendingObservers.get(editor);
  if (!listeners) { listeners = new Set(); pendingObservers.set(editor, listeners); }
  listeners.add(changed);
  return () => { listeners.delete(changed); if (!listeners.size) pendingObservers.delete(editor); };
}
function notifyNotePending(editor: Editor): void {
  const visited = new Set<Editor>();
  for (let owner: Editor | undefined = editor; owner && !visited.has(owner); owner = noteParents.get(owner)) {
    visited.add(owner); pendingObservers.get(owner)?.forEach(changed => changed());
  }
}

interface NativeNoteShape {
  metadata?: Record<string, unknown>; loadedAt: unknown;
  hasMetadata: boolean; hasAttributes: boolean; hasContent: boolean;
  native: boolean; metadataNull: boolean; hasMarks: boolean; extraKeys: string[];
}
const nativeSources = new WeakMap<Access, Map<string, NativeNoteShape>>();
const metadataSources = new WeakMap<object, NativeNoteShape>();
/** Remember source shape without writing to the model. Used by hosts with exact native snapshots. */
export function rememberNoteNativeSource(store: Access, document: unknown, rootId: string, native = false, append = false): void {
  const shapes = append ? nativeSources.get(store) ?? new Map<string, NativeNoteShape>() : new Map<string, NativeNoteShape>();
  const walk = (value: unknown, sid: string) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const source = value as Record<string, unknown>, held = store.getNode(sid);
    if (!held) return;
    shapes.set(sid, { metadata: source.metadata as Record<string, unknown> | undefined, loadedAt: held.metadata?.loadedAt,
      hasMetadata: Object.hasOwn(source, 'metadata'), hasAttributes: Object.hasOwn(source, 'attributes'), hasContent: Object.hasOwn(source, 'content'),
      native, metadataNull: source.metadata === null, hasMarks: Object.hasOwn(source, 'marks'),
      extraKeys: native ? Object.keys(source).filter(key => !['stype', 'text', 'attributes', 'content', 'marks', 'metadata'].includes(key)) : [] });
    if (held.metadata) metadataSources.set(held.metadata, shapes.get(sid)!);
    if (Array.isArray(source.content)) source.content.forEach((child, index) => {
      const id = held.content?.[index]; if (typeof id === 'string') walk(child, id);
    });
  };
  walk(document, rootId); nativeSources.set(store, shapes);
}

/** Whether this host supplied a native source, rather than relying on legacy prose transport. */
export function hasNoteNativeSource(store: Access): boolean { return nativeSources.has(store); }
