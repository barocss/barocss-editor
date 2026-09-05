import type { Editor } from '@barocss/editor-core';
import { fromDOMSelection } from '@barocss/editor-core';
import {
  bestContainer,
  buildTextRunIndex,
  closestDataNode,
  resolveBoundaries,
  selectionDirection,
  type ResolvedBoundaries,
  collapseBoundaries,
  domPointFromModelOffset,
  isTextContainer,
  offsetAtElementBoundary,
  offsetWithRuns,
  runsOf,
  textContainerInside,
  type ContainerRuns,
  type PositionContext,
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

  /**
   * **자리 계산이 문서에 묻는 것 전부** — `@barocss/shared` 의 규칙 한 벌이 이것만 받는다.
   *
   * DOM 판과 **같은 것을 부른다.** 그 전에는 열아홉 개의 같은 이름 메서드가 각자 있었고, 기계로
   * 대보니 표기만 다른 것 여섯에 논리가 다른 것 하나였다 — 빈 그릇에서 이 판은 캐럿을 요소 경계에
   * 두었고 DOM 판은 채움 글자 안에 두었다. `docs/specs/text-position.md`.
   */
  private readonly _positions: PositionContext = {
    getNode: (sid: string) =>
      (this.editor as { dataStore?: { getNode?: (id: string) => unknown } }).dataStore?.getNode?.(sid) as
        | { text?: unknown; stype?: unknown }
        | null
  };
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
    const boundaries = this._convertRangeBoundariesToModel(
      range.startContainer,
      range.startOffset,
      range.endContainer,
      range.endOffset
    );
    if (!boundaries) return { type: 'none' };

    const { startNodeId, startModelOffset, endNodeId, endModelOffset } = boundaries;

    /**
     * **접힌 DOM 선택은 접힌 모델 선택이다** — `editor-view-dom` 의 같은 자리와 같은 이유.
     *
     * 경계가 블록 요소일 때 시작은 그 안의 첫 런, 끝은 마지막 런으로 내려간다. 두 경계가 같은
     * 자리였어도 서로 다른 런으로 갈라지므로, `range.collapsed` 를 묻지 않으면 캐럿이 선택으로
     * 읽힌다. 브라우저가 이미 답한 것을 잃지 않는다.
     */
    if (range.collapsed) {
      /* 어느 쪽으로 접는지, 왜 그런지는 `collapseBoundaries` 에 재본 표와 함께 적혀 있다. */
      const { nodeId, offset } = collapseBoundaries(range.startContainer, range.startOffset, boundaries);
      return {
        ...fromDOMSelection(nodeId, offset, nodeId, offset, 'range'),
        direction: 'none' as const
      };
    }

    const startNode = this.findBestContainer(range.startContainer);
    /* 끝 경계는 그 안의 **마지막** 런이다 — `editor-view-dom` 의 같은 자리와 같게. */
    const endNode = this.findBestContainer(range.endContainer, true);
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
    const boundaries = this._convertRangeBoundariesToModel(
      staticRange.startContainer,
      staticRange.startOffset,
      staticRange.endContainer,
      staticRange.endOffset
    );
    if (!boundaries) return null;

    /**
     * **타이핑도 같은 경계를 지난다.** `getTargetRanges()` 가 캐럿에 대해 주는 것은 접힌 범위이고,
     * 그 경계가 블록이면 여기서도 `t1:2 → t2:2` — *둘째 런 전체* 로 읽힌다. 그 자리에서 글자를 치면
     * 고른 것을 지우고 쓴다. 선택을 읽는 쪽만 고치고 여기를 두면 결함은 조용한 쪽으로 옮겨간다.
     */
    if (staticRange.collapsed) {
      const { nodeId, offset } = collapseBoundaries(
        staticRange.startContainer,
        staticRange.startOffset,
        boundaries
      );
      const one = fromDOMSelection(nodeId, offset, nodeId, offset, 'range');
      return { ...one, type: 'range' as const, direction: 'forward' as const };
    }

    const { startNodeId, startModelOffset, endNodeId, endModelOffset } = boundaries;
    /*
     * `fromDOMSelection` 을 지나야 `collapsed` 가 서고 문서 순서가 정규화된다. 손으로 세운 리터럴은
     * 그 둘을 안 하므로, 같은 함수의 두 판이 서로 다른 모양을 내보내고 있었다.
     */
    const modelSelection = fromDOMSelection(startNodeId, startModelOffset, endNodeId, endModelOffset, 'range');
    return { ...modelSelection, type: 'range' as const, direction: 'forward' as const };
  }

  private _convertRangeBoundariesToModel(
    startContainer: Node,
    startOffset: number,
    endContainer: Node,
    endOffset: number
  ): ResolvedBoundaries | null {
    return resolveBoundaries(startContainer, startOffset, endContainer, endOffset, this._positions);
  }

  private isTextContainer(element: Element): boolean {
    return isTextContainer(element, this._positions);
  }

  private nodeExistsInModel(nodeId: string): boolean {
    try {
      const ds = this.editor.dataStore;
      if (ds) return ds.getNode(nodeId) != null;
      /* dataStore 가 없는 뷰는 모델을 못 물으므로, 있는 것으로 본다. */
      return true;
    } catch {
      return false;
    }
  }

  private findClosestDataNode(node: Node): Element | null {
    return closestDataNode(node);
  }

  private textContainerInside(el: Element, last: boolean): Element | null {
    return textContainerInside(el, this._positions, last);
  }

  private findBestContainer(node: Node, forEnd = false): Element | null {
    return bestContainer(node, this._positions, forEnd);
  }

  /**
   * **데코레이터를 거르는 규칙을 여기서 다시 쓰지 않는다** — `editor-view-dom` 의 같은 함수와 같은
   * 이유이고, 이쪽은 더 조용히 틀려 있었다.
   *
   * `buildTextRunIndex` 안에 이미 더 정확한 답이 있다(`isDecoratorOwnText`): **인라인** 데코레이터는
   * 이미 있는 글자의 한 구간을 감싸므로 그 안의 글자는 노드 자신의 것이고 색인되어야 한다.
   *
   * 여기서는 **양쪽 방향이 다 그것을 덧걸렀다.** 그래서 왕복은 맞고 오프셋이 늘 틀렸다 —
   * `가나[다라]마바` 에서 대괄호가 인라인 데코레이터일 때 `마` 뒤가 모델에서 5인데 **3** 으로
   * 읽힌다. 두 방향이 같은 만큼 틀리므로 화면에서는 아무 일도 안 일어난 것처럼 보이고, 그 오프셋이
   * 명령으로 넘어가는 순간 엉뚱한 글자가 지워진다.
   *
   * `editor-view-dom` 은 한쪽만 덧걸러서 **왕복이 어긋났다**. 같은 원인, 다른 증상.
   */
  private ensureRuns(containerEl: Element, containerId: string): ContainerRuns {
    return buildTextRunIndex(containerEl, containerId, { buildReverseMap: true });
  }

  private convertOffsetWithRuns(
    containerEl: Element,
    container: Node,
    offset: number,
    runs: ContainerRuns,
    isEnd: boolean
  ): number {
    return offsetWithRuns(containerEl, container, offset, runs, isEnd);
  }

  private modelOffsetAtElementBoundary(
    containerEl: Element,
    el: Element,
    offset: number,
    runs: ContainerRuns,
    isEnd: boolean
  ): number {
    return offsetAtElementBoundary(containerEl, el, offset, runs, isEnd);
  }

  private determineSelectionDirection(
    selection: Selection,
    startNode: Element,
    endNode: Element,
    startOffset: number,
    endOffset: number
  ): 'forward' | 'backward' {
    return selectionDirection(selection, startNode, endNode, startOffset, endOffset, this._positions);
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
    return runsOf(container);
  }



  private findDOMRangeFromModelOffset(
    runs: ContainerRuns,
    modelOffset: number,
    container?: Element
  ): { node: Node; offset: number } | null {
    return domPointFromModelOffset(runs, modelOffset, container);
  }
}
