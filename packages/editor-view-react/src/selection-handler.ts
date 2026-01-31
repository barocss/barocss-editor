import type { Editor } from '@barocss/editor-core';
import { fromDOMSelection } from '@barocss/editor-core';
import {
  buildTextRunIndex,
  binarySearchRun,
  type ContainerRuns,
} from '@barocss/text-run-index';

export type ModelSelection =
  | { type: 'none' }
  | { type: 'range'; startNodeId: string; startOffset: number; endNodeId: string; endOffset: number; direction?: 'forward' | 'backward' | 'none' }
  | { type: 'node'; nodeId: string };

/**
 * Selection handler for React editor view: converts DOM Selection to/from model selection
 * using renderer-dom text run index. Does not depend on editor-view-dom.
 */
export class ReactSelectionHandler {
  private editor: Editor;
  private getContentEditableElement: () => HTMLElement | null;
  private _isProgrammaticChange = false;

  constructor(
    editor: Editor,
    getContentEditableElement: () => HTMLElement | null
  ) {
    this.editor = editor;
    this.getContentEditableElement = getContentEditableElement;
  }

  setProgrammaticChange(value: boolean): void {
    this._isProgrammaticChange = value;
  }

  /**
   * Returns true if the given (or current) selection is entirely inside inline-text nodes.
   * Used to restrict character input to editable text only (same as editor-view-dom).
   */
  isSelectionInsideEditableText(domSelection?: Selection | null): boolean {
    const sel = domSelection ?? window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;

    const contentEditable = this.getContentEditableElement();
    if (!contentEditable) return false;
    if (!sel.anchorNode || !contentEditable.contains(sel.anchorNode)) return false;
    if (sel.focusNode && !contentEditable.contains(sel.focusNode)) return false;

    const dataStore = this.editor.dataStore;
    if (!dataStore?.getNode) return false;

    const checkNode = (node: Node | null): boolean => {
      if (!node) return false;
      const el = node.nodeType === Node.TEXT_NODE ? (node.parentElement as Element | null) : (node as Element);
      if (!el) return false;
      const found = el.closest('[data-bc-sid]');
      if (!found) return false;
      const sid = found.getAttribute('data-bc-sid');
      if (!sid) return false;
      const modelNode = dataStore.getNode(sid);
      if (!modelNode) return false;
      const stype = (modelNode as { stype?: string }).stype ?? (modelNode as { type?: string }).type;
      return stype === 'inline-text';
    };

    return checkNode(sel.anchorNode) && checkNode(sel.focusNode ?? sel.anchorNode);
  }

  handleSelectionChange(): void {
    if (this._isProgrammaticChange) return;

    const selection = window.getSelection();
    if (!selection) return;

    const contentEditable = this.getContentEditableElement();
    if (!contentEditable) return;

    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    if (!anchorNode) return;

    const isAnchorInside = contentEditable.contains(anchorNode);
    const isFocusInside = !focusNode || contentEditable.contains(focusNode);
    if (!isAnchorInside || !isFocusInside) return;

    let node: Node | null = anchorNode;
    while (node) {
      if (node instanceof Element && node.hasAttribute('data-devtool')) return;
      node = node.parentNode;
    }

    const modelSelection = this.convertDOMSelectionToModel(selection);
    this.editor.updateSelection?.(modelSelection);
  }

  convertDOMSelectionToModel(selection: Selection): ModelSelection {
    if (selection.rangeCount === 0) return { type: 'none' };

    const range = selection.getRangeAt(0);
    const boundaries = this.convertRangeBoundariesToModel(
      range.startContainer,
      range.startOffset,
      range.endContainer,
      range.endOffset
    );
    if (!boundaries) return { type: 'none' };

    const { startNodeId, startModelOffset, endNodeId, endModelOffset } = boundaries;
    const startNode = this.findBestContainer(range.startContainer);
    const endNode = this.findBestContainer(range.endContainer);
    const direction =
      startNode && endNode
        ? this.determineSelectionDirection(
            selection,
            startNode,
            endNode,
            startModelOffset,
            endModelOffset
          )
        : 'forward';

    const modelSelection = fromDOMSelection(
      startNodeId,
      startModelOffset,
      endNodeId,
      endModelOffset,
      'range'
    );
    return { ...modelSelection, direction } as ModelSelection;
  }

  convertStaticRangeToModel(
    staticRange: StaticRange
  ): { type: 'range'; startNodeId: string; startOffset: number; endNodeId: string; endOffset: number; direction?: 'forward' } | null {
    const boundaries = this.convertRangeBoundariesToModel(
      staticRange.startContainer,
      staticRange.startOffset,
      staticRange.endContainer,
      staticRange.endOffset
    );
    if (!boundaries) return null;

    const { startNodeId, startModelOffset, endNodeId, endModelOffset } = boundaries;
    return {
      type: 'range',
      startNodeId,
      startOffset: startModelOffset,
      endNodeId,
      endOffset: endModelOffset,
      direction: 'forward',
    };
  }

  private convertRangeBoundariesToModel(
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

    const startModelOffset = this.convertOffsetWithRuns(
      startNode,
      startContainer,
      startOffset,
      startRuns,
      false
    );
    const endModelOffset = this.convertOffsetWithRuns(
      endNode,
      endContainer,
      endOffset,
      endRuns,
      true
    );

    return { startNodeId, startModelOffset, endNodeId, endModelOffset };
  }

  private isTextContainer(element: Element): boolean {
    return element.getAttribute('data-text-container') === 'true';
  }

  private nodeExistsInModel(nodeId: string): boolean {
    try {
      const ds = this.editor.dataStore;
      if (ds) {
        const node = ds.getNode(nodeId);
        return node != null;
      }
      return true;
    } catch {
      return false;
    }
  }

  private findClosestDataNode(node: Node): Element | null {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      if (el.hasAttribute('data-bc-sid')) return el;
    }
    let current: Element | null = node.parentElement;
    while (current) {
      if (current.hasAttribute('data-bc-sid')) return current;
      current = current.parentElement;
    }
    return null;
  }

  private findBestContainer(node: Node): Element | null {
    let el = this.findClosestDataNode(node);
    if (!el) return null;

    if (this.isTextContainer(el)) return el;

    let cur: Element | null = el;
    while (cur) {
      if (this.isTextContainer(cur)) return cur;
      cur = cur.parentElement?.closest?.('[data-bc-sid]') ?? null;
    }

    const sid = el.getAttribute('data-bc-sid');
    if (sid) {
      const model = this.editor.dataStore?.getNode?.(sid);
      if ((model as { stype?: string })?.stype === 'document') return null;
    }
    return el;
  }

  private ensureRuns(containerEl: Element, containerId: string): ContainerRuns {
    return buildTextRunIndex(containerEl, containerId, {
      buildReverseMap: true,
      excludePredicate: (el) => el.hasAttribute('data-bc-decorator'),
    });
  }

  private convertOffsetWithRuns(
    containerEl: Element,
    container: Node,
    offset: number,
    runs: ContainerRuns,
    isEnd: boolean
  ): number {
    if (runs.total === 0) return 0;
    if (container.nodeType === Node.TEXT_NODE) {
      const textNode = container as Text;
      const entry = runs.byNode?.get(textNode);
      if (entry) {
        const localLen = entry.end - entry.start;
        const clamped = Math.max(0, Math.min(offset, localLen));
        return entry.start + clamped;
      }
      const idx = binarySearchRun(runs.runs, Math.max(0, Math.min(offset, runs.total - 1)));
      if (idx >= 0) return isEnd ? runs.runs[idx].end : runs.runs[idx].start;
      return 0;
    }
    const el = container as Element;
    const boundaryText = this.findTextAtElementBoundary(containerEl, el, offset, isEnd);
    if (boundaryText) {
      const entry = runs.byNode?.get(boundaryText);
      if (entry) return isEnd ? entry.end : entry.start;
    }
    return isEnd ? runs.total : 0;
  }

  private findTextAtElementBoundary(
    containerEl: Element,
    el: Element,
    offset: number,
    isEnd: boolean
  ): Text | null {
    const walker = document.createTreeWalker(containerEl, NodeFilter.SHOW_TEXT);
    const child = el.childNodes.item(offset) ?? null;
    let lastBefore: Text | null = null;
    let firstAtOrAfter: Text | null = null;
    let t = walker.nextNode() as Text | null;
    while (t) {
      if (child) {
        const pos = (t as Node).compareDocumentPosition(child);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) {
          firstAtOrAfter = t;
          break;
        }
        lastBefore = t;
      } else {
        lastBefore = t;
      }
      t = walker.nextNode() as Text | null;
    }
    return isEnd ? (lastBefore ?? firstAtOrAfter) : (firstAtOrAfter ?? lastBefore);
  }

  private determineSelectionDirection(
    selection: Selection,
    startNode: Element,
    endNode: Element,
    startOffset: number,
    endOffset: number
  ): 'forward' | 'backward' {
    if (startNode === endNode) return startOffset <= endOffset ? 'forward' : 'backward';

    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    if (!anchorNode || !focusNode) {
      const position = startNode.compareDocumentPosition(endNode);
      return position & Node.DOCUMENT_POSITION_FOLLOWING ? 'forward' : 'backward';
    }

    const anchorContainer = this.findBestContainer(anchorNode);
    const focusContainer = this.findBestContainer(focusNode);
    if (anchorContainer && focusContainer) {
      const startNodeId = startNode.getAttribute('data-bc-sid');
      const endNodeId = endNode.getAttribute('data-bc-sid');
      const anchorId = anchorContainer.getAttribute('data-bc-sid');
      const focusId = focusContainer.getAttribute('data-bc-sid');
      if (anchorId === startNodeId && focusId === endNodeId) return 'forward';
      if (anchorId === endNodeId && focusId === startNodeId) return 'backward';
    }

    const position = startNode.compareDocumentPosition(endNode);
    return position & Node.DOCUMENT_POSITION_FOLLOWING ? 'forward' : 'backward';
  }

  convertModelSelectionToDOM(modelSelection: ModelSelection | null | undefined): void {
    this._isProgrammaticChange = true;
    try {
      if (!modelSelection || modelSelection.type === 'none') {
        window.getSelection()?.removeAllRanges();
        return;
      }
      if (modelSelection.type === 'range') {
        this.convertRangeSelectionToDOM(modelSelection);
      } else if (modelSelection.type === 'node') {
        this.convertNodeSelectionToDOM(modelSelection);
      }
    } finally {
      setTimeout(() => {
        this._isProgrammaticChange = false;
      }, 0);
    }
  }

  private convertRangeSelectionToDOM(rangeSelection: {
    startNodeId: string;
    startOffset: number;
    endNodeId: string;
    endOffset: number;
  }): void {
    const { startNodeId, startOffset, endNodeId, endOffset } = rangeSelection;

    const startElementRaw = document.querySelector(`[data-bc-sid="${startNodeId}"]`);
    const endElementRaw = document.querySelector(`[data-bc-sid="${endNodeId}"]`);
    if (!startElementRaw || !endElementRaw) return;

    const startElement = this.findBestContainer(startElementRaw);
    const endElement = this.findBestContainer(endElementRaw);
    if (!startElement || !endElement) return;

    const startRuns = this.getTextRunsForContainer(startElement);
    const endRuns = this.getTextRunsForContainer(endElement);

    let startRange = startRuns?.runs?.length
      ? this.findDOMRangeFromModelOffset(startRuns, startOffset)
      : null;
    let endRange = endRuns?.runs?.length
      ? this.findDOMRangeFromModelOffset(endRuns, endOffset)
      : null;

    if (!startRange) {
      startRange = { node: startElementRaw, offset: Math.min(startOffset, startElementRaw.childNodes.length) };
    }
    if (!endRange) {
      endRange = { node: endElementRaw, offset: Math.min(endOffset, endElementRaw.childNodes.length) };
    }

    const selection = window.getSelection();
    if (!selection) return;

    selection.removeAllRanges();
    const range = document.createRange();
    range.setStart(startRange.node, startRange.offset);
    range.setEnd(endRange.node, endRange.offset);
    selection.addRange(range);
  }

  private convertNodeSelectionToDOM(nodeSelection: { nodeId: string }): void {
    const element = document.querySelector(`[data-bc-sid="${nodeSelection.nodeId}"]`);
    if (!element) return;

    const selection = window.getSelection();
    if (!selection) return;

    selection.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.addRange(range);
  }

  private getTextRunsForContainer(container: Element): ContainerRuns | null {
    try {
      const containerId = container.getAttribute('data-bc-sid');
      return buildTextRunIndex(container, containerId ?? undefined, {
        buildReverseMap: true,
        excludePredicate: (el) =>
          el.hasAttribute('data-decorator-sid') ||
          el.hasAttribute('data-bc-decorator') ||
          el.hasAttribute('data-decorator-category'),
        normalizeWhitespace: false,
      });
    } catch {
      return null;
    }
  }

  private findDOMRangeFromModelOffset(
    runs: ContainerRuns,
    modelOffset: number
  ): { node: Node; offset: number } | null {
    if (modelOffset < 0 || modelOffset > runs.total) return null;

    if (modelOffset === runs.total) {
      const lastRun = runs.runs[runs.runs.length - 1];
      return {
        node: lastRun.domTextNode,
        offset: lastRun.domTextNode.textContent?.length ?? 0,
      };
    }

    const runIndex = binarySearchRun(runs.runs, modelOffset);
    if (runIndex === -1) return null;

    const run = runs.runs[runIndex];
    const localOffset = modelOffset - run.start;
    return {
      node: run.domTextNode,
      offset: Math.min(localOffset, run.domTextNode.textContent?.length ?? 0),
    };
  }
}
