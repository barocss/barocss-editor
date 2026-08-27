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
     * `kind: 'url'` is settable and nothing fetches — which is the design and not an omission. The
     * document keeps the address and the handful of rows a reader designs against; who fetches is a
     * question about the *published* page, and the answer is written in `data.ts` rather than
     * guessed at here.
     */
    register(
      'setDatasetInfo',
      async (payload) => await this._setInfo(editor, payload),
      (payload) => this._canSetInfo(editor, payload)
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
          records: this._records(dataset).map((row) => ({ ...row }))
        },
        []
      ) as never,
      ((store.getNode(parentId)?.content ?? []) as unknown[]).length
    );
    return (await transaction(editor, [step] as never).commit()).success === true;
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

  /** Its columns, as a plain list of names. */
  private _fields(dataset: Node): string[] {
    const declared = dataset.attributes?.fields;
    return Array.isArray(declared) ? declared.filter((one): one is string => typeof one === 'string') : [];
  }

  /** Its rows, copied — every write here builds a new array (see the header). */
  private _records(dataset: Node): Record<string, unknown>[] {
    const rows = dataset.attributes?.records;
    return Array.isArray(rows) ? rows.map((row) => ({ ...(row as Record<string, unknown>) })) : [];
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

  private _canSetInfo(editor: Editor, payload?: Record<string, unknown>): boolean {
    if (!this._dataset(editor, payload)) return false;
    return (
      typeof payload?.label === 'string' ||
      typeof payload?.url === 'string' ||
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

    const step = setAttrs(String(dataset.sid), attrs);
    return (await transaction(editor, [step] as never).commit()).success === true;
  }

  private _canSetField(editor: Editor, payload?: Record<string, unknown>): boolean {
    const dataset = this._dataset(editor, payload);
    const field = String(payload?.field ?? '').trim();
    if (!dataset || !field) return false;
    const fields = this._fields(dataset);
    const rename = typeof payload?.rename === 'string' ? payload.rename.trim() : undefined;

    if (payload?.remove === true) return fields.includes(field);
    if (rename !== undefined) {
      // A rename to a name already taken would merge two columns into one, silently.
      return fields.includes(field) && rename.length > 0 && !fields.includes(rename);
    }
    return !fields.includes(field);
  }

  private async _setField(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    if (!this._canSetField(editor, payload)) return false;
    const dataset = this._dataset(editor, payload)!;
    const field = String(payload!.field).trim();
    const rename = typeof payload!.rename === 'string' ? payload!.rename.trim() : undefined;
    const fields = this._fields(dataset);
    const records = this._records(dataset);

    let nextFields: string[];
    let nextRecords: Record<string, unknown>[];

    if (payload!.remove === true) {
      nextFields = fields.filter((one) => one !== field);
      nextRecords = records.map((row) => {
        const { [field]: _gone, ...rest } = row;
        return rest;
      });
    } else if (rename !== undefined) {
      /*
       * In place, not appended.
       *
       * The column order is what the panel draws left to right, and a rename that moved a column to
       * the end would look to a reader like the column had been deleted and a new one made — which
       * is a different act with a different undo.
       */
      nextFields = fields.map((one) => (one === field ? rename : one));
      nextRecords = records.map((row) => {
        const { [field]: value, ...rest } = row;
        return { ...rest, [rename]: value ?? '' };
      });
    } else {
      nextFields = [...fields, field];
      // Present and empty, rather than absent: `cellValue` can then say "" instead of undefined,
      // and a card bound to the new column draws a blank rather than the literal `field:새 열`.
      nextRecords = records.map((row) => ({ ...row, [field]: '' }));
    }

    const step = setAttrs(String(dataset.sid), { fields: nextFields, records: nextRecords });
    return (await transaction(editor, [step] as never).commit()).success === true;
  }

  private _canSetCell(editor: Editor, payload?: Record<string, unknown>): boolean {
    const dataset = this._dataset(editor, payload);
    if (!dataset || this._rowAt(editor, payload) === undefined) return false;
    return this._fields(dataset).includes(String(payload?.field ?? ''));
  }

  private async _setCell(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    if (!this._canSetCell(editor, payload)) return false;
    const dataset = this._dataset(editor, payload)!;
    const row = this._rowAt(editor, payload)!;
    const field = String(payload!.field);
    const records = this._records(dataset);
    records[row] = { ...records[row], [field]: payload!.value ?? '' };

    const step = setAttrs(String(dataset.sid), { records });
    return (await transaction(editor, [step] as never).commit()).success === true;
  }

  private async _addRow(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    const dataset = this._dataset(editor, payload);
    if (!dataset) return false;
    const records = this._records(dataset);
    const blank = Object.fromEntries(this._fields(dataset).map((one) => [one, '']));

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

    const step = removeChild(String(box.sid), String(dataset.sid));
    return (await transaction(editor, [step] as never).commit()).success === true;
  }

  private async _removeRow(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    const row = this._rowAt(editor, payload);
    if (row === undefined) return false;
    const dataset = this._dataset(editor, payload)!;
    const records = this._records(dataset);
    records.splice(row, 1);

    const step = setAttrs(String(dataset.sid), { records });
    return (await transaction(editor, [step] as never).commit()).success === true;
  }
}

/** The data commands, as an extension. */
export function createDataCommands(): Extension {
  return new SiteDataExtension();
}
