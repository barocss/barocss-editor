import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DOMSelectionHandlerImpl } from '../src/event-handlers/selection-handler';

describe('convertModelSelectionToDOM', () => {
  let selectionHandler: DOMSelectionHandlerImpl;
  let container: HTMLElement;

  beforeEach(() => {
    // Create test container
    container = document.createElement('div');
    container.sid = 'test-container';
    document.body.appendChild(container);

    // Create SelectionHandler (Editor is mocked)
    const mockEditor = {} as any;
    selectionHandler = new DOMSelectionHandlerImpl(mockEditor);

    // Create test DOM structure
    setupTestDOM();
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  function setupTestDOM() {
    // Simple text container (no marks)
    const simpleTextContainer = document.createElement('span');
    simpleTextContainer.setAttribute('data-bc-sid', 'text-1');
    simpleTextContainer.setAttribute('data-bc-stype', 'inline-text');
    simpleTextContainer.setAttribute('data-text-container', 'true');
    simpleTextContainer.textContent = 'Hello world';
    container.appendChild(simpleTextContainer);

    // Text container with marks
    const boldTextContainer = document.createElement('span');
    boldTextContainer.setAttribute('data-bc-sid', 'text-bold');
    boldTextContainer.setAttribute('data-bc-stype', 'inline-text');
    boldTextContainer.setAttribute('data-text-container', 'true');
    boldTextContainer.className = 'text mark-bold';

    const boldWrapper = document.createElement('span');
    boldWrapper.className = 'custom-bold mark-bold';
    boldWrapper.setAttribute('data-mark-type', 'bold');
    boldWrapper.textContent = 'bold text';

    boldTextContainer.appendChild(boldWrapper);
    container.appendChild(boldTextContainer);

    // Text container with complex marks
    const complexTextContainer = document.createElement('span');
    complexTextContainer.setAttribute('data-bc-sid', 'text-complex');
    complexTextContainer.setAttribute('data-bc-stype', 'inline-text');
    complexTextContainer.setAttribute('data-text-container', 'true');
    complexTextContainer.className = 'text mark-bold mark-italic';

    const complexWrapper = document.createElement('span');
    complexWrapper.className = 'custom-bold mark-bold';
    complexWrapper.setAttribute('data-mark-type', 'bold');
    
    const italicWrapper = document.createElement('span');
    italicWrapper.className = 'custom-italic mark-italic';
    italicWrapper.setAttribute('data-mark-type', 'italic');
    italicWrapper.textContent = 'bold and italic';

    complexWrapper.appendChild(italicWrapper);
    complexTextContainer.appendChild(complexWrapper);
    container.appendChild(complexTextContainer);
  }

  describe('Text selection conversion', () => {
    it('should create selection in simple text container', () => {
      const modelSelection = {
        type: 'range',
        startNodeId: 'text-1',
        startOffset: 2,
        endNodeId: 'text-1',
        endOffset: 7
      };

      selectionHandler.convertModelSelectionToDOM(modelSelection);

      const selection = window.getSelection();
      expect(selection).not.toBeNull();
      expect(selection!.rangeCount).toBe(1);
      expect(selection!.toString()).toBe('llo w');
    });

    it('should create selection in text container with marks', () => {
      const modelSelection = {
        type: 'range',
        startNodeId: 'text-bold',
        startOffset: 0,
        endNodeId: 'text-bold',
        endOffset: 9
      };

      selectionHandler.convertModelSelectionToDOM(modelSelection);

      const selection = window.getSelection();
      expect(selection).not.toBeNull();
      expect(selection!.rangeCount).toBe(1);
      expect(selection!.toString()).toBe('bold text');
    });

    it('should create selection in text container with complex marks', () => {
      const modelSelection = {
        type: 'range',
        startNodeId: 'text-complex',
        startOffset: 0,
        endNodeId: 'text-complex',
        endOffset: 15
      };

      selectionHandler.convertModelSelectionToDOM(modelSelection);

      const selection = window.getSelection();
      expect(selection).not.toBeNull();
      expect(selection!.rangeCount).toBe(1);
      expect(selection!.toString()).toBe('bold and italic');
    });

    it('should create selection across different text containers', () => {
      const modelSelection = {
        type: 'range',
        startNodeId: 'text-1',
        startOffset: 6,
        endNodeId: 'text-bold',
        endOffset: 4
      };

      selectionHandler.convertModelSelectionToDOM(modelSelection);

      const selection = window.getSelection();
      expect(selection).not.toBeNull();
      expect(selection!.rangeCount).toBe(1);
      expect(selection!.toString()).toBe('worldbold');
    });
  });

  /**
   * **집합인 선택은 DOM 이 말할 수 없다** — 그래서 지운다.
   *
   * ## 여기 있던 두 검사가 제품이 만들지 않는 모양을 세우고 있었다
   *
   * `{ type: 'node', nodeId: 'text-1' }` 이었다. **저장소의 어떤 생산자도 `nodeId`(단수)를 세우지
   * 않는다** — `createNodeSelection` 은 `nodeIds`(복수)를 세우고 `selectNode` 는 아예 `range` 를
   * 만든다. 그래서 두 검사는 통과했고 제품에 대해 아무것도 증명하지 않았다. 읽던 코드도 같은
   * 필드를 읽었으니 **둘이 사이좋게 틀려 있었다.**
   *
   * 그 사이 실제 동작은 이랬다: `node` 는 일찍 돌아가서 **이전 DOM 선택을 그대로 뒀고**(도형을
   * 고르면 직전의 글자 강조가 남는다), `cell` 과 `table` 은 `console.warn('Unsupported selection
   * type')` 으로 갔다 — 브라우저에서 셀 드래그 한 번에 경고 한 번을 셌다.
   *
   * `cell` 은 지원되지 않는 것이 아니라 **DOM 이 말할 수 없는 것**이다. DOM 선택은 *여기서
   * 저기까지* 하나만 표현하고, 집합에는 두 끝이 없다. `installCellSelection` 은 이미 손으로 DOM
   * 선택을 지우고 있었다 — 답이 그 파일에 있는데 이 파일은 경고를 찍고 있었다.
   */
  describe('집합인 선택 — node · cell · table', () => {
    /** 미리 글자를 골라 둔다. 지워지는지 보려면 지울 것이 있어야 한다. */
    const selectSomethingFirst = () => {
      selectionHandler.convertModelSelectionToDOM({
        type: 'range',
        startNodeId: 'text-1',
        startOffset: 0,
        endNodeId: 'text-1',
        endOffset: 5
      });
      expect(window.getSelection()!.toString(), '먼저 고른 것이 없으면 이 검사는 아무것도 안 묻는다')
        .not.toBe('');
    };

    /**
     * **`node` 는 여기 없다 — 그리고 그게 재보고 정한 것이다.**
     *
     * 처음엔 셋을 다 지우게 했다. *집합에는 두 끝이 없으니 DOM 은 아무것도 말하지 않는다* 는
     * 논거였고 이 검사도 셋을 다 물었다. **브라우저가 반박했다:** 슬라이드 검사 여덟 개가 `range` 를
     * 기대하고 `node` 를 받았다. 텍스트 상자를 더블클릭하면 첫 누름이 도형을 고르고(→ `node`) 둘째
     * 누름이 안으로 들어가 캐럿을 놓는데, 첫 누름에서 DOM 선택을 지우면 그 길이 끊긴다.
     *
     * 구별은 *집합인가* 가 아니라 **그 선택을 만든 제스처가 글자 선택을 대신하려는 것인가** 다.
     * 셀 드래그는 그렇다(`installCellSelection` 이 이미 손으로 지운다). 도형 선택은 아니다 — 글자
     * 선택으로 **가는 중** 일 수 있다.
     *
     * 논거가 단정보다 앞서 있었다. 그래서 이 검사는 두 종류만 묻는다.
     */
    for (const type of ['cell', 'table'] as const) {
      it(`${type} 선택은 DOM 선택을 지운다 — 그 제스처가 글자 선택을 대신한다`, () => {
        selectSomethingFirst();

        /*
         * **생산자가 만드는 그대로.** `createNodeSelection` 의 결과를 손으로 적는다 —
         * `nodeIds` 가 있고 `startNodeId`/`endNodeId` 는 그 첫과 끝이다. 이 파일이 전에 세우던
         * `nodeId` 단수는 여기 없다.
         */
        selectionHandler.convertModelSelectionToDOM({
          type,
          nodeIds: ['text-1', 'text-bold'],
          startNodeId: 'text-1',
          startOffset: 0,
          endNodeId: 'text-bold',
          endOffset: 0,
          collapsed: false,
          direction: 'none'
        });

        expect(window.getSelection()!.rangeCount, `${type} 뒤에 DOM 선택이 남았습니다`).toBe(0);
      });
    }

    it('node 선택은 DOM 선택을 건드리지 않는다 — 글자 선택으로 가는 중일 수 있다', () => {
      selectSomethingFirst();
      const was = window.getSelection()!.toString();

      selectionHandler.convertModelSelectionToDOM({
        type: 'node',
        nodeIds: ['text-1', 'text-bold'],
        startNodeId: 'text-1',
        startOffset: 0,
        endNodeId: 'text-bold',
        endOffset: 0,
        collapsed: false,
        direction: 'none'
      });

      expect(window.getSelection()!.toString(), 'node 가 DOM 선택을 지웠습니다').toBe(was);
    });
  });

  describe('Error handling', () => {
    it('should handle error for non-existent node ID', () => {
      window.getSelection()?.removeAllRanges();

      const modelSelection = {
        type: 'range',
        startNodeId: 'non-existent',
        startOffset: 0,
        endNodeId: 'non-existent',
        endOffset: 5
      };

      expect(() => {
        selectionHandler.convertModelSelectionToDOM(modelSelection);
      }).not.toThrow();

      const selection = window.getSelection();
      expect(selection!.rangeCount).toBe(0);
    });

    it('should not throw for non-text-container element', () => {
      window.getSelection()?.removeAllRanges();

      const div = document.createElement('div');
      div.setAttribute('data-bc-sid', 'div-1');
      div.setAttribute('data-bc-stype', 'div');
      div.textContent = 'Not a text container';
      container.appendChild(div);

      const modelSelection = {
        type: 'range',
        startNodeId: 'div-1',
        startOffset: 0,
        endNodeId: 'div-1',
        endOffset: 5
      };

      expect(() => {
        selectionHandler.convertModelSelectionToDOM(modelSelection);
      }).not.toThrow();
      // Handler may set selection on any element with data-bc-sid and text (findBestContainer / text runs)
      const selection = window.getSelection();
      expect(selection!.rangeCount).toBeLessThanOrEqual(1);
    });

    it('should handle error for invalid offset', () => {
      window.getSelection()?.removeAllRanges();

      const modelSelection = {
        type: 'range',
        startNodeId: 'text-1',
        startOffset: -1,
        endNodeId: 'text-1',
        endOffset: 1000
      };

      expect(() => {
        selectionHandler.convertModelSelectionToDOM(modelSelection);
      }).not.toThrow();

      const selection = window.getSelection();
      expect(selection!.rangeCount).toBe(0);
    });
  });

  describe('Selection clearing', () => {
    it('should clear selection when type is none', () => {
      selectionHandler.convertModelSelectionToDOM({
        type: 'range',
        startNodeId: 'text-1',
        startOffset: 0,
        endNodeId: 'text-1',
        endOffset: 5
      });

      let selection = window.getSelection();
      expect(selection!.rangeCount).toBe(1);

      selectionHandler.convertModelSelectionToDOM({ type: 'none' });

      selection = window.getSelection();
      expect(selection!.rangeCount).toBe(0);
    });

    it('should clear selection when null/undefined', () => {
      selectionHandler.convertModelSelectionToDOM({
        type: 'range',
        startNodeId: 'text-1',
        startOffset: 0,
        endNodeId: 'text-1',
        endOffset: 5
      });

      let selection = window.getSelection();
      expect(selection!.rangeCount).toBe(1);

      selectionHandler.convertModelSelectionToDOM(null);

      selection = window.getSelection();
      expect(selection!.rangeCount).toBe(0);
    });
  });

  it('should resolve duplicate data-bc-sid by preferring the editor contentEditable root', () => {
    const otherContainer = document.createElement('div');
    const root = document.createElement('div');
    root.setAttribute('contenteditable', 'true');

    const targetInA = document.createElement('span');
    targetInA.setAttribute('data-bc-sid', 'shared-node');
    targetInA.textContent = 'A';

    const targetInB = document.createElement('span');
    targetInB.setAttribute('data-bc-sid', 'shared-node');
    targetInB.textContent = 'B';

    const containerA = document.createElement('div');
    containerA.appendChild(targetInA);
    const containerB = document.createElement('div');
    containerB.appendChild(targetInB);
    root.appendChild(containerB);
    otherContainer.appendChild(containerA);
    document.body.appendChild(otherContainer);
    document.body.appendChild(root);

    const mockEditor = {
      _viewDOM: {
        contentEditableElement: root
      }
    } as any;

    const scopedSelectionHandler = new DOMSelectionHandlerImpl(mockEditor);

    scopedSelectionHandler.convertModelSelectionToDOM({
      type: 'range',
      startNodeId: 'shared-node',
      startOffset: 0,
      endNodeId: 'shared-node',
      endOffset: 1
    });

    expect(window.getSelection()?.toString()).toBe('B');

    document.body.removeChild(otherContainer);
    document.body.removeChild(root);
  });
});
