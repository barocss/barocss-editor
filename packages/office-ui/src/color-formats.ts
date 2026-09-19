import { ColorSpace, sRGB, HSL, HSV, Okhsl, parse, to } from 'colorjs.io/fn';

for (const space of [sRGB, HSL, HSV, Okhsl]) ColorSpace.register(space);

export type ColorFormat = 'hex' | 'rgb' | 'hsl' | 'hsb' | 'okhsl';
export type ColorChannels = [number, number, number];
export interface RgbaColor { r: number; g: number; b: number; a: number }
const clamp = (n: number, max = 1) => Math.min(max, Math.max(0, Number.isFinite(n) ? n : 0));
const finite = (n: number | null) => n === null || !Number.isFinite(n) ? 0 : n;
const spaces = { rgb: sRGB, hsl: HSL, hsb: HSV, okhsl: Okhsl };

/** Resolve CSS input into the sRGB channels supported by the suite's renderers. */
export function parseColor(value: string): RgbaColor {
  try {
    const color = to(parse(value), sRGB);
    return { r: clamp(finite(color.coords[0])) * 255, g: clamp(finite(color.coords[1])) * 255,
      b: clamp(finite(color.coords[2])) * 255, a: clamp(finite(color.alpha)) };
  } catch {
    return { r: 0, g: 0, b: 0, a: 1 };
  }
}

export function colorChannels(color: RgbaColor, format: Exclude<ColorFormat, 'hex'>): ColorChannels {
  const result = to({ space: sRGB, coords: [color.r / 255, color.g / 255, color.b / 255], alpha: color.a }, spaces[format]);
  const [h, s, l] = result.coords.map(finite);
  if (format === 'rgb') return [h * 255, s * 255, l * 255];
  return [((h % 360) + 360) % 360, s * (format === 'okhsl' ? 100 : 1), l * (format === 'okhsl' ? 100 : 1)];
}

export function channelsColor(channels: ColorChannels, format: Exclude<ColorFormat, 'hex'>, alpha: number): RgbaColor {
  const coords: ColorChannels = format === 'rgb' ? channels.map(n => clamp(n, 255) / 255) as ColorChannels
    : [((channels[0] % 360) + 360) % 360, clamp(channels[1], 100), clamp(channels[2], 100)];
  if (format === 'okhsl') { coords[1] /= 100; coords[2] /= 100; }
  const result = to({ space: spaces[format], coords, alpha }, sRGB);
  return { r: clamp(finite(result.coords[0])) * 255, g: clamp(finite(result.coords[1])) * 255,
    b: clamp(finite(result.coords[2])) * 255, a: clamp(alpha) };
}

const hex2 = (value: number) => Math.round(clamp(value, 255)).toString(16).padStart(2, '0');
export const colorHex = ({ r, g, b }: RgbaColor) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;
export function colorCss(color: RgbaColor): string {
  const a = Math.round(clamp(color.a) * 10000) / 10000;
  return a >= 1 ? colorHex(color) : `rgba(${Math.round(clamp(color.r, 255))}, ${Math.round(clamp(color.g, 255))}, ${Math.round(clamp(color.b, 255))}, ${a})`;
}
