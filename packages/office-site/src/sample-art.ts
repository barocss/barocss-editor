/**
 * The pictures the sample draws with.
 *
 * ## Why they are drawn here rather than fetched
 *
 * Every sample in this repository refuses an asset for one reason, written down when the first
 * swatch was made: *a document that needs a server to look right is a document a test cannot open.*
 * The browser suite runs offline, the export test reads the HTML it produces, and a `picsum.photos`
 * URL turns both of those into a network call that can fail in a way that looks like a bug in the
 * product.
 *
 * So the pictures are **SVG data URIs, composed rather than flat**. The first version of this was a
 * rectangle with a word on it, which is honest about being a placeholder and made every page of the
 * sample look like a wireframe of itself — and a sample that looks like a wireframe cannot be used
 * to judge whether the product can make something that does not.
 *
 * ## What each of them is for
 *
 * Not decoration. Each one exercises a thing the page builder can now do and could not before: a
 * gradient behind words, a texture that tiles, a picture that a section paints itself with rather
 * than places in the flow.
 */

/** An SVG string as a picture a page can draw. */
const asPicture = (svg: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;

/**
 * The mark of the suite: three sheets, offset, in the brand's green.
 *
 * Three because the argument the whole site makes is *one engine, three products*, and a mark that
 * says the product's own claim is worth more than a lettermark that says nothing.
 */
export const wordmark = (): string =>
  asPicture(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
      <rect x="6" y="10" width="26" height="32" rx="4" fill="#0F7A5A" opacity="0.25"/>
      <rect x="11" y="7" width="26" height="32" rx="4" fill="#0F7A5A" opacity="0.55"/>
      <rect x="16" y="4" width="26" height="32" rx="4" fill="#0F7A5A"/>
    </svg>
  `);

/**
 * The hero's picture: the three products as three panes of one document.
 *
 * A composition rather than a screenshot, and deliberately so — a fake screenshot built out of
 * rectangles is the oldest tell there is. This says what the products *are* in the shape the model
 * itself uses: a column of blocks, a canvas of placed boxes, a page of sections.
 */
export const enginePicture = (): string =>
  asPicture(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480" width="640" height="480">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#0F7A5A"/>
          <stop offset="1" stop-color="#0B3D31"/>
        </linearGradient>
      </defs>
      <rect width="640" height="480" rx="20" fill="url(#g)"/>
      <g fill="#F6F7F5">
        <rect x="44" y="52" width="164" height="376" rx="10" opacity="0.96"/>
        <rect x="236" y="52" width="164" height="180" rx="10" opacity="0.9"/>
        <rect x="236" y="248" width="164" height="180" rx="10" opacity="0.9"/>
        <rect x="428" y="52" width="168" height="376" rx="10" opacity="0.84"/>
      </g>
      <g fill="#0B3D31" opacity="0.55">
        <rect x="60" y="72" width="112" height="9" rx="4"/>
        <rect x="60" y="94" width="132" height="6" rx="3"/>
        <rect x="60" y="108" width="120" height="6" rx="3"/>
        <rect x="60" y="122" width="126" height="6" rx="3"/>
        <rect x="60" y="150" width="132" height="72" rx="6" opacity="0.4"/>
        <rect x="60" y="238" width="118" height="6" rx="3"/>
        <rect x="60" y="252" width="130" height="6" rx="3"/>
        <rect x="60" y="266" width="104" height="6" rx="3"/>
        <rect x="252" y="72" width="86" height="9" rx="4"/>
        <rect x="252" y="96" width="132" height="52" rx="6" opacity="0.4"/>
        <rect x="252" y="160" width="96" height="6" rx="3"/>
        <rect x="252" y="268" width="72" height="9" rx="4"/>
        <rect x="252" y="292" width="132" height="40" rx="6" opacity="0.4"/>
        <rect x="252" y="344" width="108" height="6" rx="3"/>
        <rect x="444" y="72" width="136" height="60" rx="6" opacity="0.4"/>
        <rect x="444" y="146" width="98" height="9" rx="4"/>
        <rect x="444" y="170" width="136" height="6" rx="3"/>
        <rect x="444" y="184" width="120" height="6" rx="3"/>
        <rect x="444" y="212" width="64" height="64" rx="6" opacity="0.4"/>
        <rect x="516" y="212" width="64" height="64" rx="6" opacity="0.4"/>
        <rect x="444" y="292" width="136" height="6" rx="3"/>
        <rect x="444" y="306" width="112" height="6" rx="3"/>
      </g>
    </svg>
  `);

/**
 * A faint grid, tiled behind a section.
 *
 * The one background that is genuinely a texture rather than an image, and the reason `tile` is one
 * of the three fits: a 32px square repeated is 300 bytes and covers a wall.
 */
export const gridTexture = (ink: string, opacity: number): string =>
  asPicture(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
      <path d="M32 0H0v32" fill="none" stroke="${ink}" stroke-opacity="${opacity}" stroke-width="1"/>
    </svg>
  `);

/**
 * A customer's mark, as a monogram.
 *
 * Invented brands get invented marks: a wordmark in a `<span>` is what a logo wall looks like when
 * nobody made the logos, and it reads as unfinished however good the type is.
 */
export const monogram = (letters: string, ink: string): string =>
  asPicture(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40" width="120" height="40">
      <rect x="0" y="8" width="24" height="24" rx="6" fill="${ink}" opacity="0.85"/>
      <text x="34" y="27" font-family="Helvetica, Arial, sans-serif" font-size="15"
            font-weight="600" letter-spacing="1.2" fill="${ink}" opacity="0.7">${letters}</text>
    </svg>
  `);

/**
 * A portrait, as a flat figure in the brand's greens.
 *
 * A stock photograph of a "diverse team" is the tell this repository would be reaching for if it
 * could reach for one at all; it cannot, and the composed figure is the better answer anyway —
 * nobody mistakes it for a real person, which is what a placeholder should manage.
 */
export const portrait = (base: string, accent: string): string =>
  asPicture(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 380" width="320" height="380">
      <rect width="320" height="380" fill="${base}"/>
      <circle cx="160" cy="146" r="62" fill="${accent}" opacity="0.9"/>
      <path d="M40 380c0-70 54-116 120-116s120 46 120 116z" fill="${accent}" opacity="0.72"/>
    </svg>
  `);

/**
 * The picture a blog post is filed under: a horizon, in two greens.
 *
 * Abstract on purpose. A post about input handling illustrated with a photograph of a keyboard is
 * the kind of stock-image decision that makes a page look bought rather than made.
 */
export const postCover = (from: string, to: string, shift: number): string =>
  asPicture(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320" width="480" height="320">
      <defs>
        <linearGradient id="p" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stop-color="${from}"/>
          <stop offset="1" stop-color="${to}"/>
        </linearGradient>
      </defs>
      <rect width="480" height="320" fill="url(#p)"/>
      <circle cx="${shift}" cy="196" r="132" fill="#F6F7F5" opacity="0.14"/>
      <rect y="${236 + (shift % 24)}" width="480" height="84" fill="#F6F7F5" opacity="0.09"/>
    </svg>
  `);
