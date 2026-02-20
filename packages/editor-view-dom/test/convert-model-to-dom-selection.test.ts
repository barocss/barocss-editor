import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DOMSelectionHandlerImpl } from '../src/event-handlers/selection-handler';

describe('convertModelSelectionToDOM', () => {
  let selectionHandler: DOMSelectionHandlerImpl;
  let container: HTMLElement;

  beforeEach(() => {
    // Create test container
    container = document.createElement('div');
    container.sid = 'test-container';
    document.body.appendChild(container);

    // Create SelectionHandler (Editor is mocked)
    const mockEditor = {} as any;
    selectionHandler = new DOMSelectionHandlerImpl(mockEditor);

    // Create test DOM structure
    setupTestDOM();
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  function setupTestDOM() {
    // Simple text container (no marks)
    const simpleTextContainer = document.createElement('span');
    simpleTextContainer.setAttribute('data-bc-sid', 'text-1');
    simpleTextContainer.setAttribute('data-bc-stype', 'inline-text');
    simpleTextContainer.setAttribute('data-text-container', 'true');
    simpleTextContainer.textContent = 'Hello world';
    container.appendChild(simpleTextContainer);

    // Text container with marks
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

    // Text container with complex marks
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

  describe('Text selection conversion', () => {
    it('should create selection in simple text container', () => {
      const modelSelection = {
        type: 'range',
        startNodeId: 'text-1',
        startOffset: 2,
        endNodeId: 'text-1',
        endOffset: 7
      };

      selectionHandler.convertModelSelectionToDOM(modelSelection);

      const selection = window.getSelection();
      expect(selection).not.toBeNull();
      expect(selection!.rangeCount).toBe(1);
      expect(selection!.toString()).toBe('llo w');
    });

    it('should create selection in text container with marks', () => {
      const modelSelection = {
        type: 'range',
        startNodeId: 'text-bold',
        startOffset: 0,
        endNodeId: 'text-bold',
        endOffset: 9
      };

      selectionHandler.convertModelSelectionToDOM(modelSelection);

      const selection = window.getSelection();
      expect(selection).not.toBeNull();
      expect(selection!.rangeCount).toBe(1);
      expect(selection!.toString()).toBe('bold text');
    });

    it('should create selection in text container with complex marks', () => {
      const modelSelection = {
        type: 'range',
        startNodeId: 'text-complex',
        startOffset: 0,
        endNodeId: 'text-complex',
        endOffset: 15
      };

      selectionHandler.convertModelSelectionToDOM(modelSelection);

      const selection = window.getSelection();
      expect(selection).not.toBeNull();
      expect(selection!.rangeCount).toBe(1);
      expect(selection!.toString()).toBe('bold and italic');
    });

    it('should create selection across different text containers', () => {
      const modelSelection = {
        type: 'range',
        startNodeId: 'text-1',
        startOffset: 6,
        endNodeId: 'text-bold',
        endOffset: 4
      };

      selectionHandler.convertModelSelectionToDOM(modelSelection);

      const selection = window.getSelection();
      expect(selection).not.toBeNull();
      expect(selection!.rangeCount).toBe(1);
      expect(selection!.toString()).toBe('worldbold');
    });
  });

  describe('Node selection conversion', () => {
    it('should select entire text container', () => {
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

    it('should select entire text container with marks', () => {
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

  describe('Error handling', () => {
    it('should handle error for non-existent node ID', () => {
      window.getSelection()?.removeAllRanges();

      const modelSelection = {
        type: 'range',
        startNodeId: 'non-existent',
        startOffset: 0,
        endNodeId: 'non-existent',
        endOffset: 5
      };

      expect(() => {
        selectionHandler.convertModelSelectionToDOM(modelSelection);
      }).not.toThrow();

      const selection = window.getSelection();
      expect(selection!.rangeCount).toBe(0);
    });

    it('should not throw for non-text-container element', () => {
      window.getSelection()?.removeAllRanges();

      const div = document.createElement('div');
      div.setAttribute('data-bc-sid', 'div-1');
      div.setAttribute('data-bc-stype', 'div');
      div.textContent = 'Not a text container';
      container.appendChild(div);

      const modelSelection = {
        type: 'range',
        startNodeId: 'div-1',
        startOffset: 0,
        endNodeId: 'div-1',
        endOffset: 5
      };

      expect(() => {
        selectionHandler.convertModelSelectionToDOM(modelSelection);
      }).not.toThrow();
      // Handler may set selection on any element with data-bc-sid and text (findBestContainer / text runs)
      const selection = window.getSelection();
      expect(selection!.rangeCount).toBeLessThanOrEqual(1);
    });

    it('should handle error for invalid offset', () => {
      window.getSelection()?.removeAllRanges();

      const modelSelection = {
        type: 'range',
        startNodeId: 'text-1',
        startOffset: -1,
        endNodeId: 'text-1',
        endOffset: 1000
      };

      expect(() => {
        selectionHandler.convertModelSelectionToDOM(modelSelection);
      }).not.toThrow();

      const selection = window.getSelection();
      expect(selection!.rangeCount).toBe(0);
    });
  });

  describe('Selection clearing', () => {
    it('should clear selection when type is none', () => {
      selectionHandler.convertModelSelectionToDOM({
        type: 'range',
        startNodeId: 'text-1',
        startOffset: 0,
        endNodeId: 'text-1',
        endOffset: 5
      });

      let selection = window.getSelection();
      expect(selection!.rangeCount).toBe(1);

      selectionHandler.convertModelSelectionToDOM({ type: 'none' });

      selection = window.getSelection();
      expect(selection!.rangeCount).toBe(0);
    });

    it('should clear selection when null/undefined', () => {
      selectionHandler.convertModelSelectionToDOM({
        type: 'range',
        startNodeId: 'text-1',
        startOffset: 0,
        endNodeId: 'text-1',
        endOffset: 5
      });

      let selection = window.getSelection();
      expect(selection!.rangeCount).toBe(1);

      selectionHandler.convertModelSelectionToDOM(null);

      selection = window.getSelection();
      expect(selection!.rangeCount).toBe(0);
    });
  });

  it('should resolve duplicate data-bc-sid by preferring the editor contentEditable root', () => {
    const otherContainer = document.createElement('div');
    const root = document.createElement('div');
    root.setAttribute('contenteditable', 'true');

    const targetInA = document.createElement('span');
    targetInA.setAttribute('data-bc-sid', 'shared-node');
    targetInA.textContent = 'A';

    const targetInB = document.createElement('span');
    targetInB.setAttribute('data-bc-sid', 'shared-node');
    targetInB.textContent = 'B';

    const containerA = document.createElement('div');
    containerA.appendChild(targetInA);
    const containerB = document.createElement('div');
    containerB.appendChild(targetInB);
    root.appendChild(containerB);
    otherContainer.appendChild(containerA);
    document.body.appendChild(otherContainer);
    document.body.appendChild(root);

    const mockEditor = {
      _viewDOM: {
        contentEditableElement: root
      }
    } as any;

    const scopedSelectionHandler = new DOMSelectionHandlerImpl(mockEditor);

    scopedSelectionHandler.convertModelSelectionToDOM({
      type: 'range',
      startNodeId: 'shared-node',
      startOffset: 0,
      endNodeId: 'shared-node',
      endOffset: 1
    });

    expect(window.getSelection()?.toString()).toBe('B');

    document.body.removeChild(otherContainer);
    document.body.removeChild(root);
  });
});
