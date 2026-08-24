import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import type { Editor } from '@barocss/editor-core';
import { documentVars, varUses } from '@barocss/office-word';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import { childrenOf, type DeckAccess } from '../src/deck';

/**
 * Declaring the document's own named values, and taking one away.
 *
 * The model is tested on its own in `office-word/test/canvas-variable.test.ts`, where the
 * arithmetic is. What is left for a command is what a model cannot answer: **what the document
 * looks like afterwards**, and whether one press of undo takes the whole thing back — both of which
 * have been the fault in this repository more than once.
 */
describe('the document variable commands', () => {
  let editor: Editor;
  let store: DataStore;
  let doc: DeckAccess;

  const run = async (command: string, payload?: unknown) =>
    await (editor as never as { executeCommand: (name: string, payload?: unknown) => Promise<boolean> })
      .executeCommand(command, payload);

  const can = (payload?: unknown) =>
    (editor as never as { canExecuteCommand: (name: string, payload?: unknown) => boolean })
      .canExecuteCommand('setDocumentVar', payload);

  beforeEach(() => {
    const schema = createSchema('slides', getSlidesSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSlidesEditor({ editable: true, schema, dataStore: store } as never) as Editor;
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
                attributes: { x: 0, y: 0, width: 1000, height: 800, fill: '#2563eb' }
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
    } as DeckAccess;
  });

  const box = () => childrenOf(doc.getNode(childrenOf(doc.getNode(doc.rootId))[0]))[0];

  describe('declaring one', () => {
    it('refuses a nameless variable, and refuses removing one that is not there', () => {
      expect(can({})).toBe(false);
      expect(can({ name: '' })).toBe(false);
      // A gesture with no answer is refused rather than accepted quietly — the rule this product
      // follows everywhere the model cannot say what a press would mean.
      expect(can({ name: '없음', remove: true })).toBe(false);
      expect(can({ name: '강조' })).toBe(true);
    });

    it('makes the container in the same breath as the declaration', async () => {
      expect(await run('setDocumentVar', { name: '강조', kind: 'color', value: '#0f766e' })).toBe(true);

      /*
       * A `variables` container beside the slides, made *with* the first variable: one press of
       * undo takes back "I made a variable" rather than leaving an empty container behind — the
       * deck was a deck without one a moment ago. The library does the same thing for the same
       * reason.
       */
      const kinds = childrenOf(doc.getNode(doc.rootId)).map((sid) => doc.getNode(sid)?.stype);
      expect(kinds).toEqual(['surface', 'variables']);
      expect(documentVars(doc as never).map((one) => [one.name, one.kind, one.value])).toEqual([
        ['강조', 'color', '#0f766e']
      ]);

      await (editor as never as { undo: () => Promise<unknown> }).undo();
      expect(childrenOf(doc.getNode(doc.rootId)).map((sid) => doc.getNode(sid)?.stype)).toEqual([
        'surface'
      ]);
    });

    it('adds a second one to the container that is already there', async () => {
      await run('setDocumentVar', { name: '강조', kind: 'color', value: '#0f766e' });
      await run('setDocumentVar', { name: '회사', value: '바로씨에스' });
      expect(documentVars(doc as never).map((one) => one.name)).toEqual(['강조', '회사']);
    });

    it('changes only what it was told to change', async () => {
      await run('setDocumentVar', { name: '강조', kind: 'color', value: '#0f766e' });
      await run('setDocumentVar', { name: '강조', label: '강조색' });

      // A label change that reset the value would be a panel that loses a reader's work every time
      // they rename something.
      const [found] = documentVars(doc as never);
      expect([found.label, found.kind, found.value]).toEqual(['강조색', 'color', '#0f766e']);
      // And one declaration, not two: the same name is the same variable.
      expect(documentVars(doc as never)).toHaveLength(1);
    });
  });

  describe('using one', () => {
    it('is written where a colour goes, and counted from there', async () => {
      await run('setDocumentVar', { name: '강조', kind: 'color', value: '#0f766e' });
      /*
       * The reference is an ordinary attribute value, so no new command is needed to *use* one —
       * `setBoxStyle` writes it the way it writes a hex. Measured before it was designed this way:
       * a string commits where the schema says a string goes, and is refused in a number or a
       * boolean, which is why a number reaches a shape through a card instead.
       */
      expect(await run('setBoxStyle', { nodeIds: [box()], fill: 'var:강조' })).toBe(true);
      expect(doc.getNode(box())?.attributes?.fill).toBe('var:강조');
      expect(varUses(doc as never, '강조')).toBe(1);
    });
  });

  describe('taking one away', () => {
    it('leaves the references alone, on purpose', async () => {
      await run('setDocumentVar', { name: '강조', kind: 'color', value: '#0f766e' });
      await run('setBoxStyle', { nodeIds: [box()], fill: 'var:강조' });

      expect(await run('setDocumentVar', { name: '강조', remove: true })).toBe(true);
      expect(documentVars(doc as never)).toEqual([]);
      /*
       * The shape still says `var:강조` and now draws **no fill**. Deliberate: there is no honest
       * value to put in its place, and a shape whose colour quietly became black is worse than one
       * that plainly lost it — the reader can see the second and cannot see the first. The deck's
       * own check is what reports it.
       */
      expect(doc.getNode(box())?.attributes?.fill).toBe('var:강조');
    });

    it('takes a card’s binding with it, unless the card declares the name itself', async () => {
      await run('setDocumentVar', { name: '강조', kind: 'color', value: '#0f766e' });

      // Two cards: one binding the document's variable, one declaring its own of the same name.
      await (editor as never as {
        transaction: (steps: unknown[]) => { commit: () => Promise<unknown> };
      })
        .transaction([
          {
            type: 'addChild',
            payload: {
              parentId: doc.rootId,
              /*
               * Before the `variables` container the first line of this test made, because the
               * schema's order is `components? variables?` — appending here is refused, which is
               * how the commands came to ask `documentChildSpot` where a container goes.
               */
              position: 1,
              child: {
                stype: 'components',
                content: [
                  {
                    stype: 'component',
                    attributes: { id: 'open' },
                    content: [
                      {
                        stype: 'componentBind',
                        attributes: { part: 'back', attr: 'fill', var: '강조' }
                      },
                      { stype: 'rectangle', attributes: { partId: 'back' } }
                    ]
                  },
                  {
                    stype: 'component',
                    attributes: { id: 'own' },
                    content: [
                      { stype: 'componentVar', attributes: { name: '강조', value: '#ef4444' } },
                      {
                        stype: 'componentBind',
                        attributes: { part: 'back', attr: 'fill', var: '강조' }
                      },
                      { stype: 'rectangle', attributes: { partId: 'back' } }
                    ]
                  }
                ]
              }
            }
          }
        ])
        .commit();

      const cardsIn = () => {
        const library = childrenOf(doc.getNode(doc.rootId)).find(
          (sid) => doc.getNode(sid)?.stype === 'components'
        ) as string;
        return childrenOf(doc.getNode(library)).map((sid) =>
          childrenOf(doc.getNode(sid)).map((child) => doc.getNode(child)?.stype)
        );
      };
      expect(cardsIn()).toEqual([
        ['componentBind', 'rectangle'],
        ['componentVar', 'componentBind', 'rectangle']
      ]);

      expect(await run('setDocumentVar', { name: '강조', remove: true })).toBe(true);
      /*
       * The first card's binding is gone with the declaration — a part pointing at a name nothing
       * declares draws whatever it last had, which is the one outcome worse than losing the colour.
       * The second card's is untouched: it was never pointing here, because a card is looked in
       * first (§10h).
       */
      expect(cardsIn()).toEqual([
        ['rectangle'],
        ['componentVar', 'componentBind', 'rectangle']
      ]);

      // And one press of undo puts the declaration and the binding back together.
      await (editor as never as { undo: () => Promise<unknown> }).undo();
      expect(documentVars(doc as never).map((one) => one.name)).toEqual(['강조']);
      expect(cardsIn()[0]).toEqual(['componentBind', 'rectangle']);
    });
  });
});
