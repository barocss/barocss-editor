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
 *
 * Every reference in here is by an author-supplied id, never by a sid. A sid is
 * `session:counter` and handed out at load, so a written document cannot name
 * one — the note in here first tried to, pointed at a slide that was never
 * there, and the notes panel showed nothing. That is why the slide names the
 * note and not the reverse.
 */

const TITLE = '#0f172a';
const ACCENT = '#2563eb';

/** A paragraph of plain text, which is most of what a deck holds. */
const line = (text: string, attributes: Record<string, unknown> = {}): INode => ({
  stype: 'paragraph',
  attributes,
  content: [{ stype: 'inline-text', text }]
});

/**
 * What goes *in a table cell*, which is not a paragraph.
 *
 * `bTableCell` is `inline*`: a cell holds runs directly, which is what
 * `insertTable` builds and what Word's own sample document contains. The deck's
 * table was built with `line()` and so held paragraphs — a document the schema
 * refuses, which drew perfectly because loading a document does not validate it,
 * and which every table *operation* rejected the moment one was asked to touch
 * a cell.
 *
 * That a cell cannot hold a paragraph is a real limitation — a cell with two
 * paragraphs or a list in it is ordinary in a word processor — and it is logged
 * rather than worked around here; see docs/BACKLOG.md.
 */
const cellText = (text: string, attributes: Record<string, unknown> = {}): INode => ({
  stype: 'inline-text',
  text,
  attributes
});

/** The card's own size, which its parts are placed against. */
const CARD_WIDTH = 5040;
const CARD_HEIGHT = 3960;

/**
 * One **placement** of the deck's card, written the way the document really holds one.
 *
 * A placement is materialised: it says what its variables are (`componentValue`) *and* holds
 * real copies of the definition's parts, each pointing back at the part it came from by a
 * durable name. The values are substituted into those copies when the definition is applied —
 * not while it is drawn — so what is written here is what `applyComponent` would leave behind,
 * with the substitution already done. See `components.ts`.
 *
 * `partOf` and never `partId`: two boxes claiming to *be* the same part is how a definition
 * ends up pointing at a placement.
 */
const card = (
  place: { x: number; y: number },
  /** What this placement says, which is recorded in the document as its own nodes. */
  said: { title: string; value: string; accent?: string; showBadge?: string },
  /** What its parts therefore look like, plus whatever the reader did to them. */
  drawn: {
    title: string;
    value: string;
    accent?: string;
    badgeOff?: boolean;
    /** True when the reader edited the value part, so apply must leave it alone. */
    overridden?: boolean;
    /** What the reader put **inside the slot**, which apply must also leave. */
    rows?: string[];
  }
): INode => ({
  stype: 'instance',
  attributes: {
    componentId: 'metric-card',
    x: place.x,
    y: place.y,
    width: CARD_WIDTH,
    height: CARD_HEIGHT
  },
  content: [
    /*
     * What it was asked for, first — the declaration's answers. No `appliedFrom` is written:
     * a placement that has never recorded one is *not* stale (see `componentStale`), and a
     * signature cannot be written by hand without becoming a lie the first time the card is
     * edited.
     */
    { stype: 'componentValue', attributes: { name: 'title', value: said.title } },
    { stype: 'componentValue', attributes: { name: 'value', value: said.value } },
    ...(said.accent
      ? [{ stype: 'componentValue', attributes: { name: 'accent', value: said.accent } }]
      : []),
    ...(said.showBadge
      ? [{ stype: 'componentValue', attributes: { name: 'showBadge', value: said.showBadge } }]
      : []),

    {
      stype: 'rectangle',
      attributes: {
        partOf: 'back',
        bindFill: 'accent',
        x: 0,
        y: 0,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        // The substituted value, which is why it is a copy at all — and a theme slot unless
        // this placement said otherwise, so a re-coloured deck re-colours its cards.
        fill: drawn.accent ?? 'theme:accent1',
        cornerRadius: 180
      }
    },
    {
      stype: 'ellipse',
      attributes: {
        partOf: 'badge',
        bindVisible: 'showBadge',
        x: 4320,
        y: 240,
        width: 480,
        height: 480,
        fill: '#fbbf24',
        /*
         * Only the falsy half is ever written: `visible: true` beside no `visible` at all is
         * the same drawing, which is the asymmetry the conformance probe finds in every
         * boolean.
         */
        ...(drawn.badgeOff ? { visible: false } : {})
      }
    },
    {
      stype: 'textFrame',
      attributes: { partOf: 'title', bindText: 'title', x: 360, y: 480, width: 3840, height: 600 },
      content: [line(drawn.title, { fontSize: 32, bold: true, color: '#ffffff' })]
    },
    {
      stype: 'textFrame',
      attributes: { partOf: 'value', bindText: 'value', x: 360, y: 1080, width: 4320, height: 1200 },
      content: [line(drawn.value, { fontSize: 80, bold: true, color: '#ffffff' })]
    },
    {
      stype: 'frame',
      /*
       * The slot: the reader's own things live **in** it. Its own attributes still come from
       * the definition — apply rewrites those and keeps the children (`keepChildren`), which
       * is the one place in this model where rule 1 does not reach the reader's work.
       */
      attributes: {
        partOf: 'items',
        slot: 'items',
        x: 360,
        y: 2520,
        width: 4320,
        height: 1200,
        layoutMode: 'column',
        gap: 120,
        padding: 0,
        clipsContent: false
      },
      content: (drawn.rows ?? []).map((text) => ({
        stype: 'textFrame',
        attributes: { x: 0, y: 0, width: 4320, height: 420 },
        content: [line(text, { fontSize: 28, color: '#ffffff' })]
      }))
    }
  ]
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
                alignment: 'center',
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
                alignment: 'center',
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
        attributes: {
          kind: 'slide',
          name: 'What a deck costs',
          layoutId: 'layout-body',
          noteId: 'note-bullets'
        },
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
                attributes: { type: 'bullet' },
                content: [
                  /*
                   * The size is on the *item*, not only on the paragraph inside
                   * it. A marker is drawn by the item, so an item with no
                   * formatting draws a bullet at the default size beside text
                   * at 20pt — which is what this deck did first.
                   */
                  {
                    stype: 'listItem',
                    attributes: { fontSize: 40 },
                    content: [line('No new node type — the schema had a slide already', { fontSize: 40 })]
                  },
                  {
                    stype: 'listItem',
                    attributes: { fontSize: 40 },
                    content: [line('No layout pass — a slide places, it does not flow', { fontSize: 40 })]
                  },
                  {
                    stype: 'listItem',
                    attributes: { fontSize: 40 },
                    content: [line('No text stack — every renderer is Word’s', { fontSize: 40 })]
                  },
                  {
                    stype: 'listItem',
                    attributes: { fontSize: 40 },
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
                  // The theme's slot rather than the colour: this is the shape
                  // that shows what a theme buys, since re-colouring the deck
                  // now means editing one attribute in one place.
                  fill: 'theme:accent1',
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
                  fill: 'theme:accent2'
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
                /**
                 * The attribute names Word's table renderer actually reads.
                 *
                 * It asked for `columns: [...]` first, which nothing reads, so
                 * the table drew with the browser's automatic widths and no
                 * rules at all. `grid` is a comma-separated string of twips,
                 * `layout: 'fixed'` makes those widths binding, and the borders
                 * are stated here because a table with no style has none —
                 * which is correct, and invisible on a slide.
                 */
                attributes: {
                  grid: '5440,5440,5440',
                  layout: 'fixed',
                  width: 16320,
                  widthType: 'dxa',
                  borderInsideHStyle: 'single',
                  borderInsideHWidth: 4,
                  borderInsideHColor: '#cbd5e1',
                  borderTopStyle: 'single',
                  borderTopWidth: 8,
                  borderTopColor: '#94a3b8',
                  borderBottomStyle: 'single',
                  borderBottomWidth: 8,
                  borderBottomColor: '#94a3b8'
                },
                /**
                 * A header group and a body group, which is what the schema
                 * says a table is: `(bTableHeader)? bTableBody+ (bTableFooter)?`.
                 *
                 * This was three `bTableRow`s directly under the table — a
                 * document the schema refuses, hand-written here and never
                 * validated because loading a document does not validate it. It
                 * drew perfectly, and every table *operation* failed on it:
                 * `buildTableGrid` reads a table's children as groups and a
                 * group's children as rows, so it read each row as a group and
                 * each cell as a row, and merging two cells reported "cell not
                 * found in table".
                 *
                 * The header holds its cells directly, with no row between —
                 * also the schema's, and the reason `collectRows` treats a
                 * header as one row rather than as a group of them.
                 */
                content: [
                  {
                    stype: 'bTableHeader',
                    attributes: {},
                    content: [
                      {
                        stype: 'bTableHeaderCell',
                        attributes: {},
                        content: [cellText('Product', { fontSize: 32, bold: true })]
                      },
                      {
                        stype: 'bTableHeaderCell',
                        attributes: {},
                        content: [cellText('Layout', { fontSize: 32, bold: true })]
                      },
                      {
                        stype: 'bTableHeaderCell',
                        attributes: {},
                        content: [cellText('Lines of it', { fontSize: 32, bold: true })]
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
                      {
                        stype: 'bTableCell',
                        attributes: {},
                        content: [cellText('Word', { fontSize: 32 })]
                      },
                      {
                        stype: 'bTableCell',
                        attributes: {},
                        content: [cellText('Measure, break, converge', { fontSize: 32 })]
                      },
                      {
                        stype: 'bTableCell',
                        attributes: {},
                        content: [cellText('~900', { fontSize: 32 })]
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
                        content: [cellText('Slides', { fontSize: 32 })]
                      },
                      {
                        stype: 'bTableCell',
                        attributes: {},
                        content: [cellText('Convert coordinates', { fontSize: 32 })]
                      },
                      {
                        stype: 'bTableCell',
                        attributes: {},
                        content: [cellText('~60', { fontSize: 32 })]
                      }
                    ]
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

      // ── 6. One card, three places ────────────────────────────────────────
      /**
       * What a component is *for*, on a slide.
       *
       * Three placements of one definition, and each is here to show a different half of the
       * design rather than to fill the slide:
       *
       * - **매출** takes the definition exactly as it stands.
       * - **신규 고객** turns the badge off — a `boolean` variable, which is a thing free
       *   editing of a copy cannot express: "this card has no badge" is a decision, and
       *   deleting the shape is a hole.
       * - **이탈** gives it a colour of its own, has one part the reader *edited* (so apply
       *   leaves it), and has two rows the reader added **inside the slot** (so apply leaves
       *   those too, and still updates the frame around them).
       *
       * Written out node by node on purpose. A placement holds **real** nodes — a template
       * cannot draw a foreign node (canvas-model §10b-2) — so this is what the document
       * actually looks like after `applyComponent`, and a sample that pretended otherwise
       * would be testing a design the product does not have.
       */
      {
        stype: 'surface',
        attributes: { kind: 'slide', name: 'One card, three places' },
        content: [
          {
            stype: 'textFrame',
            attributes: { role: 'title', x: 1440, y: 960, width: 16320, height: 1680 },
            content: [line('One card, three places', { fontSize: 66, bold: true, color: TITLE })]
          },

          // 1. As the definition stands.
          card(
            { x: 1440, y: 3600 },
            { title: '매출', value: '1,240만' },
            { title: '매출', value: '1,240만' }
          ),

          // 2. A state, said by the placement: no badge.
          card(
            { x: 7200, y: 3600 },
            { title: '신규 고객', value: '312', showBadge: 'false' },
            { title: '신규 고객', value: '312', badgeOff: true }
          ),

          /*
           * 3. A colour of its own, a part the reader edited, and two rows they added in the
           * slot. All three are things apply has a rule about, and this is the one card in the
           * deck that exercises them.
           */
          card(
            { x: 12960, y: 3600 },
            { title: '이탈', value: '1.8%', accent: '#ef4444' },
            {
              title: '이탈',
              // Not what the binding would write: the reader typed the arrow in, which is what
              // makes this part an override — nothing declared, nothing hidden.
              value: '1.8% ↓',
              overridden: true,
              accent: '#ef4444',
              rows: ['지난주 2.1%', '목표 1.5%']
            }
          )
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
          /**
           * The master: what every layout starts from.
           *
           * Without it each layout repeats the deck's background and the deck's
           * idea of what a title looks like, and two layouts that disagree are a
           * deck with no design and no way to tell which one was the mistake.
           *
           * It says the two things every slide here shares — the paper and the
           * face a title is set in — and says nothing about *where* a title
           * goes, because that is exactly what the layouts differ about.
           */
          /**
           * The theme: the colours and faces this deck is designed in.
           *
           * A shape says *which slot* it uses and this says what the slots are,
           * so re-colouring a deck is one edit rather than forty — including the
           * forty on the slide nobody scrolled to.
           */
          {
            stype: 'theme',
            attributes: {
              id: 'theme-1',
              name: 'Office',
              dark1: '#0f172a',
              light1: '#ffffff',
              dark2: '#334155',
              light2: '#f1f5f9',
              accent1: ACCENT,
              accent2: '#fbbf24',
              accent3: '#22c55e',
              accent4: '#a855f7',
              accent5: '#ef4444',
              accent6: '#14b8a6',
              hyperlink: '#2563eb',
              followedHyperlink: '#7c3aed',
              majorFont: 'Georgia',
              minorFont: 'Georgia'
            }
          },
          {
            stype: 'slideMaster',
            attributes: {
              id: 'master-1',
              name: 'Office',
              fill: 'theme:light1',
              themeId: 'theme-1'
            },
            content: [
              {
                stype: 'textFrame',
                attributes: { role: 'title', x: 1440, y: 960, width: 16320, height: 1680 },
                content: [line('Title', { fontFamily: 'theme:major', fontSize: 66 })]
              },
              {
                stype: 'textFrame',
                attributes: { role: 'body', x: 1440, y: 3120, width: 16320, height: 6240 },
                content: [line('Body', { fontFamily: 'theme:minor', fontSize: 40 })]
              }
            ]
          },
          {
            stype: 'slideLayout',
            attributes: { id: 'layout-title', name: 'Title slide', masterId: 'master-1' },
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
                /**
                 * Only what this layout *differs* about: the alignment and the
                 * size of a title slide's title. The face comes from the master,
                 * which is the whole reason there is one.
                 */
                content: [line('Click to add a title', { alignment: 'center', fontSize: 108 })]
              }
            ]
          },
          {
            stype: 'slideLayout',
            attributes: { id: 'layout-body', name: 'Title and content', masterId: 'master-1' },
            content: [
              // Neither of these says a font: both take the master's.
              {
                stype: 'textFrame',
                attributes: { role: 'title', x: 1440, y: 960, width: 16320, height: 1680 },
                content: [line('Click to add a title')]
              },
              {
                stype: 'textFrame',
                attributes: { role: 'body', x: 1440, y: 3120, width: 16320, height: 6240 },
                content: [line('Click to add text')]
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
            attributes: { id: 'note-bullets' },
            content: [
              line('The point of this slide is that nothing on it is new.'),
              line('Every renderer drawing these bullets was written for Word.')
            ]
          }
        ]
      },

      /**
       * The **library**: what this deck defines, as opposed to what it refers to.
       *
       * A container of its own beside `resources`, and the reason is on the screen rather than
       * in the model. Everything in `resources` is hidden as a group because none of it belongs
       * there — a layout, a master, a theme, a note — and a definition a reader has *opened* is
       * the one thing that does. Showing it through a container written to hide things meant a
       * `:has()` rule, because un-hiding that container outright put the ruler 6px off.
       *
       * A definition still draws hidden until it is opened: a node with no element has no place
       * in the sid map, and every mapping from a DOM position back to the model goes through
       * that — the same reason `slideLayout` is drawn.
       */
      {
        stype: 'components',
        content: [
          {
            stype: 'component',
            attributes: {
              id: 'metric-card',
              name: '지표 카드',
              width: CARD_WIDTH,
              height: CARD_HEIGHT
            },
            content: [
              /*
               * What a placement can be **asked for**, declared before what the card is made
               * of: the variables are the definition's interface, and a reader looking at the
               * file sees what a card can be asked for before seeing how it is drawn.
               *
               * Nodes rather than a blob in one attribute — the argument this repository has
               * already made against a connector's spec and a placement's overrides. A
               * declaration made of nodes is one the validator checks, the conformance probe
               * reads, and a panel draws without a parser.
               */
              {
                stype: 'componentVar',
                attributes: { name: 'title', label: '이름', kind: 'text', value: '지표' }
              },
              {
                stype: 'componentVar',
                attributes: { name: 'value', label: '값', kind: 'text', value: '0' }
              },
              {
                stype: 'componentVar',
                /**
                 * A **slot**, not a colour.
                 *
                 * Found by the theme test, which asserts that nothing in the document repeats
                 * the theme's hex: the card's back held `#2563eb`, so a deck re-coloured to
                 * another theme kept three off-brand cards and a definition that would make
                 * more. A colour variable whose default names a theme slot is what a brand kit
                 * *is* — the card follows the deck, and a placement that wants its own colour
                 * still says so (the third one does).
                 */
                attributes: { name: 'accent', label: '색', kind: 'color', value: 'theme:accent1' }
              },
              {
                stype: 'componentVar',
                attributes: { name: 'showBadge', label: '배지', kind: 'boolean', value: 'true' }
              },

              /*
               * The parts. Each carries `partId` — its own durable name, which a placement's
               * copy points at — and the bindings that say which variable it takes.
               *
               * Placed against the card's own origin, exactly as a slide's boxes are placed
               * against the slide's: a definition is a canvas, which is what makes the whole
               * editing apparatus work on one for nothing.
               */
              {
                stype: 'rectangle',
                attributes: {
                  partId: 'back',
                  bindFill: 'accent',
                  x: 0,
                  y: 0,
                  width: CARD_WIDTH,
                  height: CARD_HEIGHT,
                  // The variable's default, substituted: a definition holds the same kind of
                  // value a placement does.
                  fill: 'theme:accent1',
                  cornerRadius: 180
                }
              },
              {
                stype: 'ellipse',
                attributes: {
                  partId: 'badge',
                  bindVisible: 'showBadge',
                  x: 4320,
                  y: 240,
                  width: 480,
                  height: 480,
                  fill: '#fbbf24'
                }
              },
              {
                stype: 'textFrame',
                attributes: {
                  partId: 'title',
                  bindText: 'title',
                  x: 360,
                  y: 480,
                  width: 3840,
                  height: 600
                },
                content: [line('지표', { fontSize: 32, bold: true, color: '#ffffff' })]
              },
              {
                stype: 'textFrame',
                attributes: {
                  partId: 'value',
                  bindText: 'value',
                  x: 360,
                  y: 1080,
                  width: 4320,
                  height: 1200
                },
                content: [line('0', { fontSize: 80, bold: true, color: '#ffffff' })]
              },
              /*
               * The **slot**, which is an ordinary frame.
               *
               * Figma added slots because instance-swap could not say "put whatever you like
               * here", and paid for it with a second layout system inside components. Here the
               * arrangement is the frame's — it already exists, is already tested, and already
               * knows that a drag inside it means the order (§5a) — and the marker buys one
               * sentence: a placement's own things go *in* this, not beside the card's parts.
               */
              {
                stype: 'frame',
                attributes: {
                  partId: 'items',
                  slot: 'items',
                  x: 360,
                  y: 2520,
                  width: 4320,
                  height: 1200,
                  layoutMode: 'column',
                  gap: 120,
                  padding: 0,
                  clipsContent: false
                }
              }
            ]
          }
        ]
      }
    ]
  };
}
