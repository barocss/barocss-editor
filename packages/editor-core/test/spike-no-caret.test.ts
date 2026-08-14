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
    expect(found).toEqual(['document', 'page', 'frame', 'rectangle']);
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

    // `editor.selection` is read-only, so it goes through the manager — which
    // already has `setNode`, and takes exactly *one* node. A page builder wants
    // several: marquee-select three boxes and align them.
    editor.selectionManager.setNode({ type: 'node', nodeId: 'rect-1' });
    expect(editor.selection?.type).toBe('node');
    expect((editor.selection as any)?.startNodeId ?? (editor.selection as any)?.nodeId).toBe(
      'rect-1'
    );
  });

  /**
   * The one thing a page builder needs that no text editor ever does.
   *
   * Marquee three boxes and align them: the selection is a *set* of nodes.
   * `SelectionManager.setNode` takes one, and `ModelSelection` has no shape for
   * more — the whole type is start/end and offsets.
   */
  it('cannot yet select more than one box', () => {
    const editor = new Editor({ schema: schema() } as never);
    editor.loadDocument(page as never, 'spike');

    editor.selectionManager.setNode({ type: 'node', nodeId: 'rect-1' });
    const selection = editor.selection as Record<string, unknown> | null;

    // Recorded rather than asserted away: this is the finding, and it is the
    // first thing phase 2 has to answer.
    expect(selection).not.toBeNull();
    expect(Array.isArray((selection as any)?.nodeIds)).toBe(false);
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
