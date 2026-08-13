import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EditorViewDOM } from '../../src/editor-view-dom';

/**
 * The door a character is turned away at.
 *
 * Characters may only be typed into inline text, and the check happens at
 * keydown because that is the last moment the browser can be stopped. It is also
 * the last moment *anything* can happen: `beforeinput` is where every character
 * enters, so a key refused here fires nothing and is gone — no command sees it,
 * no observer sees it, and the reader gets no letter and no explanation.
 *
 * Which makes the two directions of this test unequal. Letting a character
 * through costs a command one check it was going to make anyway. Refusing one
 * wrongly costs the reader their keystroke, and a recording of somebody typing
 * Korean by hand caught exactly that: six spaces after a committed syllable,
 * each a keydown followed by nothing at all, because an IME had left the DOM
 * selection somewhere the check did not recognise.
 */
describe('the gate a typed character passes', () => {
  let view: EditorViewDOM;
  let container: HTMLElement;
  let store: Map<string, { stype: string }>;
  let selection: { startNodeId?: string; endNodeId?: string } | null;

  const press = (key: string, keyCode = key.charCodeAt(0)) => {
    const event = new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true } as any);
    (view as any).contentEditableElement.dispatchEvent(event);
    return event;
  };

  /** Put the DOM selection somewhere the check will not accept. */
  const domSelectionOutsideText = () => {
    const stray = document.createElement('div');
    stray.textContent = 'not part of the document';
    container.appendChild(stray);
    const range = document.createRange();
    range.selectNodeContents(stray);
    const domSelection = window.getSelection()!;
    domSelection.removeAllRanges();
    domSelection.addRange(range);
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    store = new Map();
    selection = null;
    view = new EditorViewDOM(
      {
        executeCommand: vi.fn(),
        executeTransaction: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        emit: vi.fn(),
        destroy: vi.fn(),
        dataStore: { getNode: (sid: string) => store.get(sid) },
        get selection() {
          return selection;
        },
        keybindings: { resolve: () => [] }
      } as any,
      { container }
    );
  });

  afterEach(() => {
    view.destroy();
    document.body.removeChild(container);
  });

  it('lets a space through when the document has the caret in text', () => {
    // What an IME leaves behind: the DOM selection is not somewhere the check
    // recognises, while the document knows exactly where the reader is.
    domSelectionOutsideText();
    store.set('run-1', { stype: 'inline-text' });
    selection = { startNodeId: 'run-1', endNodeId: 'run-1' };

    const event = press(' ', 32);
    expect(event.defaultPrevented, '공백이 문 앞에서 거절당했습니다').toBe(false);
  });

  it('lets an ordinary letter through on the same evidence', () => {
    domSelectionOutsideText();
    store.set('run-1', { stype: 'inline-text' });
    selection = { startNodeId: 'run-1' };

    expect(press('a', 65).defaultPrevented).toBe(false);
  });

  it('still refuses a character when neither can name somewhere for it to go', () => {
    // The case the door exists for: a caret in something that is not text.
    domSelectionOutsideText();
    store.set('table-1', { stype: 'table' });
    selection = { startNodeId: 'table-1', endNodeId: 'table-1' };

    expect(press('a', 65).defaultPrevented, '편집할 수 없는 곳에 글자가 들어갔습니다').toBe(true);
  });

  it('refuses when the document has no caret at all', () => {
    domSelectionOutsideText();
    selection = null;

    expect(press('a', 65).defaultPrevented).toBe(true);
  });

  it('refuses when a selection ends outside text, even if it starts inside', () => {
    domSelectionOutsideText();
    store.set('run-1', { stype: 'inline-text' });
    store.set('table-1', { stype: 'table' });
    selection = { startNodeId: 'run-1', endNodeId: 'table-1' };

    expect(press('a', 65).defaultPrevented).toBe(true);
  });

  it('leaves keys an IME has taken alone', () => {
    domSelectionOutsideText();
    selection = null;

    // keyCode 229 is the IME's; composition answers it, not an input of ours.
    expect(press(' ', 229).defaultPrevented).toBe(false);
  });
});
