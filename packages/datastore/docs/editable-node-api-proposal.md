# Editable Node API 제안

## 현재 구현 상태

### ✅ 이미 구현된 것

1. **스키마 속성**
   - `editable?: boolean` - block 노드의 편집 가능 여부

2. **Private 함수**
   - `_isEditableNode(nodeId: string): boolean` - 편집 가능 여부 확인 (private)

3. **Public API**
   - `getPreviousEditableNode(nodeId: string): string | null` - 이전 편집 가능한 노드 찾기
   - `getNextEditableNode(nodeId: string): string | null` - 다음 편집 가능한 노드 찾기

---

## 추가 제안 사항

### 1. Public API: `isEditableNode()`

**목적:** Extension이나 Command에서 노드의 편집 가능 여부를 확인

**시그니처:**
```typescript
isEditableNode(nodeId: string): boolean
```

**사용 예시:**
```typescript
// Extension에서 사용
if (dataStore.isEditableNode(nodeId)) {
  // 편집 가능한 노드에 대한 처리
} else {
  // 편집 불가능한 노드에 대한 처리
}
```

**구현 위치:**
- `packages/datastore/src/data-store.ts`에 public 메서드 추가
- 내부적으로 `utility._isEditableNode()` 호출

---

### 2. 편집 가능한 노드 목록 조회

**목적:** 문서 내 모든 편집 가능한 노드를 조회

**시그니처:**
```typescript
getEditableNodes(options?: {
  filter?: (node: INode) => boolean;
  includeText?: boolean; // .text 필드가 있는 노드 포함 여부
  includeInline?: boolean; // inline 노드 포함 여부
  includeEditableBlocks?: boolean; // editable: true인 block 노드 포함 여부
}): INode[]
```

**사용 예시:**
```typescript
// 모든 편집 가능한 노드 조회
const editableNodes = dataStore.getEditableNodes();

// 텍스트 노드만 조회
const textNodes = dataStore.getEditableNodes({
  includeText: true,
  includeInline: false,
  includeEditableBlocks: false
});

// editable block 노드만 조회
const editableBlocks = dataStore.getEditableNodes({
  includeText: false,
  includeInline: false,
  includeEditableBlocks: true
});
```

---

### 3. 편집 가능한 노드로 필터링

**목적:** DocumentIterator나 다른 쿼리 결과를 편집 가능한 노드로 필터링

**시그니처:**
```typescript
filterEditableNodes(nodeIds: string[]): string[]
```

**사용 예시:**
```typescript
// 모든 노드 중 편집 가능한 노드만 필터링
const allNodes = dataStore.findNodesByType('*');
const editableNodeIds = dataStore.filterEditableNodes(
  allNodes.map(n => n.sid!)
);
```

---

### 4. 편집 가능한 노드 통계 정보

**목적:** 문서 내 편집 가능한 노드의 통계 정보 제공

**시그니처:**
```typescript
getEditableNodeStats(): {
  total: number;
  textNodes: number;
  inlineNodes: number;
  editableBlocks: number;
  byType: Record<string, number>;
}
```

**사용 예시:**
```typescript
const stats = dataStore.getEditableNodeStats();
console.log(`총 ${stats.total}개의 편집 가능한 노드`);
console.log(`텍스트 노드: ${stats.textNodes}개`);
console.log(`Inline 노드: ${stats.inlineNodes}개`);
console.log(`Editable Block: ${stats.editableBlocks}개`);
```

---

### 5. 편집 가능한 노드 범위 계산

**목적:** 특정 범위 내 편집 가능한 노드들의 범위 계산

**시그니처:**
```typescript
getEditableNodeRange(startNodeId: string, endNodeId: string): {
  startNodeId: string;
  endNodeId: string;
  nodeIds: string[];
  totalTextLength: number;
}
```

**사용 예시:**
```typescript
// 두 노드 사이의 편집 가능한 노드 범위 계산
const range = dataStore.getEditableNodeRange('text-1', 'text-5');
console.log(`범위 내 노드 수: ${range.nodeIds.length}`);
console.log(`총 텍스트 길이: ${range.totalTextLength}`);
```

---

### 6. 편집 가능한 노드 검색

**목적:** 특정 조건에 맞는 편집 가능한 노드 검색

**시그니처:**
```typescript
findEditableNodes(predicate: (node: INode) => boolean): INode[]
```

**사용 예시:**
```typescript
// 텍스트 길이가 10 이상인 편집 가능한 노드 찾기
const longTextNodes = dataStore.findEditableNodes(
  node => node.text && node.text.length >= 10
);
```

---

### 7. 편집 가능한 노드 그룹화

**목적:** 편집 가능한 노드를 타입별로 그룹화

**시그니처:**
```typescript
groupEditableNodesByType(): Record<string, INode[]>
```

**사용 예시:**
```typescript
const grouped = dataStore.groupEditableNodesByType();
console.log('inline-text 노드:', grouped['inline-text']);
console.log('codeBlock 노드:', grouped['codeBlock']);
```

---

## 우선순위

### Phase 1: 필수 API (즉시 구현)
1. ✅ `isEditableNode()` - Public API로 노출
   - Extension/Command에서 자주 사용
   - 현재 private 함수를 public으로 노출

### Phase 2: 유용한 API (단기)
2. ✅ `getEditableNodes()` - 편집 가능한 노드 목록 조회
   - 문서 분석, 통계 등에 유용
3. ✅ `filterEditableNodes()` - 필터링 유틸리티
   - 다른 쿼리 결과와 조합하여 사용

### Phase 3: 고급 API (중기)
4. ✅ `getEditableNodeStats()` - 통계 정보
   - 문서 분석, 디버깅에 유용
5. ✅ `getEditableNodeRange()` - 범위 계산
   - Selection 처리, 텍스트 추출 등에 유용

### Phase 4: 선택적 API (장기)
6. ✅ `findEditableNodes()` - 검색
   - 특정 조건 검색이 필요한 경우
7. ✅ `groupEditableNodesByType()` - 그룹화
   - 타입별 분석이 필요한 경우

---

## 구현 예시

### `isEditableNode()` 구현

```typescript
// packages/datastore/src/data-store.ts
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
  return this.utility._isEditableNode(nodeId);
}
```

### `getEditableNodes()` 구현

```typescript
// packages/datastore/src/operations/utility-operations.ts
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
        
        if (isTextNode && !includeText && !isEditableBlock) {
          continue;
        }
        if (isInline && !includeInline) {
          continue;
        }
        if (isEditableBlock && !includeEditableBlocks) {
          continue;
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
```

---

## 테스트 케이스

각 API에 대한 테스트 케이스를 추가해야 합니다:

1. `isEditableNode()` 테스트
   - 텍스트 노드
   - inline 노드
   - editable block 노드
   - 일반 block 노드
   - document 노드

2. `getEditableNodes()` 테스트
   - 모든 편집 가능한 노드 조회
   - 타입별 필터링
   - 커스텀 필터 적용

3. `filterEditableNodes()` 테스트
   - 빈 배열
   - 모든 편집 가능한 노드
   - 편집 불가능한 노드 포함

---

## 문서화

각 API에 대한 JSDoc 주석과 사용 예시를 추가해야 합니다.

