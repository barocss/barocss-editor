import { describe, it, expect } from 'vitest';
import { conformance, describeReport } from '@barocss/conformance';
import { createSchema, getOfficeSchemaDefinition } from '@barocss/schema';
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

  const schema = createSchema('office', getOfficeSchemaDefinition());
  const registry = getGlobalRegistry();

  const report = () =>
    conformance({
      schema: schema as never,
      hasRenderer: (nodeType) => registry.has(nodeType),
      exempt: {
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
        taskItem: 'BUG: reachable through insertChecklist, which draws; its items do not',
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

  it('draws every node type it does not say it leaves alone', () => {
    const result = report();
    expect(result.findings, `\n${describeReport(result)}\n`).toEqual([]);
  });

  it('has no exemption that stopped being true', () => {
    // The fourteen-stale-notes case, made impossible to repeat: an exemption
    // for something that now has a renderer is a failure, not a pass.
    const result = report();
    expect(result.staleExemptions, `\n${describeReport(result)}\n`).toEqual([]);
  });

  it('looked at every node type that is content', () => {
    // A check that examines nothing passes; this is what says it did not.
    const result = report();
    expect(result.examined['every-node-is-drawn']).toBeGreaterThan(20);
  });
});
