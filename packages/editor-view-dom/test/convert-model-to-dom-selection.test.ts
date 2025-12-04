import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DOMSelectionHandlerImpl } from '../src/event-handlers/selection-handler';

describe('convertModelSelectionToDOM', () => {
  let selectionHandler: DOMSelectionHandlerImpl;
  let container: HTMLElement;

  beforeEach(() => {
    // 테스트용 컨테이너 생성
    container = document.createElement('div');
    container.sid = 'test-container';
    document.body.appendChild(container);

    // SelectionHandler 생성 (Editor는 mock으로 처리)
    const mockEditor = {} as any;
    selectionHandler = new DOMSelectionHandlerImpl(mockEditor);

    // 테스트용 DOM 구조 생성
    setupTestDOM();
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  function setupTestDOM() {
    // 간단한 텍스트 컨테이너 (마크 없음)
    const simpleTextContainer = document.createElement('span');
    simpleTextContainer.setAttribute('data-bc-sid', 'text-1');
    simpleTextContainer.setAttribute('data-bc-stype', 'inline-text');
    simpleTextContainer.setAttribute('data-text-container', 'true');
    simpleTextContainer.textContent = 'Hello world';
    container.appendChild(simpleTextContainer);

    // 마크가 있는 텍스트 컨테이너
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

    // 복합 마크가 있는 텍스트 컨테이너
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

  describe('텍스트 선택 변환', () => {
    it('간단한 텍스트 컨테이너에서 선택을 생성해야 함', () => {
      const modelSelection = {
        type: 'text',
        anchor: { nodeId: 'text-1', offset: 2 },
        focus: { nodeId: 'text-1', offset: 7 }
      };

      selectionHandler.convertModelSelectionToDOM(modelSelection);

      const selection = window.getSelection();
      expect(selection).not.toBeNull();
      expect(selection!.rangeCount).toBe(1);
      expect(selection!.toString()).toBe('llo w');
    });

    it('마크가 있는 텍스트 컨테이너에서 선택을 생성해야 함', () => {
      const modelSelection = {
        type: 'text',
        anchor: { nodeId: 'text-bold', offset: 0 },
        focus: { nodeId: 'text-bold', offset: 9 }
      };

      selectionHandler.convertModelSelectionToDOM(modelSelection);

      const selection = window.getSelection();
      expect(selection).not.toBeNull();
      expect(selection!.rangeCount).toBe(1);
      expect(selection!.toString()).toBe('bold text');
    });

    it('복합 마크가 있는 텍스트 컨테이너에서 선택을 생성해야 함', () => {
      const modelSelection = {
        type: 'text',
        anchor: { nodeId: 'text-complex', offset: 0 },
        focus: { nodeId: 'text-complex', offset: 15 }
      };

      selectionHandler.convertModelSelectionToDOM(modelSelection);

      const selection = window.getSelection();
      expect(selection).not.toBeNull();
      expect(selection!.rangeCount).toBe(1);
      expect(selection!.toString()).toBe('bold and italic');
    });

    it('다른 텍스트 컨테이너 간 선택을 생성해야 함', () => {
      const modelSelection = {
        type: 'text',
        anchor: { nodeId: 'text-1', offset: 6 },
        focus: { nodeId: 'text-bold', offset: 4 }
      };

      selectionHandler.convertModelSelectionToDOM(modelSelection);

      const selection = window.getSelection();
      expect(selection).not.toBeNull();
      expect(selection!.rangeCount).toBe(1);
      expect(selection!.toString()).toBe('worldbold');
    });
  });

  describe('노드 선택 변환', () => {
    it('텍스트 컨테이너 전체를 선택해야 함', () => {
      const modelSelection = {
        type: 'node',
        nodeId: 'text-1'
      };

      selectionHandler.convertModelSelectionToDOM(modelSelection);

      const selection = window.getSelection();
      expect(selection).not.toBeNull();
      expect(selection!.rangeCount).toBe(1);
      expect(selection!.toString()).toBe('Hello world');
    });

    it('마크가 있는 텍스트 컨테이너 전체를 선택해야 함', () => {
      const modelSelection = {
        type: 'node',
        nodeId: 'text-bold'
      };

      selectionHandler.convertModelSelectionToDOM(modelSelection);

      const selection = window.getSelection();
      expect(selection).not.toBeNull();
      expect(selection!.rangeCount).toBe(1);
      expect(selection!.toString()).toBe('bold text');
    });
  });

  describe('에러 처리', () => {
    it('존재하지 않는 노드 ID에 대해 에러를 처리해야 함', () => {
      // 이전 선택 초기화
      window.getSelection()?.removeAllRanges();
      
      const modelSelection = {
        type: 'text',
        anchor: { nodeId: 'non-existent', offset: 0 },
        focus: { nodeId: 'non-existent', offset: 5 }
      };

      // 에러가 발생하지 않아야 함
      expect(() => {
        selectionHandler.convertModelSelectionToDOM(modelSelection);
      }).not.toThrow();

      // 선택이 없어야 함
      const selection = window.getSelection();
      expect(selection!.rangeCount).toBe(0);
    });

    it('텍스트 컨테이너가 아닌 요소에 대해 에러를 처리해야 함', () => {
      // 이전 선택 초기화
      window.getSelection()?.removeAllRanges();
      
      // 일반 div 요소 생성 (data-text-container 없음)
      const div = document.createElement('div');
      div.setAttribute('data-bc-sid', 'div-1');
      div.setAttribute('data-bc-stype', 'div');
      div.textContent = 'Not a text container';
      container.appendChild(div);

      const modelSelection = {
        type: 'text',
        anchor: { nodeId: 'div-1', offset: 0 },
        focus: { nodeId: 'div-1', offset: 5 }
      };

      expect(() => {
        selectionHandler.convertModelSelectionToDOM(modelSelection);
      }).not.toThrow();

      const selection = window.getSelection();
      expect(selection!.rangeCount).toBe(0);
    });

    it('잘못된 offset에 대해 에러를 처리해야 함', () => {
      // 이전 선택 초기화
      window.getSelection()?.removeAllRanges();
      
      const modelSelection = {
        type: 'text',
        anchor: { nodeId: 'text-1', offset: -1 },
        focus: { nodeId: 'text-1', offset: 1000 }
      };

      expect(() => {
        selectionHandler.convertModelSelectionToDOM(modelSelection);
      }).not.toThrow();

      const selection = window.getSelection();
      expect(selection!.rangeCount).toBe(0);
    });
  });

  describe('선택 해제', () => {
    it('type이 none인 경우 선택을 해제해야 함', () => {
      // 먼저 선택 생성
      const modelSelection = {
        type: 'text',
        anchor: { nodeId: 'text-1', offset: 0 },
        focus: { nodeId: 'text-1', offset: 5 }
      };
      selectionHandler.convertModelSelectionToDOM(modelSelection);

      // 선택이 있는지 확인
      let selection = window.getSelection();
      expect(selection!.rangeCount).toBe(1);

      // 선택 해제
      selectionHandler.convertModelSelectionToDOM({ type: 'none' });

      selection = window.getSelection();
      expect(selection!.rangeCount).toBe(0);
    });

    it('null/undefined인 경우 선택을 해제해야 함', () => {
      // 먼저 선택 생성
      const modelSelection = {
        type: 'text',
        anchor: { nodeId: 'text-1', offset: 0 },
        focus: { nodeId: 'text-1', offset: 5 }
      };
      selectionHandler.convertModelSelectionToDOM(modelSelection);

      // 선택이 있는지 확인
      let selection = window.getSelection();
      expect(selection!.rangeCount).toBe(1);

      // null로 선택 해제
      selectionHandler.convertModelSelectionToDOM(null);

      selection = window.getSelection();
      expect(selection!.rangeCount).toBe(0);
    });
  });
});
