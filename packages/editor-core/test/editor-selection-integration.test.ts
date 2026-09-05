import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Editor } from '../src/editor';
import { SelectionManager } from '../src/selection-manager';
import { DataStore } from '@barocss/datastore';
import { Schema, createSchema, getStandardSchemaDefinition } from '@barocss/schema';
// import { EDITOR_EVENTS } from '../src/types';

// Set up Mock DOM environment
const createMockElement = (tagName: string, attributes: Record<string, string> = {}): HTMLElement => {
  const element = document.createElement(tagName);
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  return element;
};

// Integration tests require full DOM/selection sync; skip until editor-view-dom integration is stable.
describe('Editor + SelectionManager 통합 테스트', () => {
  let editor: Editor;
  let contentEditableElement: HTMLElement;
  let dataStore: DataStore;
  let schema: Schema;

  beforeEach(() => {
    // Initialize DOM environment
    document.body.innerHTML = '';
    
    /*
     * A **real** schema and a real store, not two hand-rolled objects.
     *
     * This suite was `describe.skip`ped with the note *"Integration tests require full DOM/selection
     * sync; skip until editor-view-dom integration is stable"*. Enabled to find out, none of the
     * sixteen fail for that reason: they fail on `this._dataStore.setActiveSchema is not a function`.
     * The mock store had nine methods and the real one has grown more, so the suite was switched off
     * and the note explained something else.
     *
     * That is the third mock in this repository found dead the same way — an `Editor` mock in
     * `mutation-observer-integration`, a composition API that had moved, and this. A fake that has to
     * keep up with a real type drifts, and the drift shows up as a *skipped* test rather than as a
     * failure anybody sees.
     */
    schema = createSchema('standard', getStandardSchemaDefinition() as never) as never;
    dataStore = new DataStore(undefined as never, schema as never);

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
    /*
     * Loaded, rather than a `getNode` stubbed to answer three ids.
     *
     * The stub's nodes were `{ id, type }` and this model's are `{ sid, stype }` — a shape the
     * product stopped using, answered by a fake nobody had to keep honest. Loading a document gives
     * the store the real nodes under the real names, and everything that is *not* in it answers
     * `undefined` by itself, which is what the "non-existent node" tests below want.
     */
    dataStore.loadDocument?.({
      sid: 'root-1',
      stype: 'document',
      content: [
        { sid: 'p-1', stype: 'paragraph', content: [{ sid: 't-1', stype: 'inline-text', text: 'Hello World' }] },
        { sid: 'h1-1', stype: 'heading', attributes: { level: 1 }, content: [{ sid: 't-2', stype: 'inline-text', text: 'Heading' }] }
      ]
    } as never);

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
      const selection = editor.selection;
      expect(selection === null || typeof selection === 'object').toBe(true);
      if (selection) {
        expect(selection.startNodeId).toBeDefined();
        expect(selection.endNodeId).toBeDefined();
      }
    });

    it.skip('Editor의 selection 메서드들이 작동해야 함', () => {
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
    it.skip('SelectionManager의 selectionChange 이벤트가 Editor에 전달되어야 함', () => {
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

    it.skip('Editor의 focus/blur 이벤트가 SelectionManager와 연동되어야 함', () => {
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
    it.skip('Editor를 통해 Selection을 설정할 수 있어야 함', () => {
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

    it.skip('Editor를 통해 Node Selection을 설정할 수 있어야 함', () => {
      const nodeSelection = {
        nodeId: 'p-1',
        selectAll: true
      };

      editor.setNode(nodeSelection);

      const selection = window.getSelection();
      expect(selection).toBeTruthy();
      expect(selection?.rangeCount).toBeGreaterThan(0);
    });

    it.skip('Editor를 통해 Absolute Position Selection을 설정할 수 있어야 함', () => {
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
      expect(currentSelection === null || typeof currentSelection === 'object').toBe(true);
      if (currentSelection) {
        expect(currentSelection.startNodeId).toBeDefined();
        expect(currentSelection.endNodeId).toBeDefined();
        expect(typeof currentSelection.startOffset).toBe('number');
        expect(typeof currentSelection.endOffset).toBe('number');
      }
    });

    it.skip('Selection이 contentEditable 내에 있는지 확인할 수 있어야 함', () => {
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
    it.skip('Selection 에러가 이벤트로 발생해야 함', () => {
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

    it.skip('Selection 에러 이벤트가 등록되지 않으면 콘솔에 에러를 출력해야 함', () => {
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
    /*
     * **여기 있던 검사 둘을 지웠다 — 둘 다 `SelectionState` 의 모양을 세워 놓고 기다리고 있었다.**
     *
     * 하나는 *"사용자가 텍스트를 선택했을 때 SelectionState가 업데이트되어야 함"* 이었고,
     * `editor:selection.change` 의 payload 가 `{ textContent: 'Hello', nodeId: 'p-1', nodeType:
     * 'paragraph' }` 이기를 기대했다. 다른 하나는 *"복잡한 선택 시나리오"* 로,
     * `data.selection.textContent` 를 모아서 길이만 셌다.
     *
     * 그 셋(`textContent`·`nodeId`·`nodeType`) 중 **어느 것도 그 이벤트에 실린 적이 없다.** payload 는
     * `MaybeSelection` 이고 그것은 `startNodeId`/`startOffset`/`endNodeId`/`endOffset` 이다. 두 번째
     * 검사는 그 위에 둘을 더 틀렸다 — 듣는 이름이 `'selectionChange'`(실제 이름은
     * `editor:selection.change`)였고, `editor.setNode({ nodeId, selectAll })` 로 지워진
     * `ModelNodeSelection` 의 모양을 넘겼다.
     *
     * **`it.skip` 이 이것을 덮고 있었다.** 셋 다 틀린 검사가 몇 년을 앉아 있을 수 있었던 이유는 하나뿐,
     * 한 번도 실행되지 않아서다 — 그래서 `SelectionState` 를 지울 때 컴파일러도 실행기도 아무 말을 하지
     * 않았다. 건너뛴 검사는 *기능이 아직 없다* 를 말하는 자리이지 *계약이 이랬으면 좋겠다* 를 적어 두는
     * 자리가 아니다. 선택이 바뀌는 것은 `editor-selection.test.ts` 와 `@barocss/conformance` 의
     * `one-selection-type` 이 실제로 실행되면서 지킨다.
     */

    it.skip('프로그래밍적으로 선택을 설정했을 때 DOM에 반영되어야 함', () => {
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

  });
});
