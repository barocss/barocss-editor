/**
 * **문서의 선택** — 이 저장소에서 *어디가 골라졌나* 를 말하는 어휘 전부.
 *
 * ## 왜 `editor-core` 가 아니라 여기인가
 *
 * 로드맵 Phase 1 의 첫 단계가 *"`ModelSelection` 을 `schema` 나 `shared` 로 내린다"* 였고, 근거는
 * *"그래프가 순환처럼 읽힌다"* 였다. **그 근거는 사라졌다** — 그래프는 DAG 다. 지금의 근거는 다른
 * 것이고, 재고 나왔다:
 *
 * **DOM↔모델 변환을 두 뷰 층 아래에 두려면 선택 타입도 그 아래에 있어야 한다.**
 *
 * `editor-view-dom` 과 `editor-view-react` 에 같은 이름의 private 메서드가 **열한 개** 있고, 그 둘이
 * 쓰는 런 색인(`buildTextRunIndex`·`binarySearchRun`·`ContainerRuns`)은 **이미 이 패키지에 있다**
 * (`text-run-index/`). `renderer-dom` 쪽 것은 순수 재내보내기 15줄이라 같은 구현이다. 그러니 그
 * 열한 개가 갈 자리도 여기이고, 그러려면 그것들이 다루는 타입이 여기 있어야 한다.
 *
 * 미룬 값은 이미 한 번 치렀다: 이 타입이 편집 층에 사는 동안 `editor-view-react` 가 **자기 판을 두
 * 번** 선언했고, 그 두 판은 `cell` 도 `table` 도 표현하지 못했다 — React 경로로는 표의 셀을 고를 수
 * 없었다는 뜻이다.
 *
 * ## 옮겨도 아무것도 안 바뀐다
 *
 * 여기 있는 열은 **의존이 0** 이다: 문자열과 숫자와, 인자로 받은 함수뿐이다. `withLiveNodes` 조차
 * `getNode` 를 인자로 받는다. 그리고 `editor-core` 가 이것을 그대로 다시 내보내므로, 이 타입을
 * 참조하는 **118개 파일이 한 줄도 안 바뀐다** — 제품과 확장이 *편집기의 어휘* 로 선택을 배우는 것이
 * 맞고, 여기서 직접 가져가야 하는 것은 **뷰 층 둘** 뿐이다.
 *
 * ## `Selection` 이라는 이름의 함정
 *
 * DOM lib 이 이미 갖고 있다. `Selection = ModelSelection | NoSelection` 을 DOM 선택도 다루는 층에
 * 들이면 `convertDOMSelectionToModel(selection: Selection)` 이 어느 쪽인지 모호해진다 — 실제로
 * 해보니 다섯 자리에서 *ModelSelection 에 anchorNode 가 없다* 고 했다. 그게 이 타입이 선언된 채
 * 오래 아무도 안 쓴 이유일 것이다. 뷰 층은 유니온을 자기 이름으로 적는다(`MaybeSelection`).
 */

export type SelectionType = 'range' | 'node' | 'cell' | 'table';

/**
 * Model Selection type - represents selection/range within the editor
 * Always guarantees start ≤ end (normalized)
 */
export interface ModelSelection {
  type: SelectionType;
  startNodeId: string;
  startOffset: number;
  endNodeId: string;
  endOffset: number;
  collapsed?: boolean;  // Cursor is represented as a range with collapsed: true
  direction?: 'forward' | 'backward' | 'none';
  /**
   * Every node in the selection, when what is selected is nodes rather than a
   * span of text.
   *
   * A range says "from here to there", which is the right shape for text and the
   * wrong one for three shapes on a board or two cells in different rows: those
   * are a set, and a set with holes in it cannot be described by its endpoints.
   *
   * `startNodeId`/`endNodeId` stay populated with the first and last of them, so
   * that code written before this existed keeps working on one of the selected
   * nodes rather than on nothing. Anything that means "all of them" should ask
   * `selectedNodeIds()`.
   */
  nodeIds?: string[];
}

/**
 * The nodes a selection covers, for the kinds that select whole nodes.
 *
 * Returns an empty array for a text range: a range covers *parts* of nodes, and
 * treating its endpoints as a node set is how a caret in a paragraph turns into
 * "the paragraph is selected".
 */
export function selectedNodeIds(selection: ModelSelection | null | undefined): string[] {
  if (!selection) return [];
  if (selection.type === 'range') return [];
  if (selection.nodeIds && selection.nodeIds.length > 0) return [...selection.nodeIds];

  // A selection made before this field existed, or one that covers a single node
  return selection.startNodeId === selection.endNodeId
    ? [selection.startNodeId]
    : [selection.startNodeId, selection.endNodeId];
}

/**
 * A selection of whole nodes.
 *
 * Order is the caller's: it is the order the nodes were selected in, which is
 * not always document order and is what a user expects when a command reports
 * on them.
 */
export function createNodeSelection(
  nodeIds: string[],
  type: SelectionType = 'node'
): ModelSelection | null {
  if (nodeIds.length === 0) return null;
  return {
    type,
    nodeIds: [...nodeIds],
    startNodeId: nodeIds[0],
    startOffset: 0,
    endNodeId: nodeIds[nodeIds.length - 1],
    endOffset: 0,
    collapsed: false,
    direction: 'none'
  };
}

/**
 * The same selection with the nodes that are **gone** taken out of it.
 *
 * Measured: selecting three shapes and deleting the middle one left all three selected. The check
 * that guards a selection against a deleted node asks only about `startNodeId` and `endNodeId` —
 * right for a range, which is what it was written for, and blind to a set, where the deleted node
 * is usually neither end. The next command then acted on a node the store no longer has.
 *
 * Pruned rather than cleared, because that is what a reader means: two of my three shapes are still
 * here and still selected. Cleared only when *nothing* survives, which is the same "no nodes and no
 * selection are one state" rule `createNodeSelection` follows.
 *
 * A **range** is handed back untouched: it covers parts of nodes rather than a set of them, and its
 * endpoints are what the alive check is for.
 */
export function withLiveNodes(
  getNode: (id: string) => unknown,
  selection: ModelSelection | null | undefined
): ModelSelection | null {
  if (!selection) return null;
  if (selection.type === 'range') return selection;

  const nodes = selectedNodeIds(selection);
  if (nodes.length === 0) return selection;

  const alive = nodes.filter((id) => !!getNode(id));
  if (alive.length === nodes.length) return selection;
  if (alive.length === 0) return null;

  // The endpoints follow the survivors, or they would keep naming what has gone.
  return {
    ...selection,
    nodeIds: alive,
    startNodeId: alive[0],
    endNodeId: alive[alive.length - 1]
  };
}

export interface NoSelection {
  type: 'none';
}

export type Selection = ModelSelection | NoSelection;

/**
 * Convert DOM Selection (anchor/focus) to ModelSelection
 * Normalizes anchor/focus to start/end and preserves direction information
 */
export function fromDOMSelection(
  anchorId: string,
  anchorOffset: number,
  focusId: string,
  focusOffset: number,
  selectionType: SelectionType = 'range',
  compareNodeOrder?: (a: string, b: string) => number
): ModelSelection {
  // Single node case
  if (anchorId === focusId) {
    const isForward = anchorOffset <= focusOffset;
    const start = Math.min(anchorOffset, focusOffset);
    const end = Math.max(anchorOffset, focusOffset);
    return {
      type: selectionType,
      startNodeId: anchorId,
      startOffset: start,
      endNodeId: focusId,
      endOffset: end,
      collapsed: start === end,
      direction: start === end ? 'none' : (isForward ? 'forward' : 'backward')
    };
  }
  
  /**
   * **두 노드에 걸친 경우 — 어느 쪽이 문서에서 앞인가.**
   *
   * 예전 기본값은 `(a, b) => a.localeCompare(b)` 였다. sid 를 **문자열로** 비교한 것이고, 그건 문서
   * 순서가 아니다. sid 는 `note-c0huyw:9` 처럼 접두어와 숫자로 되어 있어서 자리수가 넘어가는 순간
   * 사전순이 뒤집힌다 — `"9"` 가 `"11"` 보다 크다. 그리고 그 결과가 `startNodeId` 와 `endNodeId` 를
   * **맞바꾼다.**
   *
   * 그게 `Shift+→` 로 문단을 넘을 때 범위가 뒤집히던 원인의 절반이었다. 서른세 번째 누름에서 모델이
   * `3:0 → 1:25` 이 됐고, `direction` 은 여전히 `forward` 이고, DOM 쪽은 `setEnd` 가 시작보다 앞인
   * 끝을 받아 **접혔다** — 화면에 표시가 없고 그 상태의 굵게는 아무 일도 안 한다. 자리수를 넘지 않는
   * 동안은 우연히 맞아서, 짧은 문서에서는 재현되지 않는다.
   *
   * **기본값은 이제 *준 순서를 믿는 것*이다.** 이 함수의 실제 호출자 셋은 모두 `range.startContainer`
   * 와 `range.endContainer` 를 넘기고, DOM `Range` 의 두 끝은 **정의상 문서 순서**다. 그러니 정렬할
   * 것이 없다. anchor/focus 를 넘기는 호출자(뒤로 고른 선택을 구분해야 하는 쪽)는 `compareNodeOrder`
   * 를 주면 되고, 그것이 이 인자가 있는 이유다.
   *
   * 문자열 비교로 돌아가지 않는다: 모르는 채로 틀리게 정렬하는 것보다 준 대로 두는 것이 낫다.
   */
  const compare = compareNodeOrder ?? (() => -1);
  const order = compare(anchorId, focusId);
  const isForward = order <= 0;
  const startNodeId = isForward ? anchorId : focusId;
  const startOffset = isForward ? anchorOffset : focusOffset;
  const endNodeId = isForward ? focusId : anchorId;
  const endOffset = isForward ? focusOffset : anchorOffset;

  return {
    type: selectionType,
    startNodeId,
    startOffset,
    endNodeId,
    endOffset,
    collapsed: false,
    direction: isForward ? 'forward' : 'backward'
  };
}

/**
 * Type guard: Check if selection is ModelSelection
 */
export function isModelSelection(selection: Selection): selection is ModelSelection {
  return selection.type !== 'none';
}

/**
 * Type guard: Check if selection is Range Selection
 */
export function isRangeSelection(selection: Selection): selection is ModelSelection {
  return selection.type === 'range';
}

/**
 * Type guard: Check if selection is Node Selection
 */
export function isNodeSelection(selection: Selection): selection is ModelSelection {
  return selection.type === 'node';
}

/**
 * Type guard: Check if selection is Cursor (collapsed range)
 */
export function isCursor(selection: Selection): selection is ModelSelection {
  return isRangeSelection(selection) && selection.collapsed === true;
}