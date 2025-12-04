import type { INode } from '../types';
import type { DataStore } from '../data-store';

/**
 * Content Management 연산들
 * 
 * 노드의 부모-자식 관계, 이동, 복사 등의 내용 조작 기능들을 담당합니다.
 */
export class ContentOperations {
  constructor(private dataStore: DataStore) {}

  /**
   * 자식 노드 추가 (부모의 content 배열 업데이트)
   *
   * Spec addChild:
   * - Creates child when object provided (assigns id if missing) and persists via setNode(); overlay-aware.
   * - Inserts child id at position (default: end). Does NOT mutate parent.content before updateNode(false).
   * - Emits update for parent content; then mirrors to local parent for immediate reads.
   * - Also updates child's parentId via updateNode(false) and mirrors locally.
   * - Throws if parent missing (except overlay-active path where parent may be overlay-deleted: treated as no-op for linkage but child creation still allowed when object provided).
   */
  addChild(parentId: string, child: INode | string, position?: number): string {
    const overlay = (this.dataStore as any)._overlay;
    const parent = this.dataStore.getNode(parentId);
    if (!parent) {
      // During overlay transactions, treat missing (overlay-deleted) parent as no-op
      if (overlay && overlay.isActive && overlay.isActive()) {
        if (typeof child === 'string') {
          return child;
        } else {
          if (!child.sid) {
            child.sid = this.dataStore.generateId();
          }
          this.dataStore.setNode(child);
          return child.sid;
        }
      }
      throw new Error(`Parent node not found: ${parentId}`);
    }

    let childId: string;
    let childNode: INode;

    if (typeof child === 'string') {
      childId = child;
      const foundNode = this.dataStore.getNode(childId);
      if (!foundNode) {
        throw new Error(`Child node not found: ${childId}`);
      }
      childNode = foundNode;
    } else {
      if (!child.sid) {
        child.sid = this.dataStore.generateId();
      }
      childId = child.sid;
      childNode = child;
      
      // setNode가 이미 overlay에 저장하므로 중복 호출 불필요
      this.dataStore.setNode(childNode);
    }

    const existing = Array.isArray(parent.content) ? parent.content : [];
    const insertPosition = position !== undefined ? position : existing.length;
    const newContent = [...existing];
    newContent.splice(insertPosition, 0, childId);
    // Do NOT mutate parent.content before updateNode to avoid no-op suppression
    this.dataStore.updateNode(parentId, { content: newContent }, false);
    // Reflect locally after update for immediate reads
    parent.content = newContent;

    // Reflect parent relation both in store and local reference
    this.dataStore.updateNode(childId, { parentId } as Partial<INode>, false);
    // Reflect locally for immediate reads
    if (childNode) {
      childNode.parentId = parentId;
    }

    return childId;
  }

  /**
   * 자식 노드 제거 (부모의 content 배열에서 제거)
   *
   * Spec removeChild:
   * - Removes child id from parent.content via updateNode(false), mirrors locally.
   * - Clears child's parentId via updateNode(false).
   * - Returns false if child not found in parent.content or child missing.
   */
  removeChild(parentId: string, childId: string): boolean {
    const parent = this.dataStore.getNode(parentId);
    if (!parent) {
      throw new Error(`Parent node not found: ${parentId}`);
    }

    const child = this.dataStore.getNode(childId);
    if (!child) {
      return false;
    }

    if (Array.isArray(parent.content)) {
      const index = parent.content.indexOf(childId);
      if (index > -1) {
        const newContent = [...parent.content];
        newContent.splice(index, 1);
        // Do NOT mutate parent.content before updateNode to avoid no-op suppression
        this.dataStore.updateNode(parentId, { content: newContent }, false);
        // Reflect locally after update
        parent.content = newContent;
        this.dataStore.updateNode(childId, { parentId: undefined } as Partial<INode>, false);
        return true;
      }
    }

    return false;
  }

  /**
   * 노드를 다른 부모로 이동
   *
   * Spec moveNode:
   * - Removes id from oldParent.content and inserts into newParent.content at position (default: end).
   * - Uses updateNode(false) for parent content changes, mirrors locally afterward.
   * - Updates node.parentId via updateNode(false) and mirrors locally.
   * - Emits an atomic 'move' operation with nodeId, parentId, position.
   */
  moveNode(nodeId: string, newParentId: string, position?: number): void {
    const node = this.dataStore.getNode(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    const overlay = (this.dataStore as any)._overlay;
    const newParent = this.dataStore.getNode(newParentId);
    if (!newParent) {
      // During overlay transactions, treat missing (overlay-deleted) parent as no-op
      if (overlay && overlay.isActive && overlay.isActive()) {
        return;
      }
      throw new Error(`Parent node not found: ${newParentId}`);
    }

    // 1. 기존 부모에서 제거
    if (node.parentId) {
      const oldParent = this.dataStore.getNode(node.parentId);
      if (oldParent && Array.isArray(oldParent.content)) {
        const index = oldParent.content.indexOf(nodeId);
        if (index > -1) {
          const oldContent = [...oldParent.content];
          oldContent.splice(index, 1);
          // Do NOT mutate before update
          this.dataStore.updateNode(oldParent.sid!, { content: oldContent }, false);
          // Reflect locally after update
          oldParent.content = oldContent;
        }
      }
    }

    // 2. 새 부모에 추가
    const baseContent = Array.isArray(newParent.content) ? newParent.content : [];
    const insertPosition = position !== undefined ? position : baseContent.length;
    const newParentContent = [...baseContent];
    newParentContent.splice(insertPosition, 0, nodeId);
    // Do NOT mutate before update
    this.dataStore.updateNode(newParentId, { content: newParentContent }, false);
    // Reflect locally after update
    newParent.content = newParentContent;

    // 3. 노드의 parentId 업데이트 (store + local)
    this.dataStore.updateNode(nodeId, { parentId: newParentId } as Partial<INode>, false);
    node.parentId = newParentId;

    // 원자적 move operation emit
    this.dataStore.emitOperation({
      type: 'move',
      nodeId,
      parentId: newParentId,
      position: insertPosition,
      timestamp: Date.now()
    });
  }

  /**
   * 노드 복사 (새 ID 생성)
   *
   * Spec copyNode:
   * - Clones node with new id; parentId set to provided newParentId or preserved.
   * - Persists cloned node via setNode(); if newParentId provided, appends to parent's content with updateNode(false).
   * - Does not emit 'move' (creation+parent update only).
   */
  copyNode(nodeId: string, newParentId?: string): string {
    const originalNode = this.dataStore.getNode(nodeId);
    if (!originalNode) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    const newNodeId = this.dataStore.generateId();
    
    const copiedNode: INode = {
      ...originalNode,
      sid: newNodeId,
      parentId: newParentId || originalNode.parentId
    };

    this.dataStore.setNode(copiedNode);

    if (newParentId) {
      const parent = this.dataStore.getNode(newParentId);
      if (parent) {
        const base = Array.isArray(parent.content) ? parent.content : [];
        const newContent = [...base, newNodeId];
        // update 먼저, 로컬 반영은 사후
        this.dataStore.updateNode(newParentId, { content: newContent }, false);
        parent.content = newContent;
        // 위치 반영은 신규 생성의 일부로 간주: move emit은 하지 않음
      }
    }

    return newNodeId;
  }

  /**
   * 노드와 모든 자식들을 복사 (재귀적 복사)
   *
   * Spec cloneNodeWithChildren:
   * - Recursively clones subtree with fresh ids; sets parentId links for each clone.
   * - Persists each cloned node; updates cloned parent's content with child ids via updateNode(false).
   * - If newParentId provided, appends top-level clone to that parent.
   */
  cloneNodeWithChildren(nodeId: string, newParentId?: string): string {
    const originalNode = this.dataStore.getNode(nodeId);
    if (!originalNode) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    const newNodeId = this.dataStore.generateId();
    
    const copiedNode: INode = {
      ...originalNode,
      sid: newNodeId,
      parentId: newParentId || originalNode.parentId,
      content: []
    };

    this.dataStore.setNode(copiedNode);

    if (originalNode.content && Array.isArray(originalNode.content)) {
      const newChildIds: string[] = [];
      for (const childId of originalNode.content) {
        if (typeof childId === 'string') {
          const newChildId = this.cloneNodeWithChildren(childId, newNodeId);
          newChildIds.push(newChildId);
        }
      }
      copiedNode.content = newChildIds;
      // 복제된 노드의 content 설정을 update로 수집
      this.dataStore.updateNode(copiedNode.sid!, { content: newChildIds }, false);
    }

    if (newParentId) {
      const parent = this.dataStore.getNode(newParentId);
      if (parent) {
        const base = Array.isArray(parent.content) ? parent.content : [];
        const newContent = [...base, newNodeId];
        this.dataStore.updateNode(newParentId, { content: newContent }, false);
        parent.content = newContent;
      }
    }

    return newNodeId;
  }

  /**
   * 자식 노드 순서 변경
   *
   * Spec reorderChildren:
   * - Validates that each id exists; then replaces parent.content with the provided order via updateNode(false).
   * - Emits 'move' ops for ids whose index changed (for diagnostics/observation only).
   */
  reorderChildren(parentId: string, childIds: string[]): void {
    const parent = this.dataStore.getNode(parentId);
    if (!parent) {
      throw new Error(`Parent node not found: ${parentId}`);
    }

    for (const childId of childIds) {
      const child = this.dataStore.getNode(childId);
      if (!child) {
        throw new Error(`Child node not found: ${childId}`);
      }
    }
    const original = Array.isArray(parent.content) ? [...parent.content] : [];
    // Do NOT mutate before update
    this.dataStore.updateNode(parentId, { content: [...childIds] }, false);
    // Reflect locally after update
    parent.content = [...childIds];

    // 순서 변경을 move 시퀀스로 기록 (원래 위치 대비 새 위치 비교)
    const newIndexMap = new Map<string, number>();
    childIds.forEach((id, idx) => newIndexMap.set(id, idx));
    for (let i = 0; i < childIds.length; i++) {
      const id = childIds[i];
      const oldIndex = original.indexOf(id);
      if (oldIndex !== i) {
        this.dataStore.emitOperation({
          type: 'move',
          nodeId: id,
          parentId: parentId,
          position: i,
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * 자식 노드들 일괄 추가
   *
   * Spec addChildren:
   * - Invokes addChild sequentially preserving relative order; returns added ids.
   */
  addChildren(parentId: string, children: (INode | string)[], position?: number): string[] {
    const parent = this.dataStore.getNode(parentId);
    if (!parent) {
      throw new Error(`Parent node not found: ${parentId}`);
    }

    const addedIds: string[] = [];
    const insertPosition = position !== undefined ? position : (parent.content?.length || 0);

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const childId = this.addChild(parentId, child, insertPosition + i);
      addedIds.push(childId);
    }

    return addedIds;
  }

  /**
   * 자식 노드들 일괄 제거
   *
   * Spec removeChildren:
   * - Invokes removeChild for each id and returns boolean results per child.
   */
  removeChildren(parentId: string, childIds: string[]): boolean[] {
    const parent = this.dataStore.getNode(parentId);
    if (!parent) {
      throw new Error(`Parent node not found: ${parentId}`);
    }

    const results: boolean[] = [];
    for (const childId of childIds) {
      results.push(this.removeChild(parentId, childId));
    }
    return results;
  }

  /**
   * 자식 노드들 일괄 이동
   *
   * Spec moveChildren:
   * - Validates parents/children; reuses moveNode per child with position offset when provided.
   * - Each move emits a 'move' operation.
   */
  moveChildren(fromParentId: string, toParentId: string, childIds: string[], position?: number): void {
    const fromParent = this.dataStore.getNode(fromParentId);
    if (!fromParent) {
      throw new Error(`From parent node not found: ${fromParentId}`);
    }

    const overlay = (this.dataStore as any)._overlay;
    const toParent = this.dataStore.getNode(toParentId);
    if (!toParent) {
      // During overlay transactions, treat missing (overlay-deleted) parent as no-op
      if (overlay && overlay.isActive && overlay.isActive()) {
        return;
      }
      throw new Error(`To parent node not found: ${toParentId}`);
    }

    for (const childId of childIds) {
      const child = this.dataStore.getNode(childId);
      if (!child) {
        throw new Error(`Child node not found: ${childId}`);
      }
    }

    for (let i = 0; i < childIds.length; i++) {
      const childId = childIds[i];
      const insertPosition = position !== undefined ? position + i : undefined;
      this.moveNode(childId, toParentId, insertPosition);
      // moveNode already emits a move operation
    }
  }

  /**
   * 블록 노드를 위로 이동 (같은 부모 내에서)
   *
   * Spec moveBlockUp:
   * - 같은 부모의 content 배열에서 현재 노드를 한 칸 위로 이동
   * - 첫 번째 노드면 이동 불가 (false 반환)
   * - reorderChildren을 사용하여 순서 변경
   */
  moveBlockUp(nodeId: string): boolean {
    const node = this.dataStore.getNode(nodeId);
    if (!node || !node.parentId) {
      return false;
    }

    const parent = this.dataStore.getNode(node.parentId);
    if (!parent || !Array.isArray(parent.content)) {
      return false;
    }

    const currentIndex = parent.content.indexOf(nodeId);
    if (currentIndex === -1) {
      return false;
    }

    // 첫 번째 노드면 이동 불가
    if (currentIndex === 0) {
      return false;
    }

    // 순서 변경: 현재 노드를 이전 위치로 이동
    const newContent = [...parent.content];
    const [movedNode] = newContent.splice(currentIndex, 1);
    newContent.splice(currentIndex - 1, 0, movedNode);

    this.reorderChildren(node.parentId, newContent);
    return true;
  }

  /**
   * 블록 노드를 아래로 이동 (같은 부모 내에서)
   *
   * Spec moveBlockDown:
   * - 같은 부모의 content 배열에서 현재 노드를 한 칸 아래로 이동
   * - 마지막 노드면 이동 불가 (false 반환)
   * - reorderChildren을 사용하여 순서 변경
   */
  moveBlockDown(nodeId: string): boolean {
    const node = this.dataStore.getNode(nodeId);
    if (!node || !node.parentId) {
      return false;
    }

    const parent = this.dataStore.getNode(node.parentId);
    if (!parent || !Array.isArray(parent.content)) {
      return false;
    }

    const currentIndex = parent.content.indexOf(nodeId);
    if (currentIndex === -1) {
      return false;
    }

    // 마지막 노드면 이동 불가
    if (currentIndex === parent.content.length - 1) {
      return false;
    }

    // 순서 변경: 현재 노드를 다음 위치로 이동
    const newContent = [...parent.content];
    const [movedNode] = newContent.splice(currentIndex, 1);
    newContent.splice(currentIndex + 1, 0, movedNode);

    this.reorderChildren(node.parentId, newContent);
    return true;
  }
}
