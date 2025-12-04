import type { INode } from '../types';
import type { DataStore } from '../data-store';

/**
 * Query 연산들
 * 
 * DataStore에서 노드를 검색하고 필터링하는 기능들을 담당합니다.
 * 
 * ## 성능 vs 완전성 정책
 * 
 * ### DocumentIterator 사용 (성능 우선)
 * - findNodesByType: 타입 필터링으로 효율적
 * - findChildrenByParentId: 직접 접근으로 효율적
 * - findNodesByDepth: 깊이 제한으로 효율적
 * 
 * ### 전체 순회 사용 (완전성 우선)
 * - findNodes: 고아 노드 포함 모든 노드 검색
 * - findRootNodes: 고아 노드도 루트로 간주
 * - findNodesByAttribute: 속성 검색 (고아 노드 포함)
 * - findNodesByText: 텍스트 검색 (고아 노드 포함)
 * - searchText: 텍스트 검색 (고아 노드 포함)
 */
export class QueryOperations {
  constructor(private dataStore: DataStore) {}

  /**
   * 조건에 맞는 노드들을 찾기 (고아 노드 포함)
   * 
   * Spec findNodes:
   * - Returns array of nodes that match the given predicate function.
   * - Iterates through ALL nodes in the store (including orphaned nodes).
   * - Overlay-aware: reflects current state including overlay changes.
   * - Order is not guaranteed (Map iteration order).
   * - Useful for complex filtering conditions and orphaned node detection.
   * - Use findNodesByType/searchText for better performance when possible.
   * 
   * @param predicate 노드를 테스트하는 함수
   * @returns 조건에 맞는 노드들의 배열
   */
  findNodes(predicate: (node: INode) => boolean): INode[] {
    const results: INode[] = [];
    
    // 항상 모든 노드를 순회 (고아 노드 포함)
    // DocumentIterator는 루트와 연결된 노드만 순회하므로, 
    // 고아 노드들을 찾기 위해서는 전체 노드 맵을 순회해야 함
    for (const [id, node] of this.dataStore.getNodes()) {
      const n = this.dataStore.getNode(id);
      if (n && predicate(n)) {
        results.push(n);
      }
    }
    
    return results;
  }

  /**
   * 타입으로 노드들 찾기
   * 
   * Spec findNodesByType:
   * - Returns array of nodes with the specified type.
   * - Uses DocumentIterator with type filter for optimal performance.
   * - Overlay-aware: reflects current state including overlay changes.
   * - Order follows document traversal order when root is set.
   * - Useful for finding all nodes of a specific type (e.g., all paragraphs).
   * 
   * @param stype 찾을 노드 타입 (schema type)
   * @returns 해당 타입의 노드들의 배열
   */
  findNodesByType(stype: string): INode[] {
    const results: INode[] = [];
    const iterator = this.dataStore.createDocumentIterator({
      filter: { stype }
    });
    
    for (const nodeId of iterator) {
      const node = this.dataStore.getNode(nodeId);
      if (node) {
        results.push(node);
      }
    }
    
    return results;
  }

  /**
   * 속성으로 노드들 찾기
   * 
   * Spec findNodesByAttribute:
   * - Returns array of nodes with the specified attribute key-value pair.
   * - Uses findNodes internally with attribute comparison.
   * - Overlay-aware: reflects current state including overlay changes.
   * - Order is not guaranteed (Map iteration order).
   * - Useful for finding nodes with specific attributes (e.g., all nodes with class="highlight").
   * 
   * @param key 속성 키
   * @param value 속성 값
   * @returns 해당 속성을 가진 노드들의 배열
   */
  findNodesByAttribute(key: string, value: any): INode[] {
    return this.findNodes(node => 
      Boolean(node.attributes && node.attributes[key] === value)
    );
  }

  /**
   * 텍스트 내용으로 노드들 찾기
   * 
   * Spec findNodesByText:
   * - Returns array of nodes containing the specified text.
   * - Uses findNodes internally with text inclusion check.
   * - Returns empty array for empty or whitespace-only text.
   * - Overlay-aware: reflects current state including overlay changes.
   * - Order is not guaranteed (Map iteration order).
   * - Useful for finding nodes containing specific text content.
   * 
   * @param text 찾을 텍스트 내용
   * @returns 해당 텍스트를 포함하는 노드들의 배열
   */
  findNodesByText(text: string): INode[] {
    // 빈 텍스트인 경우 빈 배열 반환
    if (!text || text.trim() === '') {
      return [];
    }
    
    return this.findNodes(node => 
      Boolean(node.text && node.text.includes(text))
    );
  }

  /**
   * 부모 ID로 자식 노드들 찾기
   * 
   * Spec findChildrenByParentId:
   * - Returns array of nodes that are direct children of the specified parent.
   * - Uses DocumentIterator for optimal performance when parent exists.
   * - Falls back to findNodes for orphaned children detection.
   * - Overlay-aware: reflects current state including overlay changes.
   * - Order follows document traversal order when parent is connected.
   * - Useful for finding all direct children of a specific node.
   * 
   * @param parentId 부모 노드 ID
   * @returns 해당 부모의 직접 자식 노드들의 배열
   */
  findChildrenByParentId(parentId: string): INode[] {
    const parent = this.dataStore.getNode(parentId);
    if (!parent || !parent.content) {
      return [];
    }
    
    // 부모가 존재하고 content가 있으면 직접 접근 (더 효율적)
    return parent.content
      .map(childId => this.dataStore.getNode(childId as string))
      .filter((child): child is INode => child !== undefined);
  }

  /**
   * 루트 노드들 찾기 (parentId가 없는 노드들)
   * 
   * Spec findRootNodes:
   * - Returns array of nodes that have no parent (parentId is null/undefined).
   * - Uses findNodes internally with parentId check.
   * - Overlay-aware: reflects current state including overlay changes.
   * - Order is not guaranteed (Map iteration order).
   * - Useful for finding top-level nodes in the document tree.
   * 
   * @returns 루트 노드들의 배열
   */
  findRootNodes(): INode[] {
    return this.findNodes(node => !node.parentId);
  }

  /**
   * 텍스트 내용으로 노드 검색 (대소문자 구분 없음)
   * 
   * Spec searchText:
   * - Returns array of nodes containing the specified text (case-insensitive).
   * - Iterates through ALL nodes in the store (including orphaned nodes).
   * - Converts both query and node text to lowercase for comparison.
   * - Returns empty array for empty or whitespace-only query.
   * - Overlay-aware: reflects current state including overlay changes.
   * - Order is not guaranteed (Map iteration order).
   * - Useful for case-insensitive text search including orphaned nodes.
   * 
   * @param query 검색할 텍스트 (대소문자 구분 없음)
   * @returns 해당 텍스트를 포함하는 노드들의 배열
   */
  searchText(query: string): INode[] {
    if (!query || query.trim() === '') {
      return [];
    }
    
    const lowerQuery = query.toLowerCase();
    const results: INode[] = [];
    
    // 항상 모든 노드를 순회 (고아 노드 포함)
    for (const [id, node] of this.dataStore.getNodes()) {
      const n = this.dataStore.getNode(id);
      if (n && n.text && n.text.toLowerCase().includes(lowerQuery)) {
        results.push(n);
      }
    }

    return results;
  }


  /**
   * 노드의 직접 자식들을 객체 배열로 변환 (1단계만)
   * 
   * Spec getNodeChildren:
   * - Returns array of direct child nodes (not nested descendants).
   * - Returns empty array for non-existent nodes or nodes without content.
   * - Filters out any child IDs that reference non-existent nodes.
   * - Overlay-aware: reflects current state including overlay changes.
   * - Order matches the content array order.
   * 
   * @param nodeId 부모 노드 ID
   * @returns 직접 자식 노드들의 배열
   */
  getNodeChildren(nodeId: string): INode[] {
    const node = this.dataStore.getNode(nodeId);
    if (!node || !node.content) {
      return [];
    }
    
    return node.content
      .map(childId => this.dataStore.getNode(childId as string))
      .filter((child): child is INode => child !== undefined);
  }

  /**
   * 노드의 자식들을 재귀적으로 객체 배열로 변환 (중첩 구조 포함)
   * 
   * Spec getNodeChildrenDeep:
   * - Returns array of all descendant nodes with nested content as objects.
   * - Recursively converts child IDs to actual node objects.
   * - Returns empty array for non-existent nodes or nodes without content.
   * - Overlay-aware: reflects current state including overlay changes.
   * - Order follows depth-first traversal.
   * - Useful for getting complete node hierarchy as objects.
   * 
   * @param nodeId 부모 노드 ID
   * @returns 모든 후손 노드들의 배열 (중첩 구조 포함)
   */
  getNodeChildrenDeep(nodeId: string): INode[] {
    const node = this.dataStore.getNode(nodeId);
    if (!node || !node.content) {
      return [];
    }
    
    return node.content.map(childId => {
      const childNode = this.dataStore.getNode(childId as string);
      if (!childNode) return null;
      
      const childWithObjects = {
        ...childNode,
        content: childNode.content ? 
          this.getNodeChildrenDeep(childNode.sid!) : 
          childNode.content
      };
      
      return childWithObjects;
    }).filter(Boolean) as INode[];
  }

  /**
   * 노드를 완전한 객체 구조로 변환 (content가 객체 배열)
   * 
   * Spec getNodeWithChildren:
   * - Returns the node with its content converted from IDs to actual node objects.
   * - Uses getNodeChildrenDeep to recursively convert all descendants.
   * - Returns null for non-existent nodes.
   * - Overlay-aware: reflects current state including overlay changes.
   * - Useful for getting a complete node hierarchy as objects.
   * 
   * @param nodeId 노드 ID
   * @returns 완전한 객체 구조의 노드 또는 null
   */
  getNodeWithChildren(nodeId: string): INode | null {
    const node = this.dataStore.getNode(nodeId);
    if (!node) return null;
    
    return {
      ...node,
      content: this.getNodeChildrenDeep(nodeId)
    };
  }

  /**
   * 모든 노드를 완전한 객체 구조로 변환
   * 
   * Spec getAllNodesWithChildren:
   * - Returns array of all nodes with their content converted from IDs to objects.
   * - Uses DocumentIterator for overlay-aware traversal.
   * - Filters out any null results from non-existent nodes.
   * - Overlay-aware: reflects current state including overlay changes.
   * - Order follows document traversal order when root is set.
   * - Useful for getting complete document hierarchy as objects.
   * 
   * @returns 모든 노드들의 완전한 객체 구조 배열
   */
  getAllNodesWithChildren(): INode[] {
    const results: INode[] = [];
    const iterator = this.dataStore.createDocumentIterator();
    
    for (const nodeId of iterator) {
      const nodeWithChildren = this.getNodeWithChildren(nodeId);
      if (nodeWithChildren) {
        results.push(nodeWithChildren);
      }
    }
    
    return results;
  }

  /**
   * Visitor 패턴을 사용한 노드 검색
   * 
   * Spec findNodesWithVisitor:
   * - Uses traverse method with visitor pattern for complex queries.
   * - Supports early termination and custom collection logic.
   * - Overlay-aware: reflects current state including overlay changes.
   * - Order follows document traversal order.
   * - Useful for complex filtering with early termination.
   * 
   * @param visitor 노드를 검사하고 결과를 수집하는 visitor 함수
   * @param options 순회 옵션 (깊이 제한, 방향 등)
   * @returns visitor가 수집한 노드들의 배열
   */
  findNodesWithVisitor(
    visitor: (node: INode, path: string[]) => boolean | void,
    options?: { maxDepth?: number; direction?: 'down' | 'up' }
  ): INode[] {
    const results: INode[] = [];
    
    this.dataStore.traverse({
      visit: (nodeId, node) => {
        const shouldContinue = visitor(node, [nodeId]);
        if (shouldContinue !== false) {
          results.push(node);
        }
        return shouldContinue;
      }
    }, options);
    
    return results;
  }

  /**
   * 깊이 제한된 노드 검색
   * 
   * Spec findNodesByDepth:
   * - Returns nodes at specific depth levels.
   * - Uses DocumentIterator with depth filtering.
   * - Overlay-aware: reflects current state including overlay changes.
   * - Order follows document traversal order.
   * - Useful for finding nodes at specific hierarchy levels.
   * 
   * @param maxDepth 최대 깊이 (0부터 시작)
   * @param predicate 선택적 노드 필터 함수
   * @returns 지정된 깊이 이하의 노드들의 배열
   */
  findNodesByDepth(maxDepth: number, predicate?: (node: INode) => boolean): INode[] {
    const results: INode[] = [];
    const iterator = this.dataStore.createDocumentIterator({
      maxDepth
    });
    
    for (const nodeId of iterator) {
      const node = this.dataStore.getNode(nodeId);
      if (node && (!predicate || predicate(node))) {
        results.push(node);
      }
    }
    
    return results;
  }
}
