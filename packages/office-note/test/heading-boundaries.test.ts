import { afterEach, expect, it } from 'vitest';
import { validateTree } from '@barocss/schema';
import { openNoteTree, type NoteSession } from '../src/session';

const sessions: NoteSession[] = [];
afterEach(() => sessions.splice(0).forEach(session => session.close()));
const text = (value: string) => ({ stype: 'inline-text', text: value, marks: [] });
const paragraph = (value: string) => ({ stype: 'paragraph', content: [text(value)] });
const heading = () => ({ stype: 'heading', attributes: { level: 3 }, content: [
  { ...text('Title'), marks: [{ stype: 'bold', range: [0, 5] }] }
] });

function setup(content: unknown[]) {
  const session = openNoteTree({ stype: 'note', content });
  sessions.push(session);
  const editor = session.editor;
  const blocks = () => editor.dataStore.getNode(session.rootId)!.content!.map(id => editor.dataStore.getNode(String(id))!);
  const select = (index: number, offset = 0) => {
    const id = String(blocks()[index].content![0]);
    editor.setRange({ type: 'range', startNodeId: id, endNodeId: id, startOffset: offset, endOffset: offset, collapsed: true });
    return id;
  };
  const snapshot = () => structuredClone(editor.exportDocument());
  const valid = () => expect(validateTree(editor.dataStore.getActiveSchema()!, editor.exportDocument())).toEqual([]);
  return { editor, blocks, select, snapshot, valid };
}

for (const trigger of ['', '/제목']) {
  it(`reuses an empty paragraph for a heading with reversible trigger removal: ${JSON.stringify(trigger)}`, async () => {
    const { editor, blocks, select, snapshot, valid } = setup([paragraph(trigger)]);
    const blockId = blocks()[0].sid;
    const runId = select(0, trigger.length);
    const before = snapshot();
    expect(await editor.executeCommand('insertHeading', { stripSlash: !!trigger })).toBe(true);
    expect(blocks().map(block => block.stype)).toEqual(['heading']);
    expect(blocks()[0].sid).toBe(blockId);
    expect(editor.dataStore.getNode(runId)?.text).toBe('');
    expect(editor.selection).toMatchObject({ startNodeId: runId, startOffset: 0 });
    valid();
    const after = snapshot();
    expect(await editor.undo()).toBe(true);
    expect(snapshot()).toEqual(before);
    expect(editor.selection).toMatchObject({ startNodeId: runId, startOffset: trigger.length });
    expect(await editor.redo()).toBe(true);
    expect(snapshot()).toEqual(after);
  });
}

it('preserves existing paragraph text when inserting a heading from a slash query', async () => {
  const { editor, blocks, select, snapshot, valid } = setup([paragraph('Keep /제목 after')]);
  const runId = select(0, 'Keep /제목'.length);
  const before = snapshot();
  expect(await editor.executeCommand('insertHeading', { stripSlash: true })).toBe(true);
  expect(blocks().map(block => block.stype)).toEqual(['paragraph', 'heading']);
  expect(editor.dataStore.getNode(runId)?.text).toBe('Keep  after');
  valid();
  expect(await editor.undo()).toBe(true);
  expect(snapshot()).toEqual(before);
});

for (const content of [[text(' ')], [text(''), { stype: 'emoji', attributes: { unicode: '🙂' } }]]) {
  it(`does not replace a paragraph containing whitespace or an inline object: ${JSON.stringify(content)}`, async () => {
    const { editor, blocks, select } = setup([{ stype: 'paragraph', content }]);
    const original = structuredClone(blocks()[0]);
    select(0);
    expect(await editor.executeCommand('insertHeading')).toBe(true);
    expect(blocks().map(block => block.stype)).toEqual(['paragraph', 'heading']);
    expect(blocks()[0]).toEqual(original);
  });
}

it('removes only the empty paragraph before a heading and restores content and caret with history', async () => {
  const { editor, blocks, select, snapshot, valid } = setup([paragraph(''), heading(), paragraph('After')]);
  const runId = select(1);
  const originalHeading = structuredClone(blocks()[1]);
  const before = snapshot();
  expect(await editor.executeCommand('backspace')).toBe(true);
  expect(blocks().map(block => block.stype)).toEqual(['heading', 'paragraph']);
  expect(blocks()[0]).toEqual(originalHeading);
  expect(editor.selection).toMatchObject({ startNodeId: runId, startOffset: 0 });
  valid();
  const after = snapshot();
  expect(await editor.undo()).toBe(true);
  expect(snapshot()).toEqual(before);
  expect(editor.selection).toMatchObject({ startNodeId: runId, startOffset: 0 });
  expect(await editor.redo()).toBe(true);
  expect(snapshot()).toEqual(after);
});

for (const previous of [paragraph('Keep'), { stype: 'paragraph', content: [text(''), { stype: 'emoji', attributes: { unicode: '🙂' } }, text('')] }]) {
  it(`does not treat a nonempty paragraph as a removable gap: ${JSON.stringify(previous)}`, async () => {
    const { editor, select, snapshot } = setup([previous, heading()]);
    select(1);
    const before = snapshot();
    expect(await editor.executeCommand('backspace')).toBe(false);
    expect(snapshot()).toEqual(before);
  });
}

it('does not cross a quote boundary to remove an empty paragraph', async () => {
  const { editor, select, snapshot } = setup([{ stype: 'blockQuote', content: [paragraph('')] }, heading()]);
  select(1);
  const before = snapshot();
  expect(await editor.executeCommand('backspace')).toBe(false);
  expect(snapshot()).toEqual(before);
});
