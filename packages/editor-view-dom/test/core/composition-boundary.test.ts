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

/**
 * What a composition owes the page when it is finished.
 *
 * Nothing is drawn while an IME is writing, and that is right: the text is
 * already in the DOM because the browser put it there. But everything computed
 * *from* the text is not — line breaks, page breaks, repeated table headers, the
 * table of contents — and those only come from a render.
 *
 * Measured by hand before this existed: seventy-five characters of Korean went
 * into the document across seventy-three compositions, and the view rendered
 * zero times in eleven seconds. The page showed the text and knew nothing else
 * about it.
 */
describe('the render a composition owes', () => {
  let view: EditorViewDOM;
  let container: HTMLElement;
  let emit: (name: string, payload?: unknown) => void;
  let rendered: ReturnType<typeof vi.fn>;

  const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));
  const fire = (type: string, data?: string) =>
    (view as any).contentEditableElement.dispatchEvent(
      new CompositionEvent(type, { data, bubbles: true })
    );

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const listeners = new Map<string, Set<Function>>();
    view = new EditorViewDOM(
      {
        executeCommand: vi.fn(),
        executeTransaction: vi.fn(),
        on(name: string, callback: Function) {
          if (!listeners.has(name)) listeners.set(name, new Set());
          listeners.get(name)!.add(callback);
        },
        off: vi.fn(),
        emit: vi.fn(),
        destroy: vi.fn()
      } as any,
      { container }
    );
    emit = (name, payload) => listeners.get(name)?.forEach((handler) => handler(payload));
    rendered = vi.fn();
    (view as any).render = rendered;
  });

  afterEach(() => {
    view.destroy();
    document.body.removeChild(container);
  });

  it('is not paid while the IME is still writing', async () => {
    fire('compositionstart');
    emit('editor:content.change', {});
    emit('editor:content.change', {});
    await nextTask();
    expect(rendered, 'rendered underneath an open composition').not.toHaveBeenCalled();
  });

  it('is paid once, when the composition is over', async () => {
    fire('compositionstart');
    emit('editor:content.change', {});
    emit('editor:content.change', {});
    emit('editor:content.change', {});
    fire('compositionend', '안');

    await nextTask();
    // Once, not three times: the render draws the document as it now stands.
    expect(rendered).toHaveBeenCalledTimes(1);
  });

  it('is not paid at a syllable boundary, only at the end of the word', async () => {
    fire('compositionstart');
    emit('editor:content.change', {});

    // 안 finishes and 녕 begins on the same keystroke; the page is still being
    // written to and must not be redrawn yet.
    fire('compositionend', '안');
    fire('compositionstart');
    emit('editor:content.change', {});
    await nextTask();
    expect(rendered, 'redrew at a syllable boundary').not.toHaveBeenCalled();

    fire('compositionend', '녕');
    await nextTask();
    expect(rendered).toHaveBeenCalledTimes(1);
  });

  it('owes nothing when a composition changed nothing', async () => {
    fire('compositionstart');
    fire('compositionend', '');
    await nextTask();
    expect(rendered).not.toHaveBeenCalled();
  });
});
