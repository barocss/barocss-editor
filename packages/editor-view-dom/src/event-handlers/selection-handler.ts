import { DOMSelectionHandler } from '../types';
import { Editor, fromDOMSelection } from '@barocss/editor-core';
import { 
  buildTextRunIndex, 
  binarySearchRun, 
  type ContainerRuns, logger, LogCategory } from '@barocss/renderer-dom';
import {
  bestContainer,
  closestDataNode,
  collapseBoundaries,
  resolveBoundaries,
  selectionDirection,
  type ResolvedBoundaries,
  domPointFromModelOffset,
  firstTextNodeIn,
  isTextContainer,
  offsetAtElementBoundary,
  offsetWithRuns,
  runsOf,
  textContainerInside,
  type PositionContext
} from '@barocss/shared';

export class DOMSelectionHandlerImpl implements DOMSelectionHandler {
  private editor: Editor;

  /**
   * **자리 계산이 문서에 묻는 것 전부** — `@barocss/shared` 의 규칙 한 벌이 이것만 받는다.
   *
   * 그 규칙이 왜 여기가 아니라 거기 있는지는 `docs/specs/text-position.md` 에 있다. 요약: 같은
   * 이음매를 세 번 따로 기웠고 세 번 다 브라우저 회차가 찾아 줬다.
   */
  private readonly _positions: PositionContext = {
    getNode: (sid: string) => this.editor.dataStore?.getNode?.(sid) as { text?: unknown; stype?: unknown } | null
  };
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

    /**
     * The **view this handler belongs to** — see the field, which was given one for this reason and
     * then not used here.
     *
     * `editor._viewDOM` is one slot and holds whichever view was created last. The site builder
     * draws one page at three widths and mounts a fourth view of the whole document, so this
     * compared the reader's caret against a content layer it was never in, decided the selection was
     * *outside the editor*, and returned.
     *
     * What that cost, measured: **`editor.selection` never moved.** Wherever a reader clicked or
     * dragged on a page, the model held the collapsed caret that entering text had put there — so
     * every command that needs a range could not run. 굵게, 기울임, 복사, 잘라내기 and the link
     * picker were all permanently unavailable, each of them correct at its own end. A page builder
     * where text cannot be selected is not a text editor, and nothing reported it because every
     * `canExecute` was answering honestly about a selection that was genuinely collapsed.
     */
    const editorViewDOM = this.view ?? (this.editor as any)._viewDOM;
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

    /**
     * **접힌 DOM 선택은 접힌 모델 선택이다.**
     *
     * 경계가 블록 요소일 때 `findBestContainer` 는 시작을 *그 안의 첫 런* 으로, 끝을 *마지막 런* 으로
     * 내려보낸다(`forEnd`). 두 경계가 **같은 자리**였어도 — 즉 캐럿이었어도 — 서로 다른 런으로
     * 갈라진다. 재본 것: 런 둘을 가진 문단의 요소 경계에 캐럿을 두면 `t1:0 → t2:0`, `collapsed=false`.
     *
     * 그게 화면에 나타난 자리: 사이트에서 `/` 를 치면 슬래시 메뉴와 **버블 툴바가 같이** 떴다. 버블
     * 툴바는 `collapsed !== true` 면 뜨고(*"캐럿은 선택이 아니다 — `applyMark` 는 0글자에 아무것도
     * 안 한다"*), 캐럿이 선택으로 읽혔기 때문이다.
     *
     * `range.collapsed` 는 브라우저가 이미 답한 것이다. 그걸 묻지 않고 두 경계를 각자 해석하면,
     * 해석이 그 사실을 잃는다.
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
    const endNode = this.findBestContainer(range.endContainer, true);
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

  private findClosestDataNode(node: Node): Element | null {
    return closestDataNode(node);
  }

  private findBestContainer(node: Node, forEnd = false): Element | null {
    return bestContainer(node, this._positions, forEnd);
  }

  private textContainerInside(el: Element, last: boolean): Element | null {
    return textContainerInside(el, this._positions, last);
  }

  /**
   * **데코레이터를 거르는 규칙을 여기서 다시 쓰지 않는다.**
   *
   * `excludePredicate: (el) => el.hasAttribute('data-bc-decorator')` 였고, 그것이 `buildTextRunIndex`
   * 자신의 판단을 **덧걸렀다.** 그 안에는 이미 더 정확한 답이 있다 — `isDecoratorOwnText`:
   *
   * > *인라인 데코레이터는 이미 있는 글자의 한 구간을 감싼다 — 검색 히트, 주석 달린 구절 — 그러니 그
   * > 안의 글자는 노드 자신의 것이고 다른 글자처럼 색인되어야 한다. 나머지 종류는 자기 것을 그린다.*
   *
   * 그 프로세는 이 결함을 이미 서술해 뒀다: *"전부를 건너뛴 것은 조용히 누적되는 결함이었다."*
   *
   * ## 재보니 한 파일 안에서 두 방향이 서로 다른 답을 쓰고 있었다
   *
   * | | 거르는 규칙 |
   * |---|---|
   * | `ensureRuns` (DOM→모델) | `data-bc-decorator` 만 — **category 를 안 본다** |
   * | `getTextRunsForContainer` (모델→DOM) | `isDecoratorElement` — category 를 본다 |
   *
   * 그래서 왕복이 어긋난다. `가나[다라]마바` 에서 대괄호가 인라인 데코레이터일 때, 캐럿을 `마` 뒤에
   * 두고 읽으면 **3**(데코레이터의 두 글자를 안 셈), 그 3을 되돌려 놓으면 **데코레이터 안의 `다라`**
   * 로 간다. `category` 가 `block` 이거나 없으면 왕복이 맞는다 — **인라인일 때만** 어긋난다.
   *
   * 지우는 것이 고치는 것이다: 아무것도 넘기지 않으면 `buildTextRunIndex` 의 답이 그대로 쓰인다.
   */
  private ensureRuns(containerEl: Element, containerId: string): ContainerRuns {
    // Operate independently without DOMRenderer: build index directly
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
   * DOM 선택이 표현할 수 있는 것은 *여기서 저기까지* 하나뿐이다. 그래서:
   *
   * | 모델 | DOM |
   * |---|---|
   * | `range` | 그 범위를 세운다 |
   * | `node` · `cell` · `table` | **지운다** — 집합이고, 집합에는 두 끝이 없다 |
   * | 없음 | 지운다 |
   *
   * ## 전에는 셋이 다 틀렸다
   *
   * `node` 는 `convertNodeSelectionToDOM` 으로 갔고 그 함수는 `nodeSelection.nodeId` 를 읽었다 —
   * **아무것도 세우지 않는 필드다.** `createNodeSelection` 은 `nodeIds`(복수)를 세우고
   * `selectNode` 는 아예 `range` 를 만든다. 그래서 그 분기는 한 번도 아무 일을 한 적이 없고, 하던
   * 일은 *이전 DOM 선택을 그대로 두는 것* 이었다 — 도형을 고르면 직전의 글자 강조가 화면에 남는다.
   * `data-text-container` 를 아무도 안 써서 `isTextContainer` 가 한 번도 참이 아니었던 것과 같은
   * 모양이고, 같은 파일에서 두 번째다.
   *
   * `cell` 과 `table` 은 `console.warn('Unsupported selection type')` 으로 갔다. **셀을 끌 때마다**
   * 났다(브라우저에서 셌다: 드래그 한 번에 경고 한 번). 그런데 그 둘은 지원되지 않는 것이 아니라
   * *DOM 이 말할 수 없는 것* 이고, `installCellSelection` 은 이미 손으로 DOM 선택을 지우고 있었다 —
   * 답이 그 파일에 있는데 이 파일은 경고를 찍고 있었다.
   *
   * 지우는 것이 아무것도 안 하는 것보다 나은 이유: 지우지 않으면 브라우저의 강조가 남아 **두 가지가
   * 동시에 골라진 것처럼 보인다.** 그리고 `selection-handler` 가 앵커 없는 DOM 선택에서 일찍
   * 돌아오므로, 빈 DOM 선택이 한 박자 뒤에 모델 선택으로 되돌아와 이것을 덮는 일도 없다.
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
      
      /* Not logged, for the reason the one below it is not: every caret placement is one of these. */

    } catch (error) {
      console.error('[SelectionHandler] Error converting range selection to DOM:', error);
    }
  }

  private getTextRunsForContainer(container: Element): ContainerRuns | null {
    return runsOf(container);
  }

  private findFirstTextNode(root: Element): Text | null {
    return firstTextNodeIn(root);
  }

  private findDOMRangeFromModelOffset(
    runs: ContainerRuns,
    modelOffset: number,
    container?: Element
  ): { node: Node; offset: number } | null {
    return domPointFromModelOffset(runs, modelOffset, container);
  }
}
