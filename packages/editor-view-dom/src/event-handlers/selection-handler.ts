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
  /**
   * **글자를 담은 것인가** — 모델에 묻습니다. DOM 속성에 묻던 것이고, 그 속성을 쓰는 곳이 없었습니다.
   *
   * `data-text-container="true"` 를 찾고 있었고, 저장소 전체에서 **그 속성을 쓰는 렌더러가 하나도
   * 없습니다.** 그래서 이 함수는 한 번도 참이 아니었고, `findBestContainer` 의 잘 적힌 걷기 —
   * *글자 그릇을 찾아 위로, 못 찾으면 …* — 는 언제나 마지막 갈래로 떨어졌다: 찾은 것을 그대로 돌려주기.
   *
   * 그 대가가 뒤집힌 범위였다. `Shift+→` 로 문단을 두 개 넘으면 브라우저의 끝 경계가 **문단 위**에
   * 남는데(글자 노드 안이 아니라 자식 인덱스), 그것이 모델의 끝점이 되어 `11:paragraph:28 →
   * 6:inline-text:25` 가 나온다 — 문서 순서가 거꾸로인 범위이고, DOM 선택은 비어 보인다.
   *
   * 모델이 답을 갖고 있다: 글자를 담은 노드는 `text` 가 문자열인 노드다. 그것을 물으면 걷기가 원래
   * 의도대로 돈다.
   */
  private isTextContainer(element: Element): boolean {
    const sid = element.getAttribute('data-bc-sid');
    if (!sid) return false;
    const node = this.editor.dataStore?.getNode?.(sid) as { text?: unknown } | undefined;
    return typeof node?.text === 'string';
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
    const endNode = this.findBestContainer(endContainer, true);

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

  private findBestContainer(node: Node, forEnd = false): Element | null {
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
    /**
     * **위로 못 찾으면 안으로 내려갑니다** — 블록을 그대로 돌려주지 않습니다.
     *
     * A `Shift+→` that steps past the end of a paragraph leaves the browser's boundary **on the
     * paragraph**, at a child index rather than inside a text node. Walking up finds no text
     * container — the parent is the document — and this used to hand the paragraph back as the
     * selection's end.
     *
     * What followed was worse than an odd sid: the model's range came out **inverted**
     * (`11:paragraph:28 → 6:inline-text:25`, with `direction: 'forward'`) and the DOM selection read
     * as empty. Measured by pressing `Shift+→` sixty times across three paragraphs — one boundary is
     * crossed correctly and the second flips it.
     *
     * So a boundary that lands on a block resolves to a run **inside** it, and which one depends on
     * which end this is: a start goes to the first, an end to the last. That is what the browser
     * itself means by a boundary at a child index — *everything from here* or *everything up to
     * here*.
     */
    const inside = this.textContainerInside(el, forEnd);
    if (inside) return inside;

    const sid = el.getAttribute('data-bc-sid');
    if (sid) {
      const model = this.editor.dataStore?.getNode?.(sid);
      if (model?.stype === 'document') return null;
    }
    return el;
  }

  /** The first or last text container inside a block — see `findBestContainer`. */
  private textContainerInside(el: Element, last: boolean): Element | null {
    const runs = [...el.querySelectorAll('[data-bc-sid]')].filter((one) => this.isTextContainer(one));
    if (runs.length === 0) return null;
    return (last ? runs[runs.length - 1] : runs[0]) as Element;
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
    // 요소 경계: 자식 색인이 가리키는 자리가 어느 런의 앞인지 뒤인지로 정한다.
    const el = container as Element;
    return this.modelOffsetAtElementBoundary(containerEl, el, offset, runs, isEnd);
  }

  /**
   * **경계가 요소일 때의 모델 오프셋** — `Shift+→` 가 블록을 넘으면 범위가 뒤집히던 그 자리.
   *
   * 브라우저는 문단 경계를 넘을 때 focus 를 텍스트 노드가 아니라 **요소**에 둔다: `focusNode` 가
   * 다음 문단이고 `focusOffset` 이 `0` — *첫 자식 앞* 이라는 뜻이다. 여기서 나와야 하는 답은 그
   * 문단의 글자 오프셋 `0` 이다.
   *
   * ## 두 겹의 같은 실수
   *
   * 전에는 답을 `isEnd` 가 골랐다 — `isEnd ? 런의 끝 : 런의 시작`, 그리고 `isEnd ? 마지막앞 :
   * 첫뒤`. **`isEnd` 는 *범위의 어느 쪽* 인가이고 *요소 안의 어디* 인가가 아니다.** 요소 안의 어디는
   * `offset` 이 이미 말한다. 그래서 다음 문단의 맨 앞이 그 문단 **끝**(28)으로 옮겨졌고, 범위는
   * `1:25 → 2:28` 이 됐다. 다음 누름에서 같은 규칙이 시작 쪽에도 걸려 `3:28 → 1:25` — 문서 순서로
   * 뒤집혔고, `direction` 은 여전히 `forward` 이고, DOM 범위는 `setEnd` 가 시작보다 앞인 끝을 받아
   * **접혔다**. 화면에 아무 표시가 없고, 그 상태의 굵게는 아무 일도 안 한다.
   *
   * 그리고 비교 자체도 틀렸다. `t.compareDocumentPosition(child)` 로 *`t` 가 경계 앞인가* 를
   * 물었는데, `child` 가 `t` 를 **포함**하는 흔한 경우(요소 오프셋 0의 자식이 런의 `<span>` 이고
   * 텍스트 노드가 그 안에 있다)에 `FOLLOWING` 이 서지 않는다. 그래서 안에 있는 텍스트가 *앞* 으로
   * 세어졌고 `firstAtOrAfter` 는 한 번도 정해지지 않았다. 방향을 뒤집어 `child` 쪽에서 물으면
   * 포함은 `CONTAINED_BY | FOLLOWING` 이라 한 번에 답이 된다.
   *
   * ## 규칙
   *
   * 경계가 어떤 런의 **앞**이면 그 런의 시작, 모든 런의 **뒤**면 마지막 런의 끝. `isEnd` 는 글자가
   * 하나도 없는 그릇에서만 쓰인다 — 그때는 요소 안의 어디라는 말 자체가 성립하지 않는다.
   */
  private modelOffsetAtElementBoundary(
    containerEl: Element,
    el: Element,
    offset: number,
    runs: ContainerRuns,
    isEnd: boolean
  ): number {
    /* `null` 이면 마지막 자식보다 뒤 — 요소의 끝을 가리키는 오프셋이다. */
    const child = el.childNodes.item(offset) || null;

    const walker = document.createTreeWalker(containerEl, NodeFilter.SHOW_TEXT);
    let lastBefore: Text | null = null;
    let firstAtOrAfter: Text | null = null;

    for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
      if (!child) {
        lastBefore = t;
        continue;
      }
      /*
       * `child` 에서 묻는다. `t` 가 `child` 안이면 `CONTAINED_BY | FOLLOWING`, 뒤면 `FOLLOWING`,
       * 앞이면 `PRECEDING` — 그래서 `FOLLOWING` 하나로 *경계의 뒤인가* 가 답이 된다.
       */
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

    // 글자가 없는 그릇. 여기서만 *범위의 어느 쪽* 인가가 답을 정한다.
    return isEnd ? runs.total : 0;
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
      /*
       * **거르는 규칙을 넘기지 않는다.** 여기 있던 주석이 *"buildTextRunIndex 안에서도 검사하지만
       * 명시적으로 넘긴다"* 였다 — 덧거른다는 것을 알고 적은 것이고, **넘긴 것이 덜 정확했다**:
       * `isDecoratorElement` 는 종류를 안 묻고, 인라인 데코레이터가 감싼 글자는 노드 자신의 것이라
       * 색인되어야 한다. `isDecoratorOwnText` 가 그것을 묻는다.
       *
       * 같은 파일의 `ensureRuns` 와 이곳이 서로 다르게 걸러서 **왕복이 어긋났다** —
       * `inline-decorator-offsets.test.ts` 를 보라.
       */
      const runs = buildTextRunIndex(container, containerId || undefined, {
        buildReverseMap: true // Generate reverse map (for O(1) lookup)
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
    
    /*
     * **Not logged.** This fires on every caret placement — a line of console per click and per
     * arrow key, in a product where a reader clicks into text constantly. The `console.warn` above
     * stays: it says a run could not be found, which is a fault. This said one was, which is the
     * ordinary case.
     */

    return {
      node: run.domTextNode,
      // domStart skips a leading filler so the caret lands after it, not before
      offset: run.domStart + Math.min(localOffset, run.text.length)
    };
  }
}
