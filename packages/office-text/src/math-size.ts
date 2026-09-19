/** Per-equation size, independent of the document viewport zoom. */
export const MATH_SCALE_MIN = 0.5;
export const MATH_SCALE_MAX = 3;
export function mathFontScale(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(MATH_SCALE_MAX, Math.max(MATH_SCALE_MIN, value)) : 1;
}
