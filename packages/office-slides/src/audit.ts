import { childrenOf, deckSlides, spaceOriginOf, type DeckAccess, type DeckNode } from './deck';
import { boxOf, slideSize, type Box } from './geometry';
import { intersects } from './manipulate';
import { jumpFaults } from './jump';
import { isContainerType } from './selection';
import { backgroundOf, resolveDeckFormat } from './layout-format';
import { paintsOf } from './paints';
import { instanceParts } from '@barocss/office-word';

/**
 * A look over the deck before it is given to anybody.
 *
 * ## Why it is needed at all
 *
 * A deck's problems are invisible while it is being made. Alt text does not appear
 * on screen. A shape five pixels off the slide is not clipped in the editor —
 * a canvas draws outside itself — and is clipped by the projector. Whether 11pt
 * reads from the back of a room is a thing you find out in the room. Nobody goes
 * through twenty slides again by eye to look for these, so nobody finds them.
 *
 * ## The model only, and what that costs
 *
 * No DOM. Which is what lets this sweep every slide at once — including the ones not
 * on screen, and the hidden ones — and what keeps an answer from depending on the
 * zoom, the window, or whether a font has finished loading.
 *
 * The cost is written down rather than worked around. **Text overflowing its box is
 * not measured**: that is the font's answer and there is no font here. Nor is the
 * contrast of text over a *photograph* — the brightness of the photo at that spot is
 * not in the model. Both are reported as things to look at instead of things to fix,
 * which is honest about the difference between the two.
 *
 * ## Two levels, and no more
 *
 * `must` for what is certainly wrong, `check` for what a person has to look at.
 * Three or more grades and a reader spends the time on the grades — and then only
 * looks at the red ones, which is the same as having one grade with more steps.
 * So `must` is reserved for what is knowable without judgement.
 */

export type AuditKind =
  | 'alt'
  | 'small'
  | 'outside'
  | 'empty-slide'
  | 'photo-text'
  | 'contrast'
  /** A button pointing at a page the deck no longer has. */
  | 'dead-jump'
  /** A page nothing can reach, in a deck that has buttons. */
  | 'unreachable'
  /** A button into another deck, which this document cannot check. */
  | 'away';

export interface AuditHit {
  kind: AuditKind;
  /** `must` is certainly wrong; `check` needs a person to look. */
  level: 'must' | 'check';
  slideSid: string;
  /** The shape it is about, absent when it is about the whole slide. */
  sid?: string;
  /** One line a reader can act on. */
  what: string;
  /** How to fix it. */
  hint: string;
}

/**
 * How small is too small, as a fraction of the slide's **height**.
 *
 * Not a number of points, because a slide's size is the deck's choice: the same
 * 14pt is small on a 16:9 slide and enormous on a square one made for a phone.
 *
 * Two thresholds, and the reason is what happens with one. Reading a deck's own
 * defaults against a single 3% line: a 12pt footnote is 2.2% and a 24pt body is
 * 4.4%, so every label and caption in the deck lands on the wrong side of it. Mark
 * them all "must fix" and a reader stops believing the list — **if everything is
 * red, nothing is red.** So only what is certainly unreadable is a `must`, and the
 * band above it is a `check`.
 */
const SMALL_TEXT = 0.03;
const TINY_TEXT = 0.021;

/**
 * How far off the slide is worth mentioning, in twips.
 *
 * Two CSS pixels. A shape one twip past the edge is a rounding artefact of a drag,
 * and a list that reports those is a list nobody finishes reading.
 */
const EDGE_SLACK = 30;

/**
 * Where the line is for readable text, from WCAG: 4.5:1 for ordinary text and 3:1
 * for large. Both are the *ratio* of the two colours' relative luminance.
 */
const RATIO_SMALL = 4.5;
const RATIO_BIG = 3;

/**
 * What counts as large, in half-points.
 *
 * WCAG allows the lower ratio for large text because a thick letterform survives
 * less contrast. 18pt is the standard's own line for ordinary weight; bold is
 * allowed from 14pt, and this does not read weight yet, so the one number is used.
 */
const BIG_TEXT = 36;

/** The node types that hold a picture and therefore need describing. */
const NEEDS_ALT = new Set(['picture', 'mediaVideo']);

/** Whether the node is a thing placed on the canvas rather than text inside one. */
const PLACED = new Set([
  'rectangle',
  'ellipse',
  'line',
  'path',
  'picture',
  'textFrame',
  'sticky',
  'frame',
  'group',
  'mediaVideo',
  'mediaAudio',
  'connector',
  /**
   * A **placement** of a component, which is a thing placed on the canvas in the plainest
   * sense of the word — and was missing, so the sweep did not even reach it, let alone its
   * parts. A card off the edge of a slide is as clipped by the projector as any other box.
   */
  'instance'
]);

const attrString = (node: DeckNode | undefined, key: string): string | undefined => {
  const value = node?.attributes?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

/** Everything the sweep finds, slide by slide and shape by shape within them. */
export function auditDeck(doc: DeckAccess): AuditHit[] {
  const hits: AuditHit[] = [];

  for (const slide of deckSlides(doc)) {
    const surface = doc.getNode(slide.sid);
    const size = slideSize(surface?.attributes);
    const shapes = shapesOn(doc, slide.sid);

    if (shapes.length === 0) {
      hits.push({
        kind: 'empty-slide',
        /**
         * A look, not a fix. A blank slide is a real thing to want — a pause, a
         * section break, somewhere to talk over — so calling it wrong would be this
         * list telling a reader off for something they did on purpose.
         */
        level: 'check',
        slideSid: slide.sid,
        what: '빈 슬라이드입니다.',
        hint: '일부러 비운 것이면 그대로 두세요. 아니면 내용을 넣거나 슬라이드를 지우세요.'
      });
    }

    /**
     * The pictures on this slide, for the "text over a photograph" look — in the **slide's**
     * coordinates, because a picture inside a frame and a text box outside it are compared.
     */
    const pictures = shapes
      .filter((shape) => shape.node.stype === 'picture')
      .map((shape) => ({ sid: shape.sid, box: shape.box }));

    for (const shape of shapes) {
      const { sid, node, box } = shape;
      /**
       * Whether this box is a **card's part**, which changes the advice and not the fault.
       *
       * A named part belongs to a definition, so the fix is in the card and it fixes every
       * placement at once — worth saying, because the reader is otherwise about to fix the same
       * thing on twenty slides. The fault is still reported once per placement: three slides
       * with unreadable text are three slides a projector will show.
       */
      const fromCard = typeof node.attributes?.partId === 'string';
      const also = (hint: string) =>
        fromCard ? `${hint} 컴포넌트의 부품이라 정의에서 고치면 놓인 곳 모두 고쳐집니다.` : hint;

      if (NEEDS_ALT.has(node.stype ?? '') && !attrString(node, 'alt')) {
        hits.push({
          kind: 'alt',
          // Certainly wrong: a picture with nothing to say about it is a picture a
          // screen reader announces as nothing at all.
          level: 'must',
          slideSid: slide.sid,
          sid,
          what: '그림에 대체 텍스트가 없습니다.',
          hint: also('무엇이 담겨 있는지 한 줄로 적으세요. 장식이라면 빈 값 대신 그렇게 적어 두세요.')
        });
      }

      if (outsideBy(box, size) > EDGE_SLACK) {
        hits.push({
          kind: 'outside',
          /**
           * Certainly wrong, and invisible while editing: a canvas draws outside
           * itself, so the shape is whole on screen and cut on the projector.
           */
          level: 'must',
          slideSid: slide.sid,
          sid,
          what: '도형이 슬라이드 밖으로 나가 있습니다.',
          hint: also('슬라이드 안으로 옮기세요. 일부러 걸친 것이면 잘려 보인다는 것만 알아 두세요.')
        });
      }

      /*
       * The text checks ask about the box that *holds* the text, and a container holds none of
       * its own: `textRuns` walks a subtree, so a group would report its child's small text
       * with the group's sid — a row that selects the group and leaves the reader looking for
       * the words. Which is what it did before this walk went inside anything.
       */
      if (isContainerType(node.stype)) continue;

      const small = smallestText(doc, sid, size.height);
      if (small) {
        hits.push({
          kind: 'small',
          level: small.level,
          slideSid: slide.sid,
          sid,
          what: `글자가 작습니다 — ${small.points}pt.`,
          hint: also('강의실 뒤에서도 읽히려면 슬라이드 높이의 3% 이상이 안전합니다.')
        });
      }

      /**
       * Text against a colour we can be sure of.
       *
       * Only when **both** colours are known: the text's own and whatever is
       * directly behind it, which is the shape's own fill or — for a text frame with
       * no fill — the slide's background. Anything else is a guess, and a guess in a
       * list like this is worse than a gap: see `photo-text` below for what is done
       * instead when the answer is genuinely not in the model.
       */
      if (node.stype === 'textFrame') {
        const poor = poorContrast(doc, sid, slide.sid, node);
        if (poor) {
          hits.push({
            kind: 'contrast',
            // Certainly wrong: this is arithmetic on two known colours, not taste.
            level: 'must',
            slideSid: slide.sid,
            sid,
            what: `글자와 배경의 대비가 ${poor.ratio.toFixed(1)}:1 입니다 — ${poor.needs}:1 이 필요합니다.`,
            hint: also('글자를 더 진하게 하거나 배경을 더 밝게 하세요. 글자를 키우면 기준이 3:1 로 내려갑니다.')
          });
        }
      }

      /**
       * Text over a photograph — a look, never a fix.
       *
       * Whether it reads depends on how bright the photo is *at that spot*, and the
       * photo's pixels are not in the model. So this says where to look and stops
       * there, which is the difference between this list and a list that guesses.
       */
      if (node.stype === 'textFrame') {
        const over = pictures.find((picture) => intersects(box, picture.box));
        if (over || hasImageFill(node)) {
          hits.push({
            kind: 'photo-text',
            level: 'check',
            slideSid: slide.sid,
            sid,
            what: '사진 위에 글자가 있습니다.',
            hint: also('사진의 밝은 부분에서도 읽히는지 보세요. 글자 뒤에 반투명 판을 깔면 확실합니다.')
          });
        }
      }
    }
  }

  /**
   * And what is wrong with the deck's **links**.
   *
   * Both faults are invisible while the deck is being made and certain to be found by an
   * audience, which is the shape of thing this list is for: a button that does nothing when it is
   * pressed on stage, and a section nobody can get to. The arithmetic is `jumpFaults`, because
   * "which pages can be reached" is a question about the whole deck rather than about one page.
   */
  for (const fault of jumpFaults(doc)) {
    if (fault.kind === 'away') {
      hits.push({
        kind: 'away',
        /**
         * A look, and it cannot be anything else.
         *
         * Another document is not in this one, so whether that page is still there is a question
         * this check cannot answer — and answering it anyway is exactly what a check must not do.
         * What it can say is *there is a link out of this deck*, which is worth a reader's eye
         * before they present: the deck it points at has to exist wherever they are showing from.
         */
        level: 'check',
        slideSid: fault.slideSid,
        sid: fault.sid,
        what: '다른 덱으로 가는 버튼입니다.',
        hint: `발표하는 곳에서 그 덱을 열 수 있는지 확인하세요 — ${fault.to ?? ''}`
      });
      continue;
    }
    if (fault.kind === 'dead-jump') {
      hits.push({
        kind: 'dead-jump',
        // Certainly wrong: a press that does nothing in front of a room is not a matter of taste.
        level: 'must',
        slideSid: fault.slideSid,
        sid: fault.sid,
        what: '누르면 이동할 장이 없습니다.',
        hint: '다른 장을 고르거나, 이 도형이 버튼이 아니게 하세요. 가리키던 장은 지워진 것 같습니다.'
      });
      continue;
    }
    hits.push({
      kind: 'unreachable',
      /**
       * A look rather than a fix.
       *
       * A page reached only by a button somewhere else is ordinary in a deck built as a menu, and
       * a page kept for the questions afterwards is a real thing to want. What this says is
       * *nothing in the deck leads here* — which they may have meant.
       */
      level: 'check',
      slideSid: fault.slideSid,
      what: '이 장으로 오는 길이 없습니다.',
      hint: '어딘가에 이 장으로 가는 버튼을 두거나, 일부러 남겨 둔 것이면 그대로 두세요.'
    });
  }

  return hits;
}

/**
 * Every shape on a slide, however deep, with its box in the **slide's** coordinates.
 *
 * A child's `x` is its container's, so a rectangle 1000 twips inside a group at 18000 is at
 * 19000 on the slide — and comparing the raw number against the slide's width would call every
 * nested shape safely inside whatever its container was doing. `spaceOriginOf` is the one
 * implementation of that rule (canvas-model §5), so this asks it rather than accumulating a
 * second answer.
 */
function shapesOn(
  doc: DeckAccess,
  slideSid: string
): Array<{ sid: string; node: DeckNode; box: Box }> {
  const found: Array<{ sid: string; node: DeckNode; box: Box }> = [];

  const walk = (sid: string, depth: number) => {
    if (depth > 16) return;
    const node = doc.getNode(sid);
    if (!node) return;
    // A `componentValue` is not a box: it is what a card was *asked for*, with no size, no
    // place and nothing to describe.
    if (!PLACED.has(node.stype ?? '')) return;

    const origin = spaceOriginOf(doc, sid);
    const own = boxOf(node.attributes as never);
    found.push({
      sid,
      node,
      box: { ...own, x: own.x + origin.x, y: own.y + origin.y }
    });

    /**
     * A **placement**'s parts are not in the document, so they are resolved rather than walked.
     *
     * Without this the sweep went blind the day placements became references: a card's picture
     * with no alt text, its 8pt caption, its unreadable contrast were all inside a definition the
     * slide only *names*, so a deck of twenty cards audited as twenty empty boxes. The parts are
     * asked for the same way the view asks for them (`instanceParts`), which is what keeps the two
     * answers from drifting.
     */
    if (node.stype === 'instance') {
      for (const part of instanceParts(doc, node)) {
        drawn(part, { x: own.x + origin.x, y: own.y + origin.y }, depth + 1, sid);
      }
      return;
    }

    if (!isContainerType(node.stype)) return;
    for (const child of childrenOf(node)) walk(child, depth + 1);
  };

  /**
   * The same walk over nodes that are **drawn** rather than stored.
   *
   * Two things differ, and both are about identity. A resolved part has a synthetic sid (`card~…`)
   * that no command can act on, so the fault is reported against the **placement** — which is
   * what a reader can select, move and detach. And a part's box cannot be asked of
   * `spaceOriginOf`, because that walks parents in the document, so the origin is carried down.
   *
   * The reader's own things inside a slot keep their real sid, and a fault in one of those is
   * reported against *it*: it is their box, and they can go and fix it.
   */
  const drawn = (node: DeckNode, at: { x: number; y: number }, depth: number, actOn: string) => {
    if (depth > 16) return;
    if (!PLACED.has(node.stype ?? '')) return;

    const own = boxOf(node.attributes as never);
    const mine = typeof node.sid === 'string' && !node.sid.includes('~') ? node.sid : actOn;
    found.push({ sid: mine, node, box: { ...own, x: own.x + at.x, y: own.y + at.y } });

    if (!isContainerType(node.stype)) return;
    for (const child of ((node as { content?: unknown }).content ?? []) as DeckNode[]) {
      if (!child || typeof child !== 'object') continue;
      drawn(child, { x: own.x + at.x, y: own.y + at.y }, depth + 1, actOn);
    }
  };

  for (const child of childrenOf(doc.getNode(slideSid))) walk(child, 0);
  return found;
}

/** How far outside the slide the box reaches, in twips — 0 when it is inside. */
function outsideBy(box: Box, size: { width: number; height: number }): number {
  return Math.max(
    0,
    -box.x,
    -box.y,
    box.x + box.width - size.width,
    box.y + box.height - size.height
  );
}

/** Whether any of the shape's fills is a picture. */
function hasImageFill(node: DeckNode): boolean {
  return paintsOf(node.attributes as never).some(
    (paint) => paint.kind === 'image' && paint.visible !== false
  );
}

/**
 * Every run of text in the shape, with the size and colour it is drawn at.
 *
 * One walk, read by two checks — the size and the contrast are both about the text
 * in a box, and walking it twice is two chances to disagree about which runs count.
 *
 * The **effective** formatting, through the layout: a title that sets nothing of its
 * own is 54pt because its layout says so, and reading only what the run carries
 * would report every well-designed slide as unreadable. `resolveDeckFormat` is the
 * same resolver the toolbar reads, so this and the panel cannot disagree.
 */
function colourMarks(node: DeckNode): string[] {
  const marks = (node as { marks?: unknown }).marks;
  if (!Array.isArray(marks)) return [];

  return marks
    .filter((mark) => (mark as { stype?: unknown })?.stype === 'fontColor')
    .map((mark) => (mark as { attrs?: { color?: unknown } })?.attrs?.color)
    .filter((colour): colour is string => typeof colour === 'string' && colour.length > 0);
}

function textRuns(
  doc: DeckAccess,
  sid: string
): { half?: number; colour?: string }[] {
  const runs: { half?: number; colour?: string }[] = [];

  const walk = (at: string, depth: number) => {
    if (depth > 24) return;
    const node = doc.getNode(at);
    if (!node) return;

    if (typeof (node as { text?: unknown }).text === 'string') {
      const format = resolveDeckFormat(doc, at, 'character');
      const half = typeof format.fontSize === 'number' && format.fontSize > 0 ? format.fontSize : undefined;

      /**
       * The colour comes from the run's **marks**, not from its attributes.
       *
       * A size is character formatting and travels down the layout; a colour is a
       * mark over a range, because half a word can be red. So the resolver answers
       * about the size and says nothing about the colour — measured, which is how
       * this was found: reading `fontColor` off the resolved format returned
       * `undefined` for every run in the deck and the contrast check never fired.
       *
       * A run with **no** colour mark is skipped rather than guessed at. What such
       * text is drawn in comes from the theme and the renderer's own default, and a
       * `must` about a colour nothing in the document states would be this list
       * inventing a fault.
       */
      for (const colour of colourMarks(node)) runs.push({ half, colour });
      if (colourMarks(node).length === 0) runs.push({ half });
    }
    for (const child of childrenOf(node)) walk(child, depth + 1);
  };
  walk(sid, 0);

  return runs;
}

/**
 * The smallest text in the shape, if it is small enough to mention.
 *
 * Half-points, which is what the document stores: 20 twips to the point, so ten
 * twips to the half-point.
 */
function smallestText(
  doc: DeckAccess,
  sid: string,
  slideHeight: number
): { level: 'must' | 'check'; points: number } | undefined {
  const sizes = textRuns(doc, sid)
    .map((run) => run.half)
    .filter((half): half is number => half !== undefined);
  if (sizes.length === 0 || slideHeight <= 0) return undefined;

  const smallest = Math.min(...sizes);
  const share = (smallest * 10) / slideHeight;
  if (share >= SMALL_TEXT) return undefined;
  return {
    level: share < TINY_TEXT ? 'must' : 'check',
    points: Math.round(smallest / 2)
  };
}

/**
 * The hits on one slide, for a filmstrip badge or a panel showing one slide.
 *
 * Here rather than at the call site because "how many things are wrong with this
 * slide" is asked in two places, and two filters is two chances to count `check`
 * and `must` differently.
 */
export function auditOf(hits: AuditHit[], slideSid: string): AuditHit[] {
  return hits.filter((hit) => hit.slideSid === slideSid);
}

/** How many of each level, which is what a reader is told before they open it. */
export function auditCount(hits: AuditHit[]): { must: number; check: number } {
  return {
    must: hits.filter((hit) => hit.level === 'must').length,
    check: hits.filter((hit) => hit.level === 'check').length
  };
}

/**
 * Two colours' contrast, or nothing when either cannot be read.
 *
 * ## Nothing, rather than a guess
 *
 * A document's colour may be `#abc`, `#aabbcc`, an `rgb()`, a named colour, or a
 * `color-mix()` — `paints.ts` deals with all of them by handing the unknown ones to
 * CSS. This cannot: a ratio needs numbers. So it reads the two hex notations and
 * answers `undefined` for everything else, and the audit reports nothing.
 *
 * Which is the rule the whole file is built on: a `must` is arithmetic on things we
 * know. A list that guessed at `color-mix(in srgb, …)` would be a list whose red
 * marks a reader learns to ignore.
 *
 * ## The arithmetic is WCAG's own
 *
 * Relative luminance with the sRGB transfer function, and `(lighter + 0.05) /
 * (darker + 0.05)`. The 0.05 is the standard's allowance for screen glare, and it is
 * why pure black on pure white is 21 and not infinity.
 */
export function contrastOf(a: string, b: string): number | undefined {
  const one = luminanceOf(a);
  const two = luminanceOf(b);
  if (one === undefined || two === undefined) return undefined;

  const lighter = Math.max(one, two);
  const darker = Math.min(one, two);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Relative luminance of a hex colour, or nothing for a notation this cannot read. */
function luminanceOf(colour: string): number | undefined {
  const rgb = hexOf(colour);
  if (!rgb) return undefined;

  // The sRGB transfer function, which is why this is not simply an average: a
  // channel at half its range carries about a fifth of the light.
  const channel = (value: number) => {
    const unit = value / 255;
    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/**
 * `#abc` and `#aabbcc` as numbers. Nothing for anything else — including
 * `#aabbccdd`: a colour with alpha is a colour over *something*, and what it is over
 * is the question this file is asking.
 */
function hexOf(colour: string): { r: number; g: number; b: number } | undefined {
  const text = colour.trim();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(text)) return undefined;

  const body = text.slice(1);
  const pairs =
    body.length === 3 ? [...body].map((digit) => digit + digit) : [body.slice(0, 2), body.slice(2, 4), body.slice(4, 6)];
  const [r, g, b] = pairs.map((pair) => Number.parseInt(pair, 16));
  return { r, g, b };
}

/**
 * Whether this text frame's text is hard to read against what is behind it.
 *
 * "Behind it" is the shape's own fill when it has one, and the slide's background
 * when it does not — the two cases where the answer is in the model. A frame over
 * another *shape* is not asked about: which shape is under it depends on the stack,
 * and the answer would be a guess about the very thing `photo-text` exists to hand
 * back to a person.
 */
function poorContrast(
  doc: DeckAccess,
  sid: string,
  slideSid: string,
  node: DeckNode
): { ratio: number; needs: number } | undefined {
  const fills = paintsOf(node.attributes as never).filter(
    (paint) => paint.visible !== false && (paint.opacity ?? 1) === 1
  );
  /**
   * One opaque solid, or nothing of its own and the slide behind it.
   *
   * A gradient has two colours and a picture has thousands; both are somebody's to
   * look at, which is what `photo-text` is for.
   */
  const behind =
    fills.length === 0
      ? backgroundOf(doc, slideSid)
      : fills.length === 1 && fills[0].kind === 'solid'
        ? fills[0].color
        : undefined;
  if (!behind) return undefined;

  /**
   * The worst run in the box, because one unreadable line is enough.
   *
   * A frame may hold several colours and several sizes, and reporting the average of
   * them would be reporting a line that is not on the slide.
   */
  let worst: { ratio: number; needs: number } | undefined;
  for (const run of textRuns(doc, sid)) {
    if (!run.colour) continue;
    const ratio = contrastOf(run.colour, behind);
    if (ratio === undefined) continue;

    const needs = (run.half ?? 0) >= BIG_TEXT ? RATIO_BIG : RATIO_SMALL;
    if (ratio >= needs) continue;
    if (!worst || ratio < worst.ratio) worst = { ratio, needs };
  }
  return worst;
}
