import { watchAnswers, type Editor, type ModelSelection } from '@barocss/editor-core';

export type ParagraphPreview = { original: string; before: string; after: string; range: ModelSelection };
export type ParagraphPreviewState = 'empty' | 'ready' | 'stale' | 'rejected' | 'unavailable';

/** A read-only review target. Generations are local lifetimes, not durable document revisions. */
export function createParagraphProposalPreview(editor: Editor, changed: () => void = () => {}) {
  let generation = 0;
  let disposed = false;
  let preview: ParagraphPreview | undefined;
  let state: ParagraphPreviewState = 'empty';
  let owns = () => false;
  let captured: { root: string | undefined; session: string | number; generation: number; selection: string } | undefined;
  const retire = () => {
    generation++;
    if (preview && state !== 'rejected') state = 'stale';
    if (preview) changed();
  };
  const off = watchAnswers(editor, retire);
  editor.on('editor:destroy', retire);
  const signature = (range: ModelSelection | null | undefined) => range ? JSON.stringify([
    range.type, range.startNodeId, range.startOffset, range.endNodeId, range.endOffset, range.collapsed
  ]) : '';
  const textOf = (id: string): string => {
    const node = editor.dataStore.getNode(id);
    if (!node) return '';
    return typeof node.text === 'string' ? node.text : (node.content ?? []).map(child => textOf(String(child))).join('');
  };
  const make = (range: ModelSelection | undefined, owner: () => boolean): boolean => {
    if (disposed || !editor.isEditable || !owner() || !range || range.type !== 'range'
      || range.collapsed || signature(range) !== signature(editor.selection)
      || range.startNodeId !== range.endNodeId) { state = 'unavailable'; preview = undefined; changed(); return false; }
    const run = editor.dataStore.getNode(range.startNodeId);
    const paragraph = run?.parentId ? editor.dataStore.getNode(run.parentId) : undefined;
    if (run?.stype !== 'inline-text' || typeof run.text !== 'string' || paragraph?.stype !== 'paragraph'
      || paragraph.content?.length !== 1 || range.startOffset !== 0 || range.endOffset !== run.text.length
      || (run.marks?.length ?? 0) !== 0) { state = 'unavailable'; preview = undefined; changed(); return false; }
    const parent = paragraph.parentId ? editor.dataStore.getNode(paragraph.parentId) : undefined;
    if (parent?.stype !== 'surface' || parent.parentId !== editor.getRootId()) { state = 'unavailable'; preview = undefined; changed(); return false; }
    const siblings = (parent.content ?? []).map(String);
    const index = siblings.indexOf(paragraph.sid!);
    owns = owner;
    captured = { root: editor.getRootId(), session: editor.dataStore.getSessionId(), generation,
      selection: signature(range) };
    preview = { original: run.text, before: index > 0 ? textOf(siblings[index - 1]) : '',
      after: index < siblings.length - 1 ? textOf(siblings[index + 1]) : '', range: structuredClone(range) };
    state = 'ready'; changed(); return true;
  };
  const current = (): boolean => {
    if (disposed || !captured || state !== 'ready' || !editor.isEditable || !owns()
      || captured.root !== editor.getRootId() || captured.session !== editor.dataStore.getSessionId()
      || captured.generation !== generation || captured.selection !== signature(editor.selection)) {
      if (preview && state !== 'rejected') state = 'stale';
      return false;
    }
    return true;
  };
  return {
    make,
    async queue(range: ModelSelection | undefined, owner: () => boolean): Promise<boolean> {
      const at = generation, root = editor.getRootId(), session = editor.dataStore.getSessionId();
      await Promise.resolve();
      if (disposed || at !== generation || root !== editor.getRootId() || session !== editor.dataStore.getSessionId()) {
        state = 'stale'; changed(); return false;
      }
      return make(range, owner);
    },
    get preview() { return preview; },
    get state() { if (state === 'ready') current(); return state; },
    invalidate: retire,
    reject() { if (current()) state = 'rejected'; changed(); },
    // Deliberately no mutating command: exact native undo is unverified for the sample representation.
    apply(): false { current(); changed(); return false; },
    dispose() { disposed = true; generation++; if (preview) state = 'stale'; off(); editor.off('editor:destroy', retire); }
  };
}
