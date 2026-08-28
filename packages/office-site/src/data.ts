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
/** A reference where a value goes, naming a column of the row being drawn. */
export const FIELD_PREFIX = 'field:';

export interface Dataset {
  sid?: string;
  /** What a collection names. Durable, like every other reference in this schema. */
  name: string;
  label?: string;
  kind: 'inline' | 'url';
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
  fields: string[];
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
        url: typeof attrs.url === 'string' ? attrs.url : undefined,
        fields: Array.isArray(attrs.fields)
          ? attrs.fields.filter((one): one is string => typeof one === 'string')
          : [],
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
  record: Record<string, unknown>
): Map<string, string> {
  let copy: Map<string, string> | undefined;
  for (const [name, value] of values) {
    const field = fieldNameOf(value);
    if (!field) continue;
    copy = copy ?? new Map(values);
    copy.set(name, cellValue(record, field));
  }
  return copy ?? values;
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
      if (field && !dataset.fields.includes(field)) {
        faults.push(`'${dataset.name}'에 '${field}' 칸이 없습니다`);
      }
    }
    const sortBy = node?.attributes?.sortBy;
    if (typeof sortBy === 'string' && sortBy && !dataset.fields.includes(sortBy)) {
      faults.push(`'${dataset.name}'에 정렬 기준으로 쓸 '${sortBy}' 칸이 없습니다`);
    }
  }
  return faults;
}
