import type { AxisStep } from './axis';

/**
 * What a length looks like to a reader.
 *
 * The document measures in twips — 1440 to the inch, exact against 96dpi
 * pixels, and the unit everything in the engine is stored in. A reader does not
 * think in twips, so every panel that shows a length converts, and *which* unit
 * it converts to is a suite decision rather than a panel's.
 *
 * It had been a panel's. Word showed a number in exactly one place, the ruler,
 * in inches, because a page is paper. Slides' properties panel showed pixels,
 * with a written reason: a reader is looking at a 1280×720 slide and thinking in
 * pixels.
 *
 * That reason does not survive contact with the zoom control. The panel divided
 * twips by fifteen and stopped, so at half size a box occupying 48 screen pixels
 * was reported as 96 — neither a physical length nor the reader's pixels, but
 * "the pixels it would be at 100%". A number that is only true at one zoom is
 * the worst of the three options, and it is what made this worth settling.
 *
 * So: a physical unit, the reader's to choose, shared by both products. The same
 * argument that settled what a document *stores* — a slide and a page are both
 * surfaces that get printed and projected — settles what it shows.
 *
 * Pixels stay on the list. A deck bound for a screen and never for paper is a
 * real thing to be making, and a reader who wants that number should have it;
 * what they should not have is a panel that decided for them.
 */

/** Twips per inch, which is the definition. */
const TWIPS_PER_INCH = 1440;

export type LengthUnit = 'cm' | 'mm' | 'in' | 'pt' | 'px';

interface UnitShape {
  /** How many twips one of these is. */
  twips: number;
  /** What the field writes after the number. */
  suffix: string;
  /** How many decimals are worth showing, given how big the unit is. */
  decimals: number;
}

const UNITS: Record<LengthUnit, UnitShape> = {
  cm: { twips: TWIPS_PER_INCH / 2.54, suffix: 'cm', decimals: 2 },
  mm: { twips: TWIPS_PER_INCH / 25.4, suffix: 'mm', decimals: 1 },
  in: { twips: TWIPS_PER_INCH, suffix: '"', decimals: 2 },
  pt: { twips: 20, suffix: 'pt', decimals: 1 },
  px: { twips: 15, suffix: 'px', decimals: 0 }
};

/** The units a reader can pick, in the order a menu should offer them. */
export const LENGTH_UNITS: { id: LengthUnit; label: string }[] = [
  { id: 'cm', label: 'cm' },
  { id: 'mm', label: 'mm' },
  { id: 'in', label: 'in' },
  { id: 'pt', label: 'pt' },
  { id: 'px', label: 'px' }
];

/** What to write after the number, for a field's suffix. */
export const unitSuffix = (unit: LengthUnit): string => UNITS[unit].suffix;

/**
 * A model length, as a number to show.
 *
 * Rounded to what the unit can usefully carry: a hundredth of a centimetre is a
 * tenth of a millimetre, which is finer than anything a reader is placing by
 * eye, and a hundredth of a *pixel* is noise in a field.
 */
export function toDisplay(twips: number, unit: LengthUnit): number {
  const { twips: per, decimals } = UNITS[unit];
  const factor = 10 ** decimals;
  return Math.round((twips / per) * factor) / factor;
}

/**
 * A number a reader typed, as a model length.
 *
 * Rounded to a whole twip, because that is what the document holds: leaving a
 * fraction in would mean a value that reads back as a different number than the
 * one that was typed.
 */
export function fromDisplay(value: number, unit: LengthUnit): number {
  return Math.round(value * UNITS[unit].twips);
}

/**
 * How much one press of a spinner should move.
 *
 * A step of 1 is right for pixels and absurd for centimetres — a centimetre is
 * an eighth of a slide. So the step is a tenth of the unit where the unit is
 * large, and one where it is small.
 */
export function stepFor(unit: LengthUnit): number {
  return UNITS[unit].decimals >= 2 ? 0.1 : 1;
}

/**
 * How a ruler steps in this unit: the twips in one, and how far apart the
 * labelled and unlabelled ticks go.
 *
 * Here because it is the same question `UNITS` above answers — what a length
 * looks like to a reader. The *drawing* is the product's and the *counting* is
 * `axisTicks`'s; this is only which numbers to count in — the same shape of answer
 * `timeStep` gives for a clock, from a span instead of from a unit.
 *
 * The steps are a judgement, and the judgement is **how many labels fit**: a 16:9
 * slide is 25920 twips, which is 45.7cm, 18 inches, 1296pt or 1728px — so one
 * label per centimetre is 45 of them and one per inch is 18. Past about fifty a
 * ruler is a grey band rather than a scale, which is why millimetres are labelled
 * every ten (457 labels otherwise) and points every 72. Exactly what every
 * printed ruler does with millimetres.
 */
export function rulerStep(unit: LengthUnit): AxisStep {
  const per = UNITS[unit].twips;
  switch (unit) {
    case 'mm':
      return { per, major: 10, minor: 5 };
    // Quarters, because an inch ruler with halves is four ticks across a slide's
    // width and nobody can place anything against it.
    case 'in':
      return { per, major: 1, minor: 0.25 };
    case 'pt':
      return { per, major: 72, minor: 36 };
    case 'px':
      return { per, major: 100, minor: 50 };
    default:
      return { per, major: 1, minor: 0.5 };
  }
}
