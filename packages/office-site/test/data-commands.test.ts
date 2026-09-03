import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { columnNames, datasetNamed, datasetsOf, fieldsFrom, rowsOf } from '../src/data';
import { registerSiteRenderers } from '../src/renderers';

/**
 * Making the data, and changing it.
 *
 * Held here and not in a browser for the reason every model rule in this package is: a column
 * renamed in `fields` and left alone in `records` is a dataset that *looks* right in the panel and
 * draws nothing on the page, and no amount of clicking finds that as fast as asking the document.
 *
 * What these are checking is one invariant, said six ways: **the columns and the rows agree.**
 */
describe('a dataset a reader can change', () => {
  let editor: any;
  let store: DataStore;
  let doc: any;

  const run = async (name: string, payload?: Record<string, unknown>) =>
    await editor.executeCommand(name, payload);
  const can = (name: string, payload?: Record<string, unknown>) => editor.canExecuteCommand(name, payload);

  /** The sample's product catalogue, freshly read — every command rewrites the node. */
  const products = () => datasetNamed(doc, '상품')!;
  /* The names alone, which is what most of these are about — the kinds have their own checks. */
  const columns = () => columnNames(products().fields);
  const sidOf = (name: string) => datasetsOf(doc).find((one) => one.name === name)!.sid!;

  beforeEach(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
  });

  it('writes one cell and leaves every other one alone', () => {
    const before = products();
    const was = before.records.map((row) => row['이름']);

    expect(can('setDatasetCell', { nodeId: sidOf('상품'), row: 1, field: '가격', value: '9,900' })).toBe(true);
    return run('setDatasetCell', { nodeId: sidOf('상품'), row: 1, field: '가격', value: '9,900' }).then(() => {
      const after = products();
      expect(after.records[1]['가격']).toBe('9,900');
      // The whole array is rewritten — that is the cost `data.ts` writes down — so the check that
      // matters is that rewriting it changed exactly one thing.
      expect(after.records.map((row) => row['이름'])).toEqual(was);
      expect(after.records.length).toBe(before.records.length);
    });
  });

  it('refuses a cell that is not in the data', async () => {
    // A column that does not exist, and a row past the end. Both would otherwise write a key that
    // `cellValue` can never read back, which is a dataset that grows junk one typo at a time.
    expect(can('setDatasetCell', { nodeId: sidOf('상품'), row: 0, field: '없는열', value: 'x' })).toBe(false);
    expect(can('setDatasetCell', { nodeId: sidOf('상품'), row: 999, field: '이름', value: 'x' })).toBe(false);
    expect(await run('setDatasetCell', { nodeId: sidOf('상품'), row: 999, field: '이름', value: 'x' })).toBe(false);
  });

  it('adds a column to the rows as well as to the columns', async () => {
    const rows = products().records.length;
    await run('setDatasetField', { nodeId: sidOf('상품'), field: '재고' });

    const after = products();
    expect(columnNames(after.fields)).toContain('재고');
    // Present and empty in every row, not absent: a card bound to the new column draws a blank
    // rather than the literal `field:재고`.
    expect(after.records.length).toBe(rows);
    expect(after.records.every((row) => row['재고'] === '')).toBe(true);
  });

  it('renames a column in the rows too, and keeps it where it was', async () => {
    const before = products();
    const at = columnNames(before.fields).indexOf('가격');
    const values = before.records.map((row) => row['가격']);

    await run('setDatasetField', { nodeId: sidOf('상품'), field: '가격', rename: '값' });

    const after = products();
    expect(columnNames(after.fields)).not.toContain('가격');
    // In place. A rename that moved the column to the end reads to a reader as a delete and an add,
    // which is a different act with a different undo.
    expect(after.fields[at].name).toBe('값');
    // And the values came with it — the whole point. `fields` alone would look right in the panel
    // and draw nothing on the page.
    expect(after.records.map((row) => row['값'])).toEqual(values);
    expect(after.records.every((row) => !('가격' in row))).toBe(true);
  });

  it('refuses a rename onto a name that is taken', () => {
    // It would merge two columns into one, and the one that lost is not recoverable by undoing a
    // rename — because what happened was not a rename.
    expect(can('setDatasetField', { nodeId: sidOf('상품'), field: '가격', rename: '이름' })).toBe(false);
    expect(can('setDatasetField', { nodeId: sidOf('상품'), field: '가격', rename: '' })).toBe(false);
    // And a column that is already there cannot be added again.
    expect(can('setDatasetField', { nodeId: sidOf('상품'), field: '이름' })).toBe(false);
  });

  it('takes a column off the rows as well', async () => {
    await run('setDatasetField', { nodeId: sidOf('상품'), field: '가격', remove: true });

    const after = products();
    expect(columnNames(after.fields)).not.toContain('가격');
    expect(after.records.every((row) => !('가격' in row))).toBe(true);
    // The other columns are untouched, which is the thing a whole-array rewrite is most likely to
    // get wrong.
    expect(after.records.every((row) => typeof row['이름'] === 'string')).toBe(true);
  });

  it('adds a row shaped like the columns, at the end or at a place', async () => {
    const before = products();
    await run('addDatasetRow', { nodeId: sidOf('상품') });
    let after = products();
    expect(after.records.length).toBe(before.records.length + 1);
    // Every column present and empty — a row with missing keys is a row the list draws holes for.
    expect(Object.keys(after.records[after.records.length - 1]).sort()).toEqual(columnNames(after.fields).sort());

    await run('addDatasetRow', { nodeId: sidOf('상품'), at: 0 });
    after = products();
    expect(after.records[0]['이름']).toBe('');
    expect(after.records[1]['이름']).toBe(before.records[0]['이름']);
  });

  it('takes a row away, and refuses one that is not there', async () => {
    const before = products();
    const second = before.records[1]['이름'];

    expect(can('removeDatasetRow', { nodeId: sidOf('상품'), row: 99 })).toBe(false);
    await run('removeDatasetRow', { nodeId: sidOf('상품'), row: 0 });

    const after = products();
    expect(after.records.length).toBe(before.records.length - 1);
    expect(after.records[0]['이름']).toBe(second);
  });

  it('makes a dataset that can be seen and then edited', async () => {
    expect(can('insertDataset', { name: '후기' })).toBe(true);
    // A name already taken is refused: `datasetNamed` answers with whichever came first, so the
    // second one would be a resource nothing could ever point at.
    expect(can('insertDataset', { name: '상품' })).toBe(false);
    expect(can('insertDataset', { name: '  ' })).toBe(false);

    await run('insertDataset', { name: '후기', label: '고객 후기' });

    const made = datasetNamed(doc, '후기');
    expect(made?.label).toBe('고객 후기');
    /*
     * One column and one row rather than nothing at all. An empty dataset gives a reader a list that
     * draws nothing and a panel with nowhere to type, which is a worse first minute than a blank
     * cell they can see.
     */
    expect(made?.fields.length).toBe(1);
    expect(made?.records.length).toBe(1);
  });

  it('says where the rows come from, without pretending to fetch them', async () => {
    await run('setDatasetInfo', { nodeId: sidOf('상품'), label: '카탈로그', kind: 'url', url: 'https://x/y.json' });

    const after = products();
    expect(after.label).toBe('카탈로그');
    expect(after.kind).toBe('url');
    expect(after.url).toBe('https://x/y.json');
    /*
     * And the rows in the document are still the rows that draw. Nothing fetches — that is the
     * design in `data.ts`, where the document keeps the address and the handful of rows a reader
     * designs against — so a `url` dataset must not become an empty one on the way.
     */
    expect(rowsOf(after, {}).length).toBeGreaterThan(0);
  });

  it('refuses to delete a dataset a list is drawing, and allows one nothing uses', async () => {
    /*
     * `createComponentFrom` refuses a block already inside a definition for the same reason: a
     * collection whose `source` names nothing draws nothing, and nothing is what a reader would then
     * be looking at while wondering what they broke.
     */
    expect(can('removeDataset', { nodeId: sidOf('상품') })).toBe(false);

    await run('insertDataset', { name: '후기' });
    expect(can('removeDataset', { nodeId: sidOf('후기') })).toBe(true);
    await run('removeDataset', { nodeId: sidOf('후기') });
    expect(datasetNamed(doc, '후기')).toBeUndefined();
  });
});

/**
 * **Going and getting the rows** — the half of a `url` dataset that did not exist.
 *
 * The fetch happens **here**, into the document, rather than in the published page: the other way
 * ships a script on every page, hands a crawler an empty list, and gives a visitor whose request
 * failed a section with nothing in it. This way the rows are in the HTML, and the contract is the one
 * the button states — what a visitor sees is what was here the last time somebody pressed it.
 *
 * Everything worth testing is a way it **refuses**, and none of them can be arranged in a browser:
 * a service that answers with an object, one that answers with nothing, one that is down.
 */
describe('rows from an address', () => {
  const setup = async () => {
    registerSiteRenderers();
    const schema = createSchema('site', getSiteSchemaDefinition());
    const store = new DataStore(undefined as never, schema as never);
    const editor: any = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };

    const sid = datasetsOf(doc as never)[0].sid as string;
    await editor.executeCommand('setDatasetInfo', { nodeId: sid, kind: 'url', url: 'https://x/y.json' });
    return { editor, store, sid, attrs: () => (store.getNode(sid) as any).attributes };
  };

  const answers = (body: unknown, ok = true) =>
    (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

  it('refuses to go anywhere until there is somewhere to go', async () => {
    const { editor, store } = await setup();
    const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    const inline = datasetsOf(doc as never)[1]?.sid ?? datasetsOf(doc as never)[0].sid;
    await editor.executeCommand('setDatasetInfo', { nodeId: inline, kind: 'inline' });
    expect(editor.canExecuteCommand('refreshDataset', { nodeId: inline })).toBe(false);
  });

  it('takes the rows, and the columns in the order somebody wrote them', async () => {
    const { editor, sid, attrs } = await setup();
    const done = await editor.executeCommand('refreshDataset', {
      nodeId: sid,
      fetch: answers([
        { 이름: '가', 가격: 1000 },
        { 이름: '나', 가격: 2000, 비고: '재고 없음' }
      ])
    });
    expect(done).toBe(true);
    expect(attrs().records).toHaveLength(2);
    /*
     * The **union** of the keys, first-seen order — not the first row's. A service that omits an
     * empty field would otherwise drop a column for every row after the first, and the reader would
     * see a card with a blank slot and no way to find out why.
     */
    expect(columnNames(fieldsFrom(attrs().fields))).toEqual(['이름', '가격', '비고']);
  });

  it('never empties a dataset, whatever the service says', async () => {
    const { editor, sid, attrs } = await setup();
    await editor.executeCommand('refreshDataset', { nodeId: sid, fetch: answers([{ 이름: '가' }]) });
    const kept = attrs().records;

    /*
     * One bad deploy of somebody's API must not silently delete the content of their page, and the
     * rows a reader designed against are the only copy. Four ways to fail, all of them leaving the
     * document exactly where it was.
     */
    for (const bad of [
      answers({ data: [{ 이름: '나' }] }), // an envelope this deliberately does not unwrap by guessing
      answers([]),
      answers(['가', '나']),
      answers(null, false)
    ]) {
      expect(await editor.executeCommand('refreshDataset', { nodeId: sid, fetch: bad })).toBe(false);
      expect(attrs().records).toEqual(kept);
    }

    // Including a service that is simply not there.
    const down = (async () => {
      throw new Error('nope');
    }) as unknown as typeof fetch;
    expect(await editor.executeCommand('refreshDataset', { nodeId: sid, fetch: down })).toBe(false);
    expect(attrs().records).toEqual(kept);
  });
});

/**
 * **A block of cells**, which is how data gets into this product at all.
 *
 * The reason a dataset exists is that the data is somewhere else — a spreadsheet, a page, a CSV
 * somebody was sent — and typing forty cells back in one at a time is the work the feature was
 * supposed to remove. What a reader tries is a paste, and until this existed it put the whole
 * clipboard into whichever single box had the caret.
 */
describe('a block pasted into the grid', () => {
  let editor: any;
  let store: DataStore;
  let doc: any;

  const products = () => datasetNamed(doc, '상품')!;
  const columns = () => columnNames(products().fields);
  const sidOf = () => datasetsOf(doc).find((one) => one.name === '상품')!.sid!;

  beforeEach(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
  });

  it('writes the block from the cell it was dropped on, and leaves the rest alone', async () => {
    const before = products().records;
    expect(
      await editor.executeCommand('setDatasetCells', {
        nodeId: sidOf(),
        row: 1,
        field: '이름',
        values: [
          ['붙인 하나', '붙인 설명'],
          ['붙인 둘', '둘째 설명']
        ]
      })
    ).toBe(true);

    const after = products().records;
    expect(after[1]['이름']).toBe('붙인 하나');
    expect(after[2]['설명']).toBe('둘째 설명');
    // Columns the paste did not reach, and rows above it, are the document's own.
    expect(after[1]['가격']).toBe(before[1]['가격']);
    expect(after[0]).toEqual(before[0]);
  });

  /*
   * **Rows grow.** Stopping at the table's own length would silently drop the rest and look exactly
   * like a paste that worked — which is the failure mode every check in this package is about.
   */
  it('grows the table to fit what was pasted', async () => {
    const before = products().records.length;
    await editor.executeCommand('setDatasetCells', {
      nodeId: sidOf(),
      row: before - 1,
      field: '이름',
      values: [['가'], ['나'], ['다'], ['라']]
    });
    expect(products().records.length).toBe(before + 3);
    // And the grown rows are whole: every column present, so nothing reads them as missing a field.
    for (const field of columns()) {
      expect(Object.prototype.hasOwnProperty.call(products().records[before + 2], field)).toBe(true);
    }
  });

  /**
   * **Columns do not.** A column has a *name* — one `field:가격` refers to and a card is bound
   * through — and a paste cannot invent one. Five columns and a trimmed paste beats a document
   * carrying `엑셀 열 6`.
   */
  it('trims a paste wider than the table rather than inventing columns', async () => {
    const fields = columns();
    await editor.executeCommand('setDatasetCells', {
      nodeId: sidOf(),
      row: 0,
      field: fields[fields.length - 1],
      values: [['끝', '넘침 하나', '넘침 둘']]
    });
    expect(columns()).toEqual(fields);
    expect(products().records[0][fields[fields.length - 1]]).toBe('끝');
  });

  /**
   * **One entry in the history**, which is the whole argument for a command rather than forty writes.
   *
   * Forty writes is an undo that takes forty presses and leaves a half-pasted table in between with
   * nothing on screen explaining it. The padding drag's rule, and the ruler's before it.
   */
  it('is one thing to undo', async () => {
    const entries = () => editor.historyManager?.getStats?.().totalEntries ?? -1;
    const before = entries();
    await editor.executeCommand('setDatasetCells', {
      nodeId: sidOf(),
      row: 0,
      field: '이름',
      values: [
        ['가', '가설명', '1'],
        ['나', '나설명', '2'],
        ['다', '다설명', '3']
      ]
    });
    expect(entries()).toBe(before + 1);
  });

  it('refuses a paste with nothing in it, or one aimed at no column', () => {
    const can = (payload: Record<string, unknown>) =>
      editor.canExecuteCommand('setDatasetCells', { nodeId: sidOf(), ...payload });
    expect(can({ row: 0, field: '이름', values: [['가']] })).toBe(true);
    expect(can({ row: 0, field: '이름', values: [] })).toBe(false);
    expect(can({ row: 0, values: [['가']] })).toBe(false);
    expect(can({ field: '이름', values: [['가']] })).toBe(false);
  });
});
