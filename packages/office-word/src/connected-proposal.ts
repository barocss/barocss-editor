import type { Editor } from '@barocss/editor-core';
import { FragmentEditor } from '@barocss/model';
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
  if (!node || typeof node.text !== 'string' || found.anchor.start !== 0 || found.anchor.end !== node.text.length ||
    parent?.stype !== 'paragraph' || parent.content?.length !== 1 || !Array.isArray(node.marks) ||
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
  fragment.content[0].marks = structuredClone(node.marks);
  fragment.content[0].marks![0].range = [0, proposal.replacement.length];
  const decision = editing.plan({ intent: 'copy', fragment, target: { kind: 'text', nodeId: node.sid!, from: 0, to: node.text.length } });
  if (!decision.ok || decision.plan.losses.length || decision.plan.outcome !== 'direct') return null;
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
  // The native plan also samples its full basis under the existing transaction lock.
  return {
    current,
    async apply() {
      if (!current()) return false;
      const result = await editing.apply(decision.plan, { validateIntent: () => intentCurrent() ? undefined : 'The proposal context changed' });
      retired = true;
      // The owned committed render may move DOM selection. Only its postcommit
      // observation uses the dedicated guard; all precommit gates stay strict.
      return result.success && result.committed === true && native() === afterText &&
        (options.afterCommitCurrent ? options.afterCommitCurrent() : options.current());
    },
    dispose() { retired = true; editor.off('editor:content.change', retire); editor.off('editor:editable.change', retire);
      editor.off('editor:selection.model', selectionChanged); editor.off('editor:selection.change', selectionChanged); }
  };
}
