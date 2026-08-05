import type { INode } from '@barocss/datastore';

/**
 * A document that exercises the parts of Word the engine has never rendered.
 *
 * Written in the Office shape — `document → docMeta? surface+ resources?` — because
 * that is the first thing to prove: every existing demo still roots at
 * `document → block+`, so this is the migration target as much as a fixture.
 *
 * It deliberately contains, in one file:
 *   - a title in `docMeta`, not in the flow
 *   - styles with a `basedOn` chain, so cascade order is visible on screen
 *   - a multi-level numbering definition, so counters and formats are visible
 *   - a table with a merged cell, so span handling is visible
 *   - a footnote body in `resources`, which used to be legal in the flow
 */
export function createSampleDocument(): INode {
  return {
    stype: 'document',
    attributes: {},
    content: [
      {
        stype: 'docMeta',
        attributes: {},
        content: [
          {
            stype: 'docTitle',
            attributes: {},
            content: [{ stype: 'inline-text', text: 'Barocss Word' }]
          },
          {
            stype: 'docSubtitle',
            attributes: {},
            content: [
              { stype: 'inline-text', text: 'One engine, one schema, four products' }
            ]
          }
        ]
      },

      {
        stype: 'surface',
        attributes: {
          kind: 'flow',
          name: 'Section 1',
          headerId: 'hdr-main',
          firstPageHeaderId: 'hdr-first',
          footerId: 'ftr-main',
          pageWidth: 12240,
          pageHeight: 15840,
          marginTop: 1440,
          marginBottom: 1440,
          marginLeft: 1440,
          marginRight: 1440
        },
        content: [
          {
            stype: 'heading',
            attributes: { level: 1, styleId: 'Heading1' },
            content: [{ stype: 'inline-text', text: 'Contents' }]
          },
          // Generated, never stored: the page numbers are a fact about the
          // current layout, not about the document.
          { stype: 'tableOfContents', attributes: { levels: '1-2' }, content: [] },
          {
            stype: 'heading',
            attributes: { level: 1, styleId: 'Heading1' },
            content: [{ stype: 'inline-text', text: 'Styles cascade' }]
          },
          {
            stype: 'paragraph',
            attributes: { styleId: 'Body' },
            content: [
              { stype: 'inline-text', text: 'This paragraph takes its font from ' },
              {
                stype: 'inline-text',
                text: 'Normal',
                marks: [{ stype: 'code', range: [0, 6] }]
              },
              {
                stype: 'inline-text',
                text: ', its spacing from Body, and nothing from itself.'
              }
            ]
          },
          {
            stype: 'paragraph',
            attributes: { styleId: 'Body', alignment: 'center' },
            content: [
              {
                stype: 'inline-text',
                text: 'Direct formatting wins: this one is centred even though Body is not.'
              }
            ]
          },

          {
            // Tracked changes are marks because they cover a range, and the same
            // range can carry an insertion and a comment at once.
            stype: 'paragraph',
            attributes: { styleId: 'Body' },
            content: [
              { stype: 'inline-text', text: 'Revisions are drawn, not applied: ' },
              {
                stype: 'inline-text',
                text: 'this was added',
                marks: [
                  { stype: 'insertion', range: [0, 14], attrs: { id: 'r1', author: 'Jinho', date: '2026-08-05' } }
                ]
              },
              { stype: 'inline-text', text: ' and ' },
              {
                stype: 'inline-text',
                text: 'this was removed',
                marks: [
                  { stype: 'deletion', range: [0, 16], attrs: { id: 'r2', author: 'Sujin', date: '2026-08-05' } }
                ]
              },
              { stype: 'inline-text', text: '.' }
            ]
          },
          {
            stype: 'heading',
            attributes: { level: 2, styleId: 'Heading2' },
            content: [{ stype: 'inline-text', text: 'Numbering is computed' }]
          },
          {
            stype: 'paragraph',
            attributes: { styleId: 'Body', numId: 'outline', numLevel: 0 },
            content: [{ stype: 'inline-text', text: 'First top-level item' }]
          },
          {
            stype: 'paragraph',
            attributes: { styleId: 'Body', numId: 'outline', numLevel: 1 },
            content: [{ stype: 'inline-text', text: 'A nested item' }]
          },
          {
            stype: 'paragraph',
            attributes: { styleId: 'Body', numId: 'outline', numLevel: 2 },
            content: [{ stype: 'inline-text', text: 'Deeper still, in roman' }]
          },
          {
            stype: 'paragraph',
            attributes: { styleId: 'Body', numId: 'outline', numLevel: 1 },
            content: [{ stype: 'inline-text', text: 'Back out one level' }]
          },
          {
            stype: 'paragraph',
            attributes: { styleId: 'Body', numId: 'outline', numLevel: 0 },
            content: [
              { stype: 'inline-text', text: 'Second top-level item — the deeper counters restart' }
            ]
          },

          {
            stype: 'heading',
            attributes: { level: 2, styleId: 'Heading2' },
            content: [{ stype: 'inline-text', text: 'Tables' }]
          },
          {
            stype: 'paragraph',
            attributes: { styleId: 'Body' },
            content: [
              {
                stype: 'inline-text',
                text: 'Put the caret in a cell and press Tab. The header spans two columns.',
                // The reference is a mark; the body lives in resources and is
                // drawn at the foot of whichever page this lands on.
                marks: [{ stype: 'footnoteRef', range: [0, 3], attrs: { id: 'fn1' } }]
              }
            ]
          },
          {
            // A caption whose number is computed, and a bookmark so the
            // paragraph below can refer to it without repeating the number.
            stype: 'paragraph',
            attributes: { styleId: 'Body' },
            content: [
              { stype: 'inline-text', text: 'Table ' },
              { stype: 'fieldSeq', attributes: { sequence: 'Table' } },
              {
                stype: 'inline-text',
                text: ': a merged header',
                // Covers "a merged header" only, not the ": " before it
                marks: [{ stype: 'bookmark', range: [2, 17], attrs: { name: 'tbl-merged' } }]
              }
            ]
          },
          {
            stype: 'bTable',
            attributes: { layout: 'fixed', width: 5000, widthType: 'pct' },
            content: [
              {
                stype: 'bTableHeader',
                attributes: {},
                content: [
                  {
                    stype: 'bTableHeaderCell',
                    // A merged header cell: the swallowed cell is not in the model
                    attributes: { colspan: 2, rowspan: 1, shadingFill: 'EEEEEE' },
                    content: [{ stype: 'inline-text', text: 'Merged header' }]
                  },
                  {
                    stype: 'bTableHeaderCell',
                    attributes: { colspan: 1, rowspan: 1, shadingFill: 'EEEEEE' },
                    content: [{ stype: 'inline-text', text: 'Third' }]
                  }
                ]
              },
              {
                stype: 'bTableBody',
                attributes: {},
                content: [
                  {
                    stype: 'bTableRow',
                    attributes: {},
                    content: [
                      { stype: 'bTableCell', attributes: { colspan: 1, rowspan: 1 }, content: [{ stype: 'inline-text', text: 'A1' }] },
                      { stype: 'bTableCell', attributes: { colspan: 1, rowspan: 1 }, content: [{ stype: 'inline-text', text: 'B1' }] },
                      { stype: 'bTableCell', attributes: { colspan: 1, rowspan: 1 }, content: [{ stype: 'inline-text', text: 'C1' }] }
                    ]
                  },
                  {
                    stype: 'bTableRow',
                    attributes: {},
                    content: [
                      { stype: 'bTableCell', attributes: { colspan: 1, rowspan: 1 }, content: [{ stype: 'inline-text', text: 'A2' }] },
                      { stype: 'bTableCell', attributes: { colspan: 1, rowspan: 1 }, content: [{ stype: 'inline-text', text: 'B2' }] },
                      { stype: 'bTableCell', attributes: { colspan: 1, rowspan: 1 }, content: [{ stype: 'inline-text', text: 'C2' }] }
                    ]
                  }
                ]
              }
            ]
          },

          {
            stype: 'paragraph',
            attributes: { styleId: 'Body' },
            content: [
              { stype: 'inline-text', text: 'See "' },
              { stype: 'fieldRef', attributes: { targetId: 'tbl-merged', format: 'text' } },
              { stype: 'inline-text', text: '", ' },
              { stype: 'fieldRef', attributes: { targetId: 'tbl-merged', format: 'aboveBelow' } },
              { stype: 'inline-text', text: '.' }
            ]
          },
          {
            stype: 'heading',
            attributes: { level: 2, styleId: 'Heading2' },
            content: [{ stype: 'inline-text', text: 'Pages are computed' }]
          },
          {
            stype: 'paragraph',
            attributes: { styleId: 'Body' },
            content: [{ stype: 'inline-text', text: '1. Pagination is measured, not declared. Nothing in this document says where a page ends: the browser breaks the lines, the layout reads the line boxes back, and the break falls wherever the text ran out of room. That is why this section exists at all — a fixture that fits on one page cannot demonstrate a page break, and a rule that is never exercised is a rule that is not known to work.' }]
          },
          {
            stype: 'paragraph',
            attributes: { styleId: 'Body' },
            content: [{ stype: 'inline-text', text: '2. Pagination is measured, not declared. Nothing in this document says where a page ends: the browser breaks the lines, the layout reads the line boxes back, and the break falls wherever the text ran out of room. That is why this section exists at all — a fixture that fits on one page cannot demonstrate a page break, and a rule that is never exercised is a rule that is not known to work.' }]
          },
          {
            stype: 'paragraph',
            attributes: { styleId: 'Body' },
            content: [{ stype: 'inline-text', text: '3. Pagination is measured, not declared. Nothing in this document says where a page ends: the browser breaks the lines, the layout reads the line boxes back, and the break falls wherever the text ran out of room. That is why this section exists at all — a fixture that fits on one page cannot demonstrate a page break, and a rule that is never exercised is a rule that is not known to work.' }]
          },
          {
            stype: 'paragraph',
            attributes: { styleId: 'Body' },
            content: [{ stype: 'inline-text', text: '4. Pagination is measured, not declared. Nothing in this document says where a page ends: the browser breaks the lines, the layout reads the line boxes back, and the break falls wherever the text ran out of room. That is why this section exists at all — a fixture that fits on one page cannot demonstrate a page break, and a rule that is never exercised is a rule that is not known to work.' }]
          },
          {
            stype: 'paragraph',
            attributes: { styleId: 'Body' },
            content: [{ stype: 'inline-text', text: '5. Pagination is measured, not declared. Nothing in this document says where a page ends: the browser breaks the lines, the layout reads the line boxes back, and the break falls wherever the text ran out of room. That is why this section exists at all — a fixture that fits on one page cannot demonstrate a page break, and a rule that is never exercised is a rule that is not known to work.' }]
          },
          {
            stype: 'paragraph',
            attributes: { styleId: 'Body' },
            content: [{ stype: 'inline-text', text: '6. Pagination is measured, not declared. Nothing in this document says where a page ends: the browser breaks the lines, the layout reads the line boxes back, and the break falls wherever the text ran out of room. That is why this section exists at all — a fixture that fits on one page cannot demonstrate a page break, and a rule that is never exercised is a rule that is not known to work.' }]
          },
          {
            stype: 'paragraph',
            attributes: { styleId: 'Body' },
            content: [{ stype: 'inline-text', text: '7. Pagination is measured, not declared. Nothing in this document says where a page ends: the browser breaks the lines, the layout reads the line boxes back, and the break falls wherever the text ran out of room. That is why this section exists at all — a fixture that fits on one page cannot demonstrate a page break, and a rule that is never exercised is a rule that is not known to work.' }]
          },
          {
            stype: 'paragraph',
            attributes: { styleId: 'Body' },
            content: [{ stype: 'inline-text', text: '8. Pagination is measured, not declared. Nothing in this document says where a page ends: the browser breaks the lines, the layout reads the line boxes back, and the break falls wherever the text ran out of room. That is why this section exists at all — a fixture that fits on one page cannot demonstrate a page break, and a rule that is never exercised is a rule that is not known to work.' }]
          },
          {
            stype: 'paragraph',
            attributes: { styleId: 'Body' },
            content: [{ stype: 'inline-text', text: '9. Pagination is measured, not declared. Nothing in this document says where a page ends: the browser breaks the lines, the layout reads the line boxes back, and the break falls wherever the text ran out of room. That is why this section exists at all — a fixture that fits on one page cannot demonstrate a page break, and a rule that is never exercised is a rule that is not known to work.' }]
          },
          {
            stype: 'heading',
            attributes: { level: 1, styleId: 'Heading1', pageBreakBefore: true },
            content: [{ stype: 'inline-text', text: 'A section that starts its own page' }]
          },
          {
            stype: 'paragraph',
            attributes: { styleId: 'Body' },
            content: [
              {
                stype: 'inline-text',
                text: 'This heading asked to begin a page, so it did — even though there was room for it above.'
              }
            ]
          }
        ]
      },

      {
        // A second section, running in two columns. A section is where page
        // setup lives, so changing the column count means starting one.
        stype: 'surface',
        attributes: {
          kind: 'flow',
          name: 'Section 2',
          sectionStart: 'nextPage',
          columnCount: 2,
          columnSpacing: 720,
          pageWidth: 12240,
          pageHeight: 15840,
          marginTop: 1440,
          marginBottom: 1440,
          marginLeft: 1440,
          marginRight: 1440
        },
        content: [
          {
            stype: 'heading',
            attributes: { level: 1, styleId: 'Heading1' },
            content: [{ stype: 'inline-text', text: 'Two columns' }]
          },
          ...Array.from({ length: 8 }, (_, index) => ({
            stype: 'paragraph',
            attributes: { styleId: 'Body' },
            content: [
              {
                stype: 'inline-text',
                text:
                  `${index + 1}. Text in a section like this one fills the first column to the ` +
                  'bottom of the page and then starts again at the top of the second, which is ' +
                  'a move to the right and upwards — the one thing a top margin cannot do.'
              }
            ]
          }))
        ]
      },

      {
        stype: 'resources',
        attributes: {},
        content: [
          {
            stype: 'docDefaults',
            attributes: { fontFamily: 'Georgia, serif', fontSize: 22, spacingAfter: 120 }
          },
          {
            stype: 'styleDef',
            attributes: { id: 'Normal', name: 'Normal', type: 'paragraph', spacingAfter: 160 }
          },
          {
            stype: 'styleDef',
            attributes: {
              id: 'Body',
              name: 'Body Text',
              type: 'paragraph',
              basedOn: 'Normal',
              spacingLine: 320,
              spacingLineRule: 'auto'
            }
          },
          {
            stype: 'styleDef',
            attributes: {
              id: 'Heading1',
              name: 'Heading 1',
              type: 'paragraph',
              basedOn: 'Normal',
              next: 'Body',
              fontSize: 40,
              bold: true,
              color: '1A365D',
              spacingBefore: 360,
              spacingAfter: 160,
              keepNext: true
            }
          },
          {
            stype: 'styleDef',
            attributes: {
              id: 'Heading2',
              name: 'Heading 2',
              type: 'paragraph',
              basedOn: 'Heading1',
              next: 'Body',
              fontSize: 30,
              color: '2C5282',
              spacingBefore: 280
            }
          },
          {
            stype: 'numberingDef',
            attributes: { id: 'outline', name: 'Outline' },
            content: [
              {
                stype: 'numberingLevel',
                attributes: { level: 0, format: 'decimal', text: '%1.', start: 1, suffix: 'space' }
              },
              {
                stype: 'numberingLevel',
                attributes: { level: 1, format: 'lowerLetter', text: '%2.', start: 1, suffix: 'space' }
              },
              {
                stype: 'numberingLevel',
                attributes: { level: 2, format: 'lowerRoman', text: '%3.', start: 1, suffix: 'space' }
              }
            ]
          },
          {
            stype: 'docHeader',
            attributes: { id: 'hdr-main' },
            content: [
              {
                stype: 'paragraph',
                attributes: {},
                content: [
                  { stype: 'inline-text', text: 'Barocss Word' },
                  { stype: 'tab' },
                  { stype: 'inline-text', text: 'One engine, four products' }
                ]
              }
            ]
          },
          {
            // A different header on the first page, which is what a title page
            // needs and what `firstPageHeaderId` exists for.
            stype: 'docHeader',
            attributes: { id: 'hdr-first' },
            content: [
              {
                stype: 'paragraph',
                attributes: { alignment: 'center' },
                content: [{ stype: 'inline-text', text: 'Draft — not for circulation' }]
              }
            ]
          },
          {
            stype: 'docFooter',
            attributes: { id: 'ftr-main' },
            content: [
              {
                stype: 'paragraph',
                attributes: {},
                content: [
                  { stype: 'inline-text', text: 'barocss' },
                  { stype: 'tab' },
                  { stype: 'fieldPageNumber' },
                  { stype: 'inline-text', text: ' / ' },
                  { stype: 'fieldPageCount' }
                ]
              }
            ]
          },
          {
            stype: 'footnoteDef',
            attributes: { id: 'fn1' },
            content: [
              {
                stype: 'paragraph',
                attributes: {},
                content: [
                  {
                    stype: 'inline-text',
                    text: 'A footnote body. It lives in resources, not in the flow — where it renders is a layout decision.'
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  } as INode;
}
