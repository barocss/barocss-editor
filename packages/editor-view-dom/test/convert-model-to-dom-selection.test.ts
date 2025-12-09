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
        type: 'text',
        anchor: { nodeId: 'text-1', offset: 2 },
        focus: { nodeId: 'text-1', offset: 7 }
      };

      selectionHandler.convertModelSelectionToDOM(modelSelection);

      const selection = window.getSelection();
      expect(selection).not.toBeNull();
      expect(selection!.rangeCount).toBe(1);
      expect(selection!.toString()).toBe('llo w');
    });

    it('should create selection in text container with marks', () => {
      const modelSelection = {
        type: 'text',
        anchor: { nodeId: 'text-bold', offset: 0 },
        focus: { nodeId: 'text-bold', offset: 9 }
      };

      selectionHandler.convertModelSelectionToDOM(modelSelection);

      const selection = window.getSelection();
      expect(selection).not.toBeNull();
      expect(selection!.rangeCount).toBe(1);
      expect(selection!.toString()).toBe('bold text');
    });

    it('should create selection in text container with complex marks', () => {
      const modelSelection = {
        type: 'text',
        anchor: { nodeId: 'text-complex', offset: 0 },
        focus: { nodeId: 'text-complex', offset: 15 }
      };

      selectionHandler.convertModelSelectionToDOM(modelSelection);

      const selection = window.getSelection();
      expect(selection).not.toBeNull();
      expect(selection!.rangeCount).toBe(1);
      expect(selection!.toString()).toBe('bold and italic');
    });

    it('should create selection across different text containers', () => {
      const modelSelection = {
        type: 'text',
        anchor: { nodeId: 'text-1', offset: 6 },
        focus: { nodeId: 'text-bold', offset: 4 }
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
      // Clear previous selection
      window.getSelection()?.removeAllRanges();
      
      const modelSelection = {
        type: 'text',
        anchor: { nodeId: 'non-existent', offset: 0 },
        focus: { nodeId: 'non-existent', offset: 5 }
      };

      // Should not throw error
      expect(() => {
        selectionHandler.convertModelSelectionToDOM(modelSelection);
      }).not.toThrow();

      // Should have no selection
      const selection = window.getSelection();
      expect(selection!.rangeCount).toBe(0);
    });

    it('should handle error for non-text-container element', () => {
      // 이전 선택 초기화
      window.getSelection()?.removeAllRanges();
      
      // Create regular div element (no data-text-container)
      const div = document.createElement('div');
      div.setAttribute('data-bc-sid', 'div-1');
      div.setAttribute('data-bc-stype', 'div');
      div.textContent = 'Not a text container';
      container.appendChild(div);

      const modelSelection = {
        type: 'text',
        anchor: { nodeId: 'div-1', offset: 0 },
        focus: { nodeId: 'div-1', offset: 5 }
      };

      expect(() => {
        selectionHandler.convertModelSelectionToDOM(modelSelection);
      }).not.toThrow();

      const selection = window.getSelection();
      expect(selection!.rangeCount).toBe(0);
    });

    it('should handle error for invalid offset', () => {
      // 이전 선택 초기화
      window.getSelection()?.removeAllRanges();
      
      const modelSelection = {
        type: 'text',
        anchor: { nodeId: 'text-1', offset: -1 },
        focus: { nodeId: 'text-1', offset: 1000 }
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
      // First create selection
      const modelSelection = {
        type: 'text',
        anchor: { nodeId: 'text-1', offset: 0 },
        focus: { nodeId: 'text-1', offset: 5 }
      };
      selectionHandler.convertModelSelectionToDOM(modelSelection);

      // Verify selection exists
      let selection = window.getSelection();
      expect(selection!.rangeCount).toBe(1);

      // Clear selection
      selectionHandler.convertModelSelectionToDOM({ type: 'none' });

      selection = window.getSelection();
      expect(selection!.rangeCount).toBe(0);
    });

    it('should clear selection when null/undefined', () => {
      // First create selection
      const modelSelection = {
        type: 'text',
        anchor: { nodeId: 'text-1', offset: 0 },
        focus: { nodeId: 'text-1', offset: 5 }
      };
      selectionHandler.convertModelSelectionToDOM(modelSelection);

      // Verify selection exists
      let selection = window.getSelection();
      expect(selection!.rangeCount).toBe(1);

      // Clear selection with null
      selectionHandler.convertModelSelectionToDOM(null);

      selection = window.getSelection();
      expect(selection!.rangeCount).toBe(0);
    });
  });
});
