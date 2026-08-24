import { describe, it, expect } from 'vitest';
import { DataStore } from '../src/data-store';
import { DataStoreExporter } from '../src/loader';

/**
 * What a node's children are **for a reader**, when they are not what the document holds.
 *
 * One product needs it: a slide's placement of a component draws the *component's* parts, and those
 * parts belong to the definition. It has to happen where children are resolved, because everything
 * downstream is evaluated against the child that arrives — its own coordinates, the words in it,
 * the slot a nested renderer fills. A renderer that built those elements itself evaluated all of
 * them against the placement instead, which was measured before this hook existed.
 *
 * The other half of why it belongs here: the view reads children through this proxy and the **save**
 * walks the stored nodes. So a resolver can change what is drawn and cannot change what is written.
 */
describe('the children a reader sees', () => {
  /**
   * A document with a holder that has one child of its own, and a node kept elsewhere.
   *
   * Built with `setNode` and explicit sids, which is what a loaded document is: children are ids,
   * and the store answers by id.
   */
  const deck = () => {
    const store = new DataStore();
    store.setNode({ sid: 'root', stype: 'document', attributes: {}, content: ['holder', 'elsewhere'] } as never, false);
    store.setNode({ sid: 'holder', stype: 'holder', attributes: {}, content: ['own'], parentId: 'root' } as never, false);
    store.setNode({ sid: 'own', stype: 'own', attributes: { n: 1 }, content: [], parentId: 'holder' } as never, false);
    store.setNode({ sid: 'elsewhere', stype: 'elsewhere', attributes: { n: 2 }, content: [], parentId: 'root' } as never, false);
    store.setRootNodeId('root');
    return { store, root: 'root', holder: 'holder', own: 'own', elsewhere: 'elsewhere' };
  };

  it('draws the ordinary children when nothing is registered', () => {
    const { store, root, own } = deck();
    const proxy: any = new DataStoreExporter(store).toProxy(root);
    const holder = proxy.content[0];
    expect(holder.content.map((one: any) => one.sid)).toEqual([own]);
  });

  it('draws what the resolver says, with each child’s own data', () => {
    const { store, root, holder, elsewhere } = deck();
    store.setContentResolver((node, getNode) =>
      node.stype === 'holder' ? [getNode(elsewhere) as never] : undefined
    );

    const proxy: any = new DataStoreExporter(store).toProxy(root);
    const drawn = proxy.content.find((one: any) => one.sid === holder);
    // The other node, with its own sid and its own attributes — which is the whole point: a part
    // drawn with the placement's data was the fault this replaces.
    expect(drawn.content.map((one: any) => one.sid)).toEqual([elsewhere]);
    expect(drawn.content[0].attributes.n).toBe(2);
  });

  it('resolves the resolved children’s children too', () => {
    const { store, root, holder, elsewhere } = deck();
    store.setNode({ sid: 'inner', stype: 'inner', attributes: {}, content: [], parentId: elsewhere } as never, false);
    store.setNode({ sid: elsewhere, stype: 'elsewhere', attributes: { n: 2 }, content: ['inner'], parentId: 'root' } as never, false);
    const inner = 'inner';
    store.setContentResolver((node, getNode) =>
      node.stype === 'holder' ? [getNode(elsewhere) as never] : undefined
    );

    const proxy: any = new DataStoreExporter(store).toProxy(root);
    const drawn = proxy.content.find((one: any) => one.sid === holder);
    // A part is usually a frame with things in it, so the tree below it has to arrive as well.
    expect(drawn.content[0].content.map((one: any) => one.sid)).toEqual([inner]);
  });

  it('does not change what is written', () => {
    const { store, root, holder, own, elsewhere } = deck();
    store.setContentResolver((node, getNode) =>
      node.stype === 'holder' ? [getNode(elsewhere) as never] : undefined
    );

    /*
     * The separation this hook rests on. A file written with resolved children would be a lie about
     * what the reader has — and the save has its own walk, so it cannot happen.
     */
    const tree: any = new DataStoreExporter(store).exportToTree(root);
    const written = tree.content.find((one: any) => one.stype === 'holder');
    expect(written.content.map((one: any) => one.sid)).toEqual([own]);
  });

  it('is taken off again', () => {
    const { store, root, holder, own, elsewhere } = deck();
    store.setContentResolver((node, getNode) =>
      node.stype === 'holder' ? [getNode(elsewhere) as never] : undefined
    );
    store.setContentResolver(undefined);
    const proxy: any = new DataStoreExporter(store).toProxy(root);
    const drawn = proxy.content.find((one: any) => one.sid === holder);
    expect(drawn.content.map((one: any) => one.sid)).toEqual([own]);
  });
});
