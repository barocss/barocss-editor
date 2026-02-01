import { describe, it, expect, vi } from 'vitest';
import { ReactSelectionHandler } from '../src/selection-handler';

function createMockEditor(getNode: (id: string) => unknown) {
  return {
    dataStore: { getNode },
    updateSelection: () => {},
  } as any;
}

describe('ReactSelectionHandler', () => {
  it('instantiates with editor and getContentEditableElement', () => {
    const getEl = () => document.createElement('div');
    const editor = createMockEditor(() => null);
    const handler = new ReactSelectionHandler(editor, getEl);
    expect(handler).toBeDefined();
  });

  it('isSelectionInsideEditableText returns false when selection is empty', () => {
    const getEl = () => document.createElement('div');
    const editor = createMockEditor(() => ({ stype: 'inline-text' }));
    const handler = new ReactSelectionHandler(editor, getEl);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    expect(handler.isSelectionInsideEditableText()).toBe(false);
  });

  it('isSelectionInsideEditableText returns true when selection is inside inline-text node', () => {
    const root = document.createElement('div');
    root.setAttribute('contenteditable', 'true');
    const span = document.createElement('span');
    span.setAttribute('data-bc-sid', 't1');
    const text = document.createTextNode('hello');
    span.appendChild(text);
    root.appendChild(span);
    document.body.appendChild(root);

    const getEl = () => root;
    const editor = createMockEditor((id) => (id === 't1' ? { stype: 'inline-text' } : null));
    const handler = new ReactSelectionHandler(editor, getEl);

    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 2);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    expect(handler.isSelectionInsideEditableText()).toBe(true);

    document.body.removeChild(root);
    sel?.removeAllRanges();
  });

  it('setProgrammaticChange(true) causes handleSelectionChange to skip updateSelection', () => {
    const root = document.createElement('div');
    const span = document.createElement('span');
    span.setAttribute('data-bc-sid', 't1');
    span.appendChild(document.createTextNode('x'));
    root.appendChild(span);
    document.body.appendChild(root);

    const updateSelection = vi.fn();
    const editor = createMockEditor((id) => (id === 't1' ? { stype: 'inline-text' } : null));
    editor.updateSelection = updateSelection;

    const getEl = () => root;
    const handler = new ReactSelectionHandler(editor, getEl);

    const range = document.createRange();
    range.setStart(span.firstChild!, 0);
    range.setEnd(span.firstChild!, 1);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);

    handler.setProgrammaticChange(true);
    handler.handleSelectionChange();
    expect(updateSelection).not.toHaveBeenCalled();

    handler.setProgrammaticChange(false);
    handler.handleSelectionChange();
    expect(updateSelection).toHaveBeenCalled();

    document.body.removeChild(root);
  });
});
