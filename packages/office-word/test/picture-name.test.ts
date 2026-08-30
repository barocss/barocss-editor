// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { registerShapeRenderers } from '../src/renderers/shapes';
import { getGlobalRegistry } from '@barocss/dsl';

/**
 * **What a picture on a canvas is, for a reader who cannot see it.**
 *
 * `alt` has been in the schema for as long as `picture` has, and `inline-image` — the same idea in
 * the flow — has drawn it since it was written. The canvas version drew nothing: a picture a reader
 * *dragged onto the page* was invisible to a screen reader, and one they *typed into a paragraph*
 * was not. One node, two drawings, one of them nameless.
 *
 * `aria-label` rather than `alt`, because this is an SVG `<image>` and `alt` means nothing on one;
 * `role` with it, because an image with a name and no role is announced as a graphic by some readers
 * and skipped by others.
 *
 * And `fit` beside it, which was reported unread for a different reason worth keeping: it *was*
 * drawn — as `preserveAspectRatio` — but the schema does not declare which values it takes, because
 * a page and a deck pass it straight through as CSS `object-fit` and take everything that property
 * takes. So the probe invented strings, every one of them fell to the same default, and a working
 * attribute looked dead. The product tells the probe what its values are now.
 */
describe('a picture on a canvas', () => {
  beforeAll(() => registerShapeRenderers());

  /*
   * The template, evaluated — which is what the conformance probe does too, and for the same reason:
   * an attribute of a DSL template is a *function* until something draws, so reading the registry
   * entry without calling them says nothing about what a reader would see.
   */
  const drawn = (attributes: Record<string, unknown>) => {
    const node = { sid: 'pic-1', stype: 'picture', attributes, content: [] };
    const template = getGlobalRegistry().get('picture')?.template as never as {
      component: (a: unknown, b: unknown, c: unknown) => { attributes?: Record<string, unknown> };
    };
    const built = template.component(node, node, {});
    const bag = (built.attributes ?? {}) as Record<string, unknown>;
    return (key: string) => {
      const value = bag[key];
      return typeof value === 'function' ? (value as (d: unknown) => unknown)(node) : value;
    };
  };

  it('takes its accessible name from the alt text', () => {
    const image = drawn({ src: 'a.png', alt: '2026년 분기 매출', x: 0, y: 0, width: 200, height: 100 });

    expect(image('aria-label')).toBe('2026년 분기 매출');
    expect(image('role')).toBe('img');
  });

  /*
   * A picture with nothing to say about itself is decoration, and a screen reader should walk past
   * it rather than announce a filename. Which is also the honest reading of an empty alt.
   */
  it('is decoration when nobody said what it is', () => {
    const image = drawn({ src: 'a.png', x: 0, y: 0, width: 200, height: 100 });

    expect(image('role')).toBe('presentation');
    expect(image('aria-label')).toBe('');
  });

  it('fits the box the way the picture asks', () => {
    const box = { src: 'a.png', x: 0, y: 0, width: 200, height: 100 };

    // The default, and the one a reader who dragged a box expects: the whole picture, centred.
    expect(drawn({ ...box })('preserveAspectRatio')).toBe('xMidYMid meet');
    expect(drawn({ ...box, fit: 'contain' })('preserveAspectRatio')).toBe('xMidYMid meet');
    // Filling the box, cropping what does not fit.
    expect(drawn({ ...box, fit: 'cover' })('preserveAspectRatio')).toBe('xMidYMid slice');
    // Stretching to the box, which is `object-fit: fill` and SVG's `none`.
    expect(drawn({ ...box, fit: 'fill' })('preserveAspectRatio')).toBe('none');
  });
});
