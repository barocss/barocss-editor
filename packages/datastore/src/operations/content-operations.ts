import type { INode } from '../types';
import type { DataStore } from '../data-store';

/**
 * Content Management operations
 * 
 * Handles content manipulation features such as parent-child relationships, movement, copying, etc.
 */
export class ContentOperations {
  constructor(private dataStore: DataStore) {}

  /**
   * Add child node (update parent's content array)
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
      
      // No need for duplicate call as setNode already stores in overlay
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
   * Remove child node (remove from parent's content array)
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
   * Move node to different parent
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

    // 1. Remove from existing parent
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

    // 2. Add to new parent
    const baseContent = Array.isArray(newParent.content) ? newParent.content : [];
    const insertPosition = position !== undefined ? position : baseContent.length;
    const newParentContent = [...baseContent];
    newParentContent.splice(insertPosition, 0, nodeId);
    // Do NOT mutate before update
    this.dataStore.updateNode(newParentId, { content: newParentContent }, false);
    // Reflect locally after update
    newParent.content = newParentContent;

    // 3. Update node's parentId (store + local)
    this.dataStore.updateNode(nodeId, { parentId: newParentId } as Partial<INode>, false);
    node.parentId = newParentId;

    // Emit atomic move operation
    this.dataStore.emitOperation({
      type: 'move',
      nodeId,
      parentId: newParentId,
      position: insertPosition,
      timestamp: Date.now()
    });
  }

  /**
   * Copy node (generate new ID)
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
        // Update first, local reflection afterward
        this.dataStore.updateNode(newParentId, { content: newContent }, false);
        parent.content = newContent;
        // Position reflection is considered part of new creation: do not emit move
      }
    }

    return newNodeId;
  }

  /**
   * Copy node and all children (recursive copy)
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
      // Collect content setting of cloned node as update
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
   * Reorder child nodes
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

    // Record order change as move sequence (compare new position with original position)
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
   * Batch add child nodes
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
   * Batch remove child nodes
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
   * Batch move child nodes
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
   * Move block node up (within same parent)
   *
   * Spec moveBlockUp:
   * - Moves current node one position up in same parent's content array
   * - Cannot move if first node (returns false)
   * - Uses reorderChildren to change order
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

    // Cannot move if first node
    if (currentIndex === 0) {
      return false;
    }

    // Change order: move current node to previous position
    const newContent = [...parent.content];
    const [movedNode] = newContent.splice(currentIndex, 1);
    newContent.splice(currentIndex - 1, 0, movedNode);

    this.reorderChildren(node.parentId, newContent);
    return true;
  }

  /**
   * Move block node down (within same parent)
   *
   * Spec moveBlockDown:
   * - Moves current node one position down in same parent's content array
   * - Cannot move if last node (returns false)
   * - Uses reorderChildren to change order
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

    // Cannot move if last node
    if (currentIndex === parent.content.length - 1) {
      return false;
    }

    // Change order: move current node to next position
    const newContent = [...parent.content];
    const [movedNode] = newContent.splice(currentIndex, 1);
    newContent.splice(currentIndex + 1, 0, movedNode);

    this.reorderChildren(node.parentId, newContent);
    return true;
  }
}
