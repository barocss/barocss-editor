/**
 * A **list that comes from data** — the product grid, the blog index, the team page.
 *
 * ## The one thing a site has that a document and a deck do not
 *
 * Every other node on a page is something a reader typed. A product list is not: it is one design
 * and forty rows, and the forty rows are a *table* — they arrive from a spreadsheet, a CMS or an
 * endpoint, they change without the page changing, and nobody puts a caret in them. A site builder
 * that has no answer for this makes the reader paste forty cards and maintain them by hand, which is
 * the single most common thing site builders are actually used for.
 *
 * ## What had to be added, which is less than it looks
 *
 * The binding already existed. A `component` declares questions (`componentVar`), says which part
 * takes which answer (`componentBind`), and a placement answers them (`componentValue`) — written
 * for a deck's cards, and it is exactly the shape a row of data needs. So a repeated list is:
 *
 * - a **dataset**: named rows, kept in the document or fetched from an address;
 * - a **collection**: a stack that holds *one* placement and draws it once per row;
 * - `field:가격` where a value goes — the same idiom as `var:강조`, which this schema has used for a
 *   named value since the deck's variables. A reference where a value goes, resolved by whatever
 *   scope is drawing it.
 *
 * Nothing else. No template language, no expressions, no second document model.
 *
 * ## Why the rows are an attribute and not nodes
 *
 * This schema prefers declarations made of nodes, and says so in `componentBind`. Rows are the
 * exception, on a measurement: a 500-row catalogue is 4,000 nodes that nothing ever selects, edits,
 * or puts a caret in — carried by the store, walked by the validator and by every save, so that a
 * thing which is not document content can be shaped like document content.
 *
 * The cost of the other choice is real and is written here so it is not a surprise: **editing one
 * cell rewrites the whole array**, so an inline dataset is for the tens of rows a person curates.
 * Anything larger is `kind: 'url'`, where the document holds the address and a handful of rows to
 * design against.
 */
/**
 * **A column knows what it holds** — the fact that was in the wrong place.
 *
 * A dataset's columns were bare names (`['제목', '요약', '날짜', '추천']`) and the *type* lived on the
 * **card** that drew them, as `componentVar.kind`. Three things follow from that, and all three were
 * visible in the sample before anybody looked for them:
 *
 * - a column drawn by two cards declares its kind **twice**, and the two can disagree;
 * - nothing can check a cell, so `추천` is `'예'` / `'아니오'` — a boolean spelled as words, because
 *   there was nowhere to say it was one;
 * - the grid draws one control for everything. A date, a price and a page reference are all a text
 *   box, which is what makes entering data in it feel like typing into a spreadsheet by hand.
 *
 * ## What stays on the card, and why the split is not arbitrary
 *
 * `format` stays. *What a value is* belongs to the data; *how this page reads it* belongs to the
 * thing drawing it — one dataset feeding a price list that says `9,900원` and a summary that says
 * `9.9천` is the whole argument for a format, and it was made when `format` was added.
 *
 * A card's `kind` stays too, and is now a **fallback**: where the data says a kind, the data wins.
 * A definition is placed against more than one dataset over its life and the data is the thing that
 * knows.
 *
 * ## A bare name still works, forever
 *
 * Every document written before this has `fields: ['제목', …]`, and a column with nothing said about
 * it is **text** — which is what it was already being treated as. So this reads both shapes and
 * writes the new one, and nothing has to be migrated.
 */
/**
 * **`DataFieldKind` and not `FieldKind`**, because this schema already has a `FieldKind`: what a
 * **form**'s field is, in `form.ts`. Two things called a field, and they are genuinely different —
 * one is what a *visitor* fills in, the other is what a *column* holds — so the shorter name would
 * be one word meaning two things in a package that exports both.
 */
export type DataFieldKind =
  | 'text'
  | 'longText'
  | 'richText'
  | 'number'
  | 'boolean'
  | 'date'
  | 'choice'
  | 'choices'
  | 'colour'
  | 'image'
  | 'page'
  | 'url'
  | 'email'
  | 'phone';

/**
 * The kinds a column may declare, in the order a picker offers them — **words first, then values,
 * then references**, which is the order a reader thinks about a table in.
 *
 * ## What decided the list
 *
 * One question: *what can a page draw with it?* Every kind here is something a block on a page reads
 * — a number sorts, a boolean filters, a colour paints, a picture is an `<img>`, a page reference is
 * an `<a href>`. Notion's list is longer and the difference is the interesting part: 사람, 수식,
 * 관계, 롤업, 만든 사람, 만든 시각, 버튼, ID are all facts about a **database**, and this product has
 * no accounts (so 사람 and 만든 사람 would be values nothing can fill), no expression language (which
 * `where`/`equals` refused once already, as two attributes rather than a grammar), and no second
 * document model for a relation to point through.
 *
 * A kind that nothing on a page could draw is a column a reader can fill in and never see, which is
 * the fault this whole schema's conformance harness exists to find.
 */
export const DATA_FIELD_KINDS: readonly DataFieldKind[] = [
  'text',
  'longText',
  'richText',
  'number',
  'boolean',
  'date',
  'choice',
  'choices',
  'colour',
  'image',
  'page',
  'url',
  'email',
  'phone'
];

/** What a reader calls each one. Plain terms — the product's rule about every word it shows. */
export const DATA_FIELD_KIND_NAMES: Record<DataFieldKind, string> = {
  text: '글자',
  longText: '여러 줄',
  richText: '서식 있는 글',
  number: '숫자',
  boolean: '예/아니오',
  date: '날짜',
  choice: '선택',
  choices: '여러 선택',
  colour: '색',
  image: '그림',
  page: '페이지',
  url: '주소',
  email: '메일',
  phone: '전화'
};

/** The picture each one is drawn with — see `office-icons`, where all fourteen were drawn for this. */
export const DATA_FIELD_KIND_ICONS: Record<DataFieldKind, string> = {
  text: 'type-text',
  longText: 'type-long-text',
  richText: 'type-rich-text',
  number: 'type-number',
  boolean: 'type-check',
  date: 'type-date',
  choice: 'type-choice',
  choices: 'type-choices',
  colour: 'type-colour',
  image: 'type-image',
  page: 'type-page',
  url: 'type-url',
  email: 'type-email',
  phone: 'type-phone'
};

export interface DataField {
  /** What a `field:` reference names. Durable, like every other reference in this schema. */
  name: string;
  kind: DataFieldKind;
  /** What a reader is shown instead of the name, when the name is not what they would say. */
  label?: string;
  /** The values a `choice` may take. Nothing else reads it. */
  options?: string[];
}

/** One column, from either shape a document may have written. */
export function fieldOf(one: unknown): DataField | undefined {
  if (typeof one === 'string') return one.trim() ? { name: one, kind: 'text' } : undefined;
  if (!one || typeof one !== 'object' || Array.isArray(one)) return undefined;

  const said = one as Record<string, unknown>;
  if (typeof said.name !== 'string' || !said.name.trim()) return undefined;

  const kind = DATA_FIELD_KINDS.includes(said.kind as DataFieldKind) ? (said.kind as DataFieldKind) : 'text';
  const options = Array.isArray(said.options)
    ? said.options.filter((each): each is string => typeof each === 'string')
    : undefined;

  return {
    name: said.name,
    kind,
    label: typeof said.label === 'string' && said.label ? said.label : undefined,
    /* Only where it means something. A list of choices on a date is a value nothing reads. */
    options: kind === 'choice' && options?.length ? options : undefined
  };
}

/** Every column a dataset declares, in the order it declares them. */
export function fieldsFrom(said: unknown): DataField[] {
  if (!Array.isArray(said)) return [];
  const found: DataField[] = [];
  const seen = new Set<string>();
  for (const one of said) {
    const field = fieldOf(one);
    /* One column per name: two `제목`s is a `field:제목` that means whichever came first. */
    if (!field || seen.has(field.name)) continue;
    seen.add(field.name);
    found.push(field);
  }
  return found;
}

/** Just the names, for the many callers that only ever wanted those. */
export function columnNames(fields: DataField[] | undefined): string[] {
  return (fields ?? []).map((one) => one.name);
}

/** What a column declares, by name. */
export function fieldNamed(fields: DataField[] | undefined, name: unknown): DataField | undefined {
  return typeof name === 'string' ? (fields ?? []).find((one) => one.name === name) : undefined;
}

/** A reference where a value goes, naming a column of the row being drawn. */
export const FIELD_PREFIX = 'field:';

export interface Dataset {
  sid?: string;
  /** What a collection names. Durable, like every other reference in this schema. */
  name: string;
  label?: string;
  kind: 'inline' | 'url';
  /**
   * Whether the visitor's browser goes and gets it too, not only the reader's.
   *
   * The deliberate second mode, and everything it costs is argued in `live.ts` rather than here —
   * this is only where a reader of a dataset finds out the switch exists.
   */
  live: boolean;
  /** Where the rows come from when they are not in the document. */
  url?: string;
  /**
   * The columns this data has.
   *
   * Declared rather than inferred from the first row, for the reason `componentVar` is declared: a
   * panel has to offer the fields before there is a row on screen, and `field:가격` written against
   * a dataset with no `가격` is a fault somebody can be told about instead of a card that silently
   * draws nothing.
   */
  fields: DataField[];
  records: Record<string, unknown>[];
}

type Access = { rootId: string; getNode: (sid: string) => any };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Every dataset the document declares, in the order it declares them. */
export function datasetsOf(doc: Access | undefined): Dataset[] {
  const root = doc?.getNode(doc.rootId);
  const found: Dataset[] = [];

  for (const sid of (root?.content ?? []) as string[]) {
    const child = doc!.getNode(sid);
    if (child?.stype !== 'resources') continue;
    for (const each of (child.content ?? []) as string[]) {
      const node = doc!.getNode(each);
      if (node?.stype !== 'dataset') continue;
      const attrs = (node.attributes ?? {}) as Record<string, unknown>;
      if (typeof attrs.name !== 'string' || !attrs.name) continue;

      found.push({
        sid: node.sid,
        name: attrs.name,
        label: typeof attrs.label === 'string' ? attrs.label : undefined,
        kind: attrs.kind === 'url' ? 'url' : 'inline',
        live: attrs.live === true,
        url: typeof attrs.url === 'string' ? attrs.url : undefined,
        fields: fieldsFrom(attrs.fields),
        records: Array.isArray(attrs.records) ? attrs.records.filter(isRecord) : []
      });
    }
  }
  return found;
}

export function datasetNamed(doc: Access | undefined, name: unknown): Dataset | undefined {
  if (typeof name !== 'string' || !name) return undefined;
  return datasetsOf(doc).find((one) => one.name === name);
}

/** Whether a value is a reference to a column rather than a value. */
export function isFieldRef(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(FIELD_PREFIX);
}

/** Which column a reference names. */
export function fieldNameOf(value: unknown): string | undefined {
  return isFieldRef(value) ? value.slice(FIELD_PREFIX.length).trim() || undefined : undefined;
}

/**
 * One cell, as the string a binding writes.
 *
 * A string whatever the column holds, which is what `componentValue` already decided and for the
 * same reason: the variable's declared kind says how to read it, one shape means one thing to write
 * and diff, and a number kept as `"12900"` is a number a person can read in a pull request. A
 * missing column is an **empty** string rather than `undefined`, so a card with a blank price is a
 * card with a blank price rather than a card showing the definition's placeholder.
 */
export function cellValue(record: Record<string, unknown> | undefined, field: string): string {
  const value = record?.[field];
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/**
 * **What a cell holds, once the column says what it is.**
 *
 * A cell was whatever arrived — always a string, because the only thing that could write one was a
 * text box. Now a column declares a kind, and the kind decides what is *stored*: a price that is
 * `9900` sorts as a number and a price that is `'9900'` sorts alphabetically, which is the fault
 * this dataset already carried once and wrote down (`월 9,900원` put 문서 above 사이트 on the
 * pricing page, and it looked exactly like a working sort).
 *
 * ## What is deliberately not converted
 *
 * A value that does not read as its kind is **kept as it was typed**, not thrown away or zeroed. A
 * reader half way through typing `20` in a date column has typed something wrong, and a field that
 * emptied itself would take the rest of what they were typing with it. The column knows what it
 * wants; the document keeps what the person said; `datasetFaults` is where the two are compared.
 *
 * A date stays a **string**, deliberately: `2026-09-03` sorts correctly as text, is what
 * `<input type="date">` reads and writes, and is the one date notation that means the same thing in
 * every timezone. A `Date` in the document would be a value that cannot survive being saved.
 */
export function cellFor(said: unknown, kind: DataFieldKind | undefined): unknown {
  const text = typeof said === 'string' ? said.trim() : said;

  if (kind === 'number') {
    if (typeof text === 'number') return text;
    if (typeof text !== 'string' || text === '') return '';
    const asNumber = Number(text);
    return Number.isFinite(asNumber) ? asNumber : text;
  }
  if (kind === 'boolean') {
    if (typeof text === 'boolean') return text;
    /* The two shapes a control sends, and the two words the sample held before it could say so. */
    if (text === 'true' || text === '예') return true;
    if (text === 'false' || text === '아니오') return false;
    return text === '' ? false : text;
  }
  /*
   * **여러 선택** is the one kind whose value is a list, and it is kept as one string with a
   * separator rather than as an array — the same decision `records` made about being an attribute,
   * for a smaller version of the same reason: a cell is a string everywhere else in this file, and
   * one kind holding an array would mean `cellValue`, every sort, every filter and every card
   * binding needing a second path. `\n` is the separator because it is the one character a
   * `choices` option cannot contain: options are typed into a single-line field.
   */
  return text ?? '';
}

/**
 * **서식 있는 글**, and the one thing about it that had to be decided: where the words live.
 *
 * Not in the cell. A cell is a string — `cellValue`'s rule — and saving, diffing, sorting, filtering
 * and every card binding rest on it. So the cell holds `text:요약-3` and the words are `richText`
 * nodes in `resources`, which is what a **footnote** has always done here: `footnoteRef` in the flow,
 * `footnoteDef` beside it. The tenth use of the reference shape, and the second one that is a body.
 */
export const RICH_PREFIX = 'text:';

/** Whether a value points at rich text rather than being text. */
export function isRichRef(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(RICH_PREFIX);
}

/** Which `richText` a reference names. */
export function richNameOf(value: unknown): string | undefined {
  return isRichRef(value) ? value.slice(RICH_PREFIX.length).trim() || undefined : undefined;
}

/** How a reference to one is written. */
export function richRef(id: string): string {
  return `${RICH_PREFIX}${id}`;
}

/** The `richText` a reference names, as a node. */
export function richTextNamed(doc: Access | undefined, value: unknown): any | undefined {
  const id = richNameOf(value);
  if (!doc || !id) return undefined;

  const root = doc.getNode(doc.rootId);
  for (const sid of (root?.content ?? []) as string[]) {
    const box = doc.getNode(sid);
    if (box?.stype !== 'resources') continue;
    for (const each of (box.content ?? []) as string[]) {
      const node = doc.getNode(each);
      if (node?.stype === 'richText' && node.attributes?.id === id) return node;
    }
  }
  return undefined;
}

/**
 * The **plain words** of a rich value, for everything that is not the drawing.
 *
 * A sort, a filter, a search and a `title` attribute all want characters, and none of them wants
 * marks. Which is also the fallback that keeps this honest: a card whose part cannot take content —
 * a `title`, an `alt`, a button's label — draws the words rather than `text:요약-3`, so a rich column
 * bound somewhere unexpected degrades to a text column instead of leaking a reference onto a page.
 */
export function richPlain(doc: Access | undefined, value: unknown): string {
  const node = richTextNamed(doc, value);
  if (!node) return '';

  /*
   * **Runs join with nothing and blocks join with a space**, which is the one thing this had to get
   * right: a run is a *piece of a sentence* — `…문법은 `, `쌓임`, `이고…` — and joining those with a
   * space puts one inside every emphasised word. A block is a sentence, and two of them run together
   * without one.
   */
  const blocks: string[] = [];
  const walk = (sid: string, into: string[], depth: number) => {
    if (depth > 24) return;
    const one = doc!.getNode(sid);
    if (!one) return;
    if (typeof (one as { text?: unknown }).text === 'string') into.push((one as { text: string }).text);
    for (const child of (one.content ?? []) as unknown[]) {
      if (typeof child === 'string') walk(child, into, depth + 1);
    }
  };
  for (const child of (node.content ?? []) as unknown[]) {
    if (typeof child !== 'string') continue;
    const runs: string[] = [];
    walk(child, runs, 0);
    if (runs.length > 0) blocks.push(runs.join(''));
  }
  return blocks.join(' ').trim();
}

/** What a collection may say about which rows it draws, and in what order. */
export interface RowQuery {
  limit?: unknown;
  sortBy?: unknown;
  sortDir?: unknown;
  /** Draw only rows whose column equals this. The one filter a landing page actually asks for. */
  where?: unknown;
  equals?: unknown;
}

/**
 * The rows a collection draws.
 *
 * Filter, then sort, then limit — the order every query language uses, and the only order that means
 * anything: limiting before sorting would take the first three rows and *then* order those three,
 * which is not what "the three cheapest" means.
 *
 * Sorting compares numbers as numbers when both sides are numbers, and strings by locale otherwise.
 * A price column that sorted `"1200"` before `"900"` is the fault this avoids, and it is the fault
 * every naive implementation ships with.
 */
export function rowsOf(dataset: Dataset | undefined, query: RowQuery = {}): Record<string, unknown>[] {
  let rows = [...(dataset?.records ?? [])];

  const where = typeof query.where === 'string' ? query.where : undefined;
  if (where) {
    const wanted = query.equals === undefined ? '' : String(query.equals);
    rows = rows.filter((row) => cellValue(row, where) === wanted);
  }

  const sortBy = typeof query.sortBy === 'string' ? query.sortBy : undefined;
  if (sortBy) {
    const descending = query.sortDir === 'desc';
    rows.sort((left, right) => {
      const a = left[sortBy];
      const b = right[sortBy];
      const compared =
        typeof a === 'number' && typeof b === 'number'
          ? a - b
          : cellValue(left, sortBy).localeCompare(cellValue(right, sortBy));
      return descending ? -compared : compared;
    });
  }

  const limit = typeof query.limit === 'number' && Number.isFinite(query.limit) ? Math.max(0, Math.trunc(query.limit)) : undefined;
  return limit === undefined ? rows : rows.slice(0, limit);
}

/**
 * The values a placement is drawn with **for one row**.
 *
 * Every answer that names a column becomes that row's cell; everything else is left exactly as it
 * was, so a card may take its title from the data and its accent from a document variable at the
 * same time. Nothing is written to the document — the placement still says `field:제목`, and what
 * differs is only what was drawn.
 */
export function valuesForRow(
  values: Map<string, string>,
  record: Record<string, unknown>,
  /**
   * The document, for the one kind whose cell is a **reference**: 서식 있는 글 is `text:요약-3` and
   * the words are nodes elsewhere. Optional, so every caller that has no rich column is unchanged —
   * and without it a rich cell resolves to its reference, which is why `richPlain` is the fallback
   * rather than the raw string.
   */
  doc?: Access
): Map<string, string> {
  let copy: Map<string, string> | undefined;
  for (const [name, value] of values) {
    const field = fieldNameOf(value);
    if (!field) continue;
    copy = copy ?? new Map(values);
    const said = record[field];
    if (isRichRef(said)) {
      /* The words, not the reference — see `richPlain` for what a part that cannot take content gets. */
      copy.set(name, richPlain(doc, said));
      continue;
    }
    copy.set(name, cellValue(record, field));
  }
  return copy ?? values;
}

/**
 * The **content** a row answers with, for the variables whose column is 서식 있는 글.
 *
 * Beside `valuesForRow` rather than inside it, because the two answers are different shapes and the
 * thing that takes them is different too: a string goes through `withText`, which collapses a part's
 * runs to one, and content *replaces* what the part holds. One function returning both would be one
 * function two callers each use half of.
 */
export function bodiesForRow(
  values: Map<string, string>,
  record: Record<string, unknown>,
  doc: Access | undefined
): Map<string, unknown[]> {
  const found = new Map<string, unknown[]>();
  for (const [name, value] of values) {
    const field = fieldNameOf(value);
    if (!field) continue;
    const said = record[field];
    if (!isRichRef(said)) continue;
    const node = richTextNamed(doc, said);
    const blocks = ((node?.content ?? []) as unknown[]).filter((one) => typeof one === 'string');
    if (blocks.length > 0) found.set(name, blocks);
  }
  return found;
}

/**
 * What is wrong with a collection, said in the words a reader can act on.
 *
 * Every one of these draws *nothing* if it is not reported, which is the failure mode a data-bound
 * list has and a paragraph does not: an empty list looks like an empty list, and a reader cannot
 * tell "no rows matched" from "the dataset name is misspelt".
 */
export function collectionFaults(
  doc: Access | undefined,
  node: { attributes?: Record<string, unknown> } | undefined,
  template: { attributes?: Record<string, unknown> } | undefined,
  values: Iterable<string> = []
): string[] {
  const faults: string[] = [];
  const source = node?.attributes?.source;
  const dataset = datasetNamed(doc, source);

  if (typeof source !== 'string' || !source) faults.push('이 목록은 어떤 데이터를 쓸지 정하지 않았습니다');
  else if (!dataset) faults.push(`'${source}' 데이터가 없습니다`);
  if (!template) faults.push('이 목록은 한 줄마다 그릴 틀이 없습니다');

  if (dataset && dataset.fields.length > 0) {
    for (const value of values) {
      const field = fieldNameOf(value);
      if (field && !fieldNamed(dataset.fields, field)) {
        faults.push(`'${dataset.name}'에 '${field}' 칸이 없습니다`);
      }
    }
    const sortBy = node?.attributes?.sortBy;
    if (typeof sortBy === 'string' && sortBy && !fieldNamed(dataset.fields, sortBy)) {
      faults.push(`'${dataset.name}'에 정렬 기준으로 쓸 '${sortBy}' 칸이 없습니다`);
    }
  }
  return faults;
}
