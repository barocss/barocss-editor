import { DOMSelectionHandler } from '../types';
import { Editor, fromDOMSelection } from '@barocss/editor-core';
import { 
  buildTextRunIndex, 
  binarySearchRun, 
  type ContainerRuns 
} from '@barocss/renderer-dom';

export class DOMSelectionHandlerImpl implements DOMSelectionHandler {
  private editor: Editor;
  private _isProgrammaticChange: boolean = false; // Flag for programmatic Selection change

  constructor(editor: Editor) {
    this.editor = editor;
  }

  /**
   * Check if DOM element is a text container.
   * If it has data-text-container="true" attribute, it is a text container.
   */
  private isTextContainer(element: Element): boolean {
    return element.getAttribute('data-text-container') === 'true';
  }

  /**
   * Check if node actually exists in Model.
   * Validates node existence through Editor's dataStore.
   */
  private nodeExistsInModel(nodeId: string): boolean {
    try {
      // Check node existence through Editor's dataStore
      if (this.editor.dataStore) {
        const node = this.editor.dataStore.getNode(nodeId);
        return node !== null && node !== undefined;
      }

      return true; // Maintain existing behavior (actual nodes are true)
    } catch (error) {
      console.warn('[SelectionHandler] Error checking node existence:', error);
      return false;
    }
  }

  handleSelectionChange(): void {
    // Ignore if programmatic change
    if (this._isProgrammaticChange) {
      console.log('[SelectionHandler] Skipped: programmatic change');
      return;
    }

    const selection = window.getSelection();
    if (!selection) {
      console.log('[SelectionHandler] Skipped: no selection');
      return;
    }

    // Ignore Selection changes outside Editor
    const editorViewDOM = (this.editor as any)._viewDOM;
    if (!editorViewDOM || !editorViewDOM.contentEditableElement) {
      console.log('[SelectionHandler] Skipped: no editorViewDOM');
      return;
    }
    
    // Check if Selection is inside Editor's contentEditable
    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    if (!anchorNode) {
      console.log('[SelectionHandler] Skipped: no anchorNode');
      return;
    }
    
    const contentEditable = editorViewDOM.contentEditableElement;
    const isAnchorInside = contentEditable.contains(anchorNode);
    const isFocusInside = !focusNode || contentEditable.contains(focusNode);
    
    console.log('[SelectionHandler] Checking selection location:', {
      isAnchorInside,
      isFocusInside,
      anchorNode: anchorNode.nodeName,
      focusNode: focusNode?.nodeName
    });
    
    // Both must be inside Editor
    if (!isAnchorInside || !isFocusInside) {
      console.log('[SelectionHandler] Skipped: selection outside editor');
      return;
    }
    
    // Exclude devtool area (check data-devtool attribute)
    let node: Node | null = anchorNode;
    while (node) {
      if (node instanceof Element && node.hasAttribute('data-devtool')) {
        console.log('[SelectionHandler] Skipped: inside devtool');
        return; // Ignore if devtool area
      }
      node = node.parentNode;
    }

    console.log('[SelectionHandler] Processing selection change');

    // Convert DOM Selection to Model Selection
    const modelSelection = this.convertDOMSelectionToModel(selection);

    this.editor.updateSelection?.(modelSelection);
  }

  convertDOMSelectionToModel(selection: Selection): any {
    if (selection.rangeCount === 0) {
      return { type: 'none' };
    }

    const range = selection.getRangeAt(0);
    const startContainer = range.startContainer;
    const endContainer = range.endContainer;
    const startOffset = range.startOffset;
    const endOffset = range.endOffset;

    // Find closest element with data-bc-sid (prioritize text container)
    const startNode = this.findBestContainer(startContainer);
    const endNode = this.findBestContainer(endContainer);

    if (!startNode || !endNode) {
      return { type: 'none' };
    }

    const startNodeId = startNode.getAttribute('data-bc-sid');
    const endNodeId = endNode.getAttribute('data-bc-sid');

    if (!startNodeId || !endNodeId) {
      return { type: 'none' };
    }

    // Check if node actually exists in Model
    if (!this.nodeExistsInModel(startNodeId) || !this.nodeExistsInModel(endNodeId)) {
      console.warn('[SelectionHandler] Node does not exist in model:', {
        startNodeId,
        endNodeId,
        startExists: this.nodeExistsInModel(startNodeId),
        endExists: this.nodeExistsInModel(endNodeId)
      });
      return { type: 'none' };
    }

    // Calculate global offset based on Text Run Index
    const startRuns = this.ensureRuns(startNode, startNodeId);
    const endRuns = startNode === endNode ? startRuns : this.ensureRuns(endNode, endNodeId);

    const startModelOffset = this.convertOffsetWithRuns(startNode, startContainer, startOffset, startRuns, false);
    const endModelOffset = this.convertOffsetWithRuns(endNode, endContainer, endOffset, endRuns, true);

    // Determine Selection direction
    const direction = this.determineSelectionDirection(selection, startNode, endNode, startModelOffset, endModelOffset);

    // Normalize using fromDOMSelection (returns unified ModelSelection format)
    const modelSelection = fromDOMSelection(startNodeId, startModelOffset, endNodeId, endModelOffset, 'range');
    
    return {
      ...modelSelection,
      direction // Overwrite direction with value calculated from determineSelectionDirection
    };
  }

  private findClosestDataNode(node: Node): Element | null {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      if (element.hasAttribute('data-bc-sid')) {
        return element;
      }
    }

    // Find data-bc-sid in parent element
    let current = node.parentElement;
    while (current) {
      if (current.hasAttribute('data-bc-sid')) {
        return current;
      }
      current = current.parentElement;
    }

    return null;
  }

  private findBestContainer(node: Node): Element | null {
    // Top priority: node that is a text container
    let el = this.findClosestDataNode(node);
    if (!el) return null;
    
    if (this.isTextContainer(el)) {
      return el;
    }
    
    // Go up to find text container, but maintain original data-bc-sid if not found
    let cur: Element | null = el;
    while (cur) {
      if (this.isTextContainer(cur)) {
        return cur;
      }
      cur = cur.parentElement?.closest?.('[data-bc-sid]') || null;
    }
    
    // Upper containers like document are inappropriate as selection container → ignore
    const sid = el.getAttribute('data-bc-sid');
    if (sid) {
      const model = this.editor.dataStore?.getNode?.(sid);
      if (model?.stype === 'document') return null;
    }
    return el;
  }

  private ensureRuns(containerEl: Element, containerId: string): ContainerRuns {
    // Operate independently without DOMRenderer: build index directly
    return buildTextRunIndex(containerEl, containerId, {
      buildReverseMap: true,
      excludePredicate: (el) => el.hasAttribute('data-bc-decorator')
    });
  }

  private convertOffsetWithRuns(containerEl: Element, container: Node, offset: number, runs: ContainerRuns, isEnd: boolean): number {
    if (runs.total === 0) return 0;
    if (container.nodeType === Node.TEXT_NODE) {
      const textNode = container as Text;
      const entry = runs.byNode?.get(textNode);
      if (entry) {
        const localLen = entry.end - entry.start;
        const clamped = Math.max(0, Math.min(offset, localLen));
        return entry.start + clamped;
      }
      // fallback: snap to closest text run
      const idx = binarySearchRun(runs.runs, Math.max(0, Math.min(offset, runs.total - 1)));
      if (idx >= 0) return isEnd ? runs.runs[idx].end : runs.runs[idx].start;
      return 0;
    }
    // If Element node: search for text node closest to boundary based on child index
    const el = container as Element;
    const boundaryText = this.findTextAtElementBoundary(containerEl, el, offset, isEnd);
    if (boundaryText) {
      const entry = runs.byNode?.get(boundaryText);
      if (entry) return isEnd ? entry.end : entry.start;
    }
    // If no text, snap to container start/end
    return isEnd ? runs.total : 0;
  }

  private findTextAtElementBoundary(containerEl: Element, el: Element, offset: number, isEnd: boolean): Text | null {
    const walker = document.createTreeWalker(containerEl, NodeFilter.SHOW_TEXT);
    const child = el.childNodes.item(offset) || null;
    let lastBefore: Text | null = null;
    let firstAtOrAfter: Text | null = null;
    let t = walker.nextNode() as Text | null;
    while (t) {
      if (child) {
        const pos = (t as any).compareDocumentPosition(child);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) {
          firstAtOrAfter = t;
          break;
        } else {
          lastBefore = t;
        }
      } else {
        // If no child, offset means end boundary
        lastBefore = t;
      }
      t = walker.nextNode() as Text | null;
    }
    return isEnd ? (lastBefore || firstAtOrAfter) : (firstAtOrAfter || lastBefore);
  }

  private determineSelectionDirection(
    selection: Selection, 
    startNode: Element, 
    endNode: Element, 
    startOffset: number, 
    endOffset: number
  ): 'forward' | 'backward' {
    // 1. Selection within same node
    if (startNode === endNode) {
      return startOffset <= endOffset ? 'forward' : 'backward';
    }

    // 2. Selection across different nodes - determine by DOM order
    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    
    if (!anchorNode || !focusNode) {
      // Determine by DOM order (use compareDocumentPosition)
      const position = startNode.compareDocumentPosition(endNode);
      return (position & Node.DOCUMENT_POSITION_FOLLOWING) ? 'forward' : 'backward';
    }

    // 3. Determine based on anchor/focus
    const anchorContainer = this.findBestContainer(anchorNode);
    const focusContainer = this.findBestContainer(focusNode);
    
    if (anchorContainer && focusContainer) {
      const anchorId = anchorContainer.getAttribute('data-bc-sid');
      const focusId = focusContainer.getAttribute('data-bc-sid');
      const startNodeId = startNode.getAttribute('data-bc-sid');
      const endNodeId = endNode.getAttribute('data-bc-sid');
      
      if (anchorId === startNodeId && focusId === endNodeId) {
        return 'forward';
      } else if (anchorId === endNodeId && focusId === startNodeId) {
        return 'backward';
      }
    }

    // 4. Final fallback: DOM order
    const position = startNode.compareDocumentPosition(endNode);
    return (position & Node.DOCUMENT_POSITION_FOLLOWING) ? 'forward' : 'backward';
  }

  /**
   * Convert model selection to DOM selection.
   */
  convertModelSelectionToDOM(modelSelection: any): void {
    // Mark as programmatic change
    this._isProgrammaticChange = true;
    
    try {
      if (!modelSelection || modelSelection.type === 'none') {
        // Clear selection
        window.getSelection()?.removeAllRanges();
        return;
      }

      // Support unified ModelSelection format (startNodeId/startOffset/endNodeId/endOffset)
      if (modelSelection.type === 'range') {
        this.convertRangeSelectionToDOM(modelSelection);
      } else if (modelSelection.type === 'node') {
        this.convertNodeSelectionToDOM(modelSelection);
      } else {
        console.warn('[SelectionHandler] Unsupported selection type:', modelSelection.type);
      }
    } finally {
      // Release flag in next event loop (after selectionchange event is processed)
      setTimeout(() => {
        this._isProgrammaticChange = false;
      }, 0);
    }
  }

  /**
   * Convert range selection to DOM selection (unified ModelSelection format).
   */
  private convertRangeSelectionToDOM(rangeSelection: any): void {
    const { startNodeId, startOffset, endNodeId, endOffset } = rangeSelection;
    
    console.log('[SelectionHandler] Converting range selection to DOM:', {
      startNodeId,
      startOffset,
      endNodeId,
      endOffset
    });
    
    // Find nodes for startNodeId and endNodeId
    const startElementRaw = document.querySelector(`[data-bc-sid="${startNodeId}"]`);
    const endElementRaw = document.querySelector(`[data-bc-sid="${endNodeId}"]`);
    
    if (!startElementRaw || !endElementRaw) {
      console.warn('[SelectionHandler] Could not find elements for model selection', {
        startNodeId,
        endNodeId,
        startFound: !!startElementRaw,
        endFound: !!endElementRaw
      });
      return;
    }

    // Use findBestContainer to find text container
    // (use same logic as convertDOMSelectionToModel)
    // findBestContainer finds text container first, or returns first data-bc-sid element if not found
    const startElement = this.findBestContainer(startElementRaw);
    const endElement = this.findBestContainer(endElementRaw);
    
    if (!startElement || !endElement) {
      console.warn('[SelectionHandler] Could not find containers for model selection', {
        startNodeId,
        endNodeId,
        startFound: !!startElement,
        endFound: !!endElement
      });
      return;
    }

    try {
      // Use Text Run Index to find accurate DOM position
      const startRuns = this.getTextRunsForContainer(startElement);
      const endRuns = this.getTextRunsForContainer(endElement);
      
      if (!startRuns || !endRuns) {
        console.warn('[SelectionHandler] Could not get text runs for containers');
        return;
      }

      const startRange = this.findDOMRangeFromModelOffset(startRuns, startOffset);
      const endRange = this.findDOMRangeFromModelOffset(endRuns, endOffset);
      
      if (!startRange || !endRange) {
        console.warn('[SelectionHandler] Could not find DOM ranges for model offsets', {
          startOffset,
          endOffset,
          startRunsTotal: startRuns.total,
          endRunsTotal: endRuns.total
        });
        return;
      }

      // Set DOM Selection
      const selection = window.getSelection();
      if (!selection) return;

      selection.removeAllRanges();
      
      const range = document.createRange();
      range.setStart(startRange.node, startRange.offset);
      range.setEnd(endRange.node, endRange.offset);
      
      selection.addRange(range);
      
      console.debug('[SelectionHandler] Converted range selection to DOM', {
        startNodeId,
        startOffset,
        endNodeId,
        endOffset
      });
      
    } catch (error) {
      console.error('[SelectionHandler] Error converting range selection to DOM:', error);
    }
  }

  /**
   * Convert node selection to DOM selection.
   */
  private convertNodeSelectionToDOM(nodeSelection: any): void {
    const element = document.querySelector(`[data-bc-sid="${nodeSelection.nodeId}"]`);
    
    if (!element) {
      console.warn('[SelectionHandler] Could not find element for node selection');
      return;
    }

    try {
      const selection = window.getSelection();
      if (!selection) return;

      selection.removeAllRanges();
      
      const range = document.createRange();
      range.selectNodeContents(element);
      
      selection.addRange(range);
      
      console.debug('[SelectionHandler] Converted node selection to DOM', {
        nodeId: nodeSelection.nodeId
      });
      
    } catch (error) {
      console.error('[SelectionHandler] Error converting node selection to DOM:', error);
    }
  }

  /**
   * Get Text Run Index for container.
   * Collects all text nodes under data-bc-sid (excludes decorator children)
   * 
   * Note: Does not use cache, creates new instance each time.
   * Reason: When DOM changes, Text Run Index must be invalidated,
   *         but cache invalidation logic is complex, and Text Run Index creation cost is not high.
   * 
   * Performance considerations:
   * - Generally a few text runs per inline-text node (split by marks but not many)
   * - TreeWalker traversal is O(n) where n = number of text nodes
   * - Selection conversion only occurs at user input time, so frequency is not high
   */
  private getTextRunsForContainer(container: Element): ContainerRuns | null {
    try {
      const containerId = container.getAttribute('data-bc-sid');
      
      // Create new each time (no cache)
      // When DOM changes, Text Run Index must be invalidated,
      // so creating new each time is safer than complex cache invalidation logic.
      const runs = buildTextRunIndex(container, containerId || undefined, {
        buildReverseMap: true, // Generate reverse map (for O(1) lookup)
        excludePredicate: (el) => {
          // Exclude decorators (also checked inside buildTextRunIndex but explicitly passed)
          return this.isDecoratorElement(el);
        },
        normalizeWhitespace: false // Don't use trim() - to match actual DOM offset with model offset
      });
      
      return runs;
    } catch (error) {
      console.warn('[SelectionHandler] Could not build text run index:', error);
      return null;
    }
  }

  /**
   * Check if element is a decorator
   */
  private isDecoratorElement(el: Element): boolean {
    return !!(
      el.hasAttribute('data-decorator-sid') ||
      el.hasAttribute('data-bc-decorator') ||
      el.hasAttribute('data-decorator-category')
    );
  }

  /**
   * Convert model offset to DOM range.
   */
  private findDOMRangeFromModelOffset(runs: ContainerRuns, modelOffset: number): { node: Node; offset: number } | null {
    if (modelOffset < 0 || modelOffset > runs.total) {
      console.warn('[SelectionHandler] Model offset out of range:', { modelOffset, total: runs.total });
      return null;
    }

    // When modelOffset equals runs.total, use end position of last run
    if (modelOffset === runs.total) {
      const lastRun = runs.runs[runs.runs.length - 1];
      return {
        node: lastRun.domTextNode,
        offset: lastRun.domTextNode.textContent?.length || 0
      };
    }

    // Find appropriate run using binary search
    const runIndex = binarySearchRun(runs.runs, modelOffset);
    if (runIndex === -1) {
      console.warn('[SelectionHandler] Could not find run for model offset:', { modelOffset, runs: runs.runs.map(r => ({ start: r.start, end: r.end })) });
      return null;
    }

    const run = runs.runs[runIndex];
    const localOffset = modelOffset - run.start;
    
    console.debug('[SelectionHandler] Found DOM range:', {
      modelOffset,
      runIndex,
      runStart: run.start,
      runEnd: run.end,
      localOffset,
      textNodeLength: run.domTextNode.textContent?.length
    });
    
    return {
      node: run.domTextNode,
      offset: Math.min(localOffset, run.domTextNode.textContent?.length || 0)
    };
  }
}
