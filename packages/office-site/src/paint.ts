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

  if (layers.length > 0) {
    css.backgroundImage = layers.join(', ');
    css.backgroundSize = sizes.join(', ');
    css.backgroundRepeat = repeats.join(', ');
    css.backgroundPosition = 'center';
  }

  const fill = resolve(attrs.fill);
  if (fill) css.backgroundColor = fill;

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
    ...(shadow ? { boxShadow: shadow } : {})
  };
}
