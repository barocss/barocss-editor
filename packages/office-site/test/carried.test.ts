import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { removeChild, setAttrs, transaction } from '@barocss/model';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { carriedFor, missingFrom, type CarrySource } from '../src/carried';
import { datasetsOf } from '../src/data';
import { documentFaults } from '../src/faults';

/**
 * **What a copied block has to travel with.**
 *
 * A page's blocks refer to five things by name, and a name means nothing in another document. The
 * fault this closes is the quiet one: pasting a card into a site that does not define its component
 * *succeeded* — an empty placement, drawing nothing, with nothing anywhere saying why.
 *
 * Held here rather than in a browser for the reason every reference rule in this package is: the
 * symptom is a block that draws as *nothing*, and a screenshot of nothing looks exactly like a
 * screenshot of a block that has not loaded yet.
 */
describe('a block that travels with what it refers to', () => {
  let editor: any;
  let store: DataStore;
  let source: CarrySource;

  /** The document as `carried.ts` reads it — the same three things the clipboard hands it. */
  const sourceOf = (ed: any, st: DataStore): CarrySource => ({
    rootId: ed.getRootId(),
    getNode: (sid: string) => st.getNode(sid),
    treeAt: (sid: string) => ed.exportDocument(sid)
  });

  const fresh = () => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    const st = new DataStore(undefined as never, schema as never);
    const ed = createSiteEditor({ editable: true, schema, dataStore: st } as never);
    ed.loadDocument(createSampleSite(), 'site');
    return { editor: ed, store: st };
  };

  /** Every sid in the document, so a test can find a block by what it says rather than by index. */
  const every = (st: DataStore, rootId: string): string[] => {
    const found: string[] = [];
    const walk = (sid: string, depth = 0) => {
      if (depth > 64) return;
      found.push(sid);
      for (const child of (st.getNode(sid)?.content ?? []) as unknown[]) {
        if (typeof child === 'string') walk(child, depth + 1);
      }
    };
    walk(rootId);
    return found;
  };

  const firstWhere = (st: DataStore, rootId: string, is: (node: any) => boolean): string =>
    every(st, rootId).find((sid) => is(st.getNode(sid)))!;

  beforeEach(() => {
    const made = fresh();
    editor = made.editor;
    store = made.store;
    source = sourceOf(editor, store);
  });

  /** The sample's product list: a collection on `상품`, holding a placement of `상품 카드`. */
  const productList = () =>
    firstWhere(store, editor.getRootId(), (node) => node?.attributes?.name === '상품 목록');

  it('carries the component a placement names, and the dataset the list reads', () => {
    const tree = editor.exportDocument(productList());
    const carried = carriedFor(source, [tree]);

    expect(carried.components.map((one: any) => one.attributes.id)).toContain('product-card');
    expect(carried.datasets.map((one: any) => one.attributes.name)).toEqual(['상품']);
  });

  /**
   * **A card that holds a card travels whole.**
   *
   * The one-level version of this passes without the recursion and is wrong the moment a definition
   * is placed inside another one — which is what a header holding a button already is.
   */
  it('carries what the carried definitions themselves refer to', () => {
    const header = firstWhere(
      store,
      editor.getRootId(),
      (node) => node?.stype === 'instance' && node.attributes?.componentId === 'site-header'
    );
    const carried = carriedFor(source, [editor.exportDocument(header)]);

    const ids = carried.components.map((one: any) => one.attributes.id);
    expect(ids).toContain('site-header');
    // The header places the button, so the button comes too.
    expect(ids).toContain('cta');
    // And the colours all three of them are painted in.
    expect(carried.variables.map((one: any) => one.attributes.name)).toContain('강조');
  });

  it('carries the connection a form sends to, and the colours it is painted in', () => {
    const form = firstWhere(store, editor.getRootId(), (node) => node?.stype === 'form');
    const carried = carriedFor(source, [editor.exportDocument(form)]);

    expect(carried.services.map((one: any) => one.attributes.name)).toEqual(['문의함']);
    expect(carried.variables.map((one: any) => one.attributes.name)).toEqual(
      expect.arrayContaining(['면', '선'])
    );
  });

  /**
   * **A name that already means something is not renamed.**
   *
   * The whole reason carrying works: a card pasted into a site with a different brand comes out in
   * that site's colours. A paste that renamed would give the document a `강조 2` nobody asked for,
   * and the second paste a `강조 3`.
   */
  it('adds nothing a document already has under that name', () => {
    const tree = editor.exportDocument(productList());
    const carried = carriedFor(source, [tree]);

    // Into itself: it defines every one of them already.
    const missing = missingFrom(source, carried);
    expect(missing.components).toEqual([]);
    expect(missing.datasets).toEqual([]);
    expect(missing.variables).toEqual([]);
  });

  it('names what a document has not got, so a paste knows what to add', () => {
    const carried = carriedFor(source, [editor.exportDocument(productList())]);

    // A document with no resources and no definitions at all: everything is missing.
    const bare: CarrySource = {
      rootId: 'root',
      getNode: (sid: string) => (sid === 'root' ? { sid: 'root', stype: 'document', content: [] } : undefined),
      treeAt: () => undefined
    };
    const missing = missingFrom(bare, carried);
    expect(missing.components.map((one: any) => one.attributes.id)).toContain('product-card');
    expect(missing.datasets.map((one: any) => one.attributes.name)).toEqual(['상품']);
  });

  /**
   * The whole gesture, through the commands, across **two documents** — which is the only place the
   * fault ever showed and the reason the payload is JSON: two windows agree on nothing else.
   */
  describe('copied out of one site and pasted into another', () => {
    let held = '';
    let before: PropertyDescriptor | undefined;

    beforeEach(() => {
      held = '';
      before = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: {
          clipboard: {
            writeText: async (text: string) => void (held = text),
            readText: async () => held
          }
        }
      });
    });

    afterEach(() => {
      if (before) Object.defineProperty(globalThis, 'navigator', before);
      else delete (globalThis as never as Record<string, unknown>).navigator;
    });

    it('brings the component and the dataset with it', async () => {
      expect(await editor.executeCommand('copyBlocks', { nodeIds: [productList()] })).toBe(true);
      expect(held).toContain('barocssSite');

      // A second site, with the definition and the data taken out of it.
      const other = fresh();
      const otherSource = sourceOf(other.editor, other.store);
      const rootId = other.editor.getRootId();

      const definition = firstWhere(
        other.store,
        rootId,
        (node) => node?.stype === 'component' && node.attributes?.id === 'product-card'
      );
      const dataset = datasetsOf(otherSource as never).find((one) => one.name === '상품')!.sid!;
      /*
       * Taken out with the model's own step rather than a command: neither a definition nor a
       * dataset is a *block*, so `removeBlocks` refuses both — correctly, and that refusal is why
       * this had to be built by hand rather than clicked.
       */
      await transaction(other.editor, [
        removeChild(String(other.store.getNode(definition)!.parentId), definition),
        removeChild(String(other.store.getNode(dataset)!.parentId), dataset)
      ] as never).commit();
      expect(datasetsOf(otherSource as never).some((one) => one.name === '상품')).toBe(false);

      const page = firstWhere(other.store, rootId, (node) => node?.stype === 'surface');
      expect(await other.editor.executeCommand('pasteBlocks', { pageId: page })).toBe(true);

      // Both arrived, once, under the names the copied block already refers to.
      expect(datasetsOf(otherSource as never).filter((one) => one.name === '상품')).toHaveLength(1);
      const defs = every(other.store, rootId)
        .map((sid) => other.store.getNode(sid))
        .filter((node) => node?.stype === 'component' && node.attributes?.id === 'product-card');
      expect(defs).toHaveLength(1);

      // And the pasted list is not a fault: the placement it holds resolves.
      const said = documentFaults(otherSource as never).filter((one) => one.kind === 'reference');
      expect(said).toEqual([]);
    });

    it('leaves a second paste with nothing to add', async () => {
      await editor.executeCommand('copyBlocks', { nodeIds: [productList()] });

      const other = fresh();
      const otherSource = sourceOf(other.editor, other.store);
      const rootId = other.editor.getRootId();
      const page = firstWhere(other.store, rootId, (node) => node?.stype === 'surface');

      const was = ((other.store.getNode(page)?.content ?? []) as unknown[]).length;
      expect(await other.editor.executeCommand('pasteBlocks', { pageId: page })).toBe(true);
      expect(await other.editor.executeCommand('pasteBlocks', { pageId: page })).toBe(true);

      // Two lists, one dataset — a paste adds a *block* every time and a definition once.
      expect(((other.store.getNode(page)?.content ?? []) as unknown[]).length).toBe(was + 2);
      expect(datasetsOf(otherSource as never).filter((one) => one.name === '상품')).toHaveLength(1);
    });
  });
});

/**
 * And the fault the paste used to leave behind, now that something reports it.
 *
 * Two of the five reference kinds had no check at all — the other three are caught by the
 * collection, the form and the picture that hold them.
 */
describe('a reference pointing at nothing', () => {
  let editor: any;
  let store: DataStore;
  let doc: any;

  beforeEach(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
  });

  const said = () => documentFaults(doc).filter((one) => one.kind === 'reference').map((one) => one.said);

  it('says nothing about a document whose names all resolve', () => {
    expect(said()).toEqual([]);
  });

  it('reports a placement of a definition this document has not got', async () => {
    const placement = ((): string => {
      const found: string[] = [];
      const walk = (sid: string, depth = 0) => {
        if (depth > 64) return;
        if (store.getNode(sid)?.stype === 'instance') found.push(sid);
        for (const child of (store.getNode(sid)?.content ?? []) as unknown[]) {
          if (typeof child === 'string') walk(child, depth + 1);
        }
      };
      walk(doc.rootId);
      return found[0];
    })();

    await transaction(editor, [setAttrs(placement, { componentId: '없는 카드' })] as never).commit();
    expect(said()).toContain("'없는 카드' 컴포넌트가 없습니다");
  });

  it('reports a colour naming a variable this document has not got', async () => {
    const painted = ((): string => {
      let at = '';
      const walk = (sid: string, depth = 0) => {
        if (at || depth > 64) return;
        if (String(store.getNode(sid)?.attributes?.fill ?? '').startsWith('var:')) at = sid;
        for (const child of (store.getNode(sid)?.content ?? []) as unknown[]) {
          if (typeof child === 'string') walk(child, depth + 1);
        }
      };
      walk(doc.rootId);
      return at;
    })();

    await transaction(editor, [setAttrs(painted, { fill: 'var:없는 색' })] as never).commit();
    expect(said()).toContain("'없는 색' 변수가 없습니다");
  });
});
