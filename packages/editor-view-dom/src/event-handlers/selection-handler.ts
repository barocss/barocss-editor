import { DOMSelectionHandler } from '../types';
import { Editor, fromDOMSelection } from '@barocss/editor-core';
import { 
  buildTextRunIndex, 
  binarySearchRun, 
  type ContainerRuns 
} from '@barocss/renderer-dom';

export class DOMSelectionHandlerImpl implements DOMSelectionHandler {
  private editor: Editor;
  private _isProgrammaticChange: boolean = false; // 프로그래밍 방식의 Selection 변경 플래그

  constructor(editor: Editor) {
    this.editor = editor;
  }

  /**
   * DOM 요소가 텍스트 컨테이너인지 확인합니다.
   * data-text-container="true" 속성이 있으면 텍스트 컨테이너입니다.
   */
  private isTextContainer(element: Element): boolean {
    return element.getAttribute('data-text-container') === 'true';
  }

  /**
   * Model에 노드가 실제로 존재하는지 확인합니다.
   * Editor의 dataStore를 통해 노드 존재 여부를 검증합니다.
   */
  private nodeExistsInModel(nodeId: string): boolean {
    try {
      // Editor의 dataStore를 통해 노드 존재 여부 확인
      if (this.editor.dataStore) {
        const node = this.editor.dataStore.getNode(nodeId);
        return node !== null && node !== undefined;
      }

      return true; // 기존 동작 유지 (실제 노드들은 true)
    } catch (error) {
      console.warn('[SelectionHandler] Error checking node existence:', error);
      return false;
    }
  }

  handleSelectionChange(): void {
    // 프로그래밍 방식의 변경이면 무시
    if (this._isProgrammaticChange) {
      console.log('[SelectionHandler] Skipped: programmatic change');
      return;
    }

    const selection = window.getSelection();
    if (!selection) {
      console.log('[SelectionHandler] Skipped: no selection');
      return;
    }

    // Editor 외부의 Selection 변경은 무시
    const editorViewDOM = (this.editor as any)._viewDOM;
    if (!editorViewDOM || !editorViewDOM.contentEditableElement) {
      console.log('[SelectionHandler] Skipped: no editorViewDOM');
      return;
    }
    
    // Selection이 Editor의 contentEditable 내부에 있는지 확인
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
    
    // 둘 다 Editor 내부에 있어야 함
    if (!isAnchorInside || !isFocusInside) {
      console.log('[SelectionHandler] Skipped: selection outside editor');
      return;
    }
    
    // Devtool 영역 제외 (data-devtool 속성 체크)
    let node: Node | null = anchorNode;
    while (node) {
      if (node instanceof Element && node.hasAttribute('data-devtool')) {
        console.log('[SelectionHandler] Skipped: inside devtool');
        return; // Devtool 영역이면 무시
      }
      node = node.parentNode;
    }

    console.log('[SelectionHandler] Processing selection change');

    // DOM Selection을 Model Selection으로 변환
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

    // data-bc-sid를 가진 가장 가까운 요소 찾기 (텍스트 컨테이너를 우선)
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

    // Model에 노드가 실제로 존재하는지 확인
    if (!this.nodeExistsInModel(startNodeId) || !this.nodeExistsInModel(endNodeId)) {
      console.warn('[SelectionHandler] Node does not exist in model:', {
        startNodeId,
        endNodeId,
        startExists: this.nodeExistsInModel(startNodeId),
        endExists: this.nodeExistsInModel(endNodeId)
      });
      return { type: 'none' };
    }

    // Text Run Index 기반 글로벌 오프셋 계산
    const startRuns = this.ensureRuns(startNode, startNodeId);
    const endRuns = startNode === endNode ? startRuns : this.ensureRuns(endNode, endNodeId);

    const startModelOffset = this.convertOffsetWithRuns(startNode, startContainer, startOffset, startRuns, false);
    const endModelOffset = this.convertOffsetWithRuns(endNode, endContainer, endOffset, endRuns, true);

    // Selection 방향 결정
    const direction = this.determineSelectionDirection(selection, startNode, endNode, startModelOffset, endModelOffset);

    // fromDOMSelection 사용하여 정규화 (통일된 ModelSelection 형식 반환)
    const modelSelection = fromDOMSelection(startNodeId, startModelOffset, endNodeId, endModelOffset, 'range');
    
    return {
      ...modelSelection,
      direction // direction은 determineSelectionDirection에서 계산한 값으로 덮어쓰기
    };
  }

  private findClosestDataNode(node: Node): Element | null {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      if (element.hasAttribute('data-bc-sid')) {
        return element;
      }
    }

    // 부모 요소에서 data-bc-sid 찾기
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
    // 최우선: 텍스트 컨테이너인 노드
    let el = this.findClosestDataNode(node);
    if (!el) return null;
    
    if (this.isTextContainer(el)) {
      return el;
    }
    
    // 상위로 올라가며 텍스트 컨테이너를 찾되, 없다면 최초 data-bc-sid 유지
    let cur: Element | null = el;
    while (cur) {
      if (this.isTextContainer(cur)) {
        return cur;
      }
      cur = cur.parentElement?.closest?.('[data-bc-sid]') || null;
    }
    
    // document 같은 상위 컨테이너는 selection 컨테이너로 부적절 → 무시
    const sid = el.getAttribute('data-bc-sid');
    if (sid) {
      const model = this.editor.dataStore?.getNode?.(sid);
      if (model?.stype === 'document') return null;
    }
    return el;
  }

  private ensureRuns(containerEl: Element, containerId: string): ContainerRuns {
    // DOMRenderer 없이도 독립적으로 동작: 직접 인덱스 빌드
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
      // fallback: 가장 가까운 텍스트 런으로 스냅
      const idx = binarySearchRun(runs.runs, Math.max(0, Math.min(offset, runs.total - 1)));
      if (idx >= 0) return isEnd ? runs.runs[idx].end : runs.runs[idx].start;
      return 0;
    }
    // Element 노드인 경우: child index 기준 경계에 가장 가까운 텍스트 노드 탐색
    const el = container as Element;
    const boundaryText = this.findTextAtElementBoundary(containerEl, el, offset, isEnd);
    if (boundaryText) {
      const entry = runs.byNode?.get(boundaryText);
      if (entry) return isEnd ? entry.end : entry.start;
    }
    // 텍스트가 없으면 컨테이너의 시작/끝으로 스냅
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
        // child가 없다는 것은 offset이 끝 경계를 의미
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
    // 1. 같은 노드 내에서의 선택
    if (startNode === endNode) {
      return startOffset <= endOffset ? 'forward' : 'backward';
    }

    // 2. 다른 노드 간의 선택 - DOM 순서로 판단
    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    
    if (!anchorNode || !focusNode) {
      // DOM 순서로 판단 (compareDocumentPosition 사용)
      const position = startNode.compareDocumentPosition(endNode);
      return (position & Node.DOCUMENT_POSITION_FOLLOWING) ? 'forward' : 'backward';
    }

    // 3. anchor/focus 기반으로 판단
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

    // 4. 최종 fallback: DOM 순서
    const position = startNode.compareDocumentPosition(endNode);
    return (position & Node.DOCUMENT_POSITION_FOLLOWING) ? 'forward' : 'backward';
  }

  /**
   * Model selection을 DOM selection으로 변환합니다.
   */
  convertModelSelectionToDOM(modelSelection: any): void {
    // 프로그래밍 방식의 변경임을 표시
    this._isProgrammaticChange = true;
    
    try {
      if (!modelSelection || modelSelection.type === 'none') {
        // 선택 해제
        window.getSelection()?.removeAllRanges();
        return;
      }

      // 통일된 ModelSelection 형식 (startNodeId/startOffset/endNodeId/endOffset) 지원
      if (modelSelection.type === 'range') {
        this.convertRangeSelectionToDOM(modelSelection);
      } else if (modelSelection.type === 'node') {
        this.convertNodeSelectionToDOM(modelSelection);
      } else {
        console.warn('[SelectionHandler] Unsupported selection type:', modelSelection.type);
      }
    } finally {
      // 다음 이벤트 루프에서 플래그 해제 (selectionchange 이벤트가 처리된 후)
      setTimeout(() => {
        this._isProgrammaticChange = false;
      }, 0);
    }
  }

  /**
   * Range 선택을 DOM selection으로 변환합니다 (통일된 ModelSelection 형식).
   */
  private convertRangeSelectionToDOM(rangeSelection: any): void {
    const { startNodeId, startOffset, endNodeId, endOffset } = rangeSelection;
    
    console.log('[SelectionHandler] Converting range selection to DOM:', {
      startNodeId,
      startOffset,
      endNodeId,
      endOffset
    });
    
    // startNodeId와 endNodeId 노드 찾기
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

    // findBestContainer를 사용하여 텍스트 컨테이너 찾기
    // (convertDOMSelectionToModel과 동일한 로직 사용)
    // findBestContainer는 텍스트 컨테이너를 우선 찾고, 없으면 최초 data-bc-sid 요소를 반환
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
      // Text Run Index를 사용하여 정확한 DOM 위치 찾기
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

      // DOM Selection 설정
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
   * 노드 선택을 DOM selection으로 변환합니다.
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
   * 컨테이너의 Text Run Index를 가져옵니다.
   * data-bc-sid 하위의 모든 text node를 수집 (decorator 하위는 제외)
   * 
   * 주의: 캐시를 사용하지 않고 매번 새로 생성합니다.
   * 이유: DOM이 변경되면 Text Run Index도 무효화되어야 하는데,
   *       캐시 무효화 로직이 복잡하고, Text Run Index 생성 비용이 크지 않기 때문입니다.
   * 
   * 성능 고려사항:
   * - 일반적으로 inline-text 노드 하나당 text run은 몇 개 정도 (mark로 인해 분할되지만 많지 않음)
   * - TreeWalker 순회는 O(n) where n = text node 개수
   * - Selection 변환은 사용자 입력 시점에만 발생하므로 빈도가 높지 않음
   */
  private getTextRunsForContainer(container: Element): ContainerRuns | null {
    try {
      const containerId = container.getAttribute('data-bc-sid');
      
      // 매번 새로 생성 (캐시 사용 안 함)
      // DOM이 변경되면 Text Run Index도 무효화되어야 하므로,
      // 캐시 무효화 로직이 복잡한 대신 매번 새로 생성하는 것이 안전합니다.
      const runs = buildTextRunIndex(container, containerId || undefined, {
        buildReverseMap: true, // 역방향 맵 생성 (O(1) 조회를 위해)
        excludePredicate: (el) => {
          // decorator는 제외 (buildTextRunIndex 내부에서도 체크하지만 명시적으로 전달)
          return this.isDecoratorElement(el);
        },
        normalizeWhitespace: false // trim() 사용하지 않음 - 실제 DOM offset과 모델 offset 매칭을 위해
      });
      
      return runs;
    } catch (error) {
      console.warn('[SelectionHandler] Could not build text run index:', error);
      return null;
    }
  }

  /**
   * 요소가 decorator인지 확인
   */
  private isDecoratorElement(el: Element): boolean {
    return !!(
      el.hasAttribute('data-decorator-sid') ||
      el.hasAttribute('data-bc-decorator') ||
      el.hasAttribute('data-decorator-category')
    );
  }

  /**
   * Model offset을 DOM range로 변환합니다.
   */
  private findDOMRangeFromModelOffset(runs: ContainerRuns, modelOffset: number): { node: Node; offset: number } | null {
    if (modelOffset < 0 || modelOffset > runs.total) {
      console.warn('[SelectionHandler] Model offset out of range:', { modelOffset, total: runs.total });
      return null;
    }

    // modelOffset이 runs.total과 같을 때는 마지막 run의 끝 위치 사용
    if (modelOffset === runs.total) {
      const lastRun = runs.runs[runs.runs.length - 1];
      return {
        node: lastRun.domTextNode,
        offset: lastRun.domTextNode.textContent?.length || 0
      };
    }

    // Binary search로 적절한 run 찾기
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
