import { DOMSelectionHandler } from '../types';
import { Editor, fromDOMSelection } from '@barocss/editor-core';
import { 
  buildTextRunIndex, 
  binarySearchRun, 
  type ContainerRuns, logger, LogCategory } from '@barocss/renderer-dom';

export class DOMSelectionHandlerImpl implements DOMSelectionHandler {
  private editor: Editor;
  /**
   * The view this handler belongs to.
   *
   * **Not `editor._viewDOM`**, which is one slot on the editor and therefore whichever view was
   * created last. That was the scope every selection query used, and a document can be drawn by more
   * than one view: the site builder draws one page at three widths, so three views share one editor
   * and one `document.getSelection()`.
   *
   * What it cost, reported by a reader in one sentence: *"entering text on the desktop board puts
   * the caret on the mobile one."* Every caret this handler drew was looked up inside the **last**
   * view's content, so `[data-bc-sid="site:49"]` found the mobile board's copy of the node and the
   * selection was set there. Everything downstream then disagreed — the desktop board re-anchored a
   * selection that was not in it, its renders repaired against it, and an IME commit came back
   * having replaced 68 characters.
   *
   * A handler belongs to a view. It is passed one now, and falls back to the old lookup only for a
   * caller that constructs it without one.
   */
  private view?: { contentEditableElement?: Element };
  private _isProgrammaticChange: boolean = false; // Flag for programmatic Selection change

  constructor(editor: Editor, view?: { contentEditableElement?: Element }) {
    this.editor = editor;
    this.view = view;
  }

  private _getScopeRoot(): ParentNode {
    const own = this.view?.contentEditableElement;
    if (own && (own as Element).querySelector) return own as ParentNode;

    const editorViewDOM = (this.editor as any)._viewDOM;
    const contentEditable = editorViewDOM?.contentEditableElement;
    if (contentEditable && contentEditable.querySelector) {
      return contentEditable;
    }
    return document;
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
      logger.debug(LogCategory.SELECTION, 'Skipped: programmatic change');
      return;
    }

    const selection = window.getSelection();
    if (!selection) {
      logger.debug(LogCategory.SELECTION, 'Skipped: no selection');
      return;
    }

    // Ignore Selection changes outside Editor
    const editorViewDOM = (this.editor as any)._viewDOM;
    if (!editorViewDOM || !editorViewDOM.contentEditableElement) {
      logger.debug(LogCategory.SELECTION, 'Skipped: no editorViewDOM');
      return;
    }
    
    // Check if Selection is inside Editor's contentEditable
    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    if (!anchorNode) {
      logger.debug(LogCategory.SELECTION, 'Skipped: no anchorNode');
      return;
    }
    
    const contentEditable = editorViewDOM.contentEditableElement;
    const isAnchorInside = contentEditable.contains(anchorNode);
    const isFocusInside = !focusNode || contentEditable.contains(focusNode);
    
    logger.debug(LogCategory.SELECTION, 'Checking selection location:', {
      isAnchorInside,
      isFocusInside,
      anchorNode: anchorNode.nodeName,
      focusNode: focusNode?.nodeName
    });
    
    // Both must be inside Editor
    if (!isAnchorInside || !isFocusInside) {
      logger.debug(LogCategory.SELECTION, 'Skipped: selection outside editor');
      return;
    }
    
    // Exclude devtool area (check data-devtool attribute)
    let node: Node | null = anchorNode;
    while (node) {
      if (node instanceof Element && node.hasAttribute('data-devtool')) {
        logger.debug(LogCategory.SELECTION, 'Skipped: inside devtool');
        return; // Ignore if devtool area
      }
      node = node.parentNode;
    }

    logger.debug(LogCategory.SELECTION, 'Processing selection change');

    // Convert DOM Selection to Model Selection
    const modelSelection = this.convertDOMSelectionToModel(selection);

    this.editor.updateSelection?.(modelSelection);
  }

  convertDOMSelectionToModel(selection: Selection): any {
    if (selection.rangeCount === 0) {
      return { type: 'none' };
    }

    const range = selection.getRangeAt(0);
    const boundaries = this._convertRangeBoundariesToModel(
      range.startContainer,
      range.startOffset,
      range.endContainer,
      range.endOffset
    );
    if (!boundaries) return { type: 'none' };

    const { startNodeId, startModelOffset, endNodeId, endModelOffset } = boundaries;
    const startNode = this.findBestContainer(range.startContainer);
    const endNode = this.findBestContainer(range.endContainer);
    const direction = startNode && endNode
      ? this.determineSelectionDirection(selection, startNode, endNode, startModelOffset, endModelOffset)
      : 'forward';

    const modelSelection = fromDOMSelection(startNodeId, startModelOffset, endNodeId, endModelOffset, 'range');
    return { ...modelSelection, direction };
  }

  /**
   * Convert StaticRange (e.g. from InputEvent.getTargetRanges()) to ModelSelection.
   * Used for beforeinput + getTargetRanges() path to get the DOM range that would be affected before the browser modifies it.
   */
  convertStaticRangeToModel(staticRange: StaticRange): { type: 'range'; startNodeId: string; startOffset: number; endNodeId: string; endOffset: number; direction?: 'forward' | 'backward' | 'none' } | null {
    const boundaries = this._convertRangeBoundariesToModel(
      staticRange.startContainer,
      staticRange.startOffset,
      staticRange.endContainer,
      staticRange.endOffset
    );
    if (!boundaries) return null;

    const { startNodeId, startModelOffset, endNodeId, endModelOffset } = boundaries;
    const modelSelection = fromDOMSelection(startNodeId, startModelOffset, endNodeId, endModelOffset, 'range');
    return { ...modelSelection, type: 'range' as const, direction: 'forward' as const };
  }

  /**
   * Convert range boundaries (start/end container + offset) to model node ids and offsets.
   * Shared by convertDOMSelectionToModel and convertStaticRangeToModel.
   */
  private _convertRangeBoundariesToModel(
    startContainer: Node,
    startOffset: number,
    endContainer: Node,
    endOffset: number
  ): { startNodeId: string; startModelOffset: number; endNodeId: string; endModelOffset: number } | null {
    const startNode = this.findBestContainer(startContainer);
    const endNode = this.findBestContainer(endContainer);

    if (!startNode || !endNode) return null;

    const startNodeId = startNode.getAttribute('data-bc-sid');
    const endNodeId = endNode.getAttribute('data-bc-sid');

    if (!startNodeId || !endNodeId) return null;

    if (!this.nodeExistsInModel(startNodeId) || !this.nodeExistsInModel(endNodeId)) return null;

    const startRuns = this.ensureRuns(startNode, startNodeId);
    const endRuns = startNode === endNode ? startRuns : this.ensureRuns(endNode, endNodeId);

    const startModelOffset = this.convertOffsetWithRuns(startNode, startContainer, startOffset, startRuns, false);
    const endModelOffset = this.convertOffsetWithRuns(endNode, endContainer, endOffset, endRuns, true);

    return { startNodeId, startModelOffset, endNodeId, endModelOffset };
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
        // `offset` is a DOM offset. domStart skips a leading filler, so the
        // position just after the zero-width character is model offset 0.
        const localLen = entry.end - entry.start;
        const clamped = Math.max(0, Math.min(offset - entry.domStart, localLen));
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
    
    logger.debug(LogCategory.SELECTION, 'Converting range selection to DOM:', {
      startNodeId,
      startOffset,
      endNodeId,
      endOffset
    });
    
    // Find nodes for startNodeId and endNodeId
    const scopeRoot = this._getScopeRoot();
    const startElementRaw = scopeRoot.querySelector(`[data-bc-sid="${startNodeId}"]`);
    const endElementRaw = scopeRoot.querySelector(`[data-bc-sid="${endNodeId}"]`);
    
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

      const startRange = this.findDOMRangeFromModelOffset(startRuns, startOffset, startElement);
      const endRange = this.findDOMRangeFromModelOffset(endRuns, endOffset, endElement);
      
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
    const scopeRoot = this._getScopeRoot();
    const element = scopeRoot.querySelector(`[data-bc-sid="${nodeSelection.nodeId}"]`);
    
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
        }
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
    if (
      !(
        el.hasAttribute('data-decorator-sid') ||
        el.hasAttribute('data-bc-decorator') ||
        el.hasAttribute('data-decorator-category')
      )
    ) {
      return false;
    }

    /**
     * An inline decorator wraps the document's own text and is not excluded.
     *
     * A search hit and a commented phrase are marked-up *existing* characters;
     * every other category draws content of its own. Treating the two the same
     * dropped commented text from the run index, and every model offset past it
     * then resolved to the wrong node. See `isDecoratorOwnText` in
     * `@barocss/shared`, where the same distinction is made for the same reason.
     */
    return el.getAttribute('data-decorator-category') !== 'inline';
  }

  /**
   * First text node under `root` in document order, skipping decorator subtrees.
   */
  private findFirstTextNode(root: Element): Text | null {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = (node as Text).parentElement;
        if (parent && parent !== root && this.isDecoratorElement(parent)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    return walker.nextNode() as Text | null;
  }

  /**
   * Convert model offset to DOM range.
   */
  private findDOMRangeFromModelOffset(
    runs: ContainerRuns,
    modelOffset: number,
    container?: Element
  ): { node: Node; offset: number } | null {
    if (modelOffset < 0 || modelOffset > runs.total) {
      console.warn('[SelectionHandler] Model offset out of range:', { modelOffset, total: runs.total });
      return null;
    }

    // Empty inline-text (e.g. the block a fresh Enter creates) has no text runs:
    // buildTextRunIndex skips zero-length text nodes. Indexing into the empty run
    // list would throw and leave the caret where it was, so anchor explicitly.
    // Prefer the empty text node itself — anchoring on the element instead makes
    // the DOM→model conversion resolve to the *next* block's text node, so typed
    // characters land in the wrong paragraph.
    if (runs.runs.length === 0) {
      if (!container) return null;
      const emptyTextNode = this.findFirstTextNode(container);
      // After the zero-width character, never in front of it.
      //
      // A position before the filler is not one the browser will edit at. It
      // reports the caret there happily and then edits somewhere else: measured
      // in an empty equation slot, `document.getSelection()` named this node
      // while the same keystroke's `getTargetRanges()` named a run earlier in
      // the paragraph, and the character landed there instead.
      //
      // An empty *block* hid this for as long as there were only empty blocks —
      // there is no earlier position inside one for the browser to fall back to.
      // Empty inline slots have one, and they are what equations are made of.
      return emptyTextNode
        ? { node: emptyTextNode, offset: emptyTextNode.data.length }
        : { node: container, offset: 0 };
    }

    // When modelOffset equals runs.total, use end position of last run
    if (modelOffset === runs.total) {
      const lastRun = runs.runs[runs.runs.length - 1];
      return {
        node: lastRun.domTextNode,
        offset: lastRun.domStart + lastRun.text.length
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
      // domStart skips a leading filler so the caret lands after it, not before
      offset: run.domStart + Math.min(localOffset, run.text.length)
    };
  }
}
