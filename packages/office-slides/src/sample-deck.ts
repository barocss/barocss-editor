import type { INode } from '@barocss/datastore';

/**
 * A deck that exercises the parts of a presentation the engine has never drawn.
 *
 * Written in the same Office shape Word's sample uses — `document → docMeta?
 * surface+ resources?` — because that is the claim under test: a deck and a
 * document are the same document shape, and a slide is a `surface` whose
 * children are scene nodes rather than blocks.
 *
 * It deliberately contains, in one file:
 *   - a title slide, whose title and subtitle are `textFrame`s differing only
 *     by `role`
 *   - a bulleted slide, whose bullets are Word's `list` drawn by Word's
 *     renderers inside a placed box
 *   - shapes, a `frame` with children positioned against it, and a group
 *   - a table on a slide, which is Word's `bTable` and nothing new
 *   - a hidden slide, which stays in the deck and is skipped while presenting
 *   - a note in `resources`, bound to its slide by `surfaceId`
 */

const TITLE = '#0f172a';
const ACCENT = '#2563eb';

/** A paragraph of plain text, which is most of what a deck holds. */
const line = (text: string, attributes: Record<string, unknown> = {}): INode => ({
  stype: 'paragraph',
  attributes,
  content: [{ stype: 'inline-text', text }]
});

export function createSampleDeck(): INode {
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
            content: [{ stype: 'inline-text', text: 'Barocss Slides' }]
          },
          {
            stype: 'docAuthor',
            attributes: {},
            content: [{ stype: 'inline-text', text: 'Jinho Park' }]
          }
        ]
      },

      // ── 1. Title ─────────────────────────────────────────────────────────
      /**
       * The whole product in one slide: two boxes that differ by `role` and by
       * where they are, holding paragraphs Word already knows how to draw.
       */
      {
        stype: 'surface',
        attributes: { kind: 'slide', name: 'Title', layoutId: 'layout-title' },
        content: [
          {
            stype: 'textFrame',
            attributes: {
              role: 'title',
              x: 1920,
              y: 3600,
              width: 15360,
              height: 2400,
              verticalAlign: 'middle'
            },
            content: [
              line('One engine, two products', {
                align: 'center',
                fontSize: 108,
                bold: true,
                color: TITLE
              })
            ]
          },
          {
            stype: 'textFrame',
            attributes: {
              role: 'subtitle',
              x: 1920,
              y: 6240,
              width: 15360,
              height: 1200,
              verticalAlign: 'top'
            },
            content: [
              line('A slide is a surface the schema already described', {
                align: 'center',
                fontSize: 44,
                color: '#64748b'
              })
            ]
          }
        ]
      },

      // ── 2. Bullets ───────────────────────────────────────────────────────
      /**
       * The claim `textFrame` carries, made concrete: the bullets are Word's
       * `list`, drawn by Word's list renderer, formatted by Word's style
       * resolver. Nothing here is slide-specific except the box.
       */
      {
        stype: 'surface',
        attributes: { kind: 'slide', name: 'What a deck costs', layoutId: 'layout-body' },
        content: [
          {
            stype: 'textFrame',
            attributes: { role: 'title', x: 1440, y: 960, width: 16320, height: 1680 },
            content: [line('What the second product cost', { fontSize: 66, bold: true, color: TITLE })]
          },
          {
            stype: 'textFrame',
            attributes: { role: 'body', x: 1440, y: 3120, width: 16320, height: 6240 },
            content: [
              {
                stype: 'list',
                attributes: { listType: 'bullet' },
                content: [
                  {
                    stype: 'listItem',
                    attributes: {},
                    content: [line('No new node type — the schema had a slide already', { fontSize: 40 })]
                  },
                  {
                    stype: 'listItem',
                    attributes: {},
                    content: [line('No layout pass — a slide places, it does not flow', { fontSize: 40 })]
                  },
                  {
                    stype: 'listItem',
                    attributes: {},
                    content: [line('No text stack — every renderer is Word’s', { fontSize: 40 })]
                  },
                  {
                    stype: 'listItem',
                    attributes: {},
                    content: [
                      line('One override — shapes, because a registry holds one per type', {
                        fontSize: 40
                      })
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },

      // ── 3. Shapes ────────────────────────────────────────────────────────
      /**
       * Placement without text. The frame is the interesting one: its children
       * are positioned against *it*, so moving the frame moves them and nothing
       * rewrites a coordinate.
       */
      {
        stype: 'surface',
        attributes: { kind: 'slide', name: 'Shapes' },
        content: [
          {
            stype: 'textFrame',
            attributes: { role: 'title', x: 1440, y: 960, width: 16320, height: 1680 },
            content: [line('Placed, not flowed', { fontSize: 66, bold: true, color: TITLE })]
          },
          {
            stype: 'frame',
            attributes: {
              name: 'Diagram',
              x: 1440,
              y: 3360,
              width: 7680,
              height: 5760,
              fill: '#f1f5f9',
              clipsContent: true
            },
            content: [
              {
                stype: 'rectangle',
                attributes: {
                  x: 720,
                  y: 720,
                  width: 2880,
                  height: 1440,
                  fill: ACCENT,
                  cornerRadius: 120
                }
              },
              {
                stype: 'ellipse',
                attributes: {
                  x: 4080,
                  y: 3120,
                  width: 2880,
                  height: 1920,
                  fill: '#fbbf24'
                }
              },
              {
                stype: 'line',
                attributes: {
                  x: 2160,
                  y: 2160,
                  width: 3360,
                  height: 960,
                  stroke: '#334155',
                  strokeWidth: 30
                }
              }
            ]
          },
          {
            stype: 'group',
            attributes: { name: 'Legend', x: 10080, y: 3360, width: 7680, height: 5760 },
            content: [
              {
                stype: 'rectangle',
                attributes: {
                  x: 0,
                  y: 0,
                  width: 7680,
                  height: 5760,
                  stroke: '#cbd5e1',
                  strokeWidth: 15
                }
              },
              {
                stype: 'textFrame',
                attributes: { x: 480, y: 480, width: 6720, height: 4800 },
                content: [
                  line('A group has no appearance of its own.', { fontSize: 36 }),
                  line('It is the fact that these move together.', { fontSize: 36, italic: true })
                ]
              }
            ]
          }
        ]
      },

      // ── 4. A table on a slide ────────────────────────────────────────────
      /**
       * Word's table, inside a placed box, with no slides code involved at all.
       * The one thing worth checking by eye, because a table is the most
       * layout-dependent thing Word draws.
       */
      {
        stype: 'surface',
        attributes: { kind: 'slide', name: 'Table' },
        content: [
          {
            stype: 'textFrame',
            attributes: { role: 'title', x: 1440, y: 960, width: 16320, height: 1680 },
            content: [line('Word’s table, on a slide', { fontSize: 66, bold: true, color: TITLE })]
          },
          {
            stype: 'textFrame',
            attributes: { role: 'body', x: 1440, y: 3360, width: 16320, height: 5760 },
            content: [
              {
                stype: 'bTable',
                attributes: { width: 16320, columns: [5440, 5440, 5440] },
                content: [
                  {
                    stype: 'bTableRow',
                    attributes: {},
                    content: [
                      {
                        stype: 'bTableHeaderCell',
                        attributes: {},
                        content: [line('Product', { fontSize: 32, bold: true })]
                      },
                      {
                        stype: 'bTableHeaderCell',
                        attributes: {},
                        content: [line('Layout', { fontSize: 32, bold: true })]
                      },
                      {
                        stype: 'bTableHeaderCell',
                        attributes: {},
                        content: [line('Lines of it', { fontSize: 32, bold: true })]
                      }
                    ]
                  },
                  {
                    stype: 'bTableRow',
                    attributes: {},
                    content: [
                      {
                        stype: 'bTableCell',
                        attributes: {},
                        content: [line('Word', { fontSize: 32 })]
                      },
                      {
                        stype: 'bTableCell',
                        attributes: {},
                        content: [line('Measure, break, converge', { fontSize: 32 })]
                      },
                      {
                        stype: 'bTableCell',
                        attributes: {},
                        content: [line('~900', { fontSize: 32 })]
                      }
                    ]
                  },
                  {
                    stype: 'bTableRow',
                    attributes: {},
                    content: [
                      {
                        stype: 'bTableCell',
                        attributes: {},
                        content: [line('Slides', { fontSize: 32 })]
                      },
                      {
                        stype: 'bTableCell',
                        attributes: {},
                        content: [line('Convert coordinates', { fontSize: 32 })]
                      },
                      {
                        stype: 'bTableCell',
                        attributes: {},
                        content: [line('~60', { fontSize: 32 })]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },

      // ── 5. Hidden ────────────────────────────────────────────────────────
      /**
       * Kept in the deck, skipped while presenting. In the document, in the
       * outline, addressable by sid — which is the difference between hiding a
       * slide and deleting it.
       */
      {
        stype: 'surface',
        attributes: { kind: 'slide', name: 'Cut for time', hidden: true },
        content: [
          {
            stype: 'textFrame',
            attributes: { role: 'title', x: 1440, y: 4320, width: 16320, height: 2160 },
            content: [line('Cut for time', { fontSize: 66, bold: true, color: '#94a3b8' })]
          }
        ]
      },

      {
        stype: 'resources',
        attributes: {},
        content: [
          /**
           * A layout: the placeholders a slide of this kind starts with. A
           * definition, referenced by `layoutId` and never drawn — the same
           * relationship a paragraph has with its style.
           */
          {
            stype: 'slideLayout',
            attributes: { id: 'layout-title', name: 'Title slide' },
            content: [
              {
                stype: 'textFrame',
                attributes: {
                  role: 'title',
                  x: 1920,
                  y: 3600,
                  width: 15360,
                  height: 2400,
                  verticalAlign: 'middle'
                },
                content: [line('Click to add a title', { align: 'center', fontSize: 108 })]
              }
            ]
          },
          {
            stype: 'slideLayout',
            attributes: { id: 'layout-body', name: 'Title and content' },
            content: [
              {
                stype: 'textFrame',
                attributes: { role: 'title', x: 1440, y: 960, width: 16320, height: 1680 },
                content: [line('Click to add a title', { fontSize: 66 })]
              },
              {
                stype: 'textFrame',
                attributes: { role: 'body', x: 1440, y: 3120, width: 16320, height: 6240 },
                content: [line('Click to add text', { fontSize: 40 })]
              }
            ]
          },

          /**
           * What the presenter says. A resource bound to one slide by
           * `surfaceId`, exactly like a footnote body is bound to its reference
           * — so a note is saved, undone, collaboratively edited and
           * addressable, which an attribute could never give it.
           */
          {
            stype: 'surfaceNote',
            attributes: { surfaceId: 'slide-bullets' },
            content: [
              line('The point of this slide is that nothing on it is new.'),
              line('Every renderer drawing these bullets was written for Word.')
            ]
          }
        ]
      }
    ]
  };
}
