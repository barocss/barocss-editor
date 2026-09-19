import { describe, it, expect } from 'vitest';
import { createWordEditor } from '../src/word-kit';
import { WORD_AUTHORING_ACTIONS, authoringKind, canAuthor, captureAuthoring, type WordAuthoringKind } from '../src/authoring-actions';

function setup() {
  const editor = createWordEditor();
  editor.loadDocument({ stype: 'document', content: [{ stype: 'surface', attributes: { kind: 'flow' }, content: [
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Words' }] }
  ] }] });
  let textId = '';
  const visit = (id: string) => { const node = editor.dataStore.getNode(id)!;
    if (node.text === 'Words') textId = id;
    for (const child of node.content ?? []) visit(child as string);
  };
  visit(editor.getRootId()!);
  const select = (end: number) => editor.updateSelection({ type: 'range', startNodeId: textId, endNodeId: textId, startOffset: 0, endOffset: end, collapsed: end === 0 });
  return { editor, select };
}

describe('Word authoring contracts', () => {
  it('uses registered commands with usable payloads over selected text', () => {
    const { editor, select } = setup(); select(5);
    for (const kind of Object.keys(WORD_AUTHORING_ACTIONS) as WordAuthoringKind[]) {
      expect(editor.commandNames()).toContain(WORD_AUTHORING_ACTIONS[kind].command);
      expect(canAuthor(editor, kind), kind).toBe(true);
    }
  });
  it('offers pictures at a caret and requires text for annotations', () => {
    const { editor, select } = setup(); select(0);
    expect(canAuthor(editor, 'image')).toBe(true);
    for (const kind of ['link', 'comment', 'footnote', 'endnote'] as const) expect(canAuthor(editor, kind)).toBe(false);
  });
  it('captures an independent target and rejects unrelated view identifiers', () => {
    const { editor, select } = setup(); select(5);
    const session = captureAuthoring(editor, 'link')!;
    select(0);
    expect(session.selection).toMatchObject({ startOffset: 0, endOffset: 5 });
    expect(authoringKind('authoring.link')).toBe('link');
    expect(authoringKind('link')).toBeUndefined();
    expect(authoringKind('authoring.constructor')).toBeUndefined();
  });
});
