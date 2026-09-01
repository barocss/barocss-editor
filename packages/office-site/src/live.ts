/**
 * A list that is **fetched again in the visitor's browser**.
 *
 * ## Why this is a second mode and not the default
 *
 * `refreshDataset` already goes and gets a `kind: 'url'` dataset's rows — *in the editor*, when a
 * reader presses 새로 가져오기 — and `data-commands.ts` has the argument for why that is the right
 * default: the rows end up **in the document**, so the published page stays a file, a crawler reads
 * the list, and a visitor whose network failed still sees something. The cost is stated there too:
 * the rows are as fresh as the last time somebody asked.
 *
 * For a price that changes hourly that cost is the whole problem, and the answer is the one thing
 * this export has spent its whole life avoiding — a script. So it is a **switch on the dataset**,
 * off by default, and turning it on buys freshness with four things, all of them real:
 *
 * - the page ships a runtime, and a visitor whose script fails sees the published rows;
 * - a crawler indexes the published rows, not the live ones;
 * - the list moves after the first paint, which is a layout shift a reader should expect;
 * - the address has to allow the visitor's browser to read it (CORS), which the editor's own fetch
 *   never had to care about because it runs where the reader is.
 *
 * Written down here rather than left to be discovered, because every one of those is invisible from
 * the panel and three of them only show up on somebody else's machine.
 *
 * ## How it draws, which is the part that had to be decided
 *
 * **Not** by re-rendering. The page has no renderer in it and shipping one would be the runtime this
 * product exists without. What it ships instead is the drawing it already made, marked:
 *
 * - the list says which address it came from and how it was queried (`data-st-live`, `data-st-q`);
 * - each row says which one it is (`data-st-row`);
 * - each drawn piece that took its words from a column says which column (`data-st-field`).
 *
 * The script then does what a reader would do by hand: it fetches, runs the same filter-sort-limit
 * the export ran, writes each row's cells, clones the first row when there are more rows than were
 * drawn, and hides the extras when there are fewer. A card that changes *shape* per row is beyond
 * this — a row is the design the page was published with, with different words in it.
 *
 * ## And it never empties a list
 *
 * The same rule `refreshDataset` has, for the same reason: a response that is not an array, or an
 * empty one, leaves the published rows alone. One bad deploy of somebody's API should not blank the
 * page that quotes it.
 */
import { datasetNamed } from './data';

type Node = Record<string, any>;
type Access = { rootId: string; getNode: (sid: string) => Node | undefined };

/** What a live list carries so the script can run the same query the export ran. */
export interface LiveQuery {
  sortBy?: string;
  sortDir?: string;
  where?: string;
  equals?: string;
  limit?: number;
}

const said = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

/**
 * Which drawn part takes its words from which column, for one placement.
 *
 * Three things joined, and each of them lives where it does for a reason already argued: the
 * placement says what its variables answer (`field:가격`), the **definition** says which part takes
 * which variable (`componentBind`), and the parts are addressed by a durable `partId` rather than by
 * a sid. So the answer is a walk of the definition looking for each bound `partId`.
 */
function fieldsOfTemplate(doc: Access, template: Node | undefined): Map<string, string> {
  const found = new Map<string, string>();
  const componentId = said(template?.attributes?.componentId);
  if (!componentId) return found;

  // What the placement answers with, by variable name.
  const answers = new Map<string, string>();
  for (const child of (template?.content ?? []) as unknown[]) {
    if (typeof child !== 'string') continue;
    const value = doc.getNode(child);
    if (value?.stype !== 'componentValue') continue;
    const name = said(value.attributes?.name);
    const holds = said(value.attributes?.value);
    if (name && holds?.startsWith('field:')) answers.set(name, holds.slice('field:'.length));
  }
  if (answers.size === 0) return found;

  const definition = (() => {
    for (const child of (doc.getNode(doc.rootId)?.content ?? []) as unknown[]) {
      if (typeof child !== 'string') continue;
      const box = doc.getNode(child);
      if (box?.stype !== 'components') continue;
      for (const each of (box.content ?? []) as unknown[]) {
        if (typeof each !== 'string') continue;
        const one = doc.getNode(each);
        if (one?.stype === 'component' && one.attributes?.id === componentId) return one;
      }
    }
    return undefined;
  })();
  if (!definition) return found;

  /*
   * `text` only. A column that drives a colour or a width is a real binding and this cannot update
   * it: the value would have to become CSS, and the page has no stylesheet writer in it. Saying so
   * by ignoring it is honest — the words change and the design does not.
   */
  const wanted = new Map<string, string>();
  for (const child of (definition.content ?? []) as unknown[]) {
    if (typeof child !== 'string') continue;
    const bind = doc.getNode(child);
    if (bind?.stype !== 'componentBind' || bind.attributes?.attr !== 'text') continue;
    const part = said(bind.attributes?.part);
    const column = answers.get(String(bind.attributes?.var));
    if (part && column) wanted.set(part, column);
  }
  if (wanted.size === 0) return found;

  const walk = (sid: string, depth = 0) => {
    if (depth > 64) return;
    const node = doc.getNode(sid);
    if (!node) return;
    const partId = said(node.attributes?.partId);
    const column = partId ? wanted.get(partId) : undefined;
    if (column) found.set(sid, column);
    for (const child of (node.content ?? []) as unknown[]) {
      if (typeof child === 'string') walk(child, depth + 1);
    }
  };
  walk(String(definition.sid));
  return found;
}

/**
 * Mark every live list in a drawing, and say whether any were found.
 *
 * Run against the **drawing** after `data-b` exists, for the reason every other pass here is: a
 * collection inside a placed component is one element per placement, and the document would have to
 * work that out a second time.
 */
export function markLive(doc: Access, host: HTMLElement): boolean {
  let any = false;

  for (const el of [...host.querySelectorAll<HTMLElement>('[data-b]')]) {
    const node = doc.getNode(String(el.getAttribute('data-b')));
    if (node?.stype !== 'collection') continue;

    const attrs = (node.attributes ?? {}) as Record<string, unknown>;
    const dataset = datasetNamed(doc as never, attrs.source);
    const url = said(dataset?.url);
    if (!dataset || dataset.kind !== 'url' || !url || dataset.live !== true) continue;

    const template = (() => {
      for (const child of (node.content ?? []) as unknown[]) {
        if (typeof child !== 'string') continue;
        const one = doc.getNode(child);
        if (one?.stype === 'instance') return one;
      }
      return undefined;
    })();
    const fields = fieldsOfTemplate(doc, template);
    // Nothing on the card takes its words from a column: a live fetch would change nothing at all.
    if (fields.size === 0) continue;

    const query: LiveQuery = {};
    if (said(attrs.sortBy)) query.sortBy = String(attrs.sortBy);
    if (said(attrs.sortDir)) query.sortDir = String(attrs.sortDir);
    if (said(attrs.where)) query.where = String(attrs.where);
    if (attrs.equals !== undefined) query.equals = String(attrs.equals);
    if (typeof attrs.limit === 'number' && Number.isFinite(attrs.limit)) query.limit = attrs.limit;

    el.setAttribute('data-st-live', url);
    if (Object.keys(query).length > 0) el.setAttribute('data-st-q', JSON.stringify(query));

    const owner = String(el.getAttribute('data-b'));
    let rows = 0;
    for (const row of [...el.children] as HTMLElement[]) {
      const name = row.getAttribute('data-b') ?? '';
      if (!name.startsWith(`${owner}~`)) continue;
      row.setAttribute('data-st-row', String(rows));
      rows += 1;
      for (const part of [...row.querySelectorAll<HTMLElement>('[data-b]')]) {
        // A part's drawn name is `list~row~part`; the column is keyed by the part's own sid.
        const drawn = String(part.getAttribute('data-b'));
        const column = fields.get(drawn.slice(drawn.lastIndexOf('~') + 1));
        if (column) part.setAttribute('data-st-field', column);
      }
    }
    // A list that drew no rows has nothing to clone, so there is no shape to grow into.
    if (rows === 0) el.removeAttribute('data-st-live');
    else any = true;
  }

  return any;
}

/**
 * The runtime, and it is only shipped on a page that has a live list.
 *
 * Written out rather than built from a bundler for the reason the closer script is: this is the
 * whole of what the page runs, and a reader who opens the source should be able to read it. The
 * filter-sort-limit below is `rowsOf` said again in the language the page has — the one place in
 * this product where a rule is written twice, and the reason it is worth a test that runs both.
 */
export function liveScript(): string {
  return [
    "(function(){",
    "function cell(r,k){var v=r&&r[k];return v===undefined||v===null?'':String(v)}",
    "function rows(data,q){",
    "var out=data.slice();",
    "if(q.where)out=out.filter(function(r){return cell(r,q.where)===(q.equals===undefined?'':String(q.equals))});",
    "if(q.sortBy)out.sort(function(a,b){var x=a[q.sortBy],y=b[q.sortBy];",
    "var c=typeof x==='number'&&typeof y==='number'?x-y:cell(a,q.sortBy).localeCompare(cell(b,q.sortBy));",
    "return q.sortDir==='desc'?-c:c});",
    "if(typeof q.limit==='number')out=out.slice(0,Math.max(0,Math.trunc(q.limit)));",
    "return out}",
    "document.querySelectorAll('[data-st-live]').forEach(function(list){",
    "var drawn=[].slice.call(list.querySelectorAll('[data-st-row]'));if(!drawn.length)return;",
    "var shape=drawn[0].cloneNode(true);",
    "var q={};try{q=JSON.parse(list.getAttribute('data-st-q')||'{}')}catch(e){}",
    "fetch(list.getAttribute('data-st-live'),{headers:{accept:'application/json'}}).then(function(r){return r.json()}).then(function(data){",
    // Never empties: a response that is not a list, or an empty one, leaves the published rows.
    "if(!Array.isArray(data)||!data.length)return;",
    "var want=rows(data,q);if(!want.length)return;",
    "while(drawn.length<want.length){var copy=shape.cloneNode(true);drawn[drawn.length-1].after(copy);drawn.push(copy)}",
    "want.forEach(function(record,i){var row=drawn[i];row.style.removeProperty('display');",
    "[].slice.call(row.querySelectorAll('[data-st-field]')).forEach(function(el){",
    "var k=el.getAttribute('data-st-field');if(k in record)el.textContent=cell(record,k)})});",
    "for(var i=want.length;i<drawn.length;i++)drawn[i].style.display='none';",
    "}).catch(function(){});",
    "});",
    "})();"
  ].join('');
}
