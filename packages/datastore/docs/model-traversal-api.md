# Model Traversal API 목록

모델 순회 및 탐색을 위한 유틸리티 함수 목록입니다.

## 목차

1. [기본 조회 함수](#기본-조회-함수)
2. [계층 구조 탐색](#계층-구조-탐색)
3. [형제 노드 탐색](#형제-노드-탐색)
4. [문서 순서 순회](#문서-순서-순회)
5. [조건부 탐색](#조건부-탐색)
6. [트리 순회](#트리-순회)
7. [상태 확인](#상태-확인)
8. [통계 및 정보](#통계-및-정보)
9. [범위 조회](#범위-조회)

---

## 기본 조회 함수

### `hasNode(nodeId: string): boolean`
- **설명**: 노드 존재 여부 확인
- **반환**: 노드가 존재하면 `true`, 없으면 `false`
- **복잡도**: O(1)

### `getNode(nodeId: string): INode | undefined`
- **설명**: 노드 조회 (DataStore 기본 메서드)
- **반환**: 노드 객체 또는 `undefined`
- **복잡도**: O(1)

### `getRootNode(): INode | undefined`
- **설명**: 루트 노드 조회 (DataStore 기본 메서드)
- **반환**: 루트 노드 객체 또는 `undefined`
- **복잡도**: O(1)

---

## 계층 구조 탐색

### `getParent(nodeId: string): INode | undefined`
- **설명**: 부모 노드 조회
- **반환**: 부모 노드 객체 또는 `undefined` (루트 노드이거나 부모 없음)
- **복잡도**: O(1)

### `getChildren(nodeId: string): INode[]`
- **설명**: 직접 자식 노드들 조회
- **반환**: 자식 노드 배열 (직접 자식만, 중첩 자손 제외)
- **복잡도**: O(n) (n = 자식 개수)

### `getFirstChild(nodeId: string): string | null`
- **설명**: 첫 번째 자식 노드 조회
- **반환**: 첫 번째 자식 노드 ID 또는 `null` (자식이 없음)
- **복잡도**: O(1)

### `getLastChild(nodeId: string): string | null`
- **설명**: 마지막 자식 노드 조회
- **반환**: 마지막 자식 노드 ID 또는 `null` (자식이 없음)
- **복잡도**: O(1)

### `getChildCount(nodeId: string): number`
- **설명**: 직접 자식 노드 개수 조회
- **반환**: 자식 노드 개수 (0 이상)
- **복잡도**: O(1)

### `getAllDescendants(nodeId: string): INode[]`
- **설명**: 모든 자손 노드들 조회 (재귀적)
- **반환**: 자손 노드 배열 (직접 자식 + 중첩 자손 모두)
- **복잡도**: O(n) (n = 자손 개수)

### `getAllAncestors(nodeId: string): INode[]`
- **설명**: 모든 조상 노드들 조회 (루트까지)
- **반환**: 조상 노드 배열 (부모 → 루트 순서)
- **복잡도**: O(d) (d = 깊이)

### `getNodePath(nodeId: string): string[]`
- **설명**: 노드 경로 조회 (루트부터 현재 노드까지)
- **반환**: 노드 ID 배열 (루트 → 현재 노드 순서)
- **복잡도**: O(d) (d = 깊이)

### `getNodeDepth(nodeId: string): number`
- **설명**: 노드 깊이 조회 (루트 = 0)
- **반환**: 깊이 값 (0 이상)
- **복잡도**: O(d) (d = 깊이)

### `isDescendant(nodeId: string, ancestorId: string): boolean`
- **설명**: 노드가 특정 조상의 자손인지 확인
- **반환**: 자손이면 `true`, 아니면 `false`
- **복잡도**: O(d) (d = 깊이)

### `getCommonAncestor(nodeId1: string, nodeId2: string): string | null`
- **설명**: 두 노드의 공통 조상 찾기 (Lowest Common Ancestor)
- **반환**: 공통 조상 노드 ID 또는 `null` (공통 조상 없음)
- **복잡도**: O(d) (d = 깊이)
- **참고**: 한 노드가 다른 노드의 조상이면 그 조상을 반환

### `getDistance(nodeId1: string, nodeId2: string): number`
- **설명**: 두 노드 간의 거리 계산
- **반환**: 두 노드 간 거리 (공통 조상까지의 경로 합), 없으면 `-1`
- **복잡도**: O(d) (d = 깊이)
- **참고**: 같은 노드면 `0`, 공통 조상이 없으면 `-1`

---

## 형제 노드 탐색

### `getSiblings(nodeId: string): INode[]`
- **설명**: 모든 형제 노드들 조회 (자기 자신 제외)
- **반환**: 형제 노드 배열
- **복잡도**: O(n) (n = 형제 개수)

### `getSiblingIndex(nodeId: string): number`
- **설명**: 형제 노드에서의 인덱스 조회
- **반환**: 인덱스 (0-based, 없으면 -1)
- **복잡도**: O(n) (n = 형제 개수)

### `getPreviousSibling(nodeId: string): string | null`
- **설명**: 같은 부모의 이전 형제 노드 조회
- **반환**: 이전 형제 노드 ID 또는 `null` (첫 번째 형제이거나 없음)
- **복잡도**: O(n) (n = 형제 개수)

### `getNextSibling(nodeId: string): string | null`
- **설명**: 같은 부모의 다음 형제 노드 조회
- **반환**: 다음 형제 노드 ID 또는 `null` (마지막 형제이거나 없음)
- **복잡도**: O(n) (n = 형제 개수)

### `getFirstSibling(nodeId: string): string | null`
- **설명**: 같은 부모의 첫 번째 형제 노드 조회
- **반환**: 첫 번째 형제 노드 ID 또는 `null` (형제가 없거나 없음)
- **복잡도**: O(1)

### `getLastSibling(nodeId: string): string | null`
- **설명**: 같은 부모의 마지막 형제 노드 조회
- **반환**: 마지막 형제 노드 ID 또는 `null` (형제가 없거나 없음)
- **복잡도**: O(1)

---

## 문서 순서 순회

### `getNextNode(nodeId: string): string | null`
- **설명**: 문서 순서상 다음 노드 조회 (자식 우선, 형제, 부모의 형제 순)
- **반환**: 다음 노드 ID 또는 `null` (마지막 노드)
- **복잡도**: O(1) ~ O(d) (d = 깊이)

**동작 방식**:
1. 자식 노드가 있으면 첫 번째 자식 반환
2. 형제 노드가 있으면 다음 형제 반환
3. 부모의 다음 형제 찾기 (재귀적)
4. 없으면 `null`

### `getPreviousNode(nodeId: string): string | null`
- **설명**: 문서 순서상 이전 노드 조회 (형제의 마지막 자손, 부모 순)
- **반환**: 이전 노드 ID 또는 `null` (첫 번째 노드)
- **복잡도**: O(1) ~ O(d) (d = 깊이)

**동작 방식**:
1. 이전 형제 노드가 있으면 그 형제의 마지막 자손 반환
2. 부모 노드 반환
3. 없으면 `null`

### `compareDocumentOrder(nodeId1: string, nodeId2: string): number`
- **설명**: 두 노드의 문서 순서 비교
- **반환**: 
  - `-1`: nodeId1이 nodeId2보다 앞에 있음
  - `0`: 같은 노드
  - `1`: nodeId1이 nodeId2보다 뒤에 있음
- **복잡도**: O(d) (d = 깊이)

---

## 조건부 탐색

### `find(predicate: (nodeId: string, node: INode) => boolean): string | null`
- **설명**: 조건에 맞는 첫 번째 노드 찾기
- **반환**: 노드 ID 또는 `null` (없음)
- **복잡도**: O(n) (n = 전체 노드 개수)

### `findAll(predicate: (nodeId: string, node: INode) => boolean): string[]`
- **설명**: 조건에 맞는 모든 노드 찾기
- **반환**: 노드 ID 배열
- **복잡도**: O(n) (n = 전체 노드 개수)

---

## 트리 순회

### `createDocumentIterator(options?: DocumentIteratorOptions): DocumentIterator`
- **설명**: 문서 순회를 위한 Iterator 생성
- **반환**: `DocumentIterator` 인스턴스
- **옵션**:
  - `startNodeId`: 시작 노드 ID (기본값: 루트)
  - `reverse`: 역순 순회 여부
  - `maxDepth`: 최대 깊이 제한
  - `filter`: 타입 필터
  - `customFilter`: 사용자 정의 필터
  - `shouldStop`: 중단 조건
  - `range`: 순회 범위 제한

**사용 예시**:
```typescript
const iterator = dataStore.createDocumentIterator({
  filter: { type: 'inline-text' },
  maxDepth: 3
});

for (const nodeId of iterator) {
  const node = dataStore.getNode(nodeId);
  // 처리...
}
```

### `traverse(visitor: DocumentVisitor, options?: VisitorTraversalOptions): TraversalResult`
- **설명**: Visitor 패턴을 사용한 문서 순회
- **반환**: 순회 결과 (`visitedCount`, `skippedCount`, `stopped`)
- **Visitor 인터페이스**:
  - `enter?(nodeId: string, node: INode, context?: any): void`
  - `visit(nodeId: string, node: INode, context?: any): void | boolean`
  - `exit?(nodeId: string, node: INode, context?: any): void`
  - `shouldVisitChildren?(nodeId: string, node: INode): boolean`

**사용 예시**:
```typescript
const result = dataStore.traverse({
  visit: (nodeId, node) => {
    console.log(`Visiting: ${nodeId}`);
    return true; // 계속 순회
  },
  shouldVisitChildren: (nodeId, node) => {
    return node.stype !== 'inline-text'; // inline-text의 자식은 스킵
  }
});
```

---

## 상태 확인

### `isRootNode(nodeId: string): boolean`
- **설명**: 루트 노드 여부 확인
- **반환**: 루트 노드이면 `true`, 아니면 `false`
- **복잡도**: O(1)

### `isLeafNode(nodeId: string): boolean`
- **설명**: 리프 노드 여부 확인 (자식이 없는 노드)
- **반환**: 리프 노드이면 `true`, 아니면 `false`
- **복잡도**: O(1)

---

## 통계 및 정보

### `getNodeCount(): number`
- **설명**: 전체 노드 개수 조회
- **반환**: 노드 개수
- **복잡도**: O(1)

### `getAllNodes(): INode[]`
- **설명**: 모든 노드 조회
- **반환**: 노드 배열
- **복잡도**: O(n) (n = 전체 노드 개수)

### `getAllNodesMap(): Map<string, INode>`
- **설명**: 모든 노드를 Map으로 조회
- **반환**: 노드 Map (ID → 노드)
- **복잡도**: O(n) (n = 전체 노드 개수)

### `getStats(): NodeStats`
- **설명**: 노드 통계 조회
- **반환**: 통계 객체
  - `total`: 전체 노드 개수
  - `byType`: 타입별 노드 개수
  - `byDepth`: 깊이별 노드 개수
- **복잡도**: O(n) (n = 전체 노드 개수)

---

## 범위 조회

### `getNodesInRange(): string[]`
- **설명**: 범위 내 노드들 조회 (설정된 범위 기준)
- **반환**: 노드 ID 배열
- **복잡도**: O(n) (n = 범위 내 노드 개수)

### `getRangeNodeCount(): number`
- **설명**: 범위 내 노드 개수 조회
- **반환**: 노드 개수
- **복잡도**: O(n) (n = 범위 내 노드 개수)

### `getRangeInfo(): RangeInfo | null`
- **설명**: 범위 정보 조회
- **반환**: 범위 정보 객체 또는 `null`
  - `start`: 시작 노드 ID
  - `end`: 끝 노드 ID
  - `includeStart`: 시작 노드 포함 여부
  - `includeEnd`: 끝 노드 포함 여부
- **복잡도**: O(1)

---

## 함수 분류 요약

### ✅ 구현 완료
- ✅ 기본 조회 함수 (hasNode, getNode, getRootNode)
- ✅ 계층 구조 탐색 (getParent, getChildren, getFirstChild, getLastChild, getAllDescendants, getAllAncestors, getNodePath, getNodeDepth, isDescendant, getCommonAncestor, getDistance)
- ✅ 형제 노드 탐색 (getSiblings, getSiblingIndex, getPreviousSibling, getNextSibling, getFirstSibling, getLastSibling)
- ✅ 문서 순서 순회 (getNextNode, getPreviousNode, compareDocumentOrder)
- ✅ 조건부 탐색 (find, findAll)
- ✅ 트리 순회 (createDocumentIterator, traverse)
- ✅ 상태 확인 (isRootNode, isLeafNode)
- ✅ 통계 및 정보 (getNodeCount, getAllNodes, getAllNodesMap, getStats)
- ✅ 범위 조회 (getNodesInRange, getRangeNodeCount, getRangeInfo)

### ✅ 최근 추가된 함수
- ✅ `getFirstChild` - 첫 번째 자식 노드 조회
- ✅ `getLastChild` - 마지막 자식 노드 조회
- ✅ `getFirstSibling` - 첫 번째 형제 노드 조회
- ✅ `getLastSibling` - 마지막 형제 노드 조회
- ✅ `getCommonAncestor` - 두 노드의 공통 조상 찾기
- ✅ `getDistance` - 두 노드 간 거리 계산

### 🔄 개선 가능 영역
- [ ] 성능 최적화: 형제 탐색 함수들의 O(n) 복잡도를 O(1)로 개선 (인덱스 캐싱)

---

## 사용 예시

### 형제 노드 탐색
```typescript
// 이전 형제 찾기
const prevSiblingId = dataStore.getPreviousSibling('text-2');
if (prevSiblingId) {
  const prevSibling = dataStore.getNode(prevSiblingId);
  console.log('Previous sibling:', prevSibling);
}

// 다음 형제 찾기
const nextSiblingId = dataStore.getNextSibling('text-2');
if (nextSiblingId) {
  const nextSibling = dataStore.getNode(nextSiblingId);
  console.log('Next sibling:', nextSibling);
}

// 첫 번째 형제 찾기
const firstSiblingId = dataStore.getFirstSibling('text-2');
if (firstSiblingId) {
  const firstSibling = dataStore.getNode(firstSiblingId);
  console.log('First sibling:', firstSibling);
}

// 마지막 형제 찾기
const lastSiblingId = dataStore.getLastSibling('text-2');
if (lastSiblingId) {
  const lastSibling = dataStore.getNode(lastSiblingId);
  console.log('Last sibling:', lastSibling);
}
```

### 자식 노드 탐색
```typescript
// 첫 번째 자식 찾기
const firstChildId = dataStore.getFirstChild('paragraph-1');
if (firstChildId) {
  const firstChild = dataStore.getNode(firstChildId);
  console.log('First child:', firstChild);
}

// 마지막 자식 찾기
const lastChildId = dataStore.getLastChild('paragraph-1');
if (lastChildId) {
  const lastChild = dataStore.getNode(lastChildId);
  console.log('Last child:', lastChild);
}
```

### 공통 조상 및 거리 계산
```typescript
// 공통 조상 찾기
const commonAncestorId = dataStore.getCommonAncestor('text-1', 'text-3');
if (commonAncestorId) {
  const commonAncestor = dataStore.getNode(commonAncestorId);
  console.log('Common ancestor:', commonAncestor);
}

// 두 노드 간 거리 계산
const distance = dataStore.getDistance('text-1', 'text-3');
console.log('Distance:', distance); // 공통 조상까지의 경로 합
```

### 문서 순서 순회
```typescript
// 다음 노드 찾기 (자식 우선)
let currentNodeId = 'paragraph-1';
while (currentNodeId) {
  const node = dataStore.getNode(currentNodeId);
  console.log('Current node:', node);
  currentNodeId = dataStore.getNextNode(currentNodeId);
}
```

### 조건부 탐색
```typescript
// 특정 타입의 노드 찾기
const textNodeId = dataStore.find((nodeId, node) => {
  return node.stype === 'inline-text' && node.text?.includes('hello');
});

// 모든 텍스트 노드 찾기
const textNodeIds = dataStore.findAll((nodeId, node) => {
  return node.stype === 'inline-text';
});
```

### 트리 순회
```typescript
// Iterator 사용
const iterator = dataStore.createDocumentIterator({
  filter: { type: 'inline-text' },
  maxDepth: 2
});

for (const nodeId of iterator) {
  const node = dataStore.getNode(nodeId);
  console.log('Visiting:', nodeId, node);
}

// Visitor 패턴 사용
dataStore.traverse({
  enter: (nodeId, node) => {
    console.log('Entering:', nodeId);
  },
  visit: (nodeId, node) => {
    console.log('Visiting:', nodeId);
    return true; // 계속 순회
  },
  exit: (nodeId, node) => {
    console.log('Exiting:', nodeId);
  }
});
```

