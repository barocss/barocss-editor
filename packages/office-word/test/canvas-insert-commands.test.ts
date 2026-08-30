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

/**
 * Moving what is on a drawing.
 *
 * A drag is thirty pointer events a second, so the app writes **once**, at the drop, through this.
 * What a command has to answer is what the document holds afterwards, and the one guard that
 * matters: a caller naming something that is not on a canvas is asking to give a paragraph an `x`,
 * which the schema would take and nothing would draw.
 */
describe('moving what is on a drawing', () => {
  let editor: any;

  beforeEach(async () => {
    editor = createWordEditor();
    editor.loadDocument(
      {
        stype: 'document',
        attributes: {},
        content: [
          {
            stype: 'surface',
            attributes: { kind: 'flow' },
            content: [{ stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '문단' }] }]
          }
        ]
      },
      'word'
    );
    const section = editor.dataStore.getNode(editor.getRootId()).content[0];
    const para = editor.dataStore.getNode(section).content[0];
    const run = editor.dataStore.getNode(para).content[0];
    await editor.executeCommand('insertRectangle', {
      selection: { type: 'range', startNodeId: run, startOffset: 0, endNodeId: run, endOffset: 0 }
    });
  });

  const shapes = () => {
    const store = editor.dataStore;
    const found: string[] = [];
    const walk = (sid: string) => {
      const node = store.getNode(sid);
      if (node?.stype === 'rectangle' || node?.stype === 'ellipse') found.push(sid);
      for (const child of node?.content ?? []) if (typeof child === 'string') walk(child);
    };
    walk(editor.getRootId());
    return found;
  };

  it('moves every shape it is given, in one entry of the history', async () => {
    const canvas = editor.dataStore.getNode(shapes()[0]).parentId;
    await editor.executeCommand('insertEllipse', { canvasId: canvas, x: 100, y: 200 });

    const moving = shapes();
    const before = moving.map((sid) => ({ ...editor.dataStore.getNode(sid).attributes }));
    expect(await editor.executeCommand('moveShapes', { nodeIds: moving, dx: 300, dy: -50 })).toBe(true);

    for (const [at, sid] of moving.entries()) {
      const after = editor.dataStore.getNode(sid).attributes;
      expect(after.x).toBe(before[at].x + 300);
      expect(after.y).toBe(before[at].y - 50);
    }

    // One drag is one gesture: three shapes moved together come back together.
    await editor.undo();
    for (const [at, sid] of moving.entries()) {
      expect(editor.dataStore.getNode(sid).attributes.x).toBe(before[at].x);
    }
  });

  it('refuses what is not on a canvas, and a move of nothing', async () => {
    const section = editor.dataStore.getNode(editor.getRootId()).content[0];
    const para = editor.dataStore.getNode(section).content[0];

    // A paragraph has no coordinates; the schema would take an `x` and nothing would draw it.
    expect(editor.canExecuteCommand('moveShapes', { nodeIds: [para], dx: 10, dy: 10 })).toBe(false);
    expect(await editor.executeCommand('moveShapes', { nodeIds: [para], dx: 10, dy: 10 })).toBe(false);

    // And a drag that went nowhere writes nothing rather than an entry that changes nothing.
    expect(editor.canExecuteCommand('moveShapes', { nodeIds: shapes(), dx: 0, dy: 0 })).toBe(false);
  });

  /**
   * **A shape the reader locked stays where it is.**
   *
   * `locked` is on every scene node the office schema declares and it means one thing: *I have
   * decided where this goes.* The deck has read it since its arrange commands were written — its
   * `box-commands.ts` skips locked boxes when it moves, duplicates or deletes them, and its tidy
   * pass treats one as a pin. **Word read it nowhere**, so a shape a reader locked could still be
   * dragged, nudged, resized, aligned, spread and deleted.
   *
   * Asked through `_movable`, which is the one question every one of those commands comes through:
   * `resizeShapes` calls it, `deleteShapes` calls it with a distance of one, and the align and
   * spread commands read the same list. So this is three assertions about one line.
   */
  describe('a shape the reader locked', () => {
    /*
     * Two shapes, because what a lock has to survive is being dragged **together with** something
     * that is not locked — a marquee across a diagram. The document arrives empty of shapes and
     * every test in this file makes its own, which is what keeps them from leaning on each other.
     */
    beforeEach(async () => {
      const canvas = editor.dataStore.getNode(shapes()[0]).parentId;
      await editor.executeCommand('insertEllipse', { canvasId: canvas, x: 400, y: 200 });
    });

    const lock = (sid: string) => {
      const node = editor.dataStore.getNode(sid);
      editor.dataStore.setNode({ ...node, attributes: { ...node.attributes, locked: true } }, false);
    };

    it('will not be moved, resized or deleted', async () => {
      const [pinned, loose] = shapes();
      lock(pinned);

      expect(editor.canExecuteCommand('moveShapes', { nodeIds: [pinned], dx: 40, dy: 0 })).toBe(false);
      expect(
        editor.canExecuteCommand('resizeShapes', { nodeIds: [pinned], handle: 'se', dx: 40, dy: 40 })
      ).toBe(false);
      expect(editor.canExecuteCommand('deleteShapes', { nodeIds: [pinned] })).toBe(false);

      // And the one beside it is untouched by any of that.
      expect(editor.canExecuteCommand('moveShapes', { nodeIds: [loose], dx: 40, dy: 0 })).toBe(true);
    });

    /*
     * A drag that holds a locked shape and a loose one moves the loose one — which is what a reader
     * pulling a marquee across a diagram means, and why this filters rather than refuses the set.
     */
    it('stays put while what is selected with it moves', async () => {
      const [pinned, loose] = shapes();
      lock(pinned);

      const before = {
        pinned: { ...editor.dataStore.getNode(pinned).attributes },
        loose: { ...editor.dataStore.getNode(loose).attributes }
      };

      expect(await editor.executeCommand('moveShapes', { nodeIds: [pinned, loose], dx: 60, dy: 0 })).toBe(true);

      expect(editor.dataStore.getNode(pinned).attributes.x).toBe(before.pinned.x);
      expect(editor.dataStore.getNode(loose).attributes.x).toBe(before.loose.x + 60);
    });
  });
});

/**
 * Getting back to writing, from a shape.
 *
 * Measured before it was built, in the browser: with a shape selected a letter went nowhere and
 * Enter did nothing at all. Safe — the engine refuses a character with no caret to put it in — and
 * dead, because Enter means *give me a line* everywhere else in a document. A page can answer that
 * and a slide cannot, which is why these are Word's.
 */
describe('leaving a drawing', () => {
  let editor: any;

  const stand = async () => {
    editor = createWordEditor();
    editor.loadDocument(
      {
        stype: 'document',
        attributes: {},
        content: [
          {
            stype: 'surface',
            attributes: { kind: 'flow' },
            content: [
              { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '위' }] },
              { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '아래' }] }
            ]
          }
        ]
      },
      'word'
    );
    const section = editor.dataStore.getNode(editor.getRootId()).content[0];
    const first = editor.dataStore.getNode(section).content[0];
    const run = editor.dataStore.getNode(first).content[0];
    await editor.executeCommand('insertRectangle', {
      selection: { type: 'range', startNodeId: run, startOffset: 0, endNodeId: run, endOffset: 0 }
    });
    // The shape the reader is holding — which is what the overlay leaves selected after a press.
    const canvas = editor.dataStore.getNode(section).content[1];
    editor.setNode({ nodeIds: [editor.dataStore.getNode(canvas).content[0]] });
    return { section, canvas };
  };

  const blocks = (section: string) =>
    editor.dataStore.getNode(section).content.map((sid: string) => editor.dataStore.getNode(sid).stype);

  const caretText = () => {
    const selection = editor.selection;
    return selection?.type === 'range' ? editor.dataStore.getNode(selection.startNodeId)?.text : null;
  };

  it('Enter makes a line under the drawing and puts the caret in it', async () => {
    const { section } = await stand();
    expect(await editor.executeCommand('insertParagraphAfterDrawing')).toBe(true);

    // Straight after the drawing, not at the end of the section.
    expect(blocks(section)).toEqual(['paragraph', 'canvasBlock', 'paragraph', 'paragraph']);
    expect(editor.selection?.type).toBe('range');
    expect(caretText()).toBe('');
  });

  it('Escape moves the caret and writes nothing', async () => {
    const { section } = await stand();
    const before = blocks(section);

    expect(await editor.executeCommand('leaveDrawing')).toBe(true);
    // A reader who has finished with a drawing does not want an empty paragraph to delete after it.
    expect(blocks(section)).toEqual(before);
    expect(caretText()).toBe('아래');
  });

  it('lands before the drawing when the drawing is the last thing there', async () => {
    const { section } = await stand();
    const canvas = editor.dataStore.getNode(section).content[1];
    // Take the paragraph under it away, so there is nothing after the drawing at all.
    await editor.transaction([
      { type: 'removeChild', payload: { parentId: section, childId: editor.dataStore.getNode(section).content[2] } }
    ]).commit();
    editor.setNode({ nodeIds: [editor.dataStore.getNode(canvas).content[0]] });

    expect(await editor.executeCommand('leaveDrawing')).toBe(true);
    expect(caretText()).toBe('위');
  });

  it('refuses when nothing on a drawing is selected, so the key stays the reader’s', async () => {
    await stand();
    editor.setNode(null);
    // Otherwise Enter would swallow the key with a caret in the text, which is the fault
    // `shapesSelected` exists to prevent.
    expect(editor.canExecuteCommand('insertParagraphAfterDrawing')).toBe(false);
    expect(editor.canExecuteCommand('leaveDrawing')).toBe(false);
  });
});

/**
 * Lining a set up, spreading it out, and saying what is in front.
 *
 * The arithmetic is the canvas layer's and tested there. What a command has to answer is which
 * shapes it acts on, what it writes, and what it refuses — and the refusals are the interesting
 * half: aligning one shape is a gesture with no meaning, and distributing two is a gesture whose
 * answer is "they already are".
 */
describe('arranging a set of shapes', () => {
  let editor: any;
  let canvas: string;

  const at = (sid: string) => {
    const box = editor.dataStore.getNode(sid).attributes;
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  };

  const shapesOn = () => editor.dataStore.getNode(canvas).content as string[];

  beforeEach(async () => {
    editor = createWordEditor();
    editor.loadDocument(
      {
        stype: 'document',
        attributes: {},
        content: [
          {
            stype: 'surface',
            attributes: { kind: 'flow' },
            content: [{ stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '문단' }] }]
          }
        ]
      },
      'word'
    );
    const section = editor.dataStore.getNode(editor.getRootId()).content[0];
    const run = editor.dataStore.getNode(editor.dataStore.getNode(section).content[0]).content[0];
    await editor.executeCommand('insertDrawing', {
      selection: { type: 'range', startNodeId: run, startOffset: 0, endNodeId: run, endOffset: 0 }
    });
    canvas = editor.dataStore.getNode(section).content[1];

    // Three shapes at three lefts and three widths — enough for every one of these to have work.
    for (const [x, y, width] of [
      [0, 0, 1000],
      [500, 900, 600],
      [2000, 1800, 400]
    ]) {
      await editor.executeCommand('insertRectangle', { canvasId: canvas, x, y, width, height: 400 });
    }
  });

  it('puts every selected shape against the same edge', async () => {
    const [first, second, third] = shapesOn();
    editor.setNode({ nodeIds: [first, second, third] });

    expect(await editor.executeCommand('alignShapesLeft')).toBe(true);
    // The union's left, which is the leftmost of them — nothing moves out of the group's own frame.
    expect([at(first).x, at(second).x, at(third).x]).toEqual([0, 0, 0]);

    expect(await editor.executeCommand('alignShapesBottom')).toBe(true);
    const bottoms = [first, second, third].map((sid) => at(sid).y + at(sid).height);
    expect(new Set(bottoms).size).toBe(1);
  });

  it('spreads the gaps evenly, not the centres', async () => {
    const [first, second, third] = shapesOn();
    editor.setNode({ nodeIds: [first, second, third] });

    expect(await editor.executeCommand('distributeShapesHorizontally')).toBe(true);

    // Equal *white* between them: three shapes of different widths with evenly spaced centres look
    // unevenly spaced, because what a reader sees is the gap.
    const ordered = [first, second, third].map(at).sort((a, b) => a.x - b.x);
    const gaps = [
      ordered[1].x - (ordered[0].x + ordered[0].width),
      ordered[2].x - (ordered[1].x + ordered[1].width)
    ];
    expect(Math.abs(gaps[0] - gaps[1])).toBeLessThanOrEqual(1);
  });

  it('refuses what has no meaning: one shape aligned, two distributed', async () => {
    const [first, second] = shapesOn();

    editor.setNode({ nodeIds: [first] });
    expect(editor.canExecuteCommand('alignShapesLeft')).toBe(false);

    editor.setNode({ nodeIds: [first, second] });
    // With two, the gaps are equal by definition — there is nothing to spread.
    expect(editor.canExecuteCommand('distributeShapesVertically')).toBe(false);
    expect(editor.canExecuteCommand('alignShapesLeft')).toBe(true);
  });

  it('moves a shape through the paint order, which is document order', async () => {
    const [first, , third] = shapesOn();

    editor.setNode({ nodeIds: [first] });
    expect(await editor.executeCommand('bringShapesToFront')).toBe(true);
    // Last is in front: an SVG draws its children in the order they are listed.
    expect(shapesOn()[2]).toBe(first);

    editor.setNode({ nodeIds: [third] });
    expect(await editor.executeCommand('sendShapesToBack')).toBe(true);
    expect(shapesOn()[0]).toBe(third);

    expect(await editor.executeCommand('bringShapesForward')).toBe(true);
    expect(shapesOn()[1]).toBe(third);
  });

  it('keeps a set in its own order when it is sent to the front', async () => {
    const [first, second, third] = shapesOn();
    editor.setNode({ nodeIds: [first, second] });

    await editor.executeCommand('bringShapesToFront');
    // The two arrive in front in the order they already had, rather than reversed.
    expect(shapesOn()).toEqual([third, first, second]);
  });
});
