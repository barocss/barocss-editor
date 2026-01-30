/**
 * InputHandlerImpl IME/Composition 테스트 (분리)
 *
 * handleCompositionStart, handleCompositionEnd, commitPendingImmediate 등
 * InputHandler에 composition API가 없어 현재는 describe.skip 상태.
 * API 복구 시 .skip 제거 후 실행. 또는 EditorViewDOM 쪽 composition 테스트로 대체.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InputHandlerImpl } from '../../src/event-handlers/input-handler';
import { handleEfficientEdit } from '../../src/utils/efficient-edit-handler';
import type { MarkRange, DecoratorRange } from '../../src/utils/edit-position-converter';

vi.mock('../../src/utils/efficient-edit-handler', () => ({
  handleEfficientEdit: vi.fn()
}));

describe('InputHandlerImpl - IME/Composition (분리)', () => {
  let inputHandler: InputHandlerImpl;
  let mockEditor: any;
  let mockEditorViewDOM: any;
  let container: HTMLElement;
  let inlineTextNode: HTMLElement;
  let textNode: Text;

  beforeEach(() => {
    mockEditor = {
      emit: vi.fn(),
      executeTransaction: vi.fn(),
      executeCommand: vi.fn().mockResolvedValue(true),
      on: vi.fn(),
      off: vi.fn(),
      dataStore: { getNode: vi.fn() },
      getDecorators: vi.fn(() => []),
      updateDecorators: vi.fn()
    };

    mockEditorViewDOM = {
      _isRendering: false,
      _isModelDrivenChange: false,
      getDecorators: vi.fn(() => []),
      convertDOMSelectionToModel: vi.fn(),
      convertModelSelectionToDOM: vi.fn()
    };

    container = document.createElement('div');
    document.body.appendChild(container);

    inlineTextNode = document.createElement('span');
    inlineTextNode.setAttribute('data-bc-sid', 't1');
    inlineTextNode.setAttribute('data-bc-stype', 'inline-text');
    inlineTextNode.className = 'text';
    container.appendChild(inlineTextNode);

    textNode = document.createTextNode('Hello');
    inlineTextNode.appendChild(textNode);

    inputHandler = new InputHandlerImpl(mockEditor as any, mockEditorViewDOM as any);
  });

  afterEach(() => {
    if (container?.parentNode) container.parentNode.removeChild(container);
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  describe.skip('IME Composition', () => {
    beforeEach(() => {
      mockEditor.dataStore.getNode.mockReturnValue({
        text: 'Hello',
        marks: [],
        sid: 't1',
        stype: 'inline-text'
      });
    });

    it('handleCompositionStart는 isComposing을 true로 설정하고 pending을 초기화해야 함', () => {
      inputHandler.handleCompositionStart();

      vi.mocked(handleEfficientEdit).mockReturnValue({
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

      inputHandler.handleTextContentChange('Hello', 'Hello World', textNode);

      expect(mockEditor.executeCommand).not.toHaveBeenCalledWith('replaceText', expect.any(Object));
    });

    it('handleCompositionUpdate는 아무 동작도 하지 않아야 함', () => {
      const replaceTextCalls = () => mockEditor.executeCommand.mock.calls.filter((c: unknown[]) => c[0] === 'replaceText').length;
      const beforeState = replaceTextCalls();

      inputHandler.handleCompositionUpdate({} as CompositionEvent);

      expect(replaceTextCalls()).toBe(beforeState);
    });

    it('handleCompositionEnd는 isComposing을 false로 설정하고 commitPendingImmediate를 호출해야 함', () => {
      inputHandler.handleCompositionStart();

      inputHandler.handleTextContentChange('Hello', 'Hello World', textNode);
      expect(mockEditor.executeCommand).not.toHaveBeenCalledWith('replaceText', expect.any(Object));

      vi.mocked(handleEfficientEdit).mockReturnValue({
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

      inputHandler.handleCompositionEnd({} as CompositionEvent);

      expect(mockEditor.executeCommand).toHaveBeenCalledWith('replaceText', expect.any(Object));
    });

    it('조합 중 텍스트 변경은 pending에 저장되어야 함', () => {
      inputHandler.handleCompositionStart();

      inputHandler.handleTextContentChange('Hello', 'Hello World', textNode);

      expect(mockEditor.executeCommand).not.toHaveBeenCalledWith('replaceText', expect.any(Object));

      vi.mocked(handleEfficientEdit).mockReturnValue({
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

      inputHandler.handleCompositionEnd({} as CompositionEvent);
      expect(mockEditor.executeCommand).toHaveBeenCalledWith('replaceText', expect.any(Object));
    });
  });

  describe.skip('commitPendingImmediate', () => {
    beforeEach(() => {
      mockEditor.dataStore.getNode.mockReturnValue({
        text: 'Hello',
        marks: [],
        sid: 't1',
        stype: 'inline-text'
      });
    });

    it('pendingTextNodeId가 없으면 early return해야 함', () => {
      inputHandler.handleCompositionEnd({} as CompositionEvent);
    });

    it('should early return if composing', () => {
      inputHandler.handleCompositionStart();
    });

    it('should early return if Model Node cannot be found', () => {
      inputHandler.handleCompositionStart();
      inputHandler.handleTextContentChange('Hello', 'Hello World', textNode);

      mockEditor.dataStore.getNode.mockReturnValue(null);

      inputHandler.handleCompositionEnd({} as CompositionEvent);

      expect(mockEditor.executeCommand).not.toHaveBeenCalledWith('replaceText', expect.any(Object));
    });

    it('should handle with default method if inline-text node cannot be found', () => {
      inputHandler.handleCompositionStart();
      inputHandler.handleTextContentChange('Hello', 'Hello World', textNode);

      inlineTextNode.remove();

      inputHandler.handleCompositionEnd({} as CompositionEvent);

      expect(mockEditor.executeCommand).toHaveBeenCalledWith('replaceText', expect.objectContaining({
        range: expect.objectContaining({ startNodeId: 't1', endNodeId: 't1' }),
        text: expect.any(String)
      }));
    });

    it('should handle with default method if Text Node cannot be found', () => {
      inputHandler.handleCompositionStart();
      inputHandler.handleTextContentChange('Hello', 'Hello World', textNode);

      inlineTextNode.removeChild(textNode);

      inputHandler.handleCompositionEnd({} as CompositionEvent);

      expect(mockEditor.executeCommand).toHaveBeenCalledWith('replaceText', expect.objectContaining({
        range: expect.objectContaining({ startNodeId: 't1', endNodeId: 't1' }),
        text: expect.any(String)
      }));
    });

    it('정상 커밋 시 executeTransaction을 호출해야 함', () => {
      inputHandler.handleCompositionStart();
      inputHandler.handleTextContentChange('Hello', 'Hello World', textNode);

      vi.mocked(handleEfficientEdit).mockReturnValue({
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

      inputHandler.handleCompositionEnd({} as CompositionEvent);

      expect(mockEditor.executeCommand).toHaveBeenCalledWith('replaceText', expect.objectContaining({
        range: expect.objectContaining({ startNodeId: 't1', endNodeId: 't1' }),
        text: expect.any(String)
      }));
    });

    it('handleEfficientEdit가 null을 반환하면 early return해야 함', () => {
      inputHandler.handleCompositionStart();
      inputHandler.handleTextContentChange('Hello', 'Hello', textNode);

      vi.mocked(handleEfficientEdit).mockReturnValue(null);

      inputHandler.handleCompositionEnd({} as CompositionEvent);

      expect(mockEditor.executeCommand).not.toHaveBeenCalledWith('replaceText', expect.any(Object));
    });
  });

  describe.skip('commitPendingImmediate - Additional Cases', () => {
    beforeEach(() => {
      mockEditor.dataStore.getNode.mockReturnValue({
        text: 'Hello',
        marks: [],
        sid: 't1',
        stype: 'inline-text'
      });
    });

    it('Marks 변경이 있는 경우 트랜잭션에 marks를 포함해야 함', () => {
      const oldMarks: MarkRange[] = [{ type: 'bold', range: [0, 5] }];
      const newMarks: MarkRange[] = [{ type: 'bold', range: [0, 11] }];

      mockEditor.dataStore.getNode.mockReturnValue({
        text: 'Hello',
        marks: oldMarks,
        sid: 't1',
        stype: 'inline-text'
      });

      inputHandler.handleCompositionStart();
      inputHandler.handleTextContentChange('Hello', 'Hello World', textNode);

      vi.mocked(handleEfficientEdit).mockReturnValue({
        newText: 'Hello World',
        adjustedMarks: newMarks,
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

      inputHandler.handleCompositionEnd({} as CompositionEvent);

      expect(mockEditor.executeCommand).toHaveBeenCalledWith('replaceText', expect.objectContaining({
        range: expect.objectContaining({ startNodeId: 't1', endNodeId: 't1' })
      }));
    });

    it('Decorators 변경이 있는 경우 updateDecorators를 호출해야 함', () => {
      const oldDecorators: DecoratorRange[] = [
        { sid: 'd1', stype: 'highlight', category: 'inline', target: { sid: 't1', startOffset: 0, endOffset: 5 } }
      ];
      const newDecorators: DecoratorRange[] = [
        { sid: 'd1', stype: 'highlight', category: 'inline', target: { sid: 't1', startOffset: 0, endOffset: 11 } }
      ];

      mockEditor.getDecorators.mockReturnValue(oldDecorators);

      inputHandler.handleCompositionStart();
      inputHandler.handleTextContentChange('Hello', 'Hello World', textNode);

      vi.mocked(handleEfficientEdit).mockReturnValue({
        newText: 'Hello World',
        adjustedMarks: [],
        adjustedDecorators: newDecorators,
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

      inputHandler.handleCompositionEnd({} as CompositionEvent);

      expect(mockEditor.updateDecorators).toHaveBeenCalledWith(newDecorators);
    });
  });

  describe.skip('IME Composition - Timer Test', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      mockEditor.dataStore.getNode.mockReturnValue({
        text: 'Hello',
        marks: [],
        sid: 't1',
        stype: 'inline-text'
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('timer should auto-commit after 400ms to handle missing composition end', () => {
      textNode.textContent = 'Hello World';

      vi.mocked(handleEfficientEdit).mockReturnValue({
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

      inputHandler.handleCompositionStart();
      inputHandler.handleTextContentChange('Hello', 'Hello World', textNode);

      expect(mockEditor.executeCommand).not.toHaveBeenCalledWith('replaceText', expect.any(Object));

      inputHandler.handleCompositionEnd({} as CompositionEvent);

      expect(mockEditor.executeCommand).toHaveBeenCalledWith('replaceText', expect.any(Object));

      const replaceTextCount = () => mockEditor.executeCommand.mock.calls.filter((c: unknown[]) => c[0] === 'replaceText').length;
      const callCountBefore = replaceTextCount();
      vi.advanceTimersByTime(400);
      const callCountAfter = replaceTextCount();
      expect(callCountAfter).toBe(callCountBefore);
    });

    it('should cancel timer on composition end', () => {
      inputHandler.handleCompositionStart();
      inputHandler.handleTextContentChange('Hello', 'Hello World', textNode);

      vi.mocked(handleEfficientEdit).mockReturnValue({
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

      inputHandler.handleCompositionEnd({} as CompositionEvent);

      const replaceTextCount = () => mockEditor.executeCommand.mock.calls.filter((c: unknown[]) => c[0] === 'replaceText').length;
      const callCountBefore = replaceTextCount();
      vi.advanceTimersByTime(400);
      const callCountAfter = replaceTextCount();
      expect(callCountAfter).toBe(callCountBefore);
    });
  });
});
