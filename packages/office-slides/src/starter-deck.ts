import type { INode } from '@barocss/datastore';

/**
 * What a **new** deck is.
 *
 * The app could save a deck and open one and had no way to start one: a reader
 * who wanted their own presentation had to delete somebody else's slides out of
 * the sample. Which is the gap this closes, and the interesting part is what a
 * new deck should *contain*, because "empty" is not an answer — an empty document
 * is a white rectangle with nothing to click and no way in.
 *
 * ## One title slide, and the definitions under it
 *
 * A slide is only half of a deck. The other half is in `resources`: a theme (what
 * the colours and faces *are*), a master (what every layout starts from) and the
 * layouts a new slide can be made from. Without those a new deck has no design to
 * inherit, `theme:accent1` resolves to nothing, and the first thing a reader does
 * — add a slide — has no layout to pick.
 *
 * So this is deliberately the sample deck's *definitions* with none of its
 * content, and it is a second file rather than an option on `createSampleDeck`
 * for one reason: the sample exists to exercise every node type the engine draws,
 * and the starter exists to be the least a reader can begin from. Those two go in
 * opposite directions with every change.
 *
 * ## Why the placeholders are empty
 *
 * PowerPoint's blank presentation has a title box with prompt text in it, and the
 * prompt is *not in the document* — it is drawn by the app and disappears the
 * moment anything is typed. So the frames here hold an empty paragraph, which is
 * what the reader would have after selecting the prompt text and deleting it, and
 * the prompt is a decoration the view draws (see `slides.css`). A deck saved
 * straight after being made therefore contains no words this product invented.
 *
 * An empty paragraph rather than no paragraph, because a `textFrame` is
 * `block+`: a frame with no block is a document the schema refuses, and a caret
 * has nowhere to go in it.
 */

/** An empty line, which is what an untouched placeholder holds. */
const blank = (attributes: Record<string, unknown> = {}): INode => ({
  stype: 'paragraph',
  attributes,
  content: [{ stype: 'inline-text', text: '' }]
});

/**
 * A deck with one title slide, its theme, its master and its layouts.
 *
 * The same ids the sample uses (`theme-1`, `master-1`, `layout-title`,
 * `layout-body`), and deliberately: a deck opened from a file and a deck made
 * here are the same shape, so every reader of a `layoutId` — the format chain, the
 * layout dialog, the thumbnail — works on both without knowing which it has.
 */
export function createStarterDeck(): INode {
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
            /**
             * Named rather than left blank, because the *file* is named after it:
             * `deckFileName` reads the opening slide's title and falls back to a
             * name nobody chose. A new deck that saves itself as "제목 없는
             * 프레젠테이션.json" is telling the truth.
             */
            content: [{ stype: 'inline-text', text: '제목 없는 프레젠테이션' }]
          }
        ]
      },

      {
        stype: 'surface',
        attributes: { kind: 'slide', name: '슬라이드 1', layoutId: 'layout-title' },
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
            // The size and the alignment are the *title layout's* answer, which
            // this repeats because a slide's own placeholder is what gets edited.
            content: [blank({ alignment: 'center', fontSize: 108, bold: true })]
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
            content: [blank({ alignment: 'center', fontSize: 44, color: '#64748b' })]
          }
        ]
      },

      {
        stype: 'resources',
        attributes: {},
        content: [
          {
            stype: 'theme',
            attributes: {
              id: 'theme-1',
              name: 'Office',
              dark1: '#0f172a',
              light1: '#ffffff',
              dark2: '#334155',
              light2: '#f1f5f9',
              accent1: '#2563eb',
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
                content: [blank({ fontFamily: 'theme:major', fontSize: 66 })]
              },
              {
                stype: 'textFrame',
                attributes: { role: 'body', x: 1440, y: 3120, width: 16320, height: 6240 },
                content: [blank({ fontFamily: 'theme:minor', fontSize: 40 })]
              }
            ]
          },
          {
            stype: 'slideLayout',
            attributes: { id: 'layout-title', name: '제목 슬라이드', masterId: 'master-1' },
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
                content: [blank({ alignment: 'center', fontSize: 108 })]
              },
              {
                stype: 'textFrame',
                attributes: {
                  role: 'subtitle',
                  x: 1920,
                  y: 6240,
                  width: 15360,
                  height: 1200
                },
                content: [blank({ alignment: 'center', fontSize: 44 })]
              }
            ]
          },
          {
            stype: 'slideLayout',
            attributes: { id: 'layout-body', name: '제목과 내용', masterId: 'master-1' },
            content: [
              {
                stype: 'textFrame',
                attributes: { role: 'title', x: 1440, y: 960, width: 16320, height: 1680 },
                content: [blank()]
              },
              {
                stype: 'textFrame',
                attributes: { role: 'body', x: 1440, y: 3120, width: 16320, height: 6240 },
                content: [blank()]
              }
            ]
          }
        ]
      }
    ]
  };
}
