import { fontFaceSpecs, googleFontUrl, isWebFont } from '@barocss/office-controls';

/**
 * Fetching the fonts a document names.
 *
 * The host's job, not the document's: a .docx says "Merriweather" and says
 * nothing about where the bytes come from, which is right — the same document
 * opens on a machine that has it installed and on one that does not.
 *
 * The reason this is more than a stylesheet link is that pagination *measures*.
 * Where a page breaks is decided by how far the text actually reached, so text
 * measured in a fallback and then repainted in the real face is text whose page
 * breaks were computed for a font it is not set in. Every page after the first
 * would be wrong, and wrong in a way that looks like a pagination bug rather
 * than a font one.
 *
 * So loading is something to *wait for*, and the layout has to run again after
 * it. Nothing here decides when that is: the caller is given the moment.
 */
export interface FontLoader {
  /**
   * Fetch a family if it needs fetching, and resolve when it can be measured.
   *
   * Resolves immediately for a font already present or already loaded, so a
   * caller may ask on every selection change without cost.
   */
  ensure(family: string | undefined): Promise<void>;
}

export function createFontLoader(document_: Document = document): FontLoader {
  /** Families already asked for, so a second ask does not add a second link. */
  const requested = new Map<string, Promise<void>>();

  return {
    ensure(family) {
      if (!family || !isWebFont(family)) return Promise.resolve();

      const already = requested.get(family);
      if (already) return already;

      const url = googleFontUrl([family]);
      if (!url) return Promise.resolve();

      const link = document_.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.setAttribute('data-font-family', family);

      // The stylesheet has to arrive before the faces can be waited on. This is
      // not an optimisation: `document.fonts.load` resolves against the faces
      // that exist *now*, so asking before the stylesheet is parsed matches
      // nothing and resolves instantly — reporting a font ready that has not
      // been requested yet. Which is precisely the false answer this whole file
      // exists to avoid.
      const stylesheet = new Promise<void>((resolve) => {
        link.addEventListener('load', () => resolve());
        link.addEventListener('error', () => resolve());
      });
      document_.head.appendChild(link);

      // Then each weight separately: asking for the family alone resolves as
      // soon as any one face arrives, and the bold arriving later changes the
      // width of every line it is on — after the page breaks were decided.
      const loaded = stylesheet
        .then(() =>
          Promise.all(
            fontFaceSpecs(family).map((spec) =>
              (document_ as any).fonts?.load?.(spec) ?? Promise.resolve()
            )
          )
        )
        .then(() => undefined)
        // A font that fails to arrive is a document that renders in a fallback,
        // which is what a reader without the font would see anyway. It is not a
        // reason to leave the page blank.
        .catch(() => undefined);

      requested.set(family, loaded);
      return loaded;
    }
  };
}
