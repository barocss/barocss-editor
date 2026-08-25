import { describe, it, expect } from 'vitest';
import { Editor } from '../src/editor';
import { createSchema, getFigmaLikeSchemaDefinition } from '@barocss/schema';
import { transaction } from '@barocss/model';

/**
 * Spike: an editor for a document that is not text.
 *
 * The engine's claim is that it is a document engine and Word is one product of
 * it. The claim is untested — there is one product, and every assumption it
 * makes has had one chance to be noticed. So: stand an `Editor` up on a schema
 * with no text in it at all and write down what breaks.
 *
 * `figma-like-schema` is used because it already exists, marked "reference
 * only" — a flat `document → page → frame | rectangle | ellipse` tree of boxes
 * with coordinates. Nothing in it can hold a caret.
 *
 * This is not a test of a feature. It is the measurement that decides where
 * `editor-core` should be cut, and it is written as a test so the answer stays
 * true rather than being taken once and remembered wrong.
 */
describe('an editor for a document with no text in it', () => {
  const schema = () => createSchema('figma-like', getFigmaLikeSchemaDefinition());

  const page = {
    stype: 'document',
    sid: 'doc',
    content: [
      {
        stype: 'page',
        sid: 'page-1',
        attributes: { name: 'Page 1' },
        content: [
          {
            stype: 'frame',
            sid: 'frame-1',
            attributes: { name: 'Card', x: 0, y: 0, width: 320, height: 200 },
            content: [
              {
                stype: 'rectangle',
                sid: 'rect-1',
                attributes: { x: 16, y: 16, width: 288, height: 80, cornerRadius: 8 }
              },
              // A second box, because the finding this spike recorded was about selecting *two*.
              {
                stype: 'rectangle',
                sid: 'rect-2',
                attributes: { x: 16, y: 104, width: 288, height: 80, cornerRadius: 8 }
              }
            ]
          }
        ]
      }
    ]
  };

  it('boots', () => {
    const editor = new Editor({ schema: schema() } as never);
    expect(editor).toBeDefined();
  });

  it('holds a document of boxes', () => {
    const editor = new Editor({ schema: schema() } as never);
    editor.loadDocument(page as never, 'spike');

    const store = (editor as any).dataStore;
    const root = store.getNode(store.getRootNodeId());
    expect(root?.stype).toBe('document');

    const found: string[] = [];
    const walk = (sid: string) => {
      const node = store.getNode(sid);
      if (!node) return;
      found.push(node.stype);
      for (const child of ((node.content ?? []) as string[])) walk(child);
    };
    walk(store.getRootNodeId());
    expect(found).toEqual(['document', 'page', 'frame', 'rectangle', 'rectangle']);
  });

  /**
   * The question this spike exists for.
   *
   * Every operation in the model takes a payload; some take a *selection*. If
   * moving a box needs a caret, the document layer is text-shaped and the split
   * in the roadmap's phase 2 has to go deeper than expected.
   */
  it('moves a box by naming it, with no selection at all', async () => {
    const editor = new Editor({ schema: schema() } as never);
    editor.loadDocument(page as never, 'spike');
    const store = (editor as any).dataStore;

    // A transaction, not a command: commands are what an *extension* registers
    // and this editor has none — which is itself the finding that a product
    // with no extensions is an editor that can do nothing.
    const result = await transaction(editor as never, [
      { type: 'setAttrs', payload: { nodeId: 'rect-1', attrs: { x: 64 } } }
    ] as never).commit();

    expect(result.success, `a transaction refused: ${JSON.stringify(result)}`).toBe(true);
    expect(store.getNode('rect-1')?.attributes?.x).toBe(64);
  });

  it('undoes that move', async () => {
    const editor = new Editor({ schema: schema() } as never);
    editor.loadDocument(page as never, 'spike');
    const store = (editor as any).dataStore;

    await transaction(editor as never, [
      { type: 'setAttrs', payload: { nodeId: 'rect-1', attrs: { x: 64 } } }
    ] as never).commit();
    expect(store.getNode('rect-1')?.attributes?.x).toBe(64);

    const undone = await (editor as any).undo?.();
    expect(undone, 'history had nothing to undo').toBeTruthy();
    expect(
      store.getNode('rect-1')?.attributes?.x,
      'history did not put a non-text change back'
    ).toBe(16);
  });

  /**
   * What a page builder's selection actually is.
   *
   * Not a range of characters — a set of nodes. `editor-core` has
   * `selectNode`, so the question is whether the rest of it survives a
   * selection with no offsets in it.
   */
  it('selects a box rather than a range of characters', () => {
    const editor = new Editor({ schema: schema() } as never);
    editor.loadDocument(page as never, 'spike');

    // `editor.selection` is read-only, so it goes through the manager's `setNode` — which takes
    // one node or a set of them; the test below is the set.
    editor.selectionManager.setNode({ type: 'node', nodeId: 'rect-1' });
    expect(editor.selection?.type).toBe('node');
    expect((editor.selection as any)?.startNodeId ?? (editor.selection as any)?.nodeId).toBe(
      'rect-1'
    );
  });

  /**
   * The one thing a page builder needs that no text editor ever does — **answered**.
   *
   * This spike's finding was that the selection is a *set* for a page builder (marquee three boxes
   * and align them) and the type had no shape for one. `ModelSelection.nodeIds`, `createNodeSelection`
   * and `Editor.setNode` answered it; the manager's own `setNode` was the last door that had not
   * been told, and it did not keep one of the three — given a set it answered **null**, because it
   * read `nodeId` and `startNodeId` and a set has neither.
   *
   * Kept as a test rather than deleted with the entry: a recorded measurement is what tells the next
   * person the answer arrived, and this file's whole purpose is to stay true rather than be
   * remembered.
   */
  it('selects more than one box, which is what a page builder is for', () => {
    const editor = new Editor({ schema: schema() } as never);
    editor.loadDocument(page as never, 'spike');

    editor.selectionManager.setNode({ type: 'node', nodeIds: ['rect-1', 'rect-2'] } as never);
    const selection = editor.selection as Record<string, unknown> | null;

    expect(selection).not.toBeNull();
    expect(selection?.nodeIds).toEqual(['rect-1', 'rect-2']);
    // The ends still name real nodes, for everything written before a set existed.
    expect(selection?.startNodeId).toBe('rect-1');
    expect(selection?.endNodeId).toBe('rect-2');
  });

  /**
   * The context every toolbar control asks before drawing itself.
   *
   * Word's ribbon asks `canIndent`, `selectionEmpty`, `inTable`. A page builder
   * would ask different ones — but it has to be able to ask *anything* without
   * a caret, and the context is computed from the selection.
   */
  it('answers a context question with a node selection', () => {
    const editor = new Editor({ schema: schema() } as never);
    editor.loadDocument(page as never, 'spike');
    editor.selectionManager.setNode({ type: 'node', nodeId: 'rect-1' });

    const context = (editor as any).getContext?.();
    expect(context, 'no context to read').toBeDefined();
    expect(typeof context.selectionEmpty).toBe('boolean');
  });
});
