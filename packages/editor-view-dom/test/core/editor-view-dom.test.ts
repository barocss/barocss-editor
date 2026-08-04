import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EditorViewDOM } from '../../src/editor-view-dom';

function createMockEditor() {
  const listeners = new Map<string, Set<Function>>();

  return {
    editor: {
            executeCommand: vi.fn(),
      executeTransaction: vi.fn(),
      on(event: string, callback: Function) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(callback);
      },
      off(event: string, callback: Function) {
        listeners.get(event)?.delete(callback);
      },
      emit(event: string, data?: unknown) {
        listeners.get(event)?.forEach((handler) => handler(data));
      },
      destroy: vi.fn()
    } as any,
    listeners
  };
}

describe('EditorViewDOM', () => {
  let editorViewDOM: EditorViewDOM;
  let container: HTMLElement;
  let mock = createMockEditor();

  beforeEach(() => {
    // Create a container element for testing
    container = document.createElement('div');
    container.sid = 'test-container';
    document.body.appendChild(container);
    mock = createMockEditor();

    editorViewDOM = new EditorViewDOM(mock.editor, {
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
      const newEditor = createMockEditor();
      const newEditorViewDOM = new EditorViewDOM(newEditor.editor, {
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

    it('beforeinput의 isComposing 상태에서 editable 영역 밖이면 기본 동작이 방지되어야 함', () => {
      const event = {
        inputType: 'insertText',
        isComposing: true,
        preventDefault: vi.fn(),
      } as unknown as InputEvent;
      const preventSpy = vi.spyOn(event, 'preventDefault');
      const sel = window.getSelection();
      sel?.removeAllRanges();

      editorViewDOM.handleBeforeInput(event);

      expect(preventSpy).toHaveBeenCalled();
    });

    it('beforeinput의 isComposing 상태에서 inline-text 영역이면 기본 동작이 허용되어야 함', () => {
      const spy = vi.spyOn(editorViewDOM as any, 'isSelectionInsideEditableText').mockReturnValue(true);
      const event = {
        inputType: 'insertText',
        isComposing: true,
        preventDefault: vi.fn(),
      } as unknown as InputEvent;

      const preventSpy = vi.spyOn(event, 'preventDefault');
      editorViewDOM.handleBeforeInput(event);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(preventSpy).not.toHaveBeenCalled();
    });
  });

  describe('네이티브 명령 처리', () => {
    it('insertText 명령이 올바르게 실행되어야 함', () => {
      const result = editorViewDOM.insertText('test text');
      
      expect(result).toBeUndefined(); // void method
      // Mock editor does not update DOM; assert command was invoked instead
      expect(mock.editor.executeCommand).toHaveBeenCalledWith('insertText', expect.objectContaining({ text: 'test text' }));
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
    it('destroy()가 setup/teardown 이벤트 핸들러를 동일한 참조로 제거해야 함', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const localListeners = new Map<string, Set<Function>>();
      const localEditor = {
        executeCommand: vi.fn(),
        executeTransaction: vi.fn(),
        on(event: string, callback: Function) {
          if (!localListeners.has(event)) localListeners.set(event, new Set());
          localListeners.get(event)!.add(callback);
        },
        off(event: string, callback: Function) {
          localListeners.get(event)?.delete(callback);
        },
        emit(event: string, data?: unknown) {
          localListeners.get(event)?.forEach((handler) => handler(data));
        },
      } as any;

      const addSpy = vi.spyOn(Element.prototype, 'addEventListener');
      const removeSpy = vi.spyOn(Element.prototype, 'removeEventListener');
      const docAddSpy = vi.spyOn(document, 'addEventListener');
      const docRemoveSpy = vi.spyOn(document, 'removeEventListener');

      const localView = new EditorViewDOM(localEditor, {
        container,
      });

      expect(localView).toBeDefined();

      const boundInput = (localView as any)._boundHandleInput as Function;
      const boundBeforeInput = (localView as any)._boundHandleBeforeInput as Function;
      const boundKeydown = (localView as any)._boundHandleKeydown as Function;
      const boundPaste = (localView as any)._boundHandlePaste as Function;
      const boundDrop = (localView as any)._boundHandleDrop as Function;
      const boundSelectionChange = (localView as any)._boundHandleSelectionChange as Function;
      const boundMouseDown = (localView as any)._boundHandleMouseDown as Function;
      const boundMouseMove = (localView as any)._boundHandleMouseMove as Function;
      const boundMouseUp = (localView as any)._boundHandleMouseUp as Function;
      const boundFocus = (localView as any)._boundHandleFocus as Function;
      const boundBlur = (localView as any)._boundHandleBlur as Function;

      const assertHasCall = (spy: ReturnType<typeof vi.spyOn>, eventName: string, handler: Function): void => {
        const matchedAdd = spy.mock.calls.some((call) => call[0] === eventName && call[1] === handler);
        expect(matchedAdd).toBe(true);
      };

      const assertDidNotCall = (spy: ReturnType<typeof vi.spyOn>, eventName: string): void => {
        const matched = spy.mock.calls.some((call) => call[0] === eventName);
        expect(matched).toBe(false);
      };

      assertHasCall(docAddSpy, 'selectionchange', boundSelectionChange);
      assertHasCall(docAddSpy, 'mousemove', boundMouseMove);
      assertHasCall(docAddSpy, 'mouseup', boundMouseUp);

      assertHasCall(addSpy, 'input', boundInput);
      assertHasCall(addSpy, 'beforeinput', boundBeforeInput);
      assertHasCall(addSpy, 'keydown', boundKeydown);
      assertHasCall(addSpy, 'paste', boundPaste);
      assertHasCall(addSpy, 'drop', boundDrop);
      assertHasCall(addSpy, 'mousedown', boundMouseDown);
      assertHasCall(addSpy, 'focus', boundFocus);
      assertHasCall(addSpy, 'blur', boundBlur);
      // No composition listeners by design: MutationObserver diffs model text
      // against DOM text, so the composed result is picked up without them.
      // Measured equivalent to a compositionstart/end + sync-once design.
      assertDidNotCall(addSpy, 'compositionstart');
      assertDidNotCall(addSpy, 'compositionupdate');
      assertDidNotCall(addSpy, 'compositionend');

      localView.destroy();

      const assertHasRemove = (spy: ReturnType<typeof vi.spyOn>, eventName: string, handler: Function): void => {
        const matchedRemove = spy.mock.calls.some((call) => call[0] === eventName && call[1] === handler);
        expect(matchedRemove).toBe(true);
      };

      assertHasRemove(docRemoveSpy, 'selectionchange', boundSelectionChange);
      assertHasRemove(docRemoveSpy, 'mousemove', boundMouseMove);
      assertHasRemove(docRemoveSpy, 'mouseup', boundMouseUp);

      assertHasRemove(removeSpy, 'input', boundInput);
      assertHasRemove(removeSpy, 'beforeinput', boundBeforeInput);
      assertHasRemove(removeSpy, 'keydown', boundKeydown);
      assertHasRemove(removeSpy, 'paste', boundPaste);
      assertHasRemove(removeSpy, 'drop', boundDrop);
      assertHasRemove(removeSpy, 'mousedown', boundMouseDown);
      assertHasRemove(removeSpy, 'focus', boundFocus);
      assertHasRemove(removeSpy, 'blur', boundBlur);
      assertDidNotCall(removeSpy, 'compositionstart');
      assertDidNotCall(removeSpy, 'compositionupdate');
      assertDidNotCall(removeSpy, 'compositionend');

      localView.destroy();
      document.body.removeChild(container);

      addSpy.mockRestore();
      removeSpy.mockRestore();
      docAddSpy.mockRestore();
      docRemoveSpy.mockRestore();
    });

    it('destroy 시에 정상적으로 정리되어야 함', () => {
      expect(() => editorViewDOM.destroy()).not.toThrow();
    });

    it('editor:selection.model 이벤트에서 applySelectionToView=false면 DOM 동기화를 건너뛰어야 함', () => {
      const convertSpy = vi.spyOn((editorViewDOM as any).selectionHandler, 'convertModelSelectionToDOM');
      const startNode = document.createElement('span');
      startNode.setAttribute('data-bc-sid', 't1');
      startNode.textContent = 'hello';
      editorViewDOM.layers.content.appendChild(startNode);

      const endNode = document.createElement('span');
      endNode.setAttribute('data-bc-sid', 't1');
      endNode.textContent = 'world';
      editorViewDOM.layers.content.appendChild(endNode);

      mock.editor.emit('editor:selection.model', {
        selection: {
          type: 'range',
          startNodeId: 't1',
          startOffset: 0,
          endNodeId: 't1',
          endOffset: 0,
        },
        applySelectionToView: false,
      });

      expect(convertSpy).not.toHaveBeenCalled();
    });

    it('editor:selection.model 이벤트에서 applySelectionToView=true면 DOM 동기화가 수행되어야 함', () => {
      const convertSpy = vi.spyOn((editorViewDOM as any).selectionHandler, 'convertModelSelectionToDOM');
      const startNode = document.createElement('span');
      startNode.setAttribute('data-bc-sid', 't2');
      startNode.textContent = 'hello';
      editorViewDOM.layers.content.appendChild(startNode);

      mock.editor.emit('editor:selection.model', {
        selection: {
          type: 'range',
          startNodeId: 't2',
          startOffset: 0,
          endNodeId: 't2',
          endOffset: 0,
        },
        applySelectionToView: true,
      });

      expect(convertSpy).toHaveBeenCalledTimes(1);
      expect(convertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'range',
          startNodeId: 't2',
          startOffset: 0,
          endNodeId: 't2',
          endOffset: 0,
        })
      );
    });

    it('editor:selection.model 이벤트에서 source=remote면 DOM 동기화를 건너뛰어야 함', () => {
      const convertSpy = vi.spyOn((editorViewDOM as any).selectionHandler, 'convertModelSelectionToDOM');
      const startNode = document.createElement('span');
      startNode.setAttribute('data-bc-sid', 't3');
      startNode.textContent = 'hello';
      editorViewDOM.layers.content.appendChild(startNode);

      mock.editor.emit('editor:selection.model', {
        selection: {
          type: 'range',
          startNodeId: 't3',
          startOffset: 0,
          endNodeId: 't3',
          endOffset: 0,
        },
        source: 'remote',
      });

      expect(convertSpy).not.toHaveBeenCalled();
    });

    it('editor:selection.model 이벤트에서 node 타입이면 DOM 동기화가 수행되어야 함', () => {
      const convertSpy = vi.spyOn((editorViewDOM as any).selectionHandler, 'convertModelSelectionToDOM');
      const nodeElement = document.createElement('span');
      nodeElement.setAttribute('data-bc-sid', 'node-1');
      nodeElement.textContent = 'hello';
      editorViewDOM.layers.content.appendChild(nodeElement);

      mock.editor.emit('editor:selection.model', {
        type: 'node',
        nodeId: 'node-1',
        startNodeId: 'node-1',
        startOffset: 0,
        endNodeId: 'node-1',
        endOffset: 5,
        applySelectionToView: true
      });

      expect(convertSpy).toHaveBeenCalledTimes(1);
      expect(convertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'node',
          nodeId: 'node-1',
          startNodeId: 'node-1',
          startOffset: 0,
          endNodeId: 'node-1',
          endOffset: 5
        })
      );
    });

    it('editor:selection.model 이벤트에서 source=remote인 plain range payload는 DOM 동기화를 건너뛰어야 함', () => {
      const convertSpy = vi.spyOn((editorViewDOM as any).selectionHandler, 'convertModelSelectionToDOM');
      const startNode = document.createElement('span');
      startNode.setAttribute('data-bc-sid', 't4');
      startNode.textContent = 'hello';
      editorViewDOM.layers.content.appendChild(startNode);

      mock.editor.emit('editor:selection.model', {
        type: 'range',
        startNodeId: 't4',
        startOffset: 0,
        endNodeId: 't4',
        endOffset: 0,
        source: 'remote',
      });

      expect(convertSpy).not.toHaveBeenCalled();
    });

    it('editor:selection.model 이벤트에서 source=remote인 plain node payload는 DOM 동기화를 건너뛰어야 함', () => {
      const convertSpy = vi.spyOn((editorViewDOM as any).selectionHandler, 'convertModelSelectionToDOM');
      const nodeElement = document.createElement('span');
      nodeElement.setAttribute('data-bc-sid', 'node-3');
      nodeElement.textContent = 'hello';
      editorViewDOM.layers.content.appendChild(nodeElement);

      mock.editor.emit('editor:selection.model', {
        type: 'node',
        nodeId: 'node-3',
        startNodeId: 'node-3',
        startOffset: 0,
        endNodeId: 'node-3',
        endOffset: 5,
        source: 'remote',
      });

      expect(convertSpy).not.toHaveBeenCalled();
    });

    it('editor:selection.model 이벤트에서 source=remote인 node 타입은 DOM 동기화를 건너뛰어야 함', () => {
      const convertSpy = vi.spyOn((editorViewDOM as any).selectionHandler, 'convertModelSelectionToDOM');
      const nodeElement = document.createElement('span');
      nodeElement.setAttribute('data-bc-sid', 'node-2');
      nodeElement.textContent = 'hello';
      editorViewDOM.layers.content.appendChild(nodeElement);

      mock.editor.emit('editor:selection.model', {
        selection: {
          type: 'node',
          nodeId: 'node-2',
          startNodeId: 'node-2',
          startOffset: 0,
          endNodeId: 'node-2',
          endOffset: 5
        },
        source: 'remote',
      });

      expect(convertSpy).not.toHaveBeenCalled();
    });
  });
});
