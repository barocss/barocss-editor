import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import type { Editor } from '@barocss/editor-core';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import { childrenOf, type DeckAccess } from '../src/deck';
import {
  componentApplyPlan,
  componentStale,
  deckComponents,
  placementFills,
  instanceState,
  instanceVars
} from '../src/components';

/**
 * Making a component, placing one, and taking a definition's changes.
 *
 * The model was tested first and on its own (`components.test.ts`, `sample-components.test.ts`)
 * because that is where the arithmetic is. What is left for a command is the thing a model
 * cannot answer: **what the document looks like afterwards**, and whether one press of undo
 * takes the whole thing back. Both of those have been the fault in this repository more than
 * once — a group fitter whose re-origin was unrecorded, so three undos changed nothing.
 */
describe('the component commands', () => {
  let editor: Editor;
  let store: DataStore;
  let slide: string;
  let doc: DeckAccess;

  const run = async (command: string, payload?: unknown) =>
    await (editor as any).executeCommand(command, payload);

  const boxes = () => childrenOf(doc.getNode(slide));
  const select = (...sids: string[]) => (editor as any).setNode?.({ nodeIds: sids });

  beforeEach(async () => {
    const schema = createSchema('slides', getSlidesSchemaDefinition());
    store = new DataStore(undefined, schema);
    editor = createSlidesEditor({ editable: true, schema, dataStore: store });
    editor.loadDocument(
      {
        stype: 'document',
        attributes: {},
        content: [
          {
            stype: 'surface',
            attributes: { kind: 'slide' },
            content: [
              {
                stype: 'rectangle',
                attributes: { x: 2000, y: 1000, width: 3000, height: 2000, fill: '#2563eb' }
              },
              {
                stype: 'textFrame',
                attributes: { role: 'title', x: 2400, y: 1200, width: 2200, height: 800 },
                content: [
                  { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '지표' }] }
                ]
              }
            ]
          }
        ]
      } as never,
      'slides'
    );
    doc = {
      rootId: (editor as never as { getRootId: () => string }).getRootId(),
      getNode: (sid: string) => store.getNode(sid) as never
    };
    slide = childrenOf(doc.getNode(doc.rootId))[0];
  });

  describe('making one out of a selection', () => {
    it('refuses when nothing is selected, because there is nothing to make it of', () => {
      expect((editor as any).canExecuteCommand('createComponent', {})).toBe(false);
    });

    it('puts the definition in the library and a placement on the slide', async () => {
      select(...boxes());
      expect(await run('createComponent', { name: '카드', id: 'card' })).toBe(true);

      const [definition] = deckComponents(doc);
      expect(definition?.id).toBe('card');
      expect(definition?.name).toBe('카드');
      // Its parts have durable names derived from what they are, so a person reading the file
      // can tell them apart — a counter would be honest and unreadable.
      expect(definition.parts.map((sid) => doc.getNode(sid)?.attributes?.partId)).toEqual([
        'rectangle',
        'title'
      ]);

      /*
       * And the reader's boxes are *gone from the slide*: what is there is a placement. Two
       * things that look identical and behave differently is the fault of every tool where
       * "create component" leaves the original behind.
       */
      expect(boxes()).toHaveLength(1);
      const placement = doc.getNode(boxes()[0]);
      expect(placement?.stype).toBe('instance');
      expect(placement?.attributes?.componentId).toBe('card');
      // At the selection's own corner, and the parts rebased to it: a definition is a card at
      // 0,0 rather than a card that remembers it was once on slide four.
      expect(placement?.attributes?.x).toBe(2000);
      expect(placement?.attributes?.y).toBe(1000);
      expect(doc.getNode(definition.parts[0])?.attributes?.x).toBe(0);
      expect(doc.getNode(childrenOf(placement)[1])?.attributes?.x).toBe(400);
    });

    it('takes it all back in one press of undo', async () => {
      select(...boxes());
      await run('createComponent', { name: '카드', id: 'card' });
      await (editor as any).undo();

      // The library, the definition and the placement all go; the reader's two boxes come back.
      expect(deckComponents(doc)).toEqual([]);
      expect(boxes()).toHaveLength(2);
      expect(doc.getNode(boxes()[0])?.stype).toBe('rectangle');
    });

    it('does not hand out an id another definition is using', async () => {
      select(...boxes());
      await run('createComponent', { id: 'card' });
      select(boxes()[0]);
      await run('createComponent', { id: 'card' });
      expect(deckComponents(doc).map((one) => one.id)).toEqual(['card', 'card-2']);
    });
  });

  describe('placing one', () => {
    beforeEach(async () => {
      select(...boxes());
      await run('createComponent', { name: '카드', id: 'card' });
    });

    it('refuses a definition the deck does not have', () => {
      expect((editor as any).canExecuteCommand('placeComponent', { componentId: 'nope' })).toBe(false);
    });

    it('holds a copy of every part, paired to the definition', async () => {
      expect(await run('placeComponent', { componentId: 'card', slideId: slide, x: 8000, y: 3000 })).toBe(true);

      const placed = doc.getNode(boxes()[1]);
      expect(placed?.attributes?.x).toBe(8000);
      expect(instanceState(doc, placed, deckComponents(doc)[0]).map((part) => part.origin)).toEqual([
        'rectangle',
        'title'
      ]);
      /*
       * And it records what the definition said, so staleness can be asked later. A signature
       * rather than a version number: a number would have to be maintained by a write on every
       * edit of the definition.
       */
      expect(typeof placed?.attributes?.appliedFrom).toBe('string');
      expect(componentStale(doc, placed, deckComponents(doc)[0])).toBe(false);
    });
  });

  describe('taking what the definition now says', () => {
    let placement: string;

    beforeEach(async () => {
      select(...boxes());
      await run('createComponent', { name: '카드', id: 'card' });
      await run('placeComponent', { componentId: 'card', slideId: slide, x: 8000, y: 3000 });
      placement = boxes()[1];
    });

    it('is offered only once the definition has moved on', async () => {
      const definition = deckComponents(doc)[0];
      expect(componentStale(doc, doc.getNode(placement), definition)).toBe(false);

      await run('setBoxStyle', { nodeIds: [definition.parts[0]], fill: '#ef4444' });
      expect(componentStale(doc, doc.getNode(placement), deckComponents(doc)[0])).toBe(true);
    });

    it('rewrites the parts the reader had not touched, and records what it took', async () => {
      const definition = deckComponents(doc)[0];
      await run('setBoxStyle', { nodeIds: [definition.parts[0]], fill: '#ef4444' });
      expect(await run('applyComponent', { nodeId: placement })).toBe(true);

      const parts = childrenOf(doc.getNode(placement));
      expect(doc.getNode(parts[0])?.attributes?.fill).toBe('#ef4444');
      // And it is not behind any more, which is the same question the badge asks.
      expect(componentStale(doc, doc.getNode(placement), deckComponents(doc)[0])).toBe(false);
    });

    it('leaves a part the reader edited alone', async () => {
      const definition = deckComponents(doc)[0];
      const parts = childrenOf(doc.getNode(placement));
      // The reader's own colour on this placement's rectangle.
      await run('setBoxStyle', { nodeIds: [parts[0]], fill: '#22c55e' });
      await run('setBoxStyle', { nodeIds: [definition.parts[0]], fill: '#ef4444' });
      await run('applyComponent', { nodeId: placement });

      /*
       * That is what an override *is* here: nothing declared and nothing hidden. The cost is
       * stated in the model — the granularity is a whole part — and the alternative is
       * guessing which half of a part is the reader's.
       */
      expect(doc.getNode(parts[0])?.attributes?.fill).toBe('#22c55e');
    });

    it('does every placement at once when asked by definition', async () => {
      await run('placeComponent', { componentId: 'card', slideId: slide, x: 12000, y: 3000 });
      const definition = deckComponents(doc)[0];
      await run('setBoxStyle', { nodeIds: [definition.parts[0]], fill: '#ef4444' });

      // Asking a reader to visit forty slides is not an answer.
      expect(await run('applyComponent', { componentId: 'card' })).toBe(true);
      for (const sid of boxes().filter((one) => doc.getNode(one)?.stype === 'instance')) {
        expect(componentStale(doc, doc.getNode(sid), deckComponents(doc)[0])).toBe(false);
        expect(doc.getNode(childrenOf(doc.getNode(sid))[0])?.attributes?.fill).toBe('#ef4444');
      }
    });
  });

  describe('a variable', () => {
    let placement: string;

    beforeEach(async () => {
      select(...boxes());
      await run('createComponent', { name: '카드', id: 'card' });
      placement = boxes()[0];
      /*
       * A declaration on the definition, and a part bound to it.
       *
       * Written straight into the store because nothing declares a variable yet — that is the
       * definition's own panel, and the next item. What is under test here is the *placement*
       * side: a value written, and the words on the slide changing with it.
       */
      const definition = deckComponents(doc)[0];
      store.addChild(definition.sid, {
        stype: 'componentVar',
        attributes: { name: 'title', label: '이름', value: '지표' }
      } as never);
      const bound = store.getNode(definition.parts[1]) as never as {
        attributes: Record<string, unknown>;
      };
      store.setNode(
        { ...bound, attributes: { ...bound.attributes, bindText: 'title' } } as never,
        false
      );
    });

    it('refuses a name the definition does not declare', () => {
      expect(
        (editor as any).canExecuteCommand('setComponentValue', { nodeId: placement, name: 'nope' })
      ).toBe(false);
    });

    it('is written on the placement, and substituted into the part that binds it', async () => {
      expect(await run('setComponentValue', { nodeId: placement, name: 'title', value: '매출' })).toBe(true);

      const said = instanceVars(doc, doc.getNode(placement), deckComponents(doc)[0]);
      expect(said.map((one) => [one.name, one.value, one.set])).toEqual([['title', '매출', true]]);

      /*
       * The words on the slide, not just a value in an attribute. A field a reader types into
       * that changes nothing on the slide is the worst of both designs — and the substitution
       * happens here rather than at draw time because a template cannot draw a foreign node.
       */
      const bound = childrenOf(doc.getNode(placement)).find(
        (sid) => doc.getNode(sid)?.attributes?.partOf === 'title'
      ) as string;
      const line = childrenOf(doc.getNode(bound))[0];
      const words = childrenOf(doc.getNode(line))[0];
      expect((doc.getNode(words) as { text?: string })?.text).toBe('매출');
    });

    it('changes the same value again without adding a second answer', async () => {
      await run('setComponentValue', { nodeId: placement, name: 'title', value: '매출' });
      await run('setComponentValue', { nodeId: placement, name: 'title', value: '이익' });
      const values = childrenOf(doc.getNode(placement)).filter(
        (sid) => doc.getNode(sid)?.stype === 'componentValue'
      );
      expect(values).toHaveLength(1);
      expect(doc.getNode(values[0])?.attributes?.value).toBe('이익');
    });
  });

  /**
   * The definition's own side: declaring what a placement can be asked for, and saying which
   * part takes it.
   *
   * Until this existed the whole variable half was unreachable — the panel drew the fields and
   * apply substituted them, and the only way to *declare* one was to write it into the
   * document by hand. Which is the failure `every-command-can-be-reached` exists for, one layer
   * up: a feature that works and nothing can start.
   */
  describe('declaring what a card takes', () => {
    let definition: string;

    beforeEach(async () => {
      select(...boxes());
      await run('createComponent', { name: '카드', id: 'card' });
      definition = deckComponents(doc)[0].sid;
    });

    it('refuses a nameless variable and a definition that is not there', () => {
      expect((editor as any).canExecuteCommand('setComponentVar', { componentId: 'card' })).toBe(false);
      expect(
        (editor as any).canExecuteCommand('setComponentVar', { componentId: 'nope', name: 'title' })
      ).toBe(false);
    });

    it('declares one before the parts, where the schema says it goes', async () => {
      expect(
        await run('setComponentVar', {
          componentId: 'card',
          name: 'title',
          label: '이름',
          value: '지표'
        })
      ).toBe(true);

      // A definition's variables are its interface: the file reads "what it can be asked for",
      // then "what it is made of".
      expect(childrenOf(doc.getNode(definition)).map((sid) => doc.getNode(sid)?.stype)).toEqual([
        'componentVar',
        'rectangle',
        'textFrame'
      ]);
      const [card] = deckComponents(doc);
      expect(card.vars.map((one) => [one.name, one.label, one.value])).toEqual([
        ['title', '이름', '지표']
      ]);
      // And it is not counted as a part, so no placement looks one behind.
      expect(card.parts).toHaveLength(2);
    });

    it('changes only what it was told to change', async () => {
      await run('setComponentVar', { componentId: 'card', name: 'title', value: '지표' });
      await run('setComponentVar', { componentId: 'card', name: 'title', label: '제목' });

      const [one] = deckComponents(doc)[0].vars;
      // The default survives a label change: a panel that reset the value every time somebody
      // renamed a field would be a panel nobody could use twice.
      expect([one.label, one.value]).toEqual(['제목', '지표']);
      expect(deckComponents(doc)[0].vars).toHaveLength(1);
    });

    it('takes the bindings and the placements’ answers with it when it goes', async () => {
      await run('setComponentVar', { componentId: 'card', name: 'title', value: '지표' });
      const part = deckComponents(doc)[0].parts[1];
      await run('bindComponentPart', { nodeId: part, bindText: 'title' });
      const placement = boxes()[0];
      await run('setComponentValue', { nodeId: placement, name: 'title', value: '매출' });

      expect(await run('setComponentVar', { componentId: 'card', name: 'title', remove: true })).toBe(true);

      /*
       * Nothing is left pointing at it. A binding on a variable that is gone is a part that
       * silently draws whatever it last had, and an answer to a question nobody asks is junk
       * in the file that would come back to life the day the name was declared again.
       */
      expect(deckComponents(doc)[0].vars).toEqual([]);
      expect(doc.getNode(part)?.attributes?.bindText).toBeUndefined();
      expect(
        childrenOf(doc.getNode(placement)).filter(
          (sid) => doc.getNode(sid)?.stype === 'componentValue'
        )
      ).toEqual([]);
    });

    it('binds a part to a variable, and lets go of it again', async () => {
      const part = deckComponents(doc)[0].parts[1];
      expect(await run('bindComponentPart', { nodeId: part, bindText: 'title' })).toBe(true);
      expect(doc.getNode(part)?.attributes?.bindText).toBe('title');

      // Clearing is the same gesture: an empty answer from a control means "takes nothing".
      await run('bindComponentPart', { nodeId: part, bindText: '' });
      expect(doc.getNode(part)?.attributes?.bindText).toBeUndefined();
    });

    it('refuses to bind a box that is not in a definition', async () => {
      await run('placeComponent', { componentId: 'card', slideId: slide, x: 9000, y: 3000 });
      const onSlide = childrenOf(doc.getNode(boxes()[1]))[0];
      // A binding on a box that is on a slide is a claim about a card that does not exist, and
      // nothing would ever read it.
      expect(
        (editor as any).canExecuteCommand('bindComponentPart', { nodeId: onSlide, bindText: 'title' })
      ).toBe(false);
    });

    it('marks a part as the slot, which is where a reader’s own things go', async () => {
      const part = deckComponents(doc)[0].parts[0];
      await run('bindComponentPart', { nodeId: part, slot: 'items' });
      expect(doc.getNode(part)?.attributes?.slot).toBe('items');
    });
  });

  /**
   * How big a card is — and why that is the definition's question rather than a placement's.
   *
   * Measured in the browser: dragging a placement's corner handle wrote a box of 8280×6440
   * onto a card whose parts stayed exactly 5040×3960. The outline grew, the card did not
   * change, and nothing said so — the frame's refused drag in a new place. A placement's extent
   * *is* its definition's, so the handles are gone and this is the gesture instead.
   */
  describe('how big the card is', () => {
    beforeEach(async () => {
      select(...boxes());
      await run('createComponent', { name: '카드', id: 'card' });
      await run('placeComponent', { componentId: 'card', slideId: slide, x: 9000, y: 3000 });
    });

    it('refuses a size that is not one', () => {
      expect((editor as any).canExecuteCommand('setComponentSize', { componentId: 'card' })).toBe(false);
      expect(
        (editor as any).canExecuteCommand('setComponentSize', { componentId: 'card', width: 0 })
      ).toBe(false);
    });

    it('changes the card and every placement of it, in one entry', async () => {
      expect(await run('setComponentSize', { componentId: 'card', width: 6000, height: 4200 })).toBe(true);

      const definition = deckComponents(doc)[0];
      expect(doc.getNode(definition.sid)?.attributes?.width).toBe(6000);
      for (const sid of boxes()) {
        expect(doc.getNode(sid)?.attributes?.width).toBe(6000);
        expect(doc.getNode(sid)?.attributes?.height).toBe(4200);
      }

      // One press of undo, because leaving twenty placements at the new size and the card at
      // the old one is the split-undo fault that made apply a command in the first place.
      await (editor as any).undo();
      expect(doc.getNode(definition.sid)?.attributes?.width).toBe(3000);
      expect(doc.getNode(boxes()[0])?.attributes?.width).toBe(3000);
    });

    it('does not touch what is in the card', async () => {
      const definition = deckComponents(doc)[0];
      const before = definition.parts.map((sid) => doc.getNode(sid)?.attributes?.width);
      await run('setComponentSize', { componentId: 'card', width: 6000, height: 4200 });
      // A card's size is not an edit to what is in it: scaling the parts would need a
      // constraint model, and half-guessing it puts a badge outside its card.
      expect(deckComponents(doc)[0].parts.map((sid) => doc.getNode(sid)?.attributes?.width)).toEqual(
        before
      );
    });

    it('brings a placement’s box back into agreement on apply', async () => {
      const definition = deckComponents(doc)[0];
      // A card resized by something that does not know about placements — a reader dragging the
      // definition's own handles, an older deck, a file from another product.
      store.setNode(
        {
          ...(store.getNode(definition.sid) as never as Record<string, unknown>),
          attributes: {
            ...((store.getNode(definition.sid) as never as { attributes: Record<string, unknown> })
              .attributes),
            width: 7000
          }
        } as never,
        false
      );

      const placement = boxes()[1];
      const plan = componentApplyPlan(doc, doc.getNode(placement), deckComponents(doc)[0]);
      expect(plan?.box).toEqual({ width: 7000, height: 2000 });
      await run('applyComponent', { nodeId: placement });
      expect(doc.getNode(placement)?.attributes?.width).toBe(7000);
    });
  });

  describe('detaching', () => {
    it('leaves a group, with the parts still arranged', async () => {
      select(...boxes());
      await run('createComponent', { name: '카드', id: 'card' });
      const placement = boxes()[0];
      await run('setComponentValue', { nodeId: placement, name: 'title', value: '매출' }).catch(
        () => undefined
      );

      expect(await run('detachComponent', { nodeId: placement })).toBe(true);
      const node = doc.getNode(placement);
      expect(node?.stype).toBe('group');
      expect(node?.attributes?.componentId).toBeUndefined();
      // Not scattered across the slide: a detach that dissolved the group would have destroyed
      // the thing the reader was detaching.
      expect(childrenOf(node)).toHaveLength(2);
      // And nothing claims to be part of a definition any more, so no later apply picks it up.
      for (const sid of childrenOf(node)) {
        expect(doc.getNode(sid)?.attributes?.partOf).toBeUndefined();
      }
    });
  });

  /**
   * A card a reader **can** resize — because it was built out of a frame.
   *
   * The refusal in the group above is right for a card of absolutely placed parts: the drag writes
   * a box and nothing that can be seen changes. It is wrong for a card whose parts were told to
   * fill it, and that is the whole point of `layoutStretch`: the part takes the placement's new
   * box, and when it is a frame it arranges its own children one pass later. So the product
   * refuses exactly where it has no answer.
   */
  describe('a card built out of a frame', () => {
    let placement: string;
    let body: string;

    /** The reaction runs on the document change, so its writes land after the await. */
    const settle = () => new Promise((resolve) => setTimeout(resolve, 40));

    beforeEach(async () => {
      // A definition made of one frame that fills the card and arranges a column inside it.
      select(...boxes());
      await run('createComponent', { id: 'card' });
      const [definition] = deckComponents(doc);
      for (const part of definition.parts) {
        await run('removeNode', { nodeId: part }).catch(() => undefined);
      }

      await run('placeComponent', { componentId: 'card', slideId: slide, x: 2000, y: 2000 });
      placement = boxes().find((sid) => doc.getNode(sid)?.stype === 'instance') as string;

      // The body: a frame that fills the placement, holding two rows that fill the frame.
      await (editor as never as { transaction: (steps: unknown[]) => { commit: () => Promise<unknown> } })
        .transaction([
          {
            type: 'addChild',
            payload: {
              parentId: placement,
              child: {
                stype: 'frame',
                attributes: {
                  x: 0,
                  y: 0,
                  width: 3000,
                  height: 2000,
                  layoutStretch: true,
                  layoutMode: 'column',
                  gap: 100,
                  padding: 100,
                  partOf: 'body'
                },
                content: [
                  {
                    stype: 'rectangle',
                    attributes: { x: 0, y: 0, width: 500, height: 400, layoutStretch: true }
                  },
                  {
                    stype: 'rectangle',
                    attributes: { x: 0, y: 0, width: 500, height: 400, layoutStretch: true }
                  }
                ]
              }
            }
          }
        ])
        .commit();
      await settle();
      body = childrenOf(doc.getNode(placement)).find(
        (sid) => doc.getNode(sid)?.stype === 'frame'
      ) as string;
    });

    it('owns its size, so the model says it may be resized', () => {
      expect(placementFills(doc, doc.getNode(placement))).toBe(true);
    });

    it('carries a resize down into the card, and one pass further', async () => {
      await run('setBoxGeometry', { nodeIds: [placement], width: 8000, height: 5000 });
      await settle();

      // The part told to fill the card is as big as the card…
      expect(doc.getNode(body)?.attributes?.width).toBe(8000);
      expect(doc.getNode(body)?.attributes?.height).toBe(5000);
      // …and the frame then arranged its own children, which is the pass after.
      for (const row of childrenOf(doc.getNode(body))) {
        expect(doc.getNode(row)?.attributes?.width).toBe(8000 - 200);
      }
    });

    it('is not dragged back to the card’s size by apply', async () => {
      await run('setBoxGeometry', { nodeIds: [placement], width: 8000, height: 5000 });
      await settle();
      await run('applyComponent', { nodeId: placement });
      await settle();

      /*
       * The definition says how big the card is **by default**, not how big every placement of it
       * must stay. A placement that owns its size keeps it, and the parts still follow the
       * definition — which is what the signature ignoring an arranged box buys.
       */
      expect(doc.getNode(placement)?.attributes?.width).toBe(8000);
      expect(doc.getNode(body)?.attributes?.width).toBe(8000);
    });

    it('does not look edited just because it was resized', async () => {
      await run('setBoxGeometry', { nodeIds: [placement], width: 8000, height: 5000 });
      await settle();

      const state = instanceState(doc, doc.getNode(placement), deckComponents(doc)[0]);
      const filled = state.find((part) => part.sid === body);
      // A part whose box an arrangement decided is not saying anything of its own about its box.
      // Without that, a resized placement would look edited in every part and apply would leave
      // the whole card alone for ever.
      expect(filled?.changed).toBe(false);
    });
  });
});
