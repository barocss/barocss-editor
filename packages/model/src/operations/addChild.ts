import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import { defineOperationDSL } from './define-operation-dsl';
import type { INode } from '@barocss/datastore';


interface AddChildOperation {
  type: 'addChild';
  parentId: string;
  child: INode | string;
  position?: number;
}

export const addChild = defineOperationDSL(
  (...args: [INode | string, (number)?] | [string, INode | string, (number)?]) => {
    // control: (child, position?)
    if (args.length >= 1 && (typeof args[0] === 'string' || typeof args[0] === 'object') && (args.length === 1 || typeof args[1] === 'number')) {
      const [child, position] = args as [INode | string, (number)?];
      return { type: 'addChild', payload: { child, position } } as unknown as AddChildOperation;
    }
    // direct: (parentId, child, position?)
    const [parentId, child, position] = args as [string, INode | string, (number)?];
    return { type: 'addChild', payload: { parentId, child, position } } as unknown as AddChildOperation;
  },
  { atom: false, category: 'content' }
);

/**
 * addChild operation (DSL + runtime)
 *
 * 목적
 * - 부모에 자식 노드를 position 위치에 추가한다. DataStore.content.addChild 사용.
 *
 * 입력 형태(DSL)
 * - control(parentId, [ addChild(child, position?) ]) → payload: { child, position? }
 * - addChild(parentId, child, position?) → payload: { parentId, child, position? }
 */
/**
 * **넣은 것 안의 첫 글자** — 캐럿이 갈 자리.
 *
 * 전에는 `content[0]` 을 한 칸만 보고 그것을 `firstTextNodeId` 라 불렀다. 문단은 `content[0]` 이 곧
 * 글자 런이라 맞았고, **표는 `bTableHeader`** 다 — 구조 노드다. 이름이 값과 달랐다.
 *
 * 재고 나온 증상: 노트에서 2×2 표를 넣으면 모델 선택이 `bTableHeader` 에 앉고 DOM 선택은 첫 칸의
 * 런에 앉는다. 둘이 태어날 때부터 어긋나고 **칸을 클릭해도 안 고쳐진다** — DOM 선택이 이미 거기라
 * `selectionchange` 가 뜨지 않는다(브라우저에서 0회를 셌다). 그래서 캐럿으로 셀을 찾는 모든 것이
 * `null` 을 받는다: `nextCell` · `insertRowBelow` · `mergeCells`.
 *
 * 노트의 툴바가 그것을 가려 왔다 — 눌린 칸을 `cellId` 로 명시적으로 넘기기 때문이다. 키보드에는 그
 * 지팡이가 없고, 그래서 표에서 Tab 이 아무 일도 안 하는 것으로 나타났다.
 *
 * 깊이를 여덟로 묶는다. 문서 모델의 중첩은 표(표 → 헤더 → 칸 → 문단 → 런)가 가장 깊고 그것이 다섯이며,
 * 여덟이면 넉넉하다 — 그리고 순환이 생겨도 여기서 멈춘다. `TableExtension._placeCaretIn` 이 같은
 * 걷기를 갖고 있고, 그것과 이것이 같은 답을 내야 한다.
 */
function firstTextIn(context: TransactionContext, nodeId: string, depth = 0): string | null {
  if (depth > 8) return null;
  const node = context.dataStore.getNode(nodeId) as { text?: unknown; content?: unknown } | undefined;
  if (!node) return null;
  if (typeof node.text === 'string') return nodeId;
  if (!Array.isArray(node.content)) return null;
  for (const childId of node.content) {
    if (typeof childId !== 'string') continue;
    const found = firstTextIn(context, childId, depth + 1);
    if (found) return found;
  }
  return null;
}

defineOperation('addChild', async (operation: any, context: TransactionContext) => {
  const { parentId, nodeId, child, children, position } = operation.payload;
  const actualParentId = parentId || nodeId;
  const parent = context.dataStore.getNode(actualParentId);
  if (!parent) throw new Error(`Parent not found: ${actualParentId}`);

  /**
   * `removeChildren` names its inverse as this operation with a `children`
   * array, and this operation only ever read `child` — so the array arrived as
   * undefined and undo threw reading `.sid` of nothing. Undo after removing
   * several children crashed, and nothing had run one.
   */
  if (Array.isArray(children)) {
    const addedIds = children.map((one: any, index: number) =>
      context.dataStore.content.addChild(actualParentId, one, position != null ? position + index : undefined)
    );
    return {
      ok: true,
      data: addedIds.map((id: string) => context.dataStore.getNode(id)),
      inverse: { type: 'removeChildren', payload: { parentId: actualParentId, childIds: addedIds } }
    };
  }

  const childId = context.dataStore.content.addChild(actualParentId, child, position);
  const addedNode = context.dataStore.getNode(childId);
  const firstTextNodeId = firstTextIn(context, childId);
  context.lastCreatedBlock = { blockId: childId, firstTextNodeId };
  const selectionTargetNodeId = firstTextNodeId ?? childId;
  return {
    ok: true,
    data: addedNode,
    inverse: { type: 'removeChild', payload: { parentId: actualParentId, childId } },
    selectionAfter: { nodeId: selectionTargetNodeId, offset: 0 }
  };
});