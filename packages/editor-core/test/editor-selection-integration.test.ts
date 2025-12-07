import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Editor } from '../src/editor';
import { SelectionManager } from '../src/selection-manager';
import { DataStore } from '@barocss/datastore';
import { Schema } from '@barocss/schema';
// import { EDITOR_EVENTS } from '../src/types';

// Set up Mock DOM environment
const createMockElement = (tagName: string, attributes: Record<string, string> = {}): HTMLElement => {
  const element = document.createElement(tagName);
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  return element;
};

describe('Editor + SelectionManager 통합 테스트', () => {
  let editor: Editor;
  let contentEditableElement: HTMLElement;
  let dataStore: DataStore;
  let schema: Schema;

  beforeEach(() => {
    // Initialize DOM environment
    document.body.innerHTML = '';
    
    // Create Mock Schema
    schema = {
      nodes: {
        document: {
          content: 'block+'
        },
        paragraph: {
          content: 'inline*',
          group: 'block'
        },
        heading: {
          content: 'inline*',
          group: 'block',
          attrs: {
            level: { default: 1 }
          }
        },
        text: {
          group: 'inline'
        }
      },
      marks: {
        bold: {},
        italic: {}
      }
    } as any;

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
    paragraph.appendChild(document.createTextNode('Hello World'));
    contentEditableElement.appendChild(paragraph);

    const heading = createMockElement('h1', {
      'data-bc-sid': 'h1-1',
      'data-bc-stype': 'heading'
    });
    heading.appendChild(document.createTextNode('Title'));
    contentEditableElement.appendChild(heading);

    document.body.appendChild(contentEditableElement);

    // Set up Mock DataStore responses
    (dataStore.getNode as any).mockImplementation((nodeId: string) => {
      const mockNodes: Record<string, any> = {
        'root-1': { id: 'root-1', type: 'document' },
        'p-1': { id: 'p-1', type: 'paragraph' },
        'h1-1': { id: 'h1-1', type: 'heading' }
      };
      return mockNodes[nodeId] || null;
    });

    // Create Editor
    editor = new Editor({
      contentEditableElement,
      dataStore,
      schema
    });
  });

  afterEach(() => {
    editor.destroy();
    document.body.innerHTML = '';
  });

  describe('Selection 통합', () => {
    it('Editor가 SelectionManager를 포함해야 함', () => {
      expect(editor.selectionManager).toBeDefined();
      expect(editor.selectionManager).toBeInstanceOf(SelectionManager);
    });

    it('Editor의 selection이 작동해야 함', () => {
      expect(editor.selection).toBeDefined();
      expect(editor.selection.anchorNode).toBeNull();
      expect(editor.selection.focusNode).toBeNull();
      expect(editor.selection.empty).toBe(true);
    });

    it('Editor의 selection 메서드들이 작동해야 함', () => {
      // Test error event to verify dataStore is set
      const errorHandler = vi.fn();
      editor.on('error:selection', errorHandler);

      // Try to select with non-existent node
      editor.setRange({
        startNodeId: 'non-existent',
        startOffset: 0,
        endNodeId: 'p-1',
        endOffset: 1
      });

      // Error should occur (because dataStore is set)
      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('Selection 이벤트 통합', () => {
    it('SelectionManager의 selectionChange 이벤트가 Editor에 전달되어야 함', () => {
      const selectionChangeHandler = vi.fn();
      editor.on('editor:selection.change', selectionChangeHandler);

      // Simulate text selection in DOM
      const textNode = contentEditableElement.querySelector('p')?.firstChild as Text;
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 5);

      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      // Simulate selectionchange event
      const selectionChangeEvent = new Event('selectionchange');
      document.dispatchEvent(selectionChangeEvent);

      expect(selectionChangeHandler).toHaveBeenCalled();
    });

    it('Editor의 focus/blur 이벤트가 SelectionManager와 연동되어야 함', () => {
      const focusHandler = vi.fn();
      const blurHandler = vi.fn();
      
      editor.on('editor:selection.focus', focusHandler);
      editor.on('editor:selection.blur', blurHandler);

      // Simulate focus event
      const focusEvent = new Event('focus');
      contentEditableElement.dispatchEvent(focusEvent);

      expect(focusHandler).toHaveBeenCalled();

      // Simulate blur event
      const blurEvent = new Event('blur');
      contentEditableElement.dispatchEvent(blurEvent);

      expect(blurHandler).toHaveBeenCalled();
    });
  });

  describe('Selection 제어 통합', () => {
    it('Editor를 통해 Selection을 설정할 수 있어야 함', () => {
      const rangeSelection = {
        startNodeId: 'p-1',
        startOffset: 0,
        endNodeId: 'p-1',
        endOffset: 1
      };

      editor.setRange(rangeSelection);

      const selection = window.getSelection();
      expect(selection).toBeTruthy();
      expect(selection?.rangeCount).toBeGreaterThan(0);
    });

    it('Editor를 통해 Node Selection을 설정할 수 있어야 함', () => {
      const nodeSelection = {
        nodeId: 'p-1',
        selectAll: true
      };

      editor.setNode(nodeSelection);

      const selection = window.getSelection();
      expect(selection).toBeTruthy();
      expect(selection?.rangeCount).toBeGreaterThan(0);
    });

    it('Editor를 통해 Absolute Position Selection을 설정할 수 있어야 함', () => {
      const absoluteSelection = {
        anchor: 0,
        head: 5
      };

      editor.setAbsolutePos(absoluteSelection);

      const selection = window.getSelection();
      expect(selection).toBeTruthy();
      expect(selection?.rangeCount).toBeGreaterThan(0);
    });
  });

  describe('Selection 상태 조회', () => {
    it('현재 Selection 상태를 조회할 수 있어야 함', () => {
      const currentSelection = editor.selection;
      
      expect(currentSelection).toBeDefined();
      expect(currentSelection.anchorNode).toBeDefined();
      expect(currentSelection.focusNode).toBeDefined();
      expect(typeof currentSelection.empty).toBe('boolean');
      expect(typeof currentSelection.textContent).toBe('string');
      expect(typeof currentSelection.nodeId).toBe('string');
      expect(typeof currentSelection.nodeType).toBe('string');
    });

    it('Selection이 contentEditable 내에 있는지 확인할 수 있어야 함', () => {
      // Select inside contentEditable
      const textNode = contentEditableElement.querySelector('p')?.firstChild as Text;
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 5);

      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      expect(editor.isSelectionInContentEditable()).toBe(true);

      // Clear selection
      selection?.removeAllRanges();
      expect(editor.isSelectionInContentEditable()).toBe(false);
    });
  });

  describe('에러 처리 통합', () => {
    it('Selection 에러가 이벤트로 발생해야 함', () => {
      const errorHandler = vi.fn();
      editor.on('error:selection', errorHandler);

      // Try to select with non-existent node
      editor.setRange({
        startNodeId: 'non-existent',
        startOffset: 0,
        endNodeId: 'p-1',
        endOffset: 1
      });

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'CONVERSION_ERROR'
          })
        })
      );
    });

    it('Selection 에러 이벤트가 등록되지 않으면 콘솔에 에러를 출력해야 함', () => {
      // Create new Editor instance to test without error event registered
      const testEditor = new Editor({
        contentEditableElement,
        dataStore,
        schema
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Remove SelectionManager's error handler to trigger console error
      (testEditor as any)._selectionManager._errorHandler = undefined;

      // Try to select with non-existent node
      testEditor.setRange({
        startNodeId: 'non-existent',
        startOffset: 0,
        endNodeId: 'p-1',
        endOffset: 1
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        'SelectionManager Error:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
      testEditor.destroy();
    });
  });

  describe('Selection 정리', () => {
    it('Editor destroy 시 SelectionManager도 정리되어야 함', () => {
      const clearSelectionSpy = vi.spyOn(editor.selectionManager, 'clearSelection');
      
      editor.destroy();
      
      // Verify SelectionManager's clearSelection is called
      expect(clearSelectionSpy).toHaveBeenCalled();
    });
  });

  describe('실제 사용 시나리오', () => {
    it('사용자가 텍스트를 선택했을 때 SelectionState가 업데이트되어야 함', () => {
      const selectionChangeHandler = vi.fn();
      editor.on('editor:selection.change', selectionChangeHandler);

      // Simulate user selecting "Hello" text
      const textNode = contentEditableElement.querySelector('p')?.firstChild as Text;
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 5);

      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      // Simulate selectionchange event
      const selectionChangeEvent = new Event('selectionchange');
      document.dispatchEvent(selectionChangeEvent);

      expect(selectionChangeHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          selection: expect.objectContaining({
            textContent: 'Hello',
            nodeId: 'p-1',
            nodeType: 'paragraph'
          })
        })
      );
    });

    it('프로그래밍적으로 선택을 설정했을 때 DOM에 반영되어야 함', () => {
      // Set selection programmatically
      editor.setRange({
        startNodeId: 'h1-1',
        startOffset: 0,
        endNodeId: 'h1-1',
        endOffset: 1
      });

      const selection = window.getSelection();
      expect(selection).toBeTruthy();
      expect(selection?.rangeCount).toBeGreaterThan(0);

      // Verify selected text is "Title"
      const selectedText = selection?.toString();
      expect(selectedText).toBe('Title');
    });

    it('복잡한 선택 시나리오에서도 올바르게 작동해야 함', () => {
      // Simulate multi-step selection changes
      const selectionChanges: string[] = [];
      
      editor.on('selectionChange', (data) => {
        selectionChanges.push(data.selection.textContent);
      });

      // Step 1: Select first paragraph
      editor.setNode({
        nodeId: 'p-1',
        selectAll: true
      });

      // Step 2: Select heading
      editor.setNode({
        nodeId: 'h1-1',
        selectAll: true
      });

      // Step 3: Clear selection
      editor.clearSelection();

      // selectionchange events must be manually dispatched
      const selectionChangeEvent = new Event('selectionchange');
      document.dispatchEvent(selectionChangeEvent);

      expect(selectionChanges.length).toBeGreaterThan(0);
    });
  });
});
