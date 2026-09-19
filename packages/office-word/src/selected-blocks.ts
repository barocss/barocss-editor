import type { Editor, ModelSelection } from '@barocss/editor-core';
import type { DocumentNode } from '@barocss/office-text';

/**
 * **선택이 바꾸게 될 블록들.**
 *
 * `list-commands.ts` 의 비공개 `_blocks` 였다. 테두리가 두 번째 사용처가 되면서 꺼냈다 — 이 저장소가
 * `pagesOf` 에 적어 둔 그 이유다: *"페이지를 뜻하는 함수가 둘이면, 페이지가 뿌리의 직계 자식이
 * 아니게 되는 날 하나가 낡는다."* 문단을 뜻하는 함수도 마찬가지고, 그날은 표 안의 문단이 온다.
 *
 * 문단 서식은 블록의 것이므로 세 문단에 걸친 선택은 셋을 다 바꾼다 — 세 문단을 고르고 목록 단추를
 * 누르는 것이 그런 뜻이고, 테두리 단추도 같다.
 */
export function selectedBlocks(
  editor: Editor,
  selection: ModelSelection | null | undefined
): DocumentNode[] {
  const store: any = editor.dataStore;
  const rootId = editor?.getRootId() ?? '';
  const getNode = (id: string): DocumentNode | undefined => store?.getNode?.(id);
  if (!store || !selection || !rootId) return [];

  /** 이 지점을 담고 있는 블록 — 글자에서 위로 걸어 처음 만나는 블록. */
  const blockOf = (sid: string): DocumentNode | null => {
    let current: DocumentNode | undefined = getNode(sid);
    for (let depth = 0; current && depth < 64; depth++) {
      if (current.stype && typeof current.text !== 'string' && current.stype !== 'inline-text') {
        return current;
      }
      current = current.parentId ? getNode(current.parentId) : undefined;
    }
    return null;
  };

  // 양 끝이 다 있어야 범위를 걸을 수 있다; 되돌리기는 지워 버린 노드를 가리키는 선택을 남긴다.
  if (!getNode(selection.startNodeId)) return [];
  let sids: string[] = [selection.startNodeId];
  if (selection.endNodeId && getNode(selection.endNodeId)) {
    try {
      sids = store.getNodesInRange?.(selection.startNodeId, selection.endNodeId) ?? sids;
    } catch {
      sids = [selection.startNodeId];
    }
  }

  const blocks: DocumentNode[] = [];
  for (const sid of sids) {
    const block = blockOf(sid);
    if (block?.sid && !blocks.some((other) => other.sid === block.sid)) blocks.push(block);
  }
  return blocks;
}
