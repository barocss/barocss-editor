import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore, DataStoreExporter } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import type { Editor } from '@barocss/editor-core';
import {
  documentVars,
  surfaceVars,
  varInScope,
  variableSourceOf,
  varUses
} from '@barocss/office-word';
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

  /**
   * The same, for **one page**.
   *
   * A page's declaration hangs from the page itself (`variable*` first among its children), where the
   * document's hangs from a `variables` container — two scopes, two commands, one writer.
   */
  describe('declaring one for a single slide', () => {
    const slide = () => childrenOf(doc.getNode(doc.rootId))[0];
    const canSlide = (payload?: unknown) =>
      (editor as never as { canExecuteCommand: (name: string, payload?: unknown) => boolean })
        .canExecuteCommand('setSlideVar', payload);

    it('refuses a page that is not one, and a nameless variable', () => {
      expect(canSlide({ slideId: slide(), name: '강조' })).toBe(true);
      expect(canSlide({ slideId: slide() })).toBe(false);
      expect(canSlide({ name: '강조' })).toBe(false);
      // A box is not a page: a declaration hung from it would be a `variable` the content model of
      // that node never allowed, and the transaction would be refused after the fact.
      expect(canSlide({ slideId: box(), name: '강조' })).toBe(false);
      // And removing one the page has not got is a gesture with no answer.
      expect(canSlide({ slideId: slide(), name: '없음', remove: true })).toBe(false);
    });

    it('writes it into the page, first among its children', async () => {
      expect(await run('setSlideVar', { slideId: slide(), name: '강조', kind: 'color', value: '#b45309' })).toBe(
        true
      );
      /*
       * `variable* (block+ | (scene | frame)*)` is an order: appended, the declaration would land
       * after the shapes and be refused — the same lesson `documentChildSpot` came from one level up.
       */
      expect(childrenOf(doc.getNode(slide())).map((sid) => doc.getNode(sid)?.stype)).toEqual([
        'variable',
        'rectangle'
      ]);
      expect(surfaceVars(doc as never, slide()).map((one) => one.value)).toEqual(['#b45309']);
      // And the document has none: this is the page's own, and nothing else changed.
      expect(documentVars(doc as never)).toEqual([]);
    });

    it('is what a shape on that page means, over the document', async () => {
      await run('setDocumentVar', { name: '강조', kind: 'color', value: '#0f766e' });
      await run('setBoxStyle', { nodeIds: [box()], fill: 'var:강조' });
      await run('setSlideVar', { slideId: slide(), name: '강조', kind: 'color', value: '#b45309' });

      // The narrower scope wins, which is the whole of what a page's variables are for.
      expect(varInScope(doc as never, box(), '강조')?.value).toBe('#b45309');

      // Taking the page's away leaves the document's, and the shape keeps drawing something.
      expect(await run('setSlideVar', { slideId: slide(), name: '강조', remove: true })).toBe(true);
      expect(varInScope(doc as never, box(), '강조')?.value).toBe('#0f766e');
    });

    it('takes one press of undo to make and to unmake', async () => {
      await run('setSlideVar', { slideId: slide(), name: '강조', value: '#b45309' });
      await (editor as never as { undo: () => Promise<unknown> }).undo();
      expect(surfaceVars(doc as never, slide())).toEqual([]);
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

  /**
   * What a **shape** takes from one, which is the half a reference could not do.
   *
   * A reference commits into a string attribute and is refused in a number or a boolean — measured,
   * §10h — so a bare shape's corner radius, opacity, state and words need a *declaration* on the
   * shape. What a command has to get right is the refusals and what the document looks like after.
   */
  describe('binding a shape to one', () => {
    const canBind = (payload?: unknown) =>
      (editor as never as { canExecuteCommand: (name: string, payload?: unknown) => boolean })
        .canExecuteCommand('setVarBind', payload);

    beforeEach(async () => {
      await run('setDocumentVar', { name: '둥글기', kind: 'number', value: '240' });
      await run('setDocumentVar', { name: '보이기', kind: 'boolean', value: 'false' });
    });

    it('refuses an attribute the shape does not declare, and allows every part of its box', () => {
      /*
       * Geometry reaches a shape by being **written** rather than drawn (§10h-2), so all of it can be
       * bound — including the place and the turn, which were refused until the *behaviour* was fixed:
       * the drag is now refused before it previews, so nothing follows the pointer and jumps back.
       */
      for (const attr of ['x', 'y', 'rotation', 'width', 'height']) {
        expect(canBind({ nodeIds: [box()], attr, var: '둥글기' })).toBe(true);
      }
      // The check the schema cannot make: a content model cannot see across to another node's
      // attributes, so the command asks the schema what this shape declares.
      expect(canBind({ nodeIds: [box()], attr: 'notAThing', var: '둥글기' })).toBe(false);
      expect(canBind({ nodeIds: [box()], attr: 'cornerRadius', var: '둥글기' })).toBe(true);
      // And a variable that is not declared: a binding pointing at nothing is a shape that draws
      // whatever it last had, with nothing saying why.
      expect(canBind({ nodeIds: [box()], attr: 'cornerRadius', var: '없음' })).toBe(false);
      // Taking one off is always allowed, because it can only ever remove something.
      expect(canBind({ nodeIds: [box()], attr: 'cornerRadius', var: null })).toBe(true);
    });

    it('writes one declaration, and replaces it rather than adding a second', async () => {
      expect(await run('setVarBind', { nodeIds: [box()], attr: 'cornerRadius', var: '둥글기' })).toBe(true);
      expect(doc.getNode(box())?.attributes?.varBinds).toEqual([
        { attr: 'cornerRadius', var: '둥글기' }
      ]);

      await run('setVarBind', { nodeIds: [box()], attr: 'visible', var: '보이기' });
      await run('setVarBind', { nodeIds: [box()], attr: 'cornerRadius', var: '보이기' });
      /*
       * One entry per attribute: two about `cornerRadius` would be a shape whose corners depended on
       * which the resolution read last.
       */
      expect(doc.getNode(box())?.attributes?.varBinds).toEqual([
        { attr: 'visible', var: '보이기' },
        { attr: 'cornerRadius', var: '보이기' }
      ]);
    });

    it('writes the list away entirely when the last one goes', async () => {
      await run('setVarBind', { nodeIds: [box()], attr: 'cornerRadius', var: '둥글기' });
      expect(await run('setVarBind', { nodeIds: [box()], attr: 'cornerRadius', var: null })).toBe(true);
      // Absent, not empty: a shape that takes nothing from a variable is the ordinary case, and an
      // empty array on every shape is noise in the file.
      expect(doc.getNode(box())?.attributes?.varBinds).toBeUndefined();
    });

    it('draws the bound value, and leaves the document saying what it said', async () => {
      await run('setVarBind', { nodeIds: [box()], attr: 'cornerRadius', var: '둥글기' });

      /*
       * Through the store's own resolution — the proxy the view reads children with — because that
       * is where a bound attribute is answered: `attrsOf` is read in 62 places inside the renderers
       * and has no document to look a variable up in.
       */
      const proxy = new DataStoreExporter(store as never).toProxy(doc.rootId) as never as {
        content: { content: { attributes: Record<string, unknown> }[] }[];
      };
      const drawn = proxy.content[0].content[0];
      expect(drawn.attributes.cornerRadius).toBe(240);

      // And the document is untouched: the shape says what it takes, not what it took. Changing the
      // variable is one write, and nothing on any slide has to be rewritten.
      expect(doc.getNode(box())?.attributes?.cornerRadius).toBeUndefined();
    });
  });

  /**
   * A **size** a variable owns, which is the half that had to be written rather than drawn.
   *
   * Counted before it was designed: the geometry is read by `boxOf` in 31 places across 14 files —
   * the outline, the handles, the guides, the snapping, alignment, group bounds, the audit's "off the
   * edge" check — so a size that was only resolved for the drawing would be answered differently by
   * every one of them. The pass that already settles derived geometry writes it instead, which is
   * the same trade the arrangement made and for the same reason.
   */
  describe('a size a variable owns', () => {
    /** The pass runs on the document change, so its write lands after the await. */
    const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

    beforeEach(async () => {
      await run('setDocumentVar', { name: '카드폭', kind: 'number', value: '2400' });
    });

    it('is written into the document, so every reader of the geometry keeps working', async () => {
      expect(await run('setVarBind', { nodeIds: [box()], attr: 'width', var: '카드폭' })).toBe(true);
      await settle();

      // In the document — not only in the drawing — which is the whole decision.
      expect(doc.getNode(box())?.attributes?.width).toBe(2400);
    });

    it('follows the variable when it changes, in one write per shape', async () => {
      await run('setVarBind', { nodeIds: [box()], attr: 'width', var: '카드폭' });
      await settle();
      await run('setDocumentVar', { name: '카드폭', value: '3600' });
      await settle();
      expect(doc.getNode(box())?.attributes?.width).toBe(3600);
    });

    it('refuses the reader’s own place too, and only what the variable owns', async () => {
      await run('setDocumentVar', { name: '왼쪽', kind: 'number', value: '1200' });
      await run('setVarBind', { nodeIds: [box()], attr: 'x', var: '왼쪽' });
      await settle();

      // Written, like a size: the document holds the number, so every reader of the geometry works.
      expect(doc.getNode(box())?.attributes?.x).toBe(1200);

      const can = (payload: unknown) =>
        (editor as never as { canExecuteCommand: (n: string, p?: unknown) => boolean })
          .canExecuteCommand('setBoxGeometry', payload);

      /*
       * The drag ends in this command, so refusing here is what stops a shape being written back
       * behind the reader — and the overlay refuses the drag *before* it previews, so nothing follows
       * the pointer and jumps back.
       */
      expect(can({ nodeIds: [box()], x: 500 })).toBe(false);
      // Its size is still its own: one binding takes one gesture away, not all of them.
      expect(can({ nodeIds: [box()], width: 2000 })).toBe(true);
    });

    it('refuses the reader’s own size, rather than being written back behind them', async () => {
      await run('setVarBind', { nodeIds: [box()], attr: 'width', var: '카드폭' });
      await settle();

      /*
       * A width typed here would be put straight back by the next pass: the command would report
       * success, the shape would not change, and undo would do nothing. So it is refused — and the
       * panel greys the two fields and says why, and the overlay draws no resize handles.
       */
      expect(
        (editor as never as { canExecuteCommand: (n: string, p?: unknown) => boolean })
          .canExecuteCommand('setBoxGeometry', { nodeIds: [box()], width: 9999 })
      ).toBe(false);
      // The position is still the reader's: only what the variable owns is refused.
      expect(
        (editor as never as { canExecuteCommand: (n: string, p?: unknown) => boolean })
          .canExecuteCommand('setBoxGeometry', { nodeIds: [box()], x: 500 })
      ).toBe(true);
    });

    it('lets the frame that arranges it win, because that is where the reader put it', async () => {
      /*
       * A child told to fill its frame *and* bound to a variable is a contradiction the reader made.
       * Both answers are decided in one pass, the container's after the binding's, so there is
       * nothing to oscillate — and the frame wins, because it is a consequence of where the shape is.
       */
      await (editor as never as {
        transaction: (steps: unknown[]) => { commit: () => Promise<unknown> };
      })
        .transaction([
          {
            type: 'addChild',
            payload: {
              parentId: childrenOf(doc.getNode(doc.rootId))[0],
              child: {
                stype: 'frame',
                attributes: { x: 0, y: 0, width: 6000, height: 3000, layoutMode: 'column', padding: 0 },
                content: [
                  {
                    stype: 'rectangle',
                    attributes: {
                      x: 0,
                      y: 0,
                      width: 1000,
                      height: 400,
                      layoutStretch: true,
                      varBinds: [{ attr: 'width', var: '카드폭' }]
                    }
                  }
                ]
              }
            }
          }
        ])
        .commit();
      await settle();

      const slide = childrenOf(doc.getNode(doc.rootId))[0];
      const frame = childrenOf(doc.getNode(slide)).find(
        (sid) => doc.getNode(sid)?.stype === 'frame'
      ) as string;
      const row = childrenOf(doc.getNode(frame))[0];
      expect(doc.getNode(row)?.attributes?.width).toBe(6000);
    });
  });

  /**
   * Bringing one in from **another deck**.
   *
   * The command's own half of the brand kit: what the document looks like afterwards, and that one
   * press of undo takes it back. What a *plan* is is tested in milliseconds next door.
   */
  describe('importing one from a library deck', () => {
    /** A brand kit, as a parsed deck rather than a file: storage is the host's business (§11i). */
    const brand = () => ({
      stype: 'document',
      attributes: {},
      content: [
        { stype: 'surface', attributes: { kind: 'slide' }, content: [] },
        {
          stype: 'variables',
          content: [
            {
              stype: 'variable',
              attributes: { name: '강조', kind: 'color', label: '브랜드 강조', value: '#0f766e' }
            }
          ]
        }
      ]
    });

    const canImport = (payload?: unknown) =>
      (editor as never as { canExecuteCommand: (name: string, payload?: unknown) => boolean })
        .canExecuteCommand('importVariable', payload);

    it('refuses a deck that declares nothing of that name', () => {
      expect(canImport({ deck: 'brand-kit', name: '강조', source: brand() })).toBe(true);
      expect(canImport({ deck: 'brand-kit', name: '없음', source: brand() })).toBe(false);
      expect(canImport({ name: '강조', source: brand() })).toBe(false);
      expect(canImport({ deck: 'brand-kit', name: '강조' })).toBe(false);
    });

    it('adds it with where it came from, in one entry', async () => {
      expect(await run('importVariable', { deck: 'brand-kit', name: '강조', source: brand() })).toBe(
        true
      );

      const [found] = documentVars(doc as never);
      expect([found.name, found.value, found.label]).toEqual(['강조', '#0f766e', '브랜드 강조']);
      expect(variableSourceOf(doc as never, '강조')).toEqual({
        deck: 'brand-kit',
        value: '#0f766e'
      });

      // The container came with it, and one press of undo takes back the whole gesture.
      await (editor as never as { undo: () => Promise<unknown> }).undo();
      expect(documentVars(doc as never)).toEqual([]);
      expect(childrenOf(doc.getNode(doc.rootId)).map((sid) => doc.getNode(sid)?.stype)).toEqual([
        'surface'
      ]);
    });

    it('replaces the value under a name this deck already uses, and nothing else', async () => {
      await run('setDocumentVar', { name: '강조', kind: 'color', value: '#b45309' });
      await run('setBoxStyle', { nodeIds: [box()], fill: 'var:강조' });

      expect(await run('importVariable', { deck: 'brand-kit', name: '강조', source: brand() })).toBe(
        true
      );

      /*
       * One declaration, the library's value under it — and the shape that names it is untouched,
       * which is the point: the name is the reference, so changing the value reaches everything that
       * names it without rewriting any of them.
       */
      expect(documentVars(doc as never).map((one) => one.value)).toEqual(['#0f766e']);
      expect(doc.getNode(box())?.attributes?.fill).toBe('var:강조');
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

  /**
   * Renaming one, which is a **migration** and not an edit.
   *
   * The name is the reference, so the declaration is the last thing a rename changes and the least
   * of it. The walk is tested in `office-word`; what a command has to answer is what the document
   * looks like afterwards and whether one undo takes the whole thing back — because a half-renamed
   * deck is a deck where some shapes draw nothing, and undoing it one shape at a time is not a
   * thing a reader can do.
   */
  describe('renaming one', () => {
    const canRename = (command: string, payload?: unknown) =>
      (editor as never as { canExecuteCommand: (name: string, payload?: unknown) => boolean })
        .canExecuteCommand(command, payload);

    it('rewrites the reference, the binding and the declaration, and undoes as one', async () => {
      await run('setDocumentVar', { name: '강조', kind: 'color', value: '#0f766e' });
      await run('setBoxStyle', { nodeIds: [box()], fill: 'var:강조' });
      await run('setDocumentVar', { name: '폭', kind: 'number', value: '2400' });
      await run('setVarBind', { nodeId: box(), attr: 'width', var: '폭' });

      expect(await run('renameDocumentVar', { name: '강조', to: '포인트' })).toBe(true);
      expect(documentVars(doc as never).map((one) => one.name)).toEqual(['강조', '폭'].map(
        (one) => (one === '강조' ? '포인트' : one)
      ));
      expect(doc.getNode(box())?.attributes?.fill).toBe('var:포인트');
      // The value did not move, which is the whole point: only the name it is known by changed.
      expect(varInScope(doc as never, box(), '포인트')?.value).toBe('#0f766e');
      // And the other variable's binding on the same shape is untouched.
      expect(doc.getNode(box())?.attributes?.varBinds).toEqual([{ attr: 'width', var: '폭' }]);

      expect(await run('renameDocumentVar', { name: '폭', to: '카드폭' })).toBe(true);
      expect(doc.getNode(box())?.attributes?.varBinds).toEqual([{ attr: 'width', var: '카드폭' }]);

      /*
       * One transaction, so one undo. The shape's binding and the declaration go back together —
       * either of them alone is a deck that draws the wrong thing.
       */
      await (editor as never as { undo: () => Promise<unknown> }).undo();
      expect(doc.getNode(box())?.attributes?.varBinds).toEqual([{ attr: 'width', var: '폭' }]);
      expect(documentVars(doc as never).map((one) => one.name)).toEqual(['포인트', '폭']);
    });

    it('leaves a page that declares the same name alone', async () => {
      const slide = childrenOf(doc.getNode(doc.rootId))[0];
      // Held before the page declares anything: a page's variable is written **first** among its
      // children, so `box()` would answer the declaration from here on.
      const shape = box();
      await run('setDocumentVar', { name: '강조', kind: 'color', value: '#0f766e' });
      await run('setSlideVar', { slideId: slide, name: '강조', kind: 'color', value: '#ef4444' });
      await run('setBoxStyle', { nodeIds: [shape], fill: 'var:강조' });

      // The shape is on the page that declares its own, so its reference means the page's.
      expect(await run('renameDocumentVar', { name: '강조', to: '포인트' })).toBe(true);
      expect(doc.getNode(shape)?.attributes?.fill).toBe('var:강조');
      expect(surfaceVars(doc as never, slide).map((one) => one.name)).toEqual(['강조']);
      expect(documentVars(doc as never).map((one) => one.name)).toEqual(['포인트']);

      // Renaming the page's own is what reaches it.
      expect(await run('renameSlideVar', { slideId: slide, name: '강조', to: '이 장의 강조' })).toBe(true);
      expect(doc.getNode(shape)?.attributes?.fill).toBe('var:이 장의 강조');
    });

    it('refuses a rename that would merge two variables, and one that says nothing', async () => {
      const slide = childrenOf(doc.getNode(doc.rootId))[0];
      await run('setDocumentVar', { name: '강조', kind: 'color', value: '#0f766e' });
      await run('setDocumentVar', { name: '바탕', kind: 'color', value: '#ffffff' });

      // Onto a name this scope already declares: two variables become one and half the deck
      // quietly changes colour. Nobody asked for that — the reader is editing a name.
      expect(canRename('renameDocumentVar', { name: '강조', to: '바탕' })).toBe(false);
      expect(canRename('renameDocumentVar', { name: '강조', to: '강조' })).toBe(false);
      expect(canRename('renameDocumentVar', { name: '강조', to: '' })).toBe(false);
      expect(canRename('renameDocumentVar', { name: '없는이름', to: '포인트' })).toBe(false);
      expect(await run('renameDocumentVar', { name: '강조', to: '바탕' })).toBe(false);

      /*
       * A **page's** may take a name the document declares, because a page's declaration was
       * already shadowing whatever the document said — refusing it would refuse a legitimate edit
       * for a clash that does not exist.
       */
      await run('setSlideVar', { slideId: slide, name: '이 장', kind: 'color', value: '#ef4444' });
      expect(canRename('renameSlideVar', { slideId: slide, name: '이 장', to: '바탕' })).toBe(true);
    });
  });
});
