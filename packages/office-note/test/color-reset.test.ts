import { expect, it } from 'vitest';
import { openNoteTree } from '../src/session';

for (const [command, removed, retained] of [
  ['removeFontColor', 'fontColor', 'bgColor'], ['removeBgColor', 'bgColor', 'fontColor']
]) {
  it(`${command} resets only its channel across mixed runs and restores it on undo`, async () => {
    const colored = (text: string) => ({ stype: 'inline-text', text, marks: [
      { stype: 'fontColor', attrs: { color: '#d44c47' }, range: [0, 3] },
      { stype: 'bgColor', attrs: { bgColor: '#fbf3db' }, range: [0, 3] },
      { stype: 'bold', range: [0, 3] }
    ] });
    const session = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [colored('ABC'), { stype: 'inline-text', text: 'plain' }, colored('XYZ')] }] });
    try {
      const editor = session.editor;
      const runs = [...editor.dataStore.getNodes().values()].filter(node => typeof node.text === 'string');
      const before = editor.exportDocument();
      editor.setRange({ type: 'range', startNodeId: runs[0].sid!, startOffset: 1, endNodeId: runs[2].sid!, endOffset: 2, collapsed: false });
      expect(await editor.executeCommand(command)).toBe(true);
      expect(editor.dataStore.getNode(runs[0].sid!)?.marks?.find(mark => mark.stype === removed)?.range).toEqual([0, 1]);
      expect(editor.dataStore.getNode(runs[2].sid!)?.marks?.find(mark => mark.stype === removed)?.range).toEqual([2, 3]);
      expect(editor.dataStore.getNode(runs[1].sid!)?.marks ?? []).toEqual([]);
      expect(editor.dataStore.getNode(runs[0].sid!)?.marks?.find(mark => mark.stype === retained)?.range).toEqual([0, 3]);
      expect(editor.dataStore.getNode(runs[0].sid!)?.marks?.some(mark => mark.stype === 'bold')).toBe(true);
      expect(await editor.undo()).toBe(true);
      expect(editor.exportDocument()).toEqual(before);
    } finally { session.close(); }
  });
}
