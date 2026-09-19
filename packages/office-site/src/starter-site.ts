import { SITE_SURFACE_KIND } from './site-schema';

/**
 * **What a new site is** — the thing this product could not make.
 *
 * *새 사이트* loaded `createSampleSite()`, which is an eight-page fixture built to exercise data
 * rows, components, variables, a contact form and an Open Graph head. Starting meant **deleting
 * somebody else's pages**, and the ones a reader deleted last were the ones the fixture existed
 * to test. Word answered the same question with `createStarterDocument` and this is its mirror.
 *
 * What a new site *is* is a fact about documents rather than about the chrome, which is why this
 * lives in the package.
 *
 * ## What is in it, and what deliberately is not
 *
 * One page at `/`, named 홈, with one empty text block. That is the whole of it.
 *
 * - **No sample copy.** Prose a reader has to delete before they can write is worse than an empty
 *   page — the fixture problem in miniature.
 * - **No variables, and therefore no `fill: 'var:종이'`.** Every page in the sample paints itself
 *   from a variable the sample declares. A starter that borrowed that name would be a site whose
 *   first page is painted by something it does not have — `var()` with nothing behind it kills the
 *   **whole declaration**, which is a fault this repository has already paid for once.
 * - **No header or footer band.** They are a decision about a site that has more than one page.
 * - **An empty `docTitle`.** Empty rather than absent: 관리's nav edits the node it finds, so a
 *   site with no `docTitle` is one a reader cannot name. `siteTitle` answers `undefined` for an
 *   empty one, so a save before it is filled in is called 사이트 rather than named after nothing.
 * - **No address.** `address` is what the canonical link, `og:url` and the sitemap need, and all
 *   three are written *only* when a site has said. A guessed address is a canonical pointing at
 *   somebody else's domain, which is worse than none — and the sample's own note says so.
 */
export function createStarterSite(): unknown {
  return {
    stype: 'document',
    attributes: {},
    content: [
      {
        stype: 'docMeta',
        content: [{ stype: 'docTitle', content: [{ stype: 'inline-text', text: '' }] }]
      },
      {
        stype: 'surface',
        attributes: {
          kind: SITE_SURFACE_KIND,
          id: 'home',
          name: '홈',
          path: '/'
        },
        content: [
          {
            stype: 'richText',
            attributes: {},
            content: [
              {
                stype: 'paragraph',
                content: [{ stype: 'inline-text', text: '' }]
              }
            ]
          }
        ]
      }
    ]
  };
}
