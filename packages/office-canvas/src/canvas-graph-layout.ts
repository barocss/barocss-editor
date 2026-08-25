/**
 * Tidying a diagram: where the shapes go, given what joins them.
 *
 * ## Why this is worth having at all
 *
 * A reader draws a flow chart the way they think of it — a box, a line, another box — and
 * after a dozen of those the picture is right and the *placement* is a mess: layers at
 * four different heights, lines crossing for no reason, one branch twice as far from its
 * parent as its sibling. Every diagram tool a person might come from has one button for
 * this, and it is the difference between a canvas someone drafts on and a canvas someone
 * only ever finishes work in.
 *
 * ## The opposite decision to a waypoint
 *
 * A connector's route is derived and lives in the render (canvas-model §8.11). This is
 * not: it **moves the shapes**, and where a shape is is the document's to say. So the
 * answer here is a list of moves for a command to write, in one transaction, so that
 * "tidy this up" is one entry in the history and one press of undo — which is the whole
 * reason a reader will dare to press it.
 *
 * ## The algorithm, and why this one
 *
 * Layered (what Sugiyama named, what Graphviz's `dot` does, what every flow chart
 * already looks like): the edges point one way, so the nodes fall into ranks and the
 * drawing puts one rank per row. The three passes are the standard ones, and each is
 * here for a fault that shows without it:
 *
 * 1. **Rank**, by longest path from the sources — a node sits one row below its deepest
 *    parent. Without the *longest* path an edge can point sideways or backwards, which
 *    is exactly the picture the reader pressed the button to get rid of.
 * 2. **Order** within a rank, by the average position of what a node is joined to
 *    (barycentre), swept down and up a few times. This is the pass that removes crossings;
 *    with the ranks alone, two branches that never touch still weave through each other.
 * 3. **Place**, packing each rank along the cross axis and then pulling each node towards
 *    its neighbours' centre without letting it pass the node beside it. Ranks alone are
 *    evenly spaced and *unaligned*: a parent sits over the left edge of its children
 *    rather than over the middle of them, and the picture reads as a list.
 *
 * What is deliberately *not* here: dummy nodes for edges that skip a rank. `dot` inserts
 * them so a long edge bends around the ranks it passes; our edges are connectors, which
 * route themselves around what is in the way (§8.5) — the mechanism exists already and
 * inventing invisible nodes to feed a router we do not need would be work for nothing.
 */

import { capSizeOf, labelBox } from './canvas-connector';

/** A shape to place: its identity and how big it is. Twips, like everything else. */
export interface GraphNode {
  sid: string;
  width: number;
  height: number;
  /**
   * Where it is now, which only a **pinned** shape needs — it is the place the tidy has
   * to keep.
   */
  at?: { x: number; y: number };
  /**
   * A shape whose place the reader has already decided.
   *
   * The answer to "is the tidy a mode?", which it is not: it runs once, writes plain
   * coordinates, and a reader drags what they like afterwards. But *afterwards* is the
   * problem — press it again and their arrangement is gone. A pin is how they say which
   * part of it was on purpose: the shape stays exactly where it is and **the diagram is
   * laid out around it**.
   */
  pinned?: boolean;
}

/** A line between two shapes, pointing the way the line points. */
export interface GraphEdge {
  from: string;
  to: string;
}

export type GraphDirection = 'down' | 'right';

export interface GraphLayoutOptions {
  /**
   * Which way the ranks stack. `down` for a flow chart, `right` for a process — the two
   * a reader means by "tidy this", and the only two worth a control.
   */
  direction?: GraphDirection;
  /** Between one rank and the next. */
  rankGap?: number;
  /** Between two shapes in the same rank. */
  nodeGap?: number;
  /** Where the tidied graph's top-left corner goes. */
  origin?: { x: number; y: number };
}

/** Where one shape ends up. */
export interface GraphPlacement {
  sid: string;
  x: number;
  y: number;
}

/**
 * The gaps, and where the two numbers come from.
 *
 * Graphviz's `dot` — the layout every diagram tool's output is compared against — ships
 * `ranksep=0.5in` and `nodesep=0.25in`, and thirty years of diagrams have been read at
 * those proportions. Picking our own would be picking a number, so these are those two.
 *
 * The rank gap is a **floor**, not the answer: what goes between two ranks is the line,
 * its arrowhead and its label, and a gap that does not hold the label draws the label
 * over a shape. `rankGapFor` measures that; see it for the rest of the argument.
 */
export const RANK_GAP = 720;
export const NODE_GAP = 360;
/**
 * How far apart two ranks have to be for this diagram's own lines.
 *
 * The honest answer to "where does the gap come from", and the reason it is a function:
 * between two ranks there is a line, an arrowhead, and — if the reader named the
 * relationship — a **label pill sitting on the middle of that line**. A gap that does not
 * hold the pill draws it over the shape below, which is the commonest way an automatic
 * layout looks broken.
 *
 * Which of the pill's two sizes matters depends on the direction: a rank gap runs *down*
 * for a flow chart, so the pill's height has to fit in it, and *across* for a process, so
 * the width does. Getting that the wrong way round is invisible on a short label and
 * unmissable on a Korean one, which is why `labelBox` is asked rather than guessed at.
 *
 * Never below `RANK_GAP`: a diagram with no labels still needs ranks a reader can tell
 * apart.
 */
export function rankGapFor(
  lines: { label?: string; strokeWidth?: number }[],
  direction: GraphDirection = 'down'
): number {
  let needed = RANK_GAP;
  for (const line of lines) {
    const pill = labelBox(line.label ?? '');
    const extent = direction === 'down' ? pill.height : pill.width;
    if (extent === 0) continue;
    // The pill, the arrowhead it must not sit on, and an eighth of an inch of air so the
    // two do not merely touch.
    needed = Math.max(needed, extent + capSizeOf(line.strokeWidth ?? 0) + 180);
  }
  return needed;
}

/** Between two diagrams that share a slide but not an edge. */
const COMPONENT_GAP = 1080;
/** How many times the barycentre sweep runs. Four is where the crossings stop falling. */
const SWEEPS = 4;

/**
 * The moves that tidy a graph.
 *
 * Only the shapes the **edges touch**. A shape joined to nothing is not part of the
 * diagram — a title, a note, a logo — and moving it because it happens to share a slide
 * would be the button doing something nobody asked for. It also means "tidy" is safe to
 * press with everything selected.
 */
export function layoutGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: GraphLayoutOptions = {}
): GraphPlacement[] {
  const direction = options.direction ?? 'down';
  const rankGap = options.rankGap ?? RANK_GAP;
  const nodeGap = options.nodeGap ?? NODE_GAP;
  const origin = options.origin ?? { x: 0, y: 0 };

  const byId = new Map(nodes.map((node) => [node.sid, node]));
  // Only edges whose both ends are here, and no loop back to the same shape: a self-join
  // is legal on the canvas (a state that stays put) and it ranks a node below itself.
  const real = edges.filter(
    (edge) => edge.from !== edge.to && byId.has(edge.from) && byId.has(edge.to)
  );
  if (real.length === 0) return [];

  const touched = nodes.filter(
    (node) => real.some((edge) => edge.from === node.sid || edge.to === node.sid)
  );

  const placements: GraphPlacement[] = [];
  /** A pinned shape with a place: the anchor a component is hung from. */
  const anchorOf = (part: GraphNode[]) =>
    part.find((node) => node.pinned && node.at) ?? null;
  /**
   * Each disconnected diagram laid out on its own, then set beside the last.
   *
   * Ranked together, two diagrams that share no edge would be interleaved rank by rank —
   * the first row of one beside the first row of the other — and a reader would see two
   * pictures shuffled into each other rather than two pictures.
   */
  let offset = 0;
  for (const part of componentsOf(touched, real)) {
    const laid = layoutOne(part.nodes, part.edges, direction, rankGap, nodeGap);

    /**
     * Hung from the pinned shape, if there is one.
     *
     * The whole diagram is moved so that shape lands back where it already is, which is
     * what makes a pin useful: everything else is arranged around it rather than the
     * reader's one deliberate placement being the single thing the tidy destroys.
     *
     * The **first** pin, and only that one. Two pins in a diagram can simply disagree —
     * honouring both would mean stretching the ranks to reach them, and a picture stretched
     * to obey two pins is one neither reader asked for. So the second pin is a shape that
     * does not move (it is never written) and the layout treats it as an ordinary node.
     */
    const anchor = anchorOf(part.nodes);
    const held = anchor ? laid.find((one) => one.sid === anchor.sid) : undefined;
    const shift =
      anchor && held
        ? { x: anchor.at!.x - held.x, y: anchor.at!.y - held.y }
        : direction === 'down'
          ? { x: origin.x + offset, y: origin.y }
          : { x: origin.x, y: origin.y + offset };

    for (const one of laid) {
      // A pinned shape is never written. Its place is the reader's answer, and a move
      // that lands on the same numbers is still a move in the history.
      if (part.nodes.find((node) => node.sid === one.sid)?.pinned) continue;
      placements.push({ sid: one.sid, x: Math.round(one.x + shift.x), y: Math.round(one.y + shift.y) });
    }

    // An anchored diagram is where it is; only the ones being placed from the origin
    // queue up beside each other.
    if (!anchor || !held) offset += crossExtent(laid, part.nodes, direction) + COMPONENT_GAP;
  }
  return placements;
}

/** How wide (or tall) a laid-out component came out, across the ranks. */
function crossExtent(
  laid: GraphPlacement[],
  nodes: GraphNode[],
  direction: GraphDirection
): number {
  const size = new Map(nodes.map((node) => [node.sid, node]));
  let far = 0;
  for (const one of laid) {
    const node = size.get(one.sid)!;
    far = Math.max(far, direction === 'down' ? one.x + node.width : one.y + node.height);
  }
  return far;
}

/** The diagrams in a drawing: nodes joined by a path of edges, ignoring which way. */
function componentsOf(
  nodes: GraphNode[],
  edges: GraphEdge[]
): { nodes: GraphNode[]; edges: GraphEdge[] }[] {
  const beside = new Map<string, string[]>();
  for (const edge of edges) {
    (beside.get(edge.from) ?? beside.set(edge.from, []).get(edge.from)!).push(edge.to);
    (beside.get(edge.to) ?? beside.set(edge.to, []).get(edge.to)!).push(edge.from);
  }

  const seen = new Set<string>();
  const parts: { nodes: GraphNode[]; edges: GraphEdge[] }[] = [];
  for (const node of nodes) {
    if (seen.has(node.sid)) continue;
    const group = new Set<string>();
    const queue = [node.sid];
    while (queue.length > 0) {
      const at = queue.pop()!;
      if (group.has(at)) continue;
      group.add(at);
      seen.add(at);
      for (const next of beside.get(at) ?? []) if (!group.has(next)) queue.push(next);
    }
    parts.push({
      // Document order kept inside a component, because it is the order the reader drew
      // them in and it decides the first ordering the sweep starts from.
      nodes: nodes.filter((one) => group.has(one.sid)),
      edges: edges.filter((edge) => group.has(edge.from))
    });
  }
  return parts;
}

function layoutOne(
  nodes: GraphNode[],
  edges: GraphEdge[],
  direction: GraphDirection,
  rankGap: number,
  nodeGap: number
): GraphPlacement[] {
  const forward = withoutCycles(nodes, edges);
  const rank = ranksOf(nodes, forward);
  const ranks = ordered(nodes, edges, rank);
  return placed(ranks, nodes, edges, direction, rankGap, nodeGap);
}

/**
 * The edges to rank by, with the ones that point backwards left out.
 *
 * A cycle has no ranking — every node in it would have to sit below itself — and a
 * diagram with a loop in it is not a mistake: a retry, a review that sends work back, a
 * state machine. So the loop's closing edge is set aside for the ranking and drawn
 * anyway, which is what `dot` does and what makes the picture readable: the loop reads
 * as the one line going back up.
 *
 * Found by depth-first search: an edge to a node still on the stack is the one closing
 * the cycle.
 */
function withoutCycles(nodes: GraphNode[], edges: GraphEdge[]): GraphEdge[] {
  const out = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    const list = out.get(edge.from);
    if (list) list.push(edge);
    else out.set(edge.from, [edge]);
  }

  const done = new Set<string>();
  const onStack = new Set<string>();
  const back = new Set<GraphEdge>();

  const walk = (sid: string) => {
    onStack.add(sid);
    for (const edge of out.get(sid) ?? []) {
      if (onStack.has(edge.to)) back.add(edge);
      else if (!done.has(edge.to)) walk(edge.to);
    }
    onStack.delete(sid);
    done.add(sid);
  };
  for (const node of nodes) if (!done.has(node.sid)) walk(node.sid);

  return edges.filter((edge) => !back.has(edge));
}

/**
 * Which row each node is in: one below its deepest parent.
 *
 * The **longest** path from a source rather than the shortest, so no edge ever points
 * sideways or up. Measured on a diamond — one node joined to two, both joined back to a
 * fourth: by shortest path the fourth sits in row 1 beside its own parents, and the
 * picture is worse than the one the reader had.
 */
function ranksOf(nodes: GraphNode[], edges: GraphEdge[]): Map<string, number> {
  const incoming = new Map<string, number>();
  const out = new Map<string, string[]>();
  for (const node of nodes) {
    incoming.set(node.sid, 0);
    out.set(node.sid, []);
  }
  for (const edge of edges) {
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    out.get(edge.from)!.push(edge.to);
  }

  const rank = new Map<string, number>(nodes.map((node) => [node.sid, 0]));
  const ready = nodes.filter((node) => (incoming.get(node.sid) ?? 0) === 0).map((n) => n.sid);
  while (ready.length > 0) {
    const at = ready.shift()!;
    for (const next of out.get(at) ?? []) {
      rank.set(next, Math.max(rank.get(next) ?? 0, (rank.get(at) ?? 0) + 1));
      incoming.set(next, (incoming.get(next) ?? 1) - 1);
      if ((incoming.get(next) ?? 0) === 0) ready.push(next);
    }
  }
  return rank;
}

/**
 * The order of the nodes inside each row, chosen to cross as few lines as possible.
 *
 * Each node is pulled towards the average position of what it is joined to in the row
 * before (going down) and after (going up), and the rows are re-sorted by that average.
 * A few sweeps and it settles. This is the barycentre heuristic; crossing minimisation is
 * NP-hard and nobody's diagram needs the exact answer — what it needs is for two
 * unrelated branches to stop weaving.
 */
function ordered(
  nodes: GraphNode[],
  edges: GraphEdge[],
  rank: Map<string, number>
): string[][] {
  const deepest = Math.max(0, ...[...rank.values()]);
  const rows: string[][] = Array.from({ length: deepest + 1 }, () => []);
  for (const node of nodes) rows[rank.get(node.sid) ?? 0].push(node.sid);

  // Both directions from every node, because a row is ordered against the row above it
  // going down and the row below it coming back up.
  const neighbours = new Map<string, string[]>();
  const add = (from: string, to: string) => {
    const list = neighbours.get(from);
    if (list) list.push(to);
    else neighbours.set(from, [to]);
  };
  for (const edge of edges) {
    add(edge.from, edge.to);
    add(edge.to, edge.from);
  };

  for (let sweep = 0; sweep < SWEEPS; sweep += 1) {
    const down = sweep % 2 === 0;
    const order = down ? [...rows.keys()] : [...rows.keys()].reverse();
    for (const index of order) {
      const against = rows[down ? index - 1 : index + 1];
      if (!against) continue;
      const place = new Map(against.map((sid, at) => [sid, at]));
      const score = new Map<string, number>();
      rows[index].forEach((sid, at) => {
        const seen = (neighbours.get(sid) ?? [])
          .map((other) => place.get(other))
          .filter((one): one is number => one !== undefined);
        // A node joined to nothing in the neighbouring row keeps where it is, rather
        // than being sorted to position zero by an average of no numbers.
        score.set(sid, seen.length === 0 ? at : seen.reduce((sum, one) => sum + one, 0) / seen.length);
      });
      rows[index] = [...rows[index]].sort((a, b) => (score.get(a) ?? 0) - (score.get(b) ?? 0));
    }
  }

  return rows;
}

/**
 * Where each node actually goes.
 *
 * The rank decides one axis outright — rows are as far apart as the tallest thing in the
 * row before, plus the gap. The other axis is the interesting one: packed in order first,
 * then **two pulls** towards the centre of what each node is joined to, each stopped by
 * the node beside it.
 *
 * The pull is the pass that makes it look drawn rather than tabulated: without it a
 * parent sits above the left edge of its children instead of above the middle of them.
 * Stopping at the neighbour is what keeps the order the sweep worked out — a node that
 * slides past its neighbour to reach its children has undone the crossing pass.
 */
function placed(
  rows: string[][],
  nodes: GraphNode[],
  edges: GraphEdge[],
  direction: GraphDirection,
  rankGap: number,
  nodeGap: number
): GraphPlacement[] {
  const down = direction === 'down';
  const size = new Map(nodes.map((node) => [node.sid, node]));
  const along = (sid: string) => (down ? size.get(sid)!.height : size.get(sid)!.width);
  const across = (sid: string) => (down ? size.get(sid)!.width : size.get(sid)!.height);

  // The rank axis: each row as far from the last as the biggest thing in it needs.
  const thickness = rows.map((row) => Math.max(0, ...row.map(along)));
  const rowAt: number[] = [];
  let main = 0;
  for (const [index, deep] of thickness.entries()) {
    rowAt[index] = main;
    main += deep + rankGap;
  }

  // The other axis: packed in document order to start with, which is the order the
  // crossing sweep already settled.
  const cross = new Map<string, number>();
  for (const row of rows) {
    let at = 0;
    for (const sid of row) {
      cross.set(sid, at);
      at += across(sid) + nodeGap;
    }
  }

  const neighbours = new Map<string, { up: string[]; down: string[] }>();
  const of = (sid: string) => {
    const found = neighbours.get(sid);
    if (found) return found;
    const made = { up: [] as string[], down: [] as string[] };
    neighbours.set(sid, made);
    return made;
  };
  for (const edge of edges) {
    of(edge.to).up.push(edge.from);
    of(edge.from).down.push(edge.to);
  }

  const centre = (sid: string) => (cross.get(sid) ?? 0) + across(sid) / 2;

  for (let pass = 0; pass < SWEEPS; pass += 1) {
    const downward = pass % 2 === 0;
    const order = downward ? [...rows.keys()] : [...rows.keys()].reverse();
    for (const index of order) {
      const row = rows[index];
      if (row.length === 0) continue;

      const want = new Map<string, number>();
      for (const sid of row) {
        const joined = downward ? of(sid).up : of(sid).down;
        const known = joined.filter((other) => cross.has(other));
        // Nothing to aim at: stay. A node pulled towards the average of no neighbours
        // would be pulled to zero, which is a move nothing asked for.
        if (known.length === 0) continue;
        want.set(
          sid,
          known.reduce((sum, other) => sum + centre(other), 0) / known.length - across(sid) / 2
        );
      }

      // Towards what it is joined to, but never past the node before it: the order the
      // crossing pass chose is the thing being preserved.
      let edgeOf = -Infinity;
      for (const sid of row) {
        const at = Math.max(want.get(sid) ?? cross.get(sid) ?? 0, edgeOf);
        cross.set(sid, at);
        edgeOf = at + across(sid) + nodeGap;
      }
      // And back, so a node held left by the pass above is not left behind its own
      // children when the node after it had room to spare.
      let limit = Infinity;
      for (const sid of [...row].reverse()) {
        const at = Math.min(want.get(sid) ?? cross.get(sid) ?? 0, limit - across(sid));
        cross.set(sid, Math.max(at, cross.get(sid) ?? 0));
        limit = (cross.get(sid) ?? 0) - nodeGap;
      }
    }
  }

  /**
   * Back to a corner.
   *
   * The pulls move nodes either way, so a component's own left edge drifts negative — and
   * a caller asked for the tidied graph to start at `origin`, not near it.
   */
  const least = Math.min(...[...cross.values()].map((one) => one));
  return rows.flatMap((row, index) =>
    row.map((sid) => {
      const crossAt = (cross.get(sid) ?? 0) - least;
      const mainAt = rowAt[index] + (thickness[index] - along(sid)) / 2;
      return down
        ? { sid, x: Math.round(crossAt), y: Math.round(mainAt) }
        : { sid, x: Math.round(mainAt), y: Math.round(crossAt) };
    })
  );
}
