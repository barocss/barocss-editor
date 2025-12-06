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
    if (currentIndex <= 0) return null; // First sibling or not found
    
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
    if (currentIndex === -1 || currentIndex >= parent.content.length - 1) return null; // Last sibling or not found
    
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
    
    // If same node, return itself
    if (nodeId1 === nodeId2) return nodeId1;
    
    // Get ancestor path of node1
    const ancestors1 = new Set<string>();
    let currentId: string | undefined = nodeId1;
    while (currentId) {
      ancestors1.add(currentId);
      const node = this.dataStore.getNode(currentId);
      currentId = node?.parentId;
    }
    
    // Find common ancestor by following node2's ancestor path
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
    
    // If same node, distance is 0
    if (nodeId1 === nodeId2) return 0;
    
    // Find common ancestor
    const commonAncestorId = this.getCommonAncestor(nodeId1, nodeId2);
    if (!commonAncestorId) return -1;
    
    // Distance from node1 to common ancestor
    let distance1 = 0;
    let currentId: string | undefined = nodeId1;
    while (currentId && currentId !== commonAncestorId) {
      distance1++;
      const node = this.dataStore.getNode(currentId);
      currentId = node?.parentId;
    }
    
    // Distance from node2 to common ancestor
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
        // Return empty array if non-existent node is found
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
   * @returns Cloned DataStore instance
   */
  clone(): any {
    // Create new DataStore instance: schema is shared (reference maintained), session ID is same value
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
   * compareDocumentOrder('text-1', 'text-2') // -1 (text-1 is before)
   * compareDocumentOrder('text-2', 'text-1') // 1 (text-2 is after)
   * compareDocumentOrder('text-1', 'text-1') // 0 (same node)
   * compareDocumentOrder('text-2', 'text-3') // -1 (text-2 is before)
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

    // Find common ancestor
    let commonAncestorIndex = 0;
    const minLength = Math.min(path1.length, path2.length);
    
    for (let i = 0; i < minLength; i++) {
      if (path1[i] === path2[i]) {
        commonAncestorIndex = i;
      } else {
        break;
      }
    }

    // If no common ancestor (different roots)
    if (commonAncestorIndex === 0 && path1[0] !== path2[0]) {
      throw new Error('Nodes are not in the same document tree');
    }

    // Compare order at next level of common ancestor
    const nextIndex1 = commonAncestorIndex + 1;
    const nextIndex2 = commonAncestorIndex + 1;

    // If one path is a subset of the other
    if (nextIndex1 >= path1.length) {
      return -1; // path1 is shorter (ancestor)
    }
    if (nextIndex2 >= path2.length) {
      return 1; // path2 is shorter (ancestor)
    }

    // Compare sibling order at common parent
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
   * Find the next node of the given node in document order
   * 
   * @param nodeId Current node ID
   * @returns Next node ID (null if none)
   * 
   * @example
   * ```typescript
   * // document > paragraph-1 > [text-1, text-2]
   * // document > paragraph-2 > [text-3]
   * 
   * getNextNode('text-1') // 'text-2'
   * getNextNode('text-2') // 'text-3' (to next paragraph)
   * getNextNode('text-3') // null (last node)
   * getNextNode('paragraph-1') // 'text-1' (first child)
   * ```
   */
  getNextNode(nodeId: string): string | null {
    const node = this.dataStore.getNode(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    // 1. If child nodes exist, return first child
    if (node.content && node.content.length > 0) {
      return node.content[0] as string;
    }

    // 2. If sibling nodes exist, return next sibling
    const parent = this.getParent(nodeId);
    if (parent && parent.content) {
      const currentIndex = parent.content.indexOf(nodeId);
      if (currentIndex !== -1 && currentIndex < parent.content.length - 1) {
        return parent.content[currentIndex + 1] as string;
      }
    }

    // 3. Find parent's next sibling (recursively, but don't find children)
    if (parent) {
      const parentNext = this._getNextSiblingOnly(parent.sid!);
      if (parentNext) {
        return parentNext;
      }
    }

    // 4. No more next nodes
    return null;
  }

  /**
   * Find only parent's next sibling (don't find children)
   */
  private _getNextSiblingOnly(nodeId: string): string | null {
    const parent = this.getParent(nodeId);
    if (parent && parent.content) {
      const currentIndex = parent.content.indexOf(nodeId);
      if (currentIndex !== -1 && currentIndex < parent.content.length - 1) {
        return parent.content[currentIndex + 1] as string;
      }
    }

    // Go up further to find sibling
    if (parent) {
      return this._getNextSiblingOnly(parent.sid!);
    }

    return null;
  }

  /**
   * Find the previous node of the given node in document order
   * 
   * @param nodeId Current node ID
   * @returns Previous node ID (null if none)
   * 
   * @example
   * ```typescript
   * // document > paragraph-1 > [text-1, text-2]
   * // document > paragraph-2 > [text-3]
   * 
   * getPreviousNode('text-3') // 'text-2' (to previous paragraph)
   * getPreviousNode('text-2') // 'text-1'
   * getPreviousNode('text-1') // 'paragraph-1' (parent)
   * getPreviousNode('paragraph-1') // 'document' (parent)
   * ```
   */
  getPreviousNode(nodeId: string): string | null {
    const node = this.dataStore.getNode(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    // 1. If previous sibling node exists, return that sibling's last child
    const parent = this.getParent(nodeId);
    if (parent && parent.content) {
      const currentIndex = parent.content.indexOf(nodeId);
      if (currentIndex > 0) {
        const previousSiblingId = parent.content[currentIndex - 1] as string;
        return this._getLastDescendant(previousSiblingId);
      }
    }

    // 2. Return parent node (if parent exists)
    if (parent) {
      return parent.sid!;
    }

    // 3. No more previous nodes
    return null;
  }

  /**
   * Find the last descendant of the given node (recursively)
   */
  private _getLastDescendant(nodeId: string): string {
    const node = this.dataStore.getNode(nodeId);
    if (!node || !node.content || node.content.length === 0) {
      return nodeId; // If no children, return itself
    }

    // Find last descendant of last child
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

      // Filter by type
      const schema = (this.dataStore as any)._activeSchema;
      if (schema) {
        const nodeType = schema.getNodeType?.(node.stype);
        if (nodeType) {
          const group = nodeType.group;
          const isTextNode = node.text !== undefined && typeof node.text === 'string';
          const isEditableBlock = group === 'block' && nodeType.editable === true && isTextNode;
          const isInline = group === 'inline';
          
          // Handle editable block separately
          if (isEditableBlock) {
            if (!includeEditableBlocks) {
              continue;
            }
          } else {
            // Filter text nodes (excluding editable blocks)
            if (isTextNode && !includeText) {
              continue;
            }
            // Filter inline nodes (only if not text node)
            if (isInline && !isTextNode && !includeInline) {
              continue;
            }
          }
        }
      }

      // Apply custom filter
      if (filter && !filter(node)) {
        continue;
      }

      result.push(node);
    }

    return result;
  }

  /**
   * Filter only editable nodes from node ID array
   * 
   * @param nodeIds Node ID array
   * @returns Editable node ID array
   */
  filterEditableNodes(nodeIds: string[]): string[] {
    return nodeIds.filter(nodeId => this._isEditableNode(nodeId));
  }

  /**
   * Filter only selectable nodes from node ID array
   * 
   * @param nodeIds Node ID array
   * @returns Selectable node ID array
   */
  filterSelectableNodes(nodeIds: string[]): string[] {
    return nodeIds.filter(nodeId => this._isSelectableNode(nodeId));
  }

  /**
   * Check if node is selectable
   * 
   * Selectable nodes:
   * - By default, all nodes are selectable (except document)
   * - If selectable: false is specified in schema, not selectable
   * - document nodes are always not selectable
   * 
   * Non-selectable nodes:
   * - document nodes (group === 'document')
   * - Nodes with selectable: false specified
   * 
   * @param nodeId Node ID
   * @returns Whether selectable
   */
  private _isSelectableNode(nodeId: string): boolean {
    const node = this.dataStore.getNode(nodeId);
    if (!node) {
      return false;
    }
    
    // 1. Check group from schema (highest priority)
    const schema = (this.dataStore as any)._activeSchema;
    if (schema) {
      try {
        const nodeType = schema.getNodeType?.(node.stype);
        if (nodeType) {
          const group = nodeType.group;
          
          // document nodes are always not selectable
          if (group === 'document') {
            return false;
          }
          
          // If selectable property is explicitly false, not selectable
          if (nodeType.selectable === false) {
            return false;
          }
          
          // Otherwise selectable (default true)
          return true;
        }
      } catch (error) {
        // Continue if schema lookup fails
      }
    }
    
    // 2. If no schema info, selectable by default (except document)
    // If stype is 'document', not selectable
    if (node.stype === 'document') {
      return false;
    }
    
    // 3. Otherwise selectable (safely true)
    return true;
  }

  /**
   * Get all selectable nodes in document
   * 
   * @param options Filter options
   * @returns Selectable node array
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

      // Filter by type
      const schema = (this.dataStore as any)._activeSchema;
      let shouldInclude = true; // Default: include
      
      if (schema) {
        const nodeType = schema.getNodeType?.(node.stype);
        if (nodeType) {
          const group = nodeType.group;
          const isBlock = group === 'block';
          const isInline = group === 'inline';
          const isEditable = this._isEditableNode(nodeId);
          
          // If any option is true, apply filtering
          const hasFilter = includeBlocks || includeInline || includeEditable;
          
          if (hasFilter) {
            shouldInclude = false; // Default: exclude
            
            // OR condition: include if any condition matches
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
          // If all options are false, don't filter (maintain default true)
        }
      }
      
      if (!shouldInclude) {
        continue;
      }

      // Apply custom filter
      if (filter && !filter(node)) {
        continue;
      }

      result.push(node);
    }

    return result;
  }

  /**
   * Check if node is draggable
   * 
   * Draggable nodes:
   * - By default, all nodes are draggable (except document)
   * - If draggable: false is specified, not draggable
   * 
   * Non-draggable nodes:
   * - document nodes (group === 'document')
   * - Nodes with draggable: false specified
   * 
   * @param nodeId Node ID
   * @returns Whether draggable
   */
  private _isDraggableNode(nodeId: string): boolean {
    const node = this.dataStore.getNode(nodeId);
    if (!node) {
      return false;
    }
    
    // 1. Check group from schema (highest priority)
    const schema = (this.dataStore as any)._activeSchema;
    if (schema) {
      try {
        const nodeType = schema.getNodeType?.(node.stype);
        if (nodeType) {
          const group = nodeType.group;
          
          // document nodes are always not draggable
          if (group === 'document') {
            return false;
          }
          
          // If draggable property is explicitly false, not draggable
          if (nodeType.draggable === false) {
            return false;
          }
          
          // Otherwise draggable (default true)
          return true;
        }
      } catch (error) {
        // Continue if schema lookup fails
      }
    }
    
    // 2. If no schema info, draggable by default (except document)
    // If stype is 'document', not draggable
    if (node.stype === 'document') {
      return false;
    }
    
    // 3. Otherwise draggable (safely true)
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

      // Filter by type
      const schema = (this.dataStore as any)._activeSchema;
      let shouldInclude = true; // Default: include
      
      if (schema) {
        const nodeType = schema.getNodeType?.(node.stype);
        if (nodeType) {
          const group = nodeType.group;
          const isBlock = group === 'block';
          const isInline = group === 'inline';
          const isEditable = this._isEditableNode(nodeId);
          
          // If any option is true, apply filtering
          const hasFilter = includeBlocks || includeInline || includeEditable;
          
          if (hasFilter) {
            shouldInclude = false; // Default: exclude
            
            // OR condition: include if any condition matches
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
          // If all options are false, don't filter (maintain default true)
        }
      }
      
      if (!shouldInclude) {
        continue;
      }

      // Apply custom filter
      if (filter && !filter(node)) {
        continue;
      }

      result.push(node);
    }

    return result;
  }

  /**
   * Filter only draggable nodes from node ID array
   * 
   * @param nodeIds Node ID array
   * @returns Draggable node ID array
   */
  filterDraggableNodes(nodeIds: string[]): string[] {
    return nodeIds.filter(nodeId => this._isDraggableNode(nodeId));
  }

  /**
   * Check if node is droppable (can be a drop target)
   * 
   * Droppable nodes:
   * - Nodes with content defined (droppable by default)
   * - If droppable: false is specified, not droppable
   * 
   * Non-droppable nodes:
   * - Nodes without content (atom nodes, text nodes, etc.)
   * - Nodes with droppable: false specified
   * 
   * @param nodeId Node ID
   * @returns Whether droppable
   */
  private _isDroppableNode(nodeId: string): boolean {
    const node = this.dataStore.getNode(nodeId);
    if (!node) {
      return false;
    }
    
    // 1. Check content and droppable from schema (highest priority)
    const schema = (this.dataStore as any)._activeSchema;
    if (schema) {
      try {
        const nodeType = schema.getNodeType?.(node.stype);
        if (nodeType) {
          // If droppable property is explicitly false, not droppable
          if (nodeType.droppable === false) {
            return false;
          }
          
          // If content exists, droppable (default)
          if (nodeType.content) {
            return true;
          }
          
          // If no content, not droppable (default)
          return false;
        }
      } catch (error) {
        // Continue if schema lookup fails
      }
    }
    
    // 2. If no schema info, check node's content field
    if (node.content !== undefined) {
      // If content field exists, droppable
      return true;
    }
    
    // 3. Otherwise not droppable (safely false)
    return false;
  }

  /**
   * Check if a specific node can be dropped on a drop target node
   * 
   * @param targetNodeId Drop target node ID
   * @param draggedNodeId Dragged node ID
   * @returns Whether droppable
   */
  canDropNode(targetNodeId: string, draggedNodeId: string): boolean {
    // 1. Check if drop target is droppable
    if (!this._isDroppableNode(targetNodeId)) {
      return false;
    }
    
    // 2. Check if dragged node is draggable
    if (!this._isDraggableNode(draggedNodeId)) {
      return false;
    }
    
    // 3. Check schema's content definition
    const schema = (this.dataStore as any)._activeSchema;
    if (!schema) {
      // If no schema, allow by default (safely true)
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
        // If no content, not droppable
        return false;
      }
      
      // Check if draggedNode's group or stype is allowed in content model
      const draggedGroup = draggedNodeType.group;
      const draggedStype = draggedNode.stype;
      
      // Simple content model parsing (e.g., 'block+', 'inline*', 'block+ inline*')
      // For more complex parsing, use Validator.validateContentModel
      const contentModelLower = contentModel.toLowerCase();
      
      // Check based on group
      if (draggedGroup) {
        if (contentModelLower.includes(draggedGroup)) {
          return true;
        }
      }
      
      // Check based on stype
      if (contentModelLower.includes(draggedStype)) {
        return true;
      }
      
      // If content model ends with '*' or '+' (e.g., 'block*', 'inline+')
      // Do not consider as allowing all nodes (must explicitly have group or stype)
      
      return false;
    } catch (error) {
      // Return false safely if schema lookup fails
      return false;
    }
  }

  /**
   * Get all droppable nodes in document
   * 
   * @param options Filter options
   * @returns Droppable node array
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

      // Filter by type
      const schema = (this.dataStore as any)._activeSchema;
      let shouldInclude = true; // Default: include
      
      if (schema) {
        const nodeType = schema.getNodeType?.(node.stype);
        if (nodeType) {
          const group = nodeType.group;
          const isBlock = group === 'block';
          const isInline = group === 'inline';
          const isDocument = group === 'document';
          
          // If any option is true, apply filtering
          const hasFilter = includeBlocks || includeInline || includeDocument;
          
          if (hasFilter) {
            shouldInclude = false; // Default: exclude
            
            // OR condition: include if any condition matches
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
          // If all options are false, don't filter (maintain default true)
        }
      }
      
      if (!shouldInclude) {
        continue;
      }

      // Apply custom filter
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
      // If no schema, cannot know indent rules, so safely return false
      return false;
    }

    try {
      const nodeType = schema.getNodeType?.(node.stype);
      if (!nodeType) {
        return false;
      }

      // document group is never an indent target
      if (nodeType.group === 'document') {
        return false;
      }

      return nodeType.indentable === true;
    } catch {
      return false;
    }
  }

  /**
   * Return indent-related metadata for node
   *
   * - Returns null if schema is missing or node/node type not found.
   * - Includes indentable, indentGroup, indentParentTypes, maxIndentLevel.
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

  // ===== Public schema-aware helpers (used directly by DataStore) =====

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

  // ===== Indent / Outdent (structural level) =====

  /**
   * Indent current node as child of previous sibling node
   *
   * Basic rules:
   * - Only block nodes with nodeType.indentable === true are targets.
   * - Previous sibling node must exist.
   * - If indentParentTypes is defined, previous sibling's stype must be included in it.
   * - If maxIndentLevel is defined, only allowed when current depth is less than that value.
   *
   * @returns true if structural change actually occurred, false otherwise
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

    // Check maximum indent level (simple depth calculation)
    if (typeof meta.maxIndentLevel === 'number') {
      const currentLevel = this._getIndentDepth(nodeId, meta.indentGroup);
      if (currentLevel >= meta.maxIndentLevel) {
        return false;
      }
    }

    // Use previous sibling node as parent candidate
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

    // If indentParentTypes is defined, check based on stype
    if (meta.indentParentTypes && meta.indentParentTypes.length > 0) {
      if (!meta.indentParentTypes.includes(prevNode.stype)) {
        return false;
      }
    }

    // Actual move: move to last child of previous sibling
    const baseContent = Array.isArray(prevNode.content) ? prevNode.content : [];
    const insertPos = baseContent.length;
    this.dataStore.moveNode(nodeId, prevSiblingId, insertPos);
    return true;
  }

  /**
   * Outdent current node by one level
   *
   * Basic rules:
   * - Only nodes with nodeType.indentable === true are targets.
   * - Parent must exist.
   * - Use parent's parent (grandparent) as new parent.
   *
   * @returns true if structural change actually occurred, false otherwise
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
      // Cannot outdent further (root level)
      return false;
    }

    // Find where parent is in grandParent.content, and insert node right after it
    const gpContent = Array.isArray(grandParent.content) ? grandParent.content : [];
    const parentIndex = gpContent.indexOf(parent.sid!);
    const insertPos = parentIndex >= 0 ? parentIndex + 1 : gpContent.length;

    this.dataStore.moveNode(nodeId, grandParent.sid!, insertPos);
    return true;
  }

  /**
   * Roughly calculate indent depth (level)
   *
   * - Counts by traversing up through same indentGroup or indentable nodes.
   * - May not exactly match "visual indentation level" depending on group, indentGroup design,
   *   but used as a conservative indicator for maxIndentLevel limitation.
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
   * Check if node is editable
   * 
   * Editable nodes:
   * - Text nodes (has .text field)
   * - Inline nodes (group === 'inline')
   * - Editable block nodes (group === 'block' && editable === true && has .text field)
   * 
   * Non-editable nodes:
   * - Block nodes (group === 'block', no editable property)
   * - Document nodes (group === 'document')
   * 
   * @param nodeId Node ID
   * @returns Whether editable
   */
  private _isEditableNode(nodeId: string): boolean {
    const node = this.dataStore.getNode(nodeId);
    if (!node) {
      return false;
    }
    
    // 1. First check group from schema (priority 1)
    const schema = (this.dataStore as any)._activeSchema;
    if (schema) {
      try {
        const nodeType = schema.getNodeType?.(node.stype);
        if (nodeType) {
          const group = nodeType.group;
          
          // Editable Block: block but editable=true means editable
          if (group === 'block' && nodeType.editable === true) {
            // Must have .text field to be editable
            if (node.text !== undefined && typeof node.text === 'string') {
              return true;
            }
            // If no .text field, not editable
            return false;
          }
          
          // Regular block or document nodes are not editable
          if (group === 'block' || group === 'document') {
            return false;
          }
          
          // Inline nodes are editable
          if (group === 'inline') {
            return true;
          }
        }
      } catch (error) {
        // Continue if schema lookup fails
      }
    }
    
    // 2. If no schema info, estimate from stype
    // If has 'inline-' prefix, consider as inline node
    if (node.stype && node.stype.startsWith('inline-')) {
      return true;
    }
    
    // 3. Estimate as block node (if has content and no text field, consider as block)
    if (node.content && node.text === undefined) {
      return false;
    }
    
    // 4. Text node (.text field exists, and not block)
    // Note: Even if .text field exists like codeBlock, if group is 'block', already handled above
    if (node.text !== undefined && typeof node.text === 'string') {
      return true;
    }
    
    // 5. Otherwise consider as editable node (safely true)
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
   * getPreviousEditableNode('text-3') // 'text-2' (last text of previous paragraph)
   * getPreviousEditableNode('text-2') // 'text-1'
   * getPreviousEditableNode('text-1') // null (no previous editable node)
   * ```
   */
  getPreviousEditableNode(nodeId: string): string | null {
    let currentId: string | null = nodeId;
    const visited = new Set<string>(); // Prevent infinite loop
    
    while (currentId) {
      // Prevent infinite loop
      if (visited.has(currentId)) {
        console.warn('[UtilityOperations] getPreviousEditableNode: Circular reference detected', { nodeId, currentId });
        return null;
      }
      visited.add(currentId);
      
      // Find previous node
      const prevId = this.getPreviousNode(currentId);
      if (!prevId) {
        return null; // No more previous nodes
      }
      
      // Check if editable node
      if (this._isEditableNode(prevId)) {
        return prevId;
      }
      
      // Skip non-editable nodes (block/document) and continue searching
      currentId = prevId;
    }
    
    return null;
  }

  /**
   * Find next editable node in document order
   * 
   * Used in Delete, arrow keys, etc.: skip block nodes and return only inline/text nodes
   * 
   * @param nodeId Current node ID
   * @returns Next editable node ID (null if none)
   * 
   * @example
   * ```typescript
   * // document > paragraph-1 > [text-1, text-2]
   * // document > paragraph-2 > [text-3]
   * 
   * getNextEditableNode('text-1') // 'text-2'
   * getNextEditableNode('text-2') // 'text-3' (first text of next paragraph)
   * getNextEditableNode('text-3') // null (no next editable node)
   * ```
   */
  getNextEditableNode(nodeId: string): string | null {
    let currentId: string | null = nodeId;
    const visited = new Set<string>(); // Prevent infinite loop
    
    while (currentId) {
      // Prevent infinite loop
      if (visited.has(currentId)) {
        console.warn('[UtilityOperations] getNextEditableNode: Circular reference detected', { nodeId, currentId });
        return null;
      }
      visited.add(currentId);
      
      // Find next node
      const nextId = this.getNextNode(currentId);
      if (!nextId) {
        return null; // No more next nodes
      }
      
      // Check if editable node
      if (this._isEditableNode(nextId)) {
        return nextId;
      }
      
      // Skip non-editable nodes (block/document) and continue searching
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
   * // Basic traversal
   * const iterator = dataStore.createDocumentIterator();
   * for (const nodeId of iterator) {
   *   console.log(nodeId);
   * }
   * 
   * // Filter only specific types
   * const textIterator = dataStore.createDocumentIterator({
   *   filter: { stype: 'inline-text' }
   * });
   * 
   * // Only up to specific depth
   * const shallowIterator = dataStore.createDocumentIterator({
   *   maxDepth: 2
   * });
   * ```
   */
  createDocumentIterator(options: DocumentIteratorOptions = {}): DocumentIterator {
    return new DocumentIterator(this.dataStore, options);
  }

  /**
   * Traverse document using Visitor pattern
   * 
   * @param visitors Visitor objects (variadic arguments)
   * @param options Traversal options
   * @returns Traversal result info (single visitor) or execution results of each Visitor (multiple visitors)
   * 
   * @example
   * ```typescript
   * // Single visitor
   * const visitor = {
   *   visit(nodeId, node) {
   *     console.log(`Visiting: ${nodeId} (${node.type})`);
   *   }
   * };
   * 
   * const result = dataStore.traverse(visitor);
   * 
   * // Multiple visitors (variadic arguments)
   * const textExtractor = new TextExtractor();
   * const linkCollector = new LinkCollector();
   * const nodeCounter = new NodeCounter();
   * 
   * const results = dataStore.traverse(textExtractor, linkCollector, nodeCounter);
   * 
   * // Also possible with array
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
    // Parse arguments
    let visitors: DocumentVisitor[];
    let options: VisitorTraversalOptions = {} as VisitorTraversalOptions;

    if (args.length === 0) {
      throw new Error('At least one visitor is required');
    }

    // If first argument is an array
    if (Array.isArray(args[0])) {
      visitors = args[0] as DocumentVisitor[];
      options = (args[1] as VisitorTraversalOptions) || ({} as VisitorTraversalOptions);
    } else {
      // If variadic arguments
      const lastArg = args[args.length - 1] as unknown;
      
      // Check if last argument is options (no visit method, has properties like context, filter, etc.)
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
    
    // Return single result for single visitor
    if (visitors.length === 1) {
      const result = this._traverseSingleVisitor(visitors[0], options);
      return result;
    }
    
    // Return each result for multiple visitors
    return visitors.map(visitor => ({
      visitor,
      result: this._traverseSingleVisitor(visitor, options)
    }));
  }

  /**
   * Internal method to traverse with a single Visitor
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

      // Call enter
      if (visitor.enter) {
        visitor.enter(nodeId, node, options.context);
      }

      // Check shouldVisitChildren
      if (visitor.shouldVisitChildren && !visitor.shouldVisitChildren(nodeId, node)) {
        skippedCount++;
        // Call exit
        if (visitor.exit) {
          visitor.exit(nodeId, node, options.context);
        }
        continue;
      }

      // Call visit
      const result = visitor.visit(nodeId, node, options.context);
      
      // Skip child nodes if visit returns false
      if (result === false) {
        skippedCount++;
        // Call exit
        if (visitor.exit) {
          visitor.exit(nodeId, node, options.context);
        }
        continue;
      }

      visitedCount++;

      // Check shouldStop
      if (options.shouldStop && options.shouldStop(nodeId, node)) {
        stopped = true;
        // Call exit
        if (visitor.exit) {
          visitor.exit(nodeId, node, options.context);
        }
        break;
      }

      // Call exit
      if (visitor.exit) {
        visitor.exit(nodeId, node, options.context);
      }
    }

    return { visitedCount, skippedCount, stopped };
  }

  // ========== Drop Behavior ==========

  /**
   * Determine default drop behavior
   * 
   * @param targetNode Target node
   * @param sourceNode Source node
   * @param context Drop context
   * @returns Drop behavior
   */
  private _getDefaultDropBehavior(
    targetNode: INode,
    sourceNode: INode,
    context: DropContext
  ): DropBehavior {
    // Default type combination rules
    // 1. Text node → Text node: merge
    if (typeof targetNode.text === 'string' && typeof sourceNode.text === 'string') {
      return 'merge';
    }
    
    const schema = (this.dataStore as any)._activeSchema;
    if (schema) {
      const targetType = schema.getNodeType?.(targetNode.stype);
      const sourceType = schema.getNodeType?.(sourceNode.stype);
      
      if (targetType && sourceType) {
        // 2. block (e.g., paragraph) ← inline text: merge
        if (
          targetType.group === 'block' &&
          sourceType.group === 'inline' &&
          typeof sourceNode.text === 'string'
        ) {
          return 'merge';
        }
        
        // 3. Same type of block: move
        if (
          targetType.group === 'block' &&
          sourceType.group === 'block' &&
          targetNode.stype === sourceNode.stype
        ) {
          return 'move';
        }
      }
    }
    
    // 4. Default: move (internal drag)
    return 'move';
  }

  /**
   * Determine behavior when dropping source node on drop target
   * 
   * Priority:
   * 1. UI context (Ctrl/Cmd = copy) - highest priority
   * 2. defineDropBehavior rules (dynamic rules)
   * 3. Schema dropBehaviorRules (default rule hints)
   * 4. Type combination default rules (built-in rules)
   * 5. Default value (move/insert)
   * 
   * @param targetNodeId Drop target node ID
   * @param sourceNodeId Source node ID
   * @param context UI context (optional)
   * @returns Drop behavior
   */

  /**
   * Determine behavior when dropping source node on drop target
   * 
   * Priority:
   * 1. UI context (Ctrl/Cmd = copy) - highest priority
   * 2. defineDropBehavior rules (dynamic rules)
   * 3. Schema dropBehaviorRules (default rule hints)
   * 4. Type combination default rules (built-in rules)
   * 5. Default value (move/insert)
   * 
   * @param targetNodeId Drop target node ID
   * @param sourceNodeId Source node ID
   * @param context UI context (optional)
   * @returns Drop behavior
   */
  getDropBehavior(
    targetNodeId: string,
    sourceNodeId: string,
    context?: DropContext
  ): DropBehavior {
    const targetNode = this.dataStore.getNode(targetNodeId);
    const sourceNode = this.dataStore.getNode(sourceNodeId);
    
    if (!targetNode || !sourceNode) {
      return 'move'; // Default
    }
    
    const schema = (this.dataStore as any)._activeSchema;
    const sourceStype = sourceNode.stype;
    const dropContext = context || {};
    
    // 1. Check UI context (highest priority)
    if (dropContext.modifiers?.ctrlKey || dropContext.modifiers?.metaKey) {
      return 'copy'; // Ctrl/Cmd + drag = copy
    }
    
    // 2. Check external drag (after UI context)
    if (dropContext.sourceOrigin === 'external') {
      return 'insert';
    }
    
    // 3. Check defineDropBehavior rules
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
    
    // 4. Check schema's dropBehaviorRules
    if (schema) {
      const targetType = schema.getNodeType?.(targetNode.stype);
      if (targetType?.dropBehaviorRules) {
        const rules = targetType.dropBehaviorRules;
        
        // Check rules by source type (priority: stype > *)
        if (rules[sourceStype]) {
          return rules[sourceStype] as DropBehavior;
        }
        
        if (rules['*']) {
          return rules['*'] as DropBehavior;
        }
      }
    }
    
    // 5. Type combination default rules (only if no schema rules)
    // 6. Default
    return this._getDefaultDropBehavior(targetNode, sourceNode, dropContext);
  }
}

/**
 * Document traversal range definition
 */
export interface DocumentRange {
  /** Start node ID */
  startNodeId: string;
  /** End node ID */
  endNodeId: string;
  /** Whether to include start node (default: true) */
  includeStart?: boolean;
  /** Whether to include end node (default: true) */
  includeEnd?: boolean;
}

/**
 * Visitor interface for document node traversal
 */
export interface DocumentVisitor {
  /** Called when visiting a node (required) */
  visit(nodeId: string, node: any, context?: any): void | boolean;
  
  /** Called when entering a node (optional) */
  enter?(nodeId: string, node: any, context?: any): void;
  
  /** Called when exiting a node (optional) */
  exit?(nodeId: string, node: any, context?: any): void;
  
  /** Determines whether to visit child trees (optional) */
  shouldVisitChildren?(nodeId: string, node: any): boolean;
}

/**
 * Visitor traversal options
 */
export interface VisitorTraversalOptions {
  /** Start node ID (default: root node) */
  startNodeId?: string;
  /** Whether to traverse in reverse order */
  reverse?: boolean;
  /** Maximum depth limit */
  maxDepth?: number;
  /** Node type filter */
  filter?: {
    stype?: string;
    stypes?: string[];
    excludeStypes?: string[];
  };
  /** User-defined filter function */
  customFilter?: (nodeId: string, node: any) => boolean;
  /** Traversal stop condition */
  shouldStop?: (nodeId: string, node: any) => boolean;
  /** Traversal range limit */
  range?: DocumentRange;
  /** Context object */
  context?: any;
}

/**
 * Document traversal options
 */
export interface DocumentIteratorOptions {
  /** Start node ID (default: root node) */
  startNodeId?: string;
  /** Whether to traverse in reverse order */
  reverse?: boolean;
  /** Maximum depth limit */
  maxDepth?: number;
  /** Node type filter */
  filter?: {
    stype?: string;
    stypes?: string[];
    excludeStypes?: string[];
  };
  /** User-defined filter function */
  customFilter?: (nodeId: string, node: any) => boolean;
  /** Traversal stop condition */
  shouldStop?: (nodeId: string, node: any) => boolean;
  /** Traversal range limit */
  range?: DocumentRange;
}

/**
 * Iterator class for document traversal
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

    // Set range
    if (this.options.range) {
      this.rangeStartId = this.options.range.startNodeId;
      this.rangeEndId = this.options.range.endNodeId;
    }

    // If reverse traversal, start from last node
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

      // Range check
      if (!this.isInRange(this.currentId)) {
        this.currentId = this.getNextNode();
        continue;
      }

      // Duplicate visit check
      if (this.visited.has(this.currentId)) {
        this.currentId = this.getNextNode();
        continue;
      }

      // Depth check
      const depth = this.dataStore.getNodePath(this.currentId).length;
      if (depth > this.options.maxDepth) {
        this.currentId = this.getNextNode();
        continue;
      }

      // Type filter check
      if (!this.matchesTypeFilter(node)) {
        this.currentId = this.getNextNode();
        continue;
      }

      // User-defined filter check
      if (!this.options.customFilter(this.currentId, node)) {
        this.currentId = this.getNextNode();
        continue;
      }

      // Stop condition check
      if (this.options.shouldStop(this.currentId, node)) {
        this.currentId = null;
        break;
      }

      // Mark as visited
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
    
    // Nodes use the stype field
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
   * Check if current node is within traversal range
   */
  private isInRange(nodeId: string): boolean {
    // If no range is set, allow all nodes
    if (!this.options.range || !this.rangeStartId || !this.rangeEndId) {
      return true;
    }

    const { includeStart = true, includeEnd = true } = this.options.range;

    // Check start node
    if (nodeId === this.rangeStartId) {
      return includeStart;
    }

    // Check end node
    if (nodeId === this.rangeEndId) {
      return includeEnd;
    }

    // Check if node is within range
    const comparison = this.dataStore.utility.compareDocumentOrder(nodeId, this.rangeStartId);
    const endComparison = this.dataStore.utility.compareDocumentOrder(nodeId, this.rangeEndId);

    // If before start node, out of range
    if (comparison < 0) {
      return false;
    }

    // If after end node, out of range
    if (endComparison > 0) {
      return false;
    }

    // Within range
    return true;
  }

  /**
   * Reset current Iterator's state
   */
  reset(): void {
    this.currentId = this.options.startNodeId;
    this.visited.clear();
  }

  /**
   * Start traversal from specific node
   */
  startFrom(nodeId: string): void {
    this.currentId = nodeId;
    this.visited.clear();
  }

  /**
   * Update traversal options
   */
  updateOptions(newOptions: Partial<DocumentIteratorOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }

  /**
   * Collect all nodes into an array
   */
  toArray(): string[] {
    const result: string[] = [];
    for (const nodeId of this) {
      result.push(nodeId);
    }
    return result;
  }

  /**
   * Find first node matching condition
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
   * Find all nodes matching condition
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
      // Nodes use the stype field
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
