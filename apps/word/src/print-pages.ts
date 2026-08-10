/**
 * Turning the paginated flow into pages, for printing.
 *
 * The document on screen is one continuous flow with sheets drawn behind it.
 * That is right for reading and editing — the text is one thing, and a caret
 * moves through it — but paper is not continuous, and a browser asked to
 * paginate it a second time disagrees with the layout that was already
 * measured. It especially cannot be told to break *inside* a paragraph, which
 * is where three of this document's pages begin.
 *
 * So printing does not describe the pages to the browser. It builds them.
 *
 * Each page is a box the size of a sheet with the whole document inside it,
 * shifted up so that exactly that sheet's worth shows through, and clipped. The
 * text is never cut: a paragraph crossing a boundary appears in both pages, the
 * top of it in one and the bottom in the other, which is what a paragraph
 * crossing a page boundary looks like on paper. Line breaking is identical in
 * every copy because the width is, so the two halves meet exactly.
 *
 * Nothing about the document changes to do this. The copies exist only while
 * the print dialog is open, and they are copies — the model has one paragraph,
 * and the caret still lives in the one on screen. That is the whole reason this
 * is safe here and would not be on screen: two DOM copies of one node would be
 * two places to type into, and the input path reads text back out of the DOM.
 */
export interface PrintPages {
  /** Build the pages. Idempotent: building twice replaces the first set. */
  build(): number;
  /** Remove them. */
  clear(): void;
  /** Build and clear around the browser's own print, and stop doing so. */
  attach(): () => void;
}

const CONTAINER_CLASS = 'w-print-pages';

export function createPrintPages(root: () => HTMLElement | null, document_: Document = document): PrintPages {
  const clear = (): void => {
    document_.querySelectorAll(`.${CONTAINER_CLASS}`).forEach((el) => el.remove());
  };

  const build = (): number => {
    clear();
    const source = root();
    if (!source) return 0;

    const sheets = [...source.querySelectorAll('.w-sheet')] as HTMLElement[];
    if (sheets.length === 0) return 0;

    // Offsets are taken against the element being copied. A sheet's position
    // inside its own section says nothing about where that section sits in the
    // flow, and a document with two sections has both.
    const origin = source.getBoundingClientRect();
    const container = document_.createElement('div');
    container.className = CONTAINER_CLASS;

    for (const sheet of sheets) {
      const box = sheet.getBoundingClientRect();
      const page = document_.createElement('div');
      page.className = 'w-print-page';
      page.style.width = `${box.width}px`;
      page.style.height = `${box.height}px`;

      const copy = source.cloneNode(true) as HTMLElement;
      copy.classList.add('w-print-copy');
      // Ids would be duplicated across every page, and a duplicated id is a
      // wrong answer to every question anyone asks the document.
      copy.removeAttribute('id');
      copy.style.width = `${origin.width}px`;
      copy.style.left = `${-(box.left - origin.left)}px`;
      copy.style.top = `${-(box.top - origin.top)}px`;

      page.appendChild(copy);
      container.appendChild(page);
    }

    document_.body.appendChild(container);
    return sheets.length;
  };

  return {
    build,
    clear,
    attach() {
      // The browser's own events, so this works for the print dialog and for a
      // PDF asked for programmatically alike. Building has to be synchronous:
      // by the time beforeprint returns, the browser is laying out the pages.
      const view = document_.defaultView;
      if (!view) return () => {};

      const before = () => void build();
      const after = () => clear();
      view.addEventListener('beforeprint', before);
      view.addEventListener('afterprint', after);
      return () => {
        view.removeEventListener('beforeprint', before);
        view.removeEventListener('afterprint', after);
        clear();
      };
    }
  };
}
