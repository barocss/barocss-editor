import type { Editor } from '@barocss/editor-core';
import { fromDOMSelection } from '@barocss/editor-core';
import {
  buildTextRunIndex,
  binarySearchRun,
  type ContainerRuns,
} from '@barocss/shared';

/** `types.ts` 를 통해 `editor-core` 의 것을 쓴다 — 여기 글자까지 같은 사본이 있었다. */
import type { ModelSelection, MaybeSelection } from './types';
export type { ModelSelection, MaybeSelection };

/**
 * Selection handler for React editor view: converts DOM Selection to/from model selection
 * using renderer-dom text run index. Does not depend on editor-view-dom.
 */
export class ReactSelectionHandler {
  private editor: Editor;
  private getContentEditableElement: () => HTMLElement | null;
  private _isProgrammaticChange = false;
  private _getScopeRoot(): ParentNode {
    const contentEditableElement = this.getContentEditableElement();
    if (contentEditableElement) {
      return contentEditableElement;
    }
    return document;
  }

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

  /**
   * **돌려주는 것은 `MaybeSelection` 이다** — 골라진 것이 없을 수도 있다.
   *
   * 전에는 `ModelSelection` 이라고 적혀 있었고 `{ type: 'none' }` 을 돌려줬다. 이 층이 자기
   * `ModelSelection` 사본을 갖고 있었고 그 사본에는 `'none'` 이 유니온의 한 갈래로 있었기 때문에
   * 통과했다. `editor-core` 의 것으로 바꾸자 타입 검사가 두 자리에서 *`'none'` 은 `SelectionType`
   * 이 아니다* 라고 말했다 — 사본이 가리고 있던 것을 사본을 걷으니 바로 말한다.
   */
  convertDOMSelectionToModel(selection: Selection): MaybeSelection {
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

  /**
   * **글자를 담은 그릇인가 — 모델에 묻는다.**
   *
   * 전에는 `data-text-container === 'true'` 였고 **어떤 렌더러도 그 속성을 쓰지 않는다.** 그래서 이
   * 함수는 한 번도 참이 아니었고, 범위의 두 끝을 담을 그릇을 찾는 `findBestContainer` 의 잘 적힌
   * 걷기가 늘 실패했다.
   *
   * `editor-view-dom` 에 글자까지 같은 결함이 있었고 그쪽은 고쳐졌다. **이쪽은 남아 있었다** —
   * 두 뷰 층이 선택 변환을 두 벌 갖고 있어서, 고칠 때마다 두 번 고쳐야 하는데 한 번만 고쳐진 것이다.
   * 같은 이름의 private 메서드가 **열한 개** 겹친다.
   */
  private isTextContainer(element: Element): boolean {
    const sid = element.getAttribute('data-bc-sid');
    if (!sid) return false;
    const node = (this.editor as { dataStore?: { getNode?: (id: string) => unknown } }).dataStore?.getNode?.(
      sid
    ) as { text?: unknown } | undefined;
    return typeof node?.text === 'string';
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
      excludePredicate: (el) => this.isDecoratorElement(el),
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
        // `offset` is a DOM offset. domStart skips a leading filler, so the
        // position just after the zero-width character is model offset 0.
        const localLen = entry.end - entry.start;
        const clamped = Math.max(0, Math.min(offset - entry.domStart, localLen));
        return entry.start + clamped;
      }
      const idx = binarySearchRun(runs.runs, Math.max(0, Math.min(offset, runs.total - 1)));
      if (idx >= 0) return isEnd ? runs.runs[idx].end : runs.runs[idx].start;
      return 0;
    }
    // 요소 경계: 자식 색인이 가리키는 자리가 어느 런의 앞인지 뒤인지로 정한다.
    const el = container as Element;
    return this.modelOffsetAtElementBoundary(containerEl, el, offset, runs, isEnd);
  }

  /**
   * **경계가 요소일 때의 모델 오프셋** — `Shift+→` 가 블록을 넘으면 범위가 뒤집히던 그 자리.
   *
   * `editor-view-dom` 의 같은 이름 함수에 있던 결함 둘이 여기에도 글자까지 같이 있었다. 저쪽은
   * 고쳐졌고 이쪽은 남아 있었다.
   *
   * 하나: 답을 `isEnd` 가 골랐다 — `isEnd ? 런의 끝 : 런의 시작`. **`isEnd` 는 *범위의 어느 쪽*
   * 인가이고 *요소 안의 어디* 인가가 아니다** — 그건 `offset` 이 말한다. 그래서 다음 문단의 맨
   * 앞(`offset: 0`)이 그 문단의 **끝**이 됐다.
   *
   * 둘: `t.compareDocumentPosition(child)` 로 물어서, `child` 가 `t` 를 **포함**하는 흔한 경우(요소
   * 오프셋 0의 자식이 런의 `<span>` 이고 텍스트 노드가 그 안에 있다)에 `FOLLOWING` 이 서지 않았다.
   * `child` 쪽에서 물으면 포함이 `CONTAINED_BY | FOLLOWING` 이라 한 번에 답이 된다.
   *
   * **규칙:** 경계가 어떤 런의 앞이면 그 런의 시작, 모든 런의 뒤면 마지막 런의 끝. `isEnd` 는 글자가
   * 하나도 없는 그릇에서만 쓰인다.
   */
  private modelOffsetAtElementBoundary(
    containerEl: Element,
    el: Element,
    offset: number,
    runs: ContainerRuns,
    isEnd: boolean
  ): number {
    const child = el.childNodes.item(offset) ?? null;

    const walker = document.createTreeWalker(containerEl, NodeFilter.SHOW_TEXT);
    let lastBefore: Text | null = null;
    let firstAtOrAfter: Text | null = null;

    for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
      if (!child) {
        lastBefore = t;
        continue;
      }
      if (child.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING) {
        firstAtOrAfter = t;
        break;
      }
      lastBefore = t;
    }

    if (firstAtOrAfter) {
      const entry = runs.byNode?.get(firstAtOrAfter);
      if (entry) return entry.start;
    }
    if (lastBefore) {
      const entry = runs.byNode?.get(lastBefore);
      if (entry) return entry.end;
    }

    return isEnd ? runs.total : 0;
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

  /**
   * **모델 선택을 DOM 선택으로** — 그리고 네 종류 중 하나만 DOM 이 말할 수 있다.
   *
   * | 모델 | DOM |
   * |---|---|
   * | `range` | 그 범위를 세운다 |
   * | `node` · `cell` · `table` | **지운다** — 집합이고, 집합에는 두 끝이 없다 |
   * | 없음 | 지운다 |
   *
   * 전에는 `node` 가 `convertNodeSelectionToDOM` 으로 갔고 그 함수는 `nodeSelection.nodeId` 를
   * 읽었다 — **아무 생산자도 세우지 않는 필드다**(`createNodeSelection` 은 `nodeIds` 복수,
   * `selectNode` 는 `range`). 그래서 그 분기는 한 번도 아무 일을 한 적이 없고, 하던 일은 이전 DOM
   * 선택을 그대로 두는 것이었다 — 도형을 고르면 직전의 글자 강조가 남는다. `cell` 과 `table` 은
   * 아무 갈래에도 안 들어가서 조용히 지나갔다(`editor-view-dom` 쪽은 경고를 찍었고, 셀 드래그 한
   * 번에 한 번씩 나는 것을 브라우저에서 셌다).
   *
   * **그리고 이 결함을 타입 검사가 찾았다.** 이 층의 `ModelSelection` 사본을 걷고 `editor-core` 의
   * 것을 쓰자 *`ModelSelection` 에 `nodeId` 가 없다* 고 말했다. 사본이 있는 동안은 사본에 `nodeId`
   * 가 있었으므로 통과했다 — **읽는 쪽과 타입이 사이좋게 틀려 있었다.**
   */
  convertModelSelectionToDOM(modelSelection: MaybeSelection | null | undefined): void {
    this._isProgrammaticChange = true;
    try {
      if (!modelSelection || modelSelection.type === 'none') {
        window.getSelection()?.removeAllRanges();
        return;
      }
      if (modelSelection.type === 'range') {
        this.convertRangeSelectionToDOM(modelSelection);
      } else if (modelSelection.type === 'cell' || modelSelection.type === 'table') {
        /*
         * **셀과 표는 지운다.** 그 선택을 만드는 것은 `installCellSelection` 하나이고, 그것이 이미
         * 손으로 DOM 선택을 지운다 — 그 파일에 이유가 적혀 있다: *빈 DOM 선택이 두 가지가 서로
         * 싸우는 것을 막는다.* 여기서 지우는 것은 그 유일한 생산자가 하는 일과 같아지는 것이다.
         */
        window.getSelection()?.removeAllRanges();
      }
      /*
       * **`node` 는 DOM 선택을 건드리지 않는다 — 재보고 정한 것이다.**
       *
       * 처음엔 셋을 다 지웠다. *집합에는 두 끝이 없으니 DOM 은 아무것도 말하지 않는다* 는 논거였고,
       * 브라우저가 그것을 반박했다: 슬라이드 검사 **여덟 개**가 `range` 를 기대하고 `node` 를 받았다.
       * 텍스트 상자를 더블클릭하면 첫 누름이 도형을 고르고(→ `node`) 둘째 누름이 안으로 들어가
       * 캐럿을 놓는데, 첫 누름에서 DOM 선택을 지우면 그 길이 끊긴다.
       *
       * 그래서 구별은 *집합인가* 가 아니라 **그 선택을 만든 제스처가 글자 선택을 대신하려는
       * 것인가** 다. 셀 드래그는 그렇다 — 글자 선택을 일부러 걷어내고 셀 집합으로 바꾼다. 도형 선택은
       * 아니다 — 글자 선택으로 **가는 중** 일 수 있다. `node` 는 *이 도형이 골라졌다* 를 말할 뿐
       * *아무것도 타이핑되지 않는다* 를 말하지 않는다.
       *
       * 남는 값: 도형을 고른 뒤 직전의 글자 강조가 화면에 남을 수 있다. 그건 아직 잰 적 없는
       * 불편이고, 재서 나오면 그때 제품 쪽 제스처가 답할 일이다 — 여기서 추측으로 지우지 않는다.
       */
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

    const scopeRoot = this._getScopeRoot();
    const startElementRaw = scopeRoot.querySelector(`[data-bc-sid="${startNodeId}"]`);
    const endElementRaw = scopeRoot.querySelector(`[data-bc-sid="${endNodeId}"]`);
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

  private getTextRunsForContainer(container: Element): ContainerRuns | null {
    try {
      const containerId = container.getAttribute('data-bc-sid');
      return buildTextRunIndex(container, containerId ?? undefined, {
        buildReverseMap: true,
        excludePredicate: (el) =>
          this.isDecoratorElement(el),
      });
    } catch {
      return null;
    }
  }

  private isDecoratorElement(el: Element): boolean {
    return (
      el.hasAttribute('data-decorator-sid') ||
      el.hasAttribute('data-bc-decorator-sid') ||
      el.hasAttribute('data-bc-decorator') ||
      el.hasAttribute('data-decorator-category')
    );
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
        offset: lastRun.domStart + lastRun.text.length,
      };
    }

    const totalRuns = runs.runs.length;
    if (totalRuns === 0) return null;

    let runIndex = binarySearchRun(runs.runs, modelOffset);
    if (runIndex === -1) {
      let fallbackIndex = -1;
      for (let i = 0; i < totalRuns; i += 1) {
        const run = runs.runs[i];
        if (modelOffset < run.start) {
          fallbackIndex = i;
          break;
        }
        if (modelOffset === run.end && i + 1 < totalRuns) {
          fallbackIndex = i + 1;
          break;
        }
      }
      if (fallbackIndex === -1) return null;
      runIndex = fallbackIndex;
    }

    const run = runs.runs[runIndex];
    const localOffset = modelOffset - run.start;
    return {
      node: run.domTextNode,
      // domStart skips a leading filler so the caret lands after it, not before
      offset: run.domStart + Math.min(localOffset, run.text.length),
    };
  }
}
