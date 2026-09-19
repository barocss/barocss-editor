import { describe, expect, it } from 'vitest';
import { createWordEditor } from '../src/word-kit';
import { captureWordFormat } from '../src/format-painter';

function setup() {
  const editor = createWordEditor();
  editor.loadDocument({ stype: 'document', content: [{ stype: 'surface', content: [
    { stype: 'heading', attributes: { level: 1 }, content: [{ stype: 'inline-text', text: 'Source', marks: [
      { stype: 'fontColor', attrs: { color: '#ee0000' }, range: [0, 6] }, { stype: 'link', attrs: { href: 'https://source.test' }, range: [0, 6] }
    ] }] },
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Target words', marks: [
      { stype: 'italic', range: [0, 12] }, { stype: 'link', attrs: { href: 'https://target.test' }, range: [0, 12] }
    ] }] }
  ] }] } as never);
  const root = editor.dataStore.getNode(editor.getRootId()!)!;
  const surface = editor.dataStore.getNode(String(root.content![0]))!;
  const runs = surface.content!.map(id => String(editor.dataStore.getNode(String(id))!.content![0]));
  const select = (sid: string, start = 0, end = 6) => editor.updateSelection({ type: 'range', startNodeId: sid, startOffset: start, endNodeId: sid, endOffset: end, collapsed: start === end });
  return { editor, runs, select };
}

describe('Word copied character format', () => {
  it('applies resolved paragraph layout at a caret without copying heading structure or text marks', async () => {
    const { editor, runs, select } = setup(); select(runs[0]);
    const sample = { ...captureWordFormat(editor)!, includeParagraph: true };
    const targetId = editor.dataStore.getNode(runs[1])!.parentId!;
    select(runs[1], 2, 2);
    const before = editor.exportDocument(editor.getRootId()!);
    const marks = structuredClone(editor.dataStore.getNode(runs[1])!.marks);
    expect(await editor.run('applyCopiedFormat', { sample })).toBe(true);
    const target = editor.dataStore.getNode(targetId)!;
    expect(target.stype).toBe('paragraph');
    expect(target.attributes?.spacingBefore).toBe(320);
    expect(target.attributes?.spacingAfter).toBe(120);
    expect(target.attributes?.keepNext).not.toBe(true);
    expect(editor.dataStore.getNode(runs[1])!.marks).toEqual(marks);
    await editor.run('undo'); expect(editor.exportDocument(editor.getRootId()!)).toEqual(before);
    editor.destroy();
  });

  it('rejects tracked paragraph painting and restores its previous layout', async () => {
    const { editor, runs, select } = setup(); select(runs[0]);
    const sample = { ...captureWordFormat(editor)!, includeParagraph: true };
    await editor.run('toggleTrackChanges'); select(runs[1], 2, 2);
    const targetId = editor.dataStore.getNode(runs[1])!.parentId!;
    expect(await editor.run('applyCopiedFormat', { sample })).toBe(true);
    const revision = editor.dataStore.getNode(runs[1])!.marks!.find(mark => mark.stype === 'formatChange')!;
    expect(revision).toBeTruthy();
    expect(await editor.run('rejectRevision', { id: revision.attrs!.id })).toBe(true);
    expect(editor.dataStore.getNode(targetId)!.attributes?.spacingBefore).toBeUndefined();
    await editor.run('undo'); expect(editor.dataStore.getNode(targetId)!.attributes?.spacingBefore).toBe(320);
    editor.destroy();
  });

  it('does not modify a read-only document', async () => {
    const { editor, runs, select } = setup(); select(runs[0]); const sample = captureWordFormat(editor)!;
    select(runs[1]); editor.setEditable(false);
    const before = editor.exportDocument(editor.getRootId()!);
    expect(await editor.run('applyCopiedFormat', { sample })).toBe(false);
    expect(editor.exportDocument(editor.getRootId()!)).toEqual(before); editor.destroy();
  });
  it('excludes the ending paragraph when a range stops at its start', async () => {
    const { editor, runs, select } = setup(); select(runs[1]);
    const sample = { ...captureWordFormat(editor)!, includeParagraph: true };
    const endBlockId = editor.dataStore.getNode(runs[1])!.parentId!;
    const before = structuredClone(editor.dataStore.getNode(endBlockId)!.attributes);
    editor.updateSelection({ type: 'range', startNodeId: runs[0], startOffset: 0, endNodeId: runs[1], endOffset: 0 });
    expect(await editor.run('applyCopiedFormat', { sample })).toBe(true);
    expect(editor.dataStore.getNode(endBlockId)!.attributes).toEqual(before);
    editor.destroy();
  });
  it('captures inherited heading size without mutating the source or copying its link', () => {
    const { editor, runs, select } = setup(); select(runs[0]);
    const before = editor.exportDocument(editor.getRootId()!);
    const sample = captureWordFormat(editor)!;
    expect(sample.format.fontSize).toBe(40); expect(sample.format.bold).toBe(true);
    expect(sample.marks.map(mark => mark.stype)).toEqual(['fontColor']);
    expect(editor.exportDocument(editor.getRootId()!)).toEqual(before);
    editor.destroy();
  });

  it('replaces only visual marks inside the target, retains links and undoes the style resource', async () => {
    const { editor, runs, select } = setup(); select(runs[0]);
    const sample = captureWordFormat(editor)!; select(runs[1], 0, 6);
    const before = editor.exportDocument(editor.getRootId()!);
    expect(await editor.run('applyCopiedFormat', { sample })).toBe(true);
    const node = editor.dataStore.getNode(runs[1])!;
    expect(node.text).toBe('Target words');
    expect(node.marks?.find(mark => mark.stype === 'link')?.attrs?.href).toBe('https://target.test');
    expect(node.marks?.find(mark => mark.stype === 'italic')?.range).toEqual([6, 12]);
    expect(node.marks?.find(mark => mark.stype === 'fontColor')?.range).toEqual([0, 6]);
    const after = editor.exportDocument(editor.getRootId()!);
    await editor.run('undo'); expect(editor.exportDocument(editor.getRootId()!)).toEqual(before);
    await editor.run('redo'); expect(editor.exportDocument(editor.getRootId()!)).toEqual(after);
    editor.destroy();
  });

  it('records tracked formatting and restores both format and revision with one undo', async () => {
    const { editor, runs, select } = setup(); select(runs[0]); const sample = captureWordFormat(editor)!;
    await editor.run('toggleTrackChanges'); select(runs[1]);
    const before = editor.exportDocument(editor.getRootId()!);
    expect(await editor.run('applyCopiedFormat', { sample })).toBe(true);
    expect(editor.dataStore.getNode(runs[1])!.marks?.some(mark => mark.stype === 'formatChange')).toBe(true);
    await editor.run('undo'); expect(editor.exportDocument(editor.getRootId()!)).toEqual(before);
    editor.destroy();
  });

  it('copies plain body defaults as explicit resets over a heading', async () => {
    const { editor, runs, select } = setup();
    editor.dataStore.updateNode(runs[1], { marks: [] }); select(runs[1]);
    const sample = captureWordFormat(editor)!;
    expect(sample.format.bold).toBe(false); expect(sample.format.fontSize).toBe(22);
    select(runs[0]); expect(await editor.run('applyCopiedFormat', { sample })).toBe(true);
    expect(editor.dataStore.getNode(runs[0])!.marks?.some(mark => mark.stype === 'fontColor')).toBe(false);
    expect(editor.dataStore.getNode(runs[0])!.marks?.some(mark => mark.stype === 'link')).toBe(true);
    editor.destroy();
  });

  it('rejects empty destinations and missing samples without adding resources', async () => {
    const { editor, runs, select } = setup(); select(runs[0]); const sample = captureWordFormat(editor)!;
    select(runs[1], 2, 2); const before = editor.exportDocument(editor.getRootId()!);
    expect(await editor.run('applyCopiedFormat', { sample })).toBe(false);
    expect(await editor.run('applyCopiedFormat')).toBe(false);
    expect(editor.exportDocument(editor.getRootId()!)).toEqual(before); editor.destroy();
  });
});
