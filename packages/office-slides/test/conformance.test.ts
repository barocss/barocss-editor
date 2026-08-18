import { describe, it } from 'vitest';
import { assertConforms, drawnTagFrom } from '@barocss/conformance';
import { createSchema } from '@barocss/schema';
import { getGlobalRegistry } from '@barocss/dsl';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import { registerSlidesRenderers } from '../src/renderers';
import { createSlidesEditor } from '../src/slides-kit';

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

  it('draws what it declares, expects only what it says it expects', () => {
    assertConforms({
      schema: schema as never,
      hasRenderer: (nodeType) => registry.has(nodeType),
      // Taken from the renderers rather than written down; see `drawnTagFrom`.
      drawnAs: drawnTagFrom(registry as never),
      produces,
      commands,
      exempt: {
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
