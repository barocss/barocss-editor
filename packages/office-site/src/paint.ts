/**
 * What a box on a page is painted with.
 *
 * ## Why this is here and not in the deck's `paints.ts`
 *
 * The vocabulary is the deck's — the same attribute names, deliberately, because a second product
 * spelling one idea differently is the fault this repository keeps finding in itself. The
 * *arithmetic* cannot be shared as it stands: the deck computes a gradient's axis against a box
 * whose width and height the document states, and a page's box has neither until the browser has
 * laid it out. So a page hands the browser a CSS gradient and lets it do the geometry.
 *
 * And `office-site` must not import `office-slides`: two products depending on each other is how a
 * shared layer stops being one. The day this is wanted a third time it moves to `office-canvas`,
 * which is where `isVarRef` already lives — see `BACKLOG.md`.
 *
 * ## The one thing it does that a canvas does not have to
 *
 * **Resolve a token.** A page's colours are `var:강조` as often as they are hex, because a site with
 * six sections in the same blue is six coincidences and one token is a decision. Every colour that
 * arrives here goes through the same resolver the flat `fill` does.
 */
import { twipToPx } from '@barocss/office-text';

type Attrs = Record<string, any>;
type Css = Record<string, string>;

/** A colour as it should be written, after whatever a page means by it is resolved. */
type Resolve = (value: unknown) => string | undefined;

const number = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/**
 * The background of a box: a picture, a gradient, a colour — in that order, front to back.
 *
 * CSS layers `background-image` front-first, which is the order this returns them in, and a flat
 * `background-color` sits under all of it. So a section can be a photograph over a gradient over a
 * brand colour, which is what a hero usually is, and each layer is one attribute a reader set.
 *
 * `backgroundOpacity` fades **only the picture**, and it does it by compositing the page's own
 * ground over it rather than by setting `opacity` — which would fade the words too. A gradient of
 * one colour to itself is the shortest way to say "a translucent sheet" in a background layer, and
 * it costs no extra element and no pseudo-element a renderer would have to invent.
 */
export function backgroundCss(attrs: Attrs | undefined, resolve: Resolve): Css {
  if (!attrs) return {};
  const layers: string[] = [];
  const sizes: string[] = [];
  const repeats: string[] = [];
  const css: Css = {};

  const picture = typeof attrs.backgroundImage === 'string' ? attrs.backgroundImage.trim() : '';
  if (picture) {
    const veil = number(attrs.backgroundOpacity, 1);
    if (veil < 1) {
      /*
       * A sheet of the page's own ground over the picture, at what is left of the opacity. White is
       * the ground a page draws on when nothing says otherwise, and a section that says otherwise
       * (a dark band with a photograph in it) states its own `fill`, which is behind all of this
       * and is what shows through.
       */
      const sheet = resolve(attrs.fill) ?? '#ffffff';
      const veiled = `linear-gradient(${sheet} 0 0)`;
      layers.push(veiled);
      sizes.push('auto');
      repeats.push('repeat');
      css.backgroundBlendMode = 'normal';
      // The sheet's own alpha is the one thing CSS cannot take from a keyword, so it is written as
      // a colour-mix against transparent — supported everywhere `color-mix` is, which is where this
      // product already lives (`tokens.css`).
      layers[layers.length - 1] = `linear-gradient(color-mix(in srgb, ${sheet} ${Math.round(
        (1 - Math.max(0, Math.min(1, veil))) * 100
      )}%, transparent) 0 0)`;
    }
    layers.push(`url(${JSON.stringify(picture)})`);
    sizes.push(attrs.backgroundFit === 'contain' ? 'contain' : attrs.backgroundFit === 'tile' ? 'auto' : 'cover');
    repeats.push(attrs.backgroundFit === 'tile' ? 'repeat' : 'no-repeat');
  }

  const gradient = gradientCss(attrs, resolve);
  if (gradient) {
    layers.push(gradient);
    sizes.push('auto');
    repeats.push('no-repeat');
  }

  /**
   * And a **cover over all of it**, which is the layer this had no way to state.
   *
   * The stack above is picture over gradient over colour, and every one of those is *behind* the
   * picture or is the picture. What a hero actually needs is a sheet **on top**: white words over a
   * photograph are unreadable until something dims it, and the two answers that existed were both
   * the wrong shape — `backgroundOpacity` fades the picture toward the box's own `fill`, which is
   * the page's ground and not a colour anybody chose, and a gradient is underneath where an opaque
   * photograph hides it entirely.
   *
   * A colour and how much of it, rather than a gradient, because a scrim is one decision: *make this
   * darker so the words read*. A reader who wants a fade from one edge has `gradientFrom` and no
   * picture, which is a different design.
   *
   * `unshift`, because `background-image` paints its **first** layer in front.
   */
  const cover = resolve(attrs.overlay);
  if (cover) {
    const much = Math.max(0, Math.min(1, number(attrs.overlayOpacity, 1)));
    const sheet =
      much >= 1 ? cover : `color-mix(in srgb, ${cover} ${Math.round(much * 100)}%, transparent)`;
    layers.unshift(`linear-gradient(${sheet} 0 0)`);
    sizes.unshift('auto');
    repeats.unshift('repeat');
  }

  if (layers.length > 0) {
    css.backgroundImage = layers.join(', ');
    css.backgroundSize = sizes.join(', ');
    css.backgroundRepeat = repeats.join(', ');
    css.backgroundPosition = 'center';
  }

  const fill = resolve(attrs.fill);
  if (fill) css.backgroundColor = fill;

  /*
   * The pair: what the box is painted with, and what is written on it. `color` inherits, so stating
   * it on a section is what makes one decision reach every block inside — and a run that states its
   * own colour still wins over it, which is the order a reader expects.
   */
  const ink = resolve(attrs.ink);
  if (ink) css.color = ink;

  return css;
}

/**
 * A gradient, from its two ends.
 *
 * Half of one still draws: a `gradientFrom` with no `gradientTo` fades that colour into nothing,
 * which is a real thing designers do and is what "a document that says half of it still draws"
 * means for this attribute — the deck says the same about its own.
 */
export function gradientCss(attrs: Attrs | undefined, resolve: Resolve): string | undefined {
  const from = resolve(attrs?.gradientFrom);
  const to = resolve(attrs?.gradientTo);
  if (!from && !to) return undefined;

  const start = from ?? 'transparent';
  const end = to ?? 'transparent';
  if (attrs?.gradientKind === 'radial') return `radial-gradient(circle at center, ${start}, ${end})`;

  // CSS measures a gradient's angle from *up*, clockwise — which is how the deck measures it too.
  return `linear-gradient(${number(attrs?.gradientAngle, 180)}deg, ${start}, ${end})`;
}

/**
 * A shadow, from a colour, a softness and which way it is thrown.
 *
 * **The deck's arithmetic, exactly** — `x = d·sin θ`, `y = −d·cos θ`, so 0° throws it upward and the
 * default 180° throws it down, which is the ordinary card. Copied rather than reinvented for the
 * same reason the names are: two products where `shadowAngle: 45` means two different directions
 * would be one document drawn two ways.
 *
 * And never `-0`. `cos(90°)` is 6.1e-17 rather than zero, so a shadow thrown straight sideways
 * rounds to a negative zero and writes `-0px` into a style attribute. The deck documents the same
 * trap one level down, where it would be written into the *document*.
 */
export function shadowCss(attrs: Attrs | undefined, resolve: Resolve): string | undefined {
  const colour = resolve(attrs?.shadowColor);
  if (!colour) return undefined;

  const distance = twipToPx(number(attrs?.shadowDistance, 0));
  const blur = twipToPx(number(attrs?.shadowBlur, 0));
  const radians = (number(attrs?.shadowAngle, 180) * Math.PI) / 180;

  const round = (value: number): number => {
    const at = Math.round(value * 100) / 100;
    return at === 0 ? 0 : at;
  };

  return `${round(distance * Math.sin(radians))}px ${round(-distance * Math.cos(radians))}px ${blur}px ${colour}`;
}

/**
 * The corners, when a box rounds them differently.
 *
 * Each falls back to `cornerRadius`, the same way each side of the padding falls back to `padding`
 * — one number is the common case and four is the one that makes a tab, a speech bubble or a card
 * whose top is flush with the picture above it.
 */
export function cornersCss(attrs: Attrs | undefined): Css {
  if (!attrs) return {};
  const named = ['cornerTopLeft', 'cornerTopRight', 'cornerBottomRight', 'cornerBottomLeft'];
  if (!named.some((one) => typeof attrs[one] === 'number')) return {};

  const one = (name: string) => `${twipToPx(number(attrs[name] ?? attrs.cornerRadius, 0))}px`;
  return { borderRadius: named.map(one).join(' ') };
}

/**
 * How much of the block comes through — the one property a page had written off.
 *
 * ## The exemption that was wrong, and what it cost
 *
 * `opacity` was exempt from `every-attribute-is-read` with the reason *"a canvas idea; a page has no
 * z-order to see through"*, which is not what opacity is. Z-order decides *which* of two overlapping
 * things you see; opacity decides how much of one you see, and a flow page uses it constantly — a
 * scrim over a hero picture, a caption at 60%, a card that reads as not-yet-available.
 *
 * What the wrong reason cost is visible in this same file: `backgroundOpacity` exists because a hero
 * is words over a photograph and the photograph has to be faded. A special case was built for the
 * one place the need could not be argued away, and it is still the right control — it fades the
 * **picture and not the words**, which `opacity` cannot do — but it was built beside a general answer
 * that had been ruled out by a sentence.
 *
 * ## Silence is 1, and 1 draws nothing
 *
 * A block that says nothing about opacity gets no `opacity` in its style at all, rather than
 * `opacity: 1`. The two look identical and are not: `opacity` below 1 makes a **stacking context**,
 * which changes what a `position: sticky` header inside it can escape. A page that stated 1
 * everywhere would be a page whose sticky headers stopped working for a value nobody set.
 */
export function opacityCss(attrs: Attrs | undefined): Css {
  const said = attrs?.opacity;
  if (typeof said !== 'number' || !Number.isFinite(said) || said >= 1) return {};
  return { opacity: String(Math.max(0, said)) };
}

/** Everything a page paints a box with, as one style object. */
export function paintCss(attrs: Attrs | undefined, resolve: Resolve): Css {
  const shadow = shadowCss(attrs, resolve);
  return {
    ...backgroundCss(attrs, resolve),
    ...cornersCss(attrs),
    ...opacityCss(attrs),
    ...typeRhythmCss(attrs),
    ...effectsCss(attrs),
    ...(shadow ? { boxShadow: shadow } : {})
  };
}


/**
 * **The rhythm the words in a box are set at** — their line spacing and their tracking.
 *
 * On the box rather than on the words, and inherited, which is the argument `ink` already won: a
 * band states it once and every heading, paragraph and list inside takes it, while anything that
 * states its own still wins. Per-run tracking is a mark and this is not that — this is *a section is
 * set tight*, which is one decision and not forty.
 *
 * ## The units, and why they are not twips
 *
 * Both are **percentages of the font's own size**, because that is what they mean. A tracking of
 * -2.5% stays -2.5% when the heading grows from 44px to 96px; a tracking of -1.1px becomes wrong at
 * the first breakpoint. Twips would have made them lengths that do not scale, which is the fault
 * every one of these attributes exists to avoid — and `baseSize` already cost a feature by being
 * read in the wrong unit, so it is written down here rather than assumed.
 *
 * `lineHeight` is a percentage too: 140 is 1.4, which is how every type tool states it.
 */
export function typeRhythmCss(attrs: Attrs | undefined): Css {
  const css: Css = {};

  const tracking = attrs?.letterSpacing;
  if (typeof tracking === 'number' && Number.isFinite(tracking) && tracking !== 0) {
    css.letterSpacing = `${Math.round(tracking * 1000) / 100000}em`;
  }

  const leading = attrs?.lineHeight;
  if (typeof leading === 'number' && Number.isFinite(leading) && leading > 0) {
    css.lineHeight = String(Math.round(leading * 100) / 10000);
  }

  return css;
}

/** The blend modes a page may ask for — short on purpose; see `effectsCss`. */
export const BLENDS = ['', 'multiply', 'screen', 'overlay', 'difference'] as const;

/**
 * **The three effects that make a page look made rather than assembled**, and their costs.
 *
 * - **`rotate`** — the deliberate disruption. A page of upright rectangles reads as a template no
 *   matter what is in them, and one thing at 3° is the cheapest way to say a person arranged this.
 *   Degrees, CSS's direction: positive is clockwise.
 * - **`blend`** — how this box mixes with what is under it. The short list is the point: `multiply`
 *   is what a second ink does on paper and is most of why a two-colour print looks printed;
 *   `screen`, `overlay` and `difference` are the three anybody else asks for. A longer list would be
 *   sixteen modes nobody can predict.
 * - **`backdropBlur`** — frosted glass, in twips like every other length. Only visible through a
 *   translucent fill, which is a fact about the effect rather than about this code: a reader who
 *   sets it on an opaque box sees nothing, and the panel says so.
 *
 * ## What each of them costs, said once
 *
 * `rotate` and `backdropBlur` both make a **stacking context**, which is the same cost `opacity`
 * carries and is documented there: a `position: sticky` header inside a rotated box can no longer
 * escape it. So none of them is written when the value says nothing — a `rotate: 0` and no rotate at
 * all look identical and are not.
 */
export function effectsCss(attrs: Attrs | undefined): Css {
  const css: Css = {};

  const turn = attrs?.rotate;
  if (typeof turn === 'number' && Number.isFinite(turn) && turn !== 0) {
    css.transform = `rotate(${Math.round(turn * 100) / 100}deg)`;
  }

  const blend = attrs?.blend;
  if (typeof blend === 'string' && (BLENDS as readonly string[]).includes(blend) && blend) {
    css.mixBlendMode = blend;
  }

  const frost = attrs?.backdropBlur;
  if (typeof frost === 'number' && Number.isFinite(frost) && frost > 0) {
    const radius = `${Math.round(twipToPx(frost))}px`;
    css.backdropFilter = `blur(${radius})`;
    // Safari still wants the prefix, and a hero that frosts on one browser and not another is worse
    // than one that frosts on neither.
    css.WebkitBackdropFilter = `blur(${radius})`;
  }

  return css;
}