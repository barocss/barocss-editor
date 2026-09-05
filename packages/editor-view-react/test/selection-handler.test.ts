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
    /* DOM 은 `hello` 를 입고 있는데 모델은 안 입고 있었다 — `inline-text` 는 늘 `text` 를 갖는다. */
    const editor = createMockEditor((id) => (id === 't1' ? { stype: 'inline-text', text: 'hello' } : null));
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

  /**
   * **집합인 선택은 DOM 선택을 지운다** — 그리고 여기 있던 검사가 이 저장소에서 가장 날카로운 예다.
   *
   * 있던 것은 `{ type: 'node', nodeId: 'node-1' }` 이었고, *컨테이너 전체를 선택해야 함* 을 단정했다.
   * **저장소의 어떤 생산자도 `nodeId`(단수)를 세우지 않는다** — `createNodeSelection` 은 `nodeIds`
   * 복수를 세우고 `selectNode` 는 아예 `range` 를 만든다. 읽는 코드도 같은 필드를 읽었으니 둘이
   * 사이좋게 틀려 있었다.
   *
   * ## 그리고 좁은 사본이 이 검사를 실제로부터 **밀어냈다**
   *
   * 지운 판에 이런 주석이 있었다: *"A node selection is a node and nothing else — the four range
   * fields were here as well, which `convertNodeSelectionToDOM` never looks at. **The compiler said
   * so** the first time it was allowed to read this file."*
   *
   * 그 컴파일러가 읽고 있던 것은 이 패키지가 자기 손으로 선언한 `{ type: 'node'; nodeId: string }`
   * 이었다. 모델의 노드 선택은 `startNodeId`·`endNodeId` 를 **채워서** 준다 — 이 검사를 다시 쓰는
   * 사람이 그걸 적었는데, 사본이 *그런 필드는 없다* 고 말해서 지웠다. **사본은 어긋남을 못 잡은
   * 것이 아니라 어긋남을 강제했다.**
   *
   * 그래서 이 자리의 교훈은 두 번째다. 하나는 *같은 개념을 두 번 선언하지 않는다*. 둘은 *타입 오류를
   * 없애는 방향으로 검사를 고치기 전에, 그 타입이 실제를 적은 것인지 묻는다.*
   */
  /**
   * **`node` 는 여기 없다 — 브라우저가 반박했다.**
   *
   * 처음엔 셋을 다 지우게 했다. 논거는 *집합에는 두 끝이 없다* 였고, 슬라이드 검사 여덟 개가 `range`
   * 를 기대하고 `node` 를 받았다. 텍스트 상자를 더블클릭하면 첫 누름이 도형을 고르고 둘째 누름이
   * 안으로 들어가 캐럿을 놓는데, 첫 누름에서 DOM 선택을 지우면 그 길이 끊긴다.
   *
   * 구별은 *집합인가* 가 아니라 **그 제스처가 글자 선택을 대신하려는 것인가** 다.
   */
  for (const type of ['cell', 'table'] as const) {
    it(`convertModelSelectionToDOM은 ${type} 선택에서 DOM 선택을 지운다`, () => {
      const root = document.createElement('div');
      root.setAttribute('contenteditable', 'true');
      const nodeElement = document.createElement('span');
      nodeElement.setAttribute('data-bc-sid', 'node-1');
      nodeElement.textContent = 'node selection';
      root.appendChild(nodeElement);
      document.body.appendChild(root);

      const editor = createMockEditor((id) =>
        id === 'node-1' ? { stype: 'inline-text', text: 'node selection' } : null
      );
      const handler = new ReactSelectionHandler(editor, () => root);

      /* 지울 것이 있어야 지워지는지 물을 수 있다. */
      handler.convertModelSelectionToDOM({
        type: 'range',
        startNodeId: 'node-1',
        startOffset: 0,
        endNodeId: 'node-1',
        endOffset: 4
      });
      expect(window.getSelection()!.rangeCount, '먼저 고른 것이 없으면 이 검사는 아무것도 안 묻는다').toBe(1);

      /* 생산자가 만드는 그대로: `nodeIds` 가 있고 두 끝은 그 첫과 끝이다. */
      handler.convertModelSelectionToDOM({
        type,
        nodeIds: ['node-1'],
        startNodeId: 'node-1',
        startOffset: 0,
        endNodeId: 'node-1',
        endOffset: 0,
        collapsed: false,
        direction: 'none'
      });

      expect(window.getSelection()!.rangeCount, `${type} 뒤에 DOM 선택이 남았습니다`).toBe(0);

      document.body.removeChild(root);
      window.getSelection()?.removeAllRanges();
    });
  }
});
