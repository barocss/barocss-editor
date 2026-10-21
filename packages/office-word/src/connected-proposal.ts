import type { Editor } from '@barocss/editor-core';
import { FragmentEditor, control, replaceText, setMarks, transaction } from '@barocss/model';
import type { ProductRevisionProposal, ProductRevisionPreview } from '@barocss/shared';
import { resolveCommentTarget } from './comments';
import { wordFileText, readWordFile } from './word-file';

/** One complete plain run with an existing native comment anchor. No text search or new original. */
export function previewConnectedWordRevision(options: {
  editor: Editor; proposal: ProductRevisionProposal; nativeDocument(): unknown; current(): boolean; afterCommitCurrent?(): boolean;
}): ProductRevisionPreview | null {
  const { editor, proposal } = options;
  const before = readWordFile(proposal.snapshotText), after = readWordFile(proposal.expectedSnapshotText);
  if ('error' in before || 'error' in after || !proposal.replacement.trim() || !options.current() || !editor.isEditable) return null;
  const native = () => wordFileText(options.nativeDocument(), '');
  const beforeText = wordFileText(before.document, ''), afterText = wordFileText(after.document, '');
  if (native() !== beforeText) return null;
  const found = resolveCommentTarget({ rootId: editor.getRootId()!, getNode: id => editor.dataStore.getNodes().get(id) }, proposal.targetId);
  if (found.status !== 'located' || found.anchors.length !== 1) return null;
  const node = editor.dataStore.getNodes().get(found.anchor.sid);
  const parent = node?.parentId ? editor.dataStore.getNodes().get(node.parentId) : undefined;
  const bookmark = parent?.content?.length === 2 && typeof parent.content[0] === 'string'
    ? editor.dataStore.getNodes().get(parent.content[0]) : undefined;
  const bookmarkId = bookmark?.stype === 'bookmarkAnchor' ? bookmark.attributes?.id : undefined;
  const pointBookmark = typeof bookmarkId === 'string' && !!bookmarkId &&
    Object.keys(bookmark?.attributes ?? {}).length === 1 && !bookmark?.text &&
    (!bookmark?.marks || bookmark.marks.length === 0) && (!bookmark?.content || bookmark.content.length === 0) &&
    parent?.content?.[1] === node?.sid &&
    [...editor.dataStore.getNodes().values()].filter(one => one.stype === 'bookmarkAnchor' && one.attributes?.id === bookmarkId).length === 1;
  const supportedChildren = parent?.content?.length === 1 && parent.content[0] === node?.sid || pointBookmark;
  if (!node || typeof node.text !== 'string' || found.anchor.start !== 0 || found.anchor.end !== node.text.length ||
    parent?.stype !== 'paragraph' || !supportedChildren || !Array.isArray(node.marks) ||
    node.marks.length !== 1 || node.marks[0].stype !== 'commentRef') return null;
  let ancestor = node;
  const seen = new Set<string>();
  while (ancestor.sid !== editor.getRootId()) {
    if (!ancestor.sid || seen.has(ancestor.sid) || ['resources', 'commentThread', 'contentControl'].includes(ancestor.stype) || ancestor.attributes?.locked === true) return null;
    seen.add(ancestor.sid);
    const next = ancestor.parentId ? editor.dataStore.getNodes().get(ancestor.parentId) : undefined;
    if (!next || !next.content?.includes(ancestor.sid)) return null;
    ancestor = next;
  }
  if (ancestor.attributes?.locked === true) return null;
  const editing = FragmentEditor.forEditor(editor);
  const checkpoint = editing.checkpoint();
  const fragment = structuredClone(editing.plainText(proposal.replacement, node.sid!, true));
  if (pointBookmark) {
    let originalRun: Record<string, unknown> | undefined, count = 0, exactBookmark = false;
    const findRun = (value: unknown, parent?: Record<string, unknown>): void => {
      if (!value || typeof value !== 'object') return;
      const one = value as Record<string, unknown>;
      if (Array.isArray(one.marks) && one.marks.some(mark => mark?.stype === 'commentRef' && mark.attrs?.id === proposal.targetId)) {
        originalRun = one; count++;
        const siblings = parent?.content;
        const anchor = Array.isArray(siblings) ? siblings[0] as Record<string, unknown> : undefined;
        const attrs = anchor?.attributes;
        exactBookmark = Array.isArray(siblings) && siblings.length === 2 && siblings[1] === one &&
          anchor?.stype === 'bookmarkAnchor' && Object.keys(anchor).every(key => ['stype', 'attributes'].includes(key)) &&
          !!attrs && typeof attrs === 'object' && !Array.isArray(attrs) &&
          Object.keys(attrs).length === 1 && (attrs as Record<string, unknown>).id === bookmarkId;
      }
      if (Array.isArray(one.content)) one.content.forEach(child => findRun(child, one));
    };
    findRun(before.document);
    if (count !== 1 || !exactBookmark || originalRun?.text !== node.text || !Array.isArray(originalRun.marks) || originalRun.marks.length !== 1) return null;
    if (Object.hasOwn(originalRun, 'attributes')) fragment.content[0].attributes = structuredClone(originalRun.attributes as Record<string, unknown>);
    else delete fragment.content[0].attributes;
  }
  fragment.content[0].marks = structuredClone(node.marks);
  fragment.content[0].marks![0].range = [0, proposal.replacement.length];
  // A child fragment edit creates a new run. Keep the exact point-bookmark
  // sibling and the authored run identity through the existing text transaction.
  const retainNativeRun = pointBookmark;
  const originalNode = retainNativeRun ? structuredClone(node) : undefined;
  const originalBookmark = retainNativeRun ? structuredClone(bookmark) : undefined;
  const expectedMarks = structuredClone(fragment.content[0].marks!);
  const expectedNativeRun = originalNode ? { ...originalNode, text: proposal.replacement, marks: expectedMarks } : undefined;
  const planTarget = { kind: 'text' as const, nodeId: node.sid!, from: 0, to: node.text.length };
  const decision = retainNativeRun ? null : editing.plan({ intent: 'copy', fragment, target: planTarget });
  if (decision && (!decision.ok || decision.plan.losses.length || decision.plan.outcome !== 'direct')) return null;
  // Verify the declared result independently from the supplied expected export.
  const expected = structuredClone(before.document) as Record<string, unknown>;
  let changed = 0;
  const walk = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const one = value as Record<string, unknown>;
    if (Array.isArray(one.marks) && one.marks.some(mark => mark?.stype === 'commentRef' && mark.attrs?.id === proposal.targetId)) {
      if (one.text !== node.text || one.marks.length !== 1) return;
      one.text = proposal.replacement;
      one.marks[0].range = [0, proposal.replacement.length]; changed++;
    }
    if (Array.isArray(one.content)) one.content.forEach(walk);
  };
  walk(expected);
  if (changed !== 1 || wordFileText(expected, '') !== afterText) return null;
  let retired = false;
  const selection = JSON.stringify(editor.selection);
  const retire = () => { retired = true; };
  const selectionChanged = () => { if (JSON.stringify(editor.selection) !== selection) retire(); };
  editor.on('editor:content.change', retire); editor.on('editor:editable.change', retire);
  editor.on('editor:selection.model', selectionChanged); editor.on('editor:selection.change', selectionChanged);
  const current = () => !retired && options.current() && editor.isEditable && native() === beforeText && editing.isCurrent(checkpoint);
  // The existing transaction samples this again after its own candidate writes.
  // Its materializer checks the frozen basis before writing. Only the exact
  // declared candidate may then pass; an unrelated edit cannot pass this guard.
  const intentCurrent = () => !retired && options.current() && editor.isEditable && [beforeText, afterText].includes(native());
  let authorizedBefore = false;
  const nativeTextIntent = () => {
    if (retired || !options.current() || !editor.isEditable) return 'The proposal context changed';
    const observed = native();
    if (observed === beforeText && editing.isCurrent(checkpoint)) {
      authorizedBefore = true;
      return;
    }
    if (!authorizedBefore || !editor.dataStore.isTransactionActive() || observed !== afterText) return 'The proposal context changed';
    const candidate = editor.dataStore.getNode(node.sid!);
    const anchor = editor.dataStore.getNode(bookmark!.sid!);
    const container = editor.dataStore.getNode(parent!.sid!);
    if (!candidate || JSON.stringify(candidate) !== JSON.stringify(expectedNativeRun) ||
      JSON.stringify(anchor) !== JSON.stringify(originalBookmark) ||
      container?.content?.length !== 2 || container.content[0] !== bookmark!.sid || container.content[1] !== node.sid) {
      return 'The native proposal changed';
    }
  };
  // The native plan also samples its full basis under the existing transaction lock.
  return {
    current,
    async apply() {
      if (!current()) return false;
      const result = retainNativeRun
        ? await transaction(editor, control(node.sid!, [
          replaceText(0, node.text!.length, proposal.replacement), setMarks(expectedMarks)
        ]), { validateIntent: nativeTextIntent }).commit()
        : await editing.apply(decision!.plan, { validateIntent: () => intentCurrent() ? undefined : 'The proposal context changed' });
      retired = true;
      // The owned committed render may move DOM selection. Only its postcommit
      // observation uses the dedicated guard; all precommit gates stay strict.
      if (result.committed !== true) return false;
      if (!result.success || result.postCommitErrors?.length || native() !== afterText ||
        !(options.afterCommitCurrent ? options.afterCommitCurrent() : options.current())) {
        throw new Error('The Word edit committed, but its current result cannot be confirmed. Keep the draft and inspect recovery.');
      }
      return true;
    },
    dispose() { retired = true; editor.off('editor:content.change', retire); editor.off('editor:editable.change', retire);
      editor.off('editor:selection.model', selectionChanged); editor.off('editor:selection.change', selectionChanged); }
  };
}
