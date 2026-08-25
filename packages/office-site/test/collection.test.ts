import { describe, it, expect, beforeAll } from 'vitest';
import { getGlobalRegistry } from '@barocss/dsl';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { WORD_ENV_KEY, createTextEnv } from '@barocss/office-text';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { registerSiteRenderers } from '../src/renderers';
import { createSampleSite } from '../src/sample-site';
import { SITE_ENV_KEY, createSiteEnv } from '../src/breakpoints';
import { cellValue, collectionFaults, datasetNamed, rowsOf, valuesForRow } from '../src/data';

/**
 * A list that comes from data.
 *
 * The arithmetic first — which rows, in what order — then the drawing, because the claim is not that
 * an array can be sorted: it is that **one placement in the document draws three cards**, each with
 * its own row in it, and the document is one node longer than it was.
 */
describe('which rows a list draws', () => {
  const dataset = {
    name: '상품',
    kind: 'inline' as const,
    fields: ['이름', '가격', '순서'],
    records: [
      { 이름: '문서', 가격: 9900, 순서: 2 },
      { 이름: '덱', 가격: 12900, 순서: 3 },
      { 이름: '사이트', 가격: 7900, 순서: 1 }
    ]
  };

  it('sorts numbers as numbers', () => {
    // The fault every naive implementation ships: `"12900"` before `"9900"` because a nine is bigger
    // than a one. A price column is the first place a reader meets it.
    expect(rowsOf(dataset, { sortBy: '가격' }).map((row) => row.가격)).toEqual([7900, 9900, 12900]);
  });

  it('sorts, then limits — not the other way round', () => {
    // "The two cheapest" and "the first two, ordered" are different lists, and only one of them is
    // what a reader means.
    expect(rowsOf(dataset, { sortBy: '가격', limit: 2 }).map((row) => row.이름)).toEqual(['사이트', '문서']);
  });

  it('filters on one column equalling one value', () => {
    expect(rowsOf(dataset, { where: '이름', equals: '덱' }).map((row) => row.가격)).toEqual([12900]);
  });

  it('reads a missing cell as empty rather than as the placeholder', () => {
    // A card with a blank price is a card with a blank price. Falling back to the definition's
    // default would draw '0원' on a row whose price is simply not there.
    expect(cellValue({ 이름: '덱' }, '가격')).toBe('');
    expect(cellValue({ 가격: 12900 }, '가격')).toBe('12900');
  });

  it('puts the row into the values and leaves everything else alone', () => {
    const values = new Map([
      ['이름', 'field:이름'],
      ['강조', '#2563eb']
    ]);
    const drawn = valuesForRow(values, { 이름: '사이트' });
    expect(drawn.get('이름')).toBe('사이트');
    // A card may take its title from the data and its accent from a document variable at once.
    expect(drawn.get('강조')).toBe('#2563eb');
    // And nothing was written: the placement still says what it said.
    expect(values.get('이름')).toBe('field:이름');
  });
});

describe('a list, drawn', () => {
  let container: HTMLElement;
  let narrow: HTMLElement;
  let editor: any;
  let dataStore: DataStore;

  const draw = (host: HTMLElement, breakpoint: 'desktop' | 'mobile') => {
    const view = new EditorViewDOM(editor, {
      container: host,
      registry: getGlobalRegistry(),
      env: {
        [WORD_ENV_KEY]: createTextEnv({
          rootId: editor.getRootId(),
          getNode: (sid: string) => dataStore.getNode(sid) as never
        } as never),
        [SITE_ENV_KEY]: createSiteEnv(breakpoint)
      }
    } as never);
    view.render(undefined, { sync: true });
  };

  beforeAll(() => {
    registerSiteRenderers();
    const schema = createSchema('site', getSiteSchemaDefinition());
    dataStore = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore } as never);
    editor.loadDocument(createSampleSite(), 'site');

    container = document.createElement('div');
    narrow = document.createElement('div');
    document.body.append(container, narrow);
    draw(container, 'desktop');
    draw(narrow, 'mobile');
  });

  /*
   * Scoped to **the home page**, because the sample is a site now: five pages are drawn into this
   * container and three of them hold a list. A selector that said "the collection" was reading the
   * blog's as well as the shop's — the same lesson the browser suite learned about finding a block by
   * what it is rather than by being the first one.
   */
  const home = (root: HTMLElement) => root.querySelector<HTMLElement>('.st-page[data-path="/"]')!;
  const list = () => home(container).querySelector<HTMLElement>('.st-collection')!;
  const cards = (root: HTMLElement) =>
    [...home(root).querySelectorAll<HTMLElement>('.st-collection > .st-placement')];

  it('is one node in the document and three cards on the screen', () => {
    const stored = dataStore.getNode(list().getAttribute('data-bc-sid') ?? '') as any;
    // The document holds the collection and **one** placement. Forty rows would still be one.
    expect((stored?.content ?? []).length).toBe(1);
    expect(cards(container)).toHaveLength(3);
  });

  it('draws each row in the order the data was asked for', () => {
    // `sortBy: '순서'`, so this is not the order the rows are written in the document — which is the
    // whole difference between data and typing.
    expect(cards(container).map((card) => card.querySelector('h3')?.textContent)).toEqual([
      '사이트',
      '문서',
      '덱'
    ]);
  });

  it('puts every bound field of the row in, not only the first', () => {
    const first = cards(container)[0];
    expect(first.querySelector('h3')?.textContent).toBe('사이트');
    expect([...first.querySelectorAll('p')].map((one) => one.textContent)).toEqual([
      '쌓이는 섹션, 브라우저가 배치.',
      '월 7,900원'
    ]);
  });

  it('gives every drawn card its own identity', () => {
    // One placement drawn three times would otherwise claim one sid three times, and a hit test or a
    // `querySelector` would answer the first card for all of them.
    const rows = cards(container).map((card) => card.dataset.row);
    expect(rows).toEqual(['0', '1', '2']);
    expect(new Set(cards(container).map((card) => card.getAttribute('data-bc-sid'))).size).toBe(3);
  });

  it('is a stack, so it stacks on a phone', () => {
    expect(list().style.flexDirection).toBe('row');
    expect(narrow.querySelector<HTMLElement>('.st-collection')!.style.flexDirection).toBe('column');
    // And it is the same three rows: the data does not differ per width, only the arrangement does.
    expect(cards(narrow)).toHaveLength(3);
  });

  it('says what is wrong instead of drawing an empty list in silence', () => {
    const doc = { rootId: editor.getRootId(), getNode: (sid: string) => dataStore.getNode(sid) as never };
    expect(datasetNamed(doc, '상품')?.records).toHaveLength(4);

    // The failure mode a data-bound list has and a paragraph does not: nothing drawn looks the same
    // whether nothing matched or the name is misspelt.
    expect(collectionFaults(doc, { attributes: { source: '상픔' } }, { attributes: {} })).toEqual([
      "there is no data called '상픔'"
    ]);
    expect(
      collectionFaults(doc, { attributes: { source: '상품' } }, { attributes: {} }, ['field:색상'])
    ).toEqual(["'상품' has no column called '색상'"]);
    expect(collectionFaults(doc, { attributes: { source: '상품' } }, undefined)).toEqual([
      'this list has nothing to draw for each row'
    ]);
  });
});
