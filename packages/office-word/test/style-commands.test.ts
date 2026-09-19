import { describe, it, expect } from 'vitest';
import { createWordEditor } from '../src/word-kit';
import { createStarterDocument } from '../src/starter-document';
import { withWordDefaults } from '../src/default-styles';
import { createStyleResolver } from '@barocss/office-text';

function setup(document = createStarterDocument()) {
  const editor = createWordEditor();
  editor.loadDocument(document);
  const nodes: any[] = [];
  const visit = (id: string) => {
    const node = editor.dataStore.getNode(id)!;
    nodes.push(node);
    for (const child of node.content ?? []) visit(child as string);
  };
  visit(editor.getRootId()!);
  const paragraphs = nodes.filter((node) => node.stype === 'paragraph');
  const first = paragraphs[0].content[0];
  const last = paragraphs.at(-1).content[0];
  editor.updateSelection({ type: 'range', startNodeId: first, startOffset: 0, endNodeId: last, endOffset: 0, collapsed: first === last });
  return { editor, paragraphs };
}

describe('Word paragraph styles', () => {
  it('fills legacy resources without changing the caller or overriding imported styles', () => {
    const custom: any = { stype: 'document', content: [{ stype: 'resources', content: [
      { stype: 'docDefaults', attributes: { fontSize: 30 } },
      { stype: 'styleDef', attributes: { id: 'Heading1', fontSize: 64, color: '123456' } }
    ] }] };
    const before = JSON.stringify(custom);
    const normalized = withWordDefaults(custom);
    const entries = (normalized.content![0] as any).content;
    expect(JSON.stringify(custom)).toBe(before);
    expect(entries.filter((node: any) => node.attributes?.id === 'Heading1')).toHaveLength(1);
    expect(entries.find((node: any) => node.attributes?.id === 'Heading1').attributes.fontSize).toBe(64);
    expect(withWordDefaults(normalized)).toBe(normalized);
  });

  it('repairs legacy headings when their style definition was never saved', () => {
    const document: any = { stype: 'document', content: [{ stype: 'surface', content: [{ stype: 'heading', attributes: { level: 2, styleId: 'Body' }, content: [{ stype: 'inline-text', text: 'Legacy' }] }] }] };
    const result: any = withWordDefaults(document);
    expect(result.content[0].content[0].attributes.styleId).toBe('Heading2');
    expect(document.content[0].content[0].attributes.styleId).toBe('Body');
  });

  it('applies the style to all selected paragraphs in one undoable edit', async () => {
    const document: any = createStarterDocument();
    document.content.find((node: any) => node.stype === 'surface').content.push({ stype: 'paragraph', attributes: { styleId: 'Body' }, content: [{ stype: 'inline-text', text: 'Second' }] });
    const { editor, paragraphs } = setup(document);
    expect(await editor.executeCommand('setHeading2')).toBe(true);
    for (const original of paragraphs) {
      const node = editor.dataStore.getNode(original.sid)!;
      expect(node.stype).toBe('heading');
      expect(node.attributes?.styleId).toBe('Heading2');
    }
    await editor.executeCommand('undo');
    for (const original of paragraphs) expect(editor.dataStore.getNode(original.sid)?.stype).toBe('paragraph');
    editor.destroy();
  });

  it('repairs a heading with a missing style reference and preserves direct formatting', async () => {
    const { editor, paragraphs } = setup();
    await editor.executeCommand('setHeading1');
    const id = paragraphs[0].sid;
    editor.dataStore.updateNode(id, { attributes: { styleId: 'Body', alignment: 'center' } });
    expect(await editor.executeCommand('setHeading1')).toBe(true);
    const node = editor.dataStore.getNode(id)!;
    expect(node.attributes?.alignment).toBe('center');
    const styles = createStyleResolver({ rootId: editor.getRootId()!, getNode: (sid) => editor.dataStore.getNode(sid) });
    expect(styles.resolveNode(node, 'character').fontSize).toBe(40);
    expect(await editor.executeCommand('setParagraph')).toBe(true);
    expect(styles.resolveNode(editor.dataStore.getNode(id)!, 'character').fontSize).toBe(22);
    editor.destroy();
  });
});
