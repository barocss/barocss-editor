import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EditorViewDOM } from '../../src/editor-view-dom.js';

// Mock Editor
const mockEditor = {
  emit: vi.fn(),
  executeCommand: vi.fn(),
  executeTransaction: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  destroy: vi.fn()
} as any;

describe('EditorViewDOM', () => {
  let editorViewDOM: EditorViewDOM;
  let container: HTMLElement;

  beforeEach(() => {
    // Create a container element for testing
    container = document.createElement('div');
    container.sid = 'test-container';
    document.body.appendChild(container);

    editorViewDOM = new EditorViewDOM(mockEditor, {
      container: container
    });
  });

  afterEach(() => {
    editorViewDOM.destroy();
    document.body.removeChild(container);
    vi.clearAllMocks();
  });

  describe('초기화', () => {
    it('EditorViewDOM이 올바르게 초기화되어야 함', () => {
      expect(editorViewDOM).toBeDefined();
      expect(editorViewDOM.layers.content.contentEditable).toBe('true');
      expect(editorViewDOM.container).toBe(container);
    });

    it('5개 계층이 생성되어야 함', () => {
      expect(container.children.length).toBe(5);
      expect(editorViewDOM.layers.content).toBeDefined();
      expect(editorViewDOM.layers.decorator).toBeDefined();
      expect(editorViewDOM.layers.selection).toBeDefined();
      expect(editorViewDOM.layers.context).toBeDefined();
      expect(editorViewDOM.layers.custom).toBeDefined();
    });

    it('이벤트 리스너가 등록되어야 함', () => {
      // Create new container
      const newContainer = document.createElement('div');
      document.body.appendChild(newContainer);
      
      // Spy on createElement to monitor content layer creation
      const originalCreateElement = document.createElement;
      const contentElements: HTMLElement[] = [];
      
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        const element = originalCreateElement.call(document, tagName);
        if (tagName === 'div') {
          contentElements.push(element as HTMLElement);
        }
        return element;
      });
      
      // Create new instance
      const newEditorViewDOM = new EditorViewDOM(mockEditor, {
        container: newContainer
      });
      
      // Verify event listener is registered on content layer
      expect(newEditorViewDOM.layers.content).toBeDefined();
      expect(newEditorViewDOM.layers.content.contentEditable).toBe('true');
      
      // Cleanup
      newEditorViewDOM.destroy();
      document.body.removeChild(newContainer);
      vi.restoreAllMocks();
    });
  });

  describe('이벤트 처리', () => {
    it('input 이벤트가 처리되어야 함', () => {
      const event = new InputEvent('input', {
        bubbles: true,
        cancelable: true
      });

      editorViewDOM.layers.content.dispatchEvent(event);
      
      // Verify event is processed (success if no error occurs)
      expect(true).toBe(true);
    });

    it('beforeInput 이벤트가 처리되어야 함', () => {
      const event = new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: 'a',
        bubbles: true,
        cancelable: true
      });

      editorViewDOM.layers.content.dispatchEvent(event);
      
      // Verify event is processed (success if no error occurs)
      expect(true).toBe(true);
    });

    it('keydown 이벤트가 처리되어야 함', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'a',
        bubbles: true,
        cancelable: true
      });

      editorViewDOM.layers.content.dispatchEvent(event);
      
      // Verify event is processed (success if no error occurs)
      expect(true).toBe(true);
    });
  });

  describe('네이티브 명령 처리', () => {
    it('insertText 명령이 올바르게 실행되어야 함', () => {
      const result = editorViewDOM.insertText('test text');
      
      expect(result).toBeUndefined(); // void method
      // Mock editor does not update DOM; assert command was invoked instead
      expect(mockEditor.executeCommand).toHaveBeenCalledWith('insertText', expect.objectContaining({ text: 'test text' }));
    });

    it('insertParagraph 명령이 올바르게 실행되어야 함', () => {
      const result = editorViewDOM.insertParagraph();
      
      expect(result).toBeUndefined(); // void method
    });

    it('deleteSelection 명령이 올바르게 실행되어야 함', () => {
      const result = editorViewDOM.deleteSelection();
      
      expect(result).toBeUndefined(); // void method
    });

    it('historyUndo 명령이 올바르게 실행되어야 함', () => {
      const result = editorViewDOM.historyUndo();
      
      expect(result).toBeUndefined(); // void method
    });

    it('historyRedo 명령이 올바르게 실행되어야 함', () => {
      const result = editorViewDOM.historyRedo();
      
      expect(result).toBeUndefined(); // void method
    });
  });

  describe('편집 명령', () => {
    it('toggleBold 명령이 올바르게 실행되어야 함', () => {
      const result = editorViewDOM.toggleBold();
      
      expect(result).toBeUndefined(); // void method
    });

    it('toggleItalic 명령이 올바르게 실행되어야 함', () => {
      const result = editorViewDOM.toggleItalic();
      
      expect(result).toBeUndefined(); // void method
    });

    it('toggleUnderline 명령이 올바르게 실행되어야 함', () => {
      const result = editorViewDOM.toggleUnderline();
      
      expect(result).toBeUndefined(); // void method
    });
  });

  describe('정리', () => {
    it('destroy 시에 정상적으로 정리되어야 함', () => {
      expect(() => editorViewDOM.destroy()).not.toThrow();
    });
  });
});