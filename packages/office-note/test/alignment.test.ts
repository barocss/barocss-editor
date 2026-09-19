import { expect, it } from 'vitest';
import { openNoteTree } from '../src/session';
it('aligns paragraphs atomically and refuses readonly and invalid alignment', async () => {
  const session = openNoteTree({ stype: 'note', content: ['A', 'B'].map(text => ({ stype: 'paragraph', content: [{ stype: 'inline-text', text }] })) });
  try {
    const ed = session.editor, runs = ed.dataStore.getAllNodes().filter(n => typeof n.text === 'string');
    ed.setRange({ type: 'range', startNodeId: runs[0].sid!, endNodeId: runs[1].sid!, startOffset: 0, endOffset: 1, collapsed: false });
    const before = ed.exportDocument();
    expect(await ed.executeCommand('alignCenter')).toBe(true);
    expect(ed.exportDocument().content!.every((n: any) => n.attributes.alignment === 'center')).toBe(true);
    await ed.undo(); expect(ed.exportDocument()).toEqual(before);
    expect(await ed.executeCommand('setAlignment', { alignment: 'invalid' })).toBe(false);
    ed.setEditable(false); expect(await ed.executeCommand('alignRight')).toBe(false);
  } finally { session.close(); }
});
