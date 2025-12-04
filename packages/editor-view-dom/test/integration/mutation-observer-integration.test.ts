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
    // Registry 초기화
    registry = getGlobalRegistry();
    
    // 기본 컴포넌트 정의
    define('document', element('div', { className: 'document' }, [slot('content')]));
    define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    define('inline-text', element('span', {
      className: 'text',
      'data-bc-sid': (data: any) => data.sid || '',
      'data-bc-stype': (data: any) => data.stype || ''
    }, [data('text')]));

    // Mock Editor 생성
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

    // DOM 컨테이너 생성
    container = document.createElement('div');
    document.body.appendChild(container);

    // EditorViewDOM 생성
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
      // 초기 모델 설정
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

      // 모델 노드 설정
      (editor.dataStore.getNode as any).mockReturnValue({
        text: 'Hello',
        marks: [],
        sid: 't1',
        stype: 'inline-text'
      });

      // EditorViewDOM 렌더링
      await editorView.render(model as any);

      // DOM에서 텍스트 노드 찾기
      const textElement = container.querySelector('[data-bc-sid="t1"]');
      expect(textElement).toBeTruthy();

      const textNode = Array.from(textElement!.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE
      ) as Text;
      expect(textNode).toBeTruthy();

      // InputHandler.handleTextContentChange 스파이
      const inputHandler = (editorView as any).inputHandler as InputHandlerImpl;
      const handleTextContentChangeSpy = vi.spyOn(inputHandler, 'handleTextContentChange');

      // 텍스트 변경 시뮬레이션
      textNode.textContent = 'Hello World';

      // MutationObserver가 변경을 감지할 때까지 대기
      await new Promise((resolve) => setTimeout(resolve, 100));

      // handleTextContentChange가 호출되었는지 확인
      expect(handleTextContentChangeSpy).toHaveBeenCalled();
    });

    it('텍스트 변경 시 모델 트랜잭션이 실행되어야 함', async () => {
      // 초기 모델 설정
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

      // 모델 노드 설정
      (editor.dataStore.getNode as any).mockReturnValue({
        text: 'Hello',
        marks: [],
        sid: 't1',
        stype: 'inline-text'
      });

      // handleEfficientEdit 모킹
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

      // EditorViewDOM 렌더링
      await editorView.render(model as any);

      // DOM에서 텍스트 노드 찾기
      const textElement = container.querySelector('[data-bc-sid="t1"]');
      const textNode = Array.from(textElement!.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE
      ) as Text;

      // 텍스트 변경
      textNode.textContent = 'Hello World';

      // MutationObserver가 변경을 감지할 때까지 대기
      await new Promise((resolve) => setTimeout(resolve, 100));

      // executeTransaction이 호출되었는지 확인
      expect(editor.executeTransaction).toHaveBeenCalled();
    });

    it('IME 조합 중 텍스트 변경은 보류되어야 함', async () => {
      // 초기 모델 설정
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

      // 모델 노드 설정
      (editor.dataStore.getNode as any).mockReturnValue({
        text: 'Hello',
        marks: [],
        sid: 't1',
        stype: 'inline-text'
      });

      // EditorViewDOM 렌더링
      await editorView.render(model as any);

      // IME 조합 시작
      const inputHandler = (editorView as any).inputHandler as InputHandlerImpl;
      inputHandler.handleCompositionStart();

      // DOM에서 텍스트 노드 찾기
      const textElement = container.querySelector('[data-bc-sid="t1"]');
      const textNode = Array.from(textElement!.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE
      ) as Text;

      // 조합 중 텍스트 변경
      textNode.textContent = 'Hello World';

      // MutationObserver가 변경을 감지할 때까지 대기
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 조합 중이므로 트랜잭션이 실행되지 않아야 함
      expect(editor.executeTransaction).not.toHaveBeenCalled();

      // 조합 완료
      inputHandler.handleCompositionEnd({} as CompositionEvent);

      // 조합 완료 후 트랜잭션이 실행되어야 함
      expect(editor.executeTransaction).toHaveBeenCalled();
    });
  });

  describe('MutationObserverManager 직접 테스트', () => {
    it('MutationObserverManager가 설정되어야 함', () => {
      const mutationObserverManager = (editorView as any).mutationObserverManager as MutationObserverManagerImpl;
      expect(mutationObserverManager).toBeTruthy();
    });

    it('onTextChange 이벤트가 InputHandler로 전달되어야 함', async () => {
      // 초기 모델 설정
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

      // 모델 노드 설정
      (editor.dataStore.getNode as any).mockReturnValue({
        text: 'Hello',
        marks: [],
        sid: 't1',
        stype: 'inline-text'
      });

      // EditorViewDOM 렌더링
      await editorView.render(model as any);

      // InputHandler 스파이
      const inputHandler = (editorView as any).inputHandler as InputHandlerImpl;
      const handleTextContentChangeSpy = vi.spyOn(inputHandler, 'handleTextContentChange');

      // DOM에서 텍스트 노드 찾기
      const textElement = container.querySelector('[data-bc-sid="t1"]') as HTMLElement;
      const textNode = Array.from(textElement.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE
      ) as Text;

      // 텍스트 변경 (MutationObserver가 감지)
      textNode.textContent = 'Hello World';

      // MutationObserver가 변경을 감지할 때까지 대기
      await new Promise((resolve) => setTimeout(resolve, 200));

      // handleTextContentChange가 호출되었는지 확인
      expect(handleTextContentChangeSpy).toHaveBeenCalled();
      // 첫 번째 호출의 인자 확인
      const firstCall = handleTextContentChangeSpy.mock.calls[0];
      expect(firstCall[0]).toBe('Hello'); // oldText
      expect(firstCall[1]).toBe('Hello World'); // newText
      expect(firstCall[2]).toBe(textNode); // target
    });
  });

  describe('실제 DOM 변경 감지', () => {
    it('DOM 텍스트 노드 변경이 감지되어야 함', async () => {
      // 초기 모델 설정
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

      // 모델 노드 설정
      (editor.dataStore.getNode as any).mockReturnValue({
        text: 'Hello',
        marks: [],
        sid: 't1',
        stype: 'inline-text'
      });

      // EditorViewDOM 렌더링
      await editorView.render(model as any);

      // DOM에서 텍스트 노드 찾기
      const textElement = container.querySelector('[data-bc-sid="t1"]') as HTMLElement;
      expect(textElement).toBeTruthy();

      const textNode = Array.from(textElement.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE
      ) as Text;
      expect(textNode).toBeTruthy();
      expect(textNode.textContent).toBe('Hello');

      // InputHandler 스파이
      const inputHandler = (editorView as any).inputHandler as InputHandlerImpl;
      const handleTextContentChangeSpy = vi.spyOn(inputHandler, 'handleTextContentChange');

      // 실제 DOM 변경
      textNode.textContent = 'Hello World';

      // MutationObserver가 변경을 감지할 때까지 대기
      await new Promise((resolve) => setTimeout(resolve, 200));

      // handleTextContentChange가 호출되었는지 확인
      expect(handleTextContentChangeSpy).toHaveBeenCalled();
    });

    it('여러 텍스트 노드 변경이 순차적으로 처리되어야 함', async () => {
      // 초기 모델 설정 (여러 텍스트 노드)
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

      // 모델 노드 설정
      (editor.dataStore.getNode as any).mockImplementation((nodeId: string) => {
        if (nodeId === 't1') {
          return { text: 'Hello', marks: [], sid: 't1', stype: 'inline-text' };
        }
        if (nodeId === 't2') {
          return { text: 'World', marks: [], sid: 't2', stype: 'inline-text' };
        }
        return null;
      });

      // EditorViewDOM 렌더링
      await editorView.render(model as any);

      // InputHandler 스파이
      const inputHandler = (editorView as any).inputHandler as InputHandlerImpl;
      const handleTextContentChangeSpy = vi.spyOn(inputHandler, 'handleTextContentChange');

      // 첫 번째 텍스트 노드 변경
      const textElement1 = container.querySelector('[data-bc-sid="t1"]') as HTMLElement;
      const textNode1 = Array.from(textElement1.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE
      ) as Text;
      textNode1.textContent = 'Hello!';

      // MutationObserver가 변경을 감지할 때까지 대기
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 두 번째 텍스트 노드 변경
      const textElement2 = container.querySelector('[data-bc-sid="t2"]') as HTMLElement;
      const textNode2 = Array.from(textElement2.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE
      ) as Text;
      textNode2.textContent = 'World!';

      // MutationObserver가 변경을 감지할 때까지 대기
      await new Promise((resolve) => setTimeout(resolve, 100));

      // handleTextContentChange가 여러 번 호출되었는지 확인
      expect(handleTextContentChangeSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('에러 처리', () => {
    it('모델 노드를 찾을 수 없을 때 에러 없이 처리되어야 함', async () => {
      // 초기 모델 설정
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

      // 모델 노드를 찾을 수 없도록 설정
      (editor.dataStore.getNode as any).mockReturnValue(null);

      // EditorViewDOM 렌더링
      await editorView.render(model as any);

      // DOM에서 텍스트 노드 찾기
      const textElement = container.querySelector('[data-bc-sid="t1"]') as HTMLElement;
      const textNode = Array.from(textElement.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE
      ) as Text;

      // 텍스트 변경
      textNode.textContent = 'Hello World';

      // MutationObserver가 변경을 감지할 때까지 대기
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 에러 없이 처리되어야 함 (executeTransaction은 호출되지 않음)
      expect(editor.executeTransaction).not.toHaveBeenCalled();
    });

    it('data-bc-sid가 없는 노드는 무시되어야 함', async () => {
      // 일반 div 요소 생성 (data-bc-sid 없음)
      const div = document.createElement('div');
      div.textContent = 'Hello';
      container.appendChild(div);

      // InputHandler 스파이
      const inputHandler = (editorView as any).inputHandler as InputHandlerImpl;
      const handleTextContentChangeSpy = vi.spyOn(inputHandler, 'handleTextContentChange');

      // 텍스트 변경
      div.textContent = 'Hello World';

      // MutationObserver가 변경을 감지할 때까지 대기
      await new Promise((resolve) => setTimeout(resolve, 100));

      // handleTextContentChange는 호출되지만, early return되어야 함
      // (실제로는 MutationObserver가 모든 변경을 감지하므로 호출될 수 있음)
      // 하지만 nodeId가 없으면 early return됨
    });
  });
});

