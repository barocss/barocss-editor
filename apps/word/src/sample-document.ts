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
          /**
           * Subtitle before author, which is the order the schema states:
           * `docTitle? docSubtitle? docAuthor*`.
           *
           * It was the other way round, and nothing noticed for as long as the
           * fixture existed — a document that is *loaded* went in exactly as
           * written, and the title bar draws these three by name rather than in
           * document order, so it looked right. Found the day `loadDocument`
           * started checking what it is given.
           */
          {
            stype: 'docSubtitle',
            attributes: {},
            content: [
              { stype: 'inline-text', text: 'One engine, one schema, four products' }
            ]
          },
          {
            stype: 'docAuthor',
            attributes: {},
            content: [{ stype: 'inline-text', text: 'Jinho Park' }]
          }
        ]
      },

      {
        stype: 'surface',
        attributes: {
          kind: 'flow',
          name: 'Section 1',
          headerId: 'hdr-main',
          // The switch, not the header: Word keeps a title-page header a section
          // defines and leaves it unused while this is off, so unticking the box
          // does not lose what was written there.
          titlePage: true,
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

          /**
           * Three paragraphs inside **one bordered box** — Word's fifth border.
           *
           * A run of consecutive paragraphs asking for the same borders is one box: the top above
           * the first, the bottom below the last, and a single dotted rule between each pair. Drawn
           * as each paragraph's own edges it is two solid lines between every pair with the margin
           * showing through, which is what the product did — `borderBetween` was in the schema and
           * nothing read it.
           *
           * Here because the fault was invisible without it: the sample had no bordered paragraph at
           * all, so no test could have seen the doubled line. The borders are stated directly rather
           * than through a style so the run is legible as one thing in this file.
           */
          ...[
            'A run of paragraphs that ask for the same borders is one box.',
            'Between two of them Word draws a single rule, not two edges.',
            'The box closes under the last one.'
          ].map((text) => ({
            stype: 'paragraph',
            attributes: {
              styleId: 'Body',
              borderTopStyle: 'single',
              borderTopWidth: 8,
              borderTopColor: '2C5282',
              borderBottomStyle: 'single',
              borderBottomWidth: 8,
              borderBottomColor: '2C5282',
              borderLeftStyle: 'single',
              borderLeftWidth: 8,
              borderLeftColor: '2C5282',
              borderRightStyle: 'single',
              borderRightWidth: 8,
              borderRightColor: '2C5282',
              borderTopSpace: 6,
              borderBottomSpace: 6,
              borderLeftSpace: 8,
              borderRightSpace: 8,
              borderBetweenStyle: 'dotted',
              borderBetweenWidth: 4,
              borderBetweenColor: '94A3B8'
            },
            content: [{ stype: 'inline-text', text }]
          })),

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
                text: 'sized',
                // Word's unit: half-points, the same one the style cascade uses
                marks: [{ stype: 'fontSize', range: [0, 5], attrs: { size: 36 } }]
              },
              { stype: 'inline-text', text: ' ' },
              {
                stype: 'inline-text',
                text: 'coloured',
                marks: [{ stype: 'fontColor', range: [0, 8], attrs: { color: 'B22222' } }]
              },
              { stype: 'inline-text', text: ' ' },
              {
                stype: 'inline-text',
                text: 'styled',
                marks: [{ stype: 'charStyle', range: [0, 6], attrs: { styleId: 'Emphasis' } }]
              },
              { stype: 'inline-text', text: ', then ' },
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
            // Fields that ask the document about itself
            stype: 'paragraph',
            attributes: { styleId: 'Body' },
            content: [
              { stype: 'inline-text', text: 'Written by ' },
              { stype: 'fieldAuthor' },
              { stype: 'inline-text', text: ' for ' },
              { stype: 'fieldDocTitle' },
              { stype: 'inline-text', text: ', on ' },
              { stype: 'fieldDateTime', attributes: { format: 'd MMMM yyyy' } },
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
            content: [{ stype: 'inline-text', text: 'Pictures' }]
          },
          {
            // Text running down the left of a picture floated to the right,
            // which is what `square` means and what a float is for.
            stype: 'paragraph',
            attributes: { styleId: 'Body' },
            content: [
              {
                stype: 'inline-image',
                attributes: {
                  src:
                    'data:image/svg+xml;utf8,' +
                    '%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2290%22%3E' +
                    '%3Crect width=%22120%22 height=%2290%22 fill=%22%23cbd5e1%22/%3E%3C/svg%3E',
                  alt: 'A grey rectangle',
                  width: 1800,
                  height: 1350,
                  wrap: 'square',
                  side: 'right',
                  distanceLeft: 180,
                  distanceBottom: 180
                }
              },
              {
                stype: 'inline-text',
                text:
                  'A picture that the text wraps around is a float: the lines beside it are ' +
                  'shorter, and they get their full width back once the picture has been passed. ' +
                  'An inline picture would push the whole line down instead, because it is a very ' +
                  'large character and a line is as tall as its tallest character. This paragraph ' +
                  'runs on past the bottom of the picture on purpose, so that both halves of that ' +
                  'sentence can be seen at once: the narrow lines beside it, and the full-width ' +
                  'ones below it. A fixture that only showed one of them would let the other go ' +
                  'wrong without anybody noticing.'
              }
            ]
          },
          {
            // The same picture, wrapped tight against a triangle. Word stores
            // that outline as a polygon and CSS takes one, so the text follows
            // the diagonal rather than the box — each line beside it is a
            // little longer than the one above.
            stype: 'paragraph',
            attributes: { styleId: 'Body' },
            content: [
              {
                stype: 'inline-image',
                attributes: {
                  src:
                    'data:image/svg+xml;utf8,' +
                    '%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22%3E' +
                    '%3Cpolygon points=%22120,0 120,120 0,120%22 fill=%22%2394a3b8%22/%3E%3C/svg%3E',
                  alt: 'A grey triangle',
                  width: 1800,
                  height: 1800,
                  wrap: 'tight',
                  side: 'right',
                  wrapPolygon: [
                    { x: 21600, y: 0 },
                    { x: 21600, y: 21600 },
                    { x: 0, y: 21600 }
                  ],
                  shapeMargin: 90
                }
              },
              {
                stype: 'inline-text',
                text:
                  'Tight wrapping follows the outline of the picture rather than its box. ' +
                  'Word keeps that outline as a polygon, and so does CSS, so the two are the ' +
                  'same idea in different units. Against a triangle the effect is plain: each ' +
                  'line beside it can run a little further than the one above, because there ' +
                  'is a little more room. A rectangle would cut them all to the same length.'
              }
            ]
          },
          {
            stype: 'heading',
            attributes: { level: 2, styleId: 'Heading2' },
            content: [{ stype: 'inline-text', text: 'Tabs' }]
          },
          {
            stype: 'paragraph',
            attributes: { styleId: 'Body' },
            content: [
              {
                stype: 'inline-text',
                text: 'A tab reaches the next stop, so where it sits decides how far it stretches.'
              }
            ]
          },
          {
            // Three stops in one line: a left one, a centred one, and a right
            // one with a dot leader — which is what a contents line is.
            stype: 'paragraph',
            attributes: {
              styleId: 'Body',
              tabs: [
                { pos: 1440, align: 'left' },
                { pos: 3600, align: 'center' },
                { pos: 6480, align: 'right', leader: 'dot' }
              ]
            },
            content: [
              { stype: 'inline-text', text: 'Left' },
              { stype: 'tab' },
              { stype: 'inline-text', text: 'at one inch' },
              { stype: 'tab' },
              { stype: 'inline-text', text: 'centred' },
              { stype: 'tab' },
              { stype: 'inline-text', text: 'right' }
            ]
          },
          {
            // No stops named, so the default half-inch interval takes over.
            stype: 'paragraph',
            attributes: { styleId: 'Body' },
            content: [
              { stype: 'inline-text', text: 'a' },
              { stype: 'tab' },
              { stype: 'inline-text', text: 'b' },
              { stype: 'tab' },
              { stype: 'inline-text', text: 'c' }
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
            /**
             * A table that names a style instead of describing itself.
             *
             * Every line and shade below comes from `GridTable`: the header row
             * is dark because the style says a first row is, and the row under
             * it is grey because the style shades every second row. `look` is
             * the table's own list of which of the style's regions it wants —
             * the same style on a table that asked for no banding is the same
             * style, drawn without stripes.
             */
            stype: 'bTable',
            attributes: {
              styleId: 'GridTable',
              look: 'firstRow,firstColumn,bandedRows',
              layout: 'fixed',
              width: 5000,
              widthType: 'pct'
            },
            content: [
              {
                stype: 'bTableHeader',
                attributes: {},
                content: [
                  {
                    stype: 'bTableHeaderCell',
                    // A merged header cell: the swallowed cell is not in the model
                    attributes: { colspan: 2, rowspan: 1 },
                    content: [{ stype: 'inline-text', text: 'Merged header' }]
                  },
                  {
                    stype: 'bTableHeaderCell',
                    attributes: { colspan: 1, rowspan: 1 },
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
            /**
             * An equation, as Word stores one: a tree of constructs with named
             * slots, every slot an ordinary editable container. The caret goes
             * into the numerator — it is not a picture of a formula.
             */
            stype: 'paragraph',
            attributes: { styleId: 'Body' },
            content: [
              { stype: 'inline-text', text: 'The quadratic formula, ' },
              {
                stype: 'oMath',
                content: [
                  { stype: 'mathRun', content: [{ stype: 'inline-text', text: 'x' }] },
                  { stype: 'mathRun', attributes: { literal: true }, content: [{ stype: 'inline-text', text: '=' }] },
                  {
                    stype: 'mathFraction',
                    content: [
                      {
                        stype: 'mathNum',
                        content: [
                          { stype: 'mathRun', attributes: { literal: true }, content: [{ stype: 'inline-text', text: '−b±' }] },
                          {
                            stype: 'mathRadical',
                            content: [
                              { stype: 'mathDeg', content: [] },
                              {
                                stype: 'mathElement',
                                content: [
                                  { stype: 'mathRun', content: [{ stype: 'inline-text', text: 'b' }] },
                                  {
                                    stype: 'mathSuperscript',
                                    content: [
                                      { stype: 'mathElement', content: [{ stype: 'mathRun', attributes: { literal: true }, content: [{ stype: 'inline-text', text: '' }] }] },
                                      { stype: 'mathSup', content: [{ stype: 'mathRun', attributes: { literal: true }, content: [{ stype: 'inline-text', text: '2' }] }] }
                                    ]
                                  },
                                  { stype: 'mathRun', attributes: { literal: true }, content: [{ stype: 'inline-text', text: '−4' }] },
                                  { stype: 'mathRun', content: [{ stype: 'inline-text', text: 'ac' }] }
                                ]
                              }
                            ]
                          }
                        ]
                      },
                      { stype: 'mathDen', content: [{ stype: 'mathRun', attributes: { literal: true }, content: [{ stype: 'inline-text', text: '2' }] }, { stype: 'mathRun', content: [{ stype: 'inline-text', text: 'a' }] }] }
                    ]
                  }
                ]
              },
              { stype: 'inline-text', text: ' and ' },
              {
                stype: 'oMath',
                content: [
                  {
                    stype: 'mathDelimiter',
                    attributes: { open: '(', close: ')' },
                    content: [
                      {
                        stype: 'mathElement',
                        content: [
                          {
                            stype: 'mathFraction',
                            content: [
                              { stype: 'mathNum', content: [{ stype: 'mathRun', content: [{ stype: 'inline-text', text: 'a' }] }] },
                              { stype: 'mathDen', content: [{ stype: 'mathRun', content: [{ stype: 'inline-text', text: 'b' }] }] }
                            ]
                          }
                        ]
                      }
                    ]
                  }
                ]
              },
              { stype: 'inline-text', text: ', written in the flow of the sentence.' }
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
            attributes: { level: 2, styleId: 'Heading2' },
            content: [{ stype: 'inline-text', text: 'A paragraph longer than a page' }]
          },
          {
            stype: 'paragraph',
            attributes: { styleId: 'Body' },
            content: [
              {
                stype: 'inline-text',
                text: Array.from(
                  { length: 40 },
                  (_, index) =>
                    `(${index + 1}) A page break inside a paragraph cannot be a margin, because ` +
                    'the thing before the break and the thing after it are the same element. ' +
                    'It is drawn as an empty widget at a text offset instead, which contributes ' +
                    'no text node and so is invisible to everything that reads text.'
                ).join(' ')
              }
            ]
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
            // A document-wide switch: two people editing the same document are
            // not each deciding whether the other's edits are tracked.
            stype: 'docSettings',
            attributes: { trackRevisions: false }
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
            // A character style, which a run points at by name — the mark can
            // only carry the name, so what it means comes from the cascade.
            stype: 'styleDef',
            attributes: {
              id: 'Emphasis',
              name: 'Emphasis',
              type: 'character',
              italic: true,
              color: '2C5282'
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
            /**
             * A table style, which is thirteen sets of formatting rather than
             * one: the whole table, then the regions that override it where they
             * apply. The cells say none of this — a header row is dark because
             * it is the first row, and stops being dark if a row is inserted
             * above it.
             */
            stype: 'styleDef',
            attributes: {
              id: 'GridTable',
              name: 'Grid Table',
              type: 'table',
              cellMarginLeft: 108,
              cellMarginRight: 108
            },
            content: [
              {
                // The table's own lines. `insideH`/`insideV` are rules *between*
                // cells, which is why they belong to the table and not to any
                // cell — see table-format for how they are resolved onto them.
                stype: 'styleConditional',
                attributes: {
                  type: 'wholeTable',
                  borderTopStyle: 'single',
                  borderTopWidth: 8,
                  borderTopColor: '2C5282',
                  borderBottomStyle: 'single',
                  borderBottomWidth: 8,
                  borderBottomColor: '2C5282',
                  borderInsideHStyle: 'single',
                  borderInsideHWidth: 2,
                  borderInsideHColor: 'CBD5E0',
                  borderInsideVStyle: 'single',
                  borderInsideVWidth: 2,
                  borderInsideVColor: 'CBD5E0'
                }
              },
              {
                stype: 'styleConditional',
                attributes: {
                  type: 'firstRow',
                  bold: true,
                  color: 'FFFFFF',
                  shadingFill: '2C5282',
                  verticalAlign: 'center'
                }
              },
              {
                // Every second row. Only band1 is defined, so the rows between
                // are the table's own colour — which is what banding is.
                stype: 'styleConditional',
                attributes: { type: 'band1Horz', shadingFill: 'EDF2F7' }
              },
              {
                stype: 'styleConditional',
                attributes: { type: 'firstCol', bold: true }
              }
            ]
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
            // Back matter: at the end of the document rather than on a page,
            // which is what separates an endnote from a footnote.
            stype: 'endnoteDef',
            attributes: { id: 'en1' },
            content: [
              {
                stype: 'paragraph',
                attributes: {},
                content: [
                  {
                    stype: 'inline-text',
                    text: 'An endnote body. It collects at the end of the document, where a reader looks things up afterwards.'
                  }
                ]
              }
            ]
          },
          {
            stype: 'bibliography',
            attributes: {},
            content: [
              {
                stype: 'paragraph',
                attributes: {},
                content: [
                  {
                    stype: 'inline-text',
                    text: 'ECMA-376, Office Open XML File Formats. Ecma International, 2016.'
                  }
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
