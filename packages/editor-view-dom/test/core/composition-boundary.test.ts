import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EditorViewDOM } from '../../src/editor-view-dom';

/**
 * One keystroke that ends a composition and starts the next one.
 *
 * Taken from a recording of somebody typing 안녕하세요 by hand. The consonant
 * that finishes 안 is the same keystroke that begins 녕, so the browser fires
 * both, in this order, inside one task:
 *
 *   compositionend   안
 *   compositionstart
 *   compositionupdate ㄴ
 *
 * Whether "composing" survives that is the whole question, because a render is
 * refused while it is set and a render underneath an open composition makes the
 * IME commit the syllable it is still holding. When an ending was allowed to
 * clear the flag its successor had just set, every boundary in the word rendered
 * twice and stranded a jamo: 안녕하세요 came back as 안ㄴ녕ㅎ하세세요.
 *
 * The browser suite cannot produce this. Composition is driven there over CDP,
 * one message per event, and a task always runs between two messages — which is
 * exactly the gap a real keystroke does not leave. So it is pinned here, where
 * the ordering can be stated exactly.
 */
describe('a composition that ends and begins in one task', () => {
  let view: EditorViewDOM;
  let container: HTMLElement;

  const composing = () => (view as any)._isComposing === true;
  /** Let the deferred clear scheduled by `compositionend` run. */
  const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

  const fire = (type: string, data?: string) =>
    (view as any).contentEditableElement.dispatchEvent(
      new CompositionEvent(type, { data, bubbles: true })
    );

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    view = new EditorViewDOM(
      {
        executeCommand: vi.fn(),
        executeTransaction: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        emit: vi.fn(),
        destroy: vi.fn()
      } as any,
      { container }
    );
  });

  afterEach(() => {
    view.destroy();
    document.body.removeChild(container);
  });

  it('is still composing after the boundary', async () => {
    fire('compositionstart');
    fire('compositionupdate', '안');
    expect(composing()).toBe(true);

    // The boundary, in one task, as the recording has it.
    fire('compositionend', '안');
    fire('compositionstart');
    fire('compositionupdate', 'ㄴ');

    expect(composing(), 'cleared synchronously by the ending composition').toBe(true);
    await nextTask();
    expect(composing(), 'the ending composition cleared its successor a task later').toBe(true);
  });

  it('stops composing once the last one really ends', async () => {
    fire('compositionstart');
    fire('compositionupdate', '안');
    fire('compositionend', '안');
    fire('compositionstart');
    fire('compositionupdate', '녕');
    fire('compositionend', '녕');

    await nextTask();
    expect(composing(), 'a composition that ended for good is still held open').toBe(false);
  });

  it('survives a whole word of boundaries and clears at the end', async () => {
    // 안녕하세요: four boundaries, then one ending that is genuinely the last.
    const word = ['안', '녕', '하', '세', '요'];
    fire('compositionstart');
    for (const syllable of word.slice(0, -1)) {
      fire('compositionupdate', syllable);
      fire('compositionend', syllable);
      fire('compositionstart');
      // A task passes between keystrokes, which is when a stale timer would
      // fire — and there is one outstanding from every boundary so far.
      await nextTask();
      expect(composing(), `not composing after the boundary at ${syllable}`).toBe(true);
    }
    fire('compositionupdate', '요');
    fire('compositionend', '요');

    await nextTask();
    expect(composing()).toBe(false);
  });
});
