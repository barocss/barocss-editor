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
 * **A chart that refetches** — the same rule as a list, one step further.
 *
 * A list's live update rewrites **words**: each drawn piece says which column it came from, and the
 * script writes the new cell into it. A chart has no words to rewrite; what changes is **where its
 * points are**, which means the geometry has to run again in the visitor's browser.
 *
 * ## Which is a second implementation, and it is the honest cost
 *
 * `liveScript` already carries one — `rows`, the filter-sort-limit the export ran — and the reason
 * it is safe is not that it is small: it is `runs the same filter, sort and limit as the export
 * does`, a test that lifts the function out of the shipped string and compares it to `rowsOf` over
 * the same data. The chart's arithmetic gets the same treatment, held against `chartShape` and
 * `groupRows`, or the two drift and a published dashboard quietly disagrees with the editor.
 *
 * ## What the drawing carries
 *
 * Everything the geometry needs and nothing it can work out: the plot box (which does not change),
 * the columns (`data-label-by`, `data-value-by`, `data-group-by`, `data-agg` — already there), and
 * the query. The **axis does not travel**: it is recomputed, because a value that grew past the
 * published maximum drawn against the published axis is a bar out of its own chart.
 */
export function markLiveCharts(doc: Access, host: HTMLElement): boolean {
  let any = false;

  for (const el of [...host.querySelectorAll<HTMLElement>('[data-chart]')]) {
    const node = doc.getNode(String(el.getAttribute('data-b')));
    if (node?.stype !== 'chart') continue;

    const attrs = (node.attributes ?? {}) as Record<string, unknown>;
    const dataset = datasetNamed(doc as never, attrs.source);
    const url = said(dataset?.url);
    if (!dataset || dataset.kind !== 'url' || !url || dataset.live !== true) continue;
    /* Nothing drawn is nothing to move — the same rule a list with no rows follows. */
    if (el.querySelectorAll('[data-st-point]').length === 0) continue;

    const query: LiveQuery = {};
    if (said(attrs.sortBy)) query.sortBy = String(attrs.sortBy);
    if (said(attrs.sortDir)) query.sortDir = String(attrs.sortDir);
    if (said(attrs.where)) query.where = String(attrs.where);
    if (attrs.equals !== undefined) query.equals = String(attrs.equals);
    if (typeof attrs.limit === 'number' && Number.isFinite(attrs.limit)) query.limit = attrs.limit;

    el.setAttribute('data-st-live', url);
    if (Object.keys(query).length > 0) el.setAttribute('data-st-q', JSON.stringify(query));
    any = true;
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
    /*
     * **Every function first, then the two loops** — which is not only tidier.
     *
     * `runs the same filter, sort and limit as the export does` lifts these out of the shipped
     * string by cutting everything from the first `document.querySelectorAll`, so a helper written
     * after a loop is a helper the check cannot reach: the chart's arithmetic was added below and the
     * test that exists to stop it drifting could not see it. The layout is what keeps that check
     * honest.
     */
    "function num(r,k){var v=r&&r[k];if(typeof v==='number')return isFinite(v)?v:undefined;",
    "var s=cell(r,k).trim();if(!s)return undefined;var n=Number(s);return isFinite(n)?n:undefined}",
    // `groupRows`, shipped: one row per group, in the order the groups were first seen.
    "function group(data,q){if(!q.groupBy)return{rows:data,valueBy:q.valueBy||''};",
    "var keys=[],by={};data.forEach(function(r){var k=cell(r,q.groupBy);",
    "if(!by[k]){by[k]={n:0,v:[]};keys.push(k)}by[k].n++;var v=num(r,q.valueBy);if(v!==undefined)by[k].v.push(v)});",
    "var agg=q.agg||'sum';var out=agg==='count'?'개수':(q.valueBy||'개수');",
    "return{rows:keys.map(function(k){var h=by[k],a;",
    "if(agg==='count')a=h.n;else if(!h.v.length)a=0;",
    "else if(agg==='sum')a=h.v.reduce(function(t,x){return t+x},0);",
    "else if(agg==='avg')a=h.v.reduce(function(t,x){return t+x},0)/h.v.length;",
    "else a=agg==='min'?Math.min.apply(null,h.v):Math.max.apply(null,h.v);",
    "var o={};o[q.groupBy]=k;o[out]=a;return o}),valueBy:out}}",
    // `chartRows`: filter on the raw rows, then group, then sort and limit on the groups.
    "function asked(data,q){var g=group(rows(data,{where:q.where,equals:q.equals}),q);",
    "return{rows:rows(g.rows,{sortBy:q.sortBy,sortDir:q.sortDir,limit:q.limit}),valueBy:g.valueBy}}",
    // `boundsOf`: zero is always in range — see `chart.ts` for why that is not a setting.
    "function bounds(v){var r=v.filter(function(x){return isFinite(x)});if(!r.length)return{low:0,high:1};",
    "var lo=Math.min.apply(null,[0].concat(r)),hi=Math.max.apply(null,[0].concat(r));",
    "if(lo===hi)hi=lo+1;return{low:lo,high:hi}}",
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
    "document.querySelectorAll('[data-chart][data-st-live]').forEach(function(box){",
    "var svg=box.querySelector('svg');var pts=[].slice.call(box.querySelectorAll('[data-st-point]'));",
    "if(!svg||!pts.length)return;",
    "var q={};try{q=JSON.parse(box.getAttribute('data-st-q')||'{}')}catch(e){}",
    "q.labelBy=box.getAttribute('data-label-by')||'';q.valueBy=box.getAttribute('data-value-by')||'';",
    "q.groupBy=box.getAttribute('data-group-by')||'';q.agg=box.getAttribute('data-agg')||'sum';",
    "var kind=box.getAttribute('data-chart');",
    /*
     * The plot box, read back off the drawing rather than sent: the first and last point and the
     * baseline are already in the SVG, and a number said twice is a number that can disagree.
     */
    "fetch(box.getAttribute('data-st-live'),{headers:{accept:'application/json'}}).then(function(r){return r.json()}).then(function(data){",
    // Never empties, which is a list's rule and is the same rule here.
    "if(!Array.isArray(data)||!data.length)return;",
    "var got=asked(data,q);var want=got.rows.map(function(r){return num(r,got.valueBy)}).filter(function(v){return v!==undefined});",
    "if(!want.length)return;",
    /*
     * **A bar keeps its place and changes its height**, which is the whole of a live chart: the
     * published drawing already has the columns, the labels and the widths, and what a refetch
     * changes is how tall each one is. More points than were drawn are ignored rather than invented —
     * a column that was never published has no place on the axis and no label under it.
     */
    "var b=bounds(want);",
    "var top=+svg.getAttribute('data-plot-top'),h=+svg.getAttribute('data-plot-height');",
    "if(!isFinite(top)||!isFinite(h))return;",
    "var zero=top+h-((0-b.low)/((b.high-b.low)||1))*h;",
    "pts.forEach(function(p,i){if(i>=want.length){p.style.display='none';return}p.style.removeProperty('display');",
    "var v=want[i];var y=top+h-((v-b.low)/((b.high-b.low)||1))*h;",
    "p.setAttribute('data-st-value',String(v));",
    "if(kind==='bar'){p.setAttribute('y',String(Math.min(y,zero)));p.setAttribute('height',String(Math.max(1,Math.abs(zero-y))))}",
    "else if(p.tagName==='circle'){p.setAttribute('cy',String(y))}});",
    /*
     * A **donut** is left alone. Its slices are arcs whose path is a share of a turn, and rewriting
     * one is drawing it again — which is a renderer, which is the thing this page does not ship.
     * Stated rather than hidden: a live donut shows what it was published with.
     */
    "}).catch(function(){});",
    "});",
    "})();"
  ].join('');
}
