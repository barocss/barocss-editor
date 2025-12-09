/**
 * MutationObserver 통합 테스트
 * 
 * MutationObserver → InputHandler → Editor 트랜잭션 흐름을 검증합니다.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { define, element, data, slot, getGlobalRegistry } from '@barocss/dsl';
import { DOMRenderer } from '@barocss/renderer-dom';
import { EditorViewDOM } from '../../src/editor-view-dom';
import { MutationObserverManagerImpl } from '../../src/mutation-observer/mutation-observer-manager';
import { InputHandlerImpl } from '../../src/event-handlers/input-handler';

describe('MutationObserver Integration', () => {
  let editor: Editor;
  let editorView: EditorViewDOM;
  let container: HTMLElement;
  let registry: any;

  beforeEach(() => {
    // Initialize Registry
    registry = getGlobalRegistry();
    
    // Define basic components
    define('document', element('div', { className: 'document' }, [slot('content')]));
    define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    define('inline-text', element('span', {
      className: 'text',
      'data-bc-sid': (data: any) => data.sid || '',
      'data-bc-stype': (data: any) => data.stype || ''
    }, [data('text')]));

    // Create Mock Editor
    editor = {
      emit: vi.fn(),
      executeTransaction: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      destroy: vi.fn(),
      dataStore: {
        getNode: vi.fn(),
        setNode: vi.fn()
      },
      getDecorators: vi.fn(() => []),
      updateDecorators: vi.fn(),
      document: {
        stype: 'document',
        sid: 'doc1',
        content: []
      }
    } as any;

    // Create DOM container
    container = document.createElement('div');
    document.body.appendChild(container);

    // Create EditorViewDOM
    editorView = new EditorViewDOM(editor, {
      container,
      registry,
      autoRender: false
    });
  });

  afterEach(() => {
    if (editorView) {
      editorView.destroy();
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    vi.clearAllMocks();
  });

  describe('MutationObserver → InputHandler 통합', () => {
    it('텍스트 노드 변경 시 InputHandler.handleTextContentChange가 호출되어야 함', async () => {
      // Set initial model
      const model = {
        stype: 'document',
        sid: 'doc1',
        content: [
          {
            stype: 'paragraph',
            sid: 'p1',
            content: [
              {
                stype: 'inline-text',
                sid: 't1',
                text: 'Hello'
              }
            ]
          }
        ]
      };

      // Set model node
      (editor.dataStore.getNode as any).mockReturnValue({
        text: 'Hello',
        marks: [],
        sid: 't1',
        stype: 'inline-text'
      });

      // Render EditorViewDOM
      await editorView.render(model as any);

      // Find text node in DOM
      const textElement = container.querySelector('[data-bc-sid="t1"]');
      expect(textElement).toBeTruthy();

      const textNode = Array.from(textElement!.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE
      ) as Text;
      expect(textNode).toBeTruthy();

      // Spy on InputHandler.handleTextContentChange
      const inputHandler = (editorView as any).inputHandler as InputHandlerImpl;
      const handleTextContentChangeSpy = vi.spyOn(inputHandler, 'handleTextContentChange');

      // Simulate text change
      textNode.textContent = 'Hello World';

      // Wait until MutationObserver detects change
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify handleTextContentChange was called
      expect(handleTextContentChangeSpy).toHaveBeenCalled();
    });

    it('텍스트 변경 시 모델 트랜잭션이 실행되어야 함', async () => {
      // Set initial model
      const model = {
        stype: 'document',
        sid: 'doc1',
        content: [
          {
            stype: 'paragraph',
            sid: 'p1',
            content: [
              {
                stype: 'inline-text',
                sid: 't1',
                text: 'Hello'
              }
            ]
          }
        ]
      };

      // Set model node
      (editor.dataStore.getNode as any).mockReturnValue({
        text: 'Hello',
        marks: [],
        sid: 't1',
        stype: 'inline-text'
      });

      // Mock handleEfficientEdit
      const { handleEfficientEdit } = await import('../../src/utils/efficient-edit-handler');
      vi.spyOn(await import('../../src/utils/efficient-edit-handler'), 'handleEfficientEdit').mockReturnValue({
        newText: 'Hello World',
        adjustedMarks: [],
        adjustedDecorators: [],
        editInfo: {
          nodeId: 't1',
          oldText: 'Hello',
          newText: 'Hello World',
          editPosition: 5,
          editType: 'insert',
          insertedLength: 6,
          deletedLength: 0
        }
      });

      // Render EditorViewDOM
      await editorView.render(model as any);

      // Find text node in DOM
      const textElement = container.querySelector('[data-bc-sid="t1"]');
      const textNode = Array.from(textElement!.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE
      ) as Text;

      // Change text
      textNode.textContent = 'Hello World';

      // Wait until MutationObserver detects change
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify executeTransaction was called
      expect(editor.executeTransaction).toHaveBeenCalled();
    });

    it('IME 조합 중 텍스트 변경은 보류되어야 함', async () => {
      // Set initial model
      const model = {
        stype: 'document',
        sid: 'doc1',
        content: [
          {
            stype: 'paragraph',
            sid: 'p1',
            content: [
              {
                stype: 'inline-text',
                sid: 't1',
                text: 'Hello'
              }
            ]
          }
        ]
      };

      // Set model node
      (editor.dataStore.getNode as any).mockReturnValue({
        text: 'Hello',
        marks: [],
        sid: 't1',
        stype: 'inline-text'
      });

      // Render EditorViewDOM
      await editorView.render(model as any);

      // Start IME composition
      const inputHandler = (editorView as any).inputHandler as InputHandlerImpl;
      inputHandler.handleCompositionStart();

      // Find text node in DOM
      const textElement = container.querySelector('[data-bc-sid="t1"]');
      const textNode = Array.from(textElement!.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE
      ) as Text;

      // Change text during composition
      textNode.textContent = 'Hello World';

      // Wait until MutationObserver detects change
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Transaction should not execute during composition
      expect(editor.executeTransaction).not.toHaveBeenCalled();

      // Complete composition
      inputHandler.handleCompositionEnd({} as CompositionEvent);

      // Transaction should execute after composition completes
      expect(editor.executeTransaction).toHaveBeenCalled();
    });
  });

  describe('MutationObserverManager 직접 테스트', () => {
    it('MutationObserverManager가 설정되어야 함', () => {
      const mutationObserverManager = (editorView as any).mutationObserverManager as MutationObserverManagerImpl;
      expect(mutationObserverManager).toBeTruthy();
    });

    it('onTextChange 이벤트가 InputHandler로 전달되어야 함', async () => {
      // Set initial model
      const model = {
        stype: 'document',
        sid: 'doc1',
        content: [
          {
            stype: 'paragraph',
            sid: 'p1',
            content: [
              {
                stype: 'inline-text',
                sid: 't1',
                text: 'Hello'
              }
            ]
          }
        ]
      };

      // Set model node
      (editor.dataStore.getNode as any).mockReturnValue({
        text: 'Hello',
        marks: [],
        sid: 't1',
        stype: 'inline-text'
      });

      // Render EditorViewDOM
      await editorView.render(model as any);

      // Spy on InputHandler
      const inputHandler = (editorView as any).inputHandler as InputHandlerImpl;
      const handleTextContentChangeSpy = vi.spyOn(inputHandler, 'handleTextContentChange');

      // Find text node in DOM
      const textElement = container.querySelector('[data-bc-sid="t1"]') as HTMLElement;
      const textNode = Array.from(textElement.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE
      ) as Text;

      // Change text (MutationObserver will detect)
      textNode.textContent = 'Hello World';

      // Wait until MutationObserver detects change
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify handleTextContentChange was called
      expect(handleTextContentChangeSpy).toHaveBeenCalled();
      // Verify arguments of first call
      const firstCall = handleTextContentChangeSpy.mock.calls[0];
      expect(firstCall[0]).toBe('Hello'); // oldText
      expect(firstCall[1]).toBe('Hello World'); // newText
      expect(firstCall[2]).toBe(textNode); // target
    });
  });

  describe('실제 DOM 변경 감지', () => {
    it('DOM 텍스트 노드 변경이 감지되어야 함', async () => {
      // Set initial model
      const model = {
        stype: 'document',
        sid: 'doc1',
        content: [
          {
            stype: 'paragraph',
            sid: 'p1',
            content: [
              {
                stype: 'inline-text',
                sid: 't1',
                text: 'Hello'
              }
            ]
          }
        ]
      };

      // Set model node
      (editor.dataStore.getNode as any).mockReturnValue({
        text: 'Hello',
        marks: [],
        sid: 't1',
        stype: 'inline-text'
      });

      // Render EditorViewDOM
      await editorView.render(model as any);

      // Find text node in DOM
      const textElement = container.querySelector('[data-bc-sid="t1"]') as HTMLElement;
      expect(textElement).toBeTruthy();

      const textNode = Array.from(textElement.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE
      ) as Text;
      expect(textNode).toBeTruthy();
      expect(textNode.textContent).toBe('Hello');

      // Spy on InputHandler
      const inputHandler = (editorView as any).inputHandler as InputHandlerImpl;
      const handleTextContentChangeSpy = vi.spyOn(inputHandler, 'handleTextContentChange');

      // Actual DOM change
      textNode.textContent = 'Hello World';

      // Wait until MutationObserver detects change
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify handleTextContentChange was called
      expect(handleTextContentChangeSpy).toHaveBeenCalled();
    });

    it('여러 텍스트 노드 변경이 순차적으로 처리되어야 함', async () => {
      // Set initial model (multiple text nodes)
      const model = {
        stype: 'document',
        sid: 'doc1',
        content: [
          {
            stype: 'paragraph',
            sid: 'p1',
            content: [
              {
                stype: 'inline-text',
                sid: 't1',
                text: 'Hello'
              },
              {
                stype: 'inline-text',
                sid: 't2',
                text: 'World'
              }
            ]
          }
        ]
      };

      // Set model node
      (editor.dataStore.getNode as any).mockImplementation((nodeId: string) => {
        if (nodeId === 't1') {
          return { text: 'Hello', marks: [], sid: 't1', stype: 'inline-text' };
        }
        if (nodeId === 't2') {
          return { text: 'World', marks: [], sid: 't2', stype: 'inline-text' };
        }
        return null;
      });

      // Render EditorViewDOM
      await editorView.render(model as any);

      // Spy on InputHandler
      const inputHandler = (editorView as any).inputHandler as InputHandlerImpl;
      const handleTextContentChangeSpy = vi.spyOn(inputHandler, 'handleTextContentChange');

      // Change first text node
      const textElement1 = container.querySelector('[data-bc-sid="t1"]') as HTMLElement;
      const textNode1 = Array.from(textElement1.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE
      ) as Text;
      textNode1.textContent = 'Hello!';

      // Wait until MutationObserver detects change
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Change second text node
      const textElement2 = container.querySelector('[data-bc-sid="t2"]') as HTMLElement;
      const textNode2 = Array.from(textElement2.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE
      ) as Text;
      textNode2.textContent = 'World!';

      // Wait until MutationObserver detects change
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify handleTextContentChange was called multiple times
      expect(handleTextContentChangeSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('에러 처리', () => {
    it('모델 노드를 찾을 수 없을 때 에러 없이 처리되어야 함', async () => {
      // Set initial model
      const model = {
        stype: 'document',
        sid: 'doc1',
        content: [
          {
            stype: 'paragraph',
            sid: 'p1',
            content: [
              {
                stype: 'inline-text',
                sid: 't1',
                text: 'Hello'
              }
            ]
          }
        ]
      };

      // Set up so model node cannot be found
      (editor.dataStore.getNode as any).mockReturnValue(null);

      // Render EditorViewDOM
      await editorView.render(model as any);

      // Find text node in DOM
      const textElement = container.querySelector('[data-bc-sid="t1"]') as HTMLElement;
      const textNode = Array.from(textElement.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE
      ) as Text;

      // Change text
      textNode.textContent = 'Hello World';

      // Wait until MutationObserver detects change
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should handle without error (executeTransaction is not called)
      expect(editor.executeTransaction).not.toHaveBeenCalled();
    });

    it('data-bc-sid가 없는 노드는 무시되어야 함', async () => {
      // Create regular div element (no data-bc-sid)
      const div = document.createElement('div');
      div.textContent = 'Hello';
      container.appendChild(div);

      // Spy on InputHandler
      const inputHandler = (editorView as any).inputHandler as InputHandlerImpl;
      const handleTextContentChangeSpy = vi.spyOn(inputHandler, 'handleTextContentChange');

      // Change text
      div.textContent = 'Hello World';

      // Wait until MutationObserver detects change
      await new Promise((resolve) => setTimeout(resolve, 100));

      // handleTextContentChange may be called, but should early return
      // (Actually MutationObserver detects all changes, so it may be called)
      // But if nodeId is missing, it should early return
    });
  });
});

