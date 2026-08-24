import { describe, it, expect } from 'vitest';
import { auditCount, auditDeck, auditOf, contrastOf, type AuditHit } from '../src/audit';
import type { DeckAccess } from '../src/deck';

/**
 * A look over the deck before it is given to anybody.
 *
 * A deck's problems are invisible while it is being made: alt text does not appear
 * on screen, a shape five pixels off the slide is not clipped in the editor (a canvas
 * draws outside itself) and is clipped by the projector, and whether 11pt reads from
 * the back of a room is something you find out in the room.
 *
 * All of it is answered from the model, which is why all of it is tested here — and
 * why the two things the model *cannot* answer are reported as things to look at
 * rather than things to fix.
 */
const deck = (nodes: Record<string, unknown>): DeckAccess =>
  ({ rootId: 'root', getNode: (sid: string) => (nodes as never)[sid] }) as never;

/** A 16:9 slide in twips, which is what `slideSize` answers for a slide saying nothing. */
const SLIDE = { width: 19200, height: 10800 };

const at = (over: Record<string, unknown> = {}) => ({ x: 1000, y: 1000, width: 3000, height: 2000, ...over });

/** A run of text at a size, with the parents the resolver walks up through. */
const words = (sid: string, half: number | undefined, parent: string) => ({
  [`${sid}`]: { sid, stype: 'inline-text', text: '글', parentId: `${sid}-p`, ...(half ? { attributes: { fontSize: half } } : {}) },
  [`${sid}-p`]: { sid: `${sid}-p`, stype: 'paragraph', attributes: {}, content: [sid], parentId: parent }
});

const kinds = (hits: AuditHit[]) => hits.map((hit) => hit.kind);

describe('a picture with nothing said about it', () => {
  const withPicture = (over: Record<string, unknown>) =>
    deck({
      root: { sid: 'root', stype: 'document', attributes: {}, content: ['s'] },
      s: { sid: 's', stype: 'surface', attributes: {}, content: ['p'] },
      p: { sid: 'p', stype: 'picture', attributes: at(over) }
    });

  it('is certainly wrong, because a screen reader announces nothing', () => {
    const hits = auditDeck(withPicture({ src: 'x.png' }));
    expect(kinds(hits)).toContain('alt');
    expect(hits.find((hit) => hit.kind === 'alt')?.level).toBe('must');
    expect(hits.find((hit) => hit.kind === 'alt')?.sid).toBe('p');
  });

  it('is nothing to say when it has alt text', () => {
    expect(kinds(auditDeck(withPicture({ src: 'x.png', alt: '제품 사진' })))).not.toContain('alt');
  });

  it('is not asked of a rectangle', () => {
    // A shape is not a picture: there is nothing in it to describe.
    const shapes = deck({
      root: { sid: 'root', stype: 'document', attributes: {}, content: ['s'] },
      s: { sid: 's', stype: 'surface', attributes: {}, content: ['r'] },
      r: { sid: 'r', stype: 'rectangle', attributes: at() }
    });
    expect(kinds(auditDeck(shapes))).not.toContain('alt');
  });
});

describe('a shape off the slide', () => {
  const withBox = (over: Record<string, unknown>) =>
    deck({
      root: { sid: 'root', stype: 'document', attributes: {}, content: ['s'] },
      s: { sid: 's', stype: 'surface', attributes: {}, content: ['r'] },
      r: { sid: 'r', stype: 'rectangle', attributes: at(over) }
    });

  /**
   * Certainly wrong, and invisible while editing — a canvas draws outside itself,
   * so the shape is whole on screen and cut on the projector.
   */
  it('is certainly wrong past the edge', () => {
    expect(kinds(auditDeck(withBox({ x: SLIDE.width - 500 })))).toContain('outside');
    expect(kinds(auditDeck(withBox({ x: -2000 })))).toContain('outside');
    expect(kinds(auditDeck(withBox({ y: SLIDE.height - 100 })))).toContain('outside');
  });

  it('forgives two pixels, because a drag rounds', () => {
    // A shape one twip past the edge is an artefact of a drag, and a list that
    // reports those is a list nobody finishes reading.
    expect(kinds(auditDeck(withBox({ x: -20 })))).not.toContain('outside');
    expect(kinds(auditDeck(withBox({ x: -40 })))).toContain('outside');
  });

  it('says nothing about a shape that fits', () => {
    expect(kinds(auditDeck(withBox({})))).not.toContain('outside');
  });
});

describe('text that is too small', () => {
  const sized = (half: number | undefined) =>
    deck({
      root: { sid: 'root', stype: 'document', attributes: {}, content: ['s'] },
      s: { sid: 's', stype: 'surface', attributes: {}, content: ['f'] },
      f: { sid: 'f', stype: 'textFrame', attributes: at(), content: ['t-p'], parentId: 's' },
      ...words('t', half, 'f')
    });

  /**
   * Two thresholds, and the reason is what happens with one.
   *
   * A 12pt footnote is 2.2% of a 16:9 slide's height and a 24pt body is 4.4%, so a
   * single 3% line puts every label and caption on the wrong side of it. Mark them
   * all "must" and a reader stops believing the list — if everything is red, nothing
   * is red.
   */
  it('is a look at 12pt and a fix at 10pt', () => {
    const twelve = auditDeck(sized(24)).find((hit) => hit.kind === 'small');
    expect(twelve?.level).toBe('check');
    expect(twelve?.what).toContain('12pt');

    expect(auditDeck(sized(20)).find((hit) => hit.kind === 'small')?.level).toBe('must');
  });

  it('says nothing about a size a room can read', () => {
    // 18pt is 3.3% of the height — the size a deck's body text actually is.
    expect(kinds(auditDeck(sized(36)))).not.toContain('small');
    expect(kinds(auditDeck(sized(108)))).not.toContain('small');
  });

  it('says nothing when the size is nobody’s', () => {
    // Nothing in the document and no layout to ask: guessing here would report
    // every deck written before font sizes as unreadable.
    expect(kinds(auditDeck(sized(undefined)))).not.toContain('small');
  });

  /**
   * A fraction of the slide, not a number of points.
   *
   * The same 14pt is small on a 16:9 slide and enormous on a square one made for a
   * phone — a slide's size is the deck's choice.
   */
  it('is measured against the slide it is on', () => {
    const tall = deck({
      root: { sid: 'root', stype: 'document', attributes: {}, content: ['s'] },
      s: { sid: 's', stype: 'surface', attributes: { width: 5400, height: 5400 }, content: ['f'] },
      f: { sid: 'f', stype: 'textFrame', attributes: at(), content: ['t-p'], parentId: 's' },
      ...words('t', 24, 'f')
    });
    // 12pt on a 5400-twip slide is 4.4% — perfectly readable there.
    expect(kinds(auditDeck(tall))).not.toContain('small');
  });
});

/**
 * What the sweep can **see**.
 *
 * Measured: it looked at the slide's own children and stopped there — so a picture with no alt
 * text inside a group, a frame or a placement was not looked at, and the deck came back clean.
 * `PLACED` even names `group` and `frame`, so the containers were counted as shapes and their
 * contents were not: a check that reports nothing has to say what it looked at, and this one
 * was saying it about half the deck.
 */
describe('what the sweep can see', () => {
  const nested = (container: Record<string, unknown>) =>
    deck({
      root: { sid: 'root', stype: 'document', attributes: {}, content: ['s'] },
      s: { sid: 's', stype: 'surface', attributes: {}, content: ['box'] },
      box: { sid: 'box', attributes: at({ x: 2000, y: 1000, width: 6000, height: 4000 }), ...container },
      p: { sid: 'p', stype: 'picture', attributes: { x: 200, y: 200, width: 1000, height: 800, src: 'x.png' }, parentId: 'box' }
    });

  it('looks inside a group', () => {
    const hits = auditDeck(nested({ stype: 'group', content: ['p'] }));
    expect(kinds(hits)).toContain('alt');
  });

  it('looks inside a frame', () => {
    expect(kinds(auditDeck(nested({ stype: 'frame', content: ['p'] })))).toContain('alt');
  });

  it('says where a shape names a variable the document has lost', () => {
    /*
     * The other half of "removing a variable does not rewrite the shapes that named it". There is
     * no honest value to put in their place, so the reference stays and the shape draws **no
     * fill** — which looks exactly like a shape somebody meant to leave unpainted. So the check is
     * what makes that decision honest.
     */
    const hits = auditDeck(
      deck({
        root: { sid: 'root', stype: 'document', attributes: {}, content: ['s', 'vars'] },
        s: { sid: 's', stype: 'surface', attributes: {}, content: ['a', 'b'] },
        a: {
          sid: 'a',
          stype: 'rectangle',
          attributes: at({ width: 1000, height: 800, fill: 'var:있음' })
        },
        b: {
          sid: 'b',
          stype: 'rectangle',
          // Inside a gradient stop, which is the place a reference hides that a top-level read
          // would pass.
          attributes: at({
            width: 1000,
            height: 800,
            fills: [{ kind: 'gradient', stops: [{ color: 'var:없음' }, { color: '#fff' }] }]
          })
        },
        vars: { sid: 'vars', stype: 'variables', attributes: {}, content: ['v1'] },
        v1: { sid: 'v1', stype: 'variable', attributes: { name: '있음', value: '#0f766e' } }
      })
    );
    const dead = hits.filter((hit) => hit.kind === 'dead-var');
    expect(dead.map((hit) => [hit.sid, hit.level])).toEqual([['b', 'must']]);
    expect(dead[0].what).toContain('없음');
  });

  it('looks inside a placement, and says the fix is in the card', () => {
    /*
     * The placement holds **nothing**: what it draws is the definition, resolved. So the sweep has
     * to resolve it too, and the day it did not, a deck of twenty cards audited as twenty empty
     * boxes — every picture, caption and colour inside them invisible to the check.
     */
    const hits = auditDeck(
      deck({
        root: { sid: 'root', stype: 'document', attributes: {}, content: ['s', 'lib'] },
        s: { sid: 's', stype: 'surface', attributes: {}, content: ['i'] },
        lib: { sid: 'lib', stype: 'components', attributes: {}, content: ['card'] },
        card: {
          sid: 'card',
          stype: 'component',
          attributes: { id: 'card', width: 6000, height: 4000 },
          content: ['p']
        },
        p: {
          sid: 'p',
          stype: 'picture',
          attributes: { x: 200, y: 200, width: 1000, height: 800, src: 'x.png', partId: 'photo' },
          parentId: 'card'
        },
        i: {
          sid: 'i',
          stype: 'instance',
          attributes: at({ width: 6000, height: 4000, componentId: 'card' }),
          content: []
        }
      })
    );
    const found = hits.find((hit) => hit.kind === 'alt');
    /*
     * Reported against the **placement**, because that is what a reader can act on: a drawn part
     * has a synthetic sid no command accepts, so sending them to it would be a row in the list
     * that goes nowhere.
     */
    expect(found?.sid).toBe('i');
    /*
     * The fault is the slide's and the fix is the card's, so the advice says so — otherwise the
     * reader is about to write the same alt text on twenty slides. It is still reported once
     * per placement: three slides with an undescribed picture are three slides.
     */
    expect(found?.hint).toContain('컴포넌트의 부품');
  });

  it('measures a nested shape against the slide, not against its container', () => {
    // A child's coordinates are its container's, so a box 200 twips inside a frame at 2000 is
    // at 2200 on the slide. Comparing the raw numbers would report every nested shape as
    // inside the slide however far out its container was.
    const out = deck({
      root: { sid: 'root', stype: 'document', attributes: {}, content: ['s'] },
      s: { sid: 's', stype: 'surface', attributes: {}, content: ['g'] },
      g: { sid: 'g', stype: 'group', attributes: at({ x: 18000, y: 1000, width: 4000, height: 2000 }), content: ['r'] },
      r: { sid: 'r', stype: 'rectangle', attributes: { x: 1000, y: 0, width: 3000, height: 2000 }, parentId: 'g' }
    });
    const outside = auditDeck(out).filter((hit) => hit.kind === 'outside');
    // The group itself is out, and so is the rectangle inside it — two real shapes off the
    // slide, which is what a projector will clip.
    expect(outside.map((hit) => hit.sid).sort()).toEqual(['g', 'r']);
  });

  it('does not count what a card was asked for as a shape', () => {
    const card = deck({
      root: { sid: 'root', stype: 'document', attributes: {}, content: ['s'] },
      s: { sid: 's', stype: 'surface', attributes: {}, content: ['i'] },
      i: { sid: 'i', stype: 'instance', attributes: at(), content: ['v'] },
      v: { sid: 'v', stype: 'componentValue', attributes: { name: 'title', value: '매출' }, parentId: 'i' }
    });
    // A value is not a box: it has no size, no place and nothing to describe.
    expect(kinds(auditDeck(card))).not.toContain('outside');
  });
});

describe('a slide with nothing on it', () => {
  it('is a look rather than a fix', () => {
    const blank = deck({
      root: { sid: 'root', stype: 'document', attributes: {}, content: ['s'] },
      s: { sid: 's', stype: 'surface', attributes: {}, content: [] }
    });
    const hit = auditDeck(blank).find((entry) => entry.kind === 'empty-slide');
    // A pause, a section break, somewhere to talk over — calling it wrong would be
    // the list telling a reader off for something they did on purpose.
    expect(hit?.level).toBe('check');
    expect(hit?.sid).toBeUndefined();
  });
});

describe('text over a photograph', () => {
  /**
   * Never a fix, and the reason is the point.
   *
   * Whether it reads depends on how bright the photo is *at that spot*, and the
   * photo's pixels are not in the model. So it says where to look and stops there —
   * the difference between this list and a list that guesses.
   */
  it('is a look, whether the picture is under it or in it', () => {
    const over = deck({
      root: { sid: 'root', stype: 'document', attributes: {}, content: ['s'] },
      s: { sid: 's', stype: 'surface', attributes: {}, content: ['pic', 'f'] },
      pic: { sid: 'pic', stype: 'picture', attributes: at({ src: 'x.png', alt: '배경' }) },
      f: { sid: 'f', stype: 'textFrame', attributes: at(), content: [], parentId: 's' }
    });
    const hit = auditDeck(over).find((entry) => entry.kind === 'photo-text');
    expect(hit?.level).toBe('check');
    expect(hit?.sid).toBe('f');

    const filled = deck({
      root: { sid: 'root', stype: 'document', attributes: {}, content: ['s'] },
      s: { sid: 's', stype: 'surface', attributes: {}, content: ['f'] },
      f: {
        sid: 'f',
        stype: 'textFrame',
        attributes: at({ fills: [{ kind: 'image', src: 'x.png' }] }),
        content: [],
        parentId: 's'
      }
    });
    expect(kinds(auditDeck(filled))).toContain('photo-text');
  });

  it('says nothing when the text is not over one', () => {
    const apart = deck({
      root: { sid: 'root', stype: 'document', attributes: {}, content: ['s'] },
      s: { sid: 's', stype: 'surface', attributes: {}, content: ['pic', 'f'] },
      pic: { sid: 'pic', stype: 'picture', attributes: at({ src: 'x.png', alt: '배경' }) },
      f: {
        sid: 'f',
        stype: 'textFrame',
        attributes: at({ x: 12000, y: 6000 }),
        content: [],
        parentId: 's'
      }
    });
    expect(kinds(auditDeck(apart))).not.toContain('photo-text');
  });
});

describe('what a reader is told before they open it', () => {
  const messy = deck({
    root: { sid: 'root', stype: 'document', attributes: {}, content: ['s1', 's2'] },
    s1: { sid: 's1', stype: 'surface', attributes: {}, content: ['p'] },
    p: { sid: 'p', stype: 'picture', attributes: at({ src: 'x.png' }) },
    s2: { sid: 's2', stype: 'surface', attributes: {}, content: [] }
  });

  it('counts the two levels apart', () => {
    // One thing to fix and one thing to look at, which is a different sentence
    // from "two problems".
    expect(auditCount(auditDeck(messy))).toEqual({ must: 1, check: 0 + 1 });
  });

  it('gives one slide’s own hits, for a badge beside it', () => {
    expect(auditOf(auditDeck(messy), 's2').map((hit) => hit.kind)).toEqual(['empty-slide']);
    expect(auditOf(auditDeck(messy), 's1').map((hit) => hit.kind)).toEqual(['alt']);
  });

  it('is empty for a deck with nothing wrong', () => {
    const clean = deck({
      root: { sid: 'root', stype: 'document', attributes: {}, content: ['s'] },
      s: { sid: 's', stype: 'surface', attributes: {}, content: ['f'] },
      f: { sid: 'f', stype: 'textFrame', attributes: at(), content: ['t-p'], parentId: 's' },
      ...words('t', 72, 'f')
    });
    expect(auditDeck(clean)).toEqual([]);
  });
});

/**
 * Two colours' contrast.
 *
 * WCAG's own arithmetic — relative luminance with the sRGB transfer function, and
 * `(lighter + 0.05) / (darker + 0.05)`. The 0.05 is the standard's allowance for
 * screen glare, and it is why black on white is 21 rather than infinite.
 */
describe('the contrast between two colours', () => {
  it('is 21 for black on white, and 1 for a colour on itself', () => {
    expect(contrastOf('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastOf('#2563eb', '#2563eb')).toBeCloseTo(1, 3);
  });

  it('does not care which way round they are', () => {
    expect(contrastOf('#000', '#fff')).toBe(contrastOf('#fff', '#000'));
  });

  it('reads both hex notations', () => {
    expect(contrastOf('#fff', '#ffffff')).toBeCloseTo(1, 3);
  });

  /**
   * Nothing, rather than a guess — the rule the whole audit is built on.
   *
   * A document's colour may be an `rgb()`, a named colour or a `color-mix()`, and
   * `paints.ts` deals with those by handing them to CSS. A ratio needs numbers, so
   * anything this cannot read is reported as nothing at all: a list that guessed
   * would be a list whose red marks a reader learns to ignore.
   */
  it('answers nothing for a notation it cannot read', () => {
    expect(contrastOf('rebeccapurple', '#fff')).toBeUndefined();
    expect(contrastOf('rgb(0 0 0)', '#fff')).toBeUndefined();
    expect(contrastOf('color-mix(in srgb, red, blue)', '#fff')).toBeUndefined();
    // Alpha too: a colour with alpha is a colour over *something*, and what it is
    // over is the question being asked.
    expect(contrastOf('#00000080', '#fff')).toBeUndefined();
  });
});

describe('text that is hard to read against what is behind it', () => {
  const framed = (over: Record<string, unknown>, ink: string, half = 24) =>
    deck({
      root: { sid: 'root', stype: 'document', attributes: {}, content: ['s'] },
      s: { sid: 's', stype: 'surface', attributes: { fill: '#ffffff' }, content: ['f'] },
      f: { sid: 'f', stype: 'textFrame', attributes: at(over), content: ['t-p'], parentId: 's' },
      't-p': { sid: 't-p', stype: 'paragraph', attributes: {}, content: ['t'], parentId: 'f' },
      t: {
        sid: 't',
        stype: 'inline-text',
        text: '글',
        parentId: 't-p',
        attributes: { fontSize: half },
        /**
         * The colour is a **mark**, which is where a document keeps it — half a word
         * can be red, so it is a range and not an attribute. Written this way after
         * the first fixture put it in `attributes` and the check never fired: the
         * format resolver answers about the size and says nothing about the colour.
         */
        marks: [{ stype: 'fontColor', range: [0, 1], attrs: { color: ink } }]
      }
    });

  it('is certainly wrong, because it is arithmetic on two known colours', () => {
    // Pale grey on the slide's white: 1.6:1, well under the 4.5 ordinary text needs.
    const hit = auditDeck(framed({}, '#cccccc')).find((entry) => entry.kind === 'contrast');
    expect(hit?.level).toBe('must');
    expect(hit?.what).toContain('4.5:1');
  });

  it('says nothing when the two are far enough apart', () => {
    expect(kinds(auditDeck(framed({}, '#111111')))).not.toContain('contrast');
  });

  /** WCAG allows less contrast for large text, because a bigger letterform survives it. */
  it('asks less of large text', () => {
    // 3.1:1 — under 4.5 and over 3.
    const small = auditDeck(framed({}, '#949494', 24)).find((entry) => entry.kind === 'contrast');
    expect(small?.what).toContain('4.5:1');
    expect(kinds(auditDeck(framed({}, '#949494', 40)))).not.toContain('contrast');
  });

  it('reads the shape’s own fill when it has one', () => {
    // White text on the frame's own dark fill reads, whatever the slide is.
    expect(
      kinds(auditDeck(framed({ fill: '#111111' }, '#ffffff')))
    ).not.toContain('contrast');
    // And the same text on a pale fill does not.
    expect(kinds(auditDeck(framed({ fill: '#eeeeee' }, '#ffffff')))).toContain('contrast');
  });

  /**
   * Not asked when what is behind it is somebody's to look at.
   *
   * A gradient has two colours and a picture has thousands. Guessing at either would
   * be guessing at the very thing `photo-text` exists to hand back to a person.
   */
  it('says nothing about text on a gradient or a picture', () => {
    const gradient = framed(
      {
        fills: [
          {
            kind: 'linear',
            stops: [
              { offset: 0, color: '#ffffff' },
              { offset: 1, color: '#000000' }
            ]
          }
        ]
      },
      '#888888'
    );
    expect(kinds(auditDeck(gradient))).not.toContain('contrast');
  });
});

/**
 * What is wrong with the deck's **links**.
 *
 * Two faults invisible while the deck is being made and certain to be found by an audience —
 * which is the shape of thing this list exists for. The arithmetic is `jump.ts`, tested there;
 * what is tested here is that the sweep says them, at the level that matches what they are.
 */
describe('a deck that is not a line', () => {
  const menuDeck = (over: Record<string, unknown> = {}) =>
    deck({
      root: { sid: 'root', stype: 'document', attributes: {}, content: ['m', 'one', 'lost'] },
      m: { sid: 'm', stype: 'surface', attributes: { kind: 'slide', id: 'm' }, content: ['b'] },
      b: { sid: 'b', stype: 'rectangle', attributes: { ...at(), goTo: 'one', ...over } },
      one: { sid: 'one', stype: 'surface', attributes: { kind: 'slide', id: 'one' }, content: ['r'] },
      r: { sid: 'r', stype: 'rectangle', attributes: at() },
      // Hidden *and* linked to by nothing: the show skips it by design, so the only way in is a
      // button, and there is none. A page the flow still walks is not an island — pressing on
      // reaches it, which is what a browser test had to point out.
      lost: {
        sid: 'lost',
        stype: 'surface',
        attributes: { kind: 'slide', id: 'lost', hidden: true },
        content: ['r2']
      },
      r2: { sid: 'r2', stype: 'rectangle', attributes: at() }
    });

  it('is certainly wrong when a button points at a page that is gone', () => {
    const hits = auditDeck(menuDeck({ goTo: 'deleted' }));
    const found = hits.find((hit) => hit.kind === 'dead-jump');
    // A press that does nothing in front of a room is not a matter of taste.
    expect(found?.level).toBe('must');
    expect(found?.sid).toBe('b');
  });

  it('is a look when nothing in the deck leads to a page', () => {
    const found = auditDeck(menuDeck()).find((hit) => hit.kind === 'unreachable');
    // A page kept for the questions afterwards is a real thing to want, so this says what it
    // sees — *nothing leads here* — rather than telling the reader off.
    expect(found?.level).toBe('check');
    expect(found?.slideSid).toBe('lost');
  });

  it('says neither about a deck with no buttons at all', () => {
    const linear = deck({
      root: { sid: 'root', stype: 'document', attributes: {}, content: ['a', 'b'] },
      a: { sid: 'a', stype: 'surface', attributes: { kind: 'slide' }, content: ['r'] },
      r: { sid: 'r', stype: 'rectangle', attributes: at() },
      b: { sid: 'b', stype: 'surface', attributes: { kind: 'slide' }, content: ['r2'] },
      r2: { sid: 'r2', stype: 'rectangle', attributes: at() }
    });
    // In a linear deck every page is reached by pressing on, and reporting all of them would be
    // this check telling a reader off for making an ordinary deck.
    expect(kinds(auditDeck(linear))).not.toContain('unreachable');
  });
});
