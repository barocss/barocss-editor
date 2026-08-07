/**
 * The fonts a document may be set in.
 *
 * Two facts about a font matter here and they belong to different layers. Which
 * families the product offers is a document concern — a .docx stores a font by
 * name, and that name has to mean something to whoever opens it next. Whether
 * the bytes for a family are already on the machine is a host concern, and the
 * host is the only thing that can do something about it.
 *
 * So this says which families exist and which of them a host would have to
 * fetch, and stops there. Fetching is the app's, because a browser, a
 * server-side renderer and a desktop build would each do it differently.
 *
 * The list is curated rather than fetched. Google publishes upwards of a
 * thousand families and offering all of them would be worse than offering
 * thirty: Word shows the fonts you can actually use, and a document set in a
 * font the next reader has no way to get is a document that looks different to
 * each of them.
 */
import type { DocumentAccess, DocumentNode } from './document-access';

export interface FontFamily {
  /** The name stored in the document, and shown in the control. */
  family: string;
  /**
   * Whether a host has to fetch this family before it will render.
   *
   * The ones that do not are the fonts a desktop can be assumed to have. Naming
   * them costs nothing and they render immediately, which is why they are still
   * offered alongside the web ones.
   */
  web: boolean;
}

const system = (family: string): FontFamily => ({ family, web: false });
const web = (family: string): FontFamily => ({ family, web: true });

export const WORD_FONT_CATALOGUE: FontFamily[] = [
  // Assumed present. A document set in one of these is readable the instant it
  // opens, with no fetch and nothing to wait for.
  system('Georgia'),
  system('Times New Roman'),
  system('Arial'),
  system('Helvetica'),
  system('Courier New'),
  system('Verdana'),

  // Serif faces meant for running text.
  web('EB Garamond'),
  web('Libre Baskerville'),
  web('Lora'),
  web('Merriweather'),
  web('Noto Serif'),
  web('Playfair Display'),
  web('Source Serif 4'),

  web('Inter'),
  web('Lato'),
  web('Montserrat'),
  web('Noto Sans'),
  web('Open Sans'),
  web('Roboto'),
  web('Source Sans 3'),
  web('Work Sans'),

  web('JetBrains Mono'),
  web('Roboto Mono'),
  web('Source Code Pro'),

  // Korean. A document that mixes scripts needs a family that covers both, and
  // the Latin fonts above cover none of Hangul.
  web('Noto Sans KR'),
  web('Noto Serif KR'),
  web('Nanum Gothic'),
  web('Nanum Myeongjo')
];

/** Whether a family has to be fetched before it will render. */
export function isWebFont(family: string | undefined): boolean {
  if (!family) return false;
  return WORD_FONT_CATALOGUE.some((entry) => entry.family === family && entry.web);
}

/**
 * Where to fetch a family from.
 *
 * Regular and bold, because a document that turns bold on would otherwise get a
 * browser's synthetic emboldening — which is a different width, and width is
 * what pagination is measuring.
 *
 * `display=block` rather than the usual `swap`: swapping means text is painted
 * in a fallback and then re-painted in the real face, and everything measured in
 * between is measured against the wrong font. Blocking keeps the text invisible
 * until it can be measured once, correctly.
 */
export function googleFontUrl(families: string[]): string | null {
  const wanted = families.filter(isWebFont);
  if (wanted.length === 0) return null;

  const query = wanted
    .map((family) => `family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@400;700`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${query}&display=block`;
}

/**
 * Every family the document names, whether by a style or by direct formatting.
 *
 * A host has to know this before the first measurement, not after: the document
 * arrives already set in something, and pagination measures whatever is on the
 * page when it runs. Finding out from the toolbar would be finding out too late.
 *
 * Stacks are reduced to their first family for the same reason the toolbar does
 * it — a stylesheet writes fallbacks, and the first name is the one that has to
 * be fetched.
 */
export function documentFontFamilies(doc: DocumentAccess): string[] {
  const found = new Set<string>();

  const add = (value: unknown): void => {
    if (typeof value !== 'string' || value.length === 0) return;
    const first = value.split(',')[0].trim().replace(/^["']|["']$/g, '');
    if (first) found.add(first);
  };

  const visit = (node: DocumentNode | undefined, depth: number): void => {
    if (!node || depth > 64) return;
    add(node.attributes?.fontFamily);
    for (const mark of node.marks ?? []) {
      if (mark?.stype === 'fontFamily') add(mark.attrs?.family);
    }
    // Style definitions are where most of the answer is: a document usually
    // names its fonts once, in its styles, and never again.
    for (const child of node.content ?? []) {
      visit(typeof child === 'string' ? doc.getNode(child) : child, depth + 1);
    }
  };

  visit(doc.getNode(doc.rootId), 0);
  return [...found].filter(isWebFont);
}

/**
 * The CSS font specifications to wait on for a family.
 *
 * `document.fonts.load` takes a font shorthand and resolves when that exact face
 * is ready; asking for the family alone would resolve as soon as any weight
 * arrived, and the bold one arriving later would change every line it is on.
 */
export function fontFaceSpecs(family: string): string[] {
  const quoted = `"${family.replace(/"/g, '\\"')}"`;
  return [`400 1em ${quoted}`, `700 1em ${quoted}`];
}
