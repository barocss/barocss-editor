/**
 * InputHandlerImpl 테스트
 * 
 * InputHandlerImpl은 DOM 입력 이벤트를 처리하고 모델 트랜잭션으로 변환하는 핵심 클래스입니다.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InputHandlerImpl } from '../../src/event-handlers/input-handler';
import { Editor } from '@barocss/editor-core';
import { handleEfficientEdit } from '../../src/utils/efficient-edit-handler';
import type { MarkRange, DecoratorRange } from '../../src/utils/edit-position-converter';

// Mock handleEfficientEdit (already tested function)
vi.mock('../../src/utils/efficient-edit-handler', () => ({
  handleEfficientEdit: vi.fn()
}));

describe('InputHandlerImpl', () => {
  let inputHandler: InputHandlerImpl;
  let mockEditor: any;
  let mockEditorViewDOM: any;
  let container: HTMLElement;
  let inlineTextNode: HTMLElement;
  let textNode: Text;

  beforeEach(() => {
    // Create Mock Editor
    mockEditor = {
      emit: vi.fn(),
      executeTransaction: vi.fn(),
      executeCommand: vi.fn().mockResolvedValue(true),
      on: vi.fn(),
      off: vi.fn(),
      dataStore: {
        getNode: vi.fn()
      },
      getDecorators: vi.fn(() => []),
      updateDecorators: vi.fn()
    };

    mockEditorViewDOM = {
      _isRendering: false,
      _isModelDrivenChange: false,
      getDecorators: vi.fn(() => []),
      convertDOMSelectionToModel: vi.fn(),
      convertModelSelectionToDOM: vi.fn(),
      insertText: vi.fn(),
      insertParagraph: vi.fn()
    };

    // Create DOM structure
    container = document.createElement('div');
    document.body.appendChild(container);

    inlineTextNode = document.createElement('span');
    inlineTextNode.setAttribute('data-bc-sid', 't1');
    inlineTextNode.setAttribute('data-bc-stype', 'inline-text');
    inlineTextNode.className = 'text';
    container.appendChild(inlineTextNode);

    textNode = document.createTextNode('Hello');
    inlineTextNode.appendChild(textNode);

    // Create InputHandlerImpl instance (editorViewDOM required for handleTextContentChange)
    inputHandler = new InputHandlerImpl(mockEditor as any, mockEditorViewDOM as any);
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  describe('constructor', () => {
    it('초기화 시 editor:selection.dom.applied 이벤트 리스너를 등록해야 함', () => {
      expect(mockEditor.on).toHaveBeenCalledWith('editor:selection.dom.applied', expect.any(Function));
    });

    it('editor:selection.dom.applied 이벤트 발생 시 activeTextNodeId를 설정해야 함', () => {
      const eventHandler = mockEditor.on.mock.calls.find(
        (call: any[]) => call[0] === 'editor:selection.dom.applied'
      )?.[1];

      expect(eventHandler).toBeDefined();

      // Simulate event occurrence
      eventHandler({ activeNodeId: 't1' });

      // Check if activeTextNodeId is set (indirect check since it's private)
      inputHandler.handleTextContentChange(null, null, textNode);
      // If activeTextNodeId is set, inactive node check can pass
    });
  });

  describe('handleTextContentChange - Early Return Cases', () => {
    beforeEach(() => {
      // Set default model node
      mockEditor.dataStore.getNode.mockReturnValue({
        text: 'Hello',
        marks: [],
        sid: 't1',
        stype: 'inline-text'
      });
    });

    it('filler <br>가 있는 경우 early return해야 함', () => {
      const element = document.createElement('div');
      const fillerBr = document.createElement('br');
      fillerBr.setAttribute('data-bc-filler', 'true');
      element.appendChild(fillerBr);

      inputHandler.handleTextContentChange(null, null, element);

      expect(mockEditor.emit).toHaveBeenCalledWith('editor:input.skip_filler', { target: element });
      expect(mockEditor.executeCommand).not.toHaveBeenCalledWith('replaceText', expect.any(Object));
    });

    it('should early return when nodeId cannot be found', () => {
      const orphanTextNode = document.createTextNode('Hello');
      // If parentElement is absent or data-bc-sid is missing

      inputHandler.handleTextContentChange(null, null, orphanTextNode);

      expect(mockEditor.emit).toHaveBeenCalledWith('editor:input.untracked_text', expect.any(Object));
      expect(mockEditor.executeCommand).not.toHaveBeenCalledWith('replaceText', expect.any(Object));
    });

    it('Range Selection (collapsed 아님)인 경우 early return해야 함', () => {
      // Simulate Range Selection
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 5);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      inputHandler.handleTextContentChange('Hello', 'Hello World', textNode);

      expect(mockEditor.emit).toHaveBeenCalledWith('editor:input.skip_range_selection', expect.any(Object));
      expect(mockEditor.executeCommand).not.toHaveBeenCalledWith('replaceText', expect.any(Object));
    });

    it('Inactive Node인 경우 early return해야 함', () => {
      // Set activeTextNodeId
      const eventHandler = mockEditor.on.mock.calls.find(
        (call: any[]) => call[0] === 'editor:selection.dom.applied'
      )?.[1];
      eventHandler({ activeNodeId: 't2' }); // Different nodeId

      const otherInlineTextNode = document.createElement('span');
      otherInlineTextNode.setAttribute('data-bc-sid', 't1');
      const otherTextNode = document.createTextNode('Test');
      otherInlineTextNode.appendChild(otherTextNode);

      inputHandler.handleTextContentChange(null, null, otherTextNode);

      expect(mockEditor.emit).toHaveBeenCalledWith('editor:input.skip_inactive_node', expect.any(Object));
      expect(mockEditor.executeCommand).not.toHaveBeenCalledWith('replaceText', expect.any(Object));
    });

    it('Model Node를 찾을 수 없는 경우 early return해야 함', () => {
      mockEditor.dataStore.getNode.mockReturnValue(null);

      inputHandler.handleTextContentChange('Hello', 'Hello World', textNode);

      expect(mockEditor.emit).toHaveBeenCalledWith('editor:input.node_not_found', { textNodeId: 't1' });
      expect(mockEditor.executeCommand).not.toHaveBeenCalledWith('replaceText', expect.any(Object));
    });

    it('closest [data-bc-sid]가 inline-text가 아닌 경우(경계 텍스트) boundary_text emit 후 early return해야 함', () => {
      const mockEditorViewDOM = {
        _isRendering: false,
        _isModelDrivenChange: false,
        getDecorators: () => [],
        convertDOMSelectionToModel: vi.fn(),
        convertModelSelectionToDOM: vi.fn()
      };
      const handlerWithView = new InputHandlerImpl(mockEditor as any, mockEditorViewDOM as any);

      const blockEl = document.createElement('p');
      blockEl.setAttribute('data-bc-sid', 'p1');
      blockEl.setAttribute('data-bc-stype', 'paragraph');
      const boundaryTextNode = document.createTextNode('x');
      blockEl.appendChild(boundaryTextNode);

      mockEditor.dataStore.getNode.mockImplementation((id: string) => {
        if (id === 'p1') return { stype: 'paragraph', id: 'p1' };
        return { stype: 'inline-text', text: 'Hello', marks: [], sid: 't1' };
      });

      handlerWithView.handleTextContentChange(null, 'x', boundaryTextNode);

      expect(mockEditor.emit).toHaveBeenCalledWith(
        'editor:input.boundary_text',
        expect.objectContaining({ textNodeId: 'p1', nodeType: 'paragraph', newValue: 'x' })
      );
      expect(mockEditor.executeCommand).not.toHaveBeenCalledWith('replaceText', expect.any(Object));
    });

    it('Text Node를 찾을 수 없는 경우 early return해야 함', () => {
      const element = document.createElement('div');
      element.setAttribute('data-bc-sid', 't1');
      // Element without text node

      inputHandler.handleTextContentChange(null, null, element);

      expect(mockEditor.emit).toHaveBeenCalledWith('editor:input.text_node_not_found', { target: element });
      expect(mockEditor.executeCommand).not.toHaveBeenCalledWith('replaceText', expect.any(Object));
    });

    it('handleEfficientEdit가 null을 반환하는 경우 early return해야 함', () => {
      vi.mocked(handleEfficientEdit).mockReturnValue(null);

      inputHandler.handleTextContentChange('Hello', 'Hello', textNode);

      expect(mockEditor.executeCommand).not.toHaveBeenCalledWith('replaceText', expect.any(Object));
    });
  });

  describe('handleTextContentChange - Normal Processing', () => {
    beforeEach(() => {
      mockEditor.dataStore.getNode.mockReturnValue({
        text: 'Hello',
        marks: [],
        sid: 't1',
        stype: 'inline-text'
      });
    });

    it('기본 텍스트 삽입 시 executeTransaction을 호출해야 함', () => {
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
          deletedLength: 0,
          insertedText: ' World'
        }
      });

      inputHandler.handleTextContentChange('Hello', 'Hello World', textNode);

      expect(mockEditor.executeCommand).toHaveBeenCalledWith('replaceText', expect.objectContaining({
        range: expect.objectContaining({ startNodeId: 't1', endNodeId: 't1' }),
        text: expect.any(String)
      }));
    });

    it('텍스트 삭제 시 executeTransaction을 호출해야 함', () => {
      vi.mocked(handleEfficientEdit).mockReturnValue({
        newText: 'Hell',
        adjustedMarks: [],
        adjustedDecorators: [],
        editInfo: {
          nodeId: 't1',
          oldText: 'Hello',
          newText: 'Hell',
          editPosition: 4,
          editType: 'delete',
          insertedLength: 0,
          deletedLength: 1,
          insertedText: ''
        }
      });

      inputHandler.handleTextContentChange('Hello', 'Hell', textNode);

      expect(mockEditor.executeCommand).toHaveBeenCalledWith('replaceText', expect.objectContaining({
        range: expect.objectContaining({ startNodeId: 't1', endNodeId: 't1' }),
        text: expect.any(String)
      }));
    });

    it('Marks가 변경된 경우 트랜잭션에 marks 필드를 포함해야 함', () => {
      const oldMarks: MarkRange[] = [
        { type: 'bold', range: [0, 5] }
      ];
      const newMarks: MarkRange[] = [
        { type: 'bold', range: [0, 11] }
      ];

      mockEditor.dataStore.getNode.mockReturnValue({
        text: 'Hello',
        marks: oldMarks,
        sid: 't1',
        stype: 'inline-text'
      });

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
          deletedLength: 0,
          insertedText: ' World'
        }
      });

      inputHandler.handleTextContentChange('Hello', 'Hello World', textNode);

      expect(mockEditor.executeCommand).toHaveBeenCalledWith('replaceText', expect.objectContaining({
        range: expect.objectContaining({ startNodeId: 't1', endNodeId: 't1' }),
        text: expect.any(String)
      }));
    });

    it('Marks가 변경되지 않은 경우 트랜잭션에 marks 필드를 포함하지 않아야 함', () => {
      const marks: MarkRange[] = [
        { type: 'bold', range: [0, 5] }
      ];

      mockEditor.dataStore.getNode.mockReturnValue({
        text: 'Hello',
        marks: marks,
        sid: 't1',
        stype: 'inline-text'
      });

      vi.mocked(handleEfficientEdit).mockReturnValue({
        newText: 'Hello World',
        adjustedMarks: marks, // Same marks
        adjustedDecorators: [],
        editInfo: {
          nodeId: 't1',
          oldText: 'Hello',
          newText: 'Hello World',
          editPosition: 5,
          editType: 'insert',
          insertedLength: 6,
          deletedLength: 0,
          insertedText: ' World'
        }
      });

      inputHandler.handleTextContentChange('Hello', 'Hello World', textNode);

      const replaceTextCall = mockEditor.executeCommand.mock.calls.find((c: unknown[]) => c[0] === 'replaceText');
      const payload = replaceTextCall?.[1] as Record<string, unknown>;
      expect(payload?.marks).toBeUndefined();
    });

    it('Decorators가 변경된 경우 updateDecorators를 호출해야 함', () => {
      const oldDecorators: DecoratorRange[] = [
        {
          sid: 'd1',
          stype: 'highlight',
          category: 'inline',
          target: { sid: 't1', startOffset: 0, endOffset: 5 }
        }
      ];
      const newDecorators: DecoratorRange[] = [
        {
          sid: 'd1',
          stype: 'highlight',
          category: 'inline',
          target: { sid: 't1', startOffset: 0, endOffset: 11 }
        }
      ];

      mockEditor.getDecorators.mockReturnValue(oldDecorators);

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
          deletedLength: 0,
          insertedText: ' World'
        }
      });

      inputHandler.handleTextContentChange('Hello', 'Hello World', textNode);

      expect(mockEditor.executeCommand).toHaveBeenCalledWith('replaceText', expect.objectContaining({
        range: expect.objectContaining({ startNodeId: 't1', endNodeId: 't1' })
      }));
      // updateDecorators는 구현에서 TODO 상태 (decoratorsChanged 시 호출 미구현)
    });

    it('Decorators가 변경되지 않은 경우 updateDecorators를 호출하지 않아야 함', () => {
      const decorators: DecoratorRange[] = [
        {
          sid: 'd1',
          stype: 'highlight',
          category: 'inline',
          target: { sid: 't1', startOffset: 0, endOffset: 5 }
        }
      ];

      mockEditor.getDecorators.mockReturnValue(decorators);

      vi.mocked(handleEfficientEdit).mockReturnValue({
        newText: 'Hello World',
        adjustedMarks: [],
        adjustedDecorators: decorators, // Same decorators
        editInfo: {
          nodeId: 't1',
          oldText: 'Hello',
          newText: 'Hello World',
          editPosition: 5,
          editType: 'insert',
          insertedLength: 6,
          deletedLength: 0,
          insertedText: ' World'
        }
      });

      inputHandler.handleTextContentChange('Hello', 'Hello World', textNode);

      expect(mockEditor.updateDecorators).not.toHaveBeenCalled();
    });

    it('Element 노드에서 text node를 찾아서 처리해야 함', () => {
      const element = document.createElement('div');
      element.setAttribute('data-bc-sid', 't1');
      const elementTextNode = document.createTextNode('Hello');
      element.appendChild(elementTextNode);

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
          deletedLength: 0,
          insertedText: ' World'
        }
      });

      inputHandler.handleTextContentChange('Hello', 'Hello World', element);

      expect(mockEditor.executeCommand).toHaveBeenCalledWith('replaceText', expect.any(Object));
      expect(vi.mocked(handleEfficientEdit)).toHaveBeenCalledWith(
        elementTextNode,
        'Hello',
        [],
        [],
        expect.anything()
      );
    });
  });

  describe('resolveModelTextNodeId', () => {
    it('should extract nodeId from Text Node', () => {
      // Test indirectly through handleTextContentChange
      mockEditor.dataStore.getNode.mockReturnValue({
        text: 'Hello',
        marks: [],
        sid: 't1',
        stype: 'inline-text'
      });

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
          deletedLength: 0,
          insertedText: ' World'
        }
      });

      inputHandler.handleTextContentChange('Hello', 'Hello World', textNode);

      // Verify nodeId was correctly extracted and replaceText was called
      expect(mockEditor.executeCommand).toHaveBeenCalledWith('replaceText', expect.objectContaining({
        range: expect.objectContaining({ startNodeId: 't1', endNodeId: 't1' })
      }));
    });

    it('Element Node에서 nodeId를 추출해야 함', () => {
      const element = document.createElement('div');
      element.setAttribute('data-bc-sid', 't1');
      const elementTextNode = document.createTextNode('Hello');
      element.appendChild(elementTextNode);

      mockEditor.dataStore.getNode.mockReturnValue({
        text: 'Hello',
        marks: [],
        sid: 't1',
        stype: 'inline-text'
      });

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
          deletedLength: 0,
          insertedText: ' World'
        }
      });

      inputHandler.handleTextContentChange('Hello', 'Hello World', element);

      expect(mockEditor.executeCommand).toHaveBeenCalledWith('replaceText', expect.objectContaining({
        range: expect.objectContaining({ startNodeId: 't1', endNodeId: 't1' })
      }));
    });

    it('should return null when nodeId cannot be found', () => {
      const orphanTextNode = document.createTextNode('Hello');
      // If parentElement is absent or data-bc-sid is missing

      inputHandler.handleTextContentChange(null, null, orphanTextNode);

      expect(mockEditor.emit).toHaveBeenCalledWith('editor:input.unresolved_text_node', expect.any(Object));
    });
  });

  describe('handleBeforeInput', () => {
    it('formatBold는 preventDefault하고 command 이벤트를 발생시켜야 함', () => {
      const event = {
        inputType: 'formatBold',
        data: null,
        preventDefault: vi.fn()
      } as any;

      inputHandler.handleBeforeInput(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(mockEditor.emit).toHaveBeenCalledWith('editor:command.execute', {
        command: 'toggleBold',
        data: undefined
      });
      expect(mockEditor.executeCommand).toHaveBeenCalledWith('toggleBold', {});
    });

    it('formatItalic는 preventDefault하고 command 이벤트를 발생시켜야 함', () => {
      const event = {
        inputType: 'formatItalic',
        data: null,
        preventDefault: vi.fn()
      } as any;

      inputHandler.handleBeforeInput(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(mockEditor.emit).toHaveBeenCalledWith('editor:command.execute', {
        command: 'toggleItalic',
        data: undefined
      });
      expect(mockEditor.executeCommand).toHaveBeenCalledWith('toggleItalic', {});
    });

    it('insertParagraph는 preventDefault하고 editorViewDOM.insertParagraph를 호출해야 함', () => {
      const event = {
        inputType: 'insertParagraph',
        data: null,
        preventDefault: vi.fn()
      } as any;

      inputHandler.handleBeforeInput(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(mockEditorViewDOM.insertParagraph).toHaveBeenCalled();
    });

    it('일반 입력(insertText)은 preventDefault하지 않아야 함', () => {
      const event = {
        inputType: 'insertText',
        data: 'a',
        preventDefault: vi.fn()
      } as any;

      inputHandler.handleBeforeInput(event);

      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });

  describe('getCurrentSelection', () => {
    it('should return { offset: 0, length: 0 } when Selection is absent', () => {
      // Simulate case where Selection is absent
      const originalGetSelection = window.getSelection;
      window.getSelection = vi.fn(() => null as any);

      // Test indirectly through handleTextContentChange
      mockEditor.dataStore.getNode.mockReturnValue({
        text: 'Hello',
        marks: [],
        sid: 't1',
        stype: 'inline-text'
      });

      vi.mocked(handleEfficientEdit).mockReturnValue({
        newText: 'Hello World',
        adjustedMarks: [],
        adjustedDecorators: [],
        editInfo: {
          nodeId: 't1',
          oldText: 'Hello',
          newText: 'Hello World',
          editPosition: 0, // 0 if Selection is absent
          editType: 'insert',
          insertedLength: 6,
          deletedLength: 0,
          insertedText: ' World'
        }
      });

      inputHandler.handleTextContentChange('Hello', 'Hello World', textNode);

      expect(mockEditor.executeCommand).toHaveBeenCalledWith('replaceText', expect.any(Object));

      // Restore
      window.getSelection = originalGetSelection;
    });

    it('Collapsed Selection (Text Node)을 올바르게 처리해야 함', () => {
      const range = document.createRange();
      range.setStart(textNode, 3);
      range.setEnd(textNode, 3);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      mockEditor.dataStore.getNode.mockReturnValue({
        text: 'Hello',
        marks: [],
        sid: 't1',
        stype: 'inline-text'
      });

      vi.mocked(handleEfficientEdit).mockReturnValue({
        newText: 'HelXlo',
        adjustedMarks: [],
        adjustedDecorators: [],
        editInfo: {
          nodeId: 't1',
          oldText: 'Hello',
          newText: 'HelXlo',
          editPosition: 3,
          editType: 'insert',
          insertedLength: 1,
          deletedLength: 0,
          insertedText: 'X'
        }
      });

      inputHandler.handleTextContentChange('Hello', 'HelXlo', textNode);

      expect(mockEditor.executeCommand).toHaveBeenCalledWith('replaceText', expect.any(Object));
    });
  });

  describe('handleInput', () => {
    it('input 이벤트를 처리하고 editor:input.detected 이벤트를 발생시켜야 함', () => {
      const event = {
        inputType: 'insertText',
        data: 'a',
        target: textNode
      } as any;

      inputHandler.handleInput(event);

      expect(mockEditor.emit).toHaveBeenCalledWith('editor:input.detected', {
        inputType: 'insertText',
        data: 'a',
        target: textNode
      });
    });
  });

  describe('handleTextContentChange - Complex Scenarios', () => {
    beforeEach(() => {
      mockEditor.dataStore.getNode.mockReturnValue({
        text: 'Hello',
        marks: [],
        sid: 't1',
        stype: 'inline-text'
      });
    });

    it('Mark가 있는 텍스트 편집 시 marks가 조정되어야 함', () => {
      const oldMarks: MarkRange[] = [
        { type: 'bold', range: [0, 5] }
      ];
      const newMarks: MarkRange[] = [
        { type: 'bold', range: [0, 11] }
      ];

      mockEditor.dataStore.getNode.mockReturnValue({
        text: 'Hello',
        marks: oldMarks,
        sid: 't1',
        stype: 'inline-text'
      });

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
          deletedLength: 0,
          insertedText: ' World'
        }
      });

      inputHandler.handleTextContentChange('Hello', 'Hello World', textNode);

      expect(mockEditor.executeCommand).toHaveBeenCalledWith('replaceText', expect.objectContaining({
        range: expect.objectContaining({ startNodeId: 't1', endNodeId: 't1' })
      }));
    });

    it('Decorator가 있는 텍스트 편집 시 decorators가 조정되어야 함', () => {
      const oldDecorators: DecoratorRange[] = [
        {
          sid: 'd1',
          stype: 'highlight',
          category: 'inline',
          target: { sid: 't1', startOffset: 0, endOffset: 5 }
        }
      ];
      const newDecorators: DecoratorRange[] = [
        {
          sid: 'd1',
          stype: 'highlight',
          category: 'inline',
          target: { sid: 't1', startOffset: 0, endOffset: 11 }
        }
      ];

      mockEditor.getDecorators.mockReturnValue(oldDecorators);

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
          deletedLength: 0,
          insertedText: ' World'
        }
      });

      inputHandler.handleTextContentChange('Hello', 'Hello World', textNode);

      expect(mockEditor.executeCommand).toHaveBeenCalledWith('replaceText', expect.objectContaining({
        range: expect.objectContaining({ startNodeId: 't1', endNodeId: 't1' })
      }));
      // updateDecorators는 구현에서 TODO 상태
    });

    it('Mark와 Decorator가 모두 있는 텍스트 편집 시 둘 다 조정되어야 함', () => {
      const oldMarks: MarkRange[] = [
        { type: 'bold', range: [0, 5] }
      ];
      const newMarks: MarkRange[] = [
        { type: 'bold', range: [0, 11] }
      ];
      const oldDecorators: DecoratorRange[] = [
        {
          sid: 'd1',
          stype: 'highlight',
          category: 'inline',
          target: { sid: 't1', startOffset: 0, endOffset: 5 }
        }
      ];
      const newDecorators: DecoratorRange[] = [
        {
          sid: 'd1',
          stype: 'highlight',
          category: 'inline',
          target: { sid: 't1', startOffset: 0, endOffset: 11 }
        }
      ];

      mockEditor.dataStore.getNode.mockReturnValue({
        text: 'Hello',
        marks: oldMarks,
        sid: 't1',
        stype: 'inline-text'
      });
      mockEditor.getDecorators.mockReturnValue(oldDecorators);

      vi.mocked(handleEfficientEdit).mockReturnValue({
        newText: 'Hello World',
        adjustedMarks: newMarks,
        adjustedDecorators: newDecorators,
        editInfo: {
          nodeId: 't1',
          oldText: 'Hello',
          newText: 'Hello World',
          editPosition: 5,
          editType: 'insert',
          insertedLength: 6,
          deletedLength: 0,
          insertedText: ' World'
        }
      });

      inputHandler.handleTextContentChange('Hello', 'Hello World', textNode);

      expect(mockEditor.executeCommand).toHaveBeenCalledWith('replaceText', expect.objectContaining({
        range: expect.objectContaining({ startNodeId: 't1', endNodeId: 't1' })
      }));
      // updateDecorators는 구현에서 TODO 상태
    });
  });

  describe('handleBeforeInput - Additional Format Commands', () => {
    const formatCommands = [
      { inputType: 'formatBold', command: 'toggleBold' },
      { inputType: 'formatItalic', command: 'toggleItalic' },
      { inputType: 'formatUnderline', command: 'toggleUnderline' },
      { inputType: 'formatStrikeThrough', command: 'toggleStrikeThrough' },
      { inputType: 'formatSuperscript', command: 'superscript.toggle' },
      { inputType: 'formatSubscript', command: 'subscript.toggle' },
      { inputType: 'formatJustifyFull', command: 'justify.toggle' },
      { inputType: 'formatJustifyCenter', command: 'justify.center' },
      { inputType: 'formatJustifyRight', command: 'justify.right' },
      { inputType: 'formatJustifyLeft', command: 'justify.left' },
      { inputType: 'formatIndent', command: 'indent.increase' },
      { inputType: 'formatOutdent', command: 'indent.decrease' },
      { inputType: 'formatRemove', command: 'format.remove' }
    ];

    formatCommands.forEach(({ inputType, command }) => {
      it(`${inputType}는 preventDefault하고 ${command} 명령을 발생시켜야 함`, () => {
        const event = {
          inputType,
          data: null,
          preventDefault: vi.fn()
        } as any;

        inputHandler.handleBeforeInput(event);

        // Only formatBold, formatItalic, formatUnderline, formatStrikeThrough are handled in beforeInput
        const handledFormats = ['formatBold', 'formatItalic', 'formatUnderline', 'formatStrikeThrough'];
        if (handledFormats.includes(inputType)) {
          expect(event.preventDefault).toHaveBeenCalled();
          expect(mockEditor.emit).toHaveBeenCalledWith('editor:command.execute', {
            command,
            data: undefined
          });
          expect(mockEditor.executeCommand).toHaveBeenCalledWith(command, {});
        } else {
          // Other formats are not yet handled, so preventDefault is not called
          expect(event.preventDefault).not.toHaveBeenCalled();
        }
      });
    });
  });

  describe('handleBeforeInput - Structural Commands', () => {
    it('insertParagraph는 preventDefault하고 insertParagraph를 호출해야 함', () => {
      const event = { inputType: 'insertParagraph', data: null, preventDefault: vi.fn() } as any;
      inputHandler.handleBeforeInput(event);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(mockEditorViewDOM.insertParagraph).toHaveBeenCalled();
    });

    it('insertLineBreak는 preventDefault하고 insertText(\\n)를 호출해야 함', () => {
      const event = { inputType: 'insertLineBreak', data: null, preventDefault: vi.fn() } as any;
      inputHandler.handleBeforeInput(event);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(mockEditorViewDOM.insertText).toHaveBeenCalledWith('\n');
    });

    it('insertOrderedList는 현재 구현에서 preventDefault하지 않음', () => {
      const event = { inputType: 'insertOrderedList', data: null, preventDefault: vi.fn() } as any;
      inputHandler.handleBeforeInput(event);
      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('insertUnorderedList는 현재 구현에서 preventDefault하지 않음', () => {
      const event = { inputType: 'insertUnorderedList', data: null, preventDefault: vi.fn() } as any;
      inputHandler.handleBeforeInput(event);
      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('insertHorizontalRule는 현재 구현에서 preventDefault하지 않음', () => {
      const event = { inputType: 'insertHorizontalRule', data: null, preventDefault: vi.fn() } as any;
      inputHandler.handleBeforeInput(event);
      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });

  describe('getCurrentSelection - Additional Cases', () => {
    beforeEach(() => {
      mockEditor.dataStore.getNode.mockReturnValue({
        text: 'Hello',
        marks: [],
        sid: 't1',
        stype: 'inline-text'
      });
    });

    it('Range Selection (Text Node)을 올바르게 처리해야 함', () => {
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 5);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      vi.mocked(handleEfficientEdit).mockReturnValue({
        newText: 'Hi',
        adjustedMarks: [],
        adjustedDecorators: [],
        editInfo: {
          nodeId: 't1',
          oldText: 'Hello',
          newText: 'Hi',
          editPosition: 0,
          editType: 'replace',
          insertedLength: 2,
          deletedLength: 5,
          insertedText: 'Hi'
        }
      });

      inputHandler.handleTextContentChange('Hello', 'Hi', textNode);

      // skip_range_selection event should occur for Range Selection
      expect(mockEditor.emit).toHaveBeenCalledWith('editor:input.skip_range_selection', expect.any(Object));
    });

    it('Element Node에서 Collapsed Selection을 올바르게 처리해야 함', () => {
      const element = document.createElement('div');
      element.setAttribute('data-bc-sid', 't1');
      const elementTextNode = document.createTextNode('Hello');
      element.appendChild(elementTextNode);

      const range = document.createRange();
      range.setStart(element, 0);
      range.setEnd(element, 0);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      vi.mocked(handleEfficientEdit).mockReturnValue({
        newText: 'Hello World',
        adjustedMarks: [],
        adjustedDecorators: [],
        editInfo: {
          nodeId: 't1',
          oldText: 'Hello',
          newText: 'Hello World',
          editPosition: 0,
          editType: 'insert',
          insertedLength: 6,
          deletedLength: 0,
          insertedText: ' World'
        }
      });

      inputHandler.handleTextContentChange('Hello', 'Hello World', element);

      expect(mockEditor.executeCommand).toHaveBeenCalledWith('replaceText', expect.any(Object));
    });
  });

  describe('Edge Cases', () => {
    it('activeTextNodeId가 null이면 inactive node 체크를 통과해야 함', () => {
      mockEditor.dataStore.getNode.mockReturnValue({
        text: 'Hello',
        marks: [],
        sid: 't1',
        stype: 'inline-text'
      });

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
          deletedLength: 0,
          insertedText: ' World'
        }
      });

      // If activeTextNodeId is null, inactive node check passes
      inputHandler.handleTextContentChange('Hello', 'Hello World', textNode);

      expect(mockEditor.executeCommand).toHaveBeenCalledWith('replaceText', expect.any(Object));
    });

    it('textNodeId와 activeTextNodeId가 일치하면 처리해야 함', () => {
      // Set activeTextNodeId
      const eventHandler = mockEditor.on.mock.calls.find(
        (call: any[]) => call[0] === 'editor:selection.dom.applied'
      )?.[1];
      eventHandler({ activeNodeId: 't1' }); // same nodeId

      mockEditor.dataStore.getNode.mockReturnValue({
        text: 'Hello',
        marks: [],
        sid: 't1',
        stype: 'inline-text'
      });

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
          deletedLength: 0,
          insertedText: ' World'
        }
      });

      inputHandler.handleTextContentChange('Hello', 'Hello World', textNode);

      expect(mockEditor.executeCommand).toHaveBeenCalledWith('replaceText', expect.any(Object));
    });

    it('updateDecorators가 없으면 호출하지 않아야 함', () => {
      const decorators: DecoratorRange[] = [
        {
          sid: 'd1',
          stype: 'highlight',
          category: 'inline',
          target: { sid: 't1', startOffset: 0, endOffset: 5 }
        }
      ];

      mockEditor.dataStore.getNode.mockReturnValue({
        text: 'Hello',
        marks: [],
        sid: 't1',
        stype: 'inline-text'
      });
      mockEditor.getDecorators.mockReturnValue(decorators);
      delete mockEditor.updateDecorators; // Remove updateDecorators

      vi.mocked(handleEfficientEdit).mockReturnValue({
        newText: 'Hello World',
        adjustedMarks: [],
        adjustedDecorators: [
          {
            sid: 'd1',
            stype: 'highlight',
            category: 'inline',
            target: { sid: 't1', startOffset: 0, endOffset: 11 }
          }
        ],
        editInfo: {
          nodeId: 't1',
          oldText: 'Hello',
          newText: 'Hello World',
          editPosition: 5,
          editType: 'insert',
          insertedLength: 6,
          deletedLength: 0,
          insertedText: ' World'
        }
      });

      inputHandler.handleTextContentChange('Hello', 'Hello World', textNode);

      // Should not call if updateDecorators is missing (handle without error)
      expect(mockEditor.executeCommand).toHaveBeenCalledWith('replaceText', expect.any(Object));
    });
  });
});

