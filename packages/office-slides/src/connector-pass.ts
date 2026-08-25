import { segmentCrossings, type ConnectorKind } from '@barocss/office-canvas';
import type { DeckAccess } from './deck';
import { childrenOf, connectorRouteOf } from './deck';
import { SLIDES_ENV_KEY } from './render-context';

/**
 * Where every connector goes, worked out once per render and put on the environment.
 *
 * ## Why a layout pass, of all things
 *
 * A connector's drawing depends on nodes that are **not its own** — the two shapes it
 * joins, the shapes in the way, another line an end holds. The view redraws a node when
 * *that node* changes, so moving a shape redrew the shape and left the line where it was.
 *
 * Measured, and this is the part worth keeping: the lines appeared to follow, and the
 * only reason was that a reaction wrote the ends back into the connector — the write was
 * what changed the node, and changing the node was what caused the redraw. Take the
 * write away (write to the store directly instead) and the line does not move at all.
 * So the reaction was not "remembering where the ends were"; it was the redraw
 * mechanism, by accident.
 *
 * The engine's own answer for a drawing that depends on geometry is a layout pass — its
 * doc comment even names this case: *"the same shape appears wherever geometry decides
 * the result — fitting text to a shape, routing a connector between two boxes"*. A pass
 * returns values to merge into the environment and the view renders again, so:
 *
 * - the document stops churning: no `startX` rewritten on every drag, which for a
 *   **collaborative** board is four numbers of needless traffic and four chances to
 *   conflict per line per drag;
 * - the history stops filling with writes nobody asked for;
 * - and the routes are computed **once** per render instead of once per connector
 *   renderer call.
 *
 * ## What makes it settle
 *
 * The pass returns nothing when every route is the one already on the environment. The
 * routes are a pure function of the document, and this pass writes no document — so the
 * second round always finds the same answer and the loop stops. (Word's pagination has
 * to work harder at this, because it measures its own output.)
 */
export function createConnectorPass(options: {
  doc: DeckAccess;
  /** Bumped by the app when the document changes, so a cached answer is not reused. */
  revision?: () => number;
}): () => Record<string, unknown> | void {
  const { doc } = options;
  let previous: string | null = null;

  return () => {
    const routes = new Map<string, { x: number; y: number }[]>();
    /** Which surface each line is on, and its kind: a crossing is only a crossing on one. */
    const where = new Map<string, { surface: string; kind: ConnectorKind }>();

    const walk = (sid: string, depth: number, surface?: string): void => {
      if (depth > 32) return;
      const node = doc.getNode(sid);
      if (!node) return;
      const here = node.stype === 'surface' ? sid : surface;
      if (node.stype === 'connector') {
        routes.set(sid, connectorRouteOf(doc, sid));
        const kind = node.attributes?.kind;
        where.set(sid, {
          surface: here ?? '',
          kind: (typeof kind === 'string' ? kind : 'elbow') as ConnectorKind
        });
      }
      for (const child of childrenOf(node)) walk(child, depth + 1, here);
    };
    walk(doc.rootId, 0);

    /**
     * Where each line hops **over** another.
     *
     * Decided here because it cannot be decided anywhere else: which of two crossing
     * lines hops is a fact about the *pair*, and neither line can see the other. A
     * renderer asking "does anything cross me?" would answer twice and draw two hops at
     * one crossing, which reads as a broken line rather than as a crossing.
     *
     * **The later line hops**, in document order — the same order that decides which of
     * two overlapping shapes is on top, and stable for the same reason: it is the one
     * ordering the document already has. So each crossing produces exactly one hop, and
     * it is the line drawn on top that carries it, which is what makes it read as passing
     * over.
     *
     * Only between lines on the **same surface** (two slides' lines do not cross) and
     * only where both are drawn as straight runs: a hop cut into a Bézier is not one arc,
     * and `segmentCrossings` reports nothing for a curve rather than guessing.
     */
    const jumps = new Map<string, { x: number; y: number }[]>();
    const order = [...routes.keys()];
    const bends = (sid: string) => {
      const kind = where.get(sid)?.kind;
      return kind === 'curve' || kind === 'arc';
    };
    for (let index = 0; index < order.length; index += 1) {
      const sid = order[index];
      if (bends(sid)) continue;
      const mine = routes.get(sid) ?? [];
      const found: { x: number; y: number }[] = [];
      for (let earlier = 0; earlier < index; earlier += 1) {
        const other = order[earlier];
        if (bends(other)) continue;
        if (where.get(other)?.surface !== where.get(sid)?.surface) continue;
        found.push(...segmentCrossings(mine, routes.get(other) ?? []));
      }
      if (found.length > 0) jumps.set(sid, found);
    }

    // A deck with no lines in it asks nothing of the environment, and saying so is what
    // keeps the pass free for every other deck.
    if (routes.size === 0) {
      if (previous === null) return;
      previous = null;
      return { [SLIDES_ENV_KEY]: { routes: undefined, jumps: undefined } };
    }

    /**
     * The same answer as last round means nothing to report.
     *
     * Compared as text rather than by identity: the routes are rebuilt every round (they
     * have to be — a cached one would answer for the document as it used to be), so
     * identity would say "changed" forever and the loop would run to its limit on every
     * render.
     */
    const shape = JSON.stringify([
      [...routes].map(([sid, points]) => [sid, points]),
      [...jumps].map(([sid, points]) => [sid, points])
    ]);
    if (shape === previous) return;
    previous = shape;
    return { [SLIDES_ENV_KEY]: { routes, jumps } };
  };
}

/** Where this connector hops over another, as the pass worked it out. */
export function jumpsFromEnv(
  env: Record<string, unknown> | undefined,
  sid: string
): { x: number; y: number }[] | undefined {
  const jumps = (env?.[SLIDES_ENV_KEY] as { jumps?: Map<string, { x: number; y: number }[]> } | undefined)
    ?.jumps;
  return jumps?.get(sid);
}

/** The route the pass worked out for this connector, if a pass has run. */
export function routeFromEnv(
  env: Record<string, unknown> | undefined,
  sid: string
): { x: number; y: number }[] | undefined {
  const routes = (env?.[SLIDES_ENV_KEY] as { routes?: Map<string, { x: number; y: number }[]> } | undefined)
    ?.routes;
  return routes?.get(sid);
}
