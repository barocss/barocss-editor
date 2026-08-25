import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import type { Editor } from '@barocss/editor-core';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import { childrenOf, type DeckAccess } from '../src/deck';
import {
  componentsOf,
  instanceParts,
  instanceResizable,
  instanceVars
} from '@barocss/office-canvas';

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

      const [definition] = componentsOf(doc);
      expect(definition?.id).toBe('card');
      expect(definition?.name).toBe('카드');
      // Its parts have durable names derived from what they are, so a person reading the file
      // can tell them apart — a counter would be honest and unreadable.
      expect(definition.parts.map((sid) => doc.getNode(sid)?.attributes?.partId)).toEqual([
        'rectangle',
        'title'
      ]);

      /*
       * And the reader's boxes are *gone from the slide*: what is there is a placement, and it holds
       * **nothing**. A placement draws the definition, so copying the parts into it would make it a
       * template — a document you copy and then own — rather than a component.
       */
      expect(boxes()).toHaveLength(1);
      const placement = doc.getNode(boxes()[0]);
      expect(placement?.stype).toBe('instance');
      expect(placement?.attributes?.componentId).toBe('card');
      expect(childrenOf(placement)).toEqual([]);
      // At the selection's own corner, and the parts rebased to the card: a definition is a card at
      // 0,0 rather than a card that remembers it was once on slide four.
      expect(placement?.attributes?.x).toBe(2000);
      expect(placement?.attributes?.y).toBe(1000);
      expect(doc.getNode(definition.parts[0])?.attributes?.x).toBe(0);
      // And what it draws is the definition's parts, each with its own place.
      expect(instanceParts(doc, placement).map((part) => part.attributes?.partId)).toEqual([
        'rectangle',
        'title'
      ]);
    });

    it('takes it all back in one press of undo', async () => {
      select(...boxes());
      await run('createComponent', { name: '카드', id: 'card' });
      await (editor as any).undo();

      // The library, the definition and the placement all go; the reader's two boxes come back.
      expect(componentsOf(doc)).toEqual([]);
      expect(boxes()).toHaveLength(2);
      expect(doc.getNode(boxes()[0])?.stype).toBe('rectangle');
    });

    it('does not hand out an id another definition is using', async () => {
      select(...boxes());
      await run('createComponent', { id: 'card' });
      select(boxes()[0]);
      await run('createComponent', { id: 'card' });
      expect(componentsOf(doc).map((one) => one.id)).toEqual(['card', 'card-2']);
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

    it('holds nothing, and draws the definition', async () => {
      expect(await run('placeComponent', { componentId: 'card', slideId: slide, x: 8000, y: 3000 })).toBe(true);

      const placed = doc.getNode(boxes()[1]);
      expect(placed?.attributes?.x).toBe(8000);
      // Nothing in the document, everything on the screen: no copies, and nothing recorded about
      // what the definition said, because there is nothing to fall behind.
      expect(childrenOf(placed)).toEqual([]);
      expect(instanceParts(doc, placed)).toHaveLength(2);
    });
  });

  describe('a definition that changes', () => {
    let placement: string;

    beforeEach(async () => {
      select(...boxes());
      await run('createComponent', { name: '카드', id: 'card' });
      await run('placeComponent', { componentId: 'card', slideId: slide, x: 8000, y: 3000 });
      placement = boxes().find((sid) => doc.getNode(sid)?.stype === 'instance') as string;
    });

    it('is on the screen already: there is nothing to apply', async () => {
      const definition = componentsOf(doc)[0];
      await run('setBoxStyle', { nodeIds: [definition.parts[0]], fill: '#ef4444' });

      /*
       * The machinery this replaces: with copied parts a change had to be *carried* into every
       * placement, so there was a plan, a recorded signature per part and a badge offering the work.
       * A placement draws the definition, so the change is drawn.
       */
      const drawn = instanceParts(doc, doc.getNode(placement));
      expect(drawn[0].attributes?.fill).toBe('#ef4444');
      // And no command for it: `applyComponent` is gone, because there is nothing for it to do.
      expect((editor as any).commandNames().includes('applyComponent')).toBe(false);
    });

    it('reaches every placement at once, because they all draw it', async () => {
      await run('placeComponent', { componentId: 'card', slideId: slide, x: 12000, y: 3000 });
      const definition = componentsOf(doc)[0];
      await run('setBoxStyle', { nodeIds: [definition.parts[0]], fill: '#0f766e' });

      for (const sid of boxes().filter((one) => doc.getNode(one)?.stype === 'instance')) {
        expect(instanceParts(doc, doc.getNode(sid))[0].attributes?.fill).toBe('#0f766e');
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
      const definition = componentsOf(doc)[0];
      store.addChild(definition.sid, {
        stype: 'componentVar',
        attributes: { name: 'title', label: '이름', value: '지표' }
      } as never);
      /*
       * And the binding, which is the definition's own declaration now — one per piece and
       * attribute, so a variable can drive anything a part declares (§10g-2).
       */
      store.addChild(definition.sid, {
        stype: 'componentBind',
        attributes: { part: 'title', attr: 'text', var: 'title' }
      } as never);
    });

    it('refuses a name the definition does not declare', () => {
      expect(
        (editor as any).canExecuteCommand('setComponentValue', { nodeId: placement, name: 'nope' })
      ).toBe(false);
    });

    it('is written on the placement, and substituted into the part that binds it', async () => {
      expect(await run('setComponentValue', { nodeId: placement, name: 'title', value: '매출' })).toBe(true);

      const said = instanceVars(doc, doc.getNode(placement), componentsOf(doc)[0]);
      expect(said.map((one) => [one.name, one.value, one.set])).toEqual([['title', '매출', true]]);

      /*
       * The words on the slide, not just a value in an attribute. A field a reader types into that
       * changes nothing on the slide is the worst of both designs — and the substitution is in the
       * *drawing* rather than in the document, because a placement holds no parts to write it into.
       */
      const bound = instanceParts(doc, doc.getNode(placement)).find(
        (part) => part.attributes?.partId === 'title'
      );
      const line = ((bound as { content?: { content?: { text?: string }[] }[] }).content ?? [])[0];
      expect((line?.content ?? [])[0]?.text).toBe('매출');
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
      definition = componentsOf(doc)[0].sid;
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
      const [card] = componentsOf(doc);
      expect(card.vars.map((one) => [one.name, one.label, one.value])).toEqual([
        ['title', '이름', '지표']
      ]);
      // And it is not counted as a part, so no placement looks one behind.
      expect(card.parts).toHaveLength(2);
    });

    it('changes only what it was told to change', async () => {
      await run('setComponentVar', { componentId: 'card', name: 'title', value: '지표' });
      await run('setComponentVar', { componentId: 'card', name: 'title', label: '제목' });

      const [one] = componentsOf(doc)[0].vars;
      // The default survives a label change: a panel that reset the value every time somebody
      // renamed a field would be a panel nobody could use twice.
      expect([one.label, one.value]).toEqual(['제목', '지표']);
      expect(componentsOf(doc)[0].vars).toHaveLength(1);
    });

    it('takes the bindings and the placements’ answers with it when it goes', async () => {
      await run('setComponentVar', { componentId: 'card', name: 'title', value: '지표' });
      const part = componentsOf(doc)[0].parts[1];
      await run('bindComponentPart', { nodeId: part, bindText: 'title' });
      const placement = boxes()[0];
      await run('setComponentValue', { nodeId: placement, name: 'title', value: '매출' });

      expect(await run('setComponentVar', { componentId: 'card', name: 'title', remove: true })).toBe(true);

      /*
       * Nothing is left pointing at it. A binding on a variable that is gone is a part that
       * silently draws whatever it last had, and an answer to a question nobody asks is junk
       * in the file that would come back to life the day the name was declared again.
       */
      expect(componentsOf(doc)[0].vars).toEqual([]);
      expect(doc.getNode(part)?.attributes?.bindText).toBeUndefined();
      expect(
        childrenOf(doc.getNode(placement)).filter(
          (sid) => doc.getNode(sid)?.stype === 'componentValue'
        )
      ).toEqual([]);
    });

    it('declares a binding, and takes it away again', async () => {
      await run('setComponentVar', { componentId: 'card', name: 'title', value: '지표' });
      expect(
        await run('setComponentBind', { componentId: 'card', part: 'title', attr: 'text', var: 'title' })
      ).toBe(true);
      expect(componentsOf(doc)[0].binds).toEqual([
        { part: 'title', attr: 'text', var: 'title' }
      ]);

      // Clearing is the same command: `null` takes it off, and there is nothing left saying the
      // part takes anything.
      await run('setComponentBind', { componentId: 'card', part: 'title', attr: 'text', var: null });
      expect(componentsOf(doc)[0].binds).toEqual([]);
    });

    it('replaces the declaration about one piece and one attribute', async () => {
      await run('setComponentVar', { componentId: 'card', name: 'a', value: '#111' });
      await run('setComponentVar', { componentId: 'card', name: 'b', value: '#222' });
      await run('setComponentBind', { componentId: 'card', part: 'rectangle', attr: 'fill', var: 'a' });
      await run('setComponentBind', { componentId: 'card', part: 'rectangle', attr: 'fill', var: 'b' });
      /*
       * One decision, not two: a card whose colour depends on which declaration apply read last is
       * a card nobody can reason about.
       */
      expect(componentsOf(doc)[0].binds).toEqual([{ part: 'rectangle', attr: 'fill', var: 'b' }]);
    });

    it('refuses an attribute the part does not declare, and a variable that is not declared', async () => {
      await run('setComponentVar', { componentId: 'card', name: 'round', kind: 'number', value: '120' });
      const can = (payload: unknown) => (editor as any).canExecuteCommand('setComponentBind', payload);
      // The check the schema could not make: a content model cannot see across to another node's
      // attributes, so a binding naming something nothing reads is refused here instead.
      expect(can({ componentId: 'card', part: 'rectangle', attr: 'cornerRadius', var: 'round' })).toBe(true);
      expect(can({ componentId: 'card', part: 'rectangle', attr: 'notAThing', var: 'round' })).toBe(false);
      expect(can({ componentId: 'card', part: 'rectangle', attr: 'fill', var: 'nope' })).toBe(false);
      expect(can({ componentId: 'card', part: 'nowhere', attr: 'fill', var: 'round' })).toBe(false);
      // `text` is always allowed and is not an attribute: the words are content.
      expect(can({ componentId: 'card', part: 'rectangle', attr: 'text', var: 'round' })).toBe(true);
    });

    it('drives a number into an attribute, as a number', async () => {
      await run('setComponentVar', { componentId: 'card', name: 'round', kind: 'number', value: '180' });
      await run('setComponentBind', {
        componentId: 'card',
        part: 'rectangle',
        attr: 'cornerRadius',
        var: 'round'
      });
      await run('placeComponent', { componentId: 'card', slideId: slide, x: 9000, y: 3000 });

      const placed = boxes().filter((sid) => doc.getNode(sid)?.stype === 'instance').pop() as string;
      const back = instanceParts(doc, doc.getNode(placed))[0];
      /*
       * The document keeps a variable's value as a string — one shape to write, diff and check —
       * and an attribute that means a length has to be a number, so the conversion happens at the
       * one place a value becomes an attribute. A card's corners were unreachable before this:
       * `number` could only ever be text.
       */
      expect(back?.attributes?.cornerRadius).toBe(180);
    });

    it('marks a frame part as the slot, which is not a binding', async () => {
      const part = componentsOf(doc)[0].parts[0];
      // It says where a reader's own things go, not what a part takes — and it was only in the same
      // command as the bindings because both were attributes on a part.
      await run('setComponentSlot', { nodeId: part, slot: 'items' });
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

      const definition = componentsOf(doc)[0];
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
      const definition = componentsOf(doc)[0];
      const before = definition.parts.map((sid) => doc.getNode(sid)?.attributes?.width);
      await run('setComponentSize', { componentId: 'card', width: 6000, height: 4200 });
      // A card's size is not an edit to what is in it: scaling the parts would need a
      // constraint model, and half-guessing it puts a badge outside its card.
      expect(componentsOf(doc)[0].parts.map((sid) => doc.getNode(sid)?.attributes?.width)).toEqual(
        before
      );
    });

    it('draws a placement that was never told the card grew', async () => {
      const definition = componentsOf(doc)[0];
      // A card resized by something that does not know about placements — a reader dragging the
      // definition's own handles, an older deck, a file from another product. There is nothing to
      // bring back into agreement any more: the parts are the definition's, so they are already it.
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

      const placement = boxes().find((sid) => doc.getNode(sid)?.stype === 'instance') as string;
      expect(instanceParts(doc, doc.getNode(placement))).toHaveLength(2);
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
      // And nothing claims to be a part of a definition any more: these are the reader's own
      // boxes, so a later change to the card must not reach them.
      for (const sid of childrenOf(node)) {
        expect(doc.getNode(sid)?.attributes?.partId).toBeUndefined();
      }
    });
  });

  /**
   * A card a reader **can** resize — because it was built out of a frame.
   *
   * The refusal is right for a card of absolutely placed parts: the drag writes a box and nothing
   * that can be seen changes. It is wrong for a card whose parts were told to fill it, and that is
   * the whole point of `layoutStretch`. What changed with references is **where the answer comes
   * from**: no reaction can write a size into a part that is not in the document, so the
   * arrangement runs in the resolution instead — and a resize costs no document write at all.
   */
  describe('a card built out of a frame', () => {
    let placement: string;
    let definition: string;

    /** A reaction could still be in flight; a resize should need none of it. */
    const settle = () => new Promise((resolve) => setTimeout(resolve, 40));

    beforeEach(async () => {
      // A definition made of one frame that fills the card and arranges a column inside it.
      select(...boxes());
      await run('createComponent', { id: 'card' });
      definition = componentsOf(doc)[0].sid;

      await (editor as never as { transaction: (steps: unknown[]) => { commit: () => Promise<unknown> } })
        .transaction([
          {
            type: 'addChild',
            payload: {
              parentId: definition,
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
                  partId: 'body'
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

      await run('placeComponent', { componentId: 'card', slideId: slide, x: 2000, y: 2000 });
      placement = boxes().find((sid) => doc.getNode(sid)?.stype === 'instance') as string;
    });

    /** The definition's filling frame, found by the name it was given rather than by position. */
    const bodyPart = () =>
      componentsOf(doc)[0].parts.find(
        (sid) => doc.getNode(sid)?.attributes?.partId === 'body'
      ) as string;

    /** The same part as it is **drawn** inside the placement. */
    const drawnBody = () =>
      instanceParts(doc, doc.getNode(placement)).find(
        (part) => part.attributes?.partId === 'body'
      ) as { attributes?: Record<string, unknown>; content?: { attributes?: Record<string, unknown> }[] };

    it('says a reader may resize it, because a part answers the gesture', async () => {
      expect(instanceResizable(doc, doc.getNode(placement))).toBe(true);

      // And a card of absolutely placed parts does not, which is the refusal that measurement
      // bought: a drag that writes a box nothing reads. Asked by taking the filling away, because
      // that is the only difference between the two cards.
      await run('setBoxLayout', { nodeIds: [bodyPart()], stretch: false });
      expect(instanceResizable(doc, doc.getNode(placement))).toBe(false);
    });

    it('carries a resize down into the card, and one pass further', async () => {
      await run('setBoxGeometry', { nodeIds: [placement], width: 8000, height: 5000 });
      await settle();

      const body = drawnBody();
      // The part told to fill the card is as big as the card…
      expect(body.attributes?.width).toBe(8000);
      expect(body.attributes?.height).toBe(5000);
      // …and that frame then arranged its own children against the size it had just been given,
      // which is the pass that used to need a second transaction.
      for (const row of body.content ?? []) {
        expect(row.attributes?.width).toBe(8000 - 200);
      }
    });

    it('writes nothing into the document to do it', async () => {
      await run('setBoxGeometry', { nodeIds: [placement], width: 8000, height: 5000 });
      await settle();

      /*
       * The definition is untouched — which is the point. One drag used to write a box into every
       * part of every placement of the card; now the placement's own box is the only change, and
       * twenty placements cost twenty arrangements at draw time and no writes.
       */
      const part = bodyPart();
      expect(doc.getNode(part)?.attributes?.width).toBe(3000);
      for (const row of childrenOf(doc.getNode(part))) {
        expect(doc.getNode(row)?.attributes?.width).toBe(2800);
      }
    });
  });
});
