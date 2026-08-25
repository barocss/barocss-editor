import { describe, it, expect, beforeEach } from 'vitest';
import { forgetOverrides, silentlyOverridden, overrodeNothing } from '@barocss/dsl';
import { registerSlidesRenderers } from '../src/renderers';

/**
 * Which renderers a deck **takes over**, said out loud.
 *
 * The registry is last-write-wins on purpose: two products share a renderer set and each draws some
 * of it its own way — a slide's `list` is not a page's. What was wrong is that it was silent.
 * Nothing said which names a product had taken over, so a renderer that moved to another file, or a
 * name that changed, would quietly stop being overridden and the deck would draw the page's answer
 * without anybody noticing.
 *
 * Two things are worth pinning, and they are opposite failures:
 *
 * - a definition landing on top of another **without saying so** (`silentlyOverridden`), and
 * - an override of a name **nothing has defined** (`overrodeNothing`), which means the thing being
 *   replaced has moved and the product is answering a question nobody asked.
 */
describe('what the deck draws instead of the shared answer', () => {
  beforeEach(() => {
    forgetOverrides();
    registerSlidesRenderers();
  });

  it('takes over nothing by accident', () => {
    /*
     * Nine, once. The deck registered *all* of Word's renderers to override `surface` and then drew
     * eight canvas nodes its own way — and the day it started asking for the text half alone, eight
     * of those stopped being overrides at all: nobody else defines a `rectangle` for a slide.
     *
     * `list` is the one that is genuinely shared and genuinely different, and it says so with
     * `override` rather than by landing on top of the text renderer in silence.
     */
    expect(silentlyOverridden()).toEqual([]);
  });

  it('overrides nothing that has gone', () => {
    // The other direction: a name the deck means to replace and nothing has defined is a renderer
    // that moved or was renamed, and the deck is about to draw its own answer to a dead question.
    expect(overrodeNothing()).toEqual([]);
  });
});
