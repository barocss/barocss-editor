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
import { readValue } from '@barocss/office-canvas';

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
      "'상픔' 데이터가 없습니다"
    ]);
    expect(
      collectionFaults(doc, { attributes: { source: '상품' } }, { attributes: {} }, ['field:색상'])
    ).toEqual(["'상품'에 '색상' 칸이 없습니다"]);
    expect(collectionFaults(doc, { attributes: { source: '상품' } }, undefined)).toEqual([
      '이 목록은 한 줄마다 그릴 틀이 없습니다'
    ]);
  });
});

/**
 * **How a value reads**, which is not the same question as what it is.
 *
 * The fault this closed is the best-shaped one this package has found: a card's question was
 * answered with a string and drawn exactly as stored, so the only way to make a price read as
 * `월 9,900원` was to *store* those words — and the sample's own pricing page had been sorting its
 * plans by that string, in a browser, wrongly, for as long as it existed. `월 9,900원` sorts above
 * `월 19,900원` because `9` comes after `1`, so the page showed the wrong three plans in the wrong
 * order and looked completely fine.
 *
 * Nothing but asking the document what order it was in could have found it.
 */
describe('what a value is, and how it reads', () => {
  it('reads a number and a date the way somebody says them', () => {
    expect(readValue('9900', 'number', '월 #,##0원')).toBe('월 9,900원');
    expect(readValue('2026-08-02', 'date', 'yyyy년 M월 d일')).toBe('2026년 8월 2일');
    expect(readValue('2026-08-02', 'date', 'M월 d일')).toBe('8월 2일');
  });

  it('leaves a value it cannot read exactly as it is', () => {
    /*
     * A card whose column has one bad row should draw that row's own text, which a reader can see
     * and go and fix. A blank is a row that has silently disappeared.
     */
    expect(readValue('곧 공개', 'number', '#,##0원')).toBe('곧 공개');
    expect(readValue('언젠가', 'date', 'yyyy년 M월 d일')).toBe('언젠가');
    // And silence in either half is the value itself, which is why adding this moved nothing.
    expect(readValue('9900', 'number', undefined)).toBe('9900');
    expect(readValue('9900', 'text', '#,##0')).toBe('9900');
  });

  it('is safe to read twice, which is what makes the order it runs in survivable', () => {
    // A data list replaces a placement's answers *after* they are resolved, so the format has to be
    // applied last — and a second pass over an already-formatted value must not make `월 월 9,900원`.
    const once = readValue('9900', 'number', '월 #,##0원');
    expect(readValue(once, 'number', '월 #,##0원')).toBe(once);
  });

  it('puts the sample’s plans in the order they actually cost', () => {
    registerSiteRenderers();
    const schema = createSchema('site', getSiteSchemaDefinition());
    const store = new DataStore(undefined as never, schema as never);
    const editor: any = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };

    /*
     * The measurement that found it. Written as `'월 9,900원'` the answer was 문서 · 사이트 · 스위트;
     * as a number it is what the page claims to be showing.
     */
    const rows = rowsOf(datasetNamed(doc as never, '상품')!, {
      sortBy: '가격',
      sortDir: 'desc',
      limit: 3
    });
    expect(rows.map((one: any) => one.이름)).toEqual(['스위트', '덱', '문서']);
  });
});
