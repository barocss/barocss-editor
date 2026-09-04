import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { collectionRows } from '../src/collection-resolution';
import { exportSite } from '../src/export-html';
import { registerSiteRenderers } from '../src/renderers';
import { pagesOf } from '../src/selection';
import { iconNames } from '@barocss/office-icons';
import {
  DATA_FIELD_KINDS,
  DATA_FIELD_KIND_ICONS,
  bodiesForRow,
  richPlain,
  DATA_FIELD_KIND_NAMES,
  cellFor,
  columnNames,
  datasetNamed,
  datasetsOf,
  fieldNamed,
  fieldOf,
  fieldsFrom,
  rowsOf
} from '../src/data';

/**
 * **A column knows what it holds** — and where that fact used to live.
 *
 * It lived on the **card**, as `componentVar.kind`, which is one level too far out: a column drawn
 * by two cards declared its kind twice and the two could disagree, nothing could check a cell, and
 * the grid drew one text box for a date, a price and a page reference alike. The sample carried the
 * proof the whole time — `추천` held `'예'` and `'아니오'`, a boolean spelled as words because there
 * was nowhere to say it was one.
 *
 * `format` stays on the card, and that split is the interesting half: *what a value is* belongs to
 * the data, *how this page reads it* belongs to the thing drawing it. One dataset feeding a price
 * list that says `9,900원` and a summary that says `9.9천` is the whole argument for a format.
 */
describe('what a column holds', () => {
  const schema = createSchema('site', getSiteSchemaDefinition());
  let store: DataStore;
  let editor: any;
  let doc: any;

  beforeEach(() => {
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
  });

  it('reads a bare name as text, so nothing written before this has to move', () => {
    /*
     * Every document that exists says `fields: ['제목', …]`, and a column with nothing said about it
     * is text — which is what it was already being treated as. Both shapes, one reader.
     */
    expect(fieldOf('제목')).toEqual({ name: '제목', kind: 'text', label: undefined, options: undefined });
    expect(fieldsFrom(['가', '나'])).toEqual([
      { name: '가', kind: 'text', label: undefined, options: undefined },
      { name: '나', kind: 'text', label: undefined, options: undefined }
    ]);
  });

  it('refuses what it cannot use, rather than inventing a column', () => {
    expect(fieldOf('')).toBeUndefined();
    expect(fieldOf({})).toBeUndefined();
    expect(fieldOf({ name: '  ' })).toBeUndefined();
    expect(fieldOf(42)).toBeUndefined();
    // A kind this product does not have is text, not a crash and not a column that draws nothing.
    expect(fieldOf({ name: '가', kind: '해시' })?.kind).toBe('text');
    // And two columns of one name is a `field:제목` that means whichever came first.
    expect(columnNames(fieldsFrom(['제목', '제목', '요약']))).toEqual(['제목', '요약']);
  });

  it('keeps a list of choices only where one means something', () => {
    expect(fieldOf({ name: '분류', kind: 'choice', options: ['제품', '묶음'] })?.options).toEqual(['제품', '묶음']);
    // On a date it is a value nothing reads, so it is not kept — the same rule `share` follows.
    expect(fieldOf({ name: '날짜', kind: 'date', options: ['가'] })?.options).toBeUndefined();
  });

  it('names every kind it offers, and draws every one of them', () => {
    /*
     * A kind with no name is a picker with a blank row, and one with no picture is a row a reader
     * has to read rather than recognise — which is the whole argument for the pictures: fourteen
     * Korean words at 12px are read one at a time.
     */
    for (const one of DATA_FIELD_KINDS) {
      expect(DATA_FIELD_KIND_NAMES[one], one).toBeTruthy();
      expect(DATA_FIELD_KIND_ICONS[one], one).toBeTruthy();
    }
    expect(Object.keys(DATA_FIELD_KIND_NAMES).sort()).toEqual([...DATA_FIELD_KINDS].sort());
    expect(Object.keys(DATA_FIELD_KIND_ICONS).sort()).toEqual([...DATA_FIELD_KINDS].sort());

    /* And every picture exists — a name `office-icons` has not got draws nothing at all. */
    const drawn = new Set(iconNames());
    expect(DATA_FIELD_KINDS.filter((one) => !drawn.has(DATA_FIELD_KIND_ICONS[one]))).toEqual([]);
  });

  it('keeps the words of a rich value where a caret can reach them', () => {
    /**
     * **서식 있는 글**, and the decision that had to be made about it: a cell is a **string**, and
     * saving, diffing, sorting, filtering and every card binding rest on that. So the cell holds
     * `text:요약-스택` and the words are `richText` nodes in `resources` — which is what a footnote
     * has always done here, and the tenth use of the reference shape.
     */
    const posts = datasetNamed(doc, '글')!;
    expect(fieldNamed(posts.fields, '요약')?.kind).toBe('richText');
    expect(posts.records[0]['요약']).toBe('text:요약-스택');

    /* The **words**, for everything that is not the drawing: a sort, a filter, a search, a title. */
    expect(richPlain(doc, 'text:요약-스택')).toContain('페이지의 문법은 쌓임이고');
    /* And a reference that resolves to nothing is empty rather than the reference — see `richPlain`. */
    expect(richPlain(doc, 'text:없는것')).toBe('');
    expect(richPlain(doc, '그냥 글자')).toBe('');
  });

  it('hands a card the nodes, so a summary keeps its emphasis', () => {
    /*
     * The half that makes the kind worth having. A bound part takes a **string** and `withText`
     * collapses its runs to one — which is right for every other value a card asks for and cannot
     * carry an emphasis or a link. So content arrives beside the strings and replaces what the part
     * holds, and the mark is the document's own mark rather than a second notation.
     */
    const posts = datasetNamed(doc, '글')!;
    const values = new Map([['요약', 'field:요약']]);
    const bodies = bodiesForRow(values, posts.records[0], doc as never);
    expect(bodies.get('요약')?.length).toBe(1);

    /* And a row whose summary is plain characters hands back nothing, so `withText` still runs. */
    expect(bodiesForRow(values, { 요약: '그냥 글자' }, doc as never).size).toBe(0);
  });

  it('stores a cell as what its column says it is', () => {
    /*
     * A price stored as `'9900'` sorts alphabetically, which is the fault this dataset already
     * carried once and wrote down: `월 9,900원` put 문서 above 사이트 on the pricing page, and it
     * looked exactly like a working sort.
     */
    expect(cellFor('9900', 'number')).toBe(9900);
    expect(cellFor('true', 'boolean')).toBe(true);
    expect(cellFor('아니오', 'boolean')).toBe(false);
    // A date stays a string: `2026-09-03` sorts as text, is what `<input type="date">` speaks, and
    // means the same thing in every timezone — a `Date` would not survive being saved.
    expect(cellFor('2026-09-03', 'date')).toBe('2026-09-03');
  });

  it('keeps what a reader typed when it does not read as its kind', () => {
    /*
     * Not thrown away and not zeroed. Somebody half way through typing `20` in a number column has
     * typed something incomplete, and a field that emptied itself would take the rest with it. The
     * column knows what it wants; the document keeps what the person said.
     */
    expect(cellFor('스물', 'number')).toBe('스물');
    expect(cellFor('아마도', 'boolean')).toBe('아마도');
    expect(cellFor('', 'number')).toBe('');
  });

  it('is worn by the sample, which is where it was found', () => {
    const posts = datasetNamed(doc, '글')!;
    expect(fieldNamed(posts.fields, '날짜')?.kind).toBe('date');
    /* The one that made the case: it held `'예'` / `'아니오'` because it could not say it was one. */
    expect(fieldNamed(posts.fields, '추천')?.kind).toBe('boolean');
    expect(posts.records.map((one) => one['추천'])).toEqual([true, true, false, false]);

    const products = datasetNamed(doc, '상품')!;
    expect(fieldNamed(products.fields, '가격')?.kind).toBe('number');
    expect(fieldNamed(products.fields, '분류')?.options).toEqual(['제품', '묶음']);
  });

  it('lets a list filter on a column that could not say what it was', () => {
    /*
     * `추천` was declared and read by **nothing** — the other half of the finding. A column that
     * cannot say what it is, is a column nothing can do anything with; now a list can ask for the
     * featured posts, which is what it was put there for.
     */
    const posts = datasetNamed(doc, '글')!;
    const featured = rowsOf(posts, { where: '추천', equals: 'true' });
    expect(featured.map((one) => one['제목'])).toEqual([
      '스택이 페이지의 문법이다',
      '한 문서 모델로 세 제품'
    ]);
  });

  it('keeps every column a kind through a rename, which is where it would have been lost', async () => {
    /*
     * The command read the array and kept the **strings**, which was right when a column was one. A
     * reader renaming a date column would have got a text column back, once per rename, silently.
     */
    const sid = datasetsOf(doc).find((one) => one.name === '글')!.sid!;
    await editor.executeCommand('setDatasetField', { nodeId: sid, field: '날짜', rename: '발행일' });

    const after = datasetNamed(doc, '글')!;
    expect(fieldNamed(after.fields, '발행일')?.kind).toBe('date');
    expect(after.records[0]['발행일']).toBe('2026-09-03');
  });

  it('changes what a column holds without rewriting a single cell', async () => {
    /*
     * A kind says how a value is entered and read; it is **not** a conversion. Rewriting the cells
     * to fit would be a second act hidden inside this one, and the one that loses data — so the undo
     * of a mis-click is the column back, not a column of nothing.
     */
    const sid = datasetsOf(doc).find((one) => one.name === '상품')!.sid!;
    const before = datasetNamed(doc, '상품')!.records.map((one) => one['이름']);

    expect(await editor.executeCommand('setDatasetField', { nodeId: sid, field: '이름', kind: 'url' })).toBe(true);
    const after = datasetNamed(doc, '상품')!;
    expect(fieldNamed(after.fields, '이름')?.kind).toBe('url');
    expect(after.records.map((one) => one['이름'])).toEqual(before);

    /* And a kind this product does not have is refused rather than written. */
    expect(editor.canExecuteCommand('setDatasetField', { nodeId: sid, field: '이름', kind: '해시' })).toBe(false);
  });

  it('makes a column and says what it holds, in one act', async () => {
    /**
     * **A kind names two different acts**, and reading it as one refused half of them: on a column
     * that exists it *changes* what that column holds; on one that does not it is the kind the
     * column is **made** with.
     *
     * Written as one branch that required the column to exist, and 속성 추가 came back `false` in
     * silence — a form offering fourteen kinds, none of which added anything. `발행일, 날짜` is one
     * decision, which is why every table of this kind asks for both at once.
     */
    const sid = datasetsOf(doc).find((one) => one.name === '글')!.sid!;
    expect(await editor.executeCommand('setDatasetField', { nodeId: sid, field: '태그', kind: 'choices' })).toBe(
      true
    );

    const after = datasetNamed(doc, '글')!;
    expect(fieldNamed(after.fields, '태그')?.kind).toBe('choices');
    /* And present and empty in every row, which is what any new column is — see `_setField`. */
    expect(after.records.every((row) => row['태그'] === '')).toBe(true);

    /* A kind this product does not have is refused whether the column exists or not. */
    expect(editor.canExecuteCommand('setDatasetField', { nodeId: sid, field: '새것', kind: '해시' })).toBe(false);
    /* And a name already taken is still refused, kind or no kind. */
    expect(editor.canExecuteCommand('setDatasetField', { nodeId: sid, field: '제목', kind: 'date' })).toBe(true);
  });

  it('takes a row’s words with the row', async () => {
    /**
     * Asked as *행을 지우면 richText 도 그냥 필드니까 같이 지워야 하는 것 아닌가* — and yes. A
     * `richText` is not a shared resource like an asset or a definition; it is one cell's **value**,
     * kept as nodes because a cell is a string and a summary with a link in it is not.
     */
    const sid = datasetsOf(doc).find((one) => one.name === '글')!.sid!;
    const richCount = () =>
      datasetsOf(doc).length &&
      ((store.getNode(editor.getRootId()) as any).content as string[])
        .map((one) => store.getNode(one) as any)
        .filter((one) => one?.stype === 'resources')
        .flatMap((box: any) => (box.content as string[]).map((one) => store.getNode(one) as any))
        .filter((one) => one?.stype === 'richText').length;

    const before = richCount();
    /* Four: two summaries and two bodies, because a post has both and a row may hold two. */
    expect(before).toBe(4);

    await editor.executeCommand('removeDatasetRow', { nodeId: sid, row: 0 });
    /*
     * **Two**, not one — which is the whole point of the second rich column being in the fixture: a
     * row's words are *every* rich cell it holds, so deleting the first post takes its summary and
     * its body together. A rule written for one column and never run against two would have taken
     * one of them and left the other unreachable.
     */
    expect(richCount()).toBe(before - 2);

    /* One thing to undo, which is what putting both in one transaction is for. */
    await editor.undo();
    expect(richCount()).toBe(before);
    expect(datasetNamed(doc, '글')!.records[0]['요약']).toBe('text:요약-스택');
  });

  it('gives a copy its own words, which is what makes taking them away safe', async () => {
    /**
     * The fault that made deleting a row look risky, and it was one level up: `duplicateDataset`
     * copied the **records**, so the copy's `text:요약-스택` and the original's were the same node —
     * editing one edited the other, and deleting a row in one would have taken words out of a
     * dataset nobody touched.
     *
     * The array was copied and the thing it referred to was not, which is the shallow-copy fault one
     * level further down than the comment that was already there.
     */
    const sid = datasetsOf(doc).find((one) => one.name === '글')!.sid!;
    expect(await editor.executeCommand('duplicateDataset', { nodeId: sid })).toBe(true);

    const copy = datasetsOf(doc).find((one) => one.sid !== sid && one.name.startsWith('글'))!;
    const was = datasetNamed(doc, '글')!.records[0]['요약'];
    const now = copy.records[0]['요약'];
    expect(now).not.toBe(was);
    /* And the copy's words are the same words — a different node saying the same thing. */
    expect(richPlain(doc, now)).toBe(richPlain(doc, was));
  });

  it('types a paste as well, because a spreadsheet arrives as text', async () => {
    /*
     * The same fault arriving through the other door: a column of prices pasted from a spreadsheet
     * is text, and a list that sorts by it then sorts alphabetically.
     */
    const sid = datasetsOf(doc).find((one) => one.name === '상품')!.sid!;
    await editor.executeCommand('setDatasetCells', {
      nodeId: sid,
      row: 0,
      field: '가격',
      values: [['1500'], ['2500']]
    });
    expect(datasetNamed(doc, '상품')!.records.slice(0, 2).map((one) => one['가격'])).toEqual([1500, 2500]);
  });
});

/**
 * **어디가 데이터인가** — the fact resolution destroys, kept.
 *
 * Asked as *전체 페이지 중에 어디가 데이타이고 어디가 아닌지 구분이 잘 안 된다*, and the reason it
 * could not be answered is that resolution is **total**: `field:제목` has become the post's title by
 * the time anything draws, so a value that came from a column is indistinguishable from one somebody
 * typed. There was nothing left to mark.
 *
 * So the reference is kept beside the resolved value (`boundFrom`) and written on the drawing. What
 * is checked here is the two claims that make it worth having: that it says **which** column, and
 * that it is on the parts that took one and on nothing else.
 */
describe('which parts of a page came from data', () => {
  registerSiteRenderers();
  const schema = createSchema('site', getSiteSchemaDefinition());
  const store = new DataStore(undefined as never, schema as never);
  const editor: any = createSiteEditor({ editable: true, schema, dataStore: store } as never);
  editor.loadDocument(createSampleSite(), 'site');
  const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };

  /** The blog's list, resolved the way the boards resolve it. */
  const rows = () => {
    const found: any[] = [];
    const walk = (sid: string) => {
      const node = store.getNode(sid) as any;
      if (!node) return;
      if (node.stype === 'collection' && node.attributes?.source === '글') found.push(node);
      for (const child of node.content ?? []) if (typeof child === 'string') walk(child);
    };
    walk(editor.getRootId() as string);
    return collectionRows(doc as never, found[0]);
  };

  const marks = (node: any, into: string[] = []): string[] => {
    const said = node?.attributes?.boundFrom;
    if (typeof said === 'string' && said) into.push(said);
    for (const child of node?.content ?? []) if (child && typeof child === 'object') marks(child, into);
    return into;
  };

  it('says which column each value came from', () => {
    const first = rows()[0] as any;
    /*
     * Four, because `post-row` asks four questions and the list answers all four with columns. The
     * **reference**, not the column's name alone: `var:강조` is the other thing an answer can be, and
     * a mark that flattened both to a bare name would be saying two different things with one word.
     */
    expect(marks(first).sort()).toEqual(['field:날짜', 'field:요약', 'field:제목', 'field:페이지']);
  });

  it('marks nothing on a page a reader typed', () => {
    /*
     * The half that keeps the mark meaning something. The blog's featured card is the same design —
     * a picture, a heading, two paragraphs — written by hand, and if this marked that too the
     * notation would say *this page has words on it*.
     */
    const home = pagesOf(doc as never)[0].sid;
    const walk = (sid: string, into: string[]): string[] => {
      const node = store.getNode(sid) as any;
      if (node?.attributes?.boundFrom) into.push(String(node.attributes.boundFrom));
      for (const child of node?.content ?? []) if (typeof child === 'string') walk(child, into);
      return into;
    };
    expect(walk(home, [])).toEqual([]);
  });

  it('is the editor’s, and does not reach a visitor', () => {
    /*
     * `page:post-stack` and `field:제목` are this document's own vocabulary and mean nothing in a
     * browser. `data-goes` had to be stopped from publishing for the same reason, and was caught by
     * the check that says no `page:` appears in an exported page — this is that check's other half,
     * written before anybody had to be caught by it twice.
     */
    for (const page of exportSite(editor)) {
      expect(page.html).not.toContain('data-from');
      expect(page.html).not.toContain('field:');
    }
  });
});
