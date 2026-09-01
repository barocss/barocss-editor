/**
 * **What a site is set in** — its faces, its body size, and the rhythm of its headings.
 *
 * ## What was fixed and should not have been
 *
 * `page-css.ts` carried four numbers — `2.75rem`, `1.875`, `1.25`, `1` — and a system font stack, and
 * every site this product made came out in the same type. Colour has been a token since the day the
 * page had one; **the second thing a brand changes has been unreachable.**
 *
 * ## Why it is the document's and not a block's
 *
 * A brand has one or two faces and one rhythm. Setting them per block is what a word processor is for
 * — and this product has that too, as marks, for the sentence that genuinely differs. What was
 * missing is the level above: *this site is set in this.*
 *
 * ## A ratio, not four numbers
 *
 * A scale is a **ratio** and the steps are geometric, which is what a design system means by one and
 * what four hand-picked numbers only approximate. A reader who wants bigger headings wants all of
 * them bigger *in proportion*, and picking four numbers that stay in proportion by hand is the work
 * this replaces.
 *
 * The default is 1.25, which is close to what those four numbers were: `h1` moves from 2.75rem to
 * 2.44 and `h2` from 1.875 to 1.95. A visible change, made once, in exchange for a scale that stays a
 * scale when a reader moves it.
 *
 * ## And the faces are the ones already on the machine
 *
 * Five stacks that need no download — which is the honest limit of what this can do today and is
 * stated rather than hidden: a brand's **own** face needs the font file, and a font file is an asset.
 * That is now possible and is written down in `BACKLOG.md`; until it is built, a reader picks from
 * what a reader's machine already has.
 */

/** The faces a site can be set in, and what a panel calls them. */
export const FACES: { id: string; label: string; stack: string }[] = [
  {
    id: '',
    label: '기본 (산세리프)',
    stack: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', 'Apple SD Gothic Neo', sans-serif"
  },
  {
    id: 'serif',
    label: '세리프',
    /*
     * A Korean serif named before the Latin ones on purpose: a stack whose first entry has no Hangul
     * falls through for Korean text and back for Latin, so the page is set in two faces without
     * anybody choosing the second.
     */
    stack: "'Apple SD Gothic Neo', ui-serif, Georgia, 'Times New Roman', 'Nanum Myeongjo', serif"
  },
  {
    id: 'rounded',
    label: '둥근 산세리프',
    stack: "ui-rounded, 'SF Pro Rounded', 'Apple SD Gothic Neo', system-ui, sans-serif"
  },
  {
    id: 'mono',
    label: '고정폭',
    stack: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'D2Coding', monospace"
  }
];

/** The rhythm a site's headings keep, as a ratio between one step and the next. */
export const SCALES: { id: string; label: string; ratio: number }[] = [
  { id: '', label: '보통 (1.25)', ratio: 1.25 },
  { id: 'calm', label: '차분하게 (1.2)', ratio: 1.2 },
  { id: 'clear', label: '또렷하게 (1.333)', ratio: 1.333 },
  { id: 'loud', label: '크게 (1.5)', ratio: 1.5 }
];

const faceOf = (id: unknown): string =>
  (FACES.find((one) => one.id === id) ?? FACES[0]).stack;

const ratioOf = (id: unknown): number =>
  (SCALES.find((one) => one.id === id) ?? SCALES[0]).ratio;

export interface TypeSetting {
  bodyFace?: unknown;
  headingFace?: unknown;
  /**
   * The body size **in twips**, which is what every length in this schema is.
   *
   * Kept in the document's own unit rather than in pixels, and it took a browser to find out why it
   * had to be: the panel's `unit: 'px'` has always meant two things at once — *print px after the
   * number* and *the document stores this in twips* — so a reader typing 20 wrote **300**, and the
   * page went on being drawn at 16 with nothing saying anything. Every unit test called `typeCss`
   * with a number it had written itself, so all of them agreed with each other and none of them with
   * the panel.
   */
  baseSize?: unknown;
  scale?: unknown;
}

/** 15 twips to the CSS pixel — the one place this file converts. */
const PX = 15;

/** The body size a document states, in pixels, or 16 when it states nothing sensible. */
export function baseSizeOf(attrs: TypeSetting | undefined): number {
  const twips = attrs?.baseSize;
  if (typeof twips !== 'number' || !Number.isFinite(twips)) return 16;
  const px = twips / PX;
  // The bounds the panel offers. A document arriving with something else is drawn readably rather
  // than obeyed — a 2px site is a site nobody can read, including the person who typed it.
  return px >= 12 && px <= 24 ? Math.round(px * 100) / 100 : 16;
}

/**
 * The custom properties a page is set with — one declaration a stylesheet reads everywhere.
 *
 * Properties rather than four rules rewritten, because that is what makes a site's type one decision
 * a reader can change and see everywhere at once: `page-css.ts` names them and never knows what they
 * are.
 *
 * `h4` is the base size and the steps go up from it — a level-4 heading is a bolder line of body
 * text, which is what it is on every page anybody writes, and making it the first step of the scale
 * would leave nothing at the size of the words around it.
 */
export function typeCss(attrs: TypeSetting | undefined): Record<string, string> {
  const base = baseSizeOf(attrs);
  const ratio = ratioOf(attrs?.scale);
  const round = (value: number) => `${Math.round(value * 1000) / 1000}rem`;

  return {
    '--st-body-face': faceOf(attrs?.bodyFace),
    // A site that says nothing about its headings is set in one face, which is what most sites are.
    '--st-head-face': faceOf(attrs?.headingFace ?? attrs?.bodyFace),
    '--st-base': `${base}px`,
    '--st-h4': round(1),
    '--st-h3': round(ratio),
    '--st-h2': round(ratio * ratio * ratio),
    '--st-h1': round(ratio * ratio * ratio * ratio)
  };
}

/** The same, as the text of a `:root` rule — what the published page carries in its head. */
export function typeRule(attrs: TypeSetting | undefined): string {
  const said = Object.entries(typeCss(attrs))
    .map(([key, value]) => `${key}: ${value};`)
    .join(' ');
  return `.st-page { ${said} }`;
}
