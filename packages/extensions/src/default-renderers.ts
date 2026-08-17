import { define, element, getGlobalRegistry, slot } from '@barocss/dsl';

/**
 * What the shared extensions' nodes look like when the product has not said.
 *
 * A floor, never a policy. An extension that offers `insertFigure` and cannot
 * draw a figure puts the reader's text in the model and nowhere on the page —
 * which is what a shipped product with 588 unit tests and 291 end-to-end tests
 * was doing for ten node types, because offering to *make* a node and being
 * able to *draw* one were unrelated facts.
 *
 * Every one of these is registered only if nothing has claimed the type, so a
 * product with its own opinion keeps it. And every one draws the HTML element
 * the node is named after: `bDetails` is a `<details>`, `descList` a `<dl>`.
 * That is not laziness — the standard schema's block set was modelled on HTML's,
 * and an element the browser already knows how to lay out and a screen reader
 * already knows how to announce is a better default than anything invented
 * here.
 */

/** Register a renderer for a type nothing has claimed. */
function floor(nodeType: string, build: () => ReturnType<typeof element>): void {
  if (getGlobalRegistry().has(nodeType)) return;
  define(nodeType, build());
}

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

/** A block that holds other blocks, drawn as the element it is named for. */
const container = (nodeType: string, tag: string, className: string) =>
  floor(nodeType, () => element(tag as 'div', { className }, [slot('content')]));

export function registerDetailsRenderers(): void {
  // `<details>` and `<summary>` are the element pair this node pair is named
  // for, and the browser gives the disclosure behaviour for nothing.
  container('bDetails', 'details', 'bc-details');
  container('bSummary', 'summary', 'bc-summary');
}

export function registerFigureRenderers(): void {
  container('bFigure', 'figure', 'bc-figure');
  container('bFigcaption', 'figcaption', 'bc-figcaption');
}

export function registerDescriptionListRenderers(): void {
  container('descList', 'dl', 'bc-desc-list');
  container('descTerm', 'dt', 'bc-desc-term');
  container('descDef', 'dd', 'bc-desc-def');
}

export function registerColumnsRenderers(): void {
  container('columns', 'div', 'bc-columns');
  // A column's own width, when it names one. The container is the product's to
  // lay out — a default that imposed a grid would be a policy.
  floor('column', () =>
    element(
      'div',
      {
        className: 'bc-column',
        style: (d: Record<string, any>) => {
          const width = str(d.attributes?.width);
          return width ? { width } : {};
        }
      },
      [slot('content')]
    )
  );
}

export function registerPullQuoteRenderers(): void {
  container('pullQuote', 'blockquote', 'bc-pull-quote');
}

export function registerMediaRenderers(): void {
  floor('mediaVideo', () =>
    element('video', ({
      className: 'bc-media-video',
      src: (d: Record<string, any>) => str(d.attributes?.src),
      poster: (d: Record<string, any>) => str(d.attributes?.poster),
      // Written only when asked for: an attribute that resolves to nothing is
      // absent, which is what the renderer means by an attribute not applying.
      controls: (d: Record<string, any>) => (d.attributes?.controls === false ? undefined : 'true')
    }) as never)
  );

  floor('mediaAudio', () =>
    element('audio', ({
      className: 'bc-media-audio',
      src: (d: Record<string, any>) => str(d.attributes?.src),
      controls: (d: Record<string, any>) => (d.attributes?.controls === false ? undefined : 'true')
    }) as never)
  );

  /**
   * An embed is a provider and an id, not a URL.
   *
   * Which is the right thing for a document to store — a provider's URL shape
   * changes and the document should not — and it means the default can only
   * draw what it knows. It draws a labelled placeholder rather than guessing at
   * a URL, and a product that knows the provider replaces it.
   */
  floor('mediaEmbed', () =>
    element(
      'div',
      {
        className: 'bc-media-embed',
        'data-provider': (d: Record<string, any>) => str(d.attributes?.provider),
        'data-embed-id': (d: Record<string, any>) => str(d.attributes?.id)
      },
      [slot('content')]
    )
  );
}

/**
 * A table of contents is *generated*, never stored — so the default draws the
 * empty frame and nothing else.
 *
 * Word computes its entries from the document and its page numbers from the
 * layout, and any product that wants entries has to do the same. A default that
 * invented some would be drawing a document that does not exist.
 */
export function registerTocRenderers(): void {
  floor('toc', () => element('nav', { className: 'bc-toc', 'aria-label': 'Contents' }));
}
