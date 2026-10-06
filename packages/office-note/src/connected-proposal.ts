import type { Editor, ModelSelection } from '@barocss/editor-core';
import { FragmentEditor } from '@barocss/model';
import type { NoteParagraphTarget, ProductRevisionProposal, ProductRevisionPreview } from '@barocss/shared';
import { readNoteV1SnapshotFile as readNoteSnapshotFile, serializeNoteFile, type NoteDocument } from './note-file-codec';

export interface NoteParagraphCapture {
  readonly target: NoteParagraphTarget;
  current(): boolean;
  preview(proposal: ProductRevisionProposal, owns?: () => boolean): ProductRevisionPreview | null;
  dispose(): void;
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  return Object.keys(left).length === Object.keys(right).length && Object.keys(left).every(key =>
    Object.hasOwn(right, key) && same(left[key], right[key]));
}
function original(text: string): NoteDocument | undefined {
  const read = readNoteSnapshotFile(text);
  if ('error' in read) return;
  // A reader may accept legacy normalized input. This operation never rewrites it.
  const raw = JSON.parse(text) as { document: unknown };
  return same(raw.document, read.document) ? read.document : undefined;
}

/** Same-live-session capability. It is never reconstructed from a persisted path or quote. */
export function captureNoteParagraph(options: {
  editor: Editor; rootId: string; snapshotText: string;
  capture: { selection: ModelSelection | null; isCurrent(): boolean };
  nativeDocument(): NoteDocument;
  /** Current host/account/role/root and prepared deepest input, excluding own committed selection. */
  current(): boolean;
}): NoteParagraphCapture | null {
  const { editor, capture, rootId } = options;
  const range = capture.selection, validated = original(options.snapshotText);
  const before = structuredClone(options.nativeDocument());
  if (!validated || !same(before, validated) || !before.attributes.pageId || !options.current() || !capture.isCurrent() || !editor.isEditable ||
    !same(options.nativeDocument(), before) || editor.getRootId() !== rootId || !range || range.type !== 'range' ||
    range.collapsed || range.startNodeId !== range.endNodeId) return null;
  const root = editor.dataStore.getNode(rootId), run = editor.dataStore.getNode(range.startNodeId);
  const paragraph = run?.parentId ? editor.dataStore.getNode(run.parentId) : undefined;
  const index = paragraph?.sid ? root?.content?.indexOf(paragraph.sid) ?? -1 : -1;
  if (root?.stype !== 'note' || root.attributes?.locked === true || paragraph?.stype !== 'paragraph' ||
    paragraph.parentId !== rootId || paragraph.attributes?.locked === true || paragraph.content?.length !== 1 ||
    paragraph.content[0] !== run?.sid || index < 0 || run?.stype !== 'inline-text' || !run.sid ||
    run.attributes?.locked === true || typeof run.text !== 'string' || !run.text.trim() || run.text.length > 8000 ||
    (run.marks !== undefined && (!Array.isArray(run.marks) || run.marks.length !== 0)) ||
    range.startOffset !== 0 || range.endOffset !== run.text.length) return null;
  const nativeParagraph = before.content[index] as { stype?: string; content?: Array<{ stype?: string; text?: string }> };
  if (nativeParagraph?.stype !== 'paragraph' || nativeParagraph.content?.length !== 1 ||
    nativeParagraph.content[0].stype !== 'inline-text' || nativeParagraph.content[0].text !== run.text) return null;
  const target: NoteParagraphTarget = Object.freeze({ kind: 'note-paragraph', id: crypto.randomUUID(), quote: run.text,
    selector: Object.freeze({ version: 1, pageId: before.attributes.pageId, paragraphIndex: index }) });
  const editing = FragmentEditor.forEditor(editor), checkpoint = editing.checkpoint();
  let retired = false;
  const retire = () => { retired = true; };
  const selectionChanged = () => { if (!same(editor.selection, range)) retire(); };
  editor.on('editor:content.change', retire); editor.on('editor:editable.change', retire);
  editor.on('editor:destroy', retire);
  editor.on('editor:selection.model', selectionChanged); editor.on('editor:selection.change', selectionChanged);
  const current = () => !retired && options.current() && capture.isCurrent() && editor.isEditable &&
    editing.isCurrent(checkpoint) && same(options.nativeDocument(), before);
  return {
    target, current,
    preview(proposal, owns = () => true) {
      if (!current() || !owns() || proposal.targetId !== target.id || proposal.snapshotText !== options.snapshotText ||
        typeof proposal.replacement !== 'string' || !proposal.replacement.trim() || proposal.replacement.length > 8000 ||
        [...proposal.replacement].some(char => char.charCodeAt(0) < 32 && char !== '\t')) return null;
      const after = original(proposal.expectedSnapshotText), expected = structuredClone(before);
      if (!after) return null;
      const expectedRun = (expected.content[index] as { content: { text: string }[] }).content[0];
      expectedRun.text = proposal.replacement;
      // Independently authored delta; the provider cannot change another native field.
      if (!same(after, expected) || proposal.expectedSnapshotText !== serializeNoteFile(expected)) return null;
      if (proposal.replacement === run.text) {
        let disposed = false;
        return { current: () => !disposed && owns() && current(),
          async apply() { disposed = true; return false; },
          dispose() { disposed = true; } };
      }
      const fragment = structuredClone(editing.plainText(proposal.replacement, run.sid!, true));
      if (run.marks !== undefined) fragment.content[0].marks = [];
      const decision = editing.plan({ intent: 'copy', fragment,
        target: { kind: 'text', nodeId: run.sid!, from: 0, to: run.text!.length } });
      if (!decision.ok || decision.plan.losses.length || decision.plan.outcome !== 'direct') return null;
      let disposed = false;
      const ready = () => !disposed && owns() && current();
      return {
        current: ready,
        async apply() {
          if (!ready()) return false;
          const result = await editing.apply(decision.plan, { validateIntent: () =>
            !disposed && !retired && owns() && options.current() && capture.isCurrent() && editor.isEditable &&
              (same(options.nativeDocument(), before) || same(options.nativeDocument(), expected))
              ? undefined : 'The Note proposal owner changed' });
          retired = true;
          // Own commit retires the selection capability. Root/account/input still must be current.
          return result.success && result.committed === true && owns() && options.current() &&
            same(options.nativeDocument(), expected);
        },
        dispose() { disposed = true; }
      };
    },
    dispose() {
      retired = true;
      editor.off('editor:content.change', retire); editor.off('editor:editable.change', retire);
      editor.off('editor:destroy', retire);
      editor.off('editor:selection.model', selectionChanged); editor.off('editor:selection.change', selectionChanged);
    }
  };
}
