import type { Editor, ModelSelection } from '@barocss/editor-core';
import type { ProductFeedbackHost, ProductFeedbackTarget } from '@barocss/shared';
import { collectCommentRange, commentIdentityInUse, resolveCommentTarget } from './comments';
import { previewConnectedWordRevision } from './connected-proposal';

export interface WordFeedbackOptions {
  editor: Editor;
  /** Canonical current document identity, supplied by its local or authenticated host. */
  id: () => string;
  canComment: () => boolean;
  /** Read the actual owned DOM selection before focus enters the composer. */
  captureSelection: () => ModelSelection | null | undefined;
  reading?: (value: boolean) => void;
  nativeDocument?: () => unknown;
  captureInputIntent?: () => (() => boolean) | null;
  /** Comments permit their one owned command and composer focus, but retire native input/gestures. */
  captureCommentIntent?: () => (() => boolean) | null;
  /** Revision approval also binds raw DOM selection before its model debounce. */
  captureRevisionIntent?: () => ((committed?: boolean) => boolean) | null;
}
export interface WordFeedbackHost extends ProductFeedbackHost { dispose(): void }

/** A native range owns every covered run; a displayed quote cannot retarget it. */
function textTarget(editor: Editor, selection: ModelSelection | null | undefined) {
  const range = collectCommentRange({ rootId: editor.getRootId()!, getNode: id => editor.dataStore.getNodes().get(id) }, selection);
  if (!range) return;
  const nodes = range.anchors.map(anchor => editor.dataStore.getNodes().get(anchor.sid)!);
  for (const node of nodes) {
    let current = node;
    const seen = new Set<string>();
    while (current.sid !== editor.getRootId()) {
      if (!current.sid || seen.has(current.sid) || ['resources', 'commentThread', 'contentControl'].includes(current.stype) || current.attributes?.locked === true) return;
      seen.add(current.sid);
      const parent = current.parentId ? editor.dataStore.getNodes().get(current.parentId) : undefined;
      if (!parent || !parent.content?.includes(current.sid)) return;
      current = parent;
    }
    if (current.attributes?.locked === true) return;
  }
  return { ...range, nodes };
}

/** Native Word owns the capture and transaction. This adapter owns no persisted document copy. */
export function createWordFeedbackHost(options: WordFeedbackOptions): WordFeedbackHost {
  const { editor } = options, store = editor.dataStore;
  let disposed = false, generation = 0;
  let selectionBytes = JSON.stringify(editor.selection);
  const sameRange = (left: ModelSelection | null | undefined, right: ModelSelection) => !!left && left.type === 'range' && right.type === 'range' &&
    left.startNodeId === right.startNodeId && left.endNodeId === right.endNodeId && left.startOffset === right.startOffset && left.endOffset === right.endOffset;
  let settling: { range: ModelSelection; before: string; changed: boolean; invalid: boolean } | undefined;
  const retire = () => { generation += 1; if (settling) settling.invalid = true; };
  const selectionChanged = () => {
    const current = JSON.stringify(editor.selection);
    if (current !== selectionBytes) {
      if (settling) {
        if (settling.changed || selectionBytes !== settling.before || !sameRange(editor.selection, settling.range)) settling.invalid = true;
        settling.changed = true;
      }
      selectionBytes = current; generation += 1;
    }
  };
  editor.on('editor:content.change', retire); editor.on('editor:editable.change', retire);
  editor.on('editor:selection.model', selectionChanged); editor.on('editor:selection.change', selectionChanged);
  const doc = () => ({ rootId: editor.getRootId()!, getNode: (id: string) => store.getNodes().get(id) });
  const editable = () => !disposed && !!options.id() && editor.isEditable && options.canComment();
  const captures = new Map<string, {
    target: ProductFeedbackTarget; selection: ModelSelection; current: () => boolean; sameDocument: () => boolean;
    excerpt: { text: string; bold?: boolean; italic?: boolean; underline?: boolean; link?: boolean }[];
    body?: string; pendingBody?: string; pending?: Promise<ProductFeedbackTarget>;
  }>();
  return {
    product: 'word', id: options.id, editable,
    capture() {
      if (!editable() || settling) return null;
      const rawSelection = options.captureSelection(), actual = textTarget(editor, rawSelection);
      if (!rawSelection || !actual) return null;
      const first = actual.anchors[0], last = actual.anchors[actual.anchors.length - 1];
      const selection: ModelSelection = { ...rawSelection, startNodeId: first.sid, startOffset: first.start,
        endNodeId: last.sid, endOffset: last.end, collapsed: false };
      const documentId = options.id(), rootId = editor.getRootId(), root = store.getNodes().get(rootId!), epoch = store.getDocumentEpoch(), session = store.getSessionId();
      const beforeVersion = store.getVersion();
      // The DOM owns this gesture. Settle its model range before taking the
      // intent snapshot; a later identical selectionchange must not retire it.
      // Do not restore focus or recapture after an asynchronous operation.
      const synchronization = { range: selection, before: JSON.stringify(editor.selection), changed: false, invalid: false };
      settling = synchronization;
      try { editor.updateSelection({ selection, applySelectionToView: false }); } finally { settling = undefined; }
      const settled = editor.selection;
      if (synchronization.invalid || store.getVersion() !== beforeVersion || !editable() || options.id() !== documentId || editor.getRootId() !== rootId ||
        store.getNodes().get(rootId!) !== root || store.getDocumentEpoch() !== epoch || store.getSessionId() !== session ||
        !sameRange(settled, selection)) return null;
      const version = store.getVersion(), revision = generation, beforeSelection = JSON.stringify(editor.selection);
      const inputCurrent = options.captureCommentIntent?.();
      if (options.captureCommentIntent && !inputCurrent) return null;
      const captured = structuredClone(selection);
      const bytes = JSON.stringify(actual.nodes);
      const id = crypto.randomUUID();
      if (commentIdentityInUse(doc(), id)) return null;
      const target: ProductFeedbackTarget = Object.freeze({ kind: 'word-comment', id, quote: actual.quote });
      const sameDocument = () => !disposed && options.id() === documentId && editor.getRootId() === rootId &&
        store.getDocumentEpoch() === epoch && store.getSessionId() === session && store.getNodes().get(rootId!) === root;
      const excerpt = actual.anchors.flatMap((anchor, index) => {
        const node = actual.nodes[index], marks = node.marks ?? [];
        const boundaries = [...new Set([anchor.start, anchor.end, ...marks.flatMap(mark => mark.range ?? [])
          .filter(offset => offset > anchor.start && offset < anchor.end)])].sort((left, right) => left - right);
        return boundaries.slice(0, -1).map((start, part) => {
          const end = boundaries[part + 1];
          const has = (stype: string) => marks.some(mark => mark.stype === stype && (!mark.range || mark.range[0] <= start && mark.range[1] >= end));
          return { text: node.text!.slice(start, end), bold: has('bold'), italic: has('italic'), underline: has('underline'), link: has('link') };
        });
      });
      captures.set(id, { target, selection: captured, sameDocument, excerpt, current: () => sameDocument() && editable() && (!inputCurrent || inputCurrent()) && generation === revision &&
        store.getVersion() === version && JSON.stringify(editor.selection) === beforeSelection &&
        JSON.stringify(textTarget(editor, captured)?.nodes) === bytes });
      return target;
    },
    ownsCapture(target) {
      const capture = captures.get(target.id);
      return target.kind === 'word-comment' && !!capture && capture.target.quote === target.quote && capture.current();
    },
    excerpt(target) {
      const capture = captures.get(target.id);
      return target.kind === 'word-comment' && capture?.target.quote === target.quote ? structuredClone(capture.excerpt) : [];
    },
    async comment(target, body) {
      const capture = captures.get(target.id);
      if (target.kind !== 'word-comment' || !capture || target.quote !== capture.target.quote || !body.trim() || !editable() || !capture.sameDocument())
        throw new Error('The captured Word comment is unavailable. Select its text again.');
      if (capture.pending) {
        if (capture.pendingBody !== body) throw new Error('Another comment is still being applied. Keep the latest draft.');
        return capture.pending;
      }
      if (capture.body !== undefined) {
        const existing = resolveCommentTarget(doc(), target.id);
        if (capture.body === body && existing.status === 'located' && existing.thread.entries[0]?.text === body) return capture.target;
        throw new Error('The native comment changed. Keep this draft and review the existing thread.');
      }
      if (!capture.current()) throw new Error('The Word selection, document or permission changed. Select its text again.');
      const pending = (async () => {
        const accepted = await editor.run('insertComment', { id: target.id, selection: capture.selection, text: body, canApply: capture.current });
        if (!accepted) throw new Error('The Word comment was not applied. The draft has been kept.');
        capture.body = body;
        return capture.target;
      })();
      capture.pending = pending; capture.pendingBody = body;
      try { return await pending; } finally { capture.pending = undefined; capture.pendingBody = undefined; }
    },
    locate(target) {
      if (disposed || !options.id() || target.kind !== 'word-comment') return 'missing';
      const found = resolveCommentTarget(doc(), target.id);
      if (found.status !== 'located') return found.status;
      const first = found.anchors[0], last = found.anchors[found.anchors.length - 1];
      editor.updateSelection({ type: 'range', startNodeId: first.sid, endNodeId: last.sid, startOffset: first.start, endOffset: last.end, collapsed: false });
      return 'located';
    },
    reading(value) { if (!disposed) options.reading?.(value); },
    previewRevision(proposal, owns = () => true) {
      if (!editable() || !options.nativeDocument) return null;
      const revisionCurrent = options.captureRevisionIntent?.();
      const inputCurrent = options.captureRevisionIntent ? revisionCurrent : options.captureInputIntent?.();
      if ((options.captureRevisionIntent || options.captureInputIntent) && !inputCurrent) return null;
      const documentId = options.id(), rootId = editor.getRootId(), root = store.getNodes().get(rootId!),
        epoch = store.getDocumentEpoch(), session = store.getSessionId();
      return previewConnectedWordRevision({ editor, proposal, nativeDocument: options.nativeDocument,
        current: () => owns() && (!inputCurrent || inputCurrent()) && editable() && options.id() === documentId && editor.getRootId() === rootId &&
          store.getNodes().get(rootId!) === root && store.getDocumentEpoch() === epoch && store.getSessionId() === session,
        afterCommitCurrent: () => owns() && (!inputCurrent || (revisionCurrent ? revisionCurrent(true) : inputCurrent())) && editable() &&
          options.id() === documentId && editor.getRootId() === rootId && store.getNodes().get(rootId!) === root &&
          store.getDocumentEpoch() === epoch && store.getSessionId() === session });
    },
    dispose() {
      disposed = true; captures.clear();
      editor.off('editor:content.change', retire); editor.off('editor:editable.change', retire);
      editor.off('editor:selection.model', selectionChanged); editor.off('editor:selection.change', selectionChanged);
    }
  };
}
