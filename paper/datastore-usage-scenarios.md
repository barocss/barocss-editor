# DataStore Usage Scenarios

## 1. 개요

이 문서는 DataStore를 사용하여 다양한 시나리오를 구현하는 방법을 보여줍니다. 각 시나리오는 실제 사용 사례를 기반으로 하며, 필요한 연산 클래스와 메서드를 명시합니다.

## 2. 기본 문서 편집

### 2.1 새 문서 생성

#### 시나리오: 빈 문서에서 시작하여 구조화된 문서 생성

```typescript
import { DataStore } from '@barocss/datastore';
import { Schema } from '@barocss/schema';

// 1. DataStore 초기화
const dataStore = new DataStore();
const schema = new Schema('document', {
  nodes: {
    document: { content: 'block+' },
    paragraph: { content: 'inline*' },
    'inline-text': { content: 'text*', marks: ['bold', 'italic'] }
  },
  marks: {
    bold: {},
    italic: {}
  }
});
dataStore.registerSchema(schema);

// 2. 문서 구조 생성
const document = {
  id: 'doc-1',
  type: 'document',
  content: [
    {
      id: 'para-1',
      type: 'paragraph',
      content: [
        {
          id: 'text-1',
          type: 'inline-text',
          text: 'Hello World',
          marks: [{ type: 'bold', range: [0, 5] }]
        }
      ]
    }
  ]
};

// 3. 중첩 구조를 DataStore에 저장
const createdDoc = dataStore.createNodeWithChildren(document, schema);
console.log('Document created:', createdDoc.sid);
```

**사용 연산 클래스**: `CoreOperations` (createNodeWithChildren)

### 2.2 텍스트 편집 (Range 기반)

#### 시나리오: 사용자가 텍스트를 입력하고 편집하는 과정

```typescript
const r = (s: number, e: number) => ({ startNodeId: 'text-1', startOffset: s, endNodeId: 'text-1', endOffset: e });

// 텍스트 삽입 (사용자가 " Beautiful"을 입력)
dataStore.insertText(r(5, 5), ' Beautiful');
// "Hello World" → "Hello Beautiful World"

// 텍스트 삭제 (사용자가 "Beautiful "를 선택하고 삭제)
dataStore.deleteText(r(5, 15));
// "Hello Beautiful World" → "Hello World"

// 텍스트 교체 (사용자가 "World"를 선택하고 "Universe"로 교체)
dataStore.replaceText(r(6, 11), 'Universe');
// "Hello World" → "Hello Universe"

// 텍스트 분할 (사용자가 Enter 키를 누름)
const newTextId = dataStore.splitTextNode('text-1', 5);
// "Hello World" → "Hello" + " World"

// 텍스트 병합 (사용자가 Backspace 키를 누름)
const mergedId = dataStore.mergeTextNodes('text-1', 'text-2');
// "Hello" + " World" → "Hello World"
```

**사용 연산 클래스**: `SplitMergeOperations`

### 2.3 포맷팅 적용 (Range 기반)

#### 시나리오: 사용자가 텍스트를 선택하고 포맷팅을 적용

```typescript
const mr = (s: number, e: number) => ({ startNodeId: 'text-1', startOffset: s, endNodeId: 'text-1', endOffset: e });

// 마크 적용/제거/정리
dataStore.applyMark(mr(0, 5), { type: 'bold' });
dataStore.removeMark(mr(0, 5), 'bold');
dataStore.clearFormatting(mr(0, 11));

// 마크 정규화 (편집 후 정리)
dataStore.normalizeMarks('text-1');
```

**사용 연산 클래스**: `MarkOperations`

## 3. 고급 문서 조작

### 3.1 노드 이동 및 복사 (수집/커밋 예시 포함)

#### 시나리오: 사용자가 문단을 드래그하여 다른 위치로 이동/복사

```typescript
dataStore.begin();

// 문단을 다른 문서로 이동 (move)
dataStore.moveNode('paragraph-1', 'document-2', 2);

// 문단을 복사하여 다른 위치에 붙여넣기 (create + parent update)
const copiedId = dataStore.copyNode('paragraph-1', 'document-2');

// 전체 서브트리 복사 (각 노드 per-node create + content/parent update)
const clonedId = dataStore.cloneNodeWithChildren('paragraph-1', 'document-3');

// 여러 문단을 일괄 이동 (각 항목 move)
dataStore.moveChildren('doc-1', 'doc-2', ['para-1', 'para-2'], 0);

const ops = dataStore.end();
// ops에 create/update/delete/move가 순서대로 수집됨

// CRDT 전송 등 외부 처리 후 베이스 반영
dataStore.commit();
```

**사용 연산 클래스**: `ContentOperations`

### 3.2 범위 기반 텍스트/마크 작업

#### 시나리오: 사용자가 여러 문단에 걸쳐 텍스트를 선택하고 조작

```typescript
const range = { startNodeId: 'text-1', startOffset: 5, endNodeId: 'text-3', endOffset: 10 };

// 여러 노드에 걸친 텍스트 삭제
const deletedContent = dataStore.deleteText(range);

// 여러 노드에 걸친 텍스트 교체
dataStore.replaceText(range, 'New content from clipboard');

// 여러 노드에 걸친 마크 적용/제거
dataStore.applyMark(range, { type: 'bold' });
dataStore.removeMark(range, 'bold');
```

**사용 연산 클래스**: `RangeOperations`

## 4. 검색 및 분석

### 4.1 조건부 검색

#### 시나리오: 문서에서 특정 조건을 만족하는 노드들을 찾기

```typescript
// 모든 문단 찾기
const paragraphs = dataStore.findNodesByType('paragraph');

// 특정 클래스를 가진 텍스트 찾기
const boldTexts = dataStore.findNodesByAttribute('class', 'bold');

// 특정 텍스트가 포함된 노드 찾기
const helloNodes = dataStore.findNodesByText('Hello');

// 복합 조건 검색 (중요한 문단 중에서 "urgent"가 포함된 것)
const urgentImportantParagraphs = dataStore.findNodes(node => 
  node.type === 'paragraph' && 
  node.attributes?.class === 'important' &&
  node.text?.includes('urgent')
);
```

**사용 연산 클래스**: `QueryOperations`

### 4.2 계층 구조 분석

#### 시나리오: 문서의 구조를 분석하고 탐색

```typescript
// 특정 노드의 자식들을 객체 배열로 조회
const children = dataStore.getNodeChildren('para-1');
children.forEach(child => {
  console.log(`Child: ${child.type} - ${child.text}`);
});

// 문서의 모든 하위 노드를 재귀적으로 조회
const allDescendants = dataStore.getNodeChildrenDeep('doc-1');

// 특정 노드의 경로 조회 (어디에 위치하는지)
const path = dataStore.getNodePath('text-1');
console.log('Node path:', path); // ['doc-1', 'para-1', 'text-1']

// 특정 노드의 모든 조상 조회
const ancestors = dataStore.getAllAncestors('text-1');
ancestors.forEach(ancestor => {
  console.log(`Ancestor: ${ancestor.type}`);
});
```

**사용 연산 클래스**: `QueryOperations`, `UtilityOperations`

## 5. 데이터 관리

### 5.1 일괄 작업

#### 시나리오: 여러 노드를 한 번에 처리하는 작업

```typescript
// 여러 문단을 한 번에 생성
const nodeIds = dataStore.addChildren('doc-1', [
  { id: 'para-1', type: 'paragraph', content: [] },
  { id: 'para-2', type: 'paragraph', content: [] },
  { id: 'para-3', type: 'paragraph', content: [] }
]);

// 여러 노드를 한 번에 삭제
const results = dataStore.removeChildren('doc-1', ['para-1', 'para-2']);

// 여러 노드를 다른 부모로 이동
dataStore.moveChildren('doc-1', 'doc-2', ['para-1', 'para-2'], 0);

// 자식 노드들의 순서를 한 번에 변경
dataStore.reorderChildren('doc-1', ['para-3', 'para-1', 'para-2']);
```

**사용 연산 클래스**: `ContentOperations`

### 5.2 데이터 통계 및 분석

#### 시나리오: 문서의 상태를 분석하고 통계를 수집

```typescript
// 전체 노드 수 조회
const totalNodes = dataStore.getNodeCount();
console.log(`Total nodes: ${totalNodes}`);

// 특정 노드의 마크 통계
const markStats = dataStore.getMarkStatistics('text-1');
console.log(`Total marks: ${markStats.totalMarks}`);
console.log(`Overlapping marks: ${markStats.overlappingMarks}`);
console.log(`Empty marks: ${markStats.emptyMarks}`);

// 노드 관계 검사
const isChild = dataStore.isDescendant('text-1', 'para-1');
const isLeaf = dataStore.isLeafNode('text-1');
const isRoot = dataStore.isRootNode('doc-1');

console.log(`Is child: ${isChild}, Is leaf: ${isLeaf}, Is root: ${isRoot}`);
```

**사용 연산 클래스**: `UtilityOperations`, `MarkOperations`

## 6. 실시간 동기화

### 6.1 Operation 이벤트 구독

#### 시나리오: CRDT 시스템과의 실시간 동기화

```typescript
// 모든 Operation 이벤트 구독
dataStore.onOperation((operation) => {
  console.log('Operation:', operation.type, operation.nodeId);
  
  // CRDT 시스템에 전송
  crdtSystem.applyOperation(operation);
});

// 특정 타입의 Operation만 구독
dataStore.onOperation((operation) => {
  if (operation.type === 'create') {
    console.log('New node created:', operation.nodeId);
    // UI 업데이트
    updateUI(operation.nodeId);
  }
}, 'create');

// Operation 구독 해제
const unsubscribe = dataStore.onOperation(handler);
dataStore.offOperation(unsubscribe);
```

### 6.3 트랜잭션/오버레이 사용 요약(배경 포함)
- 왜 오버레이인가: 편집 중 변경을 base에 바로 적용하지 않고, 트랜잭션 로컬로 모아 커밋 시 반영하면
  - 성능: 변경된 노드만 COW 복제(구조적 공유) → 대형 문서에서도 begin 비용 O(1)에 근접
  - 일관성: 읽기 경로가 overlay 우선이라 즉시 일관된 결과 확인 가능
  - 동기화: begin/end로 수집한 원자 op 배치를 CRDT/네트워크 전송 단위로 사용하기 용이
  - 격리: 전역 write 락 전제 하 외부 쓰기와 경합 최소화
- 배경 이론(간단 요약):
  - Copy-on-Write/Shadow Paging: 변경 시점 복제, 커밋 시 루트 스위칭
  - MVCC 스냅샷: 트랜잭션별 읽기 일관성
  - 영속 자료구조: 구조적 공유로 변경 경로만 복제
  - OverlayFS 모델: 상위 레이어 우선 읽기, 상위 레이어에 쓰기

### 6.2 외부 변경사항 적용

#### 시나리오: 다른 클라이언트에서 온 변경사항을 적용

```typescript
// 외부에서 받은 Operation 적용
const externalOperation = {
  type: 'create',
  nodeId: 'external-node',
  node: { 
    id: 'external-node', 
    type: 'paragraph', 
    content: [],
    text: 'From another client'
  }
};

// Operation을 DataStore에 적용
dataStore.setNode(externalOperation.node);

// 변경사항이 자동으로 이벤트로 발생하여 UI 업데이트
```

## 7. 성능 최적화

### 7.1 마크 정규화

#### 시나리오: 문서 편집 후 마크를 정리하여 성능 향상

```typescript
// 개별 노드의 마크 정규화
dataStore.normalizeMarks('text-1');

// 전체 문서의 마크 정규화 (주기적으로 실행)
const normalizedCount = dataStore.normalizeAllMarks();
console.log(`Normalized ${normalizedCount} nodes`);

// 빈 마크 제거
const removedCount = dataStore.removeEmptyMarks('text-1');
console.log(`Removed ${removedCount} empty marks`);
```

**사용 연산 클래스**: `MarkOperations`

### 7.2 데이터 복제 및 백업

#### 시나리오: 문서의 백업을 생성하고 복원

```typescript
// DataStore 전체 복제 (백업 생성)
const backupStore = dataStore.clone();

// 스냅샷 생성 (더 가벼운 백업)
const snapshot = dataStore.getAllNodesMap();

// 스냅샷에서 복원 (백업에서 복구)
const newStore = new DataStore();
newStore.restoreFromSnapshot(snapshot, 'doc-1', 1);

// 특정 시점으로 되돌리기
const historicalSnapshot = getHistoricalSnapshot(timestamp);
dataStore.restoreFromSnapshot(historicalSnapshot, 'doc-1', 1);
```

**사용 연산 클래스**: `UtilityOperations`

## 8. 고급 사용 사례

### 8.1 문서 템플릿 시스템

#### 시나리오: 미리 정의된 템플릿을 사용하여 문서 생성

```typescript
// 템플릿 정의
const documentTemplate = {
  id: 'template-doc',
  type: 'document',
  content: [
    {
      id: 'template-title',
      type: 'heading',
      content: [
        {
          id: 'template-title-text',
          type: 'inline-text',
          text: 'Untitled Document'
        }
      ]
    },
    {
      id: 'template-content',
      type: 'paragraph',
      content: [
        {
          id: 'template-content-text',
          type: 'inline-text',
          text: 'Start writing here...'
        }
      ]
    }
  ]
};

// 템플릿에서 새 문서 생성
const newDoc = dataStore.createNodeWithChildren(documentTemplate, schema);

// 템플릿 노드들을 실제 사용할 노드로 교체
const titleNode = dataStore.getNode('template-title-text');
if (titleNode) {
  titleNode.text = 'My New Document';
  dataStore.setNode(titleNode);
}
```

### 8.2 협업 편집 시스템

#### 시나리오: 여러 사용자가 동시에 문서를 편집

```typescript
// 사용자 A의 변경사항
const userAOperation = {
  type: 'update',
  nodeId: 'text-1',
  updates: { text: 'User A edited this' }
};

// 사용자 B의 변경사항
const userBOperation = {
  type: 'insertText',
  nodeId: 'text-1',
  position: 5,
  text: 'User B added this'
};

// 충돌 해결을 위한 Operation 순서 관리
const operationQueue = [userAOperation, userBOperation];

// 순차적으로 적용
for (const operation of operationQueue) {
  dataStore.updateNode(operation.nodeId, operation.updates);
}
```

### 8.3 문서 버전 관리

#### 시나리오: 문서의 버전을 추적하고 관리

```typescript
// 현재 버전 저장
const currentVersion = dataStore.getVersion();
const currentSnapshot = dataStore.getAllNodesMap();

// 버전 히스토리에 저장
versionHistory.set(currentVersion, {
  snapshot: currentSnapshot,
  timestamp: Date.now(),
  author: 'current-user'
});

// 특정 버전으로 되돌리기
const targetVersion = 5;
const targetSnapshot = versionHistory.get(targetVersion);
if (targetSnapshot) {
  dataStore.restoreFromSnapshot(
    targetSnapshot.snapshot, 
    'doc-1', 
    targetVersion
  );
}
```

## 9. 디버깅 및 개발

### 9.1 데이터 구조 검사

#### 시나리오: 개발 중 데이터 구조를 검사하고 디버깅

```typescript
// 모든 노드의 구조 출력
const allNodes = dataStore.getAllNodes();
allNodes.forEach(node => {
  console.log(`Node ${node.sid}:`, {
    type: node.type,
    text: node.text?.substring(0, 50),
    children: node.content?.length || 0,
    marks: node.marks?.length || 0
  });
});

// 특정 노드의 상세 정보
const nodeDetails = dataStore.getNodeWithChildren('para-1');
console.log('Node with children:', JSON.stringify(nodeDetails, null, 2));

// 노드 관계 검사
const path = dataStore.getNodePath('text-1');
const ancestors = dataStore.getAllAncestors('text-1');
const descendants = dataStore.getAllDescendants('para-1');

console.log('Path:', path);
console.log('Ancestors:', ancestors.map(n => n.sid));
console.log('Descendants:', descendants.map(n => n.sid));
```

### 9.2 성능 모니터링

#### 시나리오: 애플리케이션의 성능을 모니터링

```typescript
// Operation 이벤트를 통한 성능 모니터링
let operationCount = 0;
const startTime = Date.now();

dataStore.onOperation((operation) => {
  operationCount++;
  
  if (operationCount % 100 === 0) {
    const elapsed = Date.now() - startTime;
    console.log(`Operations per second: ${operationCount / (elapsed / 1000)}`);
  }
});

// 메모리 사용량 모니터링
const nodeCount = dataStore.getNodeCount();
const memoryUsage = process.memoryUsage();
console.log(`Nodes: ${nodeCount}, Memory: ${memoryUsage.heapUsed / 1024 / 1024}MB`);
```

---

이 문서는 DataStore를 사용하여 다양한 시나리오를 구현하는 방법을 보여줍니다. 더 자세한 API 정보는 [DataStore API Reference](./datastore-api-reference.md)를 참조하세요.
