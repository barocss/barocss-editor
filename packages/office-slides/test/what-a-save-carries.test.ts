import { describe, expect, it } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { attributeReadFrom } from '@barocss/conformance';
import { getGlobalRegistry } from '@barocss/dsl';
import type { Editor } from '@barocss/editor-core';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import { registerSlidesRenderers } from '../src/renderers';
import { SCENE_TYPES } from '../src/selection';
import { SLIDES_PANEL, slidesPanelAttrs, slidesPanelRows } from '../src/panel-model';
import { deckFileText, readDeckFile } from '../src/deck-file';

/**
 * **What a save actually carries**, asked of every attribute the panel offers.
 *
 * ## The question, and why the two checks either side of it cannot ask it
 *
 * `every-attribute-is-read` walks the **schema** and asks whether a renderer reads each attribute.
 * `every-property-can-be-edited` walks the **schema** and asks whether a surface can set each one.
 * Both start from the schema, so both are blind in exactly one direction: an attribute the product
 * *draws* and the schema does not *declare* is not a subject of either check. It is not a finding;
 * it is not even a question. Two green checks, and the attribute is nowhere.
 *
 * `ROADMAP.md` had been carrying the consequence as prose — *"no gradient, no shadow, no blur, no
 * dashes, no per-corner radius, no image crop"* — while all six were on the panel. Correcting that
 * sentence is what turned up the real fault underneath it, which is this one and is narrower: **on
 * which node types is a drawn attribute declared?**
 *
 * ## The three answers, and why the third is the one that matters
 *
 * For every box a reader can hold and every attribute the deck's panel can set:
 *
 * 1. does the **schema** declare it there;
 * 2. does the **renderer** read it there;
 * 3. does a value set the way a reader sets it **survive a save and a load**.
 *
 * The third is not a restatement of the first two. It is the only one that goes through the layers
 * that transport the work — `setBoxStyle` filters the payload through `_declaredAttrs`, so an
 * attribute the schema does not declare on a node type is **dropped without a word**; and the file
 * is written and read by `deck-file.ts`, which is ours. So a reader can watch the product draw
 * something the panel cannot set and the file cannot carry, and nothing anywhere says so.
 *
 * Measured before the fix: **11 undeclared, 12 unreachable, 11 lost in a save** — every one of
 * them on `picture`, and the twelfth is `picture.fill`, which the schema *did* declare and which
 * had no control either, because the row that writes it is the paint stack the schema was hiding.
 * `paintCss` and `fillElements` are
 * called by the picture's renderer exactly as they are by the rectangle's — the comment in
 * `paint.ts` says so out loud, *"a text frame, a frame, a sticky and a picture — every other box a
 * reader rounds"* — and `slides-schema.ts` widened the picture with the corners, the crop and the
 * flip and not with `DECK_STYLE_ATTRS`. So a photograph on a slide **drew** a drop shadow, a
 * gradient wash and a dashed border, and there was no way to give it one: the panel's 채우기 and 효과
 * rows ask the schema before they draw, and the schema said no.
 *
 * ## Why the subjects come from the drawing and not from the panel
 *
 * Because the panel is schema-driven — `panelRowsFor` calls `declares(stype, attr)` — so a schema
 * gap makes the row *disappear*, and a check that enumerated the panel's rows would agree with the
 * schema by construction and find nothing. What cannot be argued with is the **drawing**: the
 * renderer read the attribute, so a document may say it, so the schema has to declare it and the
 * file has to carry it.
 */
describe('what a save carries, for every attribute the panel offers', () => {
  registerSlidesRenderers();

  const schema = () => createSchema('slides', getSlidesSchemaDefinition());
  const model = schema();
  const registry = getGlobalRegistry();

  const shapeOn = (stype: string, attr: string): Record<string, unknown> | undefined =>
    (model.getNodeType(stype)?.attrs as Record<string, Record<string, unknown>> | undefined)?.[attr];

  /** The declaration wherever it exists, so a value can be built for a slot that has none here. */
  const anyShape = new Map<string, Record<string, unknown>>();
  for (const [, node] of model.nodes as never as Map<string, { attrs?: Record<string, Record<string, unknown>> }>) {
    for (const [attr, shape] of Object.entries(node.attrs ?? {})) if (!anyShape.has(attr)) anyShape.set(attr, shape);
  }

  const ATTRS = slidesPanelAttrs();

  /**
   * What a value of an attribute looks like, where its type cannot say.
   *
   * The same list `conformance.test.ts` hands the probe, for the same reason: `readPaint`,
   * `readEffect` and `varBindsOf` all refuse anything else, and a refused value draws the same as
   * an absent one — which would report a working mechanism as unread.
   */
  const LISTS: Record<string, unknown[]> = {
    fills: [{ kind: 'linear', angle: 45, opacity: 1, visible: true, stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] }],
    effects: [{ kind: 'drop', x: 30, y: 90, blur: 240, spread: 15, color: 'rgba(0,0,0,0.4)', visible: true }],
    varBinds: [{ attr: 'fill', var: '강조' }],
    waypoints: [{ x: 1200, y: 900 }]
  };

  /**
   * Whether the deck's own drawing reads an attribute on a node type — the probe the conformance
   * suite uses, asked about attributes the schema may not declare.
   *
   * `attributeReadFrom` builds its probe value out of the attribute's *shape*, so it is handed the
   * declaration from wherever one exists rather than only from the node under the question. That is
   * the whole point: the check is about slots the schema is **missing**, and a missing slot has no
   * shape on the node to read.
   */
  const draws = attributeReadFrom(
    registry as never,
    (stype: string) => {
      const own = { ...((model.getNodeType(stype)?.attrs ?? {}) as Record<string, unknown>) };
      for (const attr of ATTRS) if (!own[attr]) own[attr] = anyShape.get(attr) ?? { type: 'string' };
      return own as never;
    },
    {},
    (_stype: string, attr: string) => (attr in LISTS ? [LISTS[attr]] : undefined)
  );

  /**
   * Every pair the product actually draws: a box a reader can hold, and an attribute the panel can
   * set, where setting it changes the drawing.
   */
  const drawn: { stype: string; attr: string }[] = [];
  for (const stype of SCENE_TYPES) {
    for (const attr of ATTRS) if (draws(stype, attr) === true) drawn.push({ stype, attr });
  }

  /**
   * The row that writes an attribute — its own, or the one that writes it without naming it.
   *
   * `slidesPanelAttrs` already knows the second list (a destination picker writes three attributes,
   * a paint stack writes five), and this is the same table read the other way round: which control
   * a reader would actually touch to set this value.
   */
  const CARRIED_BY: Record<string, string> = {
    goToKind: 'goTo',
    goToDeck: 'goTo',
    fill: 'fills',
    gradientFrom: 'fills',
    gradientTo: 'fills',
    gradientAngle: 'fills',
    gradientKind: 'fills',
    shadowColor: 'effects',
    shadowBlur: 'effects',
    shadowAngle: 'effects',
    shadowDistance: 'effects',
    cropRight: 'cropTop',
    cropBottom: 'cropTop',
    cropLeft: 'cropTop',
    paddingTop: 'padding',
    paddingRight: 'padding',
    paddingBottom: 'padding',
    paddingLeft: 'padding',
    labelColor: 'labelSize',
    labelBold: 'labelSize'
  };

  /** Every row, the four that hang off another row included — `with` is a row, not a decoration. */
  const ROWS = SLIDES_PANEL.flatMap((row) => [row, ...((row.with ?? []) as typeof SLIDES_PANEL)]);
  const commandFor = (attr: string): string | undefined =>
    ROWS.find((row) => row.attr === (CARRIED_BY[attr] ?? attr))?.command;

  /**
   * Whether the panel offers a route to this attribute on this node type.
   *
   * Through `slidesPanelRows` with the real schema, which is what the app draws with — so this is
   * the question the reader's screen answers, not a restatement of the declaration.
   */
  const declares = (stype: string, attr: string) => !!shapeOn(stype, attr);
  const offered = (stype: string, attr: string): boolean => {
    const owner = CARRIED_BY[attr] ?? attr;
    return (['style', 'motion'] as const).some((tab) =>
      slidesPanelRows(stype, tab, declares).some((row) => row.attr === owner)
    );
  };

  /**
   * The value a reader's panel would produce, out of the attribute's own declaration.
   *
   * Derived rather than written down, so an attribute that changes its type or its options cannot
   * leave a stale literal behind here — the fault this whole file is about, one layer up.
   */
  const valueFor = (stype: string, attr: string): unknown => {
    if (attr in LISTS) return LISTS[attr];
    /*
     * **This node type's** declaration first. `kind` is a connector's route and a surface's half of
     * `block+ | scene*`, with a different set of options each — a value taken from whichever
     * declaration the schema happened to list first was refused by the command, and the check
     * reported the product as losing a value it had never been given.
     */
    const shape = (shapeOn(stype, attr) ?? anyShape.get(attr) ?? { type: 'string' }) as {
      type?: string;
      default?: unknown;
      options?: unknown[];
      min?: number;
      max?: number;
    };
    if (Array.isArray(shape.options) && shape.options.length > 0) {
      return shape.options[shape.options.length - 1];
    }
    switch (shape.type) {
      case 'boolean':
        return shape.default !== true;
      case 'number': {
        // Inside whatever range the attribute declares, and never the value it already has.
        const min = typeof shape.min === 'number' ? shape.min : 0;
        const max = typeof shape.max === 'number' ? shape.max : 4800;
        const wanted = min + (max - min) / 2;
        return wanted === shape.default ? min + (max - min) / 4 : wanted;
      }
      default:
        // A colour where the name says colour, and a word everywhere else. Both are strings to the
        // command; the difference only matters to a person reading a failure.
        return /colou?r|fill|stroke$|^gradientFrom$|^gradientTo$/i.test(attr) ? '#3366ff' : 'x';
    }
  };

  /**
   * What the command is asked, for the attributes whose payload key is not the attribute's name.
   *
   * Five, over two commands, and each because the control is a **gesture** rather than a field: a
   * reader picks a destination and `setBoxJump` works out whether that was a page, a named place or
   * another deck; a child says it fills its frame and `setBoxLayout` writes the two attributes that
   * means. Written out because a guess from the attribute name is what this file exists to refuse.
   *
   * For these the round trip is checked against **what the command actually wrote** rather than
   * against the value handed in — the command's whole job here is to work out what the gesture
   * meant, so the value asked for is not the value expected. What is still asserted is that it
   * wrote something, and that a save and a load gave it back.
   */
  const PAYLOAD: Record<string, Record<string, unknown>> = {
    goTo: { deck: 'other.slides', to: 'page-1' },
    goToDeck: { deck: 'other.slides', to: 'page-1' },
    goToKind: { kind: 'next' },
    layoutStretch: { stretch: true },
    layoutGrow: { grow: 2 }
  };

  /**
   * The two rows whose control writes no value of its own.
   *
   * 지우기 takes every bend out of a line and 뒤집기 swaps its ends — both write an attribute, which
   * is why they are rows, and neither is a value a reader types. There is nothing for a round trip
   * to carry that the gesture did not compute, so they are named here rather than left to fail as
   * if the transport had lost them.
   */
  const GESTURES = ['waypoints', 'startNodeId'];

  const paragraph = { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '가' }] };

  /** One of each box, with the least a document needs for it to be a legal one. */
  const SEED: Record<string, { attributes: Record<string, unknown>; content?: unknown[] }> = {
    frame: { attributes: { x: 600, y: 600, width: 4800, height: 2700 }, content: [] },
    group: { attributes: { x: 600, y: 600, width: 4800, height: 2700 }, content: [] },
    rectangle: { attributes: { x: 600, y: 600, width: 4800, height: 2700 } },
    ellipse: { attributes: { x: 600, y: 600, width: 4800, height: 2700 } },
    line: { attributes: { x: 600, y: 600, width: 4800, height: 2700 } },
    path: { attributes: { x: 600, y: 600, width: 4800, height: 2700, d: 'M0 0 L100 100' } },
    picture: { attributes: { x: 600, y: 600, width: 4800, height: 2700, src: 'a.png' } },
    sticky: { attributes: { x: 600, y: 600, width: 4800, height: 2700 }, content: [paragraph] },
    textFrame: { attributes: { x: 600, y: 600, width: 4800, height: 2700 }, content: [paragraph] },
    instance: { attributes: { x: 600, y: 600, width: 4800, height: 2700, componentId: 'card' }, content: [] },
    connector: { attributes: {} },
    mediaVideo: { attributes: { x: 600, y: 600, width: 4800, height: 2700, src: 'a.mp4' } },
    mediaAudio: { attributes: { x: 600, y: 600, width: 4800, height: 2700, src: 'a.mp3' } }
  };

  const deckWith = (stype: string) => ({
    stype: 'document',
    attributes: {},
    content: [
      { stype: 'surface', attributes: { kind: 'slide', id: 'page-1', name: 'One' }, content: [{ stype, ...SEED[stype] }] }
    ]
  });

  const open = (tree: unknown, session: string) => {
    const store = new DataStore(undefined, schema());
    const editor: Editor = createSlidesEditor({ editable: true, schema: schema(), dataStore: store });
    editor.loadDocument(tree as never, session);
    return { store, editor };
  };

  /**
   * `editor.getRootId()` 를 캐스트로 걷어내지 않는다 — 그 메서드는 `Editor` 에 있고,
   * `string | undefined` 를 돌려주는 것도 사실이다. 캐스트는 그 사실을 지우는 것이지 답하는 것이
   * 아니다. `editor-is-typed` 톱니가 이것을 세고, 이 파일이 처음 쓰였을 때 357 을 359 로 만들었다.
   */
  const boxIn = (store: DataStore, editor: Editor): string => {
    const root = editor.getRootId();
    if (!root) throw new Error('덱에 뿌리가 없습니다 — 이 검사의 픽스처가 안 열렸습니다');
    const slide = (store.getNode(root) as { content: string[] }).content[0];
    return (store.getNode(slide) as { content: string[] }).content[0];
  };

  /**
   * Set it the way a reader sets it, save the deck, open it in a session that shares no sid with
   * the one that wrote it, and say what came back.
   */
  const roundTrip = async (
    stype: string,
    attr: string
  ): Promise<{ set: unknown; reopened: unknown }> => {
    const command = commandFor(attr);
    const { store, editor } = open(deckWith(stype), 'writing');
    const box = boxIn(store, editor);
    const value = valueFor(stype, attr);

    await editor.executeCommand(command as string, {
      nodeIds: [box],
      nodeId: box,
      ...(PAYLOAD[attr] ?? { [attr]: value })
    });
    const set = (store.getNode(box) as never as { attributes?: Record<string, unknown> })?.attributes?.[attr];

    const read = readDeckFile(deckFileText(editor.exportDocument()));
    const reopened = open((read as { document: unknown }).document, 'reopened');
    const there = boxIn(reopened.store, reopened.editor);
    const back = (reopened.store.getNode(there) as never as {
      attributes?: Record<string, unknown>;
    })?.attributes?.[attr];

    /*
     * A different sid, which is the proof that this is a **second** session rather than the first
     * one read twice. Sids are stripped on the way out and minted again on the way in, so a round
     * trip that produced the same one would mean the file had never been through `deck-file.ts` —
     * and every assertion below it would be checking the store against itself.
     */
    expect(there).not.toBe(box);

    return { set, reopened: back };
  };

  it('draws nothing the schema has not declared where it is drawn', () => {
    const missing = drawn
      .filter(({ stype, attr }) => !declares(stype, attr))
      .map(({ stype, attr }) => `${stype}.${attr}`);

    expect(
      missing,
      `the deck's renderer reads these and the schema declares none of them, so a document may ` +
        `carry a value nothing validates, no panel row can reach and no command will write`
    ).toEqual([]);
  });

  it('offers a reader a way to set everything it draws', () => {
    const unreachable = drawn
      .filter(({ stype, attr }) => !offered(stype, attr))
      .map(({ stype, attr }) => `${stype}.${attr}`);

    expect(unreachable, 'drawn on the slide, and no row of the panel reaches it there').toEqual([]);
  });

  it('carries every drawn attribute through a save and a load', async () => {
    const lost: string[] = [];

    for (const { stype, attr } of drawn) {
      if (GESTURES.includes(attr)) continue;
      const command = commandFor(attr);
      if (!command) {
        lost.push(`${stype}.${attr}: no panel row names a command`);
        continue;
      }

      const { set, reopened } = await roundTrip(stype, attr);
      const wanted = PAYLOAD[attr] ? set : valueFor(stype, attr);

      if (set === undefined) {
        lost.push(`${stype}.${attr}: \`${command}\` wrote nothing — the value never reached the document`);
        continue;
      }
      if (JSON.stringify(reopened) !== JSON.stringify(wanted)) {
        lost.push(`${stype}.${attr}: set ${JSON.stringify(set)}, reopened as ${JSON.stringify(reopened)}`);
      }
    }

    expect(lost, 'a reader set it, the deck was saved, and this is what came back').toEqual([]);
  });

  /**
   * The measurement itself, kept as an assertion so the subject count cannot quietly fall to zero.
   *
   * A check with no subjects passes, which is the failure this repository's harness is named after
   * — `conformance.test.ts` counts `examined` for the same reason.
   */
  it('asked about every box the deck draws', () => {
    expect(new Set(drawn.map((one) => one.stype)).size, 'box types with a drawn attribute').toBe(
      SCENE_TYPES.length
    );
    expect(drawn.length, `pairs examined: ${drawn.length}`).toBeGreaterThan(150);
  });
});
