import type { Editor, ModelSelection } from '@barocss/editor-core';
import type { ProductFeedbackHost, ProductFeedbackTarget } from '@barocss/shared';
import { commentIdentityInUse, resolveCommentTarget } from './comments';

export interface WordFeedbackOptions {
  editor: Editor;
  /** Canonical current document identity, supplied by its local or authenticated host. */
  id: () => string;
  canComment: () => boolean;
  /** Read the actual owned DOM selection before focus enters the composer. */
  captureSelection: () => ModelSelection | null | undefined;
  reading?: (value: boolean) => void;
}
export interface WordFeedbackHost extends ProductFeedbackHost { dispose(): void }

/** One actual inline run is the initial supported anchor. No quote-based reattachment. */
function textTarget(editor: Editor, selection: ModelSelection | null | undefined) {
  if (!selection || selection.type !== 'range' || selection.startNodeId !== selection.endNodeId ||
    !Number.isInteger(selection.startOffset) || !Number.isInteger(selection.endOffset) ||
    selection.startOffset < 0 || selection.endOffset <= selection.startOffset) return;
  const node = editor.dataStore.getNodes().get(selection.startNodeId);
  if (!node || node.stype !== 'inline-text' || typeof node.text !== 'string' || selection.endOffset > node.text.length) return;
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
  return { node, quote: node.text.slice(selection.startOffset, selection.endOffset) };
}

/** Native Word owns the capture and transaction. This adapter owns no persisted document copy. */
export function createWordFeedbackHost(options: WordFeedbackOptions): WordFeedbackHost {
  const { editor } = options, store = editor.dataStore;
  let disposed = false, generation = 0;
  let selectionBytes = JSON.stringify(editor.selection);
  const retire = () => { generation += 1; };
  const selectionChanged = () => {
    const current = JSON.stringify(editor.selection);
    if (current !== selectionBytes) { selectionBytes = current; retire(); }
  };
  editor.on('editor:content.change', retire); editor.on('editor:editable.change', retire);
  editor.on('editor:selection.model', selectionChanged); editor.on('editor:selection.change', selectionChanged);
  const doc = () => ({ rootId: editor.getRootId()!, getNode: (id: string) => store.getNodes().get(id) });
  const editable = () => !disposed && !!options.id() && editor.isEditable && options.canComment();
  const captures = new Map<string, {
    target: ProductFeedbackTarget; selection: ModelSelection; current: () => boolean; sameDocument: () => boolean;
    body?: string; pendingBody?: string; pending?: Promise<ProductFeedbackTarget>;
  }>();
  return {
    product: 'word', id: options.id, editable,
    capture() {
      if (!editable()) return null;
      const selection = options.captureSelection(), actual = textTarget(editor, selection);
      if (!selection || !actual) return null;
      const documentId = options.id(), rootId = editor.getRootId(), root = store.getNodes().get(rootId!), epoch = store.getDocumentEpoch(), session = store.getSessionId();
      const version = store.getVersion(), revision = generation, beforeSelection = JSON.stringify(editor.selection);
      const captured = structuredClone(selection);
      const bytes = JSON.stringify(actual.node);
      const id = crypto.randomUUID();
      if (commentIdentityInUse(doc(), id)) return null;
      const target: ProductFeedbackTarget = Object.freeze({ kind: 'word-comment', id, quote: actual.quote });
      const sameDocument = () => !disposed && options.id() === documentId && editor.getRootId() === rootId &&
        store.getDocumentEpoch() === epoch && store.getSessionId() === session && store.getNodes().get(rootId!) === root;
      captures.set(id, { target, selection: captured, sameDocument, current: () => sameDocument() && editable() && generation === revision &&
        store.getVersion() === version && JSON.stringify(editor.selection) === beforeSelection &&
        JSON.stringify(store.getNodes().get(captured.startNodeId)) === bytes && !!textTarget(editor, captured) });
      return target;
    },
    ownsCapture(target) {
      const capture = captures.get(target.id);
      return target.kind === 'word-comment' && !!capture && capture.target.quote === target.quote && capture.current();
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
      const { sid, start, end } = found.anchor;
      editor.updateSelection({ type: 'range', startNodeId: sid, endNodeId: sid, startOffset: start, endOffset: end, collapsed: false });
      return 'located';
    },
    reading(value) { if (!disposed) options.reading?.(value); },
    dispose() {
      disposed = true; captures.clear();
      editor.off('editor:content.change', retire); editor.off('editor:editable.change', retire);
      editor.off('editor:selection.model', selectionChanged); editor.off('editor:selection.change', selectionChanged);
    }
  };
}
