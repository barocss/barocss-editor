# DataSnapshot Structure Specification

## 1. 개요

DataSnapshot은 Barocss Transaction 시스템의 핵심 구성 요소로, Immutable State 패턴을 구현하는 핵심 클래스입니다. DataStore의 현재 상태를 깊은 복사하여 격리된 작업 공간을 제공하며, Transaction의 원자성을 보장합니다.

## 2. 핵심 개념

### 2.1 Immutable State Pattern
- **원리**: 원본 데이터를 직접 수정하지 않고 스냅샷을 생성하여 작업
- **장점**: 안전한 롤백, 동시성 제어, 예측 가능한 동작
- **구현**: 깊은 복사를 통한 완전한 격리

### 2.2 스냅샷 격리
- **격리**: 원본 DataStore와 완전히 분리된 작업 공간
- **독립성**: 스냅샷에서의 변경이 원본에 영향을 주지 않음
- **원자성**: 모든 작업이 성공하거나 모두 실패

### 2.3 변경사항 추적
- **추적**: 스냅샷에서 수행된 모든 변경사항 추적
- **검증**: 각 변경사항의 유효성 검사
- **커밋**: 성공 시에만 원본에 반영

## 3. 아키텍처

### 3.1 핵심 구성 요소

```
DataStoreSnapshot
├── _nodes: Map<string, INode>
├── _documents: Map<string, Document>
├── _rootNodeId: string | undefined
├── _version: number
├── _originalStore: DataStore
└── _changes: ChangeRecord[]

ChangeRecord
├── type: 'create' | 'update' | 'delete'
├── nodeId: string
├── oldData?: INode
├── newData?: INode
└── timestamp: Date
```

### 3.2 데이터 흐름

```
1. DataStoreSnapshot 생성
   ↓
2. 원본 DataStore 깊은 복사
   ↓
3. Operation 적용
   ↓
4. Validation 수행
   ↓
5. 성공 시: 원본에 반영
   실패 시: 스냅샷 폐기
```

## 4. DataStoreSnapshot 클래스

### 4.1 기본 구조

```typescript
class DataStoreSnapshot {
  private _nodes: Map<string, INode> = new Map();
  private _documents: Map<string, Document> = new Map();
  private _rootNodeId: string | undefined;
  private _version: number;
  private _originalStore: DataStore;
  private _changes: ChangeRecord[] = [];

  constructor(originalStore: DataStore) {
    this._originalStore = originalStore;
    this._version = originalStore.getVersion();
    this._rootNodeId = originalStore.getRootNodeId();
    
    // 원본 DataStore의 모든 노드 복사
    this._copyNodesFromOriginal();
    
    // 원본 DataStore의 모든 문서 복사
    this._copyDocumentsFromOriginal();
  }
}
```

### 4.2 스냅샷 생성

```typescript
// 원본 DataStore에서 노드 복사
private _copyNodesFromOriginal(): void {
  const originalNodes = this._originalStore.getAllNodesMap();
  for (const [id, node] of originalNodes) {
    this._nodes.set(id, this._deepCloneNode(node));
  }
}

// 원본 DataStore에서 문서 복사
private _copyDocumentsFromOriginal(): void {
  const originalDocuments = this._originalStore.getAllDocuments();
  for (const doc of originalDocuments) {
    this._documents.set(doc.sid!, this._deepCloneDocument(doc));
  }
}

// 노드 깊은 복사
private _deepCloneNode(node: INode): INode {
  const cloned = JSON.parse(JSON.stringify(node));
  
  // Date 필드들을 Date 객체로 복원
  if (cloned.createdAt) {
    cloned.createdAt = new Date(cloned.createdAt);
  }
  if (cloned.updatedAt) {
    cloned.updatedAt = new Date(cloned.updatedAt);
  }
  
  return cloned;
}

// 문서 깊은 복사
private _deepCloneDocument(document: Document): Document {
  const cloned = JSON.parse(JSON.stringify(document));
  
  // Date 필드들을 Date 객체로 복원
  if (cloned.createdAt) {
    cloned.createdAt = new Date(cloned.createdAt);
  }
  if (cloned.updatedAt) {
    cloned.updatedAt = new Date(cloned.updatedAt);
  }
  
  return cloned;
}
```

## 5. Operation 적용

### 5.1 Operation 실행

```typescript
// Operation 적용
applyOperation(operation: TransactionOperation): ValidationResult | null {
  try {
    switch (operation.type) {
      case 'create':
        return this._createNode(operation.data as INode);
      case 'update':
        return this._updateNode(operation.nodeId!, operation.data as Partial<INode>);
      case 'delete':
        return this._deleteNode(operation.nodeId!);
      case 'createDocument':
        return this._createDocument(operation.data as Document);
      case 'updateDocument':
        return this._updateDocument(operation.documentId!, operation.data as Partial<Document>);
      case 'deleteDocument':
        return this._deleteDocument(operation.documentId!);
      default:
        return { valid: false, errors: [`Unknown operation type: ${operation.type}`] };
    }
  } catch (error) {
    return {
      valid: false,
      errors: [`Operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}
```

### 5.2 노드 작업

#### 5.2.1 노드 생성

```typescript
private _createNode(node: INode): ValidationResult | null {
  // 노드 ID 중복 검사
  if (this._nodes.has(node.sid)) {
    return { valid: false, errors: [`Node with id '${node.sid}' already exists`] };
  }
  
  // 노드 검증
  const validation = IntegrityValidator.validateNode(node);
  if (!validation.valid) {
    return validation;
  }
  
  // 노드 저장
  this._nodes.set(node.sid, this._deepCloneNode(node));
  
  // 변경사항 기록
  this._recordChange('create', node.sid, undefined, node);
  
  return null; // 성공
}
```

#### 5.2.2 노드 업데이트

```typescript
private _updateNode(nodeId: string, updates: Partial<INode>): ValidationResult | null {
  const existingNode = this._nodes.get(nodeId);
  if (!existingNode) {
    return { valid: false, errors: [`Node with id '${nodeId}' not found`] };
  }
  
  // 업데이트된 노드 생성
  const updatedNode = { ...existingNode, ...updates, updatedAt: new Date() };
  
  // 노드 검증
  const validation = IntegrityValidator.validateNode(updatedNode);
  if (!validation.valid) {
    return validation;
  }
  
  // 노드 업데이트
  this._nodes.set(nodeId, updatedNode);
  
  // 변경사항 기록
  this._recordChange('update', nodeId, existingNode, updatedNode);
  
  return null; // 성공
}
```

#### 5.2.3 노드 삭제

```typescript
private _deleteNode(nodeId: string): ValidationResult | null {
  const existingNode = this._nodes.get(nodeId);
  if (!existingNode) {
    return { valid: false, errors: [`Node with id '${nodeId}' not found`] };
  }
  
  // 노드 삭제
  this._nodes.delete(nodeId);
  
  // 변경사항 기록
  this._recordChange('delete', nodeId, existingNode, undefined);
  
  return null; // 성공
}
```

### 5.3 문서 작업

#### 5.3.1 문서 생성

```typescript
private _createDocument(document: Document): ValidationResult | null {
  // 문서 ID 중복 검사
  if (this._documents.has(document.sid)) {
    return { valid: false, errors: [`Document with id '${document.sid}' already exists`] };
  }
  
  // 문서 검증
  const validation = IntegrityValidator.validateDocument(document);
  if (!validation.valid) {
    return validation;
  }
  
  // 문서를 루트 노드로 처리
  if (document.sid && !this._nodes.has(document.sid)) {
    // content가 INode[]인 경우 처리
    let contentIds: string[] = [];
    if (document.content && Array.isArray(document.content)) {
      // 각 노드를 저장하고 ID를 수집
      for (const node of document.content) {
        this._nodes.set(node.sid, this._deepCloneNode(node));
        contentIds.push(node.sid);
      }
    } else if (document.contentIds) {
      contentIds = document.contentIds;
    }

    const rootNode: INode = {
      id: document.sid,
      type: 'document',
      content: contentIds,
      attributes: {
        ...document.attributes,
        schema: document.schema || {}
      },
      metadata: document.metadata || {},
      version: document.version || 1,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this._nodes.set(document.sid, rootNode);
    this._rootNodeId = document.sid;
  }
  
  // 문서 저장
  this._documents.set(document.sid, this._deepCloneDocument(document));
  
  return null; // 성공
}
```

#### 5.3.2 문서 업데이트

```typescript
private _updateDocument(documentId: string, updates: Partial<Document>): ValidationResult | null {
  const rootNode = this._nodes.get(documentId);
  if (!rootNode) {
    return { valid: false, errors: [`Document with id '${documentId}' not found`] };
  }

  // content 업데이트 처리
  if (updates.content && Array.isArray(updates.content)) {
    // 기존 content 노드들을 삭제 (선택적)
    if (rootNode.content) {
      for (const childId of rootNode.content) {
        this._nodes.delete(childId);
      }
    }

    // Document.content는 INode[]이므로 각 노드를 저장하고 ID를 contentIds로 변환
    const contentIds: string[] = [];
    for (const node of updates.content) {
      // 노드를 저장
      this._nodes.set(node.sid, this._deepCloneNode(node));
      contentIds.push(node.sid);
    }
    updates.content = contentIds; // content를 ID 배열로 설정
  }

  const updatedNode = { ...rootNode, ...updates, updatedAt: new Date() };
  this._nodes.set(documentId, updatedNode);
  
  return null; // 성공
}
```

#### 5.3.3 문서 삭제

```typescript
private _deleteDocument(documentId: string): ValidationResult | null {
  const rootNode = this._nodes.get(documentId);
  if (!rootNode) {
    return { valid: false, errors: [`Document with id '${documentId}' not found`] };
  }
  
  // 문서 삭제
  this._nodes.delete(documentId);
  this._documents.delete(documentId);
  
  // 루트 노드 ID 초기화
  if (this._rootNodeId === documentId) {
    this._rootNodeId = undefined;
  }
  
  return null; // 성공
}
```

## 6. 변경사항 추적

### 6.1 ChangeRecord 인터페이스

```typescript
interface ChangeRecord {
  type: 'create' | 'update' | 'delete';
  nodeId: string;
  oldData?: INode;
  newData?: INode;
  timestamp: Date;
}
```

### 6.2 변경사항 기록

```typescript
private _recordChange(
  type: 'create' | 'update' | 'delete',
  nodeId: string,
  oldData?: INode,
  newData?: INode
): void {
  this._changes.push({
    type,
    nodeId,
    oldData: oldData ? this._deepCloneNode(oldData) : undefined,
    newData: newData ? this._deepCloneNode(newData) : undefined,
    timestamp: new Date()
  });
}
```

### 6.3 변경사항 조회

```typescript
// 모든 변경사항 조회
getChanges(): ChangeRecord[] {
  return [...this._changes];
}

// 특정 노드의 변경사항 조회
getNodeChanges(nodeId: string): ChangeRecord[] {
  return this._changes.filter(change => change.nodeId === nodeId);
}

// 변경사항 통계
getChangeStats(): { total: number; byType: Record<string, number> } {
  const byType: Record<string, number> = {};
  
  for (const change of this._changes) {
    byType[change.type] = (byType[change.type] || 0) + 1;
  }
  
  return {
    total: this._changes.length,
    byType
  };
}
```

## 7. 원본 DataStore 복원

### 7.1 복원 메서드

```typescript
// 원본 DataStore에 복원
restoreTo(store: DataStore): void {
  // 기존 DataStore 초기화
  store.clear();
  
  // 스냅샷의 노드들로 복원
  for (const [id, node] of this._nodes) {
    store.setNode(node);
  }
  
  // 스냅샷의 문서들로 복원
  for (const [id, doc] of this._documents) {
    store.saveDocument(doc, false); // 검증 건너뛰기
  }
  
  // 루트 노드 ID 설정
  if (this._rootNodeId) {
    store.setRootNodeId(this._rootNodeId);
  }
  
  // 버전 증가
  store.version = this._version + 1;
}
```

### 7.2 스냅샷 폐기

```typescript
// 스냅샷 폐기
discard(): void {
  this._nodes.clear();
  this._documents.clear();
  this._changes = [];
  this._rootNodeId = undefined;
  this._version = 0;
}
```

## 8. 검증 시스템

### 8.1 Validator 클래스 통합

DataSnapshot은 `@barocss/schema`의 `Validator` 클래스를 사용하여 포괄적인 검증을 수행합니다.

#### 구조적 검증

```typescript
import { Validator, VALIDATION_ERRORS } from '@barocss/schema';

// 노드 구조 검증
const nodeValidation = Validator.validateNodeStructure(node);
if (!nodeValidation.valid) {
  console.error('Node structure validation failed:', nodeValidation.errorCodes);
}

// 문서 구조 검증
const documentValidation = Validator.validateDocumentStructure(document);
if (!documentValidation.valid) {
  console.error('Document structure validation failed:', documentValidation.errorCodes);
}
```

#### 스키마 기반 검증

```typescript
// 스키마가 있는 경우 스키마 기반 검증
if (schema) {
  const schemaValidation = Validator.validateNode(schema, node);
  if (!schemaValidation.valid) {
    console.error('Schema validation failed:', schemaValidation.errorCodes);
  }
}
```

#### 에러 코드 활용

```typescript
// 안전한 오류 처리
const result = Validator.validateNodeStructure(node);
if (!result.valid) {
  if (result.errorCodes?.includes(VALIDATION_ERRORS.TEXT_CONTENT_REQUIRED)) {
    // 텍스트 내용 누락 처리
  }
  if (result.errorCodes?.includes(VALIDATION_ERRORS.NODE_TYPE_UNKNOWN)) {
    // 알 수 없는 노드 타입 처리
  }
}
```

### 8.2 스냅샷 검증

```typescript
// 스냅샷 전체 검증
validateSnapshot(): ValidationResult {
  const errors: string[] = [];
  const errorCodes: string[] = [];
  
  // 모든 노드 검증
  for (const [id, node] of this._nodes) {
    // 1. 구조적 검증
    const structuralValidation = Validator.validateNodeStructure(node);
    if (!structuralValidation.valid) {
      errors.push(...structuralValidation.errors.map(err => `Node ${id}: ${err}`));
      if (structuralValidation.errorCodes) {
        errorCodes.push(...structuralValidation.errorCodes);
      }
    }
    
    // 2. 스키마 기반 검증 (스키마가 있는 경우)
    const schema = this.getSchema();
    if (schema) {
      const schemaValidation = Validator.validateNode(schema, node);
      if (!schemaValidation.valid) {
        errors.push(...schemaValidation.errors.map(err => `Node ${id}: ${err}`));
        if (schemaValidation.errorCodes) {
          errorCodes.push(...schemaValidation.errorCodes);
        }
      }
    }
  }
  
  // 모든 문서 검증
  for (const [id, doc] of this._documents) {
    // 1. 문서 구조 검증
    const documentValidation = Validator.validateDocumentStructure(doc);
    if (!documentValidation.valid) {
      errors.push(...documentValidation.errors.map(err => `Document ${id}: ${err}`));
      if (documentValidation.errorCodes) {
        errorCodes.push(...documentValidation.errorCodes);
      }
    }
    
    // 2. 스키마 기반 문서 검증 (스키마가 있는 경우)
    const schema = this.getSchema();
    if (schema) {
      const schemaDocumentValidation = Validator.validateDocument(schema, doc);
      if (!schemaDocumentValidation.valid) {
        errors.push(...schemaDocumentValidation.errors.map(err => `Document ${id}: ${err}`));
        if (schemaDocumentValidation.errorCodes) {
          errorCodes.push(...schemaDocumentValidation.errorCodes);
        }
      }
    }
  }
  
  // 참조 무결성 검증
  const referenceValidation = this._validateReferences();
  if (!referenceValidation.valid) {
    errors.push(...referenceValidation.errors);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
```

### 8.2 참조 무결성 검증

```typescript
private _validateReferences(): ValidationResult {
  const errors: string[] = [];
  
  for (const [id, node] of this._nodes) {
    // parentId 참조 검증
    if (node.parentId && !this._nodes.has(node.parentId)) {
      errors.push(`Node ${id} references non-existent parent ${node.parentId}`);
    }
    
    // content 참조 검증
    if (node.content) {
      for (const childId of node.content) {
        if (!this._nodes.has(childId)) {
          errors.push(`Node ${id} references non-existent child ${childId}`);
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
```

## 9. 성능 최적화

### 9.1 지연 복사

```typescript
class LazyDataStoreSnapshot extends DataStoreSnapshot {
  private _copiedNodes = new Set<string>();
  private _copiedDocuments = new Set<string>();

  constructor(originalStore: DataStore) {
    super(originalStore);
    // 초기에는 빈 상태로 시작
    this._nodes.clear();
    this._documents.clear();
  }

  // 노드 접근 시 지연 복사
  getNode(nodeId: string): INode | undefined {
    if (!this._copiedNodes.has(nodeId)) {
      const originalNode = this._originalStore.getNode(nodeId);
      if (originalNode) {
        this._nodes.set(nodeId, this._deepCloneNode(originalNode));
        this._copiedNodes.add(nodeId);
      }
    }
    
    return this._nodes.get(nodeId);
  }

  // 문서 접근 시 지연 복사
  getDocument(documentId: string): Document | undefined {
    if (!this._copiedDocuments.has(documentId)) {
      const originalDoc = this._originalStore.getDocument(documentId);
      if (originalDoc) {
        this._documents.set(documentId, this._deepCloneDocument(originalDoc));
        this._copiedDocuments.add(documentId);
      }
    }
    
    return this._documents.get(documentId);
  }
}
```

### 9.2 메모리 사용량 모니터링

```typescript
class MemoryOptimizedSnapshot extends DataStoreSnapshot {
  private _maxMemoryUsage: number = 100 * 1024 * 1024; // 100MB
  private _currentMemoryUsage: number = 0;

  // 메모리 사용량 체크
  checkMemoryUsage(): { current: number; max: number; percentage: number } {
    const percentage = (this._currentMemoryUsage / this._maxMemoryUsage) * 100;
    
    return {
      current: this._currentMemoryUsage,
      max: this._maxMemoryUsage,
      percentage
    };
  }

  // 메모리 사용량 업데이트
  private _updateMemoryUsage(): void {
    this._currentMemoryUsage = this._estimateMemoryUsage();
    
    if (this._currentMemoryUsage > this._maxMemoryUsage) {
      this._cleanupUnusedData();
    }
  }

  // 메모리 사용량 추정
  private _estimateMemoryUsage(): number {
    let totalSize = 0;
    
    for (const [id, node] of this._nodes) {
      totalSize += JSON.stringify(node).length;
    }
    
    for (const [id, doc] of this._documents) {
      totalSize += JSON.stringify(doc).length;
    }
    
    return totalSize;
  }

  // 사용되지 않는 데이터 정리
  private _cleanupUnusedData(): void {
    // 사용되지 않는 노드들 찾기
    const unusedNodes = this._findUnusedNodes();
    
    // 노드들 삭제
    for (const nodeId of unusedNodes) {
      this._nodes.delete(nodeId);
    }
    
    // 메모리 사용량 재계산
    this._updateMemoryUsage();
  }
}
## 12. 비용/지연 복제 노트(요약)

- 전체 복제 비용: O(N) 노드/문서 직렬화 비용. 대형 문서에서 초기 스냅샷 비용이 커질 수 있음.
- Lazy 복제 포인트: getNode/getDocument 접근 시점에 개별 복제. 초기 비용 감소, 접근 패턴에 따라 편차.
- 권장: 기본은 eager 스냅샷, 성능 이슈가 측정되면 LazyDataStoreSnapshot 전환 고려.
```

## 10. 테스트 전략

### 10.1 단위 테스트

```typescript
describe('DataStoreSnapshot Tests', () => {
  let dataStore: DataStore;
  let snapshot: DataStoreSnapshot;

  beforeEach(() => {
    dataStore = new DataStore('test-session');
    snapshot = new DataStoreSnapshot(dataStore);
  });

  describe('Snapshot Creation', () => {
    it('should create a snapshot with all nodes', () => {
      const node = createTestNode();
      dataStore.saveNode(node);
      
      const newSnapshot = new DataStoreSnapshot(dataStore);
      expect(newSnapshot.getNode(node.sid)).toBeDefined();
    });

    it('should create independent copies', () => {
      const node = createTestNode();
      dataStore.saveNode(node);
      
      const newSnapshot = new DataStoreSnapshot(dataStore);
      const snapshotNode = newSnapshot.getNode(node.sid);
      
      expect(snapshotNode).not.toBe(node); // 다른 객체
      expect(snapshotNode).toEqual(node); // 같은 내용
    });
  });

  describe('Operation Application', () => {
    it('should apply create operation', () => {
      const node = createTestNode();
      const operation: TransactionOperation = {
        type: 'create',
        nodeId: node.sid,
        data: node
      };
      
      const result = snapshot.applyOperation(operation);
      expect(result).toBeNull(); // 성공
      expect(snapshot.getNode(node.sid)).toBeDefined();
    });

    it('should apply update operation', () => {
      const node = createTestNode();
      dataStore.saveNode(node);
      const newSnapshot = new DataStoreSnapshot(dataStore);
      
      const operation: TransactionOperation = {
        type: 'update',
        nodeId: node.sid,
        data: { text: 'Updated' }
      };
      
      const result = newSnapshot.applyOperation(operation);
      expect(result).toBeNull(); // 성공
      expect(newSnapshot.getNode(node.sid)?.text).toBe('Updated');
    });
  });
});
```

### 10.2 통합 테스트

```typescript
describe('DataStoreSnapshot Integration Tests', () => {
  let dataStore: DataStore;
  let snapshot: DataStoreSnapshot;

  beforeEach(() => {
    dataStore = new DataStore('test-session');
    snapshot = new DataStoreSnapshot(dataStore);
  });

  it('should restore changes to original store', () => {
    const node = createTestNode();
    const operation: TransactionOperation = {
      type: 'create',
      nodeId: node.sid,
      data: node
    };
    
    // 스냅샷에 변경사항 적용
    snapshot.applyOperation(operation);
    
    // 원본에 복원
    snapshot.restoreTo(dataStore);
    
    // 원본에 변경사항이 반영되었는지 확인
    expect(dataStore.getNode(node.sid)).toBeDefined();
  });

  it('should maintain data integrity during complex operations', () => {
    const document = createComplexDocument();
    dataStore.saveDocument(document);
    
    const newSnapshot = new DataStoreSnapshot(dataStore);
    
    // 여러 작업 수행
    const operations = [
      { type: 'create', nodeId: 'node-1', data: createTestNode() },
      { type: 'update', nodeId: 'node-1', data: { text: 'Updated' } },
      { type: 'delete', nodeId: 'node-1' }
    ];
    
    for (const operation of operations) {
      const result = newSnapshot.applyOperation(operation);
      expect(result).toBeNull(); // 성공
    }
    
    // 데이터 무결성 확인
    const validation = newSnapshot.validateSnapshot();
    expect(validation.valid).toBe(true);
  });
});
```

## 11. 확장 계획

### 11.1 향후 추가 예정 기능

- **증분 스냅샷**: 변경된 부분만 추적하는 스냅샷
- **압축 스냅샷**: 메모리 사용량 최적화
- **분산 스냅샷**: 여러 DataStore 간 스냅샷
- **스냅샷 히스토리**: 스냅샷 버전 관리

### 11.2 고급 기능

- **스냅샷 병합**: 여러 스냅샷의 병합
- **스냅샷 분할**: 큰 스냅샷의 분할
- **스냅샷 압축**: 오래된 스냅샷의 압축
- **스냅샷 복제**: 스냅샷의 복제

---

이 스펙은 Barocss DataSnapshot 시스템의 현재 구현을 기반으로 작성되었으며, 향후 확장 계획과 개선사항을 포함하고 있습니다.

## 6. 업데이트 사항(최종 구현)
- 스냅샷은 기본 오퍼레이션(create/update/delete/createDocument/updateDocument/deleteDocument)만 직접 적용한다.
- 커스텀 Operation은 TransactionManager에서 실행 후 결과를 기본 오퍼레이션으로 번역하여 스냅샷에 적용한다.
- 무결성 위주의 검증을 수행하며, 루트 스키마가 있으면 최소한의 타입 검증을 보조적으로 수행한다.
- `restoreTo(DataStore)`로 원자 커밋, 실패 시 스냅샷 폐기.
