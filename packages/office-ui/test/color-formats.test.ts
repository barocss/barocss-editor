import { describe, expect, it } from 'vitest';
import { channelsColor, colorChannels, colorCss, parseColor } from '../src/color-formats';

describe('color formats', () => {
  it('reads CSS RGB percentages, HSL, names and alpha hex', () => {
    expect(parseColor('rgb(100% 0% 0% / 25%)')).toEqual({ r: 255, g: 0, b: 0, a: .25 });
    expect(parseColor('hsl(120 100% 50% / .5)')).toEqual({ r: 0, g: 255, b: 0, a: .5 });
    expect(parseColor('rebeccapurple')).toEqual({ r: 102, g: 51, b: 153, a: 1 });
    expect(parseColor('#1234').a).toBeCloseTo(68 / 255);
  });
  it('maps HSB to HSV and wraps hue', () => {
    expect(colorCss(channelsColor([240, 100, 100], 'hsb', 1))).toBe('#0000ff');
    expect(colorCss(channelsColor([480, 100, 50], 'hsl', 1))).toBe('#00ff00');
    expect(colorCss(channelsColor([255, 0, 0], 'rgb', .125))).toBe('rgba(255, 0, 0, 0.125)');
  });
  for (const format of ['rgb', 'hsl', 'hsb', 'okhsl'] as const) {
    it(`${format} round trips colour and alpha without non-finite neutral channels`, () => {
      for (const css of ['#2563eb', '#000000', '#ffffff', '#888888', '#ff0000', 'rgba(14, 165, 233, .37)']) {
        const source = parseColor(css), channels = colorChannels(source, format);
        expect(channels.every(Number.isFinite)).toBe(true);
        const result = channelsColor(channels, format, source.a);
        expect(result.a).toBe(source.a);
        for (const key of ['r', 'g', 'b'] as const) expect(result[key]).toBeCloseTo(source[key], 2);
      }
    });
  }
  it('interprets OKHSL percentages and keeps output inside sRGB', () => {
    expect(colorCss(channelsColor([180, 100, 100], 'okhsl', .4))).toBe('rgba(255, 255, 255, 0.4)');
    expect(colorCss(channelsColor([180, 100, 0], 'okhsl', 1))).toBe('#000000');
  });
});
