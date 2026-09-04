import type { INode } from '../types';
import type { AtomicOperation, DataStore } from '../data-store';
import { Schema } from '@barocss/schema';

/**
 * Core storage operations
 * 
 * Handles basic CRUD functionality, ID management, Schema validation, etc. for DataStore.
 */
export class CoreOperations {
  constructor(private dataStore: DataStore) {}

  /**
   * 노드를 DataStore에 저장하거나 업데이트
   *
   * Spec setNode:
   * - Assigns id if missing using DataStore.generateId().
   * - When validate=true and active schema exists:
   *   - Validates node; if content contains objects, validates object form; otherwise validates shallow (content undefined).
   * - Converts object children in content to ids recursively before persisting.
   * - Overlay-aware: if overlay is active, writes go to overlay (upsertNode); base map updates on commit().
   * - Emits 'create' when id is new, otherwise 'update'. Operation payload includes type/attributes/text/content/parentId/marks.
   * - Never mutates returned nodes with defaults (e.g., marks); normalization is handled elsewhere.
   */
  setNode(node: INode, validate: boolean = true): void {
    // 1. Re-base globalCounter on the current node count (never lowers it, so
    //    ids handed out earlier in an uncommitted overlay are not reissued)
    (this.dataStore as any).syncIdCounter(this.dataStore.getNodes().size);

    // 2. Assign ID (if missing)
    if (!node.sid) {
      node.sid = this.dataStore.generateId();
    }

    const activeSchema = this.dataStore.getActiveSchema();
    
    // 3. Schema validation (in nested object form)
    if (validate && activeSchema) {
      const hasObjectContent = node.content && Array.isArray(node.content) && 
        node.content.some(child => typeof child === 'object' && child !== null);
      
      if (hasObjectContent) {
        const validation = this.dataStore.validateNode(node, activeSchema);
        if (!validation.valid) {
          throw new Error(`Schema validation failed for node ${node.sid}: ${validation.errors.join(', ')}`);
        }
      } else {
        const nodeForValidation = { ...node, content: undefined };
        const validation = this.dataStore.validateNode(nodeForValidation, activeSchema);
        if (!validation.valid) {
          throw new Error(`Schema validation failed for node ${node.sid}: ${validation.errors.join(', ')}`);
        }
      }
    }
    
    // 4. Convert to DataStore format (convert content to ID array)
    this._convertChildrenToDataStore(node);
    
    // 5~7. Always update base and emit op. When overlay is active, also record op in overlay
    const overlay = (this.dataStore as any)._overlay;
    const isNewNode = !this.dataStore.getNodes().has(node.sid!);
    const operation = {
      type: isNewNode ? 'create' : 'update',
      nodeId: node.sid!,
      data: {
        stype: (node as any).stype,
        attributes: node.attributes,
        text: node.text,
        content: node.content,
        parentId: node.parentId,
        marks: node.marks
      },
      timestamp: Date.now(),
      parentId: node.parentId
    };
    // Overlay-active writes go to overlay only; base updated on commit
    if (overlay && overlay.isActive && overlay.isActive()) {
      // Capture the pre-transaction state first so a rollback can undo any
      // write that escapes the overlay (content operations mirror onto the base
      // node object they hold, for reads later in the same transaction).
      overlay.snapshotBase?.(node.sid!, this.dataStore.getNodes().get(node.sid!));
      overlay.upsertNode(node, operation.type);
    } else {
      this.dataStore.setNodeInternal(node);
    }
    this.dataStore.emitOperation(operation as AtomicOperation);
  }

  /**
   * ID로 노드 조회
   *
   * Spec:
   * - Overlay-aware resolution order: deleted > overlay > base.
   * - If overlay marks a node as deleted, this returns undefined regardless of base state.
   * - If overlay has an overlay node, return that snapshot (do not mutate defaults).
   * - Otherwise return base node from internal map as-is.
   * - This method MUST NOT inject defaults (e.g., for `marks`). Defaults are
   *   handled by higher-level normalization paths to avoid read-time mutation
   *   and to keep tests deterministic about undefined vs [].
   */
  getNode(nodeId: string): INode | undefined {
    // Overlay-aware read path: overlay > deleted > base
    const overlay = (this.dataStore as any)._overlay;
    if (overlay && typeof overlay.hasDeleted === 'function' && overlay.hasDeleted(nodeId)) {
      return undefined;
    }
    if (overlay && typeof overlay.hasOverlayNode === 'function' && overlay.hasOverlayNode(nodeId)) {
      return overlay.getOverlayNode(nodeId) as INode | undefined;
    }
    return this.dataStore.getNodes().get(nodeId) as INode | undefined;
  }

  /**
   * 노드 삭제
   *
   * Spec deleteNode:
   * - Overlay-aware existence check; if missing, returns false.
   * - Rejects deleting the current root node (throws 'Cannot delete root node').
   * - When deleted, removes id from parent.content (if present) via updateNode(false) to emit update op.
   * - Emits 'delete' atomic operation with nodeId and parentId.
   */
  deleteNode(nodeId: string): boolean {
    const overlay = (this.dataStore as any)._overlay;
    // Overlay-aware existence check
    const node = this.getNode(nodeId);
    if (!node) {
      return false;
    }

    // Root protection: root node deletion is prohibited
    const rootId = this.dataStore.getRootNodeId && this.dataStore.getRootNodeId();
    if (rootId && nodeId === rootId) {
      throw new Error('Cannot delete root node');
    }

    let deleted = false;
    if (overlay && overlay.isActive && overlay.isActive()) {
      overlay.markDeleted(nodeId, node.parentId);
      deleted = true;
    } else {
      deleted = this.dataStore.getNodes().delete(nodeId);
    }

    if (deleted) {
      // Remove deleted node ID from parent's content array
      if (node.parentId) {
        const parent = this.dataStore.getNodes().get(node.parentId);
        if (parent && parent.content) {
          const index = parent.content.indexOf(nodeId);
          if (index !== -1) {
            parent.content.splice(index, 1);
            // Update parent node (generates operation)
            this.updateNode(node.parentId, { content: parent.content }, false);
          }
        }
      }
      
      const operation = {
        type: 'delete',
        nodeId,
        timestamp: Date.now(),
        parentId: node.parentId
      } as any;
      this.dataStore.emitOperation(operation as AtomicOperation);
    }
    
    return deleted;
  }

  /**
   * 노드 업데이트
   *
   * Spec updateNode:
   * - Rejects type changes.
   * - Shallow-merges attributes into existing attributes.
   * - Validation path (validate=true and not a content update) delegates to setNode(updated,true).
   * - Content updates bypass validation and persist directly via setNode(updated,false).
   * - Overlay-aware: writes go to overlay when active; operations emitted centrally in setNode/_emitOperation.
   */
  updateNode(nodeId: string, updates: Partial<INode>, validate: boolean = true): { valid: boolean; errors: string[] } | null {
    const node = this.getNode(nodeId);
    if (!node) {
      return { valid: false, errors: [`Node not found: ${nodeId}`] };
    }
    
    // Do not allow stype changes (also check legacy type)
    if (updates.stype && updates.stype !== node.stype) {
      return { 
        valid: false, 
        errors: [`Cannot change node stype from '${node.stype}' to '${updates.stype}'`] 
      };
    }
    
    // Merge attributes correctly
    const updatedNode = { ...node, ...updates } as INode;
    if (updates.attributes && node.attributes) {
      updatedNode.attributes = { ...node.attributes, ...updates.attributes };
    }
    
    const isContentUpdate = updates.content !== undefined;
    
    if (validate && !isContentUpdate) {
      try {
        this.setNode(updatedNode, true);
        return { valid: true, errors: [] };
      } catch (error) {
        return { 
          valid: false, 
          errors: [error instanceof Error ? error.message : 'Validation failed'] 
        };
      }
    } else {
      // Always perform base update
      this.setNode(updatedNode, false);
      // op recording is centrally handled in _emitOperation
      return { valid: true, errors: [] };
    }
  }

  /**
   * Create nested node structure at once
   *
   * Spec createNodeWithChildren:
   * - Assigns ids recursively and sets parentId links during assignment.
   * - If schema provided or active, validates the root node (object form).
   * - Persists each node depth-first; converts content to id arrays.
   * - Overlay-aware: if overlay active, writes to overlay only; operations are still emitted.
   */
  createNodeWithChildren(node: INode, schema?: Schema): INode {
    const targetSchema = schema || this.dataStore.getActiveSchema();
    
    // 1. Re-base globalCounter on the current node count only when creating a root (no parentId).
    // When parentId is set (e.g. deserializeNodes inserting under existing parent), skip it entirely.
    // syncIdCounter never lowers the counter, so ids handed out earlier in an uncommitted overlay
    // (where getNodes().size does not grow yet) cannot be reissued.
    if (node.parentId == null) {
      (this.dataStore as any).syncIdCounter(this.dataStore.getNodes().size);
    }
    
    // 2. Assign IDs to all nested objects (recursively)
    this._assignIdsRecursively(node);
    
    // 3. Perform schema validation
    if (targetSchema) {
      const validation = this.dataStore.validateNode(node, targetSchema);
      if (!validation.valid) {
        throw new Error(`Schema validation failed for node ${node.sid}: ${validation.errors.join(', ')}`);
      }
    }
    
    // 4. Create all nodes individually
    this._createAllNodesRecursively(node);
    
    // 5. Retrieve created node from DataStore and return (including marks)
    const createdNode = this.dataStore.getNode(node.sid!);
    if (!createdNode) {
      throw new Error(`Failed to retrieve created node ${node.sid}`);
    }
    return createdNode;
  }

  /**
   * Create all nodes individually (depth-first)
   */
  private _createAllNodesRecursively(node: INode): void {
    // Convert content to ID array (before creating child nodes)
    if (node.content && Array.isArray(node.content)) {
      node.content = node.content.map(child => {
        if (typeof child === 'object' && child !== null) {
          // Create child nodes first
          this._createAllNodesRecursively(child as INode);
          return (child as INode).sid!;
        }
        return child;
      });
    }
    
    // Create current node (record only in overlay when overlay is active)
    const overlay = (this.dataStore as any)._overlay;
    if (overlay && overlay.isActive && overlay.isActive()) {
      overlay.upsertNode(node, 'create');
    } else {
      // Preserve marks when storing node
      const nodeToStore = {
        ...node,
        marks: node.marks // Explicitly preserve marks
      };
      this.dataStore.setNodeInternal(nodeToStore);
    }
    
    const operation = {
      type: 'create',
      nodeId: node.sid!,
      data: {
        stype: node.stype,
        attributes: node.attributes,
        text: node.text,
        content: node.content,
        parentId: node.parentId,
        marks: node.marks
      },
      timestamp: Date.now(),
      parentId: node.parentId
    };
    
    this.dataStore.emitOperation(operation as AtomicOperation);
  }

  /**
   * Recursively assign IDs to nested objects
   */
  private _assignIdsRecursively(node: INode): void {
    if (!node.sid) {
      node.sid = this.dataStore.generateId();
    }
    
    if (node.content && Array.isArray(node.content)) {
      node.content.forEach(child => {
        if (typeof child === 'object' && child !== null) {
          const childNode = child as INode;
          childNode.parentId = node.sid;
          this._assignIdsRecursively(childNode);
        } else if (typeof child === 'string') {
          const existingNode = this.getNode(child);
          if (existingNode) {
            existingNode.parentId = node.sid;
          }
        }
      });
    }
  }

  /**
   * Convert to DataStore format (convert content to ID array)
   */
  private _convertChildrenToDataStore(node: INode): void {
    if (node.content && Array.isArray(node.content)) {
      node.content = node.content.map(child => {
        if (typeof child === 'object' && child !== null) {
          const childNode = child as INode;
          if (!childNode.sid) {
            childNode.sid = this.dataStore.generateId();
          }
          childNode.parentId = node.sid;
          this._convertChildrenToDataStore(childNode);
          const childExists = this.dataStore.getNode(childNode.sid!) !== undefined;
          const childOpType = childExists ? 'update' : 'create';
          const overlay = (this.dataStore as any)._overlay;
          if (overlay && overlay.isActive && overlay.isActive()) {
            overlay.upsertNode(childNode, childOpType);
          } else {
            this.dataStore.setNodeInternal(childNode);
          }

          // Emit child node operation because overlay-based commit
          // replays only collected operations, and without explicit ops
          // nested nodes are not applied correctly.
          const childOp = {
            type: childOpType,
            nodeId: childNode.sid!,
            data: {
              stype: childNode.stype,
              attributes: childNode.attributes,
              text: childNode.text,
              content: childNode.content,
              parentId: childNode.parentId,
              marks: childNode.marks
            },
            timestamp: Date.now(),
            parentId: childNode.parentId
          };
          this.dataStore.emitOperation(childOp as AtomicOperation);

          return childNode.sid!;
        }
        return child;
      });
    }
  }

  /**
   * Transform node type (paragraph → heading, heading → paragraph, etc.)
   *
   * Spec transformNode:
   * - Reads existing node and converts to new stype
   * - Preserves content, attributes, marks, etc.
   * - Uses same ID (maintains node ID)
   * - Maintains position in parent's content array
   * - Deletes existing node and adds new node at same position
   * - Performs schema validation
   */
  transformNode(nodeId: string, newType: string, newAttrs?: Record<string, any>): { valid: boolean; errors: string[]; newNodeId?: string } {
    const node = this.dataStore.getNode(nodeId);
    if (!node) {
      return { valid: false, errors: [`Node not found: ${nodeId}`] };
    }

    /**
     * **A no-op only when the attributes match too**, which is the half this was missing.
     *
     * `node.stype === newType` was the whole test, so transforming a `heading` into a `heading` with
     * a different `level` returned success and wrote nothing. What that cost is the ordinary case:
     * a reader with the caret in a heading 1 pressing 제목 2 got a command that lit up, ran, reported
     * success and left the heading at 1. **A heading's level could not be changed** — in Word, whose
     * toolbar offers all six.
     *
     * Found by the extensions' conformance run, which put a caret in a heading and asked
     * `setHeading2` whether it had done anything.
     *
     * The same type with different attributes is an **attribute change**, and it is written as one:
     * updating in place keeps the sid, which recreating the node would not, and a heading whose level
     * changed is the same heading — every selection, comment anchor and link pointing at it should
     * survive.
     */
    if (node.stype === newType) {
      const wanted = { ...(node.attributes || {}), ...(newAttrs || {}) };
      const held = (node.attributes || {}) as Record<string, unknown>;
      const same = Object.keys(wanted).every((key) => wanted[key] === held[key]);
      if (same) return { valid: true, errors: [], newNodeId: nodeId };

      const activeSchema = this.dataStore.getActiveSchema();
      if (activeSchema) {
        const validation = this.dataStore.validateNode({ ...node, attributes: wanted }, activeSchema);
        if (!validation.valid) return { valid: false, errors: validation.errors };
      }

      this.dataStore.updateNode(nodeId, { attributes: wanted }, false);
      return { valid: true, errors: [], newNodeId: nodeId };
    }

    // Check parent and position
    const parentId = node.parentId;
    let position: number | undefined;
    if (parentId) {
      const parent = this.dataStore.getNode(parentId);
      if (parent && Array.isArray(parent.content)) {
        position = parent.content.indexOf(nodeId);
      }
    }

    /**
     * The new node — and **only the attributes the new type has**.
     *
     * It was a flat merge of the old node's attributes with the new ones, which is right for a
     * heading becoming a heading and wrong for a heading becoming a paragraph: `level` is a
     * heading's, and a paragraph carrying one is a node with an attribute its type does not declare.
     * Nothing drew it, and nothing complained, so it sat there.
     *
     * What made it visible is undo. Turning a paragraph into a heading 1 and pressing ⌘Z produced
     * `paragraph { level: 1 }` — the inverse is a transform back, so the stray attribute rode home
     * with it and the document after an undo was not the document before it.
     *
     * Filtered by the schema rather than by a list: a type that declares nothing is left alone, which
     * is how a product adopting this before it has a full schema keeps working.
     */
    const activeSchema = this.dataStore.getActiveSchema();
    const declared = (activeSchema as { nodes?: Map<string, { attrs?: Record<string, unknown> }> } | undefined)
      ?.nodes?.get?.(newType)?.attrs;

    const merged: Record<string, any> = { ...(node.attributes || {}), ...(newAttrs || {}) };
    const kept = declared
      ? Object.fromEntries(Object.entries(merged).filter(([key]) => key in declared))
      : merged;

    const newNode: INode = { ...node, stype: newType, attributes: kept };

    // Schema validation
    if (activeSchema) {
      const validation = this.dataStore.validateNode(newNode, activeSchema);
      if (!validation.valid) {
        return { valid: false, errors: validation.errors };
      }
    }

    // Delete existing node (remove from parent content)
    if (parentId && position !== undefined) {
      const parent = this.dataStore.getNode(parentId);
      if (parent && Array.isArray(parent.content)) {
        const newContent = [...parent.content];
        newContent.splice(position, 1);
        this.dataStore.updateNode(parentId, { content: newContent }, false);
      }
    }

    // Save new node (use same ID)
    this.setNode(newNode, true);

    // Add back to parent content (same position)
    if (parentId && position !== undefined) {
      const parent = this.dataStore.getNode(parentId);
      if (parent && Array.isArray(parent.content)) {
        const newContent = [...parent.content];
        newContent.splice(position, 0, nodeId);
        this.dataStore.updateNode(parentId, { content: newContent }, false);
      }
    }

    return { valid: true, errors: [], newNodeId: nodeId };
  }
}
