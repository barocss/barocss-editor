import { describe, it, expect, beforeEach } from 'vitest';
import { define, element, getGlobalRegistry } from '@barocss/dsl';
import { CalloutExtension } from '../src/callout';

/**
 * An extension that offers to make a node says what one looks like.
 *
 * Not because the extension should decide — a product's own renderer wins — but
 * because the alternative is what a shipped product actually did: offer
 * `insertCallout`, report success, put a `callout` in the document, and draw
 * nothing. The reader's text was in the model and invisible on the page, and
 * 588 unit tests and 291 end-to-end tests had nothing to say about it.
 */
describe('an extension brings a floor, not a policy', () => {
  beforeEach(() => {
    // A registry with no callout in it, which is the case the floor is for.
    const registry = getGlobalRegistry() as unknown as { _renderers?: Map<string, unknown> };
    registry._renderers?.delete('callout');
  });

  it('draws its node when nothing else does', () => {
    expect(getGlobalRegistry().has('callout')).toBe(false);
    new CalloutExtension().defaultRenderers?.();
    expect(getGlobalRegistry().has('callout')).toBe(true);
  });

  it('leaves a product’s own renderer alone', () => {
    define('callout', element('aside', { className: 'the-product-owns-this' }));
    const registered = getGlobalRegistry().get('callout');

    new CalloutExtension().defaultRenderers?.();

    // The very same registration, not an equal-looking one: a default is a
    // floor and never a policy, or loading an extension would silently restyle
    // a product that had already decided.
    expect(getGlobalRegistry().get('callout')).toBe(registered);
  });
});
