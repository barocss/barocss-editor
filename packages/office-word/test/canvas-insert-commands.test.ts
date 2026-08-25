import { describe, it, expect, beforeEach } from 'vitest';
import { createWordEditor } from '../src/word-kit';

/**
 * A drawing in a page, made by pressing a button.
 *
 * The arithmetic is tested next door without a document. What a command has to answer is what the
 * document holds afterwards: that the canvas is *there* (Word had drawn one for months and had no
 * way to make one), that the shape is inside it rather than among the paragraphs, and that one
 * press is one undo — a reader who presses 사각형 and then Ctrl+Z means "take the rectangle back",
 * not "leave me an empty canvas".
 */
describe('inserting a drawing and the shapes on it', () => {
  let editor: any;

  const doc = () => ({
    stype: 'document',
    attributes: {},
    content: [
      {
        stype: 'surface',
        attributes: { kind: 'flow' },
        content: [
          { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '첫 문단' }] },
          { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '둘째 문단' }] }
        ]
      }
    ]
  });

  beforeEach(() => {
    editor = createWordEditor();
    editor.loadDocument(doc(), 'word');
  });

  /** Every node in the document, as `stype` and its children — the shape of the tree. */
  const treeOf = (sid: string = editor.getRootId()): any => {
    const node = editor.dataStore.getNode(sid);
    const kids = (node?.content ?? []).filter((one: unknown) => typeof one === 'string');
    return kids.length > 0 ? { [node.stype]: kids.map((one: string) => treeOf(one)) } : node.stype;
  };

  const section = () => editor.dataStore.getNode(editor.getRootId()).content[0];
  const firstParagraph = () => editor.dataStore.getNode(section()).content[0];
  const caretInFirst = () => {
    const run = editor.dataStore.getNode(firstParagraph()).content[0];
    return { type: 'range', startNodeId: run, startOffset: 0, endNodeId: run, endOffset: 0, collapsed: true };
  };

  it('makes the canvas the document had no way to make, with the shape already on it', async () => {
    expect(await editor.executeCommand('insertRectangle', { selection: caretInFirst() })).toBe(true);

    // After the block the caret was in — which is what "insert" means everywhere else in a document.
    expect(treeOf()).toEqual({
      document: [{ surface: [{ paragraph: ['inline-text'] }, { canvasBlock: ['rectangle'] }, { paragraph: ['inline-text'] }] }]
    });

    const canvas = editor.dataStore.getNode(editor.dataStore.getNode(section()).content[1]);
    // As wide as the text is, half as tall — the page setup answered it, not a constant here.
    expect(canvas.attributes).toMatchObject({ width: 9360, height: 4680 });

    const rect = editor.dataStore.getNode(canvas.content[0]);
    expect(rect.attributes).toMatchObject({ x: 3510, y: 1755, width: 2340, height: 1170, fill: '#2563eb' });
  });

  it('is one press and one undo, not half a gesture', async () => {
    await editor.executeCommand('insertRectangle', { selection: caretInFirst() });
    await editor.undo();

    // The canvas goes with the rectangle. Leaving an empty canvas behind would be the editor
    // keeping half of something nobody asked for.
    expect(treeOf()).toEqual({
      document: [{ surface: [{ paragraph: ['inline-text'] }, { paragraph: ['inline-text'] }] }]
    });
  });

  it('puts the next shape on the drawing the reader is standing on', async () => {
    await editor.executeCommand('insertRectangle', { selection: caretInFirst() });
    const canvas = editor.dataStore.getNode(section()).content[1];

    // A shape is selected — which is what the overlay will do — so "here" is its canvas.
    editor.setNode({ nodeIds: [editor.dataStore.getNode(canvas).content[0]] });
    expect(await editor.executeCommand('insertEllipse')).toBe(true);

    // Two shapes on one drawing, rather than a second drawing under the first.
    expect(treeOf()).toEqual({
      document: [
        { surface: [{ paragraph: ['inline-text'] }, { canvasBlock: ['rectangle', 'ellipse'] }, { paragraph: ['inline-text'] }] }
      ]
    });
  });

  it('adds to the canvas when the canvas itself is what is selected', async () => {
    await editor.executeCommand('insertDrawing', { selection: caretInFirst() });
    const canvas = editor.dataStore.getNode(section()).content[1];
    expect(editor.dataStore.getNode(canvas).stype).toBe('canvasBlock');

    editor.setNode({ nodeIds: [canvas] });
    await editor.executeCommand('insertLine');

    const line = editor.dataStore.getNode(editor.dataStore.getNode(canvas).content[0]);
    // Flattened across the middle, which is what a line is rather than a diagonal.
    expect(line.stype).toBe('line');
    expect(line.attributes.height).toBe(0);
  });

  it('refuses when there is nowhere to write, so the button can grey out', async () => {
    // No caret, no selection: a command that answered `true` here would report success for having
    // done nothing, which is the failure this repository keeps finding.
    editor.updateSelection(null);
    expect(editor.canExecuteCommand('insertRectangle')).toBe(false);
    expect(await editor.executeCommand('insertRectangle')).toBe(false);
  });
});
