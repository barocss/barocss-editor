import { DataStore } from '@barocss/datastore';

/**
 * PositionCalculator는 절대 위치와 nodeId + offset 간의 변환을 담당하는 유틸리티 클래스입니다.
 * 
 * 이 클래스는 Barocss의 노드 경계 포함 Position 시스템을 구현하며,
 * ProseMirror와 유사한 방식으로 문서 전체를 선형 시퀀스로 처리합니다.
 * 
 * @example
 * ```typescript
 * const calculator = new PositionCalculator(dataStore);
 * 
 * // nodeId + offset을 절대 위치로 변환
 * const absolutePos = calculator.calculateAbsolutePosition('text-1', 3);
 * 
 * // 절대 위치를 nodeId + offset으로 변환
 * const nodePos = calculator.findNodeByAbsolutePosition(5);
 * ```
 */
export class PositionCalculator {
  private _dataStore: DataStore;

  constructor(dataStore: DataStore) {
    this._dataStore = dataStore;
  }

  /**
   * 절대 위치를 nodeId + offset으로 변환합니다.
   * 
   * 이 메서드는 문서 전체를 선형 시퀀스로 간주하여 주어진 절대 위치에
   * 해당하는 노드와 그 노드 내에서의 오프셋을 반환합니다.
   * 
   * @param absoluteOffset - 문서 전체에서의 절대 위치 (0부터 시작)
   * @returns 해당 위치의 노드 ID와 오프셋, 또는 null (위치를 찾을 수 없는 경우)
   * 
   * @example
   * ```typescript
   * const result = calculator.findNodeByAbsolutePosition(7);
   * // { nodeId: 'text-1', offset: 4 } - text-1 노드의 4번째 문자
   * ```
   */
  findNodeByAbsolutePosition(absoluteOffset: number): { nodeId: string; offset: number } | null {
    let currentOffset = 0;
    
    const traverse = (nodeId: string): { nodeId: string; offset: number } | null => {
      const node = this._dataStore.getNode(nodeId);
      if (!node) return null;

      // 노드 시작 위치 확인
      if (currentOffset === absoluteOffset) {
        return { nodeId: node.sid!, offset: 0 }; // 노드 시작
      }
      currentOffset += 1;

      // 텍스트 노드인 경우
      if (node.text) {
        const nodeLength = node.text.length;
        if (currentOffset + nodeLength > absoluteOffset) {
          return {
            nodeId: node.sid!,
            offset: Math.max(0, absoluteOffset - currentOffset)
          };
        }
        currentOffset += nodeLength;
      }

      // 컨테이너 노드인 경우 자식들을 순회
      if (node.content) {
        for (const childId of node.content) {
          const result = traverse(childId as string);
          if (result) return result;
        }
      }

      // 노드 끝 위치 확인
      if (currentOffset === absoluteOffset) {
        return { nodeId: node.sid!, offset: node.text ? node.text.length : 0 }; // 노드 끝
      }
      currentOffset += 1;

      return null;
    };

    const rootNode = this._dataStore.getRootNode();
    if (!rootNode) return null;

    return traverse(rootNode.sid!);
  }

  /**
   * nodeId + offset을 절대 위치로 변환합니다.
   * 
   * 이 메서드는 주어진 노드 ID와 그 노드 내에서의 오프셋을
   * 문서 전체에서의 절대 위치로 변환합니다.
   * 
   * @param nodeId - 대상 노드의 ID
   * @param offset - 노드 내에서의 오프셋 (0부터 시작)
   * @returns 문서 전체에서의 절대 위치
   * 
   * @throws {Error} 노드를 찾을 수 없는 경우
   * 
   * @example
   * ```typescript
   * const absolutePos = calculator.calculateAbsolutePosition('text-1', 3);
   * // 5 - text-1 노드의 3번째 문자의 절대 위치
   * ```
   */
  calculateAbsolutePosition(nodeId: string, offset: number): number {
    if (offset < 0) {
      throw new Error(`Invalid offset: ${offset}. Offset must be non-negative.`);
    }

    let absoluteOffset = 0;
    let targetNodeFound = false;
    
    const traverse = (currentNodeId: string): boolean => {
      const node = this._dataStore.getNode(currentNodeId);
      if (!node) return false;

      // 현재 노드가 목표 노드인 경우
      if (node.sid === nodeId) {
        targetNodeFound = true;
        // 노드 시작 위치 + offset
        absoluteOffset += offset;
        return true;
      }

      // 노드 시작 위치 추가 (1)
      absoluteOffset += 1;

      // 텍스트 노드인 경우 텍스트 길이 추가
      if (node.text) {
        absoluteOffset += node.text.length;
      }

      // 컨테이너 노드인 경우 자식들을 순회
      if (node.content) {
        for (const childId of node.content) {
          if (traverse(childId as string)) return true;
        }
      }

      // 노드 끝 위치 추가 (1)
      absoluteOffset += 1;

      return false;
    };

    const rootNode = this._dataStore.getRootNode();
    if (!rootNode) {
      throw new Error('Root node not found');
    }

    const found = traverse(rootNode.sid!);
    
    if (!found || !targetNodeFound) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    return absoluteOffset;
  }

  /**
   * 노드의 경로를 계산합니다.
   * 
   * 문서 루트부터 해당 노드까지의 경로를 배열로 반환합니다.
   * 
   * @param nodeId - 경로를 계산할 노드의 ID
   * @returns 노드 경로 배열 (루트부터 순서대로)
   * 
   * @example
   * ```typescript
   * const path = calculator.getNodePath('text-1');
   * // ['doc-1', 'para-1', 'text-1']
   * ```
   */
  getNodePath(nodeId: string): string[] {
    return this._dataStore.getNodePath(nodeId);
  }

  /**
   * 노드의 부모 ID를 가져옵니다.
   * 
   * @param nodeId - 부모를 찾을 노드의 ID
   * @returns 부모 노드의 ID, 또는 undefined (부모가 없는 경우)
   * 
   * @example
   * ```typescript
   * const parentId = calculator.getParentId('text-1');
   * // 'para-1'
   * ```
   */
  getParentId(nodeId: string): string | undefined {
    const node = this._dataStore.getNode(nodeId);
    return node?.parentId;
  }

  /**
   * 노드의 형제 노드 중 순서를 가져옵니다.
   * 
   * @param nodeId - 순서를 찾을 노드의 ID
   * @returns 형제 노드 중에서의 순서 (0부터 시작)
   * 
   * @example
   * ```typescript
   * const index = calculator.getSiblingIndex('text-1');
   * // 0 - 첫 번째 형제 노드
   * ```
   */
  getSiblingIndex(nodeId: string): number {
    return this._dataStore.getSiblingIndex(nodeId);
  }

  /**
   * 두 노드 간의 거리를 계산합니다.
   * 
   * @param nodeId1 - 첫 번째 노드의 ID
   * @param nodeId2 - 두 번째 노드의 ID
   * @returns 두 노드 간의 절대 위치 거리
   * 
   * @example
   * ```typescript
   * const distance = calculator.calculateDistance('text-1', 'text-2');
   * // 15 - 두 노드 간의 절대 위치 차이
   * ```
   */
  calculateDistance(nodeId1: string, nodeId2: string): number {
    try {
      const pos1 = this.calculateAbsolutePosition(nodeId1, 0);
      const pos2 = this.calculateAbsolutePosition(nodeId2, 0);
      return Math.abs(pos2 - pos1);
    } catch (error) {
      return -1;
    }
  }

  /**
   * 노드의 텍스트 길이를 반환합니다.
   * 
   * @param nodeId - 텍스트 길이를 계산할 노드의 ID
   * @returns 텍스트 길이, 또는 0 (텍스트가 없는 경우)
   * 
   * @example
   * ```typescript
   * const length = calculator.getTextLength('text-1');
   * // 11 - "Hello World"의 길이
   * ```
   */
  getTextLength(nodeId: string): number {
    const node = this._dataStore.getNode(nodeId);
    return node?.text?.length || 0;
  }

  /**
   * 노드가 텍스트 노드인지 확인합니다.
   * 
   * @param nodeId - 확인할 노드의 ID
   * @returns 텍스트 노드 여부
   * 
   * @example
   * ```typescript
   * const isText = calculator.isTextNode('text-1');
   * // true
   * ```
   */
  isTextNode(nodeId: string): boolean {
    const node = this._dataStore.getNode(nodeId);
    return !!(node?.text);
  }

  /**
   * 노드가 컨테이너 노드인지 확인합니다.
   * 
   * @param nodeId - 확인할 노드의 ID
   * @returns 컨테이너 노드 여부
   * 
   * @example
   * ```typescript
   * const isContainer = calculator.isContainerNode('para-1');
   * // true
   * ```
   */
  isContainerNode(nodeId: string): boolean {
    const node = this._dataStore.getNode(nodeId);
    return !!(node?.content && node.content.length > 0);
  }
}
