import { describe, expect, it } from 'vitest';
import { createWordEditor } from '../src/word-kit';
import { tocEntries } from '../src/toc';
import { captureTocSession } from '../src/structure-commands';

describe('caption tables of contents', () => {
  it('lists the selected sequence with global numbers, descriptions and layout pages', () => {
    const editor = createWordEditor();
    const caption = (sequence: string, text: string) => ({ stype: 'paragraph', content: [
      { stype: 'inline-text', text: sequence + ' ' }, { stype: 'fieldSeq', attributes: { sequence } }, { stype: 'inline-text', text: ': ' + text }
    ] });
    editor.loadDocument({ stype: 'document', content: [
      { stype: 'surface', content: [caption('Figure', 'First'), caption('Table', 'Data')] },
      { stype: 'surface', content: [caption('Figure', 'Second'), { stype: 'heading', attributes: { level: 1 }, content: [{ stype: 'inline-text', text: 'Heading' }] }] }
    ] } as never);
    const doc = { rootId: editor.getRootId()!, getNode: (id: string) => editor.dataStore.getNode(id) };
    const sections = doc.getNode(doc.rootId)!.content!.map(id => doc.getNode(String(id))!).filter(n => n.stype === 'surface');
    const last = sections[1].content![0];
    const pageOfBlock = new Map([[String(last), 4]]);
    expect(tocEntries({ doc, surface: sections[0], caption: 'Figure' }).map(e => e.text)).toEqual(['Figure 1: First']);
    expect(tocEntries({ doc, surface: sections[0], caption: 'Table' }).map(e => e.text)).toEqual(['Table 1: Data']);
    expect(tocEntries({ doc, surface: sections[1], caption: 'Figure', pageOfBlock })).toEqual([{ sid: last, level: 1, text: 'Figure 2: Second', page: 4 }]);
    expect(tocEntries({ doc, surface: sections[1] }).map(e => e.text)).toEqual(['Heading']);
    expect(tocEntries({ doc, surface: sections[1], caption: 'Equation' })).toEqual([]);
    editor.destroy();
  });

  it('keeps heading and caption contents separate when opening their settings', async () => {
    const editor = createWordEditor();
    editor.loadDocument({ stype: 'document', content: [{ stype: 'surface', content: [
      { stype: 'tableOfContents', attributes: { caption: 'Figure' }, content: [] },
      { stype: 'tableOfContents', content: [] },
      { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Here' }] }
    ] }] } as never);
    const store = editor.dataStore;
    const surface = store.getNode(String(store.getNode(editor.getRootId()!)!.content![0]))!;
    const paragraph = store.getNode(String(surface.content![2]))!;
    const text = String(paragraph.content![0]);
    editor.updateSelection({ type: 'range', startNodeId: text, endNodeId: text, startOffset: 0, endOffset: 0, collapsed: true });
    expect(captureTocSession(editor)?.tocId).toBe(surface.content![1]);
    expect(captureTocSession(editor, 'captions')?.tocId).toBe(surface.content![0]);
    const session = captureTocSession(editor, 'captions')!;
    const settings = { levels: '1-3', scope: 'document', showPageNumbers: true, useHyperlinks: true, leader: 'dot', caption: 'Unknown' };
    expect(await editor.run('setTableOfContents', { ...session, action: 'update', settings })).toBe(false);
    expect(await editor.run('setTableOfContents', { ...session, action: 'update', settings: { ...settings, caption: 'Table' } })).toBe(true);
    expect(store.getNode(String(surface.content![1]))?.attributes?.caption).toBeFalsy();
    await editor.run('undo');
    expect(store.getNode(String(surface.content![0]))?.attributes?.caption).toBe('Figure');
    editor.destroy();
  });
});
