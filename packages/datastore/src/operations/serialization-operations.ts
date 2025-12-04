import type { INode } from '../types';
import type { ModelSelection } from '@barocss/editor-core';
import type { DataStore } from '../data-store';

/**
 * 선택 범위를 JSON 형태(INode[])로 직렬화/역직렬화하는 유틸리티.
 *
 * 1단계 구현 범위:
 * - start/end 가 같은 노드인 경우: 해당 노드의 text 부분만 잘라서 새로운 노드로 반환.
 * - cross-node range 인 경우: 현재는 블록 단위로만 직렬화 (추가 세부 분리는 이후 확장).
 * - deserialize 시에는 새 sid 를 부여하고 parent/content 관계만 맞춰서 삽입.
 */
export class SerializationOperations {
  constructor(private dataStore: DataStore) {}

  /**
   * 선택된 범위를 JSON 노드 배열로 직렬화한다.
   */
  serializeRange(range: ModelSelection): INode[] {
    const nodes: INode[] = [];

    // 단일 노드 내 텍스트 range
    if (range.startNodeId === range.endNodeId) {
      const node = this.dataStore.getNode(range.startNodeId);
      if (!node) return [];

      if (typeof node.text === 'string') {
        const start = range.startOffset ?? 0;
        const end = range.endOffset ?? node.text.length;
        if (start >= end) return [];
        const text = node.text.substring(start, end);
        nodes.push({
          stype: node.stype,
          // text-only 조각만 포함 (content/children 은 현재 단계에서 포함하지 않음)
          text,
          marks: node.marks
        } as INode);
        return nodes;
      }

      // 텍스트가 없는 노드는 전체를 하나의 노드로 복사
      nodes.push({ ...node });
      return nodes;
    }

    // multi-node range: 현재 단계에서는 start~end 사이 텍스트 노드를 그대로 복사
    const allNodes = this.dataStore.getAllNodes();
    const startIndex = allNodes.findIndex(n => n.sid === range.startNodeId);
    const endIndex = allNodes.findIndex(n => n.sid === range.endNodeId);
    if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) {
      return [];
    }

    for (let i = startIndex; i <= endIndex; i++) {
      const node = allNodes[i];
      if (!node || typeof node.text !== 'string') continue;
      nodes.push({ ...node });
    }

    return nodes;
  }

  /**
   * JSON 노드 배열을 지정한 부모/위치에 삽입하고, 생성된 sid 목록을 반환한다.
   */
  deserializeNodes(
    inputNodes: INode[],
    targetParentId: string,
    targetPosition?: number
  ): string[] {
    const createdIds: string[] = [];
    const parent = this.dataStore.getNode(targetParentId);
    if (!parent) {
      return createdIds;
    }

    // parent.content 보장
    if (!Array.isArray(parent.content)) {
      parent.content = [];
      this.dataStore.updateNode(targetParentId, { content: parent.content });
    }

    const content = parent.content as string[];
    const insertAt = typeof targetPosition === 'number'
      ? Math.min(Math.max(targetPosition, 0), content.length)
      : content.length;

    // 현재 단계에서는 입력 노드가 루트 레벨 배열이라는 가정 하에,
    // 각 노드를 개별 문서 루트처럼 취급하여 createNodeWithChildren을 사용한다.
    const newIds: string[] = [];
    for (const node of inputNodes) {
      const cloned: INode = { ...node };
      cloned.parentId = targetParentId;
      const created = this.dataStore.core.createNodeWithChildren(cloned);
      newIds.push(created.sid!);
    }

    // parent.content 에 새 id 들 삽입
    content.splice(insertAt, 0, ...newIds);
    this.dataStore.updateNode(targetParentId, { content });

    createdIds.push(...newIds);
    return createdIds;
  }
}


