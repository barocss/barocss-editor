import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SelectionManager } from '../src/selection-manager';
import { DataStore } from '@barocss/datastore';
import { 
  SelectionError, 
  NodeNotFoundError, 
  InvalidOffsetError, 
  ConversionError, 
  DOMAccessError 
} from '../src/types';

// Set up Mock DOM environment
const createMockElement = (tagName: string, attributes: Record<string, string> = {}): HTMLElement => {
  const element = document.createElement(tagName);
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  return element;
};

const createMockTextNode = (text: string): Text => {
  return document.createTextNode(text);
};

describe('SelectionManager', () => {
  let selectionManager: SelectionManager;
  let contentEditableElement: HTMLElement;
  let dataStore: DataStore;

  beforeEach(() => {
    // Initialize DOM environment
    document.body.innerHTML = '';
    
    // Create Mock DataStore
    dataStore = {
      getNode: vi.fn(),
      getNodes: vi.fn(),
      addNode: vi.fn(),
      updateNode: vi.fn(),
      deleteNode: vi.fn(),
      getRoot: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn()
    } as any;

    // Create contentEditable element
    contentEditableElement = createMockElement('div', {
      'contenteditable': 'true',
      'data-bc-sid': 'root-1',
      'data-bc-stype': 'document'
    });

    // Add child elements
    const paragraph = createMockElement('p', {
      'data-bc-sid': 'p-1',
      'data-bc-stype': 'paragraph'
    });
    paragraph.appendChild(createMockTextNode('Hello World'));
    contentEditableElement.appendChild(paragraph);

    const heading = createMockElement('h1', {
      'data-bc-sid': 'h1-1',
      'data-bc-stype': 'heading'
    });
    heading.appendChild(createMockTextNode('Title'));
    contentEditableElement.appendChild(heading);

    document.body.appendChild(contentEditableElement);

    // Create SelectionManager
    selectionManager = new SelectionManager({
      contentEditableElement,
      dataStore
    });

    // Set up Mock DataStore responses
    (dataStore.getNode as any).mockImplementation((nodeId: string) => {
      const mockNodes: Record<string, any> = {
        'root-1': { id: 'root-1', type: 'document' },
        'p-1': { id: 'p-1', type: 'paragraph' },
        'h1-1': { id: 'h1-1', type: 'heading' }
      };
      return mockNodes[nodeId] || null;
    });
  });

  afterEach(() => {
    selectionManager.destroy();
    document.body.innerHTML = '';
  });

  describe('초기화', () => {
    it('빈 선택 상태로 초기화되어야 함', () => {
      const selection = selectionManager.selection;
      expect(selection.empty).toBe(true);
      expect(selection.anchorNode).toBeNull();
      expect(selection.focusNode).toBeNull();
      expect(selection.textContent).toBe('');
    });

    it('contentEditableElement 설정 시 이벤트 리스너가 등록되어야 함', () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
      const elementAddEventListenerSpy = vi.spyOn(contentEditableElement, 'addEventListener');
      
      selectionManager.setContentEditableElement(contentEditableElement);
      
      expect(addEventListenerSpy).toHaveBeenCalledWith('selectionchange', expect.any(Function));
      expect(elementAddEventListenerSpy).toHaveBeenCalledWith('focus', expect.any(Function));
      expect(elementAddEventListenerSpy).toHaveBeenCalledWith('blur', expect.any(Function));
    });
  });

  describe('setRange', () => {
    it('유효한 Model Range를 DOM Selection으로 변환해야 함', () => {
      const rangeSelection = {
        startNodeId: 'p-1',
        startOffset: 0,
        endNodeId: 'p-1',
        endOffset: 1  // Element 노드의 경우 0 또는 1만 허용
      };

      selectionManager.setRange(rangeSelection);

      const selection = window.getSelection();
      expect(selection).toBeTruthy();
      expect(selection?.rangeCount).toBeGreaterThan(0);
    });

    it('존재하지 않는 노드 ID에 대해 NodeNotFoundError를 발생시켜야 함', () => {
      const errorHandler = vi.fn();
      selectionManager.setErrorHandler(errorHandler);

      const rangeSelection = {
        startNodeId: 'non-existent',
        startOffset: 0,
        endNodeId: 'p-1',
        endOffset: 5
      };

      selectionManager.setRange(rangeSelection);

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'CONVERSION_ERROR'
        })
      );
    });

    it('잘못된 오프셋에 대해 InvalidOffsetError를 발생시켜야 함', () => {
      const errorHandler = vi.fn();
      selectionManager.setErrorHandler(errorHandler);

      const rangeSelection = {
        startNodeId: 'p-1',
        startOffset: 999, // 잘못된 오프셋
        endNodeId: 'p-1',
        endOffset: 5
      };

      selectionManager.setRange(rangeSelection);

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'CONVERSION_ERROR'
        })
      );
    });
  });

  describe('setNode', () => {
    it('유효한 Model Node를 DOM Selection으로 변환해야 함', () => {
      const nodeSelection = {
        nodeId: 'p-1',
        selectAll: true
      };

      selectionManager.setNode(nodeSelection);

      const selection = window.getSelection();
      expect(selection).toBeTruthy();
      expect(selection?.rangeCount).toBeGreaterThan(0);
    });

    it('selectAll이 false일 때 노드 앞에 커서를 설정해야 함', () => {
      const nodeSelection = {
        nodeId: 'p-1',
        selectAll: false
      };

      selectionManager.setNode(nodeSelection);

      const selection = window.getSelection();
      expect(selection).toBeTruthy();
      expect(selection?.rangeCount).toBeGreaterThan(0);
    });
  });

  describe('setAbsolutePos', () => {
    it('절대 위치를 DOM Selection으로 변환해야 함', () => {
      const absoluteSelection = {
        anchor: 0,
        head: 5
      };

      selectionManager.setAbsolutePos(absoluteSelection);

      const selection = window.getSelection();
      expect(selection).toBeTruthy();
      expect(selection?.rangeCount).toBeGreaterThan(0);
    });
  });

  describe('DOM Selection 변환', () => {
    it('DOM Selection을 SelectionState로 변환해야 함', () => {
      // DOM에서 텍스트 선택 시뮬레이션
      const textNode = contentEditableElement.querySelector('p')?.firstChild as Text;
      expect(textNode).toBeTruthy();

      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 5);

      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      // selectionchange 이벤트 시뮬레이션
      const selectionChangeEvent = new Event('selectionchange');
      document.dispatchEvent(selectionChangeEvent);

      const currentSelection = selectionManager.selection;
      expect(currentSelection.anchorNode).toBe(textNode);
      expect(currentSelection.anchorOffset).toBe(0);
      expect(currentSelection.focusNode).toBe(textNode);
      expect(currentSelection.focusOffset).toBe(5);
      expect(currentSelection.textContent).toBe('Hello');
      expect(currentSelection.nodeId).toBe('p-1');
      expect(currentSelection.nodeType).toBe('paragraph');
    });

    it('빈 선택일 때 빈 SelectionState를 반환해야 함', () => {
      const selection = window.getSelection();
      selection?.removeAllRanges();

      const selectionChangeEvent = new Event('selectionchange');
      document.dispatchEvent(selectionChangeEvent);

      const currentSelection = selectionManager.selection;
      expect(currentSelection.empty).toBe(true);
      expect(currentSelection.textContent).toBe('');
    });
  });

  describe('에러 처리', () => {
    it('에러 핸들러가 설정되면 에러를 전달해야 함', () => {
      const errorHandler = vi.fn();
      selectionManager.setErrorHandler(errorHandler);

      // 존재하지 않는 노드로 선택 시도
      const rangeSelection = {
        startNodeId: 'non-existent',
        startOffset: 0,
        endNodeId: 'p-1',
        endOffset: 5
      };

      selectionManager.setRange(rangeSelection);

      expect(errorHandler).toHaveBeenCalled();
    });

    it('에러 핸들러가 없으면 콘솔에 에러를 출력해야 함', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // 존재하지 않는 노드로 선택 시도
      const rangeSelection = {
        startNodeId: 'non-existent',
        startOffset: 0,
        endNodeId: 'p-1',
        endOffset: 5
      };

      selectionManager.setRange(rangeSelection);

      expect(consoleSpy).toHaveBeenCalledWith(
        'SelectionManager Error:',
        expect.any(SelectionError)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('이벤트 처리', () => {
    it('selectionChange 이벤트를 발생시켜야 함', () => {
      const selectionChangeHandler = vi.fn();
      selectionManager.on('selectionChange', selectionChangeHandler);

      // DOM에서 텍스트 선택 시뮬레이션
      const textNode = contentEditableElement.querySelector('p')?.firstChild as Text;
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 5);

      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      // selectionchange 이벤트 시뮬레이션
      const selectionChangeEvent = new Event('selectionchange');
      document.dispatchEvent(selectionChangeEvent);

      expect(selectionChangeHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          selection: expect.any(Object),
          oldSelection: expect.any(Object)
        })
      );
    });

    it('focus 이벤트를 발생시켜야 함', () => {
      const focusHandler = vi.fn();
      selectionManager.on('focus', focusHandler);

      const focusEvent = new Event('focus');
      contentEditableElement.dispatchEvent(focusEvent);

      expect(focusHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          selection: expect.any(Object)
        })
      );
    });

    it('blur 이벤트를 발생시켜야 함', () => {
      const blurHandler = vi.fn();
      selectionManager.on('blur', blurHandler);

      const blurEvent = new Event('blur');
      contentEditableElement.dispatchEvent(blurEvent);

      expect(blurHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          selection: expect.any(Object)
        })
      );
    });
  });

  describe('유틸리티 메서드', () => {
    it('clearSelection이 선택을 지워야 함', () => {
      // 먼저 선택 설정
      const textNode = contentEditableElement.querySelector('p')?.firstChild as Text;
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 5);

      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      expect(selection?.rangeCount).toBeGreaterThan(0);

      // 선택 지우기
      selectionManager.clearSelection();

      expect(selection?.rangeCount).toBe(0);
    });

    it('isSelectionInContentEditable이 올바르게 작동해야 함', () => {
      // contentEditable 내부 선택
      const textNode = contentEditableElement.querySelector('p')?.firstChild as Text;
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 5);

      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      expect(selectionManager.isSelectionInContentEditable()).toBe(true);

      // 선택 지우기
      selection?.removeAllRanges();
      expect(selectionManager.isSelectionInContentEditable()).toBe(false);
    });
  });

  describe('텍스트가 없는 노드 처리', () => {
    it('이미지 노드에 대해 올바른 오프셋을 처리해야 함', () => {
      // 이미지 노드 추가
      const img = createMockElement('img', {
        'data-bc-sid': 'img-1',
        'data-bc-stype': 'image'
      });
      contentEditableElement.appendChild(img);

      // Mock DataStore에 이미지 노드 추가
      (dataStore.getNode as any).mockImplementation((nodeId: string) => {
        const mockNodes: Record<string, any> = {
          'root-1': { id: 'root-1', type: 'document' },
          'p-1': { id: 'p-1', type: 'paragraph' },
          'h1-1': { id: 'h1-1', type: 'heading' },
          'img-1': { id: 'img-1', type: 'image' }
        };
        return mockNodes[nodeId] || null;
      });

      const nodeSelection = {
        nodeId: 'img-1',
        selectAll: false
      };

      selectionManager.setNode(nodeSelection);

      const selection = window.getSelection();
      expect(selection).toBeTruthy();
      expect(selection?.rangeCount).toBeGreaterThan(0);
    });
  });

  describe('정리', () => {
    it('destroy 시 모든 리스너가 정리되어야 함', () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
      const elementRemoveEventListenerSpy = vi.spyOn(contentEditableElement, 'removeEventListener');

      selectionManager.destroy();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('selectionchange', expect.any(Function));
      expect(elementRemoveEventListenerSpy).toHaveBeenCalledWith('focus', expect.any(Function));
      expect(elementRemoveEventListenerSpy).toHaveBeenCalledWith('blur', expect.any(Function));
    });
  });
});