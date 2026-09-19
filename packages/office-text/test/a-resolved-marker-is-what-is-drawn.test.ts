import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **A marker a product resolved is the marker that gets drawn.**
 *
 * ## The claim, and where it was false
 *
 * `list-marker.test.ts` states it in prose: *`text.css` draws a marker from `data-list-type` only
 * where `data-marker` is empty, so a resolved number always wins.* Nothing checked it, and in one
 * of the four products it was not true.
 *
 * `text.css` narrows every one of its fallback rules with `[data-marker='']`, so a **resolved**
 * marker matches none of them — that is the narrowing working. `office-slides/slides.css` holds a
 * copy of the same nine declarations that is **not** narrowed:
 *
 *     .sl-list[data-list-type='ordered'] > .w-list-item::before { content: counter(sl-item) '.'; … }
 *
 * The deck's list draws `class="w-list sl-list"`, so on a deck both sheets are looking at the same
 * element — and for a resolved marker only the deck's copy has anything to say. It says a running
 * CSS counter. Word's numbering is not a running count: a definition can restart, can start at a
 * number that is not one, and two lists can share one sequence. So a deck showing a Word-numbered
 * list drew *the count of items so far* over **every** number the resolver had worked out.
 *
 * ## Why a unit check can answer this
 *
 * By `docs/specs/testing.md`'s line: **our code decides the answer, so it is a unit.** Specificity
 * is arithmetic over selectors we wrote, and the tie-break is the order the app `@import`s the two
 * sheets in — read here out of `apps/slide/src/style.css` rather than assumed, because that order
 * is the whole difference between a tie won and a tie lost.
 *
 * The mirror of the check the previous round ran by hand: it computed the nine declarations for an
 * **empty** marker and found `text.css` winning 9–0, which is why the deck's copy is already dead
 * there. This asks the same question on the other side of the narrowing.
 */

const repo = join(__dirname, '..', '..', '..');

// ── Reading only as much CSS as the question needs ─────────────────────────
//
// No postcss, for the reason `conformance/test/dark-is-actually-read.test.ts` gives: the question is
// selectors and declarations, that reads in a hundred lines, and a parser as a dependency makes a
// failure here something you have to read in two places.

type Spec = [number, number, number];
type Rule = {
  file: string;
  selector: string;
  pseudo: string | null;
  spec: Spec;
  media: string | null;
  order: number;
  decls: Map<string, string>;
};

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const splitTop = (list: string) => {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of list) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
};

const SIMPLE = /::[-\w]+|:[-\w]+\([^()]*\)|:[-\w]+|\[[^\]]+\]|\.[-\w]+|#[-\w]+|[-\w]+|\*/g;

const cmp = (a: Spec, b: Spec) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

function specificity(selector: string): Spec {
  const total: Spec = [0, 0, 0];
  const add = (s: Spec) => {
    total[0] += s[0];
    total[1] += s[1];
    total[2] += s[2];
  };
  for (const part of selector.match(SIMPLE) ?? []) {
    if (part.startsWith('#')) add([1, 0, 0]);
    else if (part.startsWith('.') || part.startsWith('[')) add([0, 1, 0]);
    else if (part.startsWith('::')) add([0, 0, 1]);
    else if (part.startsWith(':')) {
      const fn = /^:([-\w]+)\((.*)\)$/.exec(part);
      if (fn && ['not', 'is', 'has'].includes(fn[1])) {
        add(
          splitTop(fn[2])
            .map(specificity)
            .reduce((a, b) => (cmp(a, b) >= 0 ? a : b), [0, 0, 0] as Spec)
        );
      } else if (!fn || fn[1] !== 'where') add([0, 1, 0]);
    } else if (part !== '*') add([0, 0, 1]);
  }
  return total;
}

function parseInto(css: string, file: string, media: string | null, sink: Rule[]) {
  let i = 0;
  let prelude = '';
  while (i < css.length) {
    const ch = css[i];
    if (ch === '{') {
      let depth = 1;
      let j = i + 1;
      for (; j < css.length; j++) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}' && --depth === 0) break;
      }
      const body = css.slice(i + 1, j);
      const head = prelude.trim();
      prelude = '';
      i = j + 1;
      if (/^@media\b/.test(head)) {
        const cond = head.replace(/^@media\s*/, '').trim();
        parseInto(body, file, media ? `${media} and ${cond}` : cond, sink);
      } else if (/^@(supports|layer|scope|container)\b/.test(head)) {
        parseInto(body, file, media, sink);
      } else if (head && !head.startsWith('@')) {
        const decls = new Map<string, string>();
        for (const decl of body.split(';')) {
          const colon = decl.indexOf(':');
          if (colon < 0) continue;
          decls.set(decl.slice(0, colon).trim(), decl.slice(colon + 1).trim());
        }
        for (const selector of splitTop(head)) {
          sink.push({
            file,
            selector: selector.replace(/\s+/g, ' '),
            pseudo: /::[-\w]+/.exec(selector)?.[0] ?? null,
            spec: specificity(selector),
            media,
            order: sink.length,
            decls
          });
        }
      }
      continue;
    }
    if (ch === ';') {
      prelude = '';
      i++;
      continue;
    }
    prelude += ch;
    i++;
  }
}

// ── The two elements the question is about ─────────────────────────────────

type El = { tag: string; classes: string[]; attrs: Record<string, string>; parent?: El };

/** The combinator **preceding** each compound, right-to-left matching over a chain this shallow. */
function chain(selector: string): Array<{ comb: '>' | ' '; compound: string }> {
  const out: Array<{ comb: '>' | ' '; compound: string }> = [];
  let buf = '';
  let comb: '>' | ' ' = ' ';
  let depth = 0;
  for (const ch of selector.trim()) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (depth === 0 && (ch === ' ' || ch === '>')) {
      if (buf) {
        out.push({ comb, compound: buf });
        buf = '';
        comb = ' ';
      }
      if (ch === '>') comb = '>';
      continue;
    }
    buf += ch;
  }
  if (buf) out.push({ comb, compound: buf });
  return out;
}

/**
 * The parts of a compound this check does **not** model.
 *
 * Named rather than silently skipped: a rule with a `:has()` in it that this treated as "no match"
 * would drop out of the cascade and the answer would be confidently wrong. Every rule that has an
 * opinion about a marker is asserted to be fully modelled, below.
 */
function unmodelled(compound: string): string[] {
  return (compound.match(SIMPLE) ?? []).filter((part) => {
    if (part.startsWith('::') || part.startsWith('.') || part === '*') return false;
    if (part.startsWith('[')) return !/^\[\s*[-\w]+\s*(?:=\s*'[^']*'\s*)?\]$/.test(part);
    const fn = /^:([-\w]+)\((.*)\)$/.exec(part);
    if (fn) return fn[1] !== 'not' || splitTop(fn[2]).some((a) => unmodelled(a).length > 0);
    return part.startsWith(':');
  });
}

function matchCompound(compound: string, el: El): boolean {
  for (const part of compound.match(SIMPLE) ?? []) {
    if (part.startsWith('::') || part === '*') continue;
    if (part.startsWith('.')) {
      if (!el.classes.includes(part.slice(1))) return false;
      continue;
    }
    if (part.startsWith('[')) {
      const attr = /^\[\s*([-\w]+)\s*(?:=\s*'([^']*)'\s*)?\]$/.exec(part);
      if (!attr) return false;
      const have = el.attrs[attr[1]];
      if (have === undefined) return false;
      if (attr[2] !== undefined && have !== attr[2]) return false;
      continue;
    }
    const fn = /^:([-\w]+)\((.*)\)$/.exec(part);
    if (fn?.[1] === 'not') {
      if (splitTop(fn[2]).some((a) => matchCompound(a, el))) return false;
      continue;
    }
    if (part.startsWith(':')) return false;
    if (part !== el.tag) return false;
  }
  return true;
}

function matchesFrom(
  link: Array<{ comb: '>' | ' '; compound: string }>,
  idx: number,
  el: El | undefined
): boolean {
  if (idx < 0) return true;
  if (!el || !matchCompound(link[idx].compound, el)) return false;
  if (idx === 0) return true;
  if (link[idx].comb === '>') return matchesFrom(link, idx - 1, el.parent);
  for (let up = el.parent; up; up = up.parent) if (matchesFrom(link, idx - 1, up)) return true;
  return false;
}

const matches = (selector: string, el: El) => {
  const link = chain(selector.replace(/::[-\w]+/g, ''));
  return link.length > 0 && matchesFrom(link, link.length - 1, el);
};

type Won = { value: string; rule: Rule };

/** The cascade, run for one element and one pseudo: highest specificity, then latest in the sheet. */
function winner(rules: Rule[], el: El, pseudo: string | null, prop: string): Won | null {
  let best: Won | null = null;
  for (const rule of rules) {
    if (rule.pseudo !== pseudo) continue;
    if (!rule.decls.has(prop)) continue;
    if (!matches(rule.selector, el)) continue;
    if (best) {
      const order = cmp(rule.spec, best.rule.spec);
      if (order < 0 || (order === 0 && rule.order < best.rule.order)) continue;
    }
    best = { value: rule.decls.get(prop)!, rule };
  }
  return best;
}

// ── The sheets, in the order each app loads them ───────────────────────────

const PACKAGE_SHEET = /@import\s+["']@barocss\/([^/"']+)\/([^"']+\.css)["']/g;

/**
 * The package stylesheets an app imports, **in the app's own order**.
 *
 * Read rather than listed, because the order is load-bearing here: on a tie the later sheet wins,
 * and `apps/slide/src/style.css` imports `text.css` and then `slides.css`. Written down instead,
 * this check would go on passing the day somebody swapped the two lines.
 */
function sheetsOf(app: string): Array<{ path: string; label: string }> {
  const entry = readFileSync(join(repo, 'apps', app, 'src', 'style.css'), 'utf8');
  const out: Array<{ path: string; label: string }> = [];
  for (const m of stripComments(entry).matchAll(PACKAGE_SHEET)) {
    out.push({ path: join(repo, 'packages', m[1], 'src', m[2]), label: `${m[1]}/${m[2]}` });
  }
  return out;
}

function rulesOf(app: string): Rule[] {
  const sink: Rule[] = [];
  for (const sheet of sheetsOf(app)) {
    parseInto(stripComments(readFileSync(sheet.path, 'utf8')), sheet.label, null, sink);
  }
  return sink;
}

/** The shared sheet, and the deck's — by the label `sheetsOf` gives them. */
const SHARED = 'office-text/text.css';
const DECK = 'office-slides/slides.css';

const WORD = rulesOf('word');
const SLIDE = rulesOf('slide');

/** Every rule with an opinion about a list marker — the rules this check has to model exactly. */
const aboutMarkers = (rules: Rule[]) =>
  rules.filter((r) => /w-list|sl-list|data-marker/.test(r.selector));

/** A list item on a deck: the deck's list carries **both** classes, which is why both sheets see it. */
const deckItem = (marker: string): El => {
  const list: El = {
    tag: 'div',
    classes: ['w-list', 'sl-list'],
    attrs: { 'data-list-type': 'ordered' }
  };
  return { tag: 'div', classes: ['w-list-item'], attrs: { 'data-marker': marker }, parent: list };
};

/** And on a page of a document, where `text.css` is the only sheet that says anything. */
const wordItem = (marker: string): El => {
  const list: El = { tag: 'div', classes: ['w-list'], attrs: { 'data-list-type': 'ordered' } };
  return { tag: 'div', classes: ['w-list-item'], attrs: { 'data-marker': marker }, parent: list };
};

describe('a resolved marker is what is drawn', () => {
  /**
   * The ground under everything below: both graphs were read, and every rule that has an opinion
   * about a marker is one this check models completely.
   */
  it('read both stylesheets, and models every rule that speaks about a marker', () => {
    expect(sheetsOf('slide').map((s) => s.label)).toEqual([
      'office-ui/tokens.css',
      SHARED,
      DECK,
      'office-slides/ui.css'
    ]);
    expect(sheetsOf('word').map((s) => s.label)).toContain(SHARED);

    const cannot: string[] = [];
    for (const rule of [...aboutMarkers(WORD), ...aboutMarkers(SLIDE)]) {
      // A marker rule inside a media block, or carrying `!important`, would make the arithmetic
      // above the wrong arithmetic — so it is a finding rather than something quietly ignored.
      if (rule.media) cannot.push(`${rule.file}: @media ${rule.media} { ${rule.selector} }`);
      for (const value of rule.decls.values()) {
        if (/!\s*important/.test(value)) cannot.push(`${rule.file}: ${rule.selector} — !important`);
      }
      for (const link of chain(rule.selector)) {
        for (const part of unmodelled(link.compound)) {
          cannot.push(`${rule.file}: ${rule.selector} — '${part}'`);
        }
      }
    }
    expect([...new Set(cannot)]).toEqual([]);
    expect(aboutMarkers(SLIDE).length, 'both sheets brought marker rules').toBeGreaterThan(12);
  });

  /**
   * **The fault, at the size a reader sees it.**
   *
   * Three items whose numbering resolved to `0.`, `3.` and `1.` — a definition that starts at zero
   * and one that restarts, both of which Word can express and a running count cannot. Drawn through
   * the deck's sheets, all three came out of the *same* declaration, which is the tell: one rule
   * replacing three different answers with the position of the item in the list.
   */
  it('a deck draws the number the resolver worked out, not a count of the items', () => {
    const drawn = ['0. ', '3. ', '1. '].map((marker) => {
      const won = winner(SLIDE, deckItem(marker), '::before', 'content');
      return { marker, value: won?.value, from: won?.rule.file, by: won?.rule.selector };
    });

    for (const one of drawn) {
      expect(one.value, `marker '${one.marker}' — ${one.by} (${one.from})`).toBe(
        'attr(data-marker)'
      );
      expect(one.from, `marker '${one.marker}' is the resolver's, so the shared sheet answers`).toBe(
        SHARED
      );
    }
  });

  /**
   * The same question on a document, which is where it was already right — and stays right. A rule
   * added for the deck that started drawing a counter here would take a Word list's numbering away.
   */
  it('a document draws it too, and draws no counter of its own', () => {
    const won = winner(WORD, wordItem('3. '), '::before', 'content');
    expect(won?.value).toBe('attr(data-marker)');
    expect(won?.rule.file).toBe(SHARED);

    for (const prop of ['counter-increment', 'counter-reset']) {
      const counted = winner(WORD, wordItem('3. '), null, prop);
      expect(counted?.value ?? 'none', `${prop} on an item whose marker is resolved`).toBe('none');
    }
  });

  /**
   * **And the other side of the narrowing is unchanged** — the previous round measured it by hand
   * and found `text.css` winning every declaration for an empty marker. That is what makes the
   * deck's copy already dead there, and it is the half a repair on the resolved side could break by
   * raising specificity past the point it needed.
   */
  it('an empty marker still falls back to the shared sheet, on a deck as well', () => {
    const el = deckItem('');
    const lost: string[] = [];
    for (const prop of ['content', 'display', 'gap', 'align-items', 'min-width', 'text-align']) {
      for (const pseudo of [null, '::before'] as const) {
        const won = winner(SLIDE, el, pseudo, prop);
        if (won && won.rule.file !== SHARED) {
          lost.push(`${prop}${pseudo ?? ''} — ${won.rule.selector} (${won.rule.file})`);
        }
      }
    }
    expect(lost).toEqual([]);
    expect(winner(SLIDE, el, '::before', 'content')?.value).toBe("counter(w-item) '.'");
  });

  /**
   * **What is left of the deck's copy, stated rather than left to be discovered.**
   *
   * The repair takes the *content* of a resolved marker — what the reader reads — and deliberately
   * does not take its layout. A resolved marker brings its own separator (`listMarker` appends the
   * definition's `suffix`, and `white-space: pre` keeps it), so a `gap` here would be a second space
   * beside one the document asked for; and a `min-width` column would outvote the indent Word's
   * `ilvl` sets, which is the one thing `text.css`'s header says a rule in it must never do.
   *
   * So six declarations still come from the deck's copy for a resolved item, and every one of them
   * is layout. Listing them by name is the point: this is the half of the mirror fault that stays
   * open, it stays open **in `office-slides/slides.css`**, and the day somebody deletes
   * `slides.css:16–63` this line goes red and says exactly what a deck lost — which is the question
   * you would otherwise have to open a browser to answer.
   */
  it('names exactly what the deck still decides for a resolved marker', () => {
    const el = deckItem('3. ');
    const theirs: string[] = [];
    for (const prop of [
      'content',
      'display',
      'gap',
      'align-items',
      'flex',
      'min-width',
      'text-align'
    ]) {
      for (const pseudo of [null, '::before'] as const) {
        const won = winner(SLIDE, el, pseudo, prop);
        if (won && won.rule.file !== SHARED) {
          theirs.push(`${prop}${pseudo ?? ''} = ${won.value}`);
        }
      }
    }
    expect(theirs.sort()).toEqual([
      'align-items = baseline',
      'display = flex',
      'flex::before = none',
      'gap = 0.5em',
      'min-width::before = 1.4em',
      'text-align::before = right'
    ]);

    // And not one of them is the marker itself — that is the half this round closed.
    expect(theirs.some((one) => one.startsWith('content'))).toBe(false);
  });
});
