import { Editor, Extension } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import { connectorBoxOf, connectorSpecOf, resolveEnds } from '@barocss/office-word';
import { childrenOf, type DeckAccess, type DeckNode } from './deck';
import { CANVAS_NAMES } from '@barocss/office-controls';

/**
 * Joining two shapes with a line that remembers the pair.
 *
 * Three halves, and the third is the one a reader never sees:
 *
 * - **`insertConnector`**, which joins what is selected. Two shapes, in the order they
 *   were picked, because a connector has a direction — the arrowhead is on the end.
 * - **`setConnector`**, which changes the route, the bow, the magnets and the ends.
 * - **A reaction**, because a connector that only followed its shapes until the next
 *   edit would be a line somebody drew once. Every document change resolves every
 *   connector's ends and writes back what differs.
 *
 * ## Why the reaction does not feed itself
 *
 * `connectorChanges` answers with **what differs**, so run against a document that
 * already agrees it returns nothing and there is nothing to commit. The same property
 * `layoutChildren` relies on, and the reason neither needs a flag saying "this change
 * was mine" — a flag has to be cleared, and a cleared flag is a race.
 *
 * ## Why the reaction is not only about movement
 *
 * It is also how an attachment is released. A shape that is deleted leaves the line
 * where it last was (`docs/specs/canvas-model.md` §8.2), and "where it last was" only
 * exists because this wrote it there while the shape was still alive.
 */
export class SlidesConnectorExtension implements Extension {
  name = 'slides-connectors';
  priority = 46;

  private _applying = false;

  onCreate(editor: Editor): void {
    (editor as any).registerCommand({
      name: 'insertConnector',
      execute: async (_ed: Editor, payload?: any) => await this._insert(editor, payload),
      canExecute: (_ed: Editor, payload?: any) => !!this._ends(editor, payload)
    });

    /**
     * A shape at the end of a line pulled into empty space.
     *
     * The gesture a flow chart is *made* of: drag out of a shape, let go, type. Every
     * tool a diagram reader knows does this — Miro, FigJam, draw.io — and the reason it
     * matters more than it looks is the arithmetic a reader does not have to do: no
     * placing, no sizing, no joining, and no hunting for the tool that joins.
     *
     * One command rather than two, because it is one gesture: a shape and the line to it
     * arrive together and **one undo** puts both back. Two commands would also mean a
     * moment where the shape exists and the line does not, which a reader watching the
     * canvas would see.
     */
    (editor as any).registerCommand({
      name: 'insertConnectedShape',
      execute: async (_ed: Editor, payload?: any) => await this._grow(editor, payload),
      canExecute: (_ed: Editor, payload?: any) => !!this._growFrom(editor, payload)
    });

    /**
     * Put a shape **into** a line: the drop that turns one relationship into two.
     *
     * The gesture a flow chart is edited with, after the one that draws it. A reader who
     * has `수집 → 저장` and needs a check in between drops the shape on the line, and every
     * diagram tool built for this — draw.io, Lucidchart, Miro — answers a drop on an edge
     * the same way: the edge splits and the shape is in the chain.
     *
     * Its own command rather than part of the drag, because it is one *edit* however it is
     * started: the drop, a menu, a keyboard. And one **transaction**, so the shape's new
     * place, the line that went and the two that replaced it are one press of undo — three
     * entries would mean a reader undoing a drop three times and watching a diagram
     * rebuild itself in stages.
     */
    (editor as any).registerCommand({
      name: 'spliceIntoConnector',
      execute: async (_ed: Editor, payload?: any) => await this._splice(editor, payload),
      canExecute: (_ed: Editor, payload?: any) => !!this._spliceable(editor, payload)
    });

    /**
     * Turn a line round.
     *
     * A connector is a *relationship*, and a relationship has a direction: the arrowhead
     * is on the end. Drawn the wrong way round — which happens whenever a reader picks the
     * two shapes in the order they were thinking rather than the order the arrow goes —
     * the only ways back were deleting the line and drawing it again, or dragging both
     * ends past each other. Every diagram tool has this as one command, and it is the
     * cheapest thing in this file.
     *
     * Everything about the ends swaps together — which shape, which magnet, the fraction
     * along another line, the frozen place, and the two caps — because a half-swapped line
     * is a line pointing at one shape and clipped to another.
     */
    (editor as any).registerCommand({
      name: 'reverseConnector',
      execute: async (_ed: Editor, payload?: any) => await this._reverse(editor, payload),
      canExecute: (_ed: Editor, payload?: any) => this._connectors(editor, payload).length > 0
    });

    (editor as any).registerCommand({
      name: 'setConnector',
      execute: async (_ed: Editor, payload?: any) => await this._set(editor, payload),
      canExecute: (_ed: Editor, payload?: any) =>
        this._connectors(editor, payload).length > 0 &&
        Object.keys(this._settingsOf(payload)).length > 0
    });

    // Every change, because the event says the document changed and not what in it —
    // and a shape moved, resized, rotated or deleted all reach a connector.
    (editor as any).on?.('editor:content.change', () => {
      void this._repair(editor);
    });
  }

  private _access(editor: Editor): DeckAccess | null {
    const store = (editor as any).dataStore;
    const rootId = (editor as any).getRootId?.();
    if (!store || !rootId) return null;
    return { rootId, getNode: (sid: string) => store.getNode(sid) } as DeckAccess;
  }

  /**
   * Something a line can be attached to.
   *
   * A shape, or — with a fraction along it — **another line**: a flowchart's branch off
   * the middle of a flow. Without the fraction a line is not a target, because there is
   * nothing to say *where* on it, and its box is mostly empty space.
   */
  private _joinable(doc: DeckAccess, sid: string | undefined, along?: unknown): boolean {
    if (!sid) return false;
    const node = doc.getNode(sid);
    if (!node || !CANVAS_NAMES[String(node.stype)]) return false;
    if (node.stype !== 'connector') return true;
    return typeof along === 'number' && Number.isFinite(along);
  }

  /**
   * What to join, in the order the reader gave it.
   *
   * A connector points from the first to the second, which is what makes it a
   * *relationship* rather than a line between two boxes — so the order matters, and
   * for a selection it is the order they were picked in rather than the document's.
   *
   * **One shape and a point** is the other half, and it is what dragging out of a
   * magnet produces: a line pulled into empty space is a line a reader will attach
   * later, and refusing it would mean the gesture could only ever end on a shape.
   */
  private _ends(
    editor: Editor,
    payload?: any
  ): { start: string; end?: string; endAt?: { x: number; y: number }; along?: number } | null {
    const doc = this._access(editor);
    if (!doc) return null;

    const start = typeof payload?.startNodeId === 'string' ? payload.startNodeId : undefined;
    const end = typeof payload?.endNodeId === 'string' ? payload.endNodeId : undefined;
    const at =
      typeof payload?.endX === 'number' && typeof payload?.endY === 'number'
        ? { x: Math.round(payload.endX), y: Math.round(payload.endY) }
        : undefined;

    const along = typeof payload?.endT === 'number' ? payload.endT : undefined;
    if (start && this._joinable(doc, start)) {
      if (end && this._joinable(doc, end, along) && end !== start) return { start, end, along };
      if (at) return { start, endAt: at };
      return null;
    }

    // Nothing named: the two shapes that are selected, which is the other gesture
    // every diagram tool offers.
    const selected: string[] = (editor as any).selection?.nodeIds ?? [];
    if (selected.length !== 2) return null;
    if (!this._joinable(doc, selected[0]) || !this._joinable(doc, selected[1])) return null;
    return { start: selected[0], end: selected[1] };
  }

  private async _insert(editor: Editor, payload?: any): Promise<boolean> {
    const ends0 = this._ends(editor, payload);
    const doc = this._access(editor);
    if (!ends0 || !doc) return false;

    // The slide the shapes are on. A connector between two slides is not a thing, and
    // the parent is where the line has to live for its coordinates to mean anything.
    // `parentId` is a fact the store keeps on the node rather than part of the deck's
    // own shape, which is why it is read through a cast here — see `boxOfMatch`.
    const parentOf = (sid: string) => (doc.getNode(sid) as { parentId?: string } | undefined)?.parentId;
    const parent = parentOf(ends0.start);
    if (!parent) return false;
    if (ends0.end && parentOf(ends0.end) !== parent) return false;

    const side = (value: unknown) =>
      typeof value === 'string' && ['auto', 'n', 'e', 's', 'w', 'c'].includes(value)
        ? value
        : 'auto';

    const child: DeckNode = {
      stype: 'connector',
      attributes: {
        startNodeId: ends0.start,
        ...(ends0.end ? { endNodeId: ends0.end } : {}),
        // How far along the *line* it holds, for an end attached to another connector.
        ...(ends0.along !== undefined ? { endT: Math.min(1, Math.max(0, ends0.along)) } : {}),
        /**
         * A free end's place, for the line dragged into empty space. Written here
         * because there is nothing to resolve it from: the reaction fills in an
         * attached end and has no answer for this one.
         */
        ...(ends0.endAt ? { endX: ends0.endAt.x, endY: ends0.endAt.y } : {}),
        startSide: side(payload?.startSide),
        endSide: side(payload?.endSide),
        kind: typeof payload?.kind === 'string' ? payload.kind : 'elbow',
        endCap: 'arrow',
        stroke: '#1f2937',
        strokeWidth: 15

      }
    };

    /**
     * The ends' places, written **now**.
     *
     * They are what a line falls back to when the shape it holds is gone, and nothing
     * else keeps them: there is no reaction rewriting them on every edit any more (see
     * `connector-pass.ts` for why that was the wrong mechanism). So they are written
     * where they are known — here, and again at the moment of a deletion.
     */
    const ends = resolveEnds(
      {
        start: { nodeId: ends0.start, x: 0, y: 0, side: 'auto' },
        end: ends0.end ? { nodeId: ends0.end, x: 0, y: 0, side: 'auto' } : { x: ends0.endAt?.x ?? 0, y: ends0.endAt?.y ?? 0, side: 'auto' },
        kind: 'elbow'
      },
      {
        start: connectorBoxOf(doc.getNode(ends0.start) as never),
        end: ends0.end ? connectorBoxOf(doc.getNode(ends0.end) as never) : undefined
      }
    );
    child.attributes = {
      ...child.attributes,
      startX: Math.round(ends.start.x),
      startY: Math.round(ends.start.y),
      endX: Math.round(ends.end.x),
      endY: Math.round(ends.end.y)
    };

    const result = await transaction(editor, [
      { type: 'addChild', payload: { parentId: parent, child } }
    ] as never).commit();
    if (!result.success) return false;

    // Select it, so the route and the ends can be changed straight away — the same
    // rule every insert here follows.
    const children = childrenOf(doc.getNode(parent));
    const made = children[children.length - 1];
    if (made) (editor as any).setNode?.({ nodeIds: [made] });
    return true;
  }

  /**
   * What a splice needs, or nothing.
   *
   * Refused in three cases, each of which would leave a diagram saying something the
   * reader did not mean:
   *
   * - **The shape is already an end of that line.** `a → b` with `b` dropped on it would
   *   become `a → b` and `b → b`, and a line from a shape to itself has no route.
   * - **The line has a free end.** There is no second relationship to make: half of what
   *   the reader can see is a point in space, not a shape.
   * - **They are not on the same surface.** A line's coordinates are its parent's, and a
   *   shape on another slide cannot be in this chain.
   */
  private _spliceable(
    editor: Editor,
    payload?: any
  ): { shape: string; line: string; parent: string; start: string; end: string } | null {
    const doc = this._access(editor);
    if (!doc) return null;

    const shape = typeof payload?.nodeId === 'string' ? payload.nodeId : undefined;
    const line = typeof payload?.connectorId === 'string' ? payload.connectorId : undefined;
    if (!shape || !line) return null;

    const node = doc.getNode(line);
    if (node?.stype !== 'connector') return null;
    // A shape, and one this product joins — not another line: a line spliced into a line
    // is a branch, which is `endT` and a different gesture (§8.6).
    const held = doc.getNode(shape);
    if (!held || held.stype === 'connector' || !this._joinable(doc, shape)) return null;

    const start = node.attributes?.startNodeId;
    const end = node.attributes?.endNodeId;
    if (typeof start !== 'string' || typeof end !== 'string') return null;
    if (start === shape || end === shape) return null;

    const parentOf = (sid: string) => (doc.getNode(sid) as { parentId?: string } | undefined)?.parentId;
    const parent = parentOf(line);
    if (!parent || parentOf(shape) !== parent) return null;

    return { shape, line, parent, start, end };
  }

  private async _splice(editor: Editor, payload?: any): Promise<boolean> {
    const asked = this._spliceable(editor, payload);
    const doc = this._access(editor);
    if (!asked || !doc) return false;

    const was = doc.getNode(asked.line);
    const attrs = (was?.attributes ?? {}) as Record<string, unknown>;

    /**
     * Everything about how the line *looks*, carried onto both halves.
     *
     * A reader who dashed a line green and then splices a shape into it has not asked for
     * one green dashed line and one default one. What is left behind is everything about
     * where it *went*: the ends, the bends the reader placed and the bow — a route through
     * a picture that no longer exists, which is the same rule the tidy follows (§9).
     */
    const look = [
      'kind',
      'stroke',
      'strokeWidth',
      // The attribute is `strokeDash`; naming it `dash` here quietly carried nothing,
      // which the test caught by asking for the value back.
      'strokeDash',
      'flow',
      'startCap',
      'endCap'
    ].reduce<Record<string, unknown>>((kept, key) => {
      if (attrs[key] !== undefined) kept[key] = attrs[key];
      return kept;
    }, {});

    const side = (value: unknown) =>
      typeof value === 'string' && ['auto', 'n', 'e', 's', 'w', 'c'].includes(value)
        ? value
        : 'auto';

    const half = (from: string, to: string, outer: 'start' | 'end'): DeckNode => ({
      stype: 'connector',
      attributes: {
        ...look,
        startNodeId: from,
        endNodeId: to,
        // The outer end keeps the magnet the reader chose; the new inner one is left to
        // `nearestSides`, because nobody has said anything about it yet.
        startSide: outer === 'start' ? side(attrs.startSide) : 'auto',
        endSide: outer === 'end' ? side(attrs.endSide) : 'auto',
        /**
         * The label goes on the **first** half.
         *
         * It named the relationship, and after a splice the first half is the one that
         * still starts where the relationship did. Copying it onto both would say it
         * twice, which no diagram means; dropping it would lose a word the reader typed.
         */
        ...(outer === 'start' && typeof attrs.label === 'string' && attrs.label.length > 0
          ? { label: attrs.label }
          : {})
      }
    });

    const at = doc.getNode(asked.parent);
    const order = childrenOf(at);
    const place = order.indexOf(asked.line);

    const steps: unknown[] = [];
    /**
     * The drop's own move, in this transaction.
     *
     * The gesture put the shape there, and a splice recorded apart from the move would
     * mean two presses of undo for one drop — the mistake `cropPicture` was written to
     * avoid, where a box and its crop are one gesture.
     */
    if (typeof payload?.x === 'number' && typeof payload?.y === 'number') {
      steps.push({
        type: 'setAttrs',
        payload: {
          nodeId: asked.shape,
          attrs: { x: Math.round(payload.x), y: Math.round(payload.y) }
        }
      });
    }

    // Removed first, so the two halves take its place in paint order rather than landing
    // on top of everything.
    steps.push({
      type: 'removeChild',
      payload: { parentId: asked.parent, childId: asked.line }
    });
    steps.push({
      type: 'addChild',
      payload: {
        parentId: asked.parent,
        ...(place >= 0 ? { position: place } : {}),
        child: half(asked.start, asked.shape, 'start')
      }
    });
    steps.push({
      type: 'addChild',
      payload: {
        parentId: asked.parent,
        ...(place >= 0 ? { position: place + 1 } : {}),
        child: half(asked.shape, asked.end, 'end')
      }
    });

    const result = await transaction(editor, steps as never).commit();
    if (!result.success) return false;

    // The shape stays selected: it is the thing the reader dropped, and the two lines are
    // the consequence.
    (editor as any).setNode?.({ nodeIds: [asked.shape] });
    return true;
  }

  /**
   * The shape a new one grows out of, and where the drop landed.
   *
   * A shape rather than a line: growing out of the middle of a line is a *branch*, and
   * that needs a fraction along it rather than a magnet — a different gesture with a
   * different answer, and one this refuses rather than guesses at.
   */
  private _growFrom(
    editor: Editor,
    payload?: any
  ): { from: string; at: { x: number; y: number } } | null {
    const doc = this._access(editor);
    if (!doc) return null;
    const from = typeof payload?.fromNodeId === 'string' ? payload.fromNodeId : undefined;
    if (!from || !this._joinable(doc, from)) return null;
    if (typeof payload?.x !== 'number' || typeof payload?.y !== 'number') return null;
    return { from, at: { x: Math.round(payload.x), y: Math.round(payload.y) } };
  }

  private async _grow(editor: Editor, payload?: any): Promise<boolean> {
    const asked = this._growFrom(editor, payload);
    const doc = this._access(editor);
    if (!asked || !doc) return false;

    const source = doc.getNode(asked.from);
    const parent = (source as { parentId?: string } | undefined)?.parentId;
    if (!source || !parent) return false;

    /**
     * The **same kind, size and look** as the shape it came from.
     *
     * Which is the whole reason this is worth a command. A flow chart is a page of boxes
     * that match; a reader who has to re-choose the size and the fill for every step is
     * doing the tool's work. Miro and FigJam both copy the source's style for exactly
     * this gesture.
     *
     * Its own text is not copied: a copy of the words would be a duplicate rather than
     * the next step.
     */
    const attrs = (source.attributes ?? {}) as Record<string, unknown>;
    const width = typeof attrs.width === 'number' ? Math.abs(attrs.width) : 2400;
    const height = typeof attrs.height === 'number' ? Math.abs(attrs.height) : 1200;
    const style: Record<string, unknown> = {};
    for (const key of ['fill', 'stroke', 'strokeWidth', 'cornerRadius', 'strokeDash', 'role'] as const) {
      if (attrs[key] !== undefined) style[key] = attrs[key];
    }

    const stype = typeof source.stype === 'string' ? source.stype : 'rectangle';
    /**
     * Centred on the drop, so the line ends where the reader let go.
     *
     * The connector then clips to whichever edge faces the source, which is why nothing
     * here has to work out a side.
     */
    const box = {
      x: Math.round(asked.at.x - width / 2),
      y: Math.round(asked.at.y - height / 2),
      width,
      height
    };

    /**
     * Named here, not read back after the commit.
     *
     * The line has to point at the shape, and the shape's sid does not exist until it is
     * added — so either this is two transactions (and two undos for one drag) or it
     * names the shape itself. `addChild` honours a `sid` a caller provides.
     */
    const store = (editor as any).dataStore;
    const madeSid: string = store.generateId();

    const shape: DeckNode = {
      sid: madeSid,
      stype,
      attributes: { ...box, ...style },
      // A text box with no paragraph has nowhere to put a caret — see `insertTextBox`.
      ...(stype === 'textFrame' || stype === 'sticky'
        ? {
            content: [
              { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '' }] }
            ]
          }
        : {})
    } as DeckNode;

    const line: DeckNode = {
      stype: 'connector',
      attributes: {
        startNodeId: asked.from,
        endNodeId: madeSid,
        startSide: typeof payload?.fromSide === 'string' ? payload.fromSide : 'auto',
        endSide: 'auto',
        kind: typeof payload?.kind === 'string' ? payload.kind : 'elbow',
        endCap: 'arrow',
        stroke: '#1f2937',
        strokeWidth: 15
      }
    };

    const result = await transaction(editor, [
      { type: 'addChild', payload: { parentId: parent, child: shape } },
      { type: 'addChild', payload: { parentId: parent, child: line } }
    ] as never).commit();
    if (!result.success) return false;

    /**
     * The **shape** is selected, not the line.
     *
     * A reader drags out in order to say what the next step is, and what they do next is
     * type. Selecting the line would put the caret nowhere and make them click the thing
     * they just made.
     */
    (editor as any).setNode?.({ nodeIds: [madeSid] });
    return true;
  }

  /** Only what the caller gave, so nothing else is overwritten. */
  /**
   * The ends, swapped.
   *
   * Written as pairs so nothing is forgotten: a line whose `startNodeId` and `endNodeId`
   * changed places but whose *sides* did not would leave the magnets crossed, and the
   * route would leave each shape on the far side from the one it is pointing at.
   *
   * `null` where the other end had nothing, because that is how the model takes an
   * attribute *off* a node — leaving a stale `endT` under a shape attachment is the fault
   * the blank-string convention used to hide.
   *
   * ## The caps do **not** swap, and that is the whole point
   *
   * Measured, because I had written the opposite: swapping the ends *and* the caps leaves
   * every arrowhead on the shape it was already on, and a reader watching sees **nothing
   * happen** — the drawn cap at a shape looks the same whether it is that line's start or
   * its end. What changed was invisible.
   *
   * A cap is notation attached to the *direction*: the arrow belongs at the end, UML's
   * diamond at the whole. Leaving the two cap attributes alone is what moves the drawn
   * caps to the other shapes, because the roles they name have moved. Which is what
   * "reverse the relationship" means, and it is the reason this command exists.
   */
  private async _reverse(editor: Editor, payload?: any): Promise<boolean> {
    const doc = this._access(editor);
    const chosen = this._connectors(editor, payload);
    if (!doc || chosen.length === 0) return false;

    const PAIRS: [string, string][] = [
      ['startNodeId', 'endNodeId'],
      ['startSide', 'endSide'],
      ['startT', 'endT'],
      ['startX', 'endX'],
      ['startY', 'endY']
    ];

    const steps = chosen.map((sid) => {
      const attrs = (doc.getNode(sid)?.attributes ?? {}) as Record<string, unknown>;
      const swapped: Record<string, unknown> = {};
      for (const [from, to] of PAIRS) {
        swapped[from] = attrs[to] ?? null;
        swapped[to] = attrs[from] ?? null;
      }
      /**
       * The bends the reader placed, read backwards.
       *
       * A waypoint list is walked from the start, so a reversed line with the same list
       * would go through them in the wrong order — visibly a different route, on a line
       * the reader only asked to turn round. The bow is mirrored for the same reason: it
       * is measured across the line from start to end, and that direction has changed.
       */
      const through = attrs.waypoints;
      if (Array.isArray(through) && through.length > 1) swapped.waypoints = [...through].reverse();
      if (typeof attrs.bend === 'number' && attrs.bend !== 0) swapped.bend = -attrs.bend;


      return { type: 'setAttrs', payload: { nodeId: sid, attrs: swapped } };
    });

    return (await transaction(editor, steps as never).commit()).success;
  }

  private _settingsOf(payload: any): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of ['kind', 'startSide', 'endSide', 'startCap', 'endCap', 'stroke', 'strokeDash'] as const) {
      if (typeof payload?.[key] === 'string' && payload[key].length > 0) out[key] = payload[key];
    }
    /**
     * The word on the line, which may be **emptied**.
     *
     * So it is taken whenever it is a string, unlike the values above: a reader who
     * clears the field means "no label", and treating an empty string as "no change"
     * would make the label impossible to remove.
     */
    if (typeof payload?.label === 'string') out.label = payload.label.trim();
    // The two words that belong to the ends, emptied the same way: a reader who clears the
    // field means "no multiplicity", not "no change".
    if (typeof payload?.startLabel === 'string') out.startLabel = payload.startLabel.trim();
    if (typeof payload?.endLabel === 'string') out.endLabel = payload.endLabel.trim();

    /**
     * How the label is *set*: its size, its colour, and whether it is bold.
     *
     * A diagram's words carry weight the line cannot — a red 실패 on the path nobody wants,
     * a bold 필수 on the one they must take — and the reference implementation had these
     * three where we had a constant.
     *
     * `null` clears the colour, because a reader who takes a colour off means the default
     * rather than an empty string (the model's rule for absence). The size is twips like
     * every other length; the panel does the points.
     */
    if (typeof payload?.labelSize === 'number' && Number.isFinite(payload.labelSize)) {
      out.labelSize = Math.round(payload.labelSize);
    }
    if (typeof payload?.labelColor === 'string' && payload.labelColor.length > 0) {
      out.labelColor = payload.labelColor;
    }
    if (payload?.labelColor === null) out.labelColor = null;
    if (typeof payload?.labelBold === 'boolean') out.labelBold = payload.labelBold;
    // Whether the line flows, which is a fact about the line rather than about its ends.
    if (typeof payload?.flow === 'boolean') out.flow = payload.flow;
    /**
     * The points a reader has told the line to go through.
     *
     * Taken whole rather than merged: a reader dragging a bend, adding one or taking one
     * away is describing the **list**, and a command that merged would have to be told
     * which of "moved", "added" and "removed" it was looking at — three commands wearing
     * one name. An empty list is a line with no bends, which is why `[]` is a value here
     * and not "no change".
     */
    if (Array.isArray(payload?.waypoints)) {
      out.waypoints = payload.waypoints
        .filter(
          (point: unknown): point is { x: number; y: number } =>
            !!point &&
            typeof point === 'object' &&
            Number.isFinite((point as { x?: unknown }).x) &&
            Number.isFinite((point as { y?: unknown }).y)
        )
        .map((point: { x: number; y: number }) => ({
          x: Math.round(point.x),
          y: Math.round(point.y)
        }));
    } else if (payload?.waypoints === null) {
      out.waypoints = null;
    }
    for (const key of ['bend', 'strokeWidth'] as const) {
      const value = payload?.[key];
      if (typeof value === 'number' && Number.isFinite(value)) out[key] = Math.round(value);
    }
    /**
     * The ends themselves, which is how a reader re-attaches a line: dragging an end
     * onto another shape. `null` releases it, and releasing has to be possible — a
     * line stuck to a shape forever is a line a reader deletes and redraws.
     *
     * Passed **through** as `null`, which removes the attribute (`setAttrs`). It was
     * `''` here, and a blank is not a value: it would make every reader of
     * `startNodeId` learn that an empty string is this product's word for "holds
     * nothing", when the schema already has one — the attribute is not there.
     */
    for (const key of ['startNodeId', 'endNodeId'] as const) {
      if (payload?.[key] === null) out[key] = null;
      else if (typeof payload?.[key] === 'string' && payload[key].length > 0) {
        out[key] = payload[key];
      }
    }
    /**
     * The fraction along a held line — set, and **cleared** with `null`.
     *
     * This was the case that found the hole: `0` is a real place on a line, the
     * attribute is a number, and the `''` that used to empty a string is refused by the
     * schema — so `setConnector` returned false and an end moved off a line went
     * nowhere at all. Working around it (leaving the stale fraction, since it only
     * means anything beside a connector) was the wrong answer: the model could not say
     * "not set" about a number, and that is a gap in the model rather than a fact to
     * design around. `setAttrs` removes on `null` now, for every type.
     */
    for (const key of ['startT', 'endT'] as const) {
      if (payload?.[key] === null) out[key] = null;
      else if (typeof payload?.[key] === 'number' && Number.isFinite(payload[key])) {
        out[key] = Math.min(1, Math.max(0, payload[key]));
      }
    }
    for (const key of ['startX', 'startY', 'endX', 'endY'] as const) {
      const value = payload?.[key];
      if (typeof value === 'number' && Number.isFinite(value)) out[key] = Math.round(value);
    }
    return out;
  }

  private _connectors(editor: Editor, payload?: any): string[] {
    const doc = this._access(editor);
    if (!doc) return [];
    const asked: string[] = payload?.nodeIds ?? (payload?.nodeId ? [payload.nodeId] : null) ??
      ((editor as any).selection?.nodeIds ?? []);
    return asked.filter((sid) => doc.getNode(sid)?.stype === 'connector');
  }

  private async _set(editor: Editor, payload?: any): Promise<boolean> {
    const settings = this._settingsOf(payload);
    const targets = this._connectors(editor, payload);
    if (targets.length === 0 || Object.keys(settings).length === 0) return false;

    const steps = targets.map((sid) => ({
      type: 'setAttrs',
      payload: { nodeId: sid, attrs: settings }
    }));
    return (await transaction(editor, steps as never).commit()).success;
  }

  /**
   * The node, if it is still **in the document**.
   *
   * Not `getNode`, which is not the same question: deleting a shape takes it out of its
   * parent's content and leaves it addressable by sid, so a connector asking "does this
   * exist" was told yes about a shape that had been deleted — and never let go of it.
   * Found by a browser test that deleted a shape and watched the attachment survive.
   *
   * A node in the document has a parent; the root is the only one that does not.
   */
  private _inDocument(doc: DeckAccess, sid: string): DeckNode | undefined {
    const node = doc.getNode(sid);
    if (!node) return undefined;
    if (sid === doc.rootId) return node;
    const parent = (node as { parentId?: string }).parentId;
    return typeof parent === 'string' && parent.length > 0 ? node : undefined;
  }

  /**
   * Every connector, checked for a hold that has gone.
   *
   * ## What this used to do, and why it stopped
   *
   * It wrote the ends' places on **every** document change, so a line followed its
   * shapes. That was the wrong mechanism twice over. The route is derived from nodes that
   * are not the connector's own, and the engine's answer for that is a layout pass
   * (`connector-pass.ts`) — writing the document was only causing the redraw *by
   * accident*, because changing the node is what makes the view draw it again. And the
   * writes cost: an entry in the history for every drag, and, on a board two people
   * share, four numbers of traffic and four chances to conflict per line per drag.
   *
   * ## What is left is the part nothing else can do
   *
   * A hold whose shape is gone. The delete command freezes and releases in its own
   * transaction (`connectorFreezeSteps`), which covers what a reader does here — this
   * catches the rest: a document that arrives with a dangling reference, a shape removed
   * by another product's command, or a peer's deletion in a shared deck.
   */
  private async _repair(editor: Editor): Promise<void> {
    if (this._applying) return;
    const doc = this._access(editor);
    if (!doc) return;

    const steps: { type: string; payload: Record<string, unknown> }[] = [];
    const seen = new Set<string>();

    const walk = (sid: string, depth: number) => {
      if (depth > 32 || seen.has(sid)) return;
      seen.add(sid);
      const node = doc.getNode(sid);
      if (!node) return;

      if (node.stype === 'connector') {
        /**
         * Only the holds, and only the ones that are gone.
         *
         * The *places* are not rewritten here any more: they are written when the line is
         * made and again when a shape it holds is deleted, which are the two moments they
         * matter. Rewriting them on every edit is what put an entry in the history for
         * every drag — and what a shared board would pay for on every drag of every
         * shape.
         */
        const spec = connectorSpecOf(node as never);
        const attrs: Record<string, unknown> = {};
        for (const which of ['start', 'end'] as const) {
          const held = spec[which].nodeId;
          if (held && !this._inDocument(doc, held)) attrs[`${which}NodeId`] = null;
        }
        if (Object.keys(attrs).length > 0) {
          steps.push({ type: 'setAttrs', payload: { nodeId: sid, attrs } });
        }
      }

      for (const child of childrenOf(node)) walk(child, depth + 1);
    };

    walk(doc.rootId, 0);
    if (steps.length === 0) return;

    this._applying = true;
    try {
      /**
       * Not recorded: this is derived state, not an edit.
       *
       * Every drag used to put two entries in the history — the reader's move and this —
       * so undo undid *this*, and this ran again and wrote the same numbers back. The
       * reader could not undo their own move at all. Nothing is lost by leaving it out:
       * an undo is a document change, so this runs afterwards and works the ends out
       * again from what the document now says.
       */
      await transaction(editor, steps as never, { recordInHistory: false }).commit();
    } finally {
      this._applying = false;
    }
  }
}

/** The connector commands, as an extension a kit can install. */
export function createConnectorCommands(): SlidesConnectorExtension {
  return new SlidesConnectorExtension();
}
