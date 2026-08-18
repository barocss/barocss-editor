import { describe, it } from 'vitest';
import { assertConforms, drawnTagFrom } from '@barocss/conformance';
import { createSchema } from '@barocss/schema';
import { getGlobalRegistry } from '@barocss/dsl';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import { registerSlidesRenderers } from '../src/renderers';
import { createSlidesEditor } from '../src/slides-kit';
import { createSlideCommands } from '../src/slide-commands';
import { createBoxCommands } from '../src/box-commands';
import { createArrangeCommands } from '../src/arrange-commands';
import { createClipboardCommands } from '../src/clipboard-commands';
import { slidesToolbarCommands } from '../src/toolbar-model';
import { slidesKeyCommands } from '../src/keymap';

/**
 * What Slides promises, held to.
 *
 * This is what the harness was for. The checks Word had to discover — across
 * months, mostly in a browser — applied to the second product on its first day,
 * and its failures were a work list rather than a surprise. It started as a
 * ratchet at 64 of 64 undrawn, because Slides had registered nothing at all;
 * this is the same test with the renderers written, and it now asserts rather
 * than counts.
 *
 * Every exemption below is a decision on the record and a *claim*: if one of
 * these grows a renderer, this fails on the exemption rather than passing
 * quietly. That is the whole design — the operation roster allowed exemptions
 * with written reasons, fourteen went stale, and the checks they silenced
 * stayed off for months looking exactly like coverage.
 */
describe('Slides draws what its schema declares', () => {
  registerSlidesRenderers();

  const schema = createSchema('slides', getSlidesSchemaDefinition());
  const registry = getGlobalRegistry();

  /**
   * What each of Slides' insert commands puts in the document.
   *
   * Nine, where Word has twenty-three, which is the kit doing its job: a kit is
   * a product's answer to "what can be done here", and an answer that includes
   * things the product cannot draw is the wrong answer. Written out rather than
   * discovered — the engine cannot see inside a command, and a guess from the
   * name lies in both directions, which is how Word's list came to claim
   * `insertMention` made a node when it applies a mark.
   */
  const produces = [
    // Caught by `every-insert-is-accounted-for` within minutes of the command
    // being written, which is the whole reason that check exists.
    { command: 'insertSlide', produces: 'surface' },

    // One command per shape rather than `insertShape({ kind })`, because a
    // single command would have to answer "it depends" here — which is the
    // answer this check exists to refuse.
    { command: 'insertRectangle', produces: 'rectangle' },
    { command: 'insertEllipse', produces: 'ellipse' },
    { command: 'insertLine', produces: 'line' },
    // Not `insertImage`, which is the standard schema's and puts an
    // `inline-image` in a paragraph. A picture on a slide is placed.
    { command: 'insertPicture', produces: 'picture' },
    { command: 'insertTextBox', produces: 'textFrame' },

    { command: 'insertParagraph', produces: 'paragraph' },
    { command: 'insertHardBreak', produces: 'hardBreak' },
    { command: 'insertImage', produces: 'inline-image' },
    { command: 'insertTable', produces: 'bTable' },
    { command: 'insertRowAbove', produces: 'bTableRow' },
    { command: 'insertRowBelow', produces: 'bTableRow' },
    { command: 'insertColumnLeft', produces: 'bTableCell' },
    { command: 'insertColumnRight', produces: 'bTableCell' }
  ];

  /** Every command the kit registers, so `produces` can be checked for holes. */
  const commands = createSlidesEditor().commandNames();

  /**
   * The commands *this product* adds, measured rather than listed.
   *
   * A deck registers about a hundred and twenty and almost all of them are the
   * shared editing kit's — `moveCursorLeft`, `deleteWordBackward`,
   * `splitListItem` — which no toolbar should be asked to carry. The difference
   * between an editor built with Slides' own extensions and one built with none
   * is exactly the set this product is answerable for, and measuring it means
   * there is no list here to forget to update.
   */
  const own = (() => {
    const bare = new Set(createSlidesEditor({ kit: [] }).commandNames());
    const mine = createSlidesEditor({
      kit: [
        createSlideCommands(),
        createBoxCommands(),
        createArrangeCommands(),
        createClipboardCommands()
      ]
    }).commandNames();
    return mine.filter((name: string) => !bare.has(name));
  })();

  /**
   * What a reader can actually reach: the toolbar, and the keys.
   *
   * Both read from the product's own declarations rather than from the app, so
   * this cannot drift from what is installed — which is why a deck's key map is
   * data in the package and not a handler in the host.
   */
  const reachable = [...slidesToolbarCommands(), ...slidesKeyCommands()];

  it('draws what it declares, expects only what it says it expects', () => {
    assertConforms({
      schema: schema as never,
      hasRenderer: (nodeType) => registry.has(nodeType),
      // Taken from the renderers rather than written down; see `drawnTagFrom`.
      drawnAs: drawnTagFrom(registry as never),
      produces,
      commands,
      own,
      reachable,
      exempt: {
        // ── Reached somewhere other than the toolbar or a key ──────────────
        // Each of these is run from a control a reader can point at; the check
        // can see the toolbar and the key map and nothing else, so where it is
        // reached is written down here and fails if it stops being true.
        setBoxGeometry: 'the properties panel — position, size and rotation',
        setBoxStyle: 'the properties panel — fill, stroke, corner radius',
        setBoxLocked: 'the properties panel — the lock, which needs its own command',
        setDeckSize: 'the slide-size dialog',
        setSlideLayout: 'the layout dialog',
        addSlideNote: 'the button in the notes pane, shown when a slide has no note',

        // ── Commands that put no node in the document ──────────────────────
        insertText: 'writes characters into a run; makes no node',

        // ── A board's, not a deck's ────────────────────────────────────────
        // Reachable, because a slide is a canvas surface and these are scene
        // nodes. Slides registers no command for any of them, so nothing in
        // this product can make one — but a board pasted into a deck could
        // carry them, and then they would draw nothing. Logged rather than
        // called fine.
        connector: 'a board arrow between two nodes; a deck has no arrows yet',
        component: 'a reusable canvas definition; a deck has no components',
        instance: 'a placement of one; a deck has no components',

        // ── Inherited from the standard schema ─────────────────────────────
        // The office schema is built on the standard one and takes its whole
        // node set, so every product pays this tax and writes almost the same
        // list. Word writes it too, which is the second proof that the office
        // schema should declare what it offers rather than inheriting
        // everything — one product's list is an opinion, two identical lists
        // are a design fault. See docs/BACKLOG.md.
        //
        // None has a command in Slides' kit, so no reader can make one; a
        // document that arrived holding one would draw nothing.
        callout: 'inherited; a deck offers no callouts',
        taskItem: 'inherited; a deck offers no checklists',
        pullQuote: 'inherited; a deck offers no pull quotes',
        columns: 'inherited; a slide places boxes instead of splitting a column',
        column: 'inherited; reachable through columns, which a deck does not offer',
        docSection: 'inherited; a deck has slides, not sections',
        toc: 'inherited; a deck has no contents page',
        bDetails: 'inherited; a deck offers no disclosure blocks',
        bSummary: 'inherited; reachable through bDetails',
        bFigure: 'inherited; a deck places a picture rather than captioning one in the flow',
        bFigcaption: 'inherited; reachable through bFigure',
        descList: 'inherited; a deck offers no description lists',
        descTerm: 'inherited; a deck offers no description lists',
        descDef: 'inherited; a deck offers no description lists',
        mathInline: 'inherited; a deck offers no equations yet',
        mathBlock: 'inherited; a deck offers no equations yet',
        mediaVideo: 'inherited; a deck embeds no media yet',
        mediaAudio: 'inherited; a deck embeds no media yet',
        mediaEmbed: 'inherited; a deck embeds no media yet',
        chart: 'inherited; a deck offers no charts yet',
        emoji: 'inherited; a deck types emoji as text',
        fieldPageNumber: 'inherited; a slide has no page number',
        fieldPageCount: 'inherited; a slide has no page number'
      }
    });
  });
});
