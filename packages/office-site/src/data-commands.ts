/**
 * Making the data, and changing it.
 *
 * ## What was missing, and how it was found
 *
 * The sweep that asks *which of a node type's declared attributes the property panel offers* said
 * `dataset` offered **one of six**. Following it down turned out to be worse than a panel gap: there
 * was no command anywhere in the product that made a dataset, renamed one, added a column, or wrote
 * a cell. Every dataset that existed had been authored in `sample-site.ts`, in TypeScript.
 *
 * So the data feature was exactly half built. A reader could see the datasets, make a list from one,
 * and filter, sort and limit that list — the whole *view* — and could not change a price.
 *
 * ## The grain, and why it is this one
 *
 * `setComponentValue` is the idiom this package already has: one command, one named thing, one
 * value. Not "here is the new array". These follow it, with one deliberate exception.
 *
 * The exception is `setDatasetField`, which does add, rename and remove — three gestures in one
 * command — because all three have to keep the **records** in step with the columns, and that is one
 * invariant. A rename that changed `fields` and left every row keyed by the old name would leave a
 * dataset that draws nothing and looks correct in the panel; splitting it across three commands
 * would be three places for that to go wrong instead of one.
 *
 * ## The cost that is already written down
 *
 * `data.ts` says it plainly: rows are an attribute rather than nodes, because a 500-row catalogue is
 * 4,000 nodes nothing ever selects or puts a caret in — and the price is that **editing one cell
 * rewrites the whole array**. That price is paid here, in `_records`, and it is the reason an inline
 * dataset is for the tens of rows a person curates. It is also why none of these commands is a good
 * idea to hold a key down inside.
 */
import { Editor, Extension } from '@barocss/editor-core';
import { addChild, node, removeChild, setAttrs, transaction } from '@barocss/model';
import { copyOf } from '@barocss/office-canvas';
import { assetsOf } from './assets';
import { nfc } from './names';
import { datasetsOf, isRichRef, richRef, richTextNamed } from './data';
import {
  cellFor,
  columnNames,
  fieldNamed,
  fieldOf,
  fieldsFrom,
  DATA_FIELD_KINDS,
  type DataField,
  type DataFieldKind
} from './data';

type Node = Record<string, any>;

export class SiteDataExtension implements Extension {
  name = 'siteData';
  priority = 48;

  onCreate(editor: Editor): void {
    const register = (
      name: string,
      execute: (payload?: Record<string, unknown>) => Promise<boolean>,
      can: (payload?: Record<string, unknown>) => boolean
    ) =>
      editor.registerCommand({
        name,
        execute: async (_ed: Editor, payload?: Record<string, unknown>) => await execute(payload),
        canExecute: (_ed: Editor, payload?: Record<string, unknown>) => can(payload)
      });

    /**
     * A new dataset, empty, in the document's resources.
     *
     * Named rather than numbered, because the name is what a collection points at and `forFile`
     * strips sids — a reference in this schema is never a sid. A name already taken is refused: two
     * datasets called `상품` is one of them unreachable, and `datasetNamed` would answer with
     * whichever came first.
     */
    register(
      'insertDataset',
      async (payload) => await this._insert(editor, payload),
      (payload) => this._canInsert(editor, payload)
    );

    /**
     * What a dataset is called and where its rows come from.
     *
     * `setPageInfo`'s shape, for `setPageInfo`'s reason: a resource is not a block, no selection
     * names it, and a reader edits it from the panel that lists it.
     *
     * `kind: 'url'` says where the rows come from; `refreshDataset` is what goes and gets them.
     */
    register(
      'setDatasetInfo',
      async (payload) => await this._setInfo(editor, payload),
      (payload) => this._canSetInfo(editor, payload)
    );

    /**
     * **Putting a file in the document** — the gesture a site builder could not make.
     *
     * A `picture` carried a `src` string and nothing anywhere could put bytes in one. The sample got
     * away with it by drawing its art as SVG data URIs, which is a thing a product's author can do
     * and a reader cannot.
     *
     * ## What the app hands over, and what it does not
     *
     * Base64 and a media type, read from a `File` by the app — because reading a file is a browser's
     * job and this package runs in a test with no `FileReader` in it, which is the same line
     * `publish` draws about writing one.
     *
     * The **size** comes with it too, and it is not decoration: an `<img>` with no intrinsic size is
     * a hole of zero height until it loads, so every word under it jumps down when it arrives. A
     * builder that stores only a URL cannot fix that because it has never seen the file. This one
     * has.
     *
     * ## The name is deduped, never overwritten
     *
     * Two files called `로고` is one of them unreachable — `assetNamed` answers with whichever came
     * first — so the second becomes `로고 2`. Overwriting would be the more helpful-looking answer
     * and the wrong one: a reader adding a second logo has not asked to lose the first.
     */
    register(
      'insertAsset',
      async (payload) => await this._insertAsset(editor, payload),
      (payload) =>
        typeof payload?.data === 'string' &&
        !!payload.data &&
        typeof payload?.type === 'string' &&
        !!payload.type &&
        !!this._resourcesBox(editor)
    );

    /**
     * **The address a connection points at** — the one thing about a form only a reader can supply.
     *
     * `setDatasetInfo`'s shape, for `setDatasetInfo`'s reason: a resource is not a block, no
     * selection names it, and a reader edits it from the panel of the thing that refers to it.
     *
     * Reached from the **form's** own panel rather than from a list of connections, which is where a
     * reader is when the question comes up: they have just put a form on a page and it says it has
     * nowhere to send. The row says how many forms share it, because changing it changes all of them
     * and that is the one thing about a named reference a reader has to be told.
     */
    register(
      'setServiceInfo',
      async (payload) => await this._setService(editor, payload),
      (payload) =>
        !!this._service(editor, payload) &&
        (typeof payload?.endpoint === 'string' ||
          typeof payload?.label === 'string' ||
          typeof payload?.returnField === 'string' ||
          typeof payload?.trapField === 'string' ||
          payload?.method === 'post' ||
          payload?.method === 'get')
    );

    /**
     * **Go and get the rows** — the half of a `url` dataset that did not exist.
     *
     * ## Why the fetch happens here and not in the published page
     *
     * A dataset could say `kind: 'url'` and name an address, and nothing anywhere called `fetch`.
     * There were two places to put it and only one of them keeps what this product has:
     *
     * - **in the page**, which means shipping a script. Every page would grow a runtime, the rows
     *   would arrive after the first paint, a crawler would see an empty list, and a visitor whose
     *   request failed would get a section with nothing in it. The whole export currently contains
     *   no `<script>` at all, and this would have been the thing that ended that.
     * - **here**, which means the rows are *in the document* by the time anybody publishes. The page
     *   stays a file, the list is in the HTML a crawler reads, and what a visitor sees is what the
     *   reader saw when they pressed 새로 가져오기.
     *
     * The cost is honest and is the reason the button says what it says: the rows are as fresh as
     * the last time somebody asked. A dataset that has to be live every minute is a different
     * feature and needs the script; this is the one every site actually has.
     *
     * ## What it accepts
     *
     * A JSON array of objects. Not a CSV, not a nested envelope, not a `{ data: [...] }` unwrapped
     * by guessing — a guess here is a silent wrong answer, and a reader whose service returns
     * something else needs to be told rather than shown an empty list. The columns are the union of
     * the keys, in the order they are first seen, which is what a person writing that JSON meant by
     * putting them in that order.
     *
     * ## And it never empties a dataset
     *
     * A response that is not an array, or an array with nothing in it, leaves the rows alone and
     * fails. Otherwise one bad deploy of somebody's API silently deletes the content of their page —
     * and the rows a reader designed against are the only copy.
     */
    register(
      'refreshDataset',
      async (payload) => await this._refresh(editor, payload),
      (payload) => {
        const dataset = this._dataset(editor, payload);
        const url = dataset?.attributes?.url;
        return !!dataset && dataset.attributes?.kind === 'url' && typeof url === 'string' && !!url.trim();
      }
    );

    /**
     * A column: added, renamed, or taken away — and the rows kept in step. See the header.
     */
    register(
      'setDatasetField',
      async (payload) => await this._setField(editor, payload),
      (payload) => this._canSetField(editor, payload)
    );

    /** One cell. The gesture a reader makes fifty times and the reason any of this exists. */
    register(
      'setDatasetCell',
      async (payload) => await this._setCell(editor, payload),
      (payload) => this._canSetCell(editor, payload)
    );

    /**
     * **A block of cells**, which is how data gets into this product at all.
     *
     * ## Why it is one command and not forty `setDatasetCell`s
     *
     * A reader copies eight rows of five columns out of a spreadsheet, and forty writes is forty
     * entries in the document's history: the undo that puts it back is forty presses, and the
     * thirty-ninth leaves a dataset half-pasted that nothing on screen explains. One transaction,
     * one undo — the padding drag's rule, and the ruler's before it.
     *
     * ## What it will and will not grow
     *
     * **Rows, yes.** A paste of eight into a table of three means eight, and stopping at three would
     * silently drop five and look like it worked.
     *
     * **Columns, no.** A wider paste is trimmed at the last column, because a column has a *name* —
     * a name `field:가격` refers to, a name a card is bound through — and a paste cannot invent one.
     * `엑셀 열 6` in a document is worse than five columns and a sentence saying so.
     */
    register(
      'setDatasetCells',
      async (payload) => await this._setCells(editor, payload),
      (payload) =>
        !!this._dataset(editor, payload) &&
        Array.isArray(payload?.values) &&
        (payload!.values as unknown[]).length > 0 &&
        Number.isInteger(payload?.row) &&
        typeof payload?.field === 'string'
    );

    /**
     * A row, at the end or at a place.
     *
     * Empty rather than a copy of the one above it: a new product is a new product, and a duplicate
     * that a reader has to empty out is a duplicate that ships with the last one's price on it.
     */
    register(
      'addDatasetRow',
      async (payload) => await this._addRow(editor, payload),
      (payload) => this._dataset(editor, payload) !== undefined
    );

    register(
      'removeDatasetRow',
      async (payload) => await this._removeRow(editor, payload),
      (payload) => this._rowAt(editor, payload) !== undefined
    );

    /**
     * The whole dataset — **unless a list is drawing it**.
     *
     * `createComponentFrom` refuses a block already inside a definition for the same kind of reason:
     * refusing while it is still a gesture beats letting a reader make a document that cannot be
     * drawn. A collection whose `source` names nothing draws nothing, and nothing is exactly what a
     * reader would then be looking at while wondering what they broke.
     *
     * Which is also why the count is worth having in the panel: *3곳에서 씁니다* is a sentence a
     * reader can act on, and a disabled button with no reason is not.
     */
    register(
      'removeDataset',
      async (payload) => await this._remove(editor, payload),
      (payload) => this._dataset(editor, payload) !== undefined && this._usesOf(editor, payload) === 0
    );

    /**
     * **A copy of one**, which is the fourth act and the one no list offered for a dataset.
     *
     * A page can be made, renamed, duplicated and removed; a dataset could do three of those.
     * Measured by putting the rail's three lists beside each other, which is how the component
     * library's missing two were found as well.
     *
     * Worth having for the reason a page's duplicate is: the second one is nearly the first. A reader
     * with a 상품 dataset who wants 지난-상품 wants those columns and those rows, then a few edits —
     * and the alternative is typing the columns again and getting one of them slightly wrong, which
     * is the fault that makes a `field:` reference draw nothing.
     *
     * The **name** is what has to change, because a name is what a collection points at: two
     * datasets called 상품 is a list drawing one of them and nobody able to say which.
     */
    register(
      'duplicateDataset',
      async (payload) => await this._duplicate(editor, payload),
      (payload) => this._dataset(editor, payload) !== undefined
    );
  }

  /** A name nothing else has, made from the one being copied — 상품, 상품 2, 상품 3. */
  private _freeName(editor: Editor, base: string): string {
    const taken = new Set(
      this._resources(editor).datasets.map((one) => String(one.attributes?.name ?? ''))
    );
    if (!taken.has(base)) return base;
    for (let n = 2; n < 500; n += 1) {
      const tried = `${base} ${n}`;
      if (!taken.has(tried)) return tried;
    }
    return `${base} ${Date.now()}`;
  }

  private async _duplicate(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    const dataset = this._dataset(editor, payload);
    const store = this._store(editor);
    if (!dataset || !store) return false;

    const parentId = String(dataset.parentId ?? '');
    if (!parentId) return false;

    const attrs = (dataset.attributes ?? {}) as Record<string, unknown>;
    const name = this._freeName(editor, String(attrs.name ?? '데이터'));
    const copied = this._copyRich(editor, this._records(dataset));
    const step = addChild(
      parentId,
      node(
        'dataset',
        {
          ...attrs,
          name,
          /*
           * The label follows the name rather than being copied, because a reader looking at two
           * rows both called 상품 in the rail cannot tell them apart — and the label is what the rail
           * draws.
           */
          label: `${String(attrs.label ?? attrs.name ?? '데이터')} 사본`,
          // A fresh array either way: two datasets sharing one records array is one document with
          // two names for the same rows, which the next edit would prove.
          fields: [...this._fields(dataset)],
          /*
           * **And fresh words**, which the copied array alone did not give.
           *
           * A 서식 있는 글 cell holds `text:요약-스택`, and copying the *string* leaves two datasets'
           * cells pointing at one node: editing the copy's summary edited the original's. The array
           * was copied and the thing it referred to was not, which is the shallow-copy fault one
           * level further down than the one the comment above was written about.
           *
           * It is also what makes deleting a row simple. A `richText` belongs to the cell that names
           * it — when the row goes, the words go — and that rule is only safe once nothing shares
           * one.
           */
          records: copied.records
        },
        []
      ) as never,
      ((store.getNode(parentId)?.content ?? []) as unknown[]).length
    );
    /* And the copied words beside it, in the same box and the same transaction. */
    const words = copied.nodes.map((one) => addChild(parentId, one as never));
    return (await transaction(editor, [step, ...words] as never).commit()).success === true;
  }

  // ── Reading ────────────────────────────────────────────────────────────────

  private _store(editor: Editor): { getNode: (sid: string) => Node | undefined } | undefined {
    return editor.dataStore;
  }

  private _rootId(editor: Editor): string {
    return editor.getRootId() ?? '';
  }

  /** The dataset a payload names, if it is one. */
  private _dataset(editor: Editor, payload?: Record<string, unknown>): Node | undefined {
    const node = this._store(editor)?.getNode(String(payload?.nodeId ?? ''));
    return node?.stype === 'dataset' ? node : undefined;
  }

  /**
   * Its columns, **as what they declare** rather than as names.
   *
   * This read the array and kept the strings, which was right when a column *was* a string. A column
   * knows its own kind now, so a command that kept only the names would drop every one of them on
   * the next write — a rename that silently turned a date column into a text column, once per
   * rename, with nothing to see.
   */
  private _fields(dataset: Node): DataField[] {
    return fieldsFrom(dataset.attributes?.fields);
  }

  /** And just their names, for the several questions that are only about those. */
  private _names(dataset: Node): string[] {
    return columnNames(this._fields(dataset));
  }

  /** Its rows, copied — every write here builds a new array (see the header). */
  private _records(dataset: Node): Record<string, unknown>[] {
    const rows = dataset.attributes?.records;
    return Array.isArray(rows) ? rows.map((row) => ({ ...(row as Record<string, unknown>) })) : [];
  }

/**
   * **서식 있는 글은 그 행의 것이다** — every `richText` a set of rows points at, and where it lives.
   *
   * Asked as *행을 지우면 richText 도 그냥 필드니까 같이 지워야 하는 것 아닌가*, and the answer is yes.
   * A `richText` is not a shared resource like an asset or a definition; it is one cell's **value**,
   * kept as nodes because a cell is a string and a summary with a link in it is not. When the row
   * goes, the value goes.
   *
   * What made that look risky was a different fault, one level up: `duplicateDataset` copied the
   * records — the `text:요약-스택` strings with them — so two datasets' cells pointed at **one** node
   * and editing the copy's summary edited the original's. Deleting a row would then have taken words
   * out of a dataset nobody touched.
   *
   * So the order is the other way round. **Copying copies the words**, which makes sharing
   * impossible; and then removing is unconditional and simple. This is what counts what is left, for
   * both.
   */
  private _richIn(editor: Editor, rows: Record<string, unknown>[]): string[] {
    const store = this._store(editor);
    const doc = { rootId: this._rootId(editor), getNode: (sid: string) => store?.getNode(sid) };
    const found: string[] = [];
    for (const row of rows) {
      for (const value of Object.values(row)) {
        if (!isRichRef(value)) continue;
        const node = richTextNamed(doc as never, value);
        if (node?.sid && !found.includes(String(node.sid))) found.push(String(node.sid));
      }
    }
    return found;
  }

  /**
   * How many cells **anywhere in the document** point at each of them.
   *
   * Counted rather than assumed, and that is the difference between believing the rule above and
   * checking it: a document arrives from a file, and a file can say anything. A node two cells share
   * is kept — an orphan is a document that grew, a missing paragraph is a document that lost
   * something. `documentFaults` is where the orphan is reported.
   */
  private _richUses(editor: Editor, ids: string[]): Map<string, number> {
    const store = this._store(editor);
    const doc = { rootId: this._rootId(editor), getNode: (sid: string) => store?.getNode(sid) };
    const count = new Map<string, number>(ids.map((sid) => [sid, 0]));

    for (const data of datasetsOf(doc as never)) {
      for (const row of data.records) {
        for (const value of Object.values(row)) {
          if (!isRichRef(value)) continue;
          const node = richTextNamed(doc as never, value);
          const sid = node?.sid ? String(node.sid) : undefined;
          if (sid && count.has(sid)) count.set(sid, (count.get(sid) ?? 0) + 1);
        }
      }
    }
    return count;
  }

  /** The steps that take the words of these rows with them — none for a node something else uses. */
  private _dropRich(editor: Editor, rows: Record<string, unknown>[]): unknown[] {
    const store = this._store(editor);
    const ids = this._richIn(editor, rows);
    const uses = this._richUses(editor, ids);
    const steps: unknown[] = [];
    for (const sid of ids) {
      if ((uses.get(sid) ?? 0) > 1) continue;
      const parent = store?.getNode(sid)?.parentId;
      if (typeof parent === 'string' && parent) steps.push(removeChild(parent, sid));
    }
    return steps;
  }

/**
   * Rows copied **with their words**, and the new `richText` nodes to add beside them.
   *
   * A 서식 있는 글 cell holds a reference, so copying the record copies the *string* and leaves two
   * cells pointing at one node — the copy's summary and the original's became the same paragraph, and
   * the next edit to either proved it.
   *
   * Which is the fault that made deleting a row look risky. Once a copy has its own words, nothing
   * shares one, and a row taking its value with it is simply true.
   */
  private _copyRich(
    editor: Editor,
    rows: Record<string, unknown>[]
  ): { records: Record<string, unknown>[]; nodes: unknown[] } {
    const store = this._store(editor);
    const doc = { rootId: this._rootId(editor), getNode: (sid: string) => store?.getNode(sid) };
    const nodes: unknown[] = [];
    /** One new node per **original**, so two cells that shared one before still share the copy. */
    const made = new Map<string, string>();

    const records = rows.map((row) => {
      const next: Record<string, unknown> = { ...row };
      for (const [field, value] of Object.entries(row)) {
        if (!isRichRef(value)) continue;
        const from = richTextNamed(doc as never, value);
        if (!from) continue;

        const was = String(from.attributes?.id ?? '');
        let id = made.get(was);
        if (!id) {
          id = this._freeRichId(editor, was);
          made.set(was, id);
          /*
           * `copyOf` — the same deep copy a page's duplicate makes, and for the same reason it
           * exists: a tree with no sids in it, so the copy is a different node all the way down
           * rather than a second thing claiming the original's identity.
           */
          const made2 = copyOf(doc as never, String(from.sid)) as Record<string, unknown> | undefined;
          if (made2) {
            made2.attributes = { ...((made2.attributes ?? {}) as Record<string, unknown>), id };
            nodes.push(made2);
          }
        }
        next[field] = richRef(id);
      }
      return next;
    });

    return { records, nodes };
  }

  /** An id no `richText` in this document has, from the one being copied. */
  private _freeRichId(editor: Editor, from: string): string {
    const store = this._store(editor);
    const doc = { rootId: this._rootId(editor), getNode: (sid: string) => store?.getNode(sid) };
    const taken = new Set<string>();
    const root = store?.getNode(this._rootId(editor));
    for (const sid of ((root?.content ?? []) as string[])) {
      const box = store?.getNode(sid);
      if (box?.stype !== 'resources') continue;
      for (const each of ((box.content ?? []) as string[])) {
        const one = store?.getNode(each);
        if (one?.stype === 'richText' && typeof one.attributes?.id === 'string') taken.add(one.attributes.id);
      }
    }
    void doc;
    const stem = from || '글';
    let id = `${stem} 사본`;
    for (let n = 2; taken.has(id); n += 1) id = `${stem} 사본 ${n}`;
    return id;
  }

  /** The row a payload names, when the number is one this dataset has. */
  private _rowAt(editor: Editor, payload?: Record<string, unknown>): number | undefined {
    const dataset = this._dataset(editor, payload);
    if (!dataset) return undefined;
    const row = Number(payload?.row);
    return Number.isInteger(row) && row >= 0 && row < this._records(dataset).length ? row : undefined;
  }

  /** Where the resources live, and every dataset in there. */
  private _resources(editor: Editor): { box?: Node; datasets: Node[] } {
    const store = this._store(editor);
    if (!store) return { datasets: [] };
    const root = store.getNode(this._rootId(editor));
    const box = ((root?.content ?? []) as unknown[])
      .filter((sid): sid is string => typeof sid === 'string')
      .map((sid) => store.getNode(sid))
      .find((child) => child?.stype === 'resources');

    const datasets = ((box?.content ?? []) as unknown[])
      .filter((sid): sid is string => typeof sid === 'string')
      .map((sid) => store.getNode(sid))
      .filter((one): one is Node => one?.stype === 'dataset');

    return { box, datasets };
  }

  /**
   * How many collections draw this dataset, anywhere in the document.
   *
   * Walked rather than counted once and kept, for the reason every count in this repository is
   * walked: a stored number is a number that goes stale, and this one is the difference between a
   * command that refuses and a command that breaks a page.
   */
  private _usesOf(editor: Editor, payload?: Record<string, unknown>): number {
    const store = this._store(editor);
    const dataset = this._dataset(editor, payload);
    if (!store || !dataset) return 0;
    const name = dataset.attributes?.name;

    let used = 0;
    const walk = (sid: string, depth = 0) => {
      if (depth > 64) return;
      const one = store.getNode(sid);
      if (!one) return;
      if (one.stype === 'collection' && one.attributes?.source === name) used += 1;
      for (const child of (one.content ?? []) as unknown[]) if (typeof child === 'string') walk(child, depth + 1);
    };
    walk(this._rootId(editor));
    return used;
  }

  // ── Writing ────────────────────────────────────────────────────────────────

  private _canInsert(editor: Editor, payload?: Record<string, unknown>): boolean {
    const name = String(payload?.name ?? '').trim();
    if (!name) return false;
    const { box, datasets } = this._resources(editor);
    return box !== undefined && !datasets.some((one) => one.attributes?.name === name);
  }

  private async _insert(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    if (!this._canInsert(editor, payload)) return false;
    const { box } = this._resources(editor);
    const name = String(payload!.name).trim();
    const label = typeof payload?.label === 'string' && payload.label.trim() ? payload.label.trim() : name;

    /*
     * One column and one row, not an empty pair.
     *
     * A dataset with no columns cannot be pointed at by anything — `field:` needs a name — and a
     * dataset with no rows draws nothing, so an empty one gives a reader a list that is invisible
     * and a panel with nothing to type into. One of each is the smallest thing that can be *seen*
     * and then edited, which is what "new" should mean.
     */
    const step = addChild(
      String(box!.sid),
      node('dataset', { name, label, kind: 'inline', fields: ['이름'], records: [{ 이름: '' }] }, []) as never,
      ((box!.content ?? []) as unknown[]).length
    );
    return (await transaction(editor, [step] as never).commit()).success === true;
  }

  /**
   * The fetch itself, and the three ways it refuses.
   *
   * `fetch` is taken from the payload when one is given, which is not a testing hook so much as the
   * only honest way to hold this: a command that reached for a global would be a command no unit
   * test could ask a question of, and the questions worth asking here — a service that returns an
   * object, an empty array, a 500 — are exactly the ones a browser test cannot arrange.
   */
  private async _refresh(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    const dataset = this._dataset(editor, payload);
    const url = dataset?.attributes?.url;
    if (!dataset || typeof url !== 'string' || !url.trim()) return false;

    const get = (payload?.fetch as typeof fetch | undefined) ?? globalThis.fetch;
    if (typeof get !== 'function') return false;

    let rows: unknown;
    try {
      const answer = await get(url.trim());
      if (!answer || (answer as Response).ok === false) return false;
      rows = await (answer as Response).json();
    } catch {
      // A service that is down, an address that is wrong, a body that is not JSON. All three leave
      // the rows a reader designed against exactly where they were.
      return false;
    }

    if (!Array.isArray(rows) || rows.length === 0) return false;

    const records = rows.filter(
      (one): one is Record<string, unknown> => !!one && typeof one === 'object' && !Array.isArray(one)
    );
    if (records.length === 0) return false;

    /*
     * The columns are the union of the keys **in the order they are first seen**, which is what
     * somebody writing that JSON meant by putting them in that order. Not the first row's keys: a
     * service that omits an empty field would drop a column for every row after the first.
     */
    const fields: string[] = [];
    for (const row of records) {
      for (const key of Object.keys(row)) if (!fields.includes(key)) fields.push(key);
    }

    const step = setAttrs(String(dataset.sid), { fields, records });
    return (await transaction(editor, [step] as never).commit()).success === true;
  }

  /** The container this schema keeps referred-to things in — datasets, connections, files. */
  private _resourcesBox(editor: Editor): Node | undefined {
    const store = this._store(editor);
    const rootId = (editor as never as { getRootId?: () => string }).getRootId?.();
    if (!store || !rootId) return undefined;
    for (const child of (store.getNode(rootId)?.content ?? []) as unknown[]) {
      if (typeof child !== 'string') continue;
      const box = store.getNode(child);
      if (box?.stype === 'resources') return box as Node;
    }
    return undefined;
  }

  private async _insertAsset(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    const box = this._resourcesBox(editor);
    const store = this._store(editor);
    const rootId = (editor as never as { getRootId?: () => string }).getRootId?.();
    if (!box || !store || !rootId) return false;

    const data = String(payload?.data ?? '');
    const type = String(payload?.type ?? '');
    if (!data || !type) return false;

    /*
     * Named after the file, without its extension — `로고.png` becomes `로고`, because the type is
     * already on the node and a name that repeats it reads as `로고.png.png` in the folder.
     */
    /*
     * **Composed.** The name comes from the file a reader chose, and a macOS file picker hands over
     * decomposed names — so two pictures both showing `로고` would be two different names, the check
     * below would pass, and one of them would be permanently unreachable. `names.ts` has the rest.
     */
    const said = nfc(String(payload?.label ?? payload?.name ?? '그림'))
      .replace(/\.[^.]+$/, '')
      .trim();
    const taken = new Set(
      assetsOf({ rootId, getNode: (sid: string) => store.getNode(sid) } as never).map((one) => one.name)
    );
    let name = said || '그림';
    for (let n = 2; taken.has(name); n += 1) name = `${said || '그림'} ${n}`;

    const step = addChild(
      String(box.sid),
      node(
        'asset',
        {
          name,
          label: typeof payload?.label === 'string' ? payload.label : undefined,
          type,
          data,
          width: typeof payload?.width === 'number' ? payload.width : undefined,
          height: typeof payload?.height === 'number' ? payload.height : undefined,
          /** The same picture, smaller — see `srcsetFor` for what a browser does with them. */
          sizes: Array.isArray(payload?.sizes) ? payload.sizes : undefined
        },
        []
      ) as never,
      ((box.content ?? []) as unknown[]).length
    );
    return (await transaction(editor, [step] as never).commit()).success === true;
  }

  /** The connection a payload names, by name — never by sid, which a document cannot carry. */
  private _service(editor: Editor, payload?: Record<string, unknown>): Node | undefined {
    const store = this._store(editor);
    const rootId = (editor as never as { getRootId?: () => string }).getRootId?.();
    if (!store || !rootId) return undefined;

    const name = payload?.name;
    if (typeof name !== 'string' || !name) return undefined;

    for (const child of (store.getNode(rootId)?.content ?? []) as unknown[]) {
      if (typeof child !== 'string') continue;
      const box = store.getNode(child);
      if (box?.stype !== 'resources') continue;
      for (const each of (box.content ?? []) as unknown[]) {
        if (typeof each !== 'string') continue;
        const one = store.getNode(each);
        if (one?.stype === 'service' && one.attributes?.name === name) return one as Node;
      }
    }
    return undefined;
  }

  private async _setService(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    const service = this._service(editor, payload);
    if (!service) return false;

    const attrs: Record<string, unknown> = {};
    if (typeof payload!.endpoint === 'string') attrs.endpoint = payload!.endpoint.trim() || undefined;
    if (typeof payload!.label === 'string') attrs.label = payload!.label;
    if (payload!.method === 'post' || payload!.method === 'get') attrs.method = payload!.method;
    // The two names the service uses for its own hidden fields — see `hiddenFields`.
    if (typeof payload!.returnField === 'string')
      attrs.returnField = payload!.returnField.trim() || undefined;
    if (typeof payload!.trapField === 'string')
      attrs.trapField = payload!.trapField.trim() || undefined;
    if (Object.keys(attrs).length === 0) return false;

    const step = setAttrs(String(service.sid), attrs);
    return (await transaction(editor, [step] as never).commit()).success === true;
  }

  private _canSetInfo(editor: Editor, payload?: Record<string, unknown>): boolean {
    if (!this._dataset(editor, payload)) return false;
    return (
      typeof payload?.label === 'string' ||
      typeof payload?.url === 'string' ||
      typeof payload?.live === 'boolean' ||
      payload?.kind === 'inline' ||
      payload?.kind === 'url'
    );
  }

  private async _setInfo(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    if (!this._canSetInfo(editor, payload)) return false;
    const dataset = this._dataset(editor, payload)!;
    const attrs: Record<string, unknown> = {};
    if (typeof payload!.label === 'string') attrs.label = payload!.label;
    if (payload!.kind === 'inline' || payload!.kind === 'url') attrs.kind = payload!.kind;
    if (typeof payload!.url === 'string') attrs.url = payload!.url;
    /*
     * And whether the **visitor's** browser fetches it too, which is the one attribute here that
     * changes what the published page *is* rather than what it says. `live.ts` argues the cost.
     */
    if (typeof payload!.live === 'boolean') attrs.live = payload!.live;

    const step = setAttrs(String(dataset.sid), attrs);
    return (await transaction(editor, [step] as never).commit()).success === true;
  }

  private _canSetField(editor: Editor, payload?: Record<string, unknown>): boolean {
    const dataset = this._dataset(editor, payload);
    const field = String(payload?.field ?? '').trim();
    if (!dataset || !field) return false;
    const names = this._names(dataset);
    const rename = typeof payload?.rename === 'string' ? payload.rename.trim() : undefined;

    const kind = payload?.kind;
    /**
     * **A kind names two different acts**, and reading it as one refused half of them.
     *
     * On a column that exists it *changes* what that column holds. On one that does not it is the
     * kind the column is **made** with — which is the ordinary way to add one, because *발행일,
     * 날짜* is a single decision and every table of this kind asks for both at once.
     *
     * Written as one branch that required the column to exist, and the whole 속성 추가 surface came
     * back `false` in silence: the form offered fourteen kinds and adding with any of them did
     * nothing at all. Which is this repository's own recurring fault seen from the other side — a
     * control that lights up and does not act, arriving as one that acts and was never allowed to.
     */
    if (kind !== undefined && !DATA_FIELD_KINDS.includes(kind as DataFieldKind)) return false;
    if (kind !== undefined && names.includes(field)) return true;
    if (payload?.remove === true) return names.includes(field);
    if (rename !== undefined) {
      // A rename to a name already taken would merge two columns into one, silently.
      return names.includes(field) && rename.length > 0 && !names.includes(rename);
    }
    return !names.includes(field);
  }

  private async _setField(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    if (!this._canSetField(editor, payload)) return false;
    const dataset = this._dataset(editor, payload)!;
    const field = String(payload!.field).trim();
    const rename = typeof payload!.rename === 'string' ? payload!.rename.trim() : undefined;
    const fields = this._fields(dataset);
    const records = this._records(dataset);

    let nextFields: DataField[];
    let nextRecords: Record<string, unknown>[];
    /** Steps that take a rich value's nodes with it, when this act removes one. */
    let dropped: unknown[] = [];

    if (payload!.kind !== undefined && fields.some((one) => one.name === field)) {
      /*
       * **What the column holds**, changed — and the records left exactly as they are.
       *
       * A kind says how a value is *entered and read*; it is not a conversion. Rewriting every cell
       * to fit a new kind would be a second act hidden inside this one, and the one that loses data:
       * a text column of `'예'` and `'아니오'` turned to boolean has to keep those words until a
       * reader replaces them, or the undo of a mis-click is a column of nothing.
       */
      const chosen = payload!.kind as DataFieldKind;
      const options = Array.isArray(payload!.options)
        ? (payload!.options as unknown[]).filter((one): one is string => typeof one === 'string')
        : undefined;
      nextFields = fields.map((one) =>
        one.name === field
          ? { ...one, kind: chosen, options: chosen === 'choice' ? (options ?? one.options) : undefined }
          : one
      );
      nextRecords = records;
    } else if (payload!.remove === true) {
      nextFields = fields.filter((one) => one.name !== field);
      nextRecords = records.map((row) => {
        const { [field]: _gone, ...rest } = row;
        return rest;
      });
      /*
       * And the words of a **서식 있는 글** column, which is the same rule one axis over: a column is
       * a cell in every row, so taking it away takes every one of those values with it.
       */
      dropped = this._dropRich(editor, records.map((row) => ({ [field]: row[field] })));
    } else if (rename !== undefined) {
      /*
       * In place, not appended.
       *
       * The column order is what the panel draws left to right, and a rename that moved a column to
       * the end would look to a reader like the column had been deleted and a new one made — which
       * is a different act with a different undo.
       */
      nextFields = fields.map((one) => (one.name === field ? { ...one, name: rename } : one));
      nextRecords = records.map((row) => {
        const { [field]: value, ...rest } = row;
        return { ...rest, [rename]: value ?? '' };
      });
    } else {
      /*
       * A new column is **text** until somebody says otherwise, which is what a column with nothing
       * said about it has always meant — and the kind is set from the same row it is named in, so
       * making a date column is one gesture rather than two.
       */
      nextFields = [...fields, fieldOf({ name: field, kind: payload!.kind }) ?? { name: field, kind: 'text' }];
      // Present and empty, rather than absent: `cellValue` can then say "" instead of undefined,
      // and a card bound to the new column draws a blank rather than the literal `field:새 열`.
      nextRecords = records.map((row) => ({ ...row, [field]: '' }));
    }

    const step = setAttrs(String(dataset.sid), { fields: nextFields, records: nextRecords });
    return (await transaction(editor, [step, ...dropped] as never).commit()).success === true;
  }

  private _canSetCell(editor: Editor, payload?: Record<string, unknown>): boolean {
    const dataset = this._dataset(editor, payload);
    if (!dataset || this._rowAt(editor, payload) === undefined) return false;
    return this._names(dataset).includes(String(payload?.field ?? ''));
  }

  private async _setCell(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    if (!this._canSetCell(editor, payload)) return false;
    const dataset = this._dataset(editor, payload)!;
    const row = this._rowAt(editor, payload)!;
    const field = String(payload!.field);
    const records = this._records(dataset);
    /* Stored as what the column says it holds — see `cellFor`, and what a price stored as words cost. */
    const kind = fieldNamed(this._fields(dataset), field)?.kind;
    records[row] = { ...records[row], [field]: cellFor(payload!.value, kind) };

    const step = setAttrs(String(dataset.sid), { records });
    return (await transaction(editor, [step] as never).commit()).success === true;
  }

  /**
   * The block, written once. See the registration for why rows grow and columns do not.
   */
  private async _setCells(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    const dataset = this._dataset(editor, payload);
    const values = payload?.values;
    if (!dataset || !Array.isArray(values) || values.length === 0) return false;

    const fields = this._names(dataset);
    const at = Number(payload?.row);
    const from = fields.indexOf(String(payload?.field));
    if (!Number.isInteger(at) || at < 0 || from < 0) return false;

    const records = this._records(dataset);
    const blank = Object.fromEntries(fields.map((one) => [one, '']));
    const kinds = new Map(this._fields(dataset).map((one) => [one.name, one.kind]));

    values.forEach((line, down) => {
      if (!Array.isArray(line)) return;
      const row = at + down;
      // Grown rather than trimmed: a paste that quietly kept three of eight rows looks like it worked.
      while (records.length <= row) records.push({ ...blank });
      const said = { ...records[row] };
      line.forEach((cell, across) => {
        const field = fields[from + across];
        // Past the last column: trimmed, because a column has a name and a paste cannot invent one.
        if (field === undefined) return;
        /*
         * And a paste is typed too. A column of prices pasted from a spreadsheet arrives as text and
         * has to be stored as numbers, or the list that sorts by it sorts alphabetically — which is
         * the same fault, arriving through the other door.
         */
        said[field] = cellFor(typeof cell === 'string' ? cell : String(cell ?? ''), kinds.get(field));
      });
      records[row] = said;
    });

    const step = setAttrs(String(dataset.sid), { records });
    return (await transaction(editor, [step] as never).commit()).success === true;
  }

  private async _addRow(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    const dataset = this._dataset(editor, payload);
    if (!dataset) return false;
    const records = this._records(dataset);
    const blank = Object.fromEntries(this._names(dataset).map((one) => [one, '']));

    const at = Number.isInteger(payload?.at) ? Math.max(0, Math.min(Number(payload!.at), records.length)) : records.length;
    records.splice(at, 0, blank);

    const step = setAttrs(String(dataset.sid), { records });
    return (await transaction(editor, [step] as never).commit()).success === true;
  }

  private async _remove(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    const dataset = this._dataset(editor, payload);
    if (!dataset || this._usesOf(editor, payload) > 0) return false;
    const { box } = this._resources(editor);
    if (!box) return false;

    /* Every row's words go with it — the dataset is the last thing that could have pointed at them. */
    const rich = this._dropRich(editor, this._records(dataset));
    const step = removeChild(String(box.sid), String(dataset.sid));
    return (await transaction(editor, [step, ...rich] as never).commit()).success === true;
  }

  private async _removeRow(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    const row = this._rowAt(editor, payload);
    if (row === undefined) return false;
    const dataset = this._dataset(editor, payload)!;
    const records = this._records(dataset);
    const [gone] = records.splice(row, 1);

    /*
     * **And its words**, in the same transaction — so it is one thing to undo, and so a document
     * does not grow a paragraph every time a row is deleted. A `richText` is this cell's value, not
     * a resource the document shares; see `_dropRich`.
     */
    const steps = [setAttrs(String(dataset.sid), { records }), ...this._dropRich(editor, [gone])];
    return (await transaction(editor, steps as never).commit()).success === true;
  }
}

/** The data commands, as an extension. */
export function createDataCommands(): Extension {
  return new SiteDataExtension();
}
