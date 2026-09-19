import { afterEach, expect, it } from 'vitest';
import { validateTree } from '@barocss/schema';
import { openNoteTree, type NoteSession } from '../src/session';

const sessions: NoteSession[] = [];
afterEach(() => { sessions.splice(0).forEach(session => session.close()); });
const text = (value: string) => ({ stype: 'inline-text', text: value, marks: [] });
const emoji = () => ({ stype: 'emoji', attributes: { unicode: '🙂' } });
const p = (content: unknown[]) => ({ stype: 'paragraph', content });
const semantic = (node: any): unknown => ({
  stype: node.stype, text: node.text, attributes: node.attributes ?? {}, marks: node.marks ?? [],
  ...(node.content ? { content: node.content.map(semantic) } : {})
});

for (const shape of ['same paragraph', 'joined paragraphs', 'calloutTitle', 'bSummary'] as const) {
  it(`removes only selected atoms in ${shape}, keeps a caret, and restores order on undo/redo`, async () => {
    const header = { stype: shape, content: [emoji(), text('AB'), emoji()] };
    const body = p([emoji(), text('CD'), emoji()]);
    const blocks = shape === 'same paragraph'
      ? [p([emoji(), text('AB'), emoji(), text('CD'), emoji()])]
      : shape === 'joined paragraphs'
        ? [p(header.content), body]
        : [{ stype: shape === 'calloutTitle' ? 'callout' : 'bDetails', content: [header, body, p([text('TAIL')])] }];
    const session = openNoteTree({ stype: 'note', content: blocks });
    sessions.push(session);
    const editor = session.editor;
    const run = (value: string) => [...editor.dataStore.getNodes().values()].find(node => node.text === value)!;
    const start = run('AB').sid!, end = run('CD').sid!;
    const before = semantic(editor.exportDocument());
    editor.setRange({ type: 'range', startNodeId: start, startOffset: 1, endNodeId: end, endOffset: 1, collapsed: false });
    expect(await editor.executeCommand('backspace')).toBe(true);
    const after = semantic(editor.exportDocument());
    expect(validateTree(editor.dataStore.getActiveSchema()!, editor.exportDocument())).toEqual([]);
    expect(JSON.stringify(after).match(/🙂/g)).toHaveLength(2);
    expect(editor.selection).toMatchObject({ startNodeId: start, startOffset: 1, endNodeId: start, endOffset: 1, collapsed: true });
    expect(editor.dataStore.getNode(start)?.text).toBe('A');
    expect(editor.dataStore.getNode(end)?.text).toBe('D');
    if (shape === 'calloutTitle' || shape === 'bSummary') {
      expect(editor.dataStore.getNode(start)?.parentId).not.toBe(editor.dataStore.getNode(end)?.parentId);
      expect(run('TAIL')).toBeDefined();
    }
    expect(await editor.undo()).toBe(true);
    expect(semantic(editor.exportDocument())).toEqual(before);
    expect(await editor.redo()).toBe(true);
    expect(semantic(editor.exportDocument())).toEqual(after);
    expect(editor.selection?.collapsed).toBe(true);
  });
}

it('typing over an inline atom range removes the atom in the same undo group', async () => {
  const session = openNoteTree({ stype: 'note', content: [p([text('AB'), emoji(), text('CD')])] });
  sessions.push(session);
  const editor = session.editor;
  const runs = [...editor.dataStore.getNodes().values()].filter(node => typeof node.text === 'string');
  const before = semantic(editor.exportDocument());
  editor.setRange({ type: 'range', startNodeId: runs[0].sid, startOffset: 1, endNodeId: runs[1].sid, endOffset: 1, collapsed: false });
  expect(await editor.executeCommand('replaceText', { range: editor.selection, text: 'X' })).toBe(true);
  expect(JSON.stringify(editor.exportDocument())).not.toContain('🙂');
  expect(editor.selection?.collapsed).toBe(true);
  expect(await editor.undo()).toBe(true);
  expect(semantic(editor.exportDocument())).toEqual(before);
});
