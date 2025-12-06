import type { INode, Document, ValidationResult, IMark } from './types';
import type { ModelSelection } from '@barocss/editor-core';
import { Schema } from '@barocss/schema';
import { validateNode as validateNodeWithSchema } from './validators';
import { 
  CoreOperations, 
  QueryOperations, 
  ContentOperations, 
  SplitMergeOperations, 
  MarkOperations, 
  DecoratorOperations,
  UtilityOperations,
  RangeOperations,
  SerializationOperations
} from './operations';
import { registerDefaultDropBehaviors } from './operations/drop-behavior-defaults';
import type { DocumentVisitor, VisitorTraversalOptions } from './operations/utility-operations';
import { TransactionalOverlay } from './transactional-overlay';

// Atomic Operation type definition
/**
 * AtomicOperation
 *
 * Spec:
 * - type: Type of atomic operation. Only create, update, delete, move are allowed.
 * - nodeId: ID of the target node. For delete, the ID of the node being deleted; for move, the ID of the node being moved.
 * - data: Snapshot of fields applied in create/update. It's merged data, not a full replacement,
 *   and can include at least { type, attributes, text, content, parentId, marks }.
 * - timestamp: Operation creation time (ms). Does not guarantee monotonic increase; sorting follows separate policy.
 * - parentId: Parent ID hint at operation time. Has meaning in create/delete/move.
 * - position: Insertion position within new parent in move (0-based). Can contain insertion position in parent content during create.
 *
 * Invariants:
 * - type must be one of the union types above.
 * - nodeId must not be an empty string.
 * - data in delete is optional and does not need to include base snapshot.
 * - position in move must be 0 or greater if provided.
 * - This type is only used for event payload purposes and should not be modified externally.
 */
export interface AtomicOperation {
  type: 'create' | 'update' | 'delete' | 'move';
  nodeId: string;
  data?: any;
  timestamp: number;
  parentId?: string;
  position?: number;
}

// Simple EventEmitter implementation
class EventEmitter {
  private listeners: Map<string, Set<Function>> = new Map();

  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: Function): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(callback);
    }
  }

  emit(event: string, ...args: any[]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(callback => {
        try {
          callback(...args);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }
}

/**
 * ID 기반 노드 저장소 (분리된 @barocss/datastore)
 */
export class DataStore {
  private nodes: Map<string, INode> = new Map();
  private rootNodeId: string | undefined;
  public version: number = 1;
  private _registeredSchemas: Map<string, Schema> = new Map();
  private _activeSchema: Schema | undefined;
  private _eventEmitter: EventEmitter = new EventEmitter();
  private static _globalCounter: number = 0;
  private _sessionId: number = 0;
  // Operation collection state
  private _overlay: TransactionalOverlay | undefined;
  // Overlay-scoped alias map (non-persistent)
  private _overlayAliases: Map<string, string> | undefined;
  // Temporary alias set used during createNodeWithChildren to detect duplicates
  private _tempAliasSet: Set<string> | undefined;

  // Global lock and queue management
  private _currentLock: {
    lockId: string;
    ownerId: string;
    acquiredAt: number;
    timeoutId: NodeJS.Timeout;
  } | null = null;
  private _transactionQueue: Array<{
    lockId: string;
    ownerId: string;
    resolve: () => void;
    timeoutId: NodeJS.Timeout;
  }> = [];
  private _lockTimeout: number = 5000; // 5 second timeout
  private _lockStats = {
    totalAcquisitions: 0,
    totalReleases: 0,
    totalTimeouts: 0,
    averageWaitTime: 0
  };

  // Separated operation classes
  public readonly core: CoreOperations;
  public readonly query: QueryOperations;
  public readonly content: ContentOperations;
  public readonly splitMerge: SplitMergeOperations;
  public readonly marks: MarkOperations;
  public readonly decorators: DecoratorOperations;
  public readonly utility: UtilityOperations;
  public readonly range: RangeOperations;
  public readonly serialization: SerializationOperations;

  constructor(rootNodeId?: string, schema?: Schema, sessionId?: number) {
    this.rootNodeId = rootNodeId;
    this._sessionId = sessionId ?? 0;
    if (schema) {
      this.setActiveSchema(schema);
    }

    // Initialize operation classes
    this.core = new CoreOperations(this);
    this.query = new QueryOperations(this);
    this.content = new ContentOperations(this);
    this.splitMerge = new SplitMergeOperations(this);
    this.marks = new MarkOperations(this);
    this.decorators = new DecoratorOperations(this);
    this.utility = new UtilityOperations(this);
    this.range = new RangeOperations(this);
    this.serialization = new SerializationOperations(this);

    // Register default drop behavior rules
    registerDefaultDropBehaviors();
  }

  /**
   * 노드 ID 생성 (피그마 스타일)
   * 
   * - 형태: sessionId:객체개수번호 (예: '0:1', '0:2', '1:1')
   * - 매우 짧고 읽기 쉬움
   * - 세션별로 그룹화되어 관리
   * - 전역 카운터로 중복 방지
   * 
   * @returns 피그마 스타일의 고유 ID (예: '0:1', '0:2')
   */
  generateId(): string {
    DataStore._globalCounter++;
    return `${this._sessionId}:${DataStore._globalCounter}`;
  }

  /**
   * 선택 범위를 JSON 형태(INode[])로 직렬화한다.
   * HTML/텍스트 변환은 Converter/Extension 레이어에서 처리한다.
   */
  serializeRange(range: ModelSelection): INode[] {
    return this.serialization.serializeRange(range);
  }

  /**
   * JSON 노드 배열을 지정한 위치에 역직렬화하여 삽입한다.
   * HTML/텍스트 → INode[] 변환은 Converter/Extension 레이어에서 처리한다.
   */
  deserializeNodes(nodes: INode[], targetParentId: string, targetPosition?: number): string[] {
    return this.serialization.deserializeNodes(nodes, targetParentId, targetPosition);
  }

  /**
   * 원자적 Operation 생성 및 이벤트 발생
   *
   * Spec emitOperation:
   * - overlay 활성 시 (begin~commit 사이) 기록은 overlay(TransactionalOverlay)가 단일 진실 원천이다.
   * - 이벤트는 overlay 활성 여부와 무관하게 항상 발행되며, 관찰/로깅 용도로만 사용한다.
   * - 이벤트 페이로드는 외부에서 변경하지 않는다(불변 취급).
   */
  emitOperation(operation: AtomicOperation): void {
    // Do not use local collection; overlay is the single source of truth
    if (this._overlay && this._overlay.isActive()) {
      (this._overlay as any).recordOperation(operation);
    }
    this._eventEmitter.emit('operation', operation);
  }

  /**
   * Operation 이벤트 리스너 등록
   *
   * Spec:
   * - 콜백은 모든 원자 연산(create/update/move/delete)에 대해 호출된다.
   * - overlay 활성 여부와 관계없이 이벤트는 항상 발행된다.
   * - 콜백이 수신하는 페이로드(AtomicOperation)는 불변으로 취급해야 하며 외부에서 수정하지 않는다.
   */
  onOperation(callback: (operation: AtomicOperation) => void): void {
    this._eventEmitter.on('operation', callback);
  }

  /**
   * Operation 이벤트 리스너 제거
   *
   * Spec:
   * - onOperation으로 등록한 동일 참조의 콜백만 제거된다.
   * - 등록되지 않은 콜백을 제거하려 해도 에러를 던지지 않는다.
   */
  offOperation(callback: (operation: AtomicOperation) => void): void {
    this._eventEmitter.off('operation', callback);
  }

  /**
   * Operation 수집을 시작합니다. 이후 발생하는 원자 연산은 내부에 누적됩니다.
   *
   * Spec begin:
   * - overlay가 없으면 초기화하고 begin() 상태로 전환한다.
   * - overlay alias 맵(_overlayAliases)도 초기화한다.
   * - begin 이후 발생하는 모든 연산은 overlay에 기록되며, 이벤트는 즉시 발행된다.
   */
  begin(): void {
    // Do not use local collection; initialize overlay only
    if (!this._overlay) {
      this._overlay = new TransactionalOverlay({
        getVersion: () => this.getVersion(),
        sessionId: this.getSessionId()
      });
    }
    this._overlay.begin();
    // Initialize overlay alias map
    this._overlayAliases = new Map<string, string>();
  }

  getNodes(): Map<string, INode> {
    return this.nodes;
  }
  setNodes(nodes: Map<string, INode>): void {
    this.nodes = nodes;
  }

  /**
   * 현재까지 누적된 Operation 목록을 반환합니다 (복사본)
   */
  getCollectedOperations(): AtomicOperation[] {
    if (this._overlay && this._overlay.isActive()) {
      return (this._overlay as any).getCollectedOperations() as AtomicOperation[];
    }
    return [];
  }

  /**
   * Operation 수집을 종료하고, 누적된 목록을 반환합니다.
   * 내부 버퍼는 함께 비워집니다.
   *
   * Spec end:
   * - overlay가 활성 상태면 현재까지 수집된 연산 목록의 스냅샷을 반환한다.
   * - overlay는 여전히 활성 상태를 유지하며, 실제 반영은 commit()에서 수행된다.
   */
  end(): AtomicOperation[] {
    // Return overlay-buffered ops; overlay remains active until commit/rollback
    if (this._overlay && this._overlay.isActive()) {
      return (this._overlay as any).getCollectedOperations() as AtomicOperation[];
    }
    return [];
  }

  /**
   * Overlay 기반 커밋 훅 (현재는 no-op, 점진적 통합 예정)
   *
   * Spec commit:
   * - Applies overlay-collected operations in deterministic order: create -> update -> move -> delete.
   * - For update, merges fields (attributes shallow-merge) instead of replacing entire node.
   * - Reflects overlay root change if present.
   * - Clears overlay and alias map after commit.
   */
  commit(): void {
    if (!this._overlay || !this._overlay.isActive()) return;
    const ops = (this._overlay as any).getCollectedOperations() as AtomicOperation[];
    // Apply ops in deterministic order: create -> update -> move -> delete
    const priority: Record<string, number> = { create: 1, update: 2, move: 3, delete: 4 } as any;
    const sorted = ops.slice().sort((a, b) => (priority[a.type] - priority[b.type]) || 0);
    for (const op of sorted) {
      switch (op.type) {
        case 'create': {
          // Get node from overlay or use op.data
          const overlayNode = (this._overlay as any)?.getOverlayNode(op.nodeId) as INode | undefined;
          const node = overlayNode || (op as any).data as INode;
          if (node) {
            // Preserve marks if node already exists
            const existingNode = this.nodes.get(op.nodeId);
            const marks = node.marks || existingNode?.marks;
            this._setNodeInternal({ ...node, marks, sid: op.nodeId } as any);
          }
          // Note: parentId relationship is already set in _createAllNodesRecursively,
          // so no additional processing here (prevent duplication)
          break;
        }
        case 'update': {
          const target = this.nodes.get(op.nodeId);
          if (target && op.data) {
            // For update operations, merge the data instead of replacing
            const updatedNode = { ...target, ...op.data } as INode;
            if (op.data.attributes && target.attributes) {
              updatedNode.attributes = { ...target.attributes, ...op.data.attributes };
            }
            this._setNodeInternal(updatedNode);
          }
          break;
        }
        case 'move': {
          const { nodeId, parentId, position } = op as any;
          const node = this.nodes.get(nodeId);
          if (!node) break;
          if (node.parentId) {
            const oldParent = this.nodes.get(node.parentId);
            if (oldParent && oldParent.content) {
              const idx = (oldParent.content as any).indexOf(nodeId);
              if (idx !== -1) (oldParent.content as any).splice(idx, 1);
              this._setNodeInternal(oldParent as any);
            }
          }
          if (parentId) {
            const newParent = this.nodes.get(parentId);
            if (newParent) {
              const pos = typeof position === 'number' ? position : newParent.content ? newParent.content.length : 0;
              if (!newParent.content) newParent.content = [];
              (newParent.content as any).splice(pos, 0, nodeId);
              this._setNodeInternal(newParent as any);
            }
            node.parentId = parentId;
            this._setNodeInternal(node as any);
          }
          break;
        }
        case 'delete': {
          const { nodeId, parentId } = op as any;
          if (parentId) {
            const parent = this.nodes.get(parentId);
            if (parent && parent.content) {
              const idx = (parent.content as any).indexOf(nodeId);
              if (idx !== -1) (parent.content as any).splice(idx, 1);
              this._setNodeInternal(parent as any);
            }
          }
          this.nodes.delete(nodeId);
          break;
        }
      }
    }
    // Apply overlay root change if present
    const overlayRoot = (this._overlay as any).overlayRootNodeId as string | undefined;
    if (overlayRoot) {
      this.rootNodeId = overlayRoot;
    }
    (this._overlay as any).rollback();
    this._overlay = undefined;
    // Clear alias map on commit
    if (this._overlayAliases) this._overlayAliases.clear();
  }

  /**
   * Overlay 롤백 훅 (현재는 버퍼/상태 초기화만)
   *
   * Spec rollback:
   * - overlay가 존재하면 overlay 상태를 폐기하고 비활성화한다.
   * - overlay alias 맵을 지운다.
   * - 이벤트는 별도로 발행되지 않는다(롤백 자체는 관찰 대상 아님).
   */
  rollback(): void {
    if (!this._overlay) return;
    this._overlay.rollback();
    this._overlay = undefined;
    // Clear alias map on rollback
    if (this._overlayAliases) this._overlayAliases.clear();
  }

  /**
   * 세션 ID 조회
   * 
   * @returns 현재 세션 ID
   * 
   * @example
   * ```typescript
   * const sessionId = dataStore.getSessionId();
   * console.log(sessionId); // 0
   * ```
   */
  getSessionId(): number {
    return this._sessionId;
  }

  /**
   * 세션 ID 설정
   * 
   * @param sessionId - 새로운 세션 ID
   * 
   * @example
   * ```typescript
   * dataStore.setSessionId(1);
   * dataStore.generateId(); // "1:1", "1:2", ...
   * ```
   */
  setSessionId(sessionId: number): void {
    this._sessionId = sessionId;
  }

  /**
   * Query 기능들 - DataStore에서 노드를 검색하고 필터링하는 기능들
   */
  
  /**
   * 조건에 맞는 노드들을 찾기
   */
  findNodes(predicate: (node: INode) => boolean): INode[] {
    return this.query.findNodes(predicate);
  }

  /**
   * 타입으로 노드들 찾기
   */
  findNodesByType(stype: string): INode[] {
    return this.query.findNodesByType(stype);
  }

  /**
   * 속성으로 노드들 찾기
   */
  findNodesByAttribute(key: string, value: any): INode[] {
    return this.query.findNodesByAttribute(key, value);
  }

  /**
   * 텍스트 내용으로 노드들 찾기
   */
  findNodesByText(text: string): INode[] {
    return this.query.findNodesByText(text);
  }

  /**
   * 부모 ID로 자식 노드들 찾기
   */
  findChildrenByParentId(parentId: string): INode[] {
    return this.query.findChildrenByParentId(parentId);
  }

  /**
   * 루트 노드들 찾기 (parentId가 없는 노드들)
   */
  findRootNodes(): INode[] {
    return this.query.findRootNodes();
  }

  /**
   * Content를 객체 배열로 리턴하는 기능들
   * 
   * DataStore는 내부적으로 ID 기반으로 노드를 저장하지만, 
   * 외부에서는 중첩된 객체 구조로 노드에 접근할 수 있도록 하는 기능들입니다.
   */
  
  /**
   * 노드의 직접 자식들을 객체 배열로 변환 (1단계만)
   */
  getNodeChildren(nodeId: string): INode[] {
    return this.query.getNodeChildren(nodeId);
  }

  /**
   * 노드의 자식들을 재귀적으로 객체 배열로 변환 (중첩 구조 포함)
   */
  getNodeChildrenDeep(nodeId: string): INode[] {
    return this.query.getNodeChildrenDeep(nodeId);
  }

  /**
   * 노드를 완전한 객체 구조로 변환 (content가 객체 배열)
   */
  getNodeWithChildren(nodeId: string): INode | null {
    return this.query.getNodeWithChildren(nodeId);
  }

  /**
   * 모든 노드를 완전한 객체 구조로 변환
   */
  getAllNodesWithChildren(): INode[] {
    return this.query.getAllNodesWithChildren();
  }

  /**
   * 노드를 DataStore에 저장하거나 업데이트
   * 
   * @param node - 저장할 노드 객체 (중첩 구조 가능)
   * @param validate - Schema validation 수행 여부 (기본값: true)
   */
  setNode(node: INode, validate: boolean = true): void {
    // Handle $alias on create/update: map alias -> id and strip from attributes
    const cleaned = this._captureAliasFromNode(node);
    this.core.setNode(cleaned, validate);
  }

  /**
   * DataStore 내부에서 ID 기반 노드를 저장 (validation 없이)
   */
  setNodeInternal(node: INode): void {
    this._setNodeInternal(node);
  }

  /**
   * DataStore 내부에서 ID 기반 노드를 저장 (내부용)
   */
  private _setNodeInternal(node: INode): void {
    this.nodes.set(node.sid!, node);
  }

  /**
   * 중첩된 노드 구조를 한 번에 생성
   * 
   * 복잡한 중첩 구조를 가진 노드를 한 번에 생성하는 메서드입니다.
   * 다음과 같은 과정을 거쳐 모든 노드를 생성합니다:
   * 1. 모든 중첩된 객체에 ID 부여 (재귀적으로)
   * 2. Schema validation 수행 (ID가 부여된 후)
   * 3. 모든 노드를 개별적으로 생성 (각각 Operation 발생)
   * 
   * @param node - 생성할 중첩 노드 구조
   * @param schema - 사용할 Schema (기본값: 활성 Schema)
   * @returns 생성된 루트 노드 (ID가 부여됨)
   * 
   * @throws {Error} Schema validation 실패 시
   * 
   * @example
   * ```typescript
   * // Create complex document structure
   * const document = {
   *   stype: 'document',
   *   content: [
   *     {
   *       stype: 'paragraph',
   *       content: [
   *         { stype: 'inline-text', text: 'Hello' },
   *         { stype: 'inline-text', text: 'World' }
   *       ]
   *     },
   *     {
   *       stype: 'paragraph',
   *       content: [
   *         { stype: 'inline-text', text: 'Second paragraph' }
   *       ]
   *     }
   *   ]
   * };
   * 
   * const createdDocument = dataStore.createNodeWithChildren(document);
   * console.log(createdDocument.sid); // 'document-1234567890-1-abc123'
   * ```
   */
  createNodeWithChildren(node: INode, schema?: Schema): INode {
    const targetSchema = schema || this._activeSchema;
    
    // Prepare temporary alias set to enforce uniqueness within this creation
    this._tempAliasSet = new Set<string>();
    // 1. Initialize globalCounter to current node count
    DataStore._globalCounter = this.nodes.size;
    
    // 2. Assign IDs to all nested objects (recursively)
    this._assignIdsRecursively(node);
    
    // 2. Perform schema validation (after IDs are assigned, before converting to DataStore format)
    if (targetSchema) {
      // Strict: every node.stype must exist in schema and required attrs must be present
      const nodesDef: any = (targetSchema as any)?.nodes || undefined;
      const assertTypes = (n: INode) => {
        // Support both Map-based schema (Schema.nodes: Map) and plain object
        const def = typeof (nodesDef as any)?.get === 'function'
          ? (nodesDef as any).get(n.stype)
          : (nodesDef ? (nodesDef as any)[n.stype] : (targetSchema as any)?.getNodeType?.(n.stype));
        if (!def) {
          // Diagnostic logging to help identify schema/type mismatch during tests
          try {
            const schemaName = (targetSchema as any)?.name || 'unknown-schema';
            const availableTypes = typeof (nodesDef as any)?.keys === 'function'
              ? Array.from((nodesDef as any).keys())
              : Object.keys((nodesDef as any) || {});
            // eslint-disable-next-line no-console
            console.error(
              '[DataStore.createNodeWithChildren] Unknown node type during schema validation',
              {
                nodeId: n.sid,
                nodeType: n.stype,
                schemaName,
                availableTypes
              }
            );
          } catch (_) {
            // ignore logging failures
          }
          throw new Error(`Schema validation failed for node ${n.sid}: unknown type '${n.stype}'`);
        }
        const attrsDef: any = def.attrs || {};
        for (const [key, meta] of Object.entries(attrsDef)) {
          if ((meta as any)?.required) {
            const has = (n as any).attributes && ((n as any).attributes[key] !== undefined);
            if (!has) {
              throw new Error(`Schema validation failed for node ${n.sid}: missing required attribute '${key}'`);
            }
          }
        }
        if (n.content && Array.isArray(n.content)) {
          for (const c of n.content) {
            if (typeof c === 'object' && c !== null) assertTypes(c as INode);
          }
        }
      };
      assertTypes(node);
      const validation = this.validateNode(node, targetSchema);
      if (!validation.valid) {
        throw new Error(`Schema validation failed for node ${node.sid}: ${validation.errors.join(', ')}`);
      }
    }
    
    // 3. Create all nodes individually (each generates an operation)
    this._createAllNodesRecursively(node);
    
    // 4. Set root node ID
    if (!this.rootNodeId) {
      this.rootNodeId = node.sid;
    }
    // Clear temp alias tracking
    this._tempAliasSet = undefined;
    
    return node;
  }

  /**
   * Create all nodes individually (depth-first)
   */
  private _createAllNodesRecursively(node: INode): void {
    // Create child nodes first
    if (node.content) {
      for (const child of node.content) {
        if (typeof child === 'object') {
          this._createAllNodesRecursively(child as INode);
        }
      }
    }
    
    // Convert content to ID array
    if (node.content && Array.isArray(node.content)) {
      node.content = node.content.map(child => {
        if (typeof child === 'object' && child !== null) {
          return (child as INode).sid!;
        }
        return child;
      });
    }
    
    // Handle $alias: register if overlay scope, always remove before saving
    if (node.attributes && (node.attributes as any).$alias) {
      const alias = (node.attributes as any).$alias as string;
      // Enforce uniqueness within this creation
      if (this._tempAliasSet) {
        if (this._tempAliasSet.has(alias)) {
          throw new Error(`Duplicate alias detected in creation: '${alias}'`);
        }
        this._tempAliasSet.add(alias);
      }
      try {
        // Register alias only when overlay is active (overlay scope)
        if ((this as any)._overlayAliasMap) {
          this.setAlias(alias, node.sid!);
        }
      } catch (_) {}
      const newAttrs = { ...(node.attributes as any) };
      delete (newAttrs as any).$alias;
      node.attributes = newAttrs;
    }

    // Create current node (generates operation) — reject duplicate IDs
    if (this.nodes.has(node.sid!)) {
      throw new Error(`Node ID already exists: ${node.sid}`);
    }
    this._setNodeInternal(node);
    
    const operation: AtomicOperation = {
      type: 'create',
      nodeId: node.sid!,
      data: {
        stype: node.stype,
        attributes: node.attributes,
        text: node.text,
        content: node.content,
        parentId: node.parentId
      },
      timestamp: Date.now(),
      parentId: node.parentId
    };
    
    this.emitOperation(operation);
  }

  /**
   * Recursively assign IDs to nested objects
   */
  private _assignIdsRecursively(node: INode): void {
    // Assign ID to current node
    if (!node.sid) {
      node.sid = this.generateId();
    }
    
    // Assign IDs to child nodes (recursively)
    if (node.content && Array.isArray(node.content)) {
      node.content.forEach(child => {
        if (typeof child === 'object' && child !== null) {
          const childNode = child as INode;
          childNode.parentId = node.sid; // Set parent ID
          this._assignIdsRecursively(childNode);
        } else if (typeof child === 'string') {
          // If it's an existing ID, find the node and set parent ID
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
          // Recursively convert child node to DataStore format
          this._convertChildrenToDataStore(childNode);
          // Save child node directly (validation already performed at parent level)
          this._setNodeInternal(childNode);
          return childNode.sid!; // Return only ID
        }
        return child; // Return as is if already an ID
      });
    }
  }

  setRootNodeId(nodeId: string): void {
    // Spec:
    // - Directly sets root node ID. Applied immediately when overlay is inactive.
    // - setRoot() only reflects in overlay when overlay is active.
    this.rootNodeId = nodeId;
  }

  /**
   * Set root based on transaction overlay.
   * If active overlay exists, only reflected in overlay and applied to base on commit().
   */
  setRoot(rootId: string): void {
    // Spec:
    // - When overlay is active, only reflected in overlay and applied to base on commit().
    // - When overlay is inactive, immediately reflected in base.
    if (this._overlay && this._overlay.isActive()) {
      (this._overlay as any).overlayRootNodeId = rootId;
      return;
    }
    this.rootNodeId = rootId;
  }

  /**
   * ID로 노드 조회
   */
  getNode(nodeId: string): INode | undefined {
    const realId = this.resolveAlias(nodeId);
    return this.core.getNode(realId);
  }

  /**
   * 노드 삭제
   */
  deleteNode(nodeId: string): boolean {
    const realId = this.resolveAlias(nodeId);
    return this.core.deleteNode(realId);
  }

  /**
   * 노드 타입 변환 (paragraph → heading, heading → paragraph 등)
   * 
   * @param nodeId - 변환할 노드 ID
   * @param newType - 새로운 노드 타입 (stype)
   * @param newAttrs - 새로운 attributes (선택적)
   * @returns 변환 결과
   */
  transformNode(nodeId: string, newType: string, newAttrs?: Record<string, any>): { valid: boolean; errors: string[]; newNodeId?: string } {
    const realId = this.resolveAlias(nodeId);
    return this.core.transformNode(realId, newType, newAttrs);
  }

  /**
   * 블록 노드를 위로 이동
   * 
   * @param nodeId - 이동할 노드 ID
   * @returns 이동 성공 여부
   */
  moveBlockUp(nodeId: string): boolean {
    const realId = this.resolveAlias(nodeId);
    return this.content.moveBlockUp(realId);
  }

  /**
   * 블록 노드를 아래로 이동
   * 
   * @param nodeId - 이동할 노드 ID
   * @returns 이동 성공 여부
   */
  moveBlockDown(nodeId: string): boolean {
    const realId = this.resolveAlias(nodeId);
    return this.content.moveBlockDown(realId);
  }

  /**
   * 루트 노드 조회
   * 
   * @returns 루트 노드 객체 (설정되지 않았으면 undefined)
   * 
   * @example
   * ```typescript
   * const rootNode = dataStore.getRootNode();
   * if (rootNode) {
   *   console.log('루트 노드:', rootNode.stype); // 'document'
   * }
   * ```
   */
  getRootNode(): INode | undefined {
    // Spec:
    // - If rootNodeId is not set, infers and sets first node (convenience policy).
    // - Always returns root node of current context (including overlay interpretation).
    if (!this.rootNodeId) {
      const firstNode = Array.from(this.nodes.values())[0];
      if (firstNode) {
        this.rootNodeId = firstNode.sid;
      }
      return firstNode;
    }
    return this.getNode(this.rootNodeId);
  }

  getChildren(nodeId: string): INode[] {
    return this.utility.getChildren(nodeId);
  }

  getParent(nodeId: string): INode | undefined {
    return this.utility.getParent(nodeId);
  }

  getSiblings(nodeId: string): INode[] {
    return this.utility.getSiblings(nodeId);
  }

  getSiblingIndex(nodeId: string): number {
    return this.utility.getSiblingIndex(nodeId);
  }

  /**
   * 같은 부모의 이전 형제 노드 조회
   */
  getPreviousSibling(nodeId: string): string | null {
    return this.utility.getPreviousSibling(nodeId);
  }

  /**
   * 같은 부모의 다음 형제 노드 조회
   */
  getNextSibling(nodeId: string): string | null {
    return this.utility.getNextSibling(nodeId);
  }

  /**
   * 첫 번째 자식 노드 조회
   */
  getFirstChild(nodeId: string): string | null {
    return this.utility.getFirstChild(nodeId);
  }

  /**
   * 마지막 자식 노드 조회
   */
  getLastChild(nodeId: string): string | null {
    return this.utility.getLastChild(nodeId);
  }

  /**
   * 첫 번째 형제 노드 조회
   */
  getFirstSibling(nodeId: string): string | null {
    return this.utility.getFirstSibling(nodeId);
  }

  /**
   * 마지막 형제 노드 조회
   */
  getLastSibling(nodeId: string): string | null {
    return this.utility.getLastSibling(nodeId);
  }

  /**
   * 두 노드의 공통 조상 찾기
   */
  getCommonAncestor(nodeId1: string, nodeId2: string): string | null {
    return this.utility.getCommonAncestor(nodeId1, nodeId2);
  }

  /**
   * 두 노드 간의 거리 계산
   */
  getDistance(nodeId1: string, nodeId2: string): number {
    return this.utility.getDistance(nodeId1, nodeId2);
  }

  getNodePath(nodeId: string): string[] {
    return this.utility.getNodePath(nodeId);
  }

  getNodeDepth(nodeId: string): number {
    return this.utility.getNodeDepth(nodeId);
  }

  isDescendant(nodeId: string, ancestorId: string): boolean {
    return this.utility.isDescendant(nodeId, ancestorId);
  }

  getAllDescendants(nodeId: string): INode[] {
    return this.utility.getAllDescendants(nodeId);
  }

  getAllAncestors(nodeId: string): INode[] {
    return this.utility.getAllAncestors(nodeId);
  }

  /**
   * 자식 노드 추가 (부모의 content 배열 업데이트)
   */
  addChild(parentId: string, child: INode | string, position?: number): string {
    return this.content.addChild(parentId, child, position);
  }

  /**
   * 자식 노드 제거 (부모의 content 배열에서 제거)
   */
  removeChild(parentId: string, childId: string): boolean {
    return this.content.removeChild(parentId, childId);
  }

  /**
   * 노드를 다른 부모로 이동
   */
  moveNode(nodeId: string, newParentId: string, position?: number): void {
    this.content.moveNode(nodeId, newParentId, position);
  }

  getNodeCount(): number {
    return this.utility.getNodeCount();
  }

  clone(): DataStore {
    return this.utility.clone();
  }

  saveNode(node: INode, validate: boolean = true): { valid: boolean; errors: string[] } | null {
    this.setNode(node, validate);
    return null; // Success
  }

  updateNode(nodeId: string, updates: Partial<INode>, validate: boolean = true): { valid: boolean; errors: string[] } | null {
    /**
     * Spec:
     * - Disallows type changes (rejects with error).
     * - Merges attributes shallowly with existing attributes.
     * - No-op suppression: if ALL provided fields are equal (deep-equal via JSON stringify) to current values,
     *   return { valid: true } without emitting write/operation.
     * - Validation path: validate=true and not a content update -> delegates to setNode(updated, true) for schema check.
     * - Content updates (content: string[]) always bypass validation (IDs only), persist directly with setNode(updated, false).
     * - Emits operations centrally via setNode/emitOperation honoring transactional overlay.
     */
    const realId = this.resolveAlias(nodeId);
    const node = this.getNode(realId);
    if (!node) {
      return { valid: false, errors: [`Node not found: ${realId}`] };
    }
    
    // Do not allow stype changes (also check legacy type)
    if (updates.stype && updates.stype !== node.stype) {
      return { 
        valid: false, 
        errors: [`Cannot change node stype from '${node.stype}' to '${updates.stype}'`] 
      };
    }
    
    // Merge attributes correctly
    // Handle $alias in updates.attributes
    if (updates.attributes && typeof (updates.attributes as any).$alias !== 'undefined') {
      const aliasVal = (updates.attributes as any).$alias;
      if (typeof aliasVal === 'string' && aliasVal) {
        this.setAlias(aliasVal, realId);
      } else {
        // remove alias mapping if falsy/undefined
        const prev = this._findAliasById(realId);
        if (prev) this.deleteAlias(prev);
      }
      // strip $alias from attributes before save
      const { $alias, ...rest } = (updates.attributes as any);
      updates = { ...updates, attributes: rest } as any;
    }

    // No-op suppression: if all provided fields are unchanged, skip write
    const updateKeys = Object.keys(updates as any);
    if (updateKeys.length > 0) {
      let allEqual = true;
      for (const key of updateKeys) {
        const prevVal = (node as any)[key];
        const nextVal = (updates as any)[key];
        // Deep compare for arrays/objects (shallow JSON stringify is sufficient for our node shapes)
        const equal = JSON.stringify(prevVal) === JSON.stringify(nextVal);
        if (!equal) { allEqual = false; break; }
      }
      if (allEqual) {
        return { valid: true, errors: [] };
      }
    }

    const updatedNode = { ...node, ...updates } as INode;
    if (updates.attributes && node.attributes) {
      updatedNode.attributes = { ...node.attributes, ...updates.attributes };
    }
    
    
    // Skip validation for content updates (because it's an ID array)
    const isContentUpdate = updates.content !== undefined;
    
    if (validate && !isContentUpdate) {
      // When validation is needed and it's not a content update
      try {
        this.setNode(updatedNode, true);
        return { valid: true, errors: [] }; // Success
      } catch (error) {
        return { 
          valid: false, 
          errors: [error instanceof Error ? error.message : 'Validation failed'] 
        };
      }
    } else {
      // When skipping validation (content update or validate=false)
      this.setNode(updatedNode, false);
      return { valid: true, errors: [] }; // Success
    }
  }

  // ===== Alias Map (overlay scoped) =====
  /**
   * Registers alias in overlay scope.
   *
   * Spec setAlias:
   * - Alias must be unique within the same overlay scope. Error if duplicate registration with different id.
   * - If overlay does not exist, initializes and uses internal map (usable outside transactions).
   */
  setAlias(alias: string, id: string): void {
    if (!this._overlayAliases) this._overlayAliases = new Map<string, string>();
    // basic uniqueness check within overlay
    if (this._overlayAliases.has(alias) && this._overlayAliases.get(alias) !== id) {
      throw new Error(`Alias already in use: ${alias}`);
    }
    this._overlayAliases.set(alias, id);
  }

  /**
   * Takes alias or actual id as input and resolves to actual id.
   * Returns original string if overlay does not exist or mapping is not found.
   */
  resolveAlias(idOrAlias: string): string {
    if (!this._overlayAliases) return idOrAlias;
    return this._overlayAliases.get(idOrAlias) || idOrAlias;
  }

  /** Removes alias mapping in overlay scope. */
  deleteAlias(alias: string): void {
    if (this._overlayAliases) this._overlayAliases.delete(alias);
  }

  /** Removes all alias mappings in overlay scope. */
  clearAliases(): void {
    if (this._overlayAliases) this._overlayAliases.clear();
  }

  /** Returns alias map in overlay scope as read-only. Returns empty map if overlay does not exist. */
  getAliases(): ReadonlyMap<string, string> {
    return this._overlayAliases || new Map<string, string>();
  }

  private _findAliasById(id: string): string | undefined {
    if (!this._overlayAliases) return undefined;
    for (const [k, v] of this._overlayAliases.entries()) {
      if (v === id) return k;
    }
    return undefined;
  }

  private _captureAliasFromNode(node: INode): INode {
    const cloned: any = { ...node };
    // walk this node only (no deep handling here; higher-level creation handles children)
    const alias = cloned.attributes && typeof cloned.attributes.$alias === 'string' ? cloned.attributes.$alias : undefined;
    if (alias && cloned.sid) {
      this.setAlias(alias, cloned.sid);
      const { $alias, ...rest } = cloned.attributes || {};
      cloned.attributes = rest;
    }
    return cloned as INode;
  }

  private saveNodeRecursively(node: INode, parentId?: string): void {
    const nodeWithParent = { ...node, parentId: parentId || 'root' } as INode;
    this.setNode(nodeWithParent);
    if (node.content) {
      for (const childId of node.content) {
        const childNode = typeof childId === 'string' ? this.getNode(childId) : (childId as any);
        if (childNode) {
          this.saveNodeRecursively(childNode, node.sid);
        }
      }
    }
  }

  saveDocumentInternal(document: Document, _validate: boolean = true): { valid: boolean; errors: string[] } {
    // Spec:
    // - Takes document.content (object form) or contentIds (ID array) as input and stores root/child nodes.
    // - The returned root (document) is based on a snapshot with parentId removed.
    // - Schema metadata is merged and maintained in root.attributes.schema.
    let contentIds: string[] = [];
    if ((document as any).content) {
      for (const childNode of (document as any).content as any[]) {
        this.saveNodeRecursively(childNode as any, document.sid || 'root');
        contentIds.push((childNode as any).sid);
      }
    } else if ((document as any).contentIds) {
      contentIds = (document as any).contentIds as string[];
    }
    const rootNode: INode = {
      sid: document.sid || 'root',
      stype: 'document',
      content: contentIds,
      attributes: { ...(document as any).attributes, schema: (document as any).schema || (document as any).attributes?.schema || {} },
      metadata: (document as any).metadata || {},
      version: (document as any).version || 1,
      createdAt: new Date(),
      updatedAt: new Date()
    } as any;
    this.setNode(rootNode);
    this.setRootNodeId(rootNode.sid as string);
    return { valid: true, errors: [] };
  }

  getDocument(documentId: string): Document | undefined {
    // Spec:
    // - Returns only when id matches current root or 'root' is requested.
    // - Constructs content with parentId removed.
    const rootNode = this.getRootNode();
    if (!rootNode) return undefined;
    if (documentId !== 'root' && rootNode.sid !== documentId) return undefined;
    const contentNodes: any[] = [];
    if (rootNode.content) {
      for (const childId of rootNode.content) {
        const childNode = this.getNode(childId as string);
        if (childNode) {
          const { parentId, ...nodeWithoutParent } = childNode as any;
          contentNodes.push(nodeWithoutParent);
        }
      }
    }
    const result = {
      sid: rootNode.sid,
      stype: 'document',
      content: contentNodes as any,
      metadata: {
        title: 'Untitled Document',
        author: 'Unknown',
        version: '1.0.0',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...rootNode.metadata
      },
      schema: (rootNode as any).attributes?.schema || ({} as any),
      version: rootNode.version || 1
    } as any;
    
    return result;
  }

  updateDocument(documentId: string, updates: Partial<Document>, validate: boolean = true): { valid: boolean; errors: string[] } {
    // Spec:
    // - Merges based on getDocument() snapshot and delegates to saveDocumentInternal().
    const document = this.getDocument(documentId);
    if (!document) {
      return { valid: false, errors: [`Document not found: ${documentId}`] };
    }
    const updatedDocument = { ...document, ...updates } as any;
    return this.saveDocumentInternal(updatedDocument, validate);
  }

  deleteDocument(documentId: string): boolean {
    // Spec:
    // - Policy: current root document cannot be deleted. Always throws error.
    const rootNode = this.getRootNode();
    if (!rootNode || rootNode.sid !== documentId) {
      return false;
    }
    // Policy: root document cannot be deleted
    throw new Error('Cannot delete root document');
  }

  /**
   * Schema 등록
   */
  registerSchema(schema: Schema): void {
    if (schema && schema.name) {
      this._registeredSchemas.set(schema.name, schema);
    }
  }

  /**
   * 활성 Schema 설정
   */
  setActiveSchema(schema: Schema): void {
    this._activeSchema = schema;
    this.registerSchema(schema);
  }

  /**
   * 활성 Schema 조회
   */
  getActiveSchema(): Schema | undefined {
    return this._activeSchema;
  }

  /**
   * Schema로 노드 검증
   */
  validateNode(node: INode, schema?: Schema): { valid: boolean; errors: string[] } {
    const targetSchema = schema || this._activeSchema;
    if (!targetSchema) {
      return { valid: true, errors: [] }; // Validation passes if no schema
    }

    try {
      const validation = validateNodeWithSchema(node, targetSchema);
      return validation;
    } catch (error) {
      return { valid: false, errors: [`Validation error: ${error}`] };
    }
  }

  getAllDocuments(): Document[] {
    const rootNode = this.getRootNode();
    if (!rootNode) return [] as any;
    const contentNodes: any[] = [];
    if (rootNode.content) {
      for (const childId of rootNode.content) {
        const childNode = this.getNode(childId as string);
        if (childNode) {
          const { parentId, ...nodeWithoutParent } = childNode as any;
          contentNodes.push(nodeWithoutParent);
        }
      }
    }
    return [{
      sid: rootNode.sid,
      stype: 'document',
      content: contentNodes as any,
      metadata: {
        title: 'Untitled Document',
        author: 'Unknown',
        version: '1.0.0',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...rootNode.metadata
      },
      schema: (rootNode as any).attributes?.schema || ({} as any),
      version: rootNode.version || 1
    } as any];
  }


  saveDocument(document: Document, validate: boolean = true): ValidationResult | null {
    const result = this.saveDocumentInternal(document, validate);
    return (result as any).valid ? null : (result as any);
  }

  getAllNodes(): INode[] {
    return this.utility.getAllNodes();
  }

  getAllNodesMap(): Map<string, INode> {
    return this.utility.getAllNodesMap();
  }

  getRootNodeId(): string | undefined {
    return this.rootNodeId;
  }

  getVersion(): number {
    return this.version;
  }

  clear(): void {
    this.getNodes().clear();
    this.setRootNodeId(undefined!);
    this.version = 1;
  }

  restoreFromSnapshot(nodes: Map<string, INode>, rootNodeId?: string, version: number = 1): void {
    this.utility.restoreFromSnapshot(nodes, rootNodeId, version);
  }

  /**
   * 노드 복사 (새 ID 생성)
   */
  copyNode(nodeId: string, newParentId?: string): string {
    return this.content.copyNode(nodeId, newParentId);
  }

  /**
   * 노드와 모든 자식들을 복사 (재귀적 복사)
   */
  cloneNodeWithChildren(nodeId: string, newParentId?: string): string {
    return this.content.cloneNodeWithChildren(nodeId, newParentId);
  }

  /**
   * 자식 노드 순서 변경
   */
  reorderChildren(parentId: string, childIds: string[]): void {
    this.content.reorderChildren(parentId, childIds);
  }

  /**
   * Search & Filter Functions - 검색 및 필터링 기능들
   */

  /**
   * 텍스트 내용으로 노드 검색
   */
  searchText(query: string): INode[] {
    return this.query.searchText(query);
  }

  /**
   * 특정 속성으로 노드 검색
   */
  findByAttribute(key: string, value: any): INode[] {
    return this.query.findNodesByAttribute(key, value);
  }

  /**
   * Content Manipulation Functions - 내용 조작 기능들
   */

  /**
   * 자식 노드들 일괄 추가
   */
  addChildren(parentId: string, children: (INode | string)[], position?: number): string[] {
    return this.content.addChildren(parentId, children, position);
  }

  /**
   * 자식 노드들 일괄 제거
   */
  removeChildren(parentId: string, childIds: string[]): boolean[] {
    return this.content.removeChildren(parentId, childIds);
  }

  /**
   * 자식 노드들 일괄 이동
   */
  moveChildren(fromParentId: string, toParentId: string, childIds: string[], position?: number): void {
    this.content.moveChildren(fromParentId, toParentId, childIds, position);
  }

  /**
   * Utility Methods - 유틸리티 기능들
   */

  /**
   * 노드 존재 여부 확인
   */
  hasNode(nodeId: string): boolean {
    return this.utility.hasNode(nodeId);
  }

  /**
   * 자식 노드 개수 조회
   */
  getChildCount(nodeId: string): number {
    return this.utility.getChildCount(nodeId);
  }

  /**
   * 노드가 리프 노드인지 확인 (자식이 없는 노드)
   */
  isLeafNode(nodeId: string): boolean {
    return this.utility.isLeafNode(nodeId);
  }

  /**
   * 노드가 루트 노드인지 확인
   */
  isRootNode(nodeId: string): boolean {
    return this.utility.isRootNode(nodeId);
  }

  // ========================================
  // Split & Merge Functions - split and merge features
  // ========================================

  /**
   * 텍스트 노드를 지정된 위치에서 분할
   */
  splitTextNode(nodeId: string, splitPosition: number): string {
    return this.splitMerge.splitTextNode(nodeId, splitPosition);
  }

  /**
   * 두 개의 텍스트 노드를 병합
   */
  mergeTextNodes(leftNodeId: string, rightNodeId: string): string {
    return this.splitMerge.mergeTextNodes(leftNodeId, rightNodeId);
  }

  /**
   * 블록 노드를 지정된 위치에서 분할
   */
  splitBlockNode(nodeId: string, splitPosition: number): string {
    return this.splitMerge.splitBlockNode(nodeId, splitPosition);
  }

  /**
   * 두 개의 블록 노드를 병합
   */
  mergeBlockNodes(leftNodeId: string, rightNodeId: string): string {
    return this.splitMerge.mergeBlockNodes(leftNodeId, rightNodeId);
  }

  /**
   * 텍스트 범위를 지정된 위치에서 분할
   */
  splitTextRange(nodeId: string, startPosition: number, endPosition: number): string {
    return this.splitMerge.splitTextRange(nodeId, startPosition, endPosition);
  }

  /**
   * 인접한 텍스트 노드들을 자동으로 병합
   */
  autoMergeTextNodes(nodeId: string): string {
    return this.splitMerge.autoMergeTextNodes(nodeId);
  }

  /**
   * 텍스트 범위를 삭제합니다 (createRangeIterator 활용)
   * @param contentRange 삭제할 내용 범위
   * @returns 삭제된 텍스트
   */
  deleteText(contentRange: ModelSelection): string {
    return this.range.deleteText(contentRange);
  }

  /**
   * 텍스트 범위를 추출합니다 (삭제하지 않고) (createRangeIterator 활용)
   * @param contentRange 추출할 내용 범위
   * @returns 추출된 텍스트
   */
  extractText(contentRange: ModelSelection): string {
    return this.range.extractText(contentRange);
  }

  /**
   * 텍스트 범위를 복사합니다 (extractText와 동일하지만 의미상 구분)
   * @param contentRange 복사할 내용 범위
   * @returns 복사된 텍스트
   */
  copyText(contentRange: ModelSelection): string { return this.range.copyText(contentRange); }

  /**
   * 텍스트 범위를 이동합니다 (삭제 후 삽입)
   * @param fromRange 이동할 텍스트 범위
   * @param toRange 이동할 대상 위치 (같은 위치 범위)
   * @returns 이동된 텍스트
   */
  moveText(fromRange: ModelSelection, toRange: ModelSelection): string { return this.range.moveText(fromRange, toRange); }

  /**
   * 텍스트 범위를 복제합니다 (같은 위치에 중복 삽입)
   * @param contentRange 복제할 내용 범위
   * @returns 복제된 텍스트
   */
  duplicateText(contentRange: ModelSelection): string { return this.range.duplicateText(contentRange); }

  /**
   * 텍스트 범위에 마크를 적용합니다 (createRangeIterator 활용)
   * @param contentRange 마크를 적용할 내용 범위
   * @param mark 적용할 마크
   * @returns 적용된 마크
   */
  applyMark(contentRange: ModelSelection, mark: IMark): IMark { return this.range.applyMark(contentRange, mark); }

  

  /**
   * 마크 토글: 해당 범위에 동일 타입 마크가 완전히 덮여있으면 제거, 아니면 적용
   */
  toggleMark(contentRange: ModelSelection, markType: string, attrs?: Record<string, any>): void { return this.range.toggleMark(contentRange, markType, attrs); }

  /**
   * 범위를 벗어나는 마크를 클램프합니다 (경계를 넘어간 range를 잘라냄)
   */
  constrainMarksToRange(contentRange: ModelSelection): number { return this.range.constrainMarksToRange(contentRange); }

  /**
   * 텍스트 범위에서 특정 마크를 제거합니다 (createRangeIterator 활용)
   * @param contentRange 마크를 제거할 내용 범위
   * @param markType 제거할 마크 타입
   * @returns 제거된 마크 개수
   */
  removeMark(contentRange: ModelSelection, markType: string): number { return this.range.removeMark(contentRange, markType); }

  

  /**
   * 텍스트 범위에서 모든 포맷팅을 제거합니다 (createRangeIterator 활용)
   * @param contentRange 포맷팅을 제거할 내용 범위
   * @returns 제거된 마크 개수
   */
  clearFormatting(contentRange: ModelSelection): number { return this.range.clearFormatting(contentRange); }

  /**
   * 들여쓰기 추가: 각 라인 앞에 indent를 붙입니다
   */
  indent(contentRange: ModelSelection, indent: string = '  '): string { return this.range.indent(contentRange, indent); }

  /**
   * 들여쓰기 제거: 각 라인 앞의 indent를 제거합니다 (있을 때만)
   */
  outdent(contentRange: ModelSelection, indent: string = '  '): string { return this.range.outdent(contentRange, indent); }

  /**
   * 노드를 구조적으로 들여쓰기 합니다 (이전 형제의 자식으로 이동).
   *
   * @param nodeId 들여쓰기할 노드 ID
   * @returns 실제로 구조 변경이 일어났으면 true, 아니면 false
   */
  indentNode(nodeId: string): boolean {
    return (this.utility as any).indentNode(nodeId);
  }

  /**
   * 노드를 한 단계 outdent 합니다 (부모의 부모 아래로 이동).
   *
   * @param nodeId outdent 할 노드 ID
   * @returns 실제로 구조 변경이 일어났으면 true, 아니면 false
   */
  outdentNode(nodeId: string): boolean {
    return (this.utility as any).outdentNode(nodeId);
  }

  

  /**
   * 텍스트 범위 내에서 텍스트를 검색합니다 (createRangeIterator 활용)
   * @param contentRange 검색할 내용 범위
   * @param searchText 검색할 텍스트
   * @returns 검색된 텍스트의 첫 번째 위치 (없으면 -1)
   */
  findText(contentRange: ModelSelection, searchText: string): number { return this.range.findText(contentRange, searchText); }

  /**
   * 특정 노드에서 텍스트 검색 (헬퍼 메서드)
   */
  

  /**
   * 텍스트 범위 내의 텍스트 길이를 반환합니다 (createRangeIterator 활용)
   * @param contentRange 길이를 계산할 내용 범위
   * @returns 텍스트 길이
   */
  getTextLength(contentRange: ModelSelection): number { return this.range.getTextLength(contentRange); }

  /**
   * 특정 노드에서 텍스트 길이 계산 (헬퍼 메서드)
   */
  

  /**
   * 텍스트 범위에서 앞뒤 공백을 제거합니다 (createRangeIterator 활용)
   * @param contentRange 공백을 제거할 내용 범위
   * @returns 제거된 공백의 길이
   */
  trimText(contentRange: ModelSelection): number { return this.range.trimText(contentRange); }

  /**
   * 텍스트 범위에서 공백을 정규화합니다 (연속 공백을 하나로) (createRangeIterator 활용)
   * @param contentRange 공백을 정규화할 내용 범위
   * @returns 정규화된 텍스트
   */
  normalizeWhitespace(contentRange: ModelSelection): string { return this.range.normalizeWhitespace(contentRange); }

  /**
   * 범위 텍스트를 prefix/suffix로 감쌉니다
   */
  wrap(contentRange: ModelSelection, prefix: string, suffix: string): string { return this.range.wrap(contentRange, prefix, suffix); }

  /**
   * 범위 텍스트에서 지정된 prefix/suffix를 제거합니다 (있을 때만)
   */
  unwrap(contentRange: ModelSelection, prefix: string, suffix: string): string { return this.range.unwrap(contentRange, prefix, suffix); }

  /**
   * 정규식/문자열 패턴으로 범위 내 텍스트를 치환합니다
   */
  replace(contentRange: ModelSelection, pattern: string | RegExp, replacement: string): number { return this.range.replace(contentRange, pattern, replacement); }

  /**
   * 범위 내에서 패턴과 일치하는 모든 구간을 반환합니다
   */
  findAll(contentRange: ModelSelection, pattern: string | RegExp): Array<{ start: number; end: number }> { return this.range.findAll(contentRange, pattern); }

  /**
   * 범위를 단어 경계로 확장합니다 (간단한 공백 기반 단어 기준)
   */
  expandToWord(contentRange: ModelSelection): ModelSelection { return this.range.expandToWord(contentRange) as ModelSelection; }

  /**
   * 범위를 라인 경계로 확장합니다 (개행 기준)
   */
  expandToLine(contentRange: ModelSelection): ModelSelection { return this.range.expandToLine(contentRange) as ModelSelection; }

  /**
   * 범위를 정규화합니다: 잘못된 순서/경계 보정
   */
  normalizeRange(contentRange: ModelSelection): ModelSelection { return this.range.normalizeRange(contentRange) as ModelSelection; }

  /**
   * 텍스트 범위에 텍스트를 삽입합니다 (createRangeIterator 활용)
   * @param contentRange 삽입할 위치 (같은 위치 범위)
   * @param text 삽입할 텍스트
   * @returns 삽입된 텍스트
   */
  insertText(contentRange: ModelSelection, text: string): string {
    return this.range.insertText(contentRange, text);
  }

  

  /**
   * 텍스트 범위를 새로운 텍스트로 교체합니다 (createRangeIterator 활용)
   * @param contentRange 교체할 내용 범위
   * @param newText 새로운 텍스트
   * @returns 교체된 텍스트
   */
  replaceText(contentRange: ModelSelection, newText: string): string {
    return this.range.replaceText(contentRange, newText);
  }

  /**
   * 노드의 마크를 정규화합니다.
   */
  normalizeMarks(nodeId: string): void {
    this.marks.normalizeMarks(nodeId);
  }

  /**
   * 모든 노드의 마크를 정규화합니다.
   */
  normalizeAllMarks(): number {
    return this.marks.normalizeAllMarks();
  }

  /**
   * 마크 통계를 반환합니다.
   */
  getMarkStatistics(nodeId: string): {
    totalMarks: number;
    markTypes: Record<string, number>;
    overlappingMarks: number;
    emptyMarks: number;
  } {
    return this.marks.getMarkStatistics(nodeId);
  }

  /**
   * 마크 정리 (빈 마크 제거)
   */
  removeEmptyMarks(nodeId: string): number {
    return this.marks.removeEmptyMarks(nodeId);
  }

  // ========================================
  // Document Order Operations - operations related to document order
  // ========================================

  /**
   * 두 노드의 문서 순서를 비교합니다.
   */
  compareDocumentOrder(nodeId1: string, nodeId2: string): number {
    return this.utility.compareDocumentOrder(nodeId1, nodeId2);
  }

  /**
   * 주어진 노드의 다음 노드를 문서 순서대로 찾습니다.
   */
  getNextNode(nodeId: string): string | null {
    return this.utility.getNextNode(nodeId);
  }

  /**
   * 주어진 노드의 이전 노드를 문서 순서대로 찾습니다.
   */
  getPreviousNode(nodeId: string): string | null {
    return this.utility.getPreviousNode(nodeId);
  }

  /**
   * 노드가 편집 가능한 노드인지 확인합니다.
   * 
   * 편집 가능한 노드:
   * - 텍스트 노드 (.text 필드가 있음)
   * - inline 노드 (group === 'inline')
   * - editable block 노드 (group === 'block' && editable === true && .text 필드 있음)
   * 
   * @param nodeId 노드 ID
   * @returns 편집 가능 여부
   */
  isEditableNode(nodeId: string): boolean {
    return this.utility.isEditableNode(nodeId);
  }

  /**
   * 노드가 indent 대상이 될 수 있는지 확인합니다.
   *
   * @param nodeId 노드 ID
   * @returns indentable 여부
   */
  isIndentableNode(nodeId: string): boolean {
    return this.utility.isIndentableNode(nodeId);
  }

  /**
   * 노드에 대한 indent 관련 메타데이터를 반환합니다.
   *
   * @param nodeId 노드 ID
   * @returns indentable, indentGroup, indentParentTypes, maxIndentLevel 정보를 포함한 객체 또는 null
   */
  getIndentMetadata(nodeId: string): {
    indentable: boolean;
    indentGroup?: string;
    indentParentTypes?: string[];
    maxIndentLevel?: number;
  } | null {
    return this.utility.getIndentMetadata(nodeId);
  }

  /**
   * 문서 순서상 이전 편집 가능한 노드를 찾습니다.
   * 
   * Backspace, 화살표 키 등에서 사용: block 노드는 건너뛰고 inline/텍스트 노드만 반환
   */
  getPreviousEditableNode(nodeId: string): string | null {
    return this.utility.getPreviousEditableNode(nodeId);
  }

  /**
   * 문서 순서상 다음 편집 가능한 노드를 찾습니다.
   * 
   * Delete, 화살표 키 등에서 사용: block 노드는 건너뛰고 inline/텍스트 노드만 반환
   */
  getNextEditableNode(nodeId: string): string | null {
    return this.utility.getNextEditableNode(nodeId);
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
  getDropBehavior(
    targetNodeId: string,
    sourceNodeId: string,
    context?: { modifiers?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean }; position?: number; dropZone?: 'before' | 'after' | 'inside'; sourceOrigin?: 'internal' | 'external' }
  ): 'move' | 'copy' | 'merge' | 'transform' | 'wrap' | 'replace' | 'insert' {
    return this.utility.getDropBehavior(targetNodeId, sourceNodeId, context);
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
    return this.utility.getEditableNodes(options);
  }

  /**
   * 노드 ID 배열에서 편집 가능한 노드만 필터링합니다.
   * 
   * @param nodeIds 노드 ID 배열
   * @returns 편집 가능한 노드 ID 배열
   */
  filterEditableNodes(nodeIds: string[]): string[] {
    return this.utility.filterEditableNodes(nodeIds);
  }

  /**
   * 노드가 선택 가능한 노드인지 확인합니다.
   * 
   * 선택 가능한 노드:
   * - Block 노드: paragraph, heading, table 등 (기본적으로 선택 가능)
   * - Inline 노드: inline-image, inline-link 등 (기본적으로 선택 가능)
   * - Editable Node: 텍스트 노드, editable block 등 (기본적으로 선택 가능)
   * 
   * 선택 불가능한 노드:
   * - Document 노드 (group === 'document')
   * - selectable: false로 명시된 노드
   * 
   * @param nodeId 노드 ID
   * @returns 선택 가능 여부
   */
  isSelectableNode(nodeId: string): boolean {
    return this.utility.isSelectableNode(nodeId);
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
    return this.utility.getSelectableNodes(options);
  }

  /**
   * 노드 ID 배열에서 선택 가능한 노드만 필터링합니다.
   * 
   * @param nodeIds 노드 ID 배열
   * @returns 선택 가능한 노드 ID 배열
   */
  filterSelectableNodes(nodeIds: string[]): string[] {
    return this.utility.filterSelectableNodes(nodeIds);
  }

  /**
   * 노드가 드래그 가능한 노드인지 확인합니다.
   * 
   * @param nodeId 노드 ID
   * @returns 드래그 가능 여부
   */
  isDraggableNode(nodeId: string): boolean {
    return this.utility.isDraggableNode(nodeId);
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
    return this.utility.getDraggableNodes(options);
  }

  /**
   * 노드 ID 배열에서 드래그 가능한 노드만 필터링합니다.
   * 
   * @param nodeIds 노드 ID 배열
   * @returns 드래그 가능한 노드 ID 배열
   */
  filterDraggableNodes(nodeIds: string[]): string[] {
    return this.utility.filterDraggableNodes(nodeIds);
  }

  /**
   * 노드가 드롭 가능한 노드인지 확인합니다 (드롭 타겟이 될 수 있는지).
   * 
   * @param nodeId 노드 ID
   * @returns 드롭 가능 여부
   */
  isDroppableNode(nodeId: string): boolean {
    return this.utility.isDroppableNode(nodeId);
  }

  /**
   * 특정 노드를 드롭 타겟 노드에 드롭할 수 있는지 확인합니다.
   * 
   * @param targetNodeId 드롭 타겟 노드 ID
   * @param draggedNodeId 드래그되는 노드 ID
   * @returns 드롭 가능 여부
   */
  canDropNode(targetNodeId: string, draggedNodeId: string): boolean {
    return this.utility.canDropNode(targetNodeId, draggedNodeId);
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
    return this.utility.getDroppableNodes(options);
  }

  /**
   * 노드 ID 배열에서 드롭 가능한 노드만 필터링합니다.
   * 
   * @param nodeIds 노드 ID 배열
   * @returns 드롭 가능한 노드 ID 배열
   */
  filterDroppableNodes(nodeIds: string[]): string[] {
    return this.utility.filterDroppableNodes(nodeIds);
  }


  /**
   * 문서 순회를 위한 Iterator를 생성합니다.
   */
  createDocumentIterator(options?: any): any {
    return this.utility.createDocumentIterator(options);
  }

  /**
   * 특정 범위 내에서만 순회하는 Iterator를 생성합니다.
   */
  createRangeIterator(startNodeId: string, endNodeId: string, options?: {
    includeStart?: boolean;
    includeEnd?: boolean;
    filter?: any;
    customFilter?: (nodeId: string, node: any) => boolean;
  }): any {
    return this.utility.createDocumentIterator({
      ...options,
      range: {
        startNodeId,
        endNodeId,
        includeStart: options?.includeStart ?? true,
        includeEnd: options?.includeEnd ?? true
      }
    });
  }

  /**
   * 범위 내의 모든 노드를 반환합니다.
   */
  getNodesInRange(startNodeId: string, endNodeId: string, options?: {
    includeStart?: boolean;
    includeEnd?: boolean;
    filter?: any;
  }): string[] {
    const iterator = this.createRangeIterator(startNodeId, endNodeId, options);
    return iterator.getNodesInRange();
  }

  /**
   * 범위 내의 노드 개수를 반환합니다.
   */
  getRangeNodeCount(startNodeId: string, endNodeId: string, options?: {
    includeStart?: boolean;
    includeEnd?: boolean;
    filter?: any;
  }): number {
    const iterator = this.createRangeIterator(startNodeId, endNodeId, options);
    return iterator.getRangeNodeCount();
  }

  // ===== Global lock and queue management =====

  /**
   * Generates a lock ID.
   */
  private _generateLockId(): string {
    return `lock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Acquires a global lock.
   * If lock is in use, adds to queue and waits in order.
   * @param ownerId Lock owner ID (transaction ID or user ID)
   * @returns Lock ID
   */
  async acquireLock(ownerId: string = 'unknown'): Promise<string> {
    const startTime = Date.now();
    const lockId = this._generateLockId();
    
    return new Promise((resolve, reject) => {
      if (!this._currentLock) {
        // Acquire immediately if lock is empty
        this._currentLock = {
          lockId,
          ownerId,
          acquiredAt: Date.now(),
          timeoutId: setTimeout(() => {
            // Lock timeout (emergency release)
            this._forceReleaseLock();
          }, this._lockTimeout * 10) // Lock's own timeout (50 seconds)
        };
        this._lockStats.totalAcquisitions++;
        resolve(lockId);
        return;
      }
      
      // Add to queue if lock is in use
      const queueItem = {
        lockId,
        ownerId,
        resolve: () => {
          const waitTime = Date.now() - startTime;
          this._lockStats.averageWaitTime = 
            (this._lockStats.averageWaitTime * (this._lockStats.totalAcquisitions - 1) + waitTime) / 
            this._lockStats.totalAcquisitions;
          this._lockStats.totalAcquisitions++;
          resolve(lockId);
        },
        timeoutId: setTimeout(() => {
          const index = this._transactionQueue.findIndex(item => item.lockId === lockId);
          if (index !== -1) {
            this._transactionQueue.splice(index, 1);
            this._lockStats.totalTimeouts++;
            reject(new Error(`Lock acquisition timeout after ${this._lockTimeout}ms for owner ${ownerId}`));
          }
        }, this._lockTimeout)
      };
      
      this._transactionQueue.push(queueItem);
    });
  }

  /**
   * Releases a global lock.
   * Passes lock to next transaction waiting in queue.
   * @param lockId Lock ID to release (optional, for validation)
   */
  releaseLock(lockId?: string): void {
    if (!this._currentLock) {
      // Ignore if no lock
      return;
    }
    
    // Validate lock ID
    if (lockId && this._currentLock.lockId !== lockId) {
      throw new Error(`Lock ID mismatch: expected ${this._currentLock.lockId}, got ${lockId}`);
    }
    
    // Cancel current lock timeout
    clearTimeout(this._currentLock.timeoutId);
    
    // Release lock
    this._currentLock = null;
    this._lockStats.totalReleases++;
    
    // Pass lock to next transaction
    const next = this._transactionQueue.shift();
    if (next) {
      // Cancel timeout
      clearTimeout(next.timeoutId);
      // Pass lock to next transaction
      this._currentLock = {
        lockId: next.lockId,
        ownerId: next.ownerId,
        acquiredAt: Date.now(),
        timeoutId: setTimeout(() => {
          this._forceReleaseLock();
        }, this._lockTimeout * 10)
      };
      next.resolve();
    }
  }

  /**
   * 락을 강제로 해제합니다 (긴급 상황용)
   */
  private _forceReleaseLock(): void {
    if (this._currentLock) {
      console.warn(`Force releasing lock ${this._currentLock.lockId} owned by ${this._currentLock.ownerId}`);
      clearTimeout(this._currentLock.timeoutId);
      this._currentLock = null;
      this._lockStats.totalReleases++;
    }
  }

  /**
   * 락이 현재 사용 중인지 확인합니다.
   */
  isLocked(): boolean {
    return this._currentLock !== null;
  }

  /**
   * 현재 락 정보를 반환합니다.
   */
  getCurrentLock(): {
    lockId: string;
    ownerId: string;
    acquiredAt: number;
  } | null {
    if (!this._currentLock) return null;
    return {
      lockId: this._currentLock.lockId,
      ownerId: this._currentLock.ownerId,
      acquiredAt: this._currentLock.acquiredAt
    };
  }

  /**
   * 대기 중인 트랜잭션 수를 반환합니다.
   */
  getQueueLength(): number {
    return this._transactionQueue.length;
  }

  /**
   * 대기 중인 트랜잭션 목록을 반환합니다.
   */
  getQueueInfo(): Array<{
    lockId: string;
    ownerId: string;
    waitTime: number;
  }> {
    const now = Date.now();
    return this._transactionQueue.map(item => ({
      lockId: item.lockId,
      ownerId: item.ownerId,
      waitTime: now - (item as any).startTime || 0
    }));
  }

  /**
   * 락 통계 정보를 반환합니다.
   */
  getLockStats(): {
    totalAcquisitions: number;
    totalReleases: number;
    totalTimeouts: number;
    averageWaitTime: number;
    queueLength: number;
    isLocked: boolean;
    currentLock: {
      lockId: string;
      ownerId: string;
      acquiredAt: number;
    } | null;
    queue: Array<{
      lockId: string;
      ownerId: string;
      waitTime: number;
    }>;
  } {
    return {
      ...this._lockStats,
      queueLength: this._transactionQueue.length,
      isLocked: this._currentLock !== null,
      currentLock: this.getCurrentLock(),
      queue: this.getQueueInfo()
    };
  }

  /**
   * 락 타임아웃을 설정합니다.
   */
  setLockTimeout(timeout: number): void {
    this._lockTimeout = timeout;
  }

  /**
   * 락 통계를 초기화합니다.
   */
  resetLockStats(): void {
    this._lockStats = {
      totalAcquisitions: 0,
      totalReleases: 0,
      totalTimeouts: 0,
      averageWaitTime: 0
    };
  }

  /**
   * Visitor 패턴을 사용하여 문서를 순회합니다.
   * 
   * @param visitors 방문자 객체들 (가변 인자)
   * @param options 순회 옵션
   * @returns 순회 결과 정보
   * 
   * @example
   * ```typescript
   * // Single visitor
   * const result = dataStore.traverse(visitor);
   * 
   * // Multiple visitors (variadic arguments)
   * const results = dataStore.traverse(visitor1, visitor2, visitor3);
   * 
   * // Also possible with array
   * const results2 = dataStore.traverse([visitor1, visitor2]);
   * ```
   */
  /**
   * Visitor 패턴을 사용하여 문서를 순회합니다.
   * 오버로드:
   * - traverse(visitor, options?) => 단일 결과
   * - traverse([visitor1, visitor2, ...], options?) => 각 visitor의 결과 배열
   * - traverse(visitor1, visitor2, ...) => 각 visitor의 결과 배열
   */
  traverse(visitor: DocumentVisitor, options?: VisitorTraversalOptions): { visitedCount: number; skippedCount: number; stopped: boolean };
  traverse(visitors: DocumentVisitor[], options?: VisitorTraversalOptions): Array<{ visitor: DocumentVisitor; result: { visitedCount: number; skippedCount: number; stopped: boolean } }>;
  traverse(...visitors: DocumentVisitor[]): Array<{ visitor: DocumentVisitor; result: { visitedCount: number; skippedCount: number; stopped: boolean } }>;
  traverse(
    ...args: [DocumentVisitor, VisitorTraversalOptions?]
      | [DocumentVisitor[] , VisitorTraversalOptions?]
      | DocumentVisitor[]
  ): any {
    return (this.utility as any).traverse(...(args as any));
  }


}


