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

  it('convertDOMSelectionToModel ignores decorator text when mapping offsets', () => {
    const root = document.createElement('div');
    root.setAttribute('contenteditable', 'true');
    const inline = document.createElement('span');
    inline.setAttribute('data-bc-sid', 't1');
    inline.setAttribute('data-text-container', 'true');

    const beforeDecor = document.createElement('span');
    beforeDecor.setAttribute('data-bc-decorator-sid', 'dec');
    beforeDecor.textContent = 'XX';
    inline.appendChild(beforeDecor);

    const textA = document.createTextNode('ab');
    const textB = document.createTextNode('cd');
    inline.appendChild(textA);
    inline.appendChild(document.createElement('span')); // wrapper edge
    inline.appendChild(textB);
    root.appendChild(inline);
    document.body.appendChild(root);

    const editor = createMockEditor((id) => (id === 't1' ? { stype: 'inline-text', text: 'abcd' } : null));
    const handler = new ReactSelectionHandler(editor, () => root);

    const range = document.createRange();
    range.setStart(textB, 0);
    range.setEnd(textB, 0);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    const modelSelection = handler.convertDOMSelectionToModel(sel!);
    expect(modelSelection).toMatchObject({
      type: 'range',
      startNodeId: 't1',
      startOffset: 2,
      endNodeId: 't1',
      endOffset: 2,
    });

    document.body.removeChild(root);
    sel?.removeAllRanges();
  });

  it('convertModelSelectionToDOM repositions collapsed selection to the corresponding DOM boundary', () => {
    const root = document.createElement('div');
    root.setAttribute('contenteditable', 'true');
    const inline = document.createElement('span');
    inline.setAttribute('data-bc-sid', 't1');
    inline.setAttribute('data-text-container', 'true');

    const t1 = document.createTextNode('ab');
    const dec = document.createElement('span');
    dec.setAttribute('data-bc-decorator-sid', 'dec');
    dec.textContent = 'D';
    const t2 = document.createTextNode('cd');
    inline.appendChild(t1);
    inline.appendChild(dec);
    inline.appendChild(t2);
    root.appendChild(inline);
    document.body.appendChild(root);

    const editor = createMockEditor((id) => (id === 't1' ? { stype: 'inline-text', text: 'abcd' } : null));
    const handler = new ReactSelectionHandler(editor, () => root);
    handler.convertModelSelectionToDOM({
      type: 'range',
      startNodeId: 't1',
      startOffset: 2,
      endNodeId: 't1',
      endOffset: 2,
    });

    const sel = window.getSelection();
    expect(sel?.rangeCount).toBe(1);
    const r = sel?.getRangeAt(0);
    expect(r?.startContainer).toBe(t2);
    expect(r?.startOffset).toBe(0);
    expect(r?.endContainer).toBe(t2);
    expect(r?.endOffset).toBe(0);

    document.body.removeChild(root);
    sel?.removeAllRanges();
  });

  it('convertModelSelectionToDOM maps model end offset to final text node boundary', () => {
    const root = document.createElement('div');
    root.setAttribute('contenteditable', 'true');
    const inline = document.createElement('span');
    inline.setAttribute('data-bc-sid', 't1');
    inline.setAttribute('data-text-container', 'true');

    const t1 = document.createTextNode('ab');
    const dec = document.createElement('span');
    dec.setAttribute('data-bc-decorator-sid', 'dec');
    dec.textContent = 'D';
    const t2 = document.createTextNode('cd');
    inline.appendChild(t1);
    inline.appendChild(dec);
    inline.appendChild(t2);
    root.appendChild(inline);
    document.body.appendChild(root);

    const editor = createMockEditor((id) => (id === 't1' ? { stype: 'inline-text', text: 'abcd' } : null));
    const handler = new ReactSelectionHandler(editor, () => root);
    handler.convertModelSelectionToDOM({
      type: 'range',
      startNodeId: 't1',
      startOffset: 4,
      endNodeId: 't1',
      endOffset: 4,
    });

    const sel = window.getSelection();
    expect(sel?.rangeCount).toBe(1);
    const r = sel?.getRangeAt(0);
    expect(r?.startContainer).toBe(t2);
    expect(r?.startOffset).toBe(2);
    expect(r?.endContainer).toBe(t2);
    expect(r?.endOffset).toBe(2);

    document.body.removeChild(root);
    sel?.removeAllRanges();
  });

  it('convertModelSelectionToDOM는 contentEditable 루트 내에서 중복 data-bc-sid를 구분해야 함', () => {
    const otherRoot = document.createElement('div');
    const root = document.createElement('div');
    root.setAttribute('contenteditable', 'true');

    const targetA = document.createElement('span');
    targetA.setAttribute('data-bc-sid', 'shared-node');
    targetA.setAttribute('data-text-container', 'true');
    targetA.textContent = 'A';

    const targetB = document.createElement('span');
    targetB.setAttribute('data-bc-sid', 'shared-node');
    targetB.setAttribute('data-text-container', 'true');
    targetB.textContent = 'B';

    otherRoot.appendChild(targetA);
    root.appendChild(targetB);
    document.body.appendChild(otherRoot);
    document.body.appendChild(root);

    const editor = createMockEditor((id) => {
      if (id === 'shared-node') {
        return { stype: 'inline-text', text: 'B' };
      }
      return null;
    });
    const handler = new ReactSelectionHandler(editor, () => root);

    handler.convertModelSelectionToDOM({
      type: 'range',
      startNodeId: 'shared-node',
      startOffset: 0,
      endNodeId: 'shared-node',
      endOffset: 1,
    });

    expect(window.getSelection()?.toString()).toBe('B');

    document.body.removeChild(otherRoot);
    document.body.removeChild(root);
    window.getSelection()?.removeAllRanges();
  });

  it('convertModelSelectionToDOM는 node 선택일 때 해당 data-bc-sid 컨테이너 전체를 선택해야 함', () => {
    const root = document.createElement('div');
    root.setAttribute('contenteditable', 'true');
    const nodeElement = document.createElement('span');
    nodeElement.setAttribute('data-bc-sid', 'node-1');
    nodeElement.setAttribute('data-text-container', 'true');
    nodeElement.textContent = 'node selection';
    root.appendChild(nodeElement);
    document.body.appendChild(root);

    const editor = createMockEditor((id) => {
      if (id === 'node-1') {
        return { stype: 'inline-text', text: 'node selection' };
      }
      return null;
    });
    const handler = new ReactSelectionHandler(editor, () => root);

    // A node selection is a node and nothing else — the four range fields were here
    // as well, which `convertNodeSelectionToDOM` never looks at. The compiler said so
    // the first time it was allowed to read this file.
    handler.convertModelSelectionToDOM({ type: 'node', nodeId: 'node-1' });

    const selection = window.getSelection();
    expect(selection).not.toBeNull();
    expect(selection!.rangeCount).toBe(1);
    expect(selection!.toString()).toBe('node selection');

    document.body.removeChild(root);
    selection?.removeAllRanges();
  });
});
