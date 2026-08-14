import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';

/**
 * Structural indenting, for a schema that asks for it.
 *
 * No schema in this repository does. Word nests a list by giving a paragraph a
 * numbering *level* rather than by putting one node inside another, so
 * `apps/word` indents through `numLevel` and `indentLeft` and never through
 * this — which left a capability spanning six packages with nothing exercising
 * it end to end, and it was broken in a way that read as working:
 * `dataStore.indentNode` returned false for a node no schema had marked
 * indentable, the operation reported `ok: true` with no inverse, and "declares
 * no inverse" is how the roster records an operation that cannot be undone.
 * Two operations, tested by a scenario in which neither could act.
 *
 * So this is the chain, run once for real: a schema that opts in, a document
 * that can be nested, the operation, the tree, and the way back.
 */
describe('a schema whose items may nest', () => {
  let dataStore: DataStore;
  let context: any;

  const run = async (type: string, payload: unknown) =>
    globalOperationRegistry.get(type)!.execute({ type, payload } as never, context);

  /**
   * Which item holds which — the list's own structure and nothing below it.
   *
   * Every item carries a paragraph carrying a run, and neither moves; showing
   * them would bury the one thing these tests are about.
   */
  const shape = (sid = 'list-1'): unknown => {
    const node = dataStore.getNode(sid);
    if (!node) return null;
    const nested = ((node.content ?? []) as string[]).filter(
      (child) => dataStore.getNode(child)?.stype === 'listItem'
    );
    return nested.length > 0 ? { [sid]: nested.map((child) => shape(child)) } : sid;
  };

  beforeEach(() => {
    const schema = new Schema('outliner', {
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        list: { name: 'list', group: 'block', content: 'listItem+' },
        // The opt-in, and the only reason any of this runs
        listItem: {
          name: 'listItem',
          group: 'block',
          content: 'block*',
          indentable: true,
          indentParentTypes: ['listItem']
        },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline-text*' },
        'inline-text': { name: 'inline-text', group: 'inline', content: 'text*' }
      },
      marks: {}
    });

    dataStore = new DataStore(undefined, schema);
    context = createTransactionContext(dataStore, new SelectionManager({ dataStore }), schema);

    const set = (node: Record<string, unknown>) => dataStore.setNode(node as never);
    set({ sid: 'doc-1', stype: 'document', content: ['list-1'] });
    set({ sid: 'list-1', stype: 'list', content: ['li-1', 'li-2', 'li-3'], parentId: 'doc-1' });
    for (const item of ['li-1', 'li-2', 'li-3']) {
      set({ sid: item, stype: 'listItem', content: [`p-${item}`], parentId: 'list-1' });
      set({ sid: `p-${item}`, stype: 'paragraph', content: [`t-${item}`], parentId: item });
      set({ sid: `t-${item}`, stype: 'inline-text', text: item, parentId: `p-${item}` });
    }
    dataStore.setRootNodeId('doc-1');
  });

  it('nests an item under the one above it', async () => {
    const result: any = await run('indentNode', { nodeId: 'li-2' });
    expect(result.ok).toBe(true);
    expect(shape()).toEqual({ 'list-1': [{ 'li-1': ['li-2'] }, 'li-3'] });
  });

  it('refuses the first item, which has nothing to nest under', async () => {
    // And says so, rather than reporting success at doing nothing — which is
    // what made this look like an operation with no inverse
    const result: any = await run('indentNode', { nodeId: 'li-1' });
    expect(result.ok).toBe(false);
    expect(result.inverse).toBeUndefined();
  });

  it('puts it back exactly, at the index it came from', async () => {
    const before = shape();
    const result: any = await run('indentNode', { nodeId: 'li-2' });

    // `moveNode` to where it was, not `outdentNode`: indenting puts a node at
    // the *end* of its previous sibling and outdenting puts it after its
    // parent, so the pair is a round trip only when it started last.
    expect(result.inverse).toMatchObject({
      type: 'moveNode',
      payload: { nodeId: 'li-2', newParentId: 'list-1', position: 1 }
    });
    await run(result.inverse.type, result.inverse.payload);
    expect(shape()).toEqual(before);
  });

  it('lifts a nested item back out', async () => {
    await run('indentNode', { nodeId: 'li-2' });
    const result: any = await run('outdentNode', { nodeId: 'li-2' });
    expect(result.ok).toBe(true);
    expect(shape()).toEqual({ 'list-1': ['li-1', 'li-2', 'li-3'] });
  });

  /**
   * Outdenting a top-level item takes it out of the list.
   *
   * Which is what "move under the parent's parent" says, and the parent's parent
   * of a top-level item is the document. An outliner would want this refused —
   * there is no level above the top — and the engine has no rule for it:
   * `indentParentTypes` constrains what a node may be nested *under* and has no
   * counterpart for lifting one out.
   *
   * Recorded rather than fixed. Adding the constraint is a product decision and
   * no product here has asked for one; what matters is that it is written down,
   * because the operation reports success and a reader would find out from the
   * document.
   */
  it('lifts a top-level item clean out of the list', async () => {
    const result: any = await run('outdentNode', { nodeId: 'li-2' });
    expect(result.ok).toBe(true);
    expect(shape()).toEqual({ 'list-1': ['li-1', 'li-3'] });
    expect(dataStore.getNode('li-2')?.parentId).toBe('doc-1');

    // And it is still exactly reversible, which is what this file is for
    await run(result.inverse.type, result.inverse.payload);
    expect(shape()).toEqual({ 'list-1': ['li-1', 'li-2', 'li-3'] });
  });

  it('nests two in a row under the same item, and undoes both', async () => {
    const before = shape();
    const first: any = await run('indentNode', { nodeId: 'li-2' });
    const second: any = await run('indentNode', { nodeId: 'li-3' });

    // Both under `li-1`, not one inside the other: indenting nests a node under
    // its *previous sibling*, and once `li-2` has moved it is no longer `li-3`'s
    // sibling — `li-1` is.
    expect(shape()).toEqual({ 'list-1': [{ 'li-1': ['li-2', 'li-3'] }] });

    // In reverse, which is the order a transaction collects them in
    await run(second.inverse.type, second.inverse.payload);
    await run(first.inverse.type, first.inverse.payload);
    expect(shape()).toEqual(before);
  });
});
