import { expect, it, vi } from 'vitest';
import { createFontLoader } from '../src/font-loader';

it('disposal settles pending loads and removes only its own font stylesheet', async () => {
  const first = createFontLoader(document);
  const other = createFontLoader(document);
  const pending = first.ensure('Inter');
  const retained = other.ensure('Merriweather');
  expect(document.head.querySelectorAll('[data-font-family]')).toHaveLength(2);
  first.dispose?.();
  await pending;
  expect(document.head.querySelector('[data-font-family="Inter"]')).toBeNull();
  expect(document.head.querySelector('[data-font-family="Merriweather"]')).not.toBeNull();
  first.dispose?.();
  await first.ensure('Inter');
  expect(document.head.querySelector('[data-font-family="Inter"]')).toBeNull();
  other.dispose?.();
  await retained;
});

it('does not start font-face work after disposing a pending stylesheet', async () => {
  const fonts = { load: vi.fn(() => Promise.resolve([])) };
  const isolated = document.implementation.createHTMLDocument();
  Object.defineProperty(isolated, 'fonts', { value: fonts });
  const loader = createFontLoader(isolated);
  const pending = loader.ensure('Inter');
  loader.dispose?.();
  await pending;
  expect(fonts.load).not.toHaveBeenCalled();
});

it('settles ensure on disposal while a browser font-face load remains pending', async () => {
  const isolated = document.implementation.createHTMLDocument();
  const load = vi.fn(() => new Promise<FontFace[]>(() => {}));
  Object.defineProperty(isolated, 'fonts', { value: { load } });
  const loader = createFontLoader(isolated);
  const pending = loader.ensure('Inter');
  isolated.head.querySelector('link')!.dispatchEvent(new Event('load'));
  await Promise.resolve();
  expect(load).toHaveBeenCalled();
  loader.dispose?.();
  await pending;
  expect(isolated.head.querySelector('link')).toBeNull();
});
