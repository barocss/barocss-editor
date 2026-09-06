import type { INode } from '@barocss/datastore';

/**
 * **What a new document is** — the thing Word could not make.
 *
 * The app could not start one. It loaded `createSampleDocument()` at boot and that was the only
 * document there was, so beginning meant deleting somebody else's pages out of a fixture that
 * exists to exercise footnotes, content controls, tracked changes and a merged table cell. A
 * reader who wanted a blank page had to make one by demolition.
 *
 * What a new document *is* is a fact about documents rather than about the chrome, which is why
 * this is in the package and not in `apps/word` — the same argument `createStarterDeck` makes one
 * product over.
 *
 * ## What is in it, and what deliberately is not
 *
 * A title the reader will replace, one surface, and one empty paragraph for the caret. That is
 * the whole of it.
 *
 * - **No sample text.** Prose a reader has to delete before they can write is worse than an empty
 *   page; it is the fixture problem in miniature.
 * - **No styles of its own.** The kit registers Normal, Body and the headings, and a starter that
 *   restated any of them would be a second opinion about the cascade — the fault
 *   `docs/specs/word.md` opens with.
 * - **A `docMeta` with an empty `docTitle`.** Empty rather than absent: the title bar edits the
 *   node it finds, so a document with no `docTitle` is one a reader cannot name. `wordTitle`
 *   answers `undefined` for an empty one, so a save before it is filled in is called 문서 rather
 *   than being named after nothing.
 * - **The page size and margins are stated.** Letter at one inch, in twips, because a `surface`
 *   with no size is one the paginator has to guess at, and its guess is not the reader's paper.
 */
export function createStarterDocument(): INode {
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
            content: [{ stype: 'inline-text', text: '' }]
          }
        ]
      },
      {
        stype: 'surface',
        attributes: {
          kind: 'flow',
          name: 'Section 1',
          pageWidth: 12240,
          pageHeight: 15840,
          marginTop: 1440,
          marginBottom: 1440,
          marginLeft: 1440,
          marginRight: 1440
        },
        content: [
          {
            stype: 'paragraph',
            attributes: { styleId: 'Body' },
            content: [{ stype: 'inline-text', text: '' }]
          }
        ]
      }
    ]
  } as INode;
}
