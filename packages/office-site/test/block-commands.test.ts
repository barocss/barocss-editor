import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { blocksIn, pagesOf } from '../src/selection';

/**
 * A block, **by the name the sample gave it** — at any depth under the page.
 *
 * The fixtures used to hunt for "the stack with three children", which stopped meaning one thing the
 * moment the sample grew a grid of six and a hero of two — and that is the same lesson the browser
 * suite learned: a block is found by *what it is*, never by what it currently looks like.
 *
 * Deep rather than among the page's own children, which is the second half of the same lesson. A
 * section on a real page is a band that carries the colour with a column inside it that carries the
 * words, so everything a test wants to hold is one or two levels down — and a helper that looked
 * only at the top found the band and reported it as empty.
 */
const named = (doc: any, page: string, name: string): string => {
  const walk = (sid: string): string | undefined => {
    for (const child of blocksIn(doc, sid)) {
      if (doc.getNode(child)?.attributes?.name === name) return child;
      const found = walk(child);
      if (found) return found;
    }
    return undefined;
  };
  return walk(page)!;
};


/**
 * Moving a block, copying it, taking it away.
 *
 * Held here rather than in a browser because an off-by-one in a reorder is a drag that goes
 * backwards — the one fault a reader cannot explain — and it is settled in a millisecond by asking
 * the document what order it is in.
 */
describe('what a reader can do to a block', () => {
  let editor: any;
  let store: DataStore;
  let doc: any;
  let page: string;
  let cardRow: string;

  const run = async (name: string, payload?: Record<string, unknown>) =>
    await editor.executeCommand(name, payload);

  const order = (sid: string) => blocksIn(doc, sid).map((child: string) => doc.getNode(child).stype);

  beforeEach(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    page = pagesOf(doc)[0].sid;
    cardRow = named(doc, page, '제품 셋');
  });

  it('takes a block away, and lets go of it', async () => {
    const [first] = blocksIn(doc, cardRow);
    editor.executeCommand('setNode', { nodeIds: [first] });

    expect(await run('removeBlocks')).toBe(true);
    expect(blocksIn(doc, cardRow)).toHaveLength(2);
    // A selection naming a node that is gone is a panel describing something nobody can see.
    expect(editor.selection?.nodeIds ?? []).toEqual([]);
  });

  it('refuses what a reader cannot remove', async () => {
    // The page is the board, not a block on it.
    expect(editor.canExecuteCommand('removeBlocks', { nodeIds: [page] })).toBe(false);
  });

  it('copies a block next to it, not to the end of the stack', async () => {
    const before = blocksIn(doc, cardRow);
    expect(await run('duplicateBlocks', { nodeIds: [before[0]] })).toBe(true);

    const after = blocksIn(doc, cardRow);
    expect(after).toHaveLength(4);
    // Beside the original, which is where a reader looks for it — a duplicate at the bottom of the
    // page is a duplicate they have to go and find.
    expect(after[0]).toBe(before[0]);
    expect(after[2]).toBe(before[1]);

    // A copy, with its own identity all the way down: two nodes claiming one sid is the store's
    // rule broken, and the words are the reader's so they come along.
    const copy = doc.getNode(after[1]);
    expect(copy.sid).not.toBe(before[0]);
    expect(copy.attributes.layoutMode).toBe(doc.getNode(before[0]).attributes.layoutMode);
    expect(blocksIn(doc, after[1]).map((sid: string) => doc.getNode(sid).stype)).toEqual(
      blocksIn(doc, before[0]).map((sid: string) => doc.getNode(sid).stype)
    );
  });

  it('copies each of several without shifting the next one out from under it', async () => {
    const before = blocksIn(doc, cardRow);
    expect(await run('duplicateBlocks', { nodeIds: [before[0], before[1]] })).toBe(true);

    const after = blocksIn(doc, cardRow);
    expect(after).toHaveLength(5);
    // original, copy, original, copy, original — which is only true if each copy was placed from
    // the end backwards.
    expect([after[0], after[2], after[4]]).toEqual(before);
  });

  it('moves a block into a stack, at a place', async () => {
    const [first, , third] = blocksIn(doc, cardRow);
    expect(await run('moveBlockInto', { nodeId: third, parentId: cardRow, index: 0 })).toBe(true);
    expect(blocksIn(doc, cardRow)[0]).toBe(third);
    expect(blocksIn(doc, cardRow)[1]).toBe(first);
  });

  it('moves a block into another stack entirely', async () => {
    const [first] = blocksIn(doc, cardRow);
    const hero = named(doc, page, '히어로');
    expect(await run('moveBlockInto', { nodeId: first, parentId: hero, index: 0 })).toBe(true);

    expect(blocksIn(doc, cardRow)).toHaveLength(2);
    expect(blocksIn(doc, hero)[0]).toBe(first);
    expect(order(hero)[0]).toBe('frame');
  });

  it('refuses a move that would make the document its own child', async () => {
    const [first] = blocksIn(doc, cardRow);
    // Into itself.
    expect(editor.canExecuteCommand('moveBlockInto', { nodeId: cardRow, parentId: cardRow })).toBe(false);
    // And into something it holds, which is the case a visited set alone would miss.
    expect(editor.canExecuteCommand('moveBlockInto', { nodeId: cardRow, parentId: first })).toBe(false);
  });

  it('is one entry in the history, so one undo puts it back', async () => {
    const before = blocksIn(doc, cardRow);
    await run('duplicateBlocks', { nodeIds: [before[0]] });
    expect(blocksIn(doc, cardRow)).toHaveLength(4);

    await editor.executeCommand('undo');
    expect(blocksIn(doc, cardRow)).toEqual(before);
  });
  /**
   * **Lining placed blocks up, and spreading them out.**
   *
   * The arithmetic rather than the gesture: a browser holds the drag and this holds the numbers, and
   * they are different questions. Every one of these is in **twips**, which is what the document
   * keeps — a test written in pixels would pass against a command that was out by fifteen.
   */
  describe('where several placed blocks sit', () => {
    /** Three blocks taken out of the flow at three different places and three different widths. */
    const three = async (): Promise<string[]> => {
      const found = blocksIn(doc, page).slice(0, 3);
      for (const [where, sid] of found.entries()) {
        await run('setBlockFormat', {
          nodeIds: [sid],
          position: 'absolute',
          insetLeft: (where + 1) * 100,
          insetTop: (where + 1) * 50,
          maxWidth: 400 - where * 100,
          minHeight: 200
        });
      }
      return found;
    };
    const at = (sid: string) => {
      const attrs = store.getNode(sid)?.attributes as Record<string, number>;
      return { left: attrs.insetLeft, top: attrs.insetTop };
    };

    it('lines them up on the outermost edge, not on their parent', async () => {
      const found = await three();
      await run('alignBlocks', { nodeIds: found, how: 'left' });
      // 100 is the leftmost of the three; the parent's own edge is 0 and is deliberately not it.
      expect(found.map((sid) => at(sid).left)).toEqual([100, 100, 100]);
    });

    it('lines up a right edge by where each block ends, not where it starts', async () => {
      const found = await three();
      // Widths 400, 300, 200 at 100, 200, 300 — so the rightmost edge is 500.
      await run('alignBlocks', { nodeIds: found, how: 'right' });
      expect(found.map((sid) => at(sid).left)).toEqual([100, 200, 300]);
    });

    it('centres them on the middle of what they span', async () => {
      const found = await three();
      await run('alignBlocks', { nodeIds: found, how: 'centreX' });
      // The span is 100..500, so the middle is 300 and each sits half its own width before it.
      expect(found.map((sid) => at(sid).left)).toEqual([100, 150, 200]);
    });

    it('spreads the middle one and leaves the two ends where they are', async () => {
      const found = await three();
      const ends = [at(found[0]).left, at(found[2]).left];
      await run('alignBlocks', { nodeIds: found, how: 'spreadX' });
      expect([at(found[0]).left, at(found[2]).left]).toEqual(ends);
      // Even **space between**, not even centres — the one every tool computes.
      expect(at(found[1]).left).toBe(100 + 400 + Math.round((400 - 900) / 2));
    });

    it('refuses to spread two, because there is nothing between them', async () => {
      const found = await three();
      expect(editor.canExecuteCommand('alignBlocks', { nodeIds: found.slice(0, 2), how: 'spreadX' })).toBe(false);
      expect(editor.canExecuteCommand('alignBlocks', { nodeIds: found.slice(0, 2), how: 'left' })).toBe(true);
    });

    it('refuses a block the stack placed, whichever gesture is asked for', async () => {
      const stacked = blocksIn(doc, page).slice(0, 2);
      expect(editor.canExecuteCommand('alignBlocks', { nodeIds: stacked, how: 'left' })).toBe(false);
      expect(editor.canExecuteCommand('nudgeBlock', { nodeIds: stacked, axis: 'x', by: 15 })).toBe(false);
    });

    it('nudges by the number it is given, on the axis it is given', async () => {
      const found = await three();
      await run('nudgeBlock', { nodeIds: [found[0]], axis: 'x', by: 15 });
      expect(at(found[0])).toEqual({ left: 115, top: 50 });
      await run('nudgeBlock', { nodeIds: [found[0]], axis: 'y', by: -150 });
      expect(at(found[0])).toEqual({ left: 115, top: -100 });
    });

    it('moves every chosen block by the same amount, in one entry of the history', async () => {
      const found = await three();
      await run('nudgeBlock', { nodeIds: found, axis: 'x', by: 150 });
      expect(found.map((sid) => at(sid).left)).toEqual([250, 350, 450]);

      // One press, one undo — which is what makes holding an arrow key down usable.
      await run('undo', {});
      expect(found.map((sid) => at(sid).left)).toEqual([100, 200, 300]);
    });
  });
});

/**
 * A block at the top of a page, which is the one a reader reaches for first.
 *
 * Written after a browser probe said duplicating a section did nothing and a `console.log` was about
 * to be added to find out why. This answers the same question in a millisecond, and it answers it
 * about the *model* — so if it passes and the browser still refuses, the fault is in the app and the
 * search is already halved.
 */
/**
 * **Going up a level**, which every tool of this kind has and this one only listened for.
 *
 * The gesture existed as an `Escape` handler in the app: undeclared, so in no menu and printable
 * beside nothing, and it climbed only while the reader happened to be inside a **drill**. Any other
 * selection — a click, the layer list, ⌘A, the block a paste leaves behind — carried no scope, and
 * `Escape` fell through to clearing the whole thing. Measured on the sample: a paragraph seven
 * levels deep went to nothing selected, in one key.
 *
 * Held here rather than in a browser because the question is about **the tree**, and a walk up a
 * tree is settled by asking the document, in a millisecond, at every depth the sample has.
 */
describe('selecting what holds a block', () => {
  let editor: any;
  let store: DataStore;
  let doc: any;
  let page: string;

  const at = (sid: string) => doc.getNode(sid)?.stype;
  const chosen = () => (editor.selection?.nodeIds ?? []) as string[];

  beforeEach(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    page = pagesOf(doc)[0].sid;
  });

  it('climbs one level, and keeps climbing', async () => {
    const row = named(doc, page, '제품 셋');
    const card = blocksIn(doc, row)[0];
    const inside = blocksIn(doc, card)[0];
    editor.executeCommand('setNode', { nodeIds: [inside] });

    expect(await editor.executeCommand('selectParent')).toBe(true);
    expect(chosen()).toEqual([card]);

    expect(await editor.executeCommand('selectParent')).toBe(true);
    expect(chosen()).toEqual([row]);
  });

  /**
   * And it stops at the page rather than selecting it.
   *
   * A page is the board, not a block on it — `SELECTABLE` leaves it out on purpose — so returning it
   * would put the panel in a state a click cannot reach. Refusing is also what lets the app's
   * `Escape` keep its old meaning underneath: climb while there is somewhere to climb, clear the
   * selection at the top.
   */
  it('refuses at the top of a page, rather than selecting the page', async () => {
    const top = blocksIn(doc, page)[0];
    editor.executeCommand('setNode', { nodeIds: [top] });

    expect(editor.canExecuteCommand('selectParent', { nodeIds: [top] })).toBe(false);
    expect(await editor.executeCommand('selectParent')).toBe(false);
    // Untouched, so the app can decide what a key with nothing to do should mean.
    expect(chosen()).toEqual([top]);
  });

  /**
   * Two blocks with one parent between them go up to **one** block, not two of it.
   *
   * A selection is a set, and the set of parents is a set too. Written because the naive version
   * maps and would have selected the same row twice — which reads as one selection everywhere
   * except the count in the panel's heading.
   */
  it('takes two siblings up to the one thing that holds them', async () => {
    const row = named(doc, page, '제품 셋');
    const [first, second] = blocksIn(doc, row);
    editor.executeCommand('setNode', { nodeIds: [first, second] });

    expect(await editor.executeCommand('selectParent')).toBe(true);
    expect(chosen()).toEqual([row]);
  });

  /**
   * And a **locked** block is not a rung on the ladder.
   *
   * `pathFromPage` leaves a locked node out of the chain entirely, which is the whole of what a lock
   * does here — so going up from inside one lands on whatever holds *it*, rather than selecting the
   * thing the reader said they were finished nudging.
   */
  it('steps over a locked block on the way up', async () => {
    const row = named(doc, page, '제품 셋');
    const card = blocksIn(doc, row)[0];
    const inside = blocksIn(doc, card)[0];
    await editor.executeCommand('setBlockFormat', { nodeIds: [card], locked: true });
    editor.executeCommand('setNode', { nodeIds: [inside] });

    expect(await editor.executeCommand('selectParent')).toBe(true);
    expect(chosen()).toEqual([row]);
    expect(at(row)).toBe('frame');
  });
});

describe('a block at the top of a page', () => {
  let editor: any;
  let store: DataStore;
  let doc: any;
  let page: string;

  beforeEach(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    page = pagesOf(doc)[0].sid;
  });

  it('can be copied, and the copy is on the page beside it', async () => {
    const before = blocksIn(doc, page);
    const section = before[1];

    expect(editor.canExecuteCommand('duplicateBlocks', { nodeIds: [section] })).toBe(true);
    expect(await editor.executeCommand('duplicateBlocks', { nodeIds: [section] })).toBe(true);

    const after = blocksIn(doc, page);
    expect(after).toHaveLength(before.length + 1);
    expect(after[1]).toBe(section);
    expect(doc.getNode(after[2]).stype).toBe(doc.getNode(section).stype);
  });

  it('can be taken away, and the page keeps the rest', async () => {
    const before = blocksIn(doc, page);
    expect(await editor.executeCommand('removeBlocks', { nodeIds: [before[1]] })).toBe(true);
    expect(blocksIn(doc, page)).toHaveLength(before.length - 1);
    // And the document still matches the schema, which is the thing a delete is most likely to break.
    expect(editor.documentFaults).toEqual([]);
  });
});

/**
 * Reordering **inside one stack**, at every place it can go.
 *
 * The case a browser found and could not explain: a card dragged to the end of its own row came out
 * with two of its neighbours swapped. A move within one parent removes and re-inserts in the same
 * array, which is the one arithmetic that can be off by one in both directions at once — so it is
 * asked here, at every index, in a millisecond.
 */
describe('reordering inside one stack', () => {
  let editor: any;
  let store: DataStore;
  let doc: any;
  let cardRow: string;

  beforeEach(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    const page = pagesOf(doc)[0].sid;
    cardRow = named(doc, page, '제품 셋');
  });

  const names = () =>
    blocksIn(doc, cardRow).map((sid: string) => {
      const heading = blocksIn(doc, sid)[0];
      const run = (doc.getNode(heading)?.content ?? [])[0];
      return doc.getNode(run)?.text;
    });

  it('starts as the sample wrote it', () => {
    // The widest card first, because it is the product the page is about — see `sample-site.ts`.
    expect(names()).toEqual(['사이트', '문서', '덱']);
  });

  it('moves the first to the end', async () => {
    const [first] = blocksIn(doc, cardRow);
    expect(await editor.executeCommand('moveBlockInto', { nodeId: first, parentId: cardRow, index: 2 })).toBe(true);
    expect(names()).toEqual(['문서', '덱', '사이트']);
  });

  it('moves the first to the middle', async () => {
    const [first] = blocksIn(doc, cardRow);
    await editor.executeCommand('moveBlockInto', { nodeId: first, parentId: cardRow, index: 1 });
    expect(names()).toEqual(['문서', '사이트', '덱']);
  });

  it('moves the last to the front', async () => {
    const last = blocksIn(doc, cardRow)[2];
    await editor.executeCommand('moveBlockInto', { nodeId: last, parentId: cardRow, index: 0 });
    expect(names()).toEqual(['덱', '사이트', '문서']);
  });

  it('leaves the order alone when a block is put back where it was', async () => {
    const [, second] = blocksIn(doc, cardRow);
    await editor.executeCommand('moveBlockInto', { nodeId: second, parentId: cardRow, index: 1 });
    expect(names()).toEqual(['사이트', '문서', '덱']);
  });
});

/**
 * The sequence a reader actually performs: select, copy, delete.
 *
 * Each command works on its own — the tests above say so — and the browser still refused the delete
 * that followed a copy. So the sequence is asked about here rather than there.
 */
describe('one thing after another', () => {
  let editor: any;
  let store: DataStore;
  let doc: any;
  let page: string;

  beforeEach(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    page = pagesOf(doc)[0].sid;
  });

  it('copies what is selected and then removes it, reading the selection each time', async () => {
    const before = blocksIn(doc, page);
    const section = before[1];
    editor.executeCommand('setNode', { nodeIds: [section] });

    expect(await editor.executeCommand('duplicateBlocks')).toBe(true);
    expect(blocksIn(doc, page)).toHaveLength(before.length + 1);

    /*
     * The **copy** is what is selected now — what every tool of this kind does, and the only way the
     * next command is safe. An edit rewrites the selection: measured, it came back as a *range* with
     * its ends inside the new nodes, so `selectedNodeIds` answered nothing and `Delete` refused.
     */
    const copy = blocksIn(doc, page)[2];
    expect(editor.selection?.nodeIds).toEqual([copy]);

    expect(await editor.executeCommand('removeBlocks')).toBe(true);
    expect(blocksIn(doc, page)).toHaveLength(before.length);
    // And the one that was copied is still there: Delete took the copy, not the original.
    expect(blocksIn(doc, page)).toContain(section);
  });
});

/**
 * What a placement answers, and what a page is called.
 *
 * The two the panel needed that no command could say. Both are asked here rather than in a browser,
 * because "does the second edit replace the first answer or add a second one" is arithmetic about a
 * content model and a browser would only show it going wrong later.
 */
describe('a placement’s answers, and a page’s own settings', () => {
  let editor: any;
  let store: DataStore;
  let doc: any;
  let page: string;

  beforeEach(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    page = pagesOf(doc)[0].sid;
  });

  /** The first placement under a named block, however deep the section that holds it is. */
  const placement = (name: string) => {
    const walk = (sid: string): string | undefined => {
      for (const child of blocksIn(doc, sid)) {
        if (doc.getNode(child)?.stype === 'instance') return child;
        const found = walk(child);
        if (found) return found;
      }
      return undefined;
    };
    return walk(named(doc, page, name))!;
  };

  const valuesOf = (sid: string) =>
    ((doc.getNode(sid)?.content ?? []) as string[])
      .map((child) => doc.getNode(child))
      .filter((child: any) => child?.stype === 'componentValue')
      .map((child: any) => [child.attributes.name, child.attributes.value]);

  it('replaces an answer the placement already gives', async () => {
    const button = placement('히어로');
    expect(valuesOf(button)).toEqual([['문구', '무료로 시작하기']]);

    expect(await editor.executeCommand('setComponentValue', { nodeId: button, name: '문구', value: '지금 시작' })).toBe(true);
    // One answer, edited — not two answers to one question, which is what an add would have made.
    expect(valuesOf(button)).toEqual([['문구', '지금 시작']]);
  });

  it('adds one the placement has not answered', async () => {
    const button = placement('히어로');
    await editor.executeCommand('setComponentValue', { nodeId: button, name: '색', value: 'var:강조' });
    expect(valuesOf(button)).toEqual([
      ['색', 'var:강조'],
      ['문구', '무료로 시작하기']
    ]);
  });

  it('refuses a question with no name, and a node that is not a placement', () => {
    const button = placement('히어로');
    expect(editor.canExecuteCommand('setComponentValue', { nodeId: button, name: '' })).toBe(false);
    expect(editor.canExecuteCommand('setComponentValue', { nodeId: page, name: '문구' })).toBe(false);
  });

  it('renames a page and moves its address', async () => {
    expect(await editor.executeCommand('setPageInfo', { nodeId: page, name: '처음', path: '/처음' })).toBe(true);
    expect(pagesOf(doc)[0]).toMatchObject({ name: '처음', path: '/처음' });
  });

  it('refuses to set a page’s address on something that is not a page', () => {
    const block = blocksIn(doc, page)[0];
    expect(editor.canExecuteCommand('setPageInfo', { nodeId: block, path: '/x' })).toBe(false);
  });
});

/**
 * **Inserting while the caret is in a table cell.**
 *
 * Every insert this product has — 섹션, 가로 스택, 그리드, 제목, 본문, 이미지, the whole 추가 rail
 * and the whole 삽입 menu — said it could run and did nothing, for as long as the caret was in a
 * cell. `_blockAt` stopped at the cell, whose parent is a table row, so each one tried to put a
 * block inside a row and the validator refused the whole transaction.
 *
 * Nothing in this repository had ever been in the state: the sample had no table in it, so there was
 * no cell to put a caret in. It appeared the day the pricing page grew a real comparison — which is
 * the argument for a fixture wearing what it tests, made by the fixture itself.
 */
describe('an insert, with the caret in a table cell', () => {
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

  /** The first cell of the sample's own comparison, and the run of words inside it. */
  const inACell = (): string => {
    for (const page of pagesOf(doc)) {
      let found = '';
      const walk = (sid: string, depth = 0) => {
        if (depth > 40 || found) return;
        const node = store.getNode(sid) as any;
        if (!node) return;
        if (node.stype === 'bTableCell') {
          found = sid;
          return;
        }
        for (const child of node.content ?? []) if (typeof child === 'string') walk(child, depth + 1);
      };
      walk(page.sid);
      if (found) return (store.getNode(found) as any).content[0] as string;
    }
    throw new Error('the sample has no table cell — the fixture stopped wearing what this tests');
  };

  const caretInACell = () => {
    const words = inACell();
    editor.selectionManager.setSelection({
      type: 'range',
      startNodeId: words,
      startOffset: 0,
      endNodeId: words,
      endOffset: 0,
      collapsed: true
    } as never);
  };

  it('lands the block beside the table rather than inside a row', async () => {
    caretInACell();
    const before = JSON.stringify(editor.exportDocument(doc.rootId));
    expect(await editor.executeCommand('insertRow', {})).toBe(true);
    expect(JSON.stringify(editor.exportDocument(doc.rootId))).not.toBe(before);
  });

  /*
   * All of them, because the fault was not one command's: it was the walk every insert shares, and
   * a check on one of them would have gone on passing while the other five stayed dead.
   */
  it('is true of every insert the product offers, not one of them', async () => {
    for (const command of [
      'insertSection',
      'insertGrid',
      'insertHeading',
      'insertBodyText',
      'insertPicture',
      'insertRule'
    ]) {
      caretInACell();
      const before = JSON.stringify(editor.exportDocument(doc.rootId));
      const ran = await editor.executeCommand(command, {});
      const moved = JSON.stringify(editor.exportDocument(doc.rootId)) !== before;
      expect(`${command}: ran=${ran} moved=${moved}`).toBe(`${command}: ran=true moved=true`);
    }
  });
});
