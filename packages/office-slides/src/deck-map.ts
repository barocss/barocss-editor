import { connectorPath, connectorPoints, layoutGraph, type ConnectorBox } from '@barocss/office-canvas';
import { deckSlides, type DeckAccess } from './deck';
import { slideSize } from './geometry';
import { deckAdvance, deckJumps, jumpFaults, jumpTarget } from './jump';

/**
 * The deck as a **graph**: which page leads where.
 *
 * ## Why this is a view and not a second document
 *
 * The fact — *pressing this shows that* — is on the shape (`goTo`, canvas-model §11b), because a
 * connector is a line an audience can see and an arrow pointing off the edge of a slide means
 * nothing to them. So the map draws those facts and holds none of its own: nothing here is
 * written, there is no position on a page to keep, and a deck nobody has opened the map on costs
 * exactly nothing.
 *
 * Which also decides what a reader may do in it. Dragging a **page** somewhere would be asking
 * this to remember a place, and it does not; what the map is for is *seeing the shape of the
 * deck* and going to a page.
 *
 * ## Why the arrows are routed by the connector's own router
 *
 * `connectorPoints` and `connectorPath` are pure — boxes in, points out — and they are what the
 * deck's own lines are drawn with. A second answer to "how does a line get from this box to that
 * one" is how the two come to disagree about the same picture, which is the duplication this
 * repository keeps finding. The map asks for an elbow, because a graph read top to bottom is
 * read along right angles.
 *
 * ## Two things the map says that a filmstrip cannot
 *
 * A page **nothing leads to**, and a button that leads **nowhere** — the deck's own check reports
 * both as a list, and this is the same two answers laid out where a reader can see *why*: an
 * island is obvious in a picture and invisible in a strip.
 */

/** One page in the map, placed. */
export interface MapPage {
  sid: string;
  /** Its number in the deck, which is what a reader calls it. */
  number: number;
  name: string;
  hidden: boolean;
  /** Where it goes, in twips — the app scales, like everything else here. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Nothing in the deck leads here, in a deck that has buttons at all. */
  unreachable: boolean;
  /**
   * How many buttons **on** this page lead nowhere.
   *
   * Counted here rather than in the app, because the app would have to walk from a shape back to
   * its page to draw the badge — and that walk is a fact about the document, which is this
   * file's business and not a view's.
   */
  dead: number;
}

/** One arrow: a press, or the deck's own order. */
export interface MapLink {
  from: string;
  to: string;
  /**
   * `jump` is a button; `flow` is pressing on, which is the deck's spine.
   *
   * The spine is drawn because a map without it is a page of islands: a reader who has added two
   * buttons to a twenty-page deck should see a deck with two buttons, not two pairs of pages.
   */
  kind: 'jump' | 'flow';
  /** The shape that is the button, for a jump. */
  sid?: string;
  /** The path, ready to draw — in twips, in the map's own space. */
  path: string;
  /**
   * Where the arrow **arrives**, which is where a reader takes hold of it.
   *
   * A jump is moved the way a connector's end is moved: pick up the end and drop it on another
   * page. So the grip's place is arithmetic about the route, and it belongs with the route — the
   * app drawing a grip "somewhere near the end" would be a second answer to where the line ends.
   */
  end: { x: number; y: number };
}

export interface DeckMap {
  pages: MapPage[];
  links: MapLink[];
  /** What the whole picture takes, so the app can fit it. */
  width: number;
  height: number;
  /** Buttons pointing at a page the deck no longer has, by shape. */
  dead: string[];
}

/** The gap between two ranks and between two pages in one rank, in twips. */
const RANK_GAP = 3600;
const PAGE_GAP = 2400;

export function deckMap(
  doc: DeckAccess,
  options: { direction?: 'down' | 'right' } = {}
): DeckMap {
  const slides = deckSlides(doc);
  if (slides.length === 0) return { pages: [], links: [], width: 0, height: 0, dead: [] };

  /** Every page at the deck's own size, which is what makes the picture read as slides. */
  const size = slideSize(doc.getNode(slides[0].sid)?.attributes);
  const nodes = slides.map((slide) => ({
    sid: slide.sid,
    width: size.width,
    height: size.height
  }));

  const shown = slides.filter((slide) => !slide.hidden);
  const jumps = deckJumps(doc);

  /**
   * The edges: the deck's own order, and every button that leads somewhere.
   *
   * A `next`/`previous`/`first`/`last` button is drawn as the edge it actually is — resolved by
   * `jumpTarget`, which is the one place that knows what those mean — so a map cannot disagree
   * with the show about where a press goes.
   */
  const edges: Array<{ from: string; to: string; kind: 'jump' | 'flow'; sid?: string }> = [];
  /*
   * The spine, unless the deck says its links are the only way through — then there is no spine
   * to draw, and the picture is the whole truth about where a reader can get to. Which is the
   * point of drawing a map of such a deck at all.
   */
  if (deckAdvance(doc) === 'press') {
    for (let at = 0; at + 1 < shown.length; at += 1) {
      edges.push({ from: shown[at].sid, to: shown[at + 1].sid, kind: 'flow' });
    }
  }
  for (const jump of jumps) {
    const to = jumpTarget(doc, jump, { at: jump.from });
    // A `back` button has no edge: where it goes depends on where the reader came from, which
    // is not a fact about the deck. Said in the page's own badge instead (the app draws it).
    if (!to || jump.kind === 'back') continue;
    edges.push({ from: jump.from, to, kind: 'jump', sid: jump.sid });
  }

  /**
   * Placed by the graph layout the tidy uses — and the pages it does not place, placed after.
   *
   * `layoutGraph` answers only about the nodes an edge touches (and answers nothing at all when
   * there are no edges), which is right for a diagram and not enough for a deck: a one-page deck,
   * and a page nothing leads to, both have to be somewhere. They go in a row underneath, in the
   * deck's own order, because "the pages nothing joins" is itself something a reader should see
   * as a group.
   */
  const placed = new Map(
    layoutGraph(nodes, edges, {
      direction: options.direction ?? 'down',
      rankGap: RANK_GAP,
      nodeGap: PAGE_GAP
    }).map((one) => [one.sid, one])
  );

  const loose = slides.filter((slide) => !placed.has(slide.sid));
  const laidBottom =
    [...placed.values()].reduce((most, one) => Math.max(most, one.y + size.height), 0) +
    (placed.size > 0 ? RANK_GAP : 0);
  loose.forEach((slide, index) => {
    placed.set(slide.sid, {
      sid: slide.sid,
      x: index * (size.width + PAGE_GAP),
      y: laidBottom
    });
  });

  const faults = jumpFaults(doc);
  const unreachable = new Set(
    faults.filter((fault) => fault.kind === 'unreachable').map((fault) => fault.slideSid)
  );

  const pages: MapPage[] = slides.map((slide) => {
    const at = placed.get(slide.sid) as { x: number; y: number };
    return {
      sid: slide.sid,
      number: slide.number,
      name: slide.name,
      hidden: slide.hidden,
      x: at.x,
      y: at.y,
      width: size.width,
      height: size.height,
      unreachable: unreachable.has(slide.sid),
      dead: faults.filter((fault) => fault.kind === 'dead-jump' && fault.slideSid === slide.sid)
        .length
    };
  });

  const boxOf = (sid: string): ConnectorBox | undefined => {
    const page = pages.find((one) => one.sid === sid);
    return page ? { x: page.x, y: page.y, width: page.width, height: page.height } : undefined;
  };

  const links: MapLink[] = edges.map((edge) => {
    const start = boxOf(edge.from);
    const end = boxOf(edge.to);
    /*
     * The deck's own router, asked for an elbow: a graph read top to bottom is read along right
     * angles, and this is the same function the deck's connectors are drawn with — so the two
     * cannot disagree about how a line gets from one box to another.
     */
    const points = connectorPoints(
      { kind: 'elbow', start: { x: 0, y: 0 }, end: { x: 0, y: 0 } } as never,
      { start, end }
    );
    const last = points[points.length - 1] ?? { x: 0, y: 0 };
    return { ...edge, path: connectorPath(points, 'elbow'), end: { x: last.x, y: last.y } };
  });

  const width = pages.reduce((most, page) => Math.max(most, page.x + page.width), 0);
  const height = pages.reduce((most, page) => Math.max(most, page.y + page.height), 0);

  return {
    pages,
    links,
    width,
    height,
    dead: faults
      .filter((fault) => fault.kind === 'dead-jump')
      .map((fault) => fault.sid as string)
      .filter(Boolean)
  };
}
