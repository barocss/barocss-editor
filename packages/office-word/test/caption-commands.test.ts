import { describe, expect, it } from 'vitest';
import { createWordEditor } from '../src/word-kit';
import { captureCaptionSession } from '../src/caption-commands';
import { createFieldResolver, walkBlocks } from '@barocss/office-text';

function setup() {
  const editor = createWordEditor();
  editor.loadDocument({ stype: 'document', content: [{ stype: 'surface', attributes: { kind: 'flow' }, content: [
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'First object' }] },
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Second object' }] }
  ] }] } as never);
  const doc = { rootId: editor.getRootId()!, getNode: (id: string) => editor.dataStore.getNode(id) };
  const nodes = () => [...walkBlocks(doc, doc.getNode(doc.rootId))];
  const runs = nodes().filter(node => node.stype === 'inline-text' && node.text?.endsWith('object'));
  const select = (index: number) => editor.updateSelection({ type: 'range', startNodeId: runs[index].sid!, endNodeId: runs[index].sid!, startOffset: 0, endOffset: 0, collapsed: true });
  select(0);
  return { editor, doc, nodes, select, runs };
}

describe('Word captions', () => {
  it('numbers each category in document order and restores insertion in one undo', async () => {
    const { editor, doc, nodes, select } = setup();
    const first = captureCaptionSession(editor)!;
    select(1); const second = captureCaptionSession(editor)!;
    expect(await editor.run('insertWordCaption', { ...second, sequence: 'Figure', text: 'Second', position: 'after' })).toBe(true);
    const original = nodes().find(n => n.stype === 'fieldSeq')!;
    const number = (sid: string) => createFieldResolver(doc).sequenceNumber(sid);
    expect(number(original.sid!)).toBe('1');
    expect(await editor.run('insertWordCaption', { ...first, sequence: 'Figure', text: 'First', position: 'before' })).toBe(true);
    expect(number(original.sid!)).toBe('2');
    expect(nodes().filter(n => n.stype === 'fieldSeq').map(n => number(n.sid!))).toEqual(['1', '2']);
    expect(await editor.run('insertWordCaption', { ...first, sequence: 'Equation', text: '', position: 'after' })).toBe(true);
    expect(nodes().filter(n => n.stype === 'fieldSeq').map(n => number(n.sid!))).toEqual(['1', '1', '2']);
    await editor.run('undo'); await editor.run('undo');
    expect(nodes().filter(n => n.stype === 'fieldSeq')).toHaveLength(1);
    expect(number(original.sid!)).toBe('1');
    await editor.run('redo'); expect(number(original.sid!)).toBe('2');
    expect(nodes().filter(n => n.text?.endsWith('object'))).toHaveLength(2);
    editor.destroy();
  });

  it('uses the captured block, rejects invalid, stale and unavailable targets', async () => {
    const { editor, select, runs } = setup();
    const session = captureCaptionSession(editor)!;
    const payload = { ...session, sequence: 'Table', text: 'Caption', position: 'after' };
    for (const patch of [{ rootId: 'old' }, { surfaceId: 'missing' }, { blockId: 'missing' }, { sequence: 'Unknown' }, { position: 'inside' }, { text: 'x'.repeat(1001) }, { text: 'two\nlines' }]) {
      expect(await editor.run('insertWordCaption', { ...payload, ...patch })).toBe(false);
    }
    editor.updateSelection({ type: 'range', startNodeId: runs[0].sid!, endNodeId: runs[1].sid!, startOffset: 0, endOffset: 0, collapsed: false });
    expect(captureCaptionSession(editor)).toBeUndefined();
    select(1);
    expect(await editor.run('insertWordCaption', payload)).toBe(true);
    const surface = editor.dataStore.getNode(session.surfaceId)!;
    expect(editor.dataStore.getNode(String(surface.content![1]))?.content?.map(id => editor.dataStore.getNode(String(id))?.text ?? '').join('')).toBe('표 : Caption');
    await editor.run('toggleTrackChanges');
    expect(captureCaptionSession(editor)).toBeUndefined();
    expect(await editor.run('insertWordCaption', payload)).toBe(false);
    await editor.run('toggleTrackChanges'); editor.setEditable(false);
    expect(await editor.run('insertWordCaption', payload)).toBe(false);
    editor.destroy();
  });

  it('rejects a deleted target while a dialog is open', async () => {
    const { editor } = setup(); const session = captureCaptionSession(editor)!;
    editor.dataStore.content.removeChild(session.surfaceId, session.blockId);
    expect(await editor.run('insertWordCaption', { ...session, sequence: 'Figure', text: '', position: 'after' })).toBe(false);
    editor.destroy();
  });
});
