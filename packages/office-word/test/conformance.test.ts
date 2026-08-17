import { describe, it, expect } from 'vitest';
import { assertConforms } from '@barocss/conformance';
import { createSchema } from '@barocss/schema';
import { getWordSchemaDefinition } from '../src/word-schema';
import { createWordEditor } from '../src/word-kit';
import { getGlobalRegistry } from '@barocss/dsl';
import { registerWordRenderers } from '../src/renderers';

/**
 * What Word promises, held to.
 *
 * The schema is a promise about what a document may contain, and until now
 * nothing checked that the product could draw what it promised. It could not:
 * more than half the declared node types had no renderer, and the whole scene
 * set — the second document shape a `surface` can hold — sat there for as long
 * as the schema had existed.
 *
 * Every exemption below is a decision on the record. It is also a *claim*: if
 * one of these grows a renderer, this test fails on the exemption rather than
 * passing quietly. That is deliberate and it is the whole design — the
 * operation roster allowed exemptions with written reasons, fourteen went
 * stale, and the checks they silenced stayed off for months looking exactly
 * like coverage.
 */
describe('Word draws what its schema declares', () => {
  registerWordRenderers();

  /**
 * Word's own schema, not the office base it extends.
 *
 * This asked the base schema first, and the check that asks whether a command's
 * node exists caught it: `insertTab` and `insertColumnBreak` both looked
 * impossible, and both work — Word declares `tab` and `columnBreak` itself. A
 * harness pointed at the wrong subject reports on something nobody ships.
 */
const schema = createSchema('word', getWordSchemaDefinition());
  const registry = getGlobalRegistry();

  /**
   * What each of Word's insert commands puts in the document.
   *
   * Written out rather than discovered: a command is a function and the engine
   * cannot see what it makes, and a guess from the name would be a check that
   * lies in both directions. The cost of writing it is the point — a new
   * command added without a line here is a command this check does not cover,
   * and that is visible in the diff.
   */
  const produces = [
    { command: 'insertParagraph', produces: 'paragraph' },
    { command: 'insertHardBreak', produces: 'hardBreak' },
    { command: 'insertLineBreak', produces: 'hardBreak' },
    { command: 'insertImage', produces: 'inline-image' },
    { command: 'insertHorizontalRule', produces: 'horizontalRule' },
    { command: 'insertPageBreak', produces: 'pageBreak' },
    { command: 'insertColumnBreak', produces: 'columnBreak' },
    { command: 'insertTab', produces: 'tab' },
    { command: 'insertTable', produces: 'bTable' },
    { command: 'insertRowAbove', produces: 'bTableRow' },
    { command: 'insertRowBelow', produces: 'bTableRow' },
    { command: 'insertColumnLeft', produces: 'bTableCell' },
    { command: 'insertColumnRight', produces: 'bTableCell' },
    { command: 'insertBookmark', produces: 'bookmarkAnchor' },
    { command: 'insertFootnote', produces: 'footnoteDef' },
    { command: 'insertComment', produces: 'commentThread' }
  ];


  /**
   * Every command Word registers, so the harness can ask whether `produces` is
   * complete. Built by standing an editor up, because a list of commands
   * written by hand is the thing this check exists to distrust.
   */
  const commands = createWordEditor().commandNames();

  const held = () =>
    assertConforms({
      schema: schema as never,
      hasRenderer: (nodeType) => registry.has(nodeType),
      produces,
      commands,
      exempt: {
        // ── Commands that put no node in the document ──────────────────────
        // Named `insert…` because that is what they do to the *text*, which is
        // what the completeness check cannot tell from a name and why it asks.
        insertText: 'writes characters into a run; makes no node',
        insertMention: 'applies a mark over a range, not a node',
        insertFootnoteRef: 'a mark over a range, not a node',
        insertFieldPageNumber: 'a mark over a range, not a node',
        insertFieldPageCount: 'a mark over a range, not a node',
        insertFieldDateTime: 'a mark over a range, not a node',
        insertFieldDocTitle: 'a mark over a range, not a node',
        insertFieldAuthor: 'a mark over a range, not a node',

        // ── The other half of a `surface` ──────────────────────────────────
        // `office-schema` declares `surface` as `block+ | scene*` — a page
        // holds blocks, a slide or a board holds scene nodes — and Word is the
        // product for the first half. `packages/office-slides` draws these.
        frame: 'a slide/board container; Word has no canvas surface',
        group: 'a slide/board grouping; Word has no canvas surface',
        sticky: 'a board note; Word has no board',
        connector: 'a board arrow between two nodes; Word has no board',
        textFrame: 'rich text placed on a canvas; Word anchors text to the flow instead',
        component: 'a reusable canvas definition; Word has no components',
        instance: 'a placement of one; Word has no components',

        // ── Reachable, and drawing nothing. These are defects ──────────────
        // `word-kit` calls `createRichExtensions()`, which is the whole
        // rich-editor bundle — so Word registers an insert command for each of
        // these and has no renderer for any of them. Measured in the running
        // app: `insertCallout` reports success, puts a `callout` in the
        // document, and draws nothing. The reader's text is in the model and
        // invisible on the page.
        //
        // Not "fine by design". Logged in docs/BACKLOG.md, and kept here so the
        // list is visible and so fixing one without deleting its line fails.
        callout: 'BUG: insertCallout is registered and nothing draws a callout',
        taskItem: 'a checklist item; Word offers no checklists',
        pullQuote: 'BUG: insertPullQuote is registered and nothing draws it',
        columns: 'BUG: insertColumns is registered and nothing draws it',
        column: 'BUG: reachable through insertColumns; nothing draws it',
        toc: 'BUG: the standard schema’s toc is reachable; Word draws its own tableOfContents',
        bDetails: 'BUG: insertDetails is registered and nothing draws it',
        bSummary: 'BUG: reachable through insertDetails; nothing draws it',
        bFigure: 'BUG: insertFigure is registered and nothing draws it',
        bFigcaption: 'BUG: reachable through insertFigure; nothing draws it',
        chart: 'BUG: a chart command is registered and nothing draws it',
        docSection: 'BUG: reachable and nothing draws it',
        mathInline: 'BUG: reachable; Word draws equations from OMML names, not this one',

        // ── Drawn by something other than a renderer ───────────────────────
        // A footnote is drawn at the foot of the page its reference is on, by
        // the layout pass; a comment is drawn in the pane beside the document,
        // by the app. Both are `resource` nodes — declared out of the flow on
        // purpose — so the registry has nothing for them and should not.
        insertFootnote: 'the body is drawn at the foot of its page by the layout pass',
        insertComment: 'the thread is drawn in the comments pane by the app',

        // ── Inherited and unreachable. Harmless today ──────────────────────
        // The office schema is built on the standard schema and takes its whole
        // node set. These have no command in Word's kit, so no reader can make
        // one — but a document that arrived holding one would draw nothing, and
        // that is the argument for the office schema declaring what it offers
        // rather than inheriting everything.
        mathBlock: 'inherited from the standard schema; Word draws OMML equations instead',
        descList: 'inherited from the standard schema; Word offers no description lists',
        descTerm: 'inherited from the standard schema; Word offers no description lists',
        descDef: 'inherited from the standard schema; Word offers no description lists',
        mediaVideo: 'inherited from the standard schema; Word embeds no media',
        mediaAudio: 'inherited from the standard schema; Word embeds no media',
        mediaEmbed: 'inherited from the standard schema; Word embeds no media',
        emoji: 'inherited from the standard schema; Word types emoji as text',
        fieldPageNumber: 'inherited; Word draws page numbers as furniture, not as a node',
        fieldPageCount: 'inherited; Word draws page numbers as furniture, not as a node'
      }
    });

  it('draws what it declares, expects only what it says it expects', () => {
    // One call, every check. A check added to the harness applies here without
    // this file changing — which is the difference between a harness and a
    // thing every product has to remember to assert.
    held();
  });
});
