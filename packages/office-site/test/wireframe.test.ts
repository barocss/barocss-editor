import { describe, it, expect } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { pagesOf } from '../src/selection';
import { BREAKPOINTS } from '../src/breakpoints';
import {
  WIREFRAME_CSS,
  WIREFRAME_NAMES,
  WIREFRAME_PALETTE,
  shownOnlyAt,
  wireframeCss,
  wireframeName,
  wireframeRules
} from '../src/wireframe';

/**
 * **와이어프레임 보기** — the same page with the finish taken off.
 *
 * Asked as a choice between two things and it is neither: a filter cannot say *what a thing is*, and
 * a separate editor is a second document to keep in step — which is the work that makes a plan and a
 * design drift apart. So it is a third **view**, generated from the document the way `editorStateCss`
 * and `revealRules` already are.
 *
 * What is worth checking here is not how it looks. It is the two claims underneath: that the sheet
 * **cannot escape the boards that asked for it**, and that the names come from the *model* rather
 * than from an attribute the renderer would have to start writing.
 */
describe('a page with the finish taken off', () => {
  const schema = createSchema('site', getSiteSchemaDefinition());
  const store = new DataStore(undefined as never, schema as never);
  const editor: any = createSiteEditor({ editable: true, schema, dataStore: store } as never);
  editor.loadDocument(createSampleSite(), 'site');
  const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
  const pages = pagesOf(doc as never);

  it('says what a box is, in the reader’s words', () => {
    expect(wireframeName({ stype: 'form' })).toBe('폼');
    expect(wireframeName({ stype: 'collection' })).toBe('데이터 목록');
    expect(wireframeName({ stype: 'bTable' })).toBe('표');
    expect(wireframeName({ stype: 'codeBlock' })).toBe('코드');
  });

  it('reads an embed’s provider rather than guessing', () => {
    // 넣은 것 says nothing: a map is looked at and a video is played, and the document knows which.
    expect(wireframeName({ stype: 'mediaEmbed', attributes: { provider: 'youtube' } })).toBe('영상');
    expect(wireframeName({ stype: 'mediaEmbed', attributes: { provider: 'map' } })).toBe('지도');
  });

  it('names nothing a reader can already see', () => {
    /*
     * The list is for boxes that are unreadable once they are grey. A heading is still a heading with
     * its colour taken away, and a label on it is a word competing with the words it names.
     *
     * `instance` is in here because it was in the *other* list first and came straight back out on the
     * first look at a real page: a placement is the most common block on the sample — the nav bar,
     * both buttons in the hero, every card — so labelling it put 컴포넌트 on a dozen things at once,
     * including over the words on a button.
     */
    expect(wireframeName({ stype: 'instance' })).toBeUndefined();
    expect(wireframeName({ stype: 'heading' })).toBeUndefined();
    expect(wireframeName({ stype: 'frame' })).toBeUndefined();
    expect(wireframeName(undefined)).toBeUndefined();
  });

  it('cannot reach a board that did not ask for it', () => {
    /*
     * The claim that matters most, because the sheet is `!important` throughout — which it has to be,
     * since the boards are drawn with inline styles by design and nothing else beats one. A rule that
     * escaped its scope would repaint the editor's own chrome in grey and there would be no way to
     * turn it off.
     */
    // Comments first, or every rule that has one above it reads as a selector called `/*`.
    const naked = WIREFRAME_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const selectors = naked
      .split('{')
      .slice(0, -1)
      .map((one) => one.split('}').pop()!.trim())
      .filter((one) => one.length > 0);
    expect(selectors.length).toBeGreaterThan(6);
    for (const one of selectors) {
      /*
       * Split on the commas that separate **selectors**, not the ones inside `:is(…)`.
       * `:is(p, h1, h2)` is one selector with commas in it, and a plain `split(',')` reads it as
       * three — of which two do not start with the scope and the check failed on a rule that was
       * correct. Depth, because that is the whole difference.
       */
      const parts: string[] = [];
      let depth = 0;
      let held = '';
      for (const ch of one) {
        if (ch === '(') depth += 1;
        if (ch === ')') depth -= 1;
        if (ch === ',' && depth === 0) {
          parts.push(held);
          held = '';
          continue;
        }
        held += ch;
      }
      parts.push(held);
      for (const each of parts) {
        expect(each.trim(), each).toMatch(/^\[data-wireframe='true'\]/);
      }
    }
  });

  it('washes a photograph rather than emptying it, so its box is the box', () => {
    /*
     * The claim a browser had to settle, and it settled it the other way round from how this file
     * was first written. `content: url(<a 1×1 svg>)` empties a replaced element beautifully — hatch,
     * label, the lot — and it **moves it**: the check that compared picture boxes before and after
     * found 266×199 become 225×225 and four 61×20 logos become 2×2, because replacing the content
     * replaces the intrinsic size every `width: auto` image is laid out from.
     *
     * A wireframe whose boxes are the wrong size is worse than one with no captions on its
     * photographs — it is a layout the reader does not have. So the media is washed: `contrast(0)`
     * makes one flat grey, and nothing a layout can see is touched at all.
     */
    for (const tag of ['img', 'video', 'iframe']) {
      expect(WIREFRAME_CSS, tag).toMatch(new RegExp(`\\b${tag} \\{[^}]*filter: grayscale\\(1\\) contrast\\(0\\)`));
    }
    expect(WIREFRAME_CSS).not.toMatch(/content: url/);
    // And nothing anywhere collapses a box or takes it out of the flow, which is the same claim.
    expect(WIREFRAME_CSS).not.toMatch(/display:\s*none/);
    expect(WIREFRAME_CSS).not.toMatch(/\bwidth:|\bheight:|\bmargin:|\bpadding:/);
  });

  it('names the boxes on the page it was asked about, and no others', () => {
    const home = pages[0].sid;
    const rules = wireframeRules(store as never, home);
    /*
     * The sample has a data list on the home page, a video on 제품, a table on 가격, a form on 소개 and
     * a code block on 블로그 — one of each, deliberately, which is what makes this readable as a claim
     * rather than as a count.
     */
    expect(rules).toContain("content: '데이터 목록'");
    expect(rules).not.toContain("content: '표'");
    expect(wireframeRules(store as never, pages[2].sid)).toContain("content: '표'");
    expect(wireframeRules(store as never, pages[3].sid)).toContain("content: '폼'");
  });

  it('positions the box it names, or the label lands on the page’s corner', () => {
    // A label is absolutely placed, so a box left `static` hands it to whatever ancestor happens to
    // be positioned — which is how a name ends up in the corner of the page instead of on the thing.
    const rules = wireframeRules(store as never, pages[3].sid);
    expect(rules).toMatch(/position: relative !important/);
    // Top **right**: content starts at the top left of almost every box, so a label there sits on the
    // first line of a form and the first cell of a table.
    expect(rules).toMatch(/::before \{ content: '폼'; position: absolute; right: 0; top: 0/);
  });

  it('numbers the page’s own sections, and nothing inside them', () => {
    /**
     * **읽는 순서**, which is half the reason anybody shows a wireframe to somebody else — and which
     * the drawing could not say, so the answer was *look at it and count*.
     *
     * The page's **direct children** only. A number on every box is a wireframe with a hundred
     * numbers on it, and the sections are what a reader is being asked the order of.
     */
    const numbers = [...wireframeRules(store as never, pages[0].sid).matchAll(/::after \{ content: '(\d+)'/g)].map(
      (one) => one[1]
    );
    const kids = (store.getNode(pages[0].sid) as any).content.length;
    expect(numbers).toEqual([...Array(kids)].map((_, index) => String(index + 1)));

    /* And it moves nothing: the badge is absolutely placed, outside the box, on a relative parent. */
    expect(wireframeRules(store as never, pages[0].sid)).toContain('left: -26px');
  });

  it('says which widths a block is on, when it is not on all of them', () => {
    /**
     * A section that drops out on the tablet drew exactly like a section that does not exist, and
     * the only way to find out was to put two boards side by side and notice an **absence**.
     *
     * Said on the block wherever it *is* drawn, rather than as a ghost where it is not: a hidden
     * block has no box, so drawing one would add a box — the reviewer would be reading a page taller
     * than the page. The sample carries the ordinary shape of this, a bar and a hamburger.
     */
    expect(shownOnlyAt({ visible: false, overrides: { mobile: { visible: true } } })).toBe('모바일만');
    expect(shownOnlyAt({ overrides: { mobile: { visible: false } } })).toBe('데스크톱·태블릿만');

    /* Silence for a block on every width, which is nearly every block — and for a draft. */
    expect(shownOnlyAt({})).toBeUndefined();
    expect(shownOnlyAt(undefined)).toBeUndefined();
    expect(shownOnlyAt({ visible: false })).toBeUndefined();

    /* The document's own widths, not three constants: a reader who adds one changes every answer. */
    const four = [...BREAKPOINTS, { id: 'wide', label: '와이드', width: 1600, viewport: 900 }];
    expect(shownOnlyAt({ overrides: { mobile: { visible: false } } }, four)).toBe('데스크톱·태블릿·와이드만');
  });

  it('says both facts in one label, because an element has two corners and one is spoken for', () => {
    // The reading order owns `::after`, so what a box **is** and where it is live in the same
    // `::before` — which is also how a person would say it: `폼 · 모바일만`.
    const nav = wireframeRules(store as never, pages[0].sid);
    expect(nav).toContain("content: '데스크톱·태블릿만'");
    expect(nav).toContain("content: '모바일만'");
  });

  it('puts the pseudo-element on every selector of a pair, not on the last one', () => {
    /**
     * **The fault only a browser could see, written down as a string.**
     *
     * A part of a definition is named by two selectors — `[data-bc-sid$="~part"]` for every placement
     * of it, and the bare sid for the board where the definition is being edited on its own. Written
     * as `a, b::before`, the pseudo-element attaches to **`b` alone**: every drawn placement matched
     * `a` and got a `content` declaration on the element itself, which does nothing at all.
     *
     * The sheet was generated, the rule was in it, the label was invisible, and every check here
     * passed — because they all assert on the string, and the string contained the word. A browser
     * said it. This is that lesson turned back into a string check: in a rule that draws a
     * pseudo-element, **every** selector in the list carries it.
     */
    const rules = wireframeRules(store as never, pages[0].sid);
    const drawing = rules.split('\n').filter((one) => one.includes('::'));
    expect(drawing.length).toBeGreaterThan(0);
    for (const rule of drawing) {
      const selectors = rule.slice(0, rule.indexOf('{')).split(',');
      for (const one of selectors) expect(one.trim(), rule).toMatch(/::(before|after)$/);
    }
  });

  it('is one sheet, and says nothing about a page with nothing to name', () => {
    const empty = wireframeCss(store as never, 'site:없는것');
    expect(empty).toContain(WIREFRAME_CSS);
    expect(empty.trim().endsWith('}')).toBe(true);
  });

  it('holds no name the sample cannot produce', () => {
    /*
     * The other direction, and the one that keeps this list honest: a word in `WIREFRAME_NAMES` for a
     * node type this product does not have is a promise nothing can keep. Asked of the sample, which
     * carries one of everything on purpose.
     */
    const seen = new Set<string>();
    const look = (sid: string, depth: number) => {
      if (depth > 64) return;
      const node = store.getNode(sid) as any;
      if (!node) return;
      seen.add(String(node.stype));
      for (const child of node.content ?? []) if (typeof child === 'string') look(child, depth + 1);
    };
    look(editor.getRootId(), 0);
    expect(Object.keys(WIREFRAME_NAMES).filter((one) => !seen.has(one))).toEqual([]);
  });
});

/**
 * **The palette, held to the numbers that chose it.**
 *
 * Asked as *회색톤이 나은가, 검은 선만 쓰는 게 나은가, 테마처럼 고르게 하는 게 나은가* — and the
 * measurement said the first two were not the choice they looked like. The sheet's four values,
 * against the white page, were 1.14, 1.19, 1.04 (the two greys against **each other**) and 1.68. It
 * was not a grey wireframe; it was a white page with three invisible marks on it, and 25 boxes on
 * the sample carry a fill and no corner and no border, every one of them lost.
 *
 * So this is not a taste check. It is the three claims the palette is now built on, as arithmetic:
 * one ink that reads as text, one line dark enough to *be* the notation, and one grey that means
 * exactly one thing and is visibly a filled box.
 *
 * WCAG's own relative luminance, written here rather than imported: the function that has it lives in
 * `office-slides`, and a page package depending on a deck package to check its own colours would be
 * the wrong layering for eight lines of arithmetic.
 */
describe('the wireframe’s own contrast', () => {
  const luminance = (hex: string) => {
    const channel = (value: number) => {
      const unit = value / 255;
      return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
    };
    const [r, g, b] = [1, 3, 5].map((at) => channel(parseInt(hex.slice(at, at + 2), 16)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [one, two] = [luminance(a), luminance(b)];
    return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
  };

  const { ink, line, media, page } = WIREFRAME_PALETTE;

  it('draws the structure with a line that can be seen', () => {
    /*
     * 3:1 is the bar a **non-text** mark has to clear, and the line is the whole notation now: a
     * filled box is drawn as an outlined box rather than as a second grey, so everything the page's
     * structure consists of arrives through this one value. The old line was 1.68:1.
     */
    expect(ratio(line, page)).toBeGreaterThanOrEqual(3);
  });

  it('keeps the words louder than the boxes they sit in', () => {
    // The ink is text and reads as text; the line is a mark and must not compete with it.
    expect(ratio(ink, page)).toBeGreaterThanOrEqual(7);
    expect(ratio(ink, page)).toBeGreaterThan(ratio(line, page));
  });

  it('leaves grey exactly one meaning, and makes it visible', () => {
    /*
     * The fault this replaced: two greys meaning two different things — *a reader put a background
     * here* and *there is a photograph here* — 1.04:1 apart. There is one grey now, so the question
     * is only whether it reads as a filled box, and 1.14:1 did not.
     */
    expect(ratio(media, page)).toBeGreaterThanOrEqual(1.4);
    // And it is a picture, not a control: the line has to stay readable against it.
    expect(ratio(line, media)).toBeGreaterThanOrEqual(1.8);
  });

  it('washes a loaded photograph onto the same grey as an empty one', () => {
    /*
     * A picture with a file is `contrast(0)` plus a `brightness`; one with no file is the flat
     * `MEDIA` behind it. Two shapes for one fact, so they have to land on the same grey — they did
     * not, and the wash was two shades lighter than the fallback.
     *
     * `contrast(0)` puts every channel on 127.5, so the wash is that times the brightness.
     */
    const brightness = Number(/brightness\(([\d.]+)\)/.exec(WIREFRAME_CSS)?.[1]);
    const washed = Math.round(127.5 * brightness);
    const wanted = parseInt(media.slice(1, 3), 16);
    expect(Math.abs(washed - wanted)).toBeLessThanOrEqual(6);
  });

  it('says every colour it draws through the palette, and no other', () => {
    /*
     * The check that keeps the numbers above meaningful: a hex written straight into the sheet is a
     * value none of this measured. White is allowed — it is the ground, and it is in the palette.
     */
    const written = new Set([...WIREFRAME_CSS.matchAll(/#[0-9a-fA-F]{3,8}/g)].map((one) => one[0]));
    const known = new Set<string>(Object.values(WIREFRAME_PALETTE));
    expect([...written].filter((one) => !known.has(one))).toEqual([]);
  });
});
