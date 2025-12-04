import type { INode } from '../types';
import type { DataStore } from '../data-store';
import type { DropBehavior, DropContext } from '../types/drop-behavior';
import { globalDropBehaviorRegistry } from './drop-behavior-registry';

/**
 * Utility 연산들
 * 
 * 노드의 상태 확인, 통계, 경로 등의 유틸리티 기능들을 담당합니다.
 */
export class UtilityOperations {
  constructor(private dataStore: DataStore) {}

  /**
   * 노드 존재 여부 확인
   * 
   * Spec hasNode:
   * - Returns true if node exists in DataStore (either base or overlay).
   * - Returns false for null/undefined nodeId or non-existent nodes.
   * - Overlay-aware: checks both base storage and active overlay.
   * - O(1) operation via Map lookup.
   * 
   * @param nodeId 확인할 노드 ID
   * @returns 노드 존재 여부
   */
  hasNode(nodeId: string): boolean {
    return !!this.dataStore.getNode(nodeId);
  }

  /**
   * 자식 노드 개수 조회
   * 
   * Spec getChildCount:
   * - Returns the number of direct children (content array length).
   * - Returns 0 for non-existent nodes or nodes without content.
   * - Does not count nested descendants, only immediate children.
   * - Overlay-aware: reflects current state including overlay changes.
   * 
   * @param nodeId 부모 노드 ID
   * @returns 직접 자식 노드의 개수
   */
  getChildCount(nodeId: string): number {
    const node = this.dataStore.getNode(nodeId);
    if (!node || !node.content) {
      return 0;
    }
    return node.content.length;
  }

  /**
   * 노드가 리프 노드인지 확인 (자식이 없는 노드)
   * 
   * Spec isLeafNode:
   * - Returns true if node has no direct children (content is empty or undefined).
   * - Returns false for non-existent nodes or nodes with children.
   * - Equivalent to getChildCount(nodeId) === 0.
   * - Useful for determining if a node can be safely removed or is a terminal element.
   * 
   * @param nodeId 확인할 노드 ID
   * @returns 리프 노드 여부
   */
  isLeafNode(nodeId: string): boolean {
    return this.getChildCount(nodeId) === 0;
  }

  /**
   * 노드가 루트 노드인지 확인
   * 
   * Spec isRootNode:
   * - Returns true if nodeId matches the current root node ID.
   * - Returns false for non-existent nodes or non-root nodes.
   * - Root node is the top-level node of the document tree.
   * - Root node cannot be deleted (enforced at DataStore level).
   * 
   * @param nodeId 확인할 노드 ID
   * @returns 루트 노드 여부
   */
  isRootNode(nodeId: string): boolean {
    return this.dataStore.getRootNodeId() === nodeId;
  }

  /**
   * 자식 노드들 조회
   * 
   * Spec getChildren:
   * - Returns array of direct child nodes (not nested descendants).
   * - Returns empty array for non-existent nodes or nodes without content.
   * - Filters out any child IDs that reference non-existent nodes.
   * - Overlay-aware: reflects current state including overlay changes.
   * - Order matches the content array order.
   * 
   * @param nodeId 부모 노드 ID
   * @returns 직접 자식 노드들의 배열
   */
  getChildren(nodeId: string): INode[] {
    const node = this.dataStore.getNode(nodeId);
    if (!node || !node.content) return [];
    return (node.content as string[])
      .map((childId: string) => this.dataStore.getNode(childId))
      .filter((child: INode | undefined): child is INode => child !== undefined);
  }

  /**
   * 부모 노드 조회
   * 
   * Spec getParent:
   * - Returns the direct parent node of the given node.
   * - Returns undefined for non-existent nodes, root nodes, or nodes without parentId.
   * - Overlay-aware: reflects current state including overlay changes.
   * - O(1) operation via Map lookup.
   * 
   * @param nodeId 자식 노드 ID
   * @returns 부모 노드 또는 undefined
   */
  getParent(nodeId: string): INode | undefined {
    const node = this.dataStore.getNode(nodeId);
    if (!node || !node.parentId) return undefined;
    return this.dataStore.getNode(node.parentId);
  }

  /**
   * 형제 노드들 조회
   * 
   * Spec getSiblings:
   * - Returns array of sibling nodes (nodes with the same parent).
   * - Excludes the given node from the result.
   * - Returns empty array for non-existent nodes, root nodes, or nodes without parent.
   * - Overlay-aware: reflects current state including overlay changes.
   * - Order matches the parent's content array order.
   * 
   * @param nodeId 기준 노드 ID
   * @returns 형제 노드들의 배열 (자기 자신 제외)
   */
  getSiblings(nodeId: string): INode[] {
    const parent = this.getParent(nodeId);
    if (!parent) return [];
    return this.getChildren(parent.sid!).filter(sibling => sibling.sid !== nodeId);
  }

  /**
   * 형제 노드에서의 인덱스 조회
   * 
   * Spec getSiblingIndex:
   * - Returns the index position of the node within its parent's content array.
   * - Returns -1 for non-existent nodes, root nodes, or nodes not found in parent's content.
   * - Index is 0-based (first child = 0, second child = 1, etc.).
   * - Overlay-aware: reflects current state including overlay changes.
   * 
   * @param nodeId 기준 노드 ID
   * @returns 부모의 content 배열에서의 인덱스 (0-based, -1 if not found)
   */
  getSiblingIndex(nodeId: string): number {
    const parent = this.getParent(nodeId);
    if (!parent || !parent.content) return -1;
    return parent.content.findIndex(childId => childId === nodeId);
  }

  /**
   * 같은 부모의 이전 형제 노드 조회
   * 
   * Spec getPreviousSibling:
   * - Returns the previous sibling node in the same parent's content array.
   * - Returns null if the node is the first child, has no parent, or parent has no content.
   * - Only returns direct siblings (not descendants of siblings).
   * - Overlay-aware: reflects current state including overlay changes.
   * 
   * @param nodeId 기준 노드 ID
   * @returns 이전 형제 노드 ID (없으면 null)
   */
  getPreviousSibling(nodeId: string): string | null {
    const parent = this.getParent(nodeId);
    if (!parent || !parent.content) return null;
    
    const currentIndex = parent.content.indexOf(nodeId);
    if (currentIndex <= 0) return null; // 첫 번째 형제이거나 찾을 수 없음
    
    return parent.content[currentIndex - 1] as string;
  }

  /**
   * 같은 부모의 다음 형제 노드 조회
   * 
   * Spec getNextSibling:
   * - Returns the next sibling node in the same parent's content array.
   * - Returns null if the node is the last child, has no parent, or parent has no content.
   * - Only returns direct siblings (not descendants of siblings).
   * - Overlay-aware: reflects current state including overlay changes.
   * 
   * @param nodeId 기준 노드 ID
   * @returns 다음 형제 노드 ID (없으면 null)
   */
  getNextSibling(nodeId: string): string | null {
    const parent = this.getParent(nodeId);
    if (!parent || !parent.content) return null;
    
    const currentIndex = parent.content.indexOf(nodeId);
    if (currentIndex === -1 || currentIndex >= parent.content.length - 1) return null; // 마지막 형제이거나 찾을 수 없음
    
    return parent.content[currentIndex + 1] as string;
  }

  /**
   * 첫 번째 자식 노드 조회
   * 
   * Spec getFirstChild:
   * - Returns the first child node ID in the parent's content array.
   * - Returns null if the node has no children, is non-existent, or has no content.
   * - Equivalent to getChildren(nodeId)[0]?.sid || null.
   * - Overlay-aware: reflects current state including overlay changes.
   * 
   * @param nodeId 부모 노드 ID
   * @returns 첫 번째 자식 노드 ID (없으면 null)
   */
  getFirstChild(nodeId: string): string | null {
    const node = this.dataStore.getNode(nodeId);
    if (!node || !node.content || node.content.length === 0) return null;
    return node.content[0] as string;
  }

  /**
   * 마지막 자식 노드 조회
   * 
   * Spec getLastChild:
   * - Returns the last child node ID in the parent's content array.
   * - Returns null if the node has no children, is non-existent, or has no content.
   * - Equivalent to getChildren(nodeId)[children.length - 1]?.sid || null.
   * - Overlay-aware: reflects current state including overlay changes.
   * 
   * @param nodeId 부모 노드 ID
   * @returns 마지막 자식 노드 ID (없으면 null)
   */
  getLastChild(nodeId: string): string | null {
    const node = this.dataStore.getNode(nodeId);
    if (!node || !node.content || node.content.length === 0) return null;
    return node.content[node.content.length - 1] as string;
  }

  /**
   * 첫 번째 형제 노드 조회
   * 
   * Spec getFirstSibling:
   * - Returns the first sibling node ID in the parent's content array.
   * - Returns null if the node has no siblings, is non-existent, has no parent, or parent has no content.
   * - Returns the first child of the parent (not necessarily the given node itself).
   * - Overlay-aware: reflects current state including overlay changes.
   * 
   * @param nodeId 기준 노드 ID
   * @returns 첫 번째 형제 노드 ID (없으면 null)
   */
  getFirstSibling(nodeId: string): string | null {
    const parent = this.getParent(nodeId);
    if (!parent || !parent.content || parent.content.length === 0) return null;
    return parent.content[0] as string;
  }

  /**
   * 마지막 형제 노드 조회
   * 
   * Spec getLastSibling:
   * - Returns the last sibling node ID in the parent's content array.
   * - Returns null if the node has no siblings, is non-existent, has no parent, or parent has no content.
   * - Returns the last child of the parent (not necessarily the given node itself).
   * - Overlay-aware: reflects current state including overlay changes.
   * 
   * @param nodeId 기준 노드 ID
   * @returns 마지막 형제 노드 ID (없으면 null)
   */
  getLastSibling(nodeId: string): string | null {
    const parent = this.getParent(nodeId);
    if (!parent || !parent.content || parent.content.length === 0) return null;
    return parent.content[parent.content.length - 1] as string;
  }

  /**
   * 두 노드의 공통 조상 찾기
   * 
   * Spec getCommonAncestor:
   * - Returns the lowest common ancestor (LCA) of two nodes.
   * - Returns null if either node doesn't exist or they have no common ancestor.
   * - The common ancestor is the deepest node that is an ancestor of both nodes.
   * - If one node is an ancestor of the other, returns that ancestor.
   * - Overlay-aware: reflects current state including overlay changes.
   * 
   * @param nodeId1 첫 번째 노드 ID
   * @param nodeId2 두 번째 노드 ID
   * @returns 공통 조상 노드 ID (없으면 null)
   */
  getCommonAncestor(nodeId1: string, nodeId2: string): string | null {
    const node1 = this.dataStore.getNode(nodeId1);
    const node2 = this.dataStore.getNode(nodeId2);
    
    if (!node1 || !node2) return null;
    
    // 같은 노드면 자기 자신 반환
    if (nodeId1 === nodeId2) return nodeId1;
    
    // node1의 조상 경로 구하기
    const ancestors1 = new Set<string>();
    let currentId: string | undefined = nodeId1;
    while (currentId) {
      ancestors1.add(currentId);
      const node = this.dataStore.getNode(currentId);
      currentId = node?.parentId;
    }
    
    // node2의 조상 경로를 따라가면서 공통 조상 찾기
    currentId = nodeId2;
    while (currentId) {
      if (ancestors1.has(currentId)) {
        return currentId;
      }
      const node = this.dataStore.getNode(currentId);
      currentId = node?.parentId;
    }
    
    return null;
  }

  /**
   * 두 노드 간의 거리 계산
   * 
   * Spec getDistance:
   * - Returns the distance between two nodes in the document tree.
   * - Distance is calculated as the sum of steps needed to navigate from node1 to node2.
   * - Returns -1 if either node doesn't exist or they are not in the same tree.
   * - Distance calculation:
   *   1. Find common ancestor
   *   2. Calculate depth from common ancestor to node1
   *   3. Calculate depth from common ancestor to node2
   *   4. Return sum of both depths
   * - Overlay-aware: reflects current state including overlay changes.
   * 
   * @param nodeId1 첫 번째 노드 ID
   * @param nodeId2 두 번째 노드 ID
   * @returns 두 노드 간 거리 (없으면 -1)
   */
  getDistance(nodeId1: string, nodeId2: string): number {
    const node1 = this.dataStore.getNode(nodeId1);
    const node2 = this.dataStore.getNode(nodeId2);
    
    if (!node1 || !node2) return -1;
    
    // 같은 노드면 거리 0
    if (nodeId1 === nodeId2) return 0;
    
    // 공통 조상 찾기
    const commonAncestorId = this.getCommonAncestor(nodeId1, nodeId2);
    if (!commonAncestorId) return -1;
    
    // node1에서 공통 조상까지의 거리
    let distance1 = 0;
    let currentId: string | undefined = nodeId1;
    while (currentId && currentId !== commonAncestorId) {
      distance1++;
      const node = this.dataStore.getNode(currentId);
      currentId = node?.parentId;
    }
    
    // node2에서 공통 조상까지의 거리
    let distance2 = 0;
    currentId = nodeId2;
    while (currentId && currentId !== commonAncestorId) {
      distance2++;
      const node = this.dataStore.getNode(currentId);
      currentId = node?.parentId;
    }
    
    return distance1 + distance2;
  }

  /**
   * 노드 경로 조회 (루트부터 현재 노드까지)
   * 
   * Spec getNodePath:
   * - Returns array of node IDs representing the path from root to the given node.
   * - Path includes the given node as the last element.
   * - Returns empty array for non-existent nodes or broken parent chains.
   * - Overlay-aware: reflects current state including overlay changes.
   * - Useful for determining document structure and node hierarchy.
   * 
   * @param nodeId 경로를 조회할 노드 ID
   * @returns 루트부터 해당 노드까지의 경로 (노드 ID 배열)
   */
  getNodePath(nodeId: string): string[] {
    const path: string[] = [];
    let currentId: string | undefined = nodeId;
    while (currentId) {
      const node = this.dataStore.getNode(currentId) as INode | undefined;
      if (!node) {
        // 존재하지 않는 노드가 발견되면 빈 배열 반환
        return [];
      }
      path.unshift(currentId);
      currentId = node.parentId;
    }
    return path;
  }

  /**
   * 노드 깊이 조회 (루트부터의 거리)
   * 
   * Spec getNodeDepth:
   * - Returns the depth of the node in the document tree (0-based).
   * - Root node has depth 0, its children have depth 1, etc.
   * - Returns -1 for non-existent nodes or broken parent chains.
   * - Equivalent to getNodePath(nodeId).length - 1.
   * - Useful for indentation, styling, or structural analysis.
   * 
   * @param nodeId 깊이를 조회할 노드 ID
   * @returns 노드의 깊이 (0-based, -1 if not found)
   */
  getNodeDepth(nodeId: string): number {
    return this.getNodePath(nodeId).length - 1;
  }

  /**
   * 노드가 특정 조상의 후손인지 확인
   * 
   * Spec isDescendant:
   * - Returns true if the given node is a descendant of the ancestor node.
   * - Returns false for non-existent nodes or if ancestor is not in the path.
   * - A node is considered a descendant of itself (reflexive relationship).
   * - Uses getNodePath internally for efficient path traversal.
   * 
   * @param nodeId 확인할 노드 ID
   * @param ancestorId 조상 노드 ID
   * @returns 후손 관계 여부
   */
  isDescendant(nodeId: string, ancestorId: string): boolean {
    const path = this.getNodePath(nodeId);
    return path.includes(ancestorId);
  }

  /**
   * 모든 후손 노드들 조회
   * 
   * Spec getAllDescendants:
   * - Returns array of all descendant nodes (recursive traversal).
   * - Includes direct children, grandchildren, and all deeper descendants.
   * - Returns empty array for non-existent nodes or nodes without content.
   * - Overlay-aware: reflects current state including overlay changes.
   * - Order is depth-first traversal order.
   * 
   * @param nodeId 조상 노드 ID
   * @returns 모든 후손 노드들의 배열
   */
  getAllDescendants(nodeId: string): INode[] {
    const descendants: INode[] = [];
    const children = this.getChildren(nodeId);
    for (const child of children) {
      descendants.push(child);
      descendants.push(...this.getAllDescendants(child.sid as string));
    }
    return descendants;
  }

  /**
   * 모든 조상 노드들 조회
   * 
   * Spec getAllAncestors:
   * - Returns array of all ancestor nodes (from direct parent to root).
   * - Excludes the given node from the result.
   * - Returns empty array for non-existent nodes or root nodes.
   * - Overlay-aware: reflects current state including overlay changes.
   * - Order is from direct parent to root (bottom-up).
   * 
   * @param nodeId 기준 노드 ID
   * @returns 모든 조상 노드들의 배열 (직접 부모부터 루트까지)
   */
  getAllAncestors(nodeId: string): INode[] {
    const ancestors: INode[] = [];
    let currentId: string | undefined = nodeId;
    while (currentId) {
      const node = this.dataStore.getNode(currentId) as INode | undefined;
      if (node?.parentId) {
        const parent = this.dataStore.getNode(node.parentId);
        if (parent) {
          ancestors.unshift(parent);
        }
      }
      currentId = node?.parentId;
    }
    return ancestors;
  }

  /**
   * 노드 개수 조회
   * 
   * Spec getNodeCount:
   * - Returns the total number of nodes in the DataStore.
   * - Includes all nodes in the base storage.
   * - Does not include overlay-only nodes (they are not persisted).
   * - O(1) operation via Map.size.
   * 
   * @returns 전체 노드 개수
   */
  getNodeCount(): number {
    // Count all nodes in the store, including orphaned nodes
    let total = 0;
    for (const [id, node] of this.dataStore.getNodes()) {
      // getNode filters overlay-deleted nodes
      if (this.dataStore.getNode(id)) {
        total++;
      }
    }
    return total;
  }

  /**
   * 모든 노드 조회
   * 
   * Spec getAllNodes:
   * - Returns array of all nodes in the DataStore.
   * - Uses DocumentIterator to traverse the document tree when root is set.
   * - Falls back to internal map when no root is set.
   * - Overlay-aware: reflects current state including overlay changes.
   * - Order follows document traversal order when root is set.
   * 
   * @returns 모든 노드들의 배열
   */
  getAllNodes(): INode[] {
    // For cases where nodes might not be connected to roots (orphaned nodes),
    // we need to iterate through all nodes in the store, not just from roots
    const result: INode[] = [];
    for (const [id, node] of this.dataStore.getNodes()) {
      // getNode filters overlay-deleted nodes
      const n = this.dataStore.getNode(id);
      if (n) {
        result.push(n);
      }
    }
    return result;
  }

  /**
   * 모든 노드 맵 조회
   * 
   * Spec getAllNodesMap:
   * - Returns a Map of all nodes in the DataStore (ID -> Node).
   * - Uses DocumentIterator to traverse the document tree when root is set.
   * - Falls back to internal map clone when no root is set.
   * - Overlay-aware: reflects current state including overlay changes.
   * - Returns a new Map, modifications do not affect the original.
   * 
   * @returns 노드 ID를 키로 하는 노드 Map
   */
  getAllNodesMap(): Map<string, INode> {
    const rootId = this.dataStore.getRootNodeId();
    if (!rootId) {
      // Fallback: when root not set, return internal map clone
      return new Map(this.dataStore.getNodes()) as any;
    }
    const map = new Map<string, INode>();
    const it = this.createDocumentIterator();
    for (const id of it) {
      const n = this.dataStore.getNode(id);
      if (n) map.set(id, n);
    }
    return map as any;
  }

  /**
   * 스냅샷에서 복원
   * 
   * Spec restoreFromSnapshot:
   * - Restores the DataStore from a previously saved snapshot.
   * - Replaces all current nodes with the snapshot data.
   * - Sets the root node ID and version from the snapshot.
   * - Clears any active overlay state.
   * - Use with caution as this operation is irreversible.
   * 
   * @param nodes 스냅샷의 노드 Map
   * @param rootNodeId 스냅샷의 루트 노드 ID (선택사항)
   * @param version 스냅샷의 버전 번호 (기본값: 1)
   * @returns void
   */
  restoreFromSnapshot(nodes: Map<string, INode>, rootNodeId?: string, version: number = 1): void {
    this.dataStore.clear();
    for (const [id, node] of nodes) {
      this.dataStore.getNodes().set(id, node);
    }
    this.dataStore.setRootNodeId(rootNodeId as string);
    this.dataStore.version = version;
  }

  /**
   * 저장소 복제
   * 
   * Spec clone:
   * - Creates a deep copy of the DataStore with all nodes and state.
   * - Preserves schema reference and session ID.
   * - Creates new DataStore instance with identical content.
   * - Useful for creating backups or testing scenarios.
   * - Returns a completely independent copy.
   * 
   * @returns 복제된 DataStore 인스턴스
   */
  clone(): any {
    // 새 DataStore 인스턴스 생성: 스키마는 공유(참조 유지), 세션 ID는 동일 값
    const activeSchema = (this.dataStore as any)._activeSchema;
    const sessionId = typeof this.dataStore.getSessionId === 'function' ? this.dataStore.getSessionId() : 0;
    const cloned = new (this.dataStore.constructor as any)(this.dataStore.getRootNodeId(), activeSchema, sessionId);
    for (const [id, node] of this.dataStore.getNodes()) {
      // Prefer native structuredClone when available for robust deep copy
      let clonedNode: INode;
      if (typeof (globalThis as any).structuredClone === 'function') {
        clonedNode = (globalThis as any).structuredClone(node);
      } else {
        // Fallback: manual deep copy of known fields
        const clonedMarks = node.marks
          ? (node.marks as any[]).map((m: any) => ({
              stype: m.stype,
              attrs: m.attrs ? { ...m.attrs } : undefined,
              range: Array.isArray(m.range) ? [m.range[0], m.range[1]] as [number, number] : undefined
            }))
          : undefined;
        clonedNode = {
          sid: node.sid,
          stype: node.stype,
          parentId: node.parentId,
          text: node.text,
          attributes: node.attributes ? { ...node.attributes } : undefined,
          metadata: node.metadata ? { ...node.metadata } : undefined,
          content: node.content ? [...node.content] : undefined,
          marks: clonedMarks as any
        } as INode;
      }
      cloned.nodes.set(id, clonedNode);
    }
    return cloned;
  }

  /**
   * 두 노드의 문서 순서를 비교합니다.
   * 
   * @param nodeId1 첫 번째 노드 ID
   * @param nodeId2 두 번째 노드 ID
   * @returns -1: nodeId1이 nodeId2보다 앞에 있음, 0: 같은 위치, 1: nodeId1이 nodeId2보다 뒤에 있음
   * 
   * @example
   * ```typescript
   * // document > paragraph-1 > text-1
   * // document > paragraph-1 > text-2
   * // document > paragraph-2 > text-3
   * 
   * compareDocumentOrder('text-1', 'text-2') // -1 (text-1이 앞)
   * compareDocumentOrder('text-2', 'text-1') // 1 (text-2가 뒤)
   * compareDocumentOrder('text-1', 'text-1') // 0 (같은 노드)
   * compareDocumentOrder('text-2', 'text-3') // -1 (text-2가 앞)
   * ```
   */
  compareDocumentOrder(nodeId1: string, nodeId2: string): number {
    if (nodeId1 === nodeId2) {
      return 0;
    }

    const path1 = this.getNodePath(nodeId1);
    const path2 = this.getNodePath(nodeId2);

    if (!path1.length) {
      throw new Error(`Node not found: ${nodeId1}`);
    }
    if (!path2.length) {
      throw new Error(`Node not found: ${nodeId2}`);
    }

    // 공통 조상 찾기
    let commonAncestorIndex = 0;
    const minLength = Math.min(path1.length, path2.length);
    
    for (let i = 0; i < minLength; i++) {
      if (path1[i] === path2[i]) {
        commonAncestorIndex = i;
      } else {
        break;
      }
    }

    // 공통 조상이 없는 경우 (루트가 다름)
    if (commonAncestorIndex === 0 && path1[0] !== path2[0]) {
      throw new Error('Nodes are not in the same document tree');
    }

    // 공통 조상의 다음 레벨에서 순서 비교
    const nextIndex1 = commonAncestorIndex + 1;
    const nextIndex2 = commonAncestorIndex + 1;

    // 한 경로가 다른 경로의 부분집합인 경우
    if (nextIndex1 >= path1.length) {
      return -1; // path1이 더 짧음 (조상)
    }
    if (nextIndex2 >= path2.length) {
      return 1; // path2가 더 짧음 (조상)
    }

    // 공통 부모에서의 형제 순서 비교
    const parentId = path1[commonAncestorIndex];
    const parent = this.dataStore.getNode(parentId);
    
    if (!parent || !parent.content) {
      throw new Error(`Parent node not found or has no content: ${parentId}`);
    }

    const index1 = parent.content.indexOf(path1[nextIndex1]);
    const index2 = parent.content.indexOf(path2[nextIndex2]);

    if (index1 === -1 || index2 === -1) {
      throw new Error(`Child node not found in parent content`);
    }

    return index1 - index2;
  }

  /**
   * 주어진 노드의 다음 노드를 문서 순서대로 찾습니다.
   * 
   * @param nodeId 현재 노드 ID
   * @returns 다음 노드 ID (없으면 null)
   * 
   * @example
   * ```typescript
   * // document > paragraph-1 > [text-1, text-2]
   * // document > paragraph-2 > [text-3]
   * 
   * getNextNode('text-1') // 'text-2'
   * getNextNode('text-2') // 'text-3' (다음 단락으로)
   * getNextNode('text-3') // null (마지막 노드)
   * getNextNode('paragraph-1') // 'text-1' (첫 번째 자식)
   * ```
   */
  getNextNode(nodeId: string): string | null {
    const node = this.dataStore.getNode(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    // 1. 자식 노드가 있으면 첫 번째 자식 반환
    if (node.content && node.content.length > 0) {
      return node.content[0] as string;
    }

    // 2. 형제 노드가 있으면 다음 형제 반환
    const parent = this.getParent(nodeId);
    if (parent && parent.content) {
      const currentIndex = parent.content.indexOf(nodeId);
      if (currentIndex !== -1 && currentIndex < parent.content.length - 1) {
        return parent.content[currentIndex + 1] as string;
      }
    }

    // 3. 부모의 다음 형제 찾기 (재귀적으로, 하지만 자식은 찾지 않음)
    if (parent) {
      const parentNext = this._getNextSiblingOnly(parent.sid!);
      if (parentNext) {
        return parentNext;
      }
    }

    // 4. 더 이상 다음 노드가 없음
    return null;
  }

  /**
   * 부모의 다음 형제만 찾기 (자식은 찾지 않음)
   */
  private _getNextSiblingOnly(nodeId: string): string | null {
    const parent = this.getParent(nodeId);
    if (parent && parent.content) {
      const currentIndex = parent.content.indexOf(nodeId);
      if (currentIndex !== -1 && currentIndex < parent.content.length - 1) {
        return parent.content[currentIndex + 1] as string;
      }
    }

    // 더 위로 올라가서 형제 찾기
    if (parent) {
      return this._getNextSiblingOnly(parent.sid!);
    }

    return null;
  }

  /**
   * 주어진 노드의 이전 노드를 문서 순서대로 찾습니다.
   * 
   * @param nodeId 현재 노드 ID
   * @returns 이전 노드 ID (없으면 null)
   * 
   * @example
   * ```typescript
   * // document > paragraph-1 > [text-1, text-2]
   * // document > paragraph-2 > [text-3]
   * 
   * getPreviousNode('text-3') // 'text-2' (이전 단락으로)
   * getPreviousNode('text-2') // 'text-1'
   * getPreviousNode('text-1') // 'paragraph-1' (부모)
   * getPreviousNode('paragraph-1') // 'document' (부모)
   * ```
   */
  getPreviousNode(nodeId: string): string | null {
    const node = this.dataStore.getNode(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    // 1. 이전 형제 노드가 있으면 그 형제의 마지막 자식 반환
    const parent = this.getParent(nodeId);
    if (parent && parent.content) {
      const currentIndex = parent.content.indexOf(nodeId);
      if (currentIndex > 0) {
        const previousSiblingId = parent.content[currentIndex - 1] as string;
        return this._getLastDescendant(previousSiblingId);
      }
    }

    // 2. 부모 노드 반환 (부모가 있으면)
    if (parent) {
      return parent.sid!;
    }

    // 3. 더 이상 이전 노드가 없음
    return null;
  }

  /**
   * 주어진 노드의 마지막 자손을 찾습니다 (재귀적으로)
   */
  private _getLastDescendant(nodeId: string): string {
    const node = this.dataStore.getNode(nodeId);
    if (!node || !node.content || node.content.length === 0) {
      return nodeId; // 자식이 없으면 자기 자신 반환
    }

    // 마지막 자식의 마지막 자손 찾기
    const lastChildId = node.content[node.content.length - 1] as string;
    return this._getLastDescendant(lastChildId);
  }

  /**
   * 문서 내 모든 편집 가능한 노드를 조회합니다.
   * 
   * @param options 필터 옵션
   * @returns 편집 가능한 노드 배열
   */
  getEditableNodes(options?: {
    filter?: (node: INode) => boolean;
    includeText?: boolean;
    includeInline?: boolean;
    includeEditableBlocks?: boolean;
  }): INode[] {
    const {
      filter,
      includeText = true,
      includeInline = true,
      includeEditableBlocks = true
    } = options || {};

    const result: INode[] = [];
    
    for (const [nodeId, node] of this.dataStore.getNodes()) {
      if (!this._isEditableNode(nodeId)) {
        continue;
      }

      // 타입별 필터링
      const schema = (this.dataStore as any)._activeSchema;
      if (schema) {
        const nodeType = schema.getNodeType?.(node.stype);
        if (nodeType) {
          const group = nodeType.group;
          const isTextNode = node.text !== undefined && typeof node.text === 'string';
          const isEditableBlock = group === 'block' && nodeType.editable === true && isTextNode;
          const isInline = group === 'inline';
          
          // editable block은 별도 처리
          if (isEditableBlock) {
            if (!includeEditableBlocks) {
              continue;
            }
          } else {
            // 텍스트 노드 필터링 (editable block 제외)
            if (isTextNode && !includeText) {
              continue;
            }
            // inline 노드 필터링 (텍스트 노드가 아닌 경우만)
            if (isInline && !isTextNode && !includeInline) {
              continue;
            }
          }
        }
      }

      // 커스텀 필터 적용
      if (filter && !filter(node)) {
        continue;
      }

      result.push(node);
    }

    return result;
  }

  /**
   * 노드 ID 배열에서 편집 가능한 노드만 필터링합니다.
   * 
   * @param nodeIds 노드 ID 배열
   * @returns 편집 가능한 노드 ID 배열
   */
  filterEditableNodes(nodeIds: string[]): string[] {
    return nodeIds.filter(nodeId => this._isEditableNode(nodeId));
  }

  /**
   * 노드 ID 배열에서 선택 가능한 노드만 필터링합니다.
   * 
   * @param nodeIds 노드 ID 배열
   * @returns 선택 가능한 노드 ID 배열
   */
  filterSelectableNodes(nodeIds: string[]): string[] {
    return nodeIds.filter(nodeId => this._isSelectableNode(nodeId));
  }

  /**
   * 노드가 선택 가능한 노드인지 확인합니다.
   * 
   * 선택 가능한 노드:
   * - 기본적으로 모든 노드는 선택 가능 (document 제외)
   * - 스키마에서 selectable: false로 명시하면 선택 불가능
   * - document 노드는 항상 선택 불가능
   * 
   * 선택 불가능한 노드:
   * - document 노드 (group === 'document')
   * - selectable: false로 명시된 노드
   * 
   * @param nodeId 노드 ID
   * @returns 선택 가능 여부
   */
  private _isSelectableNode(nodeId: string): boolean {
    const node = this.dataStore.getNode(nodeId);
    if (!node) {
      return false;
    }
    
    // 1. 스키마에서 group 확인 (최우선)
    const schema = (this.dataStore as any)._activeSchema;
    if (schema) {
      try {
        const nodeType = schema.getNodeType?.(node.stype);
        if (nodeType) {
          const group = nodeType.group;
          
          // document 노드는 항상 선택 불가능
          if (group === 'document') {
            return false;
          }
          
          // selectable 속성이 명시적으로 false이면 선택 불가능
          if (nodeType.selectable === false) {
            return false;
          }
          
          // 그 외의 경우는 선택 가능 (기본값 true)
          return true;
        }
      } catch (error) {
        // 스키마 조회 실패 시 계속 진행
      }
    }
    
    // 2. 스키마 정보가 없으면 기본적으로 선택 가능 (document 제외)
    // stype이 'document'이면 선택 불가능
    if (node.stype === 'document') {
      return false;
    }
    
    // 3. 그 외의 경우는 선택 가능 (안전하게 true)
    return true;
  }

  /**
   * 문서 내 모든 선택 가능한 노드를 조회합니다.
   * 
   * @param options 필터 옵션
   * @returns 선택 가능한 노드 배열
   */
  getSelectableNodes(options?: {
    filter?: (node: INode) => boolean;
    includeBlocks?: boolean;
    includeInline?: boolean;
    includeEditable?: boolean;
  }): INode[] {
    const {
      filter,
      includeBlocks = true,
      includeInline = true,
      includeEditable = true
    } = options || {};

    const result: INode[] = [];
    
    for (const [nodeId, node] of this.dataStore.getNodes()) {
      if (!this._isSelectableNode(nodeId)) {
        continue;
      }

      // 타입별 필터링
      const schema = (this.dataStore as any)._activeSchema;
      let shouldInclude = true; // 기본값: 포함
      
      if (schema) {
        const nodeType = schema.getNodeType?.(node.stype);
        if (nodeType) {
          const group = nodeType.group;
          const isBlock = group === 'block';
          const isInline = group === 'inline';
          const isEditable = this._isEditableNode(nodeId);
          
          // 옵션이 하나라도 true이면 필터링 적용
          const hasFilter = includeBlocks || includeInline || includeEditable;
          
          if (hasFilter) {
            shouldInclude = false; // 기본값: 제외
            
            // OR 조건: 하나라도 조건에 맞으면 포함
            if (includeBlocks && isBlock) {
              shouldInclude = true;
            }
            if (includeInline && isInline) {
              shouldInclude = true;
            }
            if (includeEditable && isEditable) {
              shouldInclude = true;
            }
          }
          // 옵션이 모두 false이면 필터링 안 함 (기본값 true 유지)
        }
      }
      
      if (!shouldInclude) {
        continue;
      }

      // 커스텀 필터 적용
      if (filter && !filter(node)) {
        continue;
      }

      result.push(node);
    }

    return result;
  }

  /**
   * 노드가 드래그 가능한 노드인지 확인합니다.
   * 
   * 드래그 가능한 노드:
   * - 기본적으로 모든 노드는 드래그 가능 (document 제외)
   * - draggable: false로 명시하면 드래그 불가능
   * 
   * 드래그 불가능한 노드:
   * - document 노드 (group === 'document')
   * - draggable: false로 명시된 노드
   * 
   * @param nodeId 노드 ID
   * @returns 드래그 가능 여부
   */
  private _isDraggableNode(nodeId: string): boolean {
    const node = this.dataStore.getNode(nodeId);
    if (!node) {
      return false;
    }
    
    // 1. 스키마에서 group 확인 (최우선)
    const schema = (this.dataStore as any)._activeSchema;
    if (schema) {
      try {
        const nodeType = schema.getNodeType?.(node.stype);
        if (nodeType) {
          const group = nodeType.group;
          
          // document 노드는 항상 드래그 불가능
          if (group === 'document') {
            return false;
          }
          
          // draggable 속성이 명시적으로 false이면 드래그 불가능
          if (nodeType.draggable === false) {
            return false;
          }
          
          // 그 외의 경우는 드래그 가능 (기본값 true)
          return true;
        }
      } catch (error) {
        // 스키마 조회 실패 시 계속 진행
      }
    }
    
    // 2. 스키마 정보가 없으면 기본적으로 드래그 가능 (document 제외)
    // stype이 'document'이면 드래그 불가능
    if (node.stype === 'document') {
      return false;
    }
    
    // 3. 그 외의 경우는 드래그 가능 (안전하게 true)
    return true;
  }

  /**
   * 문서 내 모든 드래그 가능한 노드를 조회합니다.
   * 
   * @param options 필터 옵션
   * @returns 드래그 가능한 노드 배열
   */
  getDraggableNodes(options?: {
    filter?: (node: INode) => boolean;
    includeBlocks?: boolean;
    includeInline?: boolean;
    includeEditable?: boolean;
  }): INode[] {
    const {
      filter,
      includeBlocks = true,
      includeInline = true,
      includeEditable = true
    } = options || {};

    const result: INode[] = [];
    
    for (const [nodeId, node] of this.dataStore.getNodes()) {
      if (!this._isDraggableNode(nodeId)) {
        continue;
      }

      // 타입별 필터링
      const schema = (this.dataStore as any)._activeSchema;
      let shouldInclude = true; // 기본값: 포함
      
      if (schema) {
        const nodeType = schema.getNodeType?.(node.stype);
        if (nodeType) {
          const group = nodeType.group;
          const isBlock = group === 'block';
          const isInline = group === 'inline';
          const isEditable = this._isEditableNode(nodeId);
          
          // 옵션이 하나라도 true이면 필터링 적용
          const hasFilter = includeBlocks || includeInline || includeEditable;
          
          if (hasFilter) {
            shouldInclude = false; // 기본값: 제외
            
            // OR 조건: 하나라도 조건에 맞으면 포함
            if (includeBlocks && isBlock) {
              shouldInclude = true;
            }
            if (includeInline && isInline) {
              shouldInclude = true;
            }
            if (includeEditable && isEditable) {
              shouldInclude = true;
            }
          }
          // 옵션이 모두 false이면 필터링 안 함 (기본값 true 유지)
        }
      }
      
      if (!shouldInclude) {
        continue;
      }

      // 커스텀 필터 적용
      if (filter && !filter(node)) {
        continue;
      }

      result.push(node);
    }

    return result;
  }

  /**
   * 노드 ID 배열에서 드래그 가능한 노드만 필터링합니다.
   * 
   * @param nodeIds 노드 ID 배열
   * @returns 드래그 가능한 노드 ID 배열
   */
  filterDraggableNodes(nodeIds: string[]): string[] {
    return nodeIds.filter(nodeId => this._isDraggableNode(nodeId));
  }

  /**
   * 노드가 드롭 가능한 노드인지 확인합니다 (드롭 타겟이 될 수 있는지).
   * 
   * 드롭 가능한 노드:
   * - content가 정의된 노드 (기본적으로 드롭 가능)
   * - droppable: false로 명시하면 드롭 불가능
   * 
   * 드롭 불가능한 노드:
   * - content가 없는 노드 (atom 노드, 텍스트 노드 등)
   * - droppable: false로 명시된 노드
   * 
   * @param nodeId 노드 ID
   * @returns 드롭 가능 여부
   */
  private _isDroppableNode(nodeId: string): boolean {
    const node = this.dataStore.getNode(nodeId);
    if (!node) {
      return false;
    }
    
    // 1. 스키마에서 content와 droppable 확인 (최우선)
    const schema = (this.dataStore as any)._activeSchema;
    if (schema) {
      try {
        const nodeType = schema.getNodeType?.(node.stype);
        if (nodeType) {
          // droppable 속성이 명시적으로 false이면 드롭 불가능
          if (nodeType.droppable === false) {
            return false;
          }
          
          // content가 있으면 드롭 가능 (기본값)
          if (nodeType.content) {
            return true;
          }
          
          // content가 없으면 드롭 불가능 (기본값)
          return false;
        }
      } catch (error) {
        // 스키마 조회 실패 시 계속 진행
      }
    }
    
    // 2. 스키마 정보가 없으면 노드의 content 필드 확인
    if (node.content !== undefined) {
      // content 필드가 있으면 드롭 가능
      return true;
    }
    
    // 3. 그 외의 경우는 드롭 불가능 (안전하게 false)
    return false;
  }

  /**
   * 특정 노드를 드롭 타겟 노드에 드롭할 수 있는지 확인합니다.
   * 
   * @param targetNodeId 드롭 타겟 노드 ID
   * @param draggedNodeId 드래그되는 노드 ID
   * @returns 드롭 가능 여부
   */
  canDropNode(targetNodeId: string, draggedNodeId: string): boolean {
    // 1. 드롭 타겟이 droppable인지 확인
    if (!this._isDroppableNode(targetNodeId)) {
      return false;
    }
    
    // 2. 드래그되는 노드가 draggable인지 확인
    if (!this._isDraggableNode(draggedNodeId)) {
      return false;
    }
    
    // 3. 스키마의 content 정의 확인
    const schema = (this.dataStore as any)._activeSchema;
    if (!schema) {
      // 스키마가 없으면 기본적으로 허용 (안전하게 true)
      return true;
    }
    
    const targetNode = this.dataStore.getNode(targetNodeId);
    const draggedNode = this.dataStore.getNode(draggedNodeId);
    
    if (!targetNode || !draggedNode) {
      return false;
    }
    
    try {
      const targetNodeType = schema.getNodeType?.(targetNode.stype);
      const draggedNodeType = schema.getNodeType?.(draggedNode.stype);
      
      if (!targetNodeType || !draggedNodeType) {
        return false;
      }
      
      const contentModel = targetNodeType.content;
      if (!contentModel) {
        // content가 없으면 드롭 불가능
        return false;
      }
      
      // content 모델에서 draggedNode의 group 또는 stype이 허용되는지 확인
      const draggedGroup = draggedNodeType.group;
      const draggedStype = draggedNode.stype;
      
      // 간단한 content 모델 파싱 (예: 'block+', 'inline*', 'block+ inline*')
      // 더 복잡한 파싱은 Validator.validateContentModel 사용
      const contentModelLower = contentModel.toLowerCase();
      
      // group 기반 확인
      if (draggedGroup) {
        if (contentModelLower.includes(draggedGroup)) {
          return true;
        }
      }
      
      // stype 기반 확인
      if (contentModelLower.includes(draggedStype)) {
        return true;
      }
      
      // content 모델이 '*' 또는 '+'로 끝나는 경우 (예: 'block*', 'inline+')
      // 모든 노드를 허용하는 것으로 간주하지 않음 (명시적으로 group 또는 stype이 있어야 함)
      
      return false;
    } catch (error) {
      // 스키마 조회 실패 시 안전하게 false 반환
      return false;
    }
  }

  /**
   * 문서 내 모든 드롭 가능한 노드를 조회합니다.
   * 
   * @param options 필터 옵션
   * @returns 드롭 가능한 노드 배열
   */
  getDroppableNodes(options?: {
    filter?: (node: INode) => boolean;
    includeBlocks?: boolean;
    includeInline?: boolean;
    includeDocument?: boolean;
  }): INode[] {
    const {
      filter,
      includeBlocks = true,
      includeInline = false,
      includeDocument = true
    } = options || {};

    const result: INode[] = [];
    
    for (const [nodeId, node] of this.dataStore.getNodes()) {
      if (!this._isDroppableNode(nodeId)) {
        continue;
      }

      // 타입별 필터링
      const schema = (this.dataStore as any)._activeSchema;
      let shouldInclude = true; // 기본값: 포함
      
      if (schema) {
        const nodeType = schema.getNodeType?.(node.stype);
        if (nodeType) {
          const group = nodeType.group;
          const isBlock = group === 'block';
          const isInline = group === 'inline';
          const isDocument = group === 'document';
          
          // 옵션이 하나라도 true이면 필터링 적용
          const hasFilter = includeBlocks || includeInline || includeDocument;
          
          if (hasFilter) {
            shouldInclude = false; // 기본값: 제외
            
            // OR 조건: 하나라도 조건에 맞으면 포함
            if (includeBlocks && isBlock) {
              shouldInclude = true;
            }
            if (includeInline && isInline) {
              shouldInclude = true;
            }
            if (includeDocument && isDocument) {
              shouldInclude = true;
            }
          }
          // 옵션이 모두 false이면 필터링 안 함 (기본값 true 유지)
        }
      }
      
      if (!shouldInclude) {
        continue;
      }

      // 커스텀 필터 적용
      if (filter && !filter(node)) {
        continue;
      }

      result.push(node);
    }

    return result;
  }

  /**
   * 노드 ID 배열에서 드롭 가능한 노드만 필터링합니다.
   * 
   * @param nodeIds 노드 ID 배열
   * @returns 드롭 가능한 노드 ID 배열
   */
  filterDroppableNodes(nodeIds: string[]): string[] {
    return nodeIds.filter(nodeId => this._isDroppableNode(nodeId));
  }

  /**
   * 노드가 indent 대상이 될 수 있는지 확인합니다.
   *
   * Indentable 노드:
   * - 활성 스키마가 존재해야 한다.
   * - 스키마의 NodeTypeDefinition 에서 indentable: true 로 명시된 노드.
   * - document 노드는 항상 false.
   *
   * @param nodeId 노드 ID
   * @returns indentable 여부
   */
  private _isIndentableNode(nodeId: string): boolean {
    const node = this.dataStore.getNode(nodeId);
    if (!node) {
      return false;
    }

    const schema = (this.dataStore as any)._activeSchema;
    if (!schema) {
      // 스키마가 없으면 indent 규칙을 알 수 없으므로 안전하게 false
      return false;
    }

    try {
      const nodeType = schema.getNodeType?.(node.stype);
      if (!nodeType) {
        return false;
      }

      // document 그룹은 항상 indent 대상이 아님
      if (nodeType.group === 'document') {
        return false;
      }

      return nodeType.indentable === true;
    } catch {
      return false;
    }
  }

  /**
   * 노드에 대한 indent 관련 메타데이터를 반환합니다.
   *
   * - 스키마가 없거나 노드/노드 타입을 찾지 못하면 null 반환.
   * - indentable, indentGroup, indentParentTypes, maxIndentLevel 을 포함합니다.
   */
  getIndentMetadata(nodeId: string): {
    indentable: boolean;
    indentGroup?: string;
    indentParentTypes?: string[];
    maxIndentLevel?: number;
  } | null {
    const node = this.dataStore.getNode(nodeId);
    if (!node) {
      return null;
    }

    const schema = (this.dataStore as any)._activeSchema;
    if (!schema) {
      return null;
    }

    const nodeType = schema.getNodeType?.(node.stype);
    if (!nodeType) {
      return null;
    }

    return {
      indentable: nodeType.indentable === true,
      indentGroup: nodeType.indentGroup,
      indentParentTypes: nodeType.indentParentTypes,
      maxIndentLevel: nodeType.maxIndentLevel
    };
  }

  // ===== Public schema-aware helpers (DataStore에서 직접 사용) =====

  /**
   * Public wrapper for editable check.
   */
  isEditableNode(nodeId: string): boolean {
    return this._isEditableNode(nodeId);
  }

  /**
   * Public wrapper for selectable check.
   */
  isSelectableNode(nodeId: string): boolean {
    return this._isSelectableNode(nodeId);
  }

  /**
   * Public wrapper for draggable check.
   */
  isDraggableNode(nodeId: string): boolean {
    return this._isDraggableNode(nodeId);
  }

  /**
   * Public wrapper for droppable check.
   */
  isDroppableNode(nodeId: string): boolean {
    return this._isDroppableNode(nodeId);
  }

  /**
   * Public wrapper for indentable check.
   */
  isIndentableNode(nodeId: string): boolean {
    return this._isIndentableNode(nodeId);
  }

  // ===== Indent / Outdent (구조 수준) =====

  /**
   * 현재 노드를 이전 형제 노드의 자식으로 들여쓰기 합니다.
   *
   * 기본 규칙:
   * - nodeType.indentable === true 인 block 노드만 대상.
   * - 이전 형제 노드가 존재해야 함.
   * - indentParentTypes 가 정의되어 있으면, 이전 형제의 stype 이 그 안에 포함되어야 함.
   * - maxIndentLevel 이 정의되어 있으면, 현재 깊이가 그 값 미만일 때만 허용.
   *
   * @returns 실제로 구조 변경이 일어났으면 true, 아니면 false
   */
  indentNode(nodeId: string): boolean {
    const node = this.dataStore.getNode(nodeId);
    if (!node) {
      return false;
    }

    const schema = (this.dataStore as any)._activeSchema;
    if (!schema) {
      return false;
    }

    const meta = this.getIndentMetadata(nodeId);
    if (!meta || !meta.indentable) {
      return false;
    }

    // 최대 들여쓰기 레벨 검사 (간단한 깊이 계산)
    if (typeof meta.maxIndentLevel === 'number') {
      const currentLevel = this._getIndentDepth(nodeId, meta.indentGroup);
      if (currentLevel >= meta.maxIndentLevel) {
        return false;
      }
    }

    // 이전 형제 노드를 부모 후보로 사용
    const prevSiblingId = this.getPreviousSibling(nodeId);
    if (!prevSiblingId) {
      return false;
    }

    const prevNode = this.dataStore.getNode(prevSiblingId);
    if (!prevNode) {
      return false;
    }

    const prevType = schema.getNodeType?.(prevNode.stype);
    if (!prevType) {
      return false;
    }

    // indentParentTypes 가 정의되어 있으면 stype 기준으로 체크
    if (meta.indentParentTypes && meta.indentParentTypes.length > 0) {
      if (!meta.indentParentTypes.includes(prevNode.stype)) {
        return false;
      }
    }

    // 실제 이동: 이전 형제의 마지막 자식으로 이동
    const baseContent = Array.isArray(prevNode.content) ? prevNode.content : [];
    const insertPos = baseContent.length;
    this.dataStore.moveNode(nodeId, prevSiblingId, insertPos);
    return true;
  }

  /**
   * 현재 노드를 한 단계 outdent 합니다.
   *
   * 기본 규칙:
   * - nodeType.indentable === true 인 노드만 대상.
   * - 부모가 존재해야 함.
   * - 부모의 부모(조부모)를 새 부모로 사용.
   *
   * @returns 실제로 구조 변경이 일어났으면 true, 아니면 false
   */
  outdentNode(nodeId: string): boolean {
    const node = this.dataStore.getNode(nodeId);
    if (!node) {
      return false;
    }

    const schema = (this.dataStore as any)._activeSchema;
    if (!schema) {
      return false;
    }

    const meta = this.getIndentMetadata(nodeId);
    if (!meta || !meta.indentable) {
      return false;
    }

    const parent = this.getParent(nodeId);
    if (!parent) {
      return false;
    }

    const grandParent = parent.parentId ? this.dataStore.getNode(parent.parentId) : undefined;
    if (!grandParent) {
      // 더 이상 outdent 할 수 없음 (루트 수준)
      return false;
    }

    // 부모가 grandParent.content 안에서 어디 있는지 찾아, 그 바로 뒤에 node 를 삽입
    const gpContent = Array.isArray(grandParent.content) ? grandParent.content : [];
    const parentIndex = gpContent.indexOf(parent.sid!);
    const insertPos = parentIndex >= 0 ? parentIndex + 1 : gpContent.length;

    this.dataStore.moveNode(nodeId, grandParent.sid!, insertPos);
    return true;
  }

  /**
   * indent 깊이(레벨)을 대략적으로 계산합니다.
   *
   * - 같은 indentGroup 또는 indentable 노드를 위로 타고 올라가며 카운트합니다.
   * - group, indentGroup 설계에 따라 "시각적 들여쓰기 수준"과 완전히 일치하지 않을 수 있지만,
   *   maxIndentLevel 제한을 위한 보수적인 지표로 사용합니다.
   */
  private _getIndentDepth(nodeId: string, indentGroup?: string): number {
    let depth = 0;
    let current = this.getParent(nodeId);
    const schema = (this.dataStore as any)._activeSchema;

    while (current && schema) {
      const nodeType = schema.getNodeType?.(current.stype);
      if (!nodeType) break;

      if (nodeType.indentable) {
        depth += 1;
      } else if (indentGroup && nodeType.indentGroup === indentGroup) {
        depth += 1;
      }

      current = current.parentId ? this.dataStore.getNode(current.parentId) : undefined;
    }

    return depth;
  }

  /**
   * 노드가 편집 가능한 노드인지 확인합니다.
   * 
   * 편집 가능한 노드:
   * - 텍스트 노드 (.text 필드가 있음)
   * - inline 노드 (group === 'inline')
   * - editable block 노드 (group === 'block' && editable === true && .text 필드 있음)
   * 
   * 편집 불가능한 노드:
   * - block 노드 (group === 'block', editable 속성 없음)
   * - document 노드 (group === 'document')
   * 
   * @param nodeId 노드 ID
   * @returns 편집 가능 여부
   */
  private _isEditableNode(nodeId: string): boolean {
    const node = this.dataStore.getNode(nodeId);
    if (!node) {
      return false;
    }
    
    // 1. 먼저 스키마에서 group 확인 (우선순위 1)
    const schema = (this.dataStore as any)._activeSchema;
    if (schema) {
      try {
        const nodeType = schema.getNodeType?.(node.stype);
        if (nodeType) {
          const group = nodeType.group;
          
          // Editable Block: block이지만 editable=true이면 편집 가능
          if (group === 'block' && nodeType.editable === true) {
            // .text 필드가 있어야 편집 가능
            if (node.text !== undefined && typeof node.text === 'string') {
              return true;
            }
            // .text 필드가 없으면 편집 불가능
            return false;
          }
          
          // 일반 block 또는 document 노드는 편집 불가능
          if (group === 'block' || group === 'document') {
            return false;
          }
          
          // inline 노드는 편집 가능
          if (group === 'inline') {
            return true;
          }
        }
      } catch (error) {
        // 스키마 조회 실패 시 계속 진행
      }
    }
    
    // 2. 스키마 정보가 없으면 stype으로 추정
    // 'inline-' 접두사가 있으면 inline 노드로 간주
    if (node.stype && node.stype.startsWith('inline-')) {
      return true;
    }
    
    // 3. block 노드로 추정 (content가 있고 text 필드가 없으면 block으로 간주)
    if (node.content && node.text === undefined) {
      return false;
    }
    
    // 4. 텍스트 노드 (.text 필드가 있고, block이 아닌 경우)
    // 주의: codeBlock처럼 .text 필드가 있어도 group이 'block'이면 이미 위에서 처리됨
    if (node.text !== undefined && typeof node.text === 'string') {
      return true;
    }
    
    // 5. 그 외의 경우는 편집 가능한 노드로 간주 (안전하게 true)
    return true;
  }

  /**
   * 문서 순서상 이전 편집 가능한 노드를 찾습니다.
   * 
   * Backspace, 화살표 키 등에서 사용: block 노드는 건너뛰고 inline/텍스트 노드만 반환
   * 
   * @param nodeId 현재 노드 ID
   * @returns 이전 편집 가능한 노드 ID (없으면 null)
   * 
   * @example
   * ```typescript
   * // document > paragraph-1 > [text-1, text-2]
   * // document > paragraph-2 > [text-3]
   * 
   * getPreviousEditableNode('text-3') // 'text-2' (이전 단락의 마지막 텍스트)
   * getPreviousEditableNode('text-2') // 'text-1'
   * getPreviousEditableNode('text-1') // null (이전 편집 가능한 노드 없음)
   * ```
   */
  getPreviousEditableNode(nodeId: string): string | null {
    let currentId: string | null = nodeId;
    const visited = new Set<string>(); // 무한 루프 방지
    
    while (currentId) {
      // 무한 루프 방지
      if (visited.has(currentId)) {
        console.warn('[UtilityOperations] getPreviousEditableNode: Circular reference detected', { nodeId, currentId });
        return null;
      }
      visited.add(currentId);
      
      // 이전 노드 찾기
      const prevId = this.getPreviousNode(currentId);
      if (!prevId) {
        return null; // 더 이상 이전 노드가 없음
      }
      
      // 편집 가능한 노드인지 확인
      if (this._isEditableNode(prevId)) {
        return prevId;
      }
      
      // 편집 불가능한 노드(block/document)면 건너뛰고 계속 찾기
      currentId = prevId;
    }
    
    return null;
  }

  /**
   * 문서 순서상 다음 편집 가능한 노드를 찾습니다.
   * 
   * Delete, 화살표 키 등에서 사용: block 노드는 건너뛰고 inline/텍스트 노드만 반환
   * 
   * @param nodeId 현재 노드 ID
   * @returns 다음 편집 가능한 노드 ID (없으면 null)
   * 
   * @example
   * ```typescript
   * // document > paragraph-1 > [text-1, text-2]
   * // document > paragraph-2 > [text-3]
   * 
   * getNextEditableNode('text-1') // 'text-2'
   * getNextEditableNode('text-2') // 'text-3' (다음 단락의 첫 텍스트)
   * getNextEditableNode('text-3') // null (다음 편집 가능한 노드 없음)
   * ```
   */
  getNextEditableNode(nodeId: string): string | null {
    let currentId: string | null = nodeId;
    const visited = new Set<string>(); // 무한 루프 방지
    
    while (currentId) {
      // 무한 루프 방지
      if (visited.has(currentId)) {
        console.warn('[UtilityOperations] getNextEditableNode: Circular reference detected', { nodeId, currentId });
        return null;
      }
      visited.add(currentId);
      
      // 다음 노드 찾기
      const nextId = this.getNextNode(currentId);
      if (!nextId) {
        return null; // 더 이상 다음 노드가 없음
      }
      
      // 편집 가능한 노드인지 확인
      if (this._isEditableNode(nextId)) {
        return nextId;
      }
      
      // 편집 불가능한 노드(block/document)면 건너뛰고 계속 찾기
      currentId = nextId;
    }
    
    return null;
  }

  /**
   * 문서 순회를 위한 Iterator를 생성합니다.
   * 
   * @param options 순회 옵션
   * @returns DocumentIterator 인스턴스
   * 
   * @example
   * ```typescript
   * // 기본 순회
   * const iterator = dataStore.createDocumentIterator();
   * for (const nodeId of iterator) {
   *   console.log(nodeId);
   * }
   * 
   * // 특정 타입만 필터링
   * const textIterator = dataStore.createDocumentIterator({
   *   filter: { stype: 'inline-text' }
   * });
   * 
   * // 특정 깊이까지만
   * const shallowIterator = dataStore.createDocumentIterator({
   *   maxDepth: 2
   * });
   * ```
   */
  createDocumentIterator(options: DocumentIteratorOptions = {}): DocumentIterator {
    return new DocumentIterator(this.dataStore, options);
  }

  /**
   * Visitor 패턴을 사용하여 문서를 순회합니다.
   * 
   * @param visitors 방문자 객체들 (가변 인자)
   * @param options 순회 옵션
   * @returns 순회 결과 정보 (단일 visitor) 또는 각 Visitor의 실행 결과 (다중 visitor)
   * 
   * @example
   * ```typescript
   * // 단일 visitor
   * const visitor = {
   *   visit(nodeId, node) {
   *     console.log(`Visiting: ${nodeId} (${node.type})`);
   *   }
   * };
   * 
   * const result = dataStore.traverse(visitor);
   * 
   * // 다중 visitor (가변 인자)
   * const textExtractor = new TextExtractor();
   * const linkCollector = new LinkCollector();
   * const nodeCounter = new NodeCounter();
   * 
   * const results = dataStore.traverse(textExtractor, linkCollector, nodeCounter);
   * 
   * // 배열로도 가능
   * const results2 = dataStore.traverse([textExtractor, linkCollector]);
   * ```
   */
  traverse(
    ...args: [DocumentVisitor, ...DocumentVisitor[]] | [DocumentVisitor[], VisitorTraversalOptions?] | [DocumentVisitor, VisitorTraversalOptions?]
  ): {
    visitedCount: number;
    skippedCount: number;
    stopped: boolean;
  } | Array<{
    visitor: DocumentVisitor;
    result: { visitedCount: number; skippedCount: number; stopped: boolean };
  }> {
    // 인자 파싱
    let visitors: DocumentVisitor[];
    let options: VisitorTraversalOptions = {} as VisitorTraversalOptions;

    if (args.length === 0) {
      throw new Error('At least one visitor is required');
    }

    // 첫 번째 인자가 배열인 경우
    if (Array.isArray(args[0])) {
      visitors = args[0] as DocumentVisitor[];
      options = (args[1] as VisitorTraversalOptions) || ({} as VisitorTraversalOptions);
    } else {
      // 가변 인자인 경우
      const lastArg = args[args.length - 1] as unknown;
      
      // 마지막 인자가 옵션인지 확인 (visit 메서드가 없고, context, filter 등의 속성이 있으면 옵션)
      if (
        lastArg &&
        typeof lastArg === 'object' &&
        !('visit' in (lastArg as any)) &&
        (
          (lastArg as any).context !== undefined ||
          (lastArg as any).filter !== undefined ||
          (lastArg as any).maxDepth !== undefined ||
          (lastArg as any).reverse !== undefined ||
          (lastArg as any).startNodeId !== undefined ||
          (lastArg as any).customFilter !== undefined ||
          (lastArg as any).shouldStop !== undefined ||
          (lastArg as any).range !== undefined
        )
      ) {
        visitors = args.slice(0, -1) as unknown as DocumentVisitor[];
        options = lastArg as VisitorTraversalOptions;
      } else {
        visitors = args as unknown as DocumentVisitor[];
      }
    }
    
    // 단일 visitor인 경우 단일 결과 반환
    if (visitors.length === 1) {
      const result = this._traverseSingleVisitor(visitors[0], options);
      return result;
    }
    
    // 다중 visitor인 경우 각각의 결과 반환
    return visitors.map(visitor => ({
      visitor,
      result: this._traverseSingleVisitor(visitor, options)
    }));
  }

  /**
   * 단일 Visitor를 순회하는 내부 메서드
   */
  private _traverseSingleVisitor(visitor: DocumentVisitor, options: VisitorTraversalOptions = {}): {
    visitedCount: number;
    skippedCount: number;
    stopped: boolean;
  } {
    const iterator = new DocumentIterator(this.dataStore, options);
    let visitedCount = 0;
    let skippedCount = 0;
    let stopped = false;

    for (const nodeId of iterator) {
      const node = this.dataStore.getNode(nodeId);
      if (!node) continue;

      // enter 호출
      if (visitor.enter) {
        visitor.enter(nodeId, node, options.context);
      }

      // shouldVisitChildren 체크
      if (visitor.shouldVisitChildren && !visitor.shouldVisitChildren(nodeId, node)) {
        skippedCount++;
        // exit 호출
        if (visitor.exit) {
          visitor.exit(nodeId, node, options.context);
        }
        continue;
      }

      // visit 호출
      const result = visitor.visit(nodeId, node, options.context);
      
      // visit에서 false 반환 시 하위 노드 스킵
      if (result === false) {
        skippedCount++;
        // exit 호출
        if (visitor.exit) {
          visitor.exit(nodeId, node, options.context);
        }
        continue;
      }

      visitedCount++;

      // shouldStop 체크
      if (options.shouldStop && options.shouldStop(nodeId, node)) {
        stopped = true;
        // exit 호출
        if (visitor.exit) {
          visitor.exit(nodeId, node, options.context);
        }
        break;
      }

      // exit 호출
      if (visitor.exit) {
        visitor.exit(nodeId, node, options.context);
      }
    }

    return { visitedCount, skippedCount, stopped };
  }

  // ========== Drop Behavior ==========

  /**
   * 기본 드롭 행위를 결정합니다.
   * 
   * @param targetNode 타겟 노드
   * @param sourceNode 소스 노드
   * @param context 드롭 컨텍스트
   * @returns 드롭 행위
   */
  private _getDefaultDropBehavior(
    targetNode: INode,
    sourceNode: INode,
    context: DropContext
  ): DropBehavior {
    // 타입 조합 기본 규칙
    // 1. 텍스트 노드 → 텍스트 노드: merge
    if (typeof targetNode.text === 'string' && typeof sourceNode.text === 'string') {
      return 'merge';
    }
    
    const schema = (this.dataStore as any)._activeSchema;
    if (schema) {
      const targetType = schema.getNodeType?.(targetNode.stype);
      const sourceType = schema.getNodeType?.(sourceNode.stype);
      
      if (targetType && sourceType) {
        // 2. block(예: paragraph) ← inline 텍스트: merge
        if (
          targetType.group === 'block' &&
          sourceType.group === 'inline' &&
          typeof sourceNode.text === 'string'
        ) {
          return 'merge';
        }
        
        // 3. 같은 타입의 block: move
        if (
          targetType.group === 'block' &&
          sourceType.group === 'block' &&
          targetNode.stype === sourceNode.stype
        ) {
          return 'move';
        }
      }
    }
    
    // 4. 기본값: move (내부 드래그)
    return 'move';
  }

  /**
   * 드롭 타겟에 소스 노드를 드롭했을 때의 행위를 결정합니다.
   * 
   * 우선순위:
   * 1. UI 컨텍스트 (Ctrl/Cmd = copy) - 최우선
   * 2. defineDropBehavior 규칙 (동적 규칙)
   * 3. 스키마 dropBehaviorRules (기본 규칙 힌트)
   * 4. 타입 조합 기본 규칙 (내장 규칙)
   * 5. 기본값 (move/insert)
   * 
   * @param targetNodeId 드롭 타겟 노드 ID
   * @param sourceNodeId 소스 노드 ID
   * @param context UI 컨텍스트 (선택적)
   * @returns 드롭 행위
   */

  /**
   * 드롭 타겟에 소스 노드를 드롭했을 때의 행위를 결정합니다.
   * 
   * 우선순위:
   * 1. UI 컨텍스트 (Ctrl/Cmd = copy) - 최우선
   * 2. defineDropBehavior 규칙 (동적 규칙)
   * 3. 스키마 dropBehaviorRules (기본 규칙 힌트)
   * 4. 타입 조합 기본 규칙 (내장 규칙)
   * 5. 기본값 (move/insert)
   * 
   * @param targetNodeId 드롭 타겟 노드 ID
   * @param sourceNodeId 소스 노드 ID
   * @param context UI 컨텍스트 (선택적)
   * @returns 드롭 행위
   */
  getDropBehavior(
    targetNodeId: string,
    sourceNodeId: string,
    context?: DropContext
  ): DropBehavior {
    const targetNode = this.dataStore.getNode(targetNodeId);
    const sourceNode = this.dataStore.getNode(sourceNodeId);
    
    if (!targetNode || !sourceNode) {
      return 'move'; // 기본값
    }
    
    const schema = (this.dataStore as any)._activeSchema;
    const sourceStype = sourceNode.stype;
    const dropContext = context || {};
    
    // 1. UI 컨텍스트 확인 (최우선)
    if (dropContext.modifiers?.ctrlKey || dropContext.modifiers?.metaKey) {
      return 'copy'; // Ctrl/Cmd + 드래그 = 복사
    }
    
    // 2. 외부 드래그 확인 (UI 컨텍스트 다음)
    if (dropContext.sourceOrigin === 'external') {
      return 'insert';
    }
    
    // 3. defineDropBehavior 규칙 확인
    const registeredBehavior = globalDropBehaviorRegistry.get(
      targetNode.stype,
      sourceStype,
      targetNode,
      sourceNode,
      dropContext
    );
    
    if (registeredBehavior !== null) {
      return registeredBehavior;
    }
    
    // 4. 스키마의 dropBehaviorRules 확인
    if (schema) {
      const targetType = schema.getNodeType?.(targetNode.stype);
      if (targetType?.dropBehaviorRules) {
        const rules = targetType.dropBehaviorRules;
        
        // 소스 타입별 규칙 확인 (우선순위: stype > *)
        if (rules[sourceStype]) {
          return rules[sourceStype] as DropBehavior;
        }
        
        if (rules['*']) {
          return rules['*'] as DropBehavior;
        }
      }
    }
    
    // 5. 타입 조합 기본 규칙 (스키마 규칙이 없을 때만)
    // 6. 기본값
    return this._getDefaultDropBehavior(targetNode, sourceNode, dropContext);
  }
}

/**
 * 문서 순회 범위 정의
 */
export interface DocumentRange {
  /** 시작 노드 ID */
  startNodeId: string;
  /** 끝 노드 ID */
  endNodeId: string;
  /** 시작 노드 포함 여부 (기본값: true) */
  includeStart?: boolean;
  /** 끝 노드 포함 여부 (기본값: true) */
  includeEnd?: boolean;
}

/**
 * 문서 노드 방문을 위한 Visitor 인터페이스
 */
export interface DocumentVisitor {
  /** 노드 방문 시 호출 (필수) */
  visit(nodeId: string, node: any, context?: any): void | boolean;
  
  /** 노드 진입 시 호출 (선택) */
  enter?(nodeId: string, node: any, context?: any): void;
  
  /** 노드 종료 시 호출 (선택) */
  exit?(nodeId: string, node: any, context?: any): void;
  
  /** 하위 트리 방문 여부 결정 (선택) */
  shouldVisitChildren?(nodeId: string, node: any): boolean;
}

/**
 * Visitor 순회 옵션
 */
export interface VisitorTraversalOptions {
  /** 시작 노드 ID (기본값: 루트 노드) */
  startNodeId?: string;
  /** 역순 순회 여부 */
  reverse?: boolean;
  /** 최대 깊이 제한 */
  maxDepth?: number;
  /** 노드 타입 필터 */
  filter?: {
    stype?: string;
    stypes?: string[];
    excludeStypes?: string[];
  };
  /** 사용자 정의 필터 함수 */
  customFilter?: (nodeId: string, node: any) => boolean;
  /** 순회 중단 조건 */
  shouldStop?: (nodeId: string, node: any) => boolean;
  /** 순회 범위 제한 */
  range?: DocumentRange;
  /** 컨텍스트 객체 */
  context?: any;
}

/**
 * 문서 순회 옵션
 */
export interface DocumentIteratorOptions {
  /** 시작 노드 ID (기본값: 루트 노드) */
  startNodeId?: string;
  /** 역순 순회 여부 */
  reverse?: boolean;
  /** 최대 깊이 제한 */
  maxDepth?: number;
  /** 노드 타입 필터 */
  filter?: {
    stype?: string;
    stypes?: string[];
    excludeStypes?: string[];
  };
  /** 사용자 정의 필터 함수 */
  customFilter?: (nodeId: string, node: any) => boolean;
  /** 순회 중단 조건 */
  shouldStop?: (nodeId: string, node: any) => boolean;
  /** 순회 범위 제한 */
  range?: DocumentRange;
}

/**
 * 문서 순회를 위한 Iterator 클래스
 */
export class DocumentIterator implements IterableIterator<string> {
  private currentId: string | null;
  private visited = new Set<string>();
  private options: Required<DocumentIteratorOptions>;
  private rangeStartId: string | null = null;
  private rangeEndId: string | null = null;
  private inRange = false;

  constructor(
    private dataStore: any,
    options: DocumentIteratorOptions = {}
  ) {
    this.options = {
      startNodeId: (options.startNodeId || this.dataStore.getRootNodeId()) as string,
      reverse: options.reverse || false,
      maxDepth: options.maxDepth || Infinity,
      filter: options.filter || {},
      customFilter: options.customFilter || (() => true),
      shouldStop: options.shouldStop || (() => false),
      range: options.range as any
    } as Required<DocumentIteratorOptions>;

    // 범위 설정
    if (this.options.range) {
      this.rangeStartId = this.options.range.startNodeId;
      this.rangeEndId = this.options.range.endNodeId;
    }

    // 역순 순회인 경우 마지막 노드부터 시작
    if (this.options.reverse) {
      this.currentId = this.findLastNode();
    } else {
      this.currentId = this.options.startNodeId;
    }
  }

  [Symbol.iterator](): IterableIterator<string> {
    return this;
  }

  next(): IteratorResult<string> {
    while (this.currentId) {
      const node = this.dataStore.getNode(this.currentId);
      
      if (!node) {
        this.currentId = this.getNextNode();
        continue;
      }

      // 범위 체크
      if (!this.isInRange(this.currentId)) {
        this.currentId = this.getNextNode();
        continue;
      }

      // 중복 방문 체크
      if (this.visited.has(this.currentId)) {
        this.currentId = this.getNextNode();
        continue;
      }

      // 깊이 체크
      const depth = this.dataStore.getNodePath(this.currentId).length;
      if (depth > this.options.maxDepth) {
        this.currentId = this.getNextNode();
        continue;
      }

      // 타입 필터 체크
      if (!this.matchesTypeFilter(node)) {
        this.currentId = this.getNextNode();
        continue;
      }

      // 사용자 정의 필터 체크
      if (!this.options.customFilter(this.currentId, node)) {
        this.currentId = this.getNextNode();
        continue;
      }

      // 중단 조건 체크
      if (this.options.shouldStop(this.currentId, node)) {
        this.currentId = null;
        break;
      }

      // 방문 표시
      this.visited.add(this.currentId);
      const result = this.currentId;
      this.currentId = this.getNextNode();

      return { value: result, done: false };
    }

    return { value: undefined, done: true };
  }

  private getNextNode(): string | null {
    if (!this.currentId) return null;

    if (this.options.reverse) {
      return this.dataStore.utility.getPreviousNode(this.currentId);
    } else {
      return this.dataStore.utility.getNextNode(this.currentId);
    }
  }

  private matchesTypeFilter(node: any): boolean {
    const { filter } = this.options;
    
    // 노드는 stype 필드를 사용
    const nodeType = node.stype;
    const filterAny: any = filter || {};
    const filterType = filterAny.stype;
    
    if (filterType && nodeType !== filterType) {
      return false;
    }
    
    if (filter.stypes && !filter.stypes.includes(nodeType)) {
      return false;
    }
    
    if (filter.excludeStypes && filter.excludeStypes.includes(nodeType)) {
      return false;
    }
    
    return true;
  }

  /**
   * 현재 노드가 순회 범위 내에 있는지 확인합니다.
   */
  private isInRange(nodeId: string): boolean {
    // 범위가 설정되지 않은 경우 모든 노드 허용
    if (!this.options.range || !this.rangeStartId || !this.rangeEndId) {
      return true;
    }

    const { includeStart = true, includeEnd = true } = this.options.range;

    // 시작 노드 체크
    if (nodeId === this.rangeStartId) {
      return includeStart;
    }

    // 끝 노드 체크
    if (nodeId === this.rangeEndId) {
      return includeEnd;
    }

    // 범위 내 노드인지 확인
    const comparison = this.dataStore.utility.compareDocumentOrder(nodeId, this.rangeStartId);
    const endComparison = this.dataStore.utility.compareDocumentOrder(nodeId, this.rangeEndId);

    // 시작 노드보다 앞에 있으면 범위 밖
    if (comparison < 0) {
      return false;
    }

    // 끝 노드보다 뒤에 있으면 범위 밖
    if (endComparison > 0) {
      return false;
    }

    // 범위 내에 있음
    return true;
  }

  /**
   * 현재 Iterator의 상태를 리셋합니다.
   */
  reset(): void {
    this.currentId = this.options.startNodeId;
    this.visited.clear();
  }

  /**
   * 특정 노드부터 순회를 시작합니다.
   */
  startFrom(nodeId: string): void {
    this.currentId = nodeId;
    this.visited.clear();
  }

  /**
   * 순회 옵션을 업데이트합니다.
   */
  updateOptions(newOptions: Partial<DocumentIteratorOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }

  /**
   * 모든 노드를 배열로 수집합니다.
   */
  toArray(): string[] {
    const result: string[] = [];
    for (const nodeId of this) {
      result.push(nodeId);
    }
    return result;
  }

  /**
   * 조건에 맞는 첫 번째 노드를 찾습니다.
   */
  find(predicate: (nodeId: string, node: any) => boolean): string | null {
    for (const nodeId of this) {
      const node = this.dataStore.getNode(nodeId);
      if (predicate(nodeId, node)) {
        return nodeId;
      }
    }
    return null;
  }

  /**
   * 조건에 맞는 모든 노드를 찾습니다.
   */
  findAll(predicate: (nodeId: string, node: any) => boolean): string[] {
    const result: string[] = [];
    for (const nodeId of this) {
      const node = this.dataStore.getNode(nodeId);
      if (predicate(nodeId, node)) {
        result.push(nodeId);
      }
    }
    return result;
  }

  /**
   * 순회 중 특정 조건에서 중단합니다.
   */
  takeWhile(predicate: (nodeId: string, node: any) => boolean): string[] {
    const result: string[] = [];
    for (const nodeId of this) {
      const node = this.dataStore.getNode(nodeId);
      if (!predicate(nodeId, node)) {
        break;
      }
      result.push(nodeId);
    }
    return result;
  }

  /**
   * 순회 통계를 반환합니다.
   */
  getStats(): { total: number; byType: Record<string, number>; byDepth: Record<number, number> } {
    const stats = {
      total: 0,
      byType: {} as Record<string, number>,
      byDepth: {} as Record<number, number>
    };

    for (const nodeId of this) {
      const node = this.dataStore.getNode(nodeId);
      const depth = this.dataStore.getNodePath(nodeId).length;
      
      stats.total++;
      // 노드는 stype 필드를 사용
      const nodeType = node.stype || 'unknown';
      stats.byType[nodeType] = (stats.byType[nodeType] || 0) + 1;
      stats.byDepth[depth] = (stats.byDepth[depth] || 0) + 1;
    }

    return stats;
  }

  /**
   * 문서의 마지막 노드를 찾습니다.
   */
  private findLastNode(): string | null {
    let currentId = this.options.startNodeId;
    let lastNodeId = currentId;

    while (currentId) {
      lastNodeId = currentId;
      currentId = this.dataStore.utility.getNextNode(currentId);
    }

    return lastNodeId;
  }

  /**
   * 범위 내의 모든 노드를 배열로 반환합니다.
   */
  getNodesInRange(): string[] {
    if (!this.options.range) {
      return this.toArray();
    }

    const result: string[] = [];
    for (const nodeId of this) {
      result.push(nodeId);
    }
    return result;
  }

  /**
   * 범위 내의 노드 개수를 반환합니다.
   */
  getRangeNodeCount(): number {
    if (!this.options.range) {
      return this.getStats().total;
    }

    let count = 0;
    for (const nodeId of this) {
      count++;
    }
    return count;
  }

  /**
   * 범위 정보를 반환합니다.
   */
  getRangeInfo(): { start: string; end: string; includeStart: boolean; includeEnd: boolean } | null {
    if (!this.options.range) {
      return null;
    }

    return {
      start: this.options.range.startNodeId,
      end: this.options.range.endNodeId,
      includeStart: this.options.range.includeStart ?? true,
      includeEnd: this.options.range.includeEnd ?? true
    };
  }
}
