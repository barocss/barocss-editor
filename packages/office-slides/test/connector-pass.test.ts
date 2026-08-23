import { describe, it, expect } from 'vitest';
import { createConnectorPass, jumpsFromEnv, routeFromEnv } from '../src/connector-pass';
import { SLIDES_ENV_KEY } from '../src/render-context';
import type { DeckAccess } from '../src/deck';

/**
 * Where every connector goes, worked out once per render.
 *
 * ## The measurement that made this exist
 *
 * A connector's drawing depends on nodes that are **not its own**. The view redraws a
 * node when *that node* changes — so moving a shape redrew the shape and left the line
 * where it was. The lines appeared to follow only because a reaction wrote the ends back
 * into the connector: the write was what changed the node, and changing the node was the
 * redraw. Writing to the store directly instead left the line exactly where it was.
 *
 * So the reaction was never "remembering where the ends were"; it was the redraw
 * mechanism by accident, and it cost an entry in the history for every drag and — on a
 * shared board — four numbers of traffic per line per drag.
 */
describe('the routes a render needs', () => {
  const deck = (nodes: Record<string, Record<string, unknown>>): DeckAccess =>
    ({ rootId: 'root', getNode: (sid: string) => nodes[sid] as never }) as DeckAccess;

  const twoJoined = (over: Record<string, unknown> = {}) =>
    deck({
      root: { sid: 'root', stype: 'document', content: ['slide'] },
      slide: { sid: 'slide', stype: 'surface', parentId: 'root', content: ['a', 'b', 'line'] },
      a: {
        sid: 'a',
        stype: 'rectangle',
        parentId: 'slide',
        attributes: { x: 0, y: 0, width: 2000, height: 1000, ...over }
      },
      b: {
        sid: 'b',
        stype: 'rectangle',
        parentId: 'slide',
        attributes: { x: 8000, y: 0, width: 2000, height: 1000 }
      },
      line: {
        sid: 'line',
        stype: 'connector',
        parentId: 'slide',
        attributes: { startNodeId: 'a', endNodeId: 'b', kind: 'straight' }
      }
    });

  it('reports a route for every line in the deck', () => {
    const pass = createConnectorPass({ doc: twoJoined() });
    const patch = pass() as Record<string, { routes: Map<string, unknown> }>;
    expect(patch[SLIDES_ENV_KEY].routes.has('line')).toBe(true);
  });

  it('reports nothing the second time, so the render loop stops', () => {
    /*
     * The routes are rebuilt every round — a cached one would answer for the document as
     * it used to be — so "changed" has to be decided by *value*. By identity it would be
     * changed forever and the pass loop would run to its limit on every render.
     */
    const pass = createConnectorPass({ doc: twoJoined() });
    expect(pass()).toBeTruthy();
    expect(pass()).toBeUndefined();
  });

  it('reports again when a shape has moved', () => {
    const nodes: Record<string, Record<string, unknown>> = {
      root: { sid: 'root', stype: 'document', content: ['slide'] },
      slide: { sid: 'slide', stype: 'surface', parentId: 'root', content: ['a', 'b', 'line'] },
      a: { sid: 'a', stype: 'rectangle', parentId: 'slide', attributes: { x: 0, y: 0, width: 2000, height: 1000 } },
      b: { sid: 'b', stype: 'rectangle', parentId: 'slide', attributes: { x: 8000, y: 0, width: 2000, height: 1000 } },
      line: {
        sid: 'line',
        stype: 'connector',
        parentId: 'slide',
        attributes: { startNodeId: 'a', endNodeId: 'b', kind: 'straight' }
      }
    };
    const pass = createConnectorPass({ doc: deck(nodes) });
    const first = pass() as Record<string, { routes: Map<string, { x: number }[]> }>;
    const before = first[SLIDES_ENV_KEY].routes.get('line')!;
    expect(pass()).toBeUndefined();

    // The shape moves, and nothing touches the connector's own node.
    nodes.b.attributes = { x: 12000, y: 4000, width: 2000, height: 1000 };

    const second = pass() as Record<string, { routes: Map<string, { x: number }[]> }>;
    const after = second[SLIDES_ENV_KEY].routes.get('line')!;
    expect(after).not.toEqual(before);
  });

  it('asks nothing of a deck with no lines in it', () => {
    const plain = deck({
      root: { sid: 'root', stype: 'document', content: ['slide'] },
      slide: { sid: 'slide', stype: 'surface', parentId: 'root', content: [] }
    });
    expect(createConnectorPass({ doc: plain })()).toBeUndefined();
  });

  it('clears the routes when the last line goes', () => {
    const nodes: Record<string, Record<string, unknown>> = {
      root: { sid: 'root', stype: 'document', content: ['slide'] },
      slide: { sid: 'slide', stype: 'surface', parentId: 'root', content: ['line'] },
      line: { sid: 'line', stype: 'connector', parentId: 'slide', attributes: { kind: 'straight' } }
    };
    const pass = createConnectorPass({ doc: deck(nodes) });
    expect(pass()).toBeTruthy();

    nodes.slide.content = [];
    const patch = pass() as Record<string, { routes: undefined }>;
    // Said out loud rather than left behind: a stale route would draw a line that is not
    // in the document any more.
    expect(patch[SLIDES_ENV_KEY]).toEqual({ routes: undefined });
  });

  it('is read back by the renderer, and answers nothing without a pass', () => {
    const routes = new Map([['line', [{ x: 0, y: 0 }]]]);
    expect(routeFromEnv({ [SLIDES_ENV_KEY]: { routes } }, 'line')).toHaveLength(1);
    expect(routeFromEnv({ [SLIDES_ENV_KEY]: { routes } }, 'other')).toBeUndefined();
    // A thumbnail built before the deck is loaded, or a test rendering one node.
    expect(routeFromEnv(undefined, 'line')).toBeUndefined();
    expect(routeFromEnv({}, 'line')).toBeUndefined();
  });
});

/**
 * Which of two crossing lines hops over the other.
 *
 * The pass decides, because it cannot be decided anywhere else: it is a fact about the
 * **pair**, and neither line can see the other. A renderer asking "does anything cross
 * me?" would answer twice and draw two hops at one crossing, which reads as a broken line
 * rather than as a crossing.
 */
describe('the hops at a crossing', () => {
  const crossing = (over: Record<string, unknown> = {}): DeckAccess =>
    ({
      rootId: 'root',
      getNode: (sid: string) =>
        ({
          root: { sid: 'root', stype: 'document', content: ['slide'] },
          slide: {
            sid: 'slide',
            stype: 'surface',
            parentId: 'root',
            content: ['a', 'b', 'c', 'd', 'first', 'second']
          },
          a: { sid: 'a', stype: 'rectangle', parentId: 'slide', attributes: { x: 0, y: 3000, width: 1000, height: 1000 } },
          b: { sid: 'b', stype: 'rectangle', parentId: 'slide', attributes: { x: 9000, y: 3000, width: 1000, height: 1000 } },
          c: { sid: 'c', stype: 'rectangle', parentId: 'slide', attributes: { x: 4500, y: 0, width: 1000, height: 1000 } },
          d: { sid: 'd', stype: 'rectangle', parentId: 'slide', attributes: { x: 4500, y: 7000, width: 1000, height: 1000 } },
          // Across, then down: they meet in the middle of the slide.
          first: {
            sid: 'first',
            stype: 'connector',
            parentId: 'slide',
            attributes: { startNodeId: 'a', endNodeId: 'b', kind: 'straight' }
          },
          second: {
            sid: 'second',
            stype: 'connector',
            parentId: 'slide',
            attributes: { startNodeId: 'c', endNodeId: 'd', kind: 'straight', ...over }
          }
        })[sid] as never
    }) as DeckAccess;

  it('gives the hop to the later line, and only to it', () => {
    const patch = createConnectorPass({ doc: crossing() })() as Record<string, any>;
    const env = { [SLIDES_ENV_KEY]: patch[SLIDES_ENV_KEY] };

    // Exactly one hop at one crossing: the line drawn on top carries it, which is what
    // makes it read as passing *over*.
    expect(jumpsFromEnv(env, 'second')).toHaveLength(1);
    expect(jumpsFromEnv(env, 'first')).toBeUndefined();
  });

  it('leaves a curve out of it', () => {
    // A hop cut into a Bézier is not one arc, so a curve crosses plainly rather than
    // wrongly.
    const patch = createConnectorPass({ doc: crossing({ kind: 'curve' }) })() as Record<string, any>;
    const env = { [SLIDES_ENV_KEY]: patch[SLIDES_ENV_KEY] };
    expect(jumpsFromEnv(env, 'second')).toBeUndefined();
    expect(jumpsFromEnv(env, 'first')).toBeUndefined();
  });

  it('reports nothing for lines that do not cross', () => {
    const apart: DeckAccess = {
      rootId: 'root',
      getNode: (sid: string) =>
        ({
          root: { sid: 'root', stype: 'document', content: ['slide'] },
          slide: { sid: 'slide', stype: 'surface', parentId: 'root', content: ['a', 'b', 'line'] },
          a: { sid: 'a', stype: 'rectangle', parentId: 'slide', attributes: { x: 0, y: 0, width: 1000, height: 1000 } },
          b: { sid: 'b', stype: 'rectangle', parentId: 'slide', attributes: { x: 6000, y: 0, width: 1000, height: 1000 } },
          line: {
            sid: 'line',
            stype: 'connector',
            parentId: 'slide',
            attributes: { startNodeId: 'a', endNodeId: 'b', kind: 'straight' }
          }
        })[sid] as never
    } as DeckAccess;

    const patch = createConnectorPass({ doc: apart })() as Record<string, any>;
    expect(patch[SLIDES_ENV_KEY].jumps.size).toBe(0);
  });
});
