import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EditorViewDOM } from '../../src/editor-view-dom';

let view: EditorViewDOM, container: HTMLElement;
let execute: ReturnType<typeof vi.fn>, resolve: ReturnType<typeof vi.fn>;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container);
  execute = vi.fn(); resolve = vi.fn(); resolve.mockReturnValue([{ command: 'editingCommand' }]);
  view = new EditorViewDOM({ executeCommand: execute, executeTransaction: vi.fn(), on: vi.fn(), off: vi.fn(), emit: vi.fn(), destroy: vi.fn(),
    dataStore: { getNode: () => undefined }, selection: null, keybindings: { resolve } } as never, { container });
});
afterEach(() => { view.destroy(); container.remove(); });

for (const key of ['Enter', 'Backspace', 'Delete']) {
  it(`leaves composing ${key} to the IME even when compositionstart was not observed, then resumes normally`, () => {
    // Browsers can report composition on the individual event without legacy keyCode 229.
    const event = new KeyboardEvent('keydown', { key, keyCode: key === 'Enter' ? 13 : key === 'Backspace' ? 8 : 46, isComposing: true, bubbles: true, cancelable: true });
    view.contentEditableElement.dispatchEvent(event);
    expect(resolve).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    // Do not latch composition state from this event; there may be no subsequent compositionend.
    const next = new KeyboardEvent('keydown', { key, isComposing: false, bubbles: true, cancelable: true });
    view.contentEditableElement.dispatchEvent(next);
    expect(execute).toHaveBeenCalledOnce(); expect(next.defaultPrevented).toBe(true);
  });
}

it('dispatches the selected object instead of the DOM caret beside it', () => {
  const object = { type: 'node', nodeIds: ['picture'], startNodeId: 'picture', endNodeId: 'picture', startOffset: 0, endOffset: 0, collapsed: false };
  (view as any).editor.selection = object;
  const text = document.createTextNode('beside the picture');
  view.contentEditableElement.append(text);
  const range = document.createRange(); range.setStart(text, 0); range.collapse(true);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  const convert = vi.spyOn((view as any).selectionHandler, 'convertDOMSelectionToModel');
  view.contentEditableElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
  expect(convert).not.toHaveBeenCalled();
  expect(execute).toHaveBeenCalledWith('editingCommand', { selection: object });
});
