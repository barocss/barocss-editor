import { holdsText } from './text-position';
import type { ModelSelection } from './selection';

/**
 * **두 모델 자리 사이에 실제로 무슨 글자가 있나** — 그리고 왜 그 답이 여기 사는가.
 *
 * ## 이 함수가 답하는 마지막 한 칸
 *
 * `collapsed` 는 두 끝이 **같은 노드**일 때만 두 끝만으로 답이 난다. 그 규칙과 그 경계는
 * `editor-core/src/collapsed.ts` 에 적혀 있다. 남는 것이 하나인데, 그것이 값을 치른 자리다:
 *
 * ```
 * t1:2 → t2:0     // sid 가 둘이다. 그런데 두 런이 인접하면 **화면의 같은 점**이다.
 * ```
 *
 * `shared/src/selection.ts` 의 `fromDOMSelection` 은 sid 가 다르면 `collapsed: false` 를 적는다.
 * **두 끝만 보면 그게 옳은 답이다** — 사이에 글자가 있는지는 두 끝이 말하지 않는다. 알려면
 * 문서를 읽어야 하고, 문서를 읽는 것이 이 함수다.
 *
 * ## 왜 `editor-view-dom` 이 아니라 여기인가
 *
 * 이 함수는 `editor-view-dom/src/utils/edit-position-converter.ts` 에 있었고, 그것을 불러야 하는
 * 두 번째 자리가 `extensions/src/guards.ts` 의 `hasRange` 다. 확장은 뷰를 import 하지 않으므로,
 * 그 자리에서 부르려면 답이 두 벌이 되거나 아래로 내려와야 한다. 이 저장소가 되풀이해서 찾은
 * 결함이 정확히 앞의 것이고(`docs/specs/text-position.md` §"이것이 한 곳에 있어야 하는 이유"),
 * 그래서 내려왔다. `editor-view-dom` 은 같은 이름으로 다시 내보내므로 그쪽 호출자는 한 줄도
 * 안 바뀐다.
 *
 * 여기 있을 자격은 `text-position.ts` 와 같다: **의존이 없다.** 인자로 받은 저장소와, `text` 가
 * 문자열인지 묻는 것뿐이다.
 */

/** 이 계산이 문서에 물어야 하는 것 전부. 실제 `DataStore` 는 이보다 넓고, 넓은 것은 상관없다. */
export interface ModelTextReader {
  getNode(sid: string): unknown;
  getParent?(sid: string): unknown;
  getNextSibling?(sid: string): unknown;
  getNextNode?(sid: string): unknown;
}

/** sid 를 문자열로 — 저장소가 노드를 주기도 하고 sid 를 주기도 한다. */
function normalizeNodeId(node: unknown): string | null {
  if (!node) return null;
  if (typeof node === 'string') return node;
  return node && typeof node === 'object' && ('sid' in node || 'id' in node)
    ? ((node as { sid?: string; id?: string }).sid ?? (node as { id?: string }).id ?? null)
    : null;
}

/**
 * 범위가 덮는 글자를 **문서 순서로 조각씩** 준다. `onText` 가 `true` 를 돌려주면 거기서 멈춘다.
 *
 * 멈출 수 있어야 하는 이유가 있다: 이것을 부르는 쪽 하나는 *글자가 하나라도 있나* 만 묻는 **가드**
 * 이고, 가드는 그릴 때마다 돈다. 문서 절반을 고른 채로 매번 그 절반을 문자열로 이어 붙이면 답에는
 * 아무것도 안 보태고 값만 치른다.
 *
 * 문서를 못 걷는 저장소(`getNextNode` 도 `getParent` 도 없는 것)에서는 두 끝만 읽는다 — 그게
 * 그 저장소가 말할 수 있는 전부이고, 없는 걸음을 지어내는 것보다 낫다.
 */
function eachTextInRange(
  store: ModelTextReader | null | undefined,
  contentRange: ModelSelection,
  onText: (chunk: string) => boolean | void
): void {
  const { startNodeId, startOffset, endNodeId, endOffset } = contentRange;

  if (!store || typeof store.getNode !== 'function') {
    return;
  }

  const toModelOffset = (node: unknown, offset: number): number => {
    if (!holdsText(node)) return 0;
    return Math.max(0, Math.min(offset, node.text.length));
  };

  /* 이름 조건은 `holdsText` 가 이미 답하는 것을 한 번 더 물은 것이었다. */
  const isInlineText = (node: unknown): node is { text: string } => holdsText(node);

  const getParentId = (nodeId: string): string | null => {
    const parent = store.getParent?.(nodeId);
    if (!parent) return null;
    return normalizeNodeId(parent);
  };

  const getChildren = (nodeId: string): string[] => {
    const node = store.getNode?.(nodeId) as { content?: unknown } | null | undefined;
    const content = node?.content;
    if (!Array.isArray(content)) return [];
    return content.map(normalizeNodeId).filter((id): id is string => !!id);
  };

  const getNextSibling = (nodeId: string): string | null => {
    if (typeof store.getNextSibling === 'function') {
      return normalizeNodeId(store.getNextSibling(nodeId));
    }

    const parentId = getParentId(nodeId);
    if (!parentId) return null;
    const parentChildren = getChildren(parentId);
    const index = parentChildren.indexOf(nodeId);
    if (index < 0 || index >= parentChildren.length - 1) return null;
    return parentChildren[index + 1];
  };

  const getNextNodeInDocument = (nodeId: string): string | null => {
    if (typeof store.getNextNode === 'function') {
      return normalizeNodeId(store.getNextNode(nodeId));
    }

    let current = nodeId;
    const visited = new Set<string>();
    while (current) {
      if (visited.has(current)) return null;
      visited.add(current);
      const nextSibling = getNextSibling(current);
      if (nextSibling) return nextSibling;
      const parentId = getParentId(current);
      current = parentId ?? '';
    }

    return null;
  };

  const startNode = store.getNode(startNodeId);
  const endNode = store.getNode(endNodeId);

  if (!startNode || !endNode) {
    return;
  }

  // Same node case
  if (startNodeId === endNodeId) {
    if (!isInlineText(startNode)) return;
    const from = toModelOffset(startNode, startOffset);
    const to = toModelOffset(startNode, endOffset);
    onText(startNode.text.substring(from, to));
    return;
  }

  // Cross-node case
  if (isInlineText(startNode)) {
    if (onText(startNode.text.substring(toModelOffset(startNode, startOffset))) === true) return;
  }

  // Intermediate nodes (traverse if same parent)
  let currentNodeId: string | null = startNodeId;
  const visited = new Set<string>();
  while (currentNodeId && currentNodeId !== endNodeId) {
    if (visited.has(currentNodeId)) break;
    visited.add(currentNodeId);
    currentNodeId = getNextNodeInDocument(currentNodeId);
    if (!currentNodeId || currentNodeId === endNodeId) {
      break;
    }
    const node = store.getNode(currentNodeId);
    if (isInlineText(node) && onText(node.text) === true) return;
  }

  // Start portion of end node
  if (isInlineText(endNode)) {
    onText(endNode.text.substring(0, toModelOffset(endNode, endOffset)));
  }
}

/** 범위가 덮는 **글자**. 그릇이 아닌 노드는 아무것도 보태지 않는다. */
export function extractModelTextFromRange(
  store: ModelTextReader | null | undefined,
  contentRange: ModelSelection
): string {
  let result = '';
  eachTextInRange(store, contentRange, (chunk) => {
    result += chunk;
  });
  return result;
}

/**
 * **이 범위가 글자를 하나라도 고르나.**
 *
 * `hasRange(…, 'something')` 이 묻는 것이 정확히 이것이고, 그 질문은 *두 끝이 다른가* 가 아니다:
 * `t1:2 → t2:0` 은 두 끝이 다르고 고른 글자는 0개다. 그 자리에 마크를 걸면 커밋되고 아무것도
 * 안 바뀐다 — 이 저장소가 *guard says yes, then does nothing* 이라 부르는 것.
 *
 * **글자만 센다.** 두 런 사이에 원자(그림·구분선)가 있어도 아니라고 답한다. 그것들을 고르는 것은
 * `node` 선택의 일이고(`docs/specs/selection.md`), 이 술어를 쓰는 명령들은 전부 글자를 다룬다.
 *
 * 첫 글자에서 멈춘다 — 가드는 그릴 때마다 돌고, 문서 절반을 이어 붙여야 답이 나오는 술어는 그
 * 자리에 둘 수 없다.
 */
export function selectsCharacters(
  store: ModelTextReader | null | undefined,
  selection: ModelSelection
): boolean {
  let found = false;
  eachTextInRange(store, selection, (chunk) => {
    if (chunk.length === 0) return;
    found = true;
    return true;
  });
  return found;
}
