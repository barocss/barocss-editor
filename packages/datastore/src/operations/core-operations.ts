import type { INode } from '../types';
import type { AtomicOperation, DataStore } from '../data-store';
import { Schema } from '@barocss/schema';

/**
 * 핵심 저장소 연산들
 * 
 * DataStore의 기본적인 CRUD 기능과 ID 관리, Schema validation 등을 담당합니다.
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
    // 1. globalCounter를 현재 노드 수로 초기화
    (this.dataStore.constructor as any)._globalCounter = this.dataStore.getNodes().size;
    
    // 2. ID 부여 (없는 경우)
    if (!node.sid) {
      node.sid = this.dataStore.generateId();
    }

    const activeSchema = this.dataStore.getActiveSchema();
    
    // 3. Schema validation (중첩된 객체 형태로)
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
    
    // 4. DataStore 형식으로 변환 (content를 ID 배열로)
    this._convertChildrenToDataStore(node);
    
    // 5~7. 항상 base를 갱신하고 op를 emit. overlay 활성 시 op도 overlay에 기록
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

    // Root protection: 루트 노드는 삭제 금지
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
      // 부모의 content 배열에서 삭제된 노드 ID 제거
      if (node.parentId) {
        const parent = this.dataStore.getNodes().get(node.parentId);
        if (parent && parent.content) {
          const index = parent.content.indexOf(nodeId);
          if (index !== -1) {
            parent.content.splice(index, 1);
            // 부모 노드 업데이트 (operation 발생)
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
    
    // stype 변경은 허용하지 않음 (구형 type도 병행 체크)
    if (updates.stype && updates.stype !== node.stype) {
      return { 
        valid: false, 
        errors: [`Cannot change node stype from '${node.stype}' to '${updates.stype}'`] 
      };
    }
    
    // attributes를 올바르게 병합
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
      const overlay = (this.dataStore as any)._overlay;
      // 항상 base 업데이트 수행
      this.setNode(updatedNode, false);
      // op 기록은 _emitOperation에서 중앙 집중 처리
      return { valid: true, errors: [] };
    }
  }

  /**
   * 중첩된 노드 구조를 한 번에 생성
   *
   * Spec createNodeWithChildren:
   * - Assigns ids recursively and sets parentId links during assignment.
   * - If schema provided or active, validates the root node (object form).
   * - Persists each node depth-first; converts content to id arrays.
   * - Overlay-aware: if overlay active, writes to overlay only; operations are still emitted.
   */
  createNodeWithChildren(node: INode, schema?: Schema): INode {
    const targetSchema = schema || this.dataStore.getActiveSchema();
    
    // 1. globalCounter를 현재 노드 수로 초기화
    (this.dataStore.constructor as any)._globalCounter = this.dataStore.getNodes().size;
    
    // 2. 모든 중첩된 객체에 ID 부여 (재귀적으로)
    this._assignIdsRecursively(node);
    
    // 3. Schema validation 수행
    if (targetSchema) {
      const validation = this.dataStore.validateNode(node, targetSchema);
      if (!validation.valid) {
        throw new Error(`Schema validation failed for node ${node.sid}: ${validation.errors.join(', ')}`);
      }
    }
    
    // 4. 모든 노드를 개별적으로 생성
    this._createAllNodesRecursively(node);
    
    // 5. DataStore에서 생성된 노드를 다시 가져와서 반환 (marks 포함)
    const createdNode = this.dataStore.getNode(node.sid!);
    if (!createdNode) {
      throw new Error(`Failed to retrieve created node ${node.sid}`);
    }
    return createdNode;
  }

  /**
   * 모든 노드를 개별적으로 생성 (깊이 우선)
   */
  private _createAllNodesRecursively(node: INode): void {
    // content를 ID 배열로 변환 (자식 노드 생성 전에)
    if (node.content && Array.isArray(node.content)) {
      node.content = node.content.map(child => {
        if (typeof child === 'object' && child !== null) {
          // 자식 노드 먼저 생성
          this._createAllNodesRecursively(child as INode);
          return (child as INode).sid!;
        }
        return child;
      });
    }
    
    // 현재 노드 생성 (overlay 활성 시 overlay에만 기록)
    const overlay = (this.dataStore as any)._overlay;
    if (overlay && overlay.isActive && overlay.isActive()) {
      overlay.upsertNode(node, 'create');
    } else {
      // 노드를 저장할 때 marks를 보존
      const nodeToStore = {
        ...node,
        marks: node.marks // marks를 명시적으로 보존
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
   * 중첩된 객체들에 재귀적으로 ID 부여
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
   * DataStore 형식으로 변환 (content를 ID 배열로)
   */
  private _convertChildrenToDataStore(node: INode): void {
    if (node.content && Array.isArray(node.content)) {
      node.content = node.content.map(child => {
        if (typeof child === 'object' && child !== null) {
          const childNode = child as INode;
          this._convertChildrenToDataStore(childNode);
          const overlay = (this.dataStore as any)._overlay;
          if (overlay && overlay.isActive && overlay.isActive()) {
            overlay.upsertNode(childNode, 'create');
          } else {
            this.dataStore.setNodeInternal(childNode);
          }
          return childNode.sid!;
        }
        return child;
      });
    }
  }
}
