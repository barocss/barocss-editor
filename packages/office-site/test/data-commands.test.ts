import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { datasetNamed, datasetsOf, rowsOf } from '../src/data';

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
    expect(after.fields).toContain('재고');
    // Present and empty in every row, not absent: a card bound to the new column draws a blank
    // rather than the literal `field:재고`.
    expect(after.records.length).toBe(rows);
    expect(after.records.every((row) => row['재고'] === '')).toBe(true);
  });

  it('renames a column in the rows too, and keeps it where it was', async () => {
    const before = products();
    const at = before.fields.indexOf('가격');
    const values = before.records.map((row) => row['가격']);

    await run('setDatasetField', { nodeId: sidOf('상품'), field: '가격', rename: '값' });

    const after = products();
    expect(after.fields).not.toContain('가격');
    // In place. A rename that moved the column to the end reads to a reader as a delete and an add,
    // which is a different act with a different undo.
    expect(after.fields[at]).toBe('값');
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
    expect(after.fields).not.toContain('가격');
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
    expect(Object.keys(after.records[after.records.length - 1]).sort()).toEqual([...after.fields].sort());

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
