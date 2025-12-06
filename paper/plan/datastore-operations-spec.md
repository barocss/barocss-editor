# DataStore Operations Specification

## Marks 정규화

- normalizeMarks(nodeId)
  - 범위 미지정 마크는 전체 텍스트 범위 할당
  - 범위를 [0, textLength]로 클램프, 빈 범위 제거
  - (type, attrs, range) 중복 제거, 동일 (type, attrs) 겹침 병합, 시작 위치 기준 정렬
  - updateNode(false) 후 로컬 노드에도 marks를 동기 반영

- normalizeAllMarks()
  - 텍스트 계열 노드만 대상(`inline-text`/`text`)
  - 변경이 있는 노드만 update emit, 반환값은 정규화 수행한 노드 수

## Range 기반 텍스트 연산(요약)

- ContentRange: { startNodeId, startOffset, endNodeId, endOffset }
- deleteText
  - 동일 노드: 부분 문자열 제거 + 마크 split/trim/shift
  - 다중 노드: 시작/중간/끝 노드 분리 처리, 복잡 케이스는 range iterator 폴백
- insertText
  - caret(start==end)에서만 허용, 마크 범위 조정(뒤 이동/스팬 확장)
- replaceText
  - 동일 노드: 제거+삽입으로 계산, 마크 조정 포함
  - 다중 노드: deleteText + insertText 조합

## Content 연산 요약

- addChild
  - 자식이 객체면 id 할당 및 setNode; parent.content는 updateNode(false)로 갱신 후 로컬 반영
- removeChild
  - parent.content에서 제거, child.parentId를 undefined로 업데이트
- moveNode
  - oldParent.content에서 제거 → newParent.content에 삽입 → child.parentId 갱신 → move op emit
- reorderChildren
  - parent.content를 전달된 순서로 치환, 위치 변경 항목은 move 시퀀스로 emit
- copyNode / cloneNodeWithChildren
  - per-node create + parent update, move는 없고, clone은 서브트리 재귀 복제

## 1. 개요

DataStore의 기능을 7개의 전문 연산 클래스로 분리하여 모듈화했습니다. 각 클래스는 특정 도메인의 기능을 담당하며, DataStore 인스턴스에 대한 참조를 통해 독립적으로 작동합니다. 동기화 관점의 원자 op 수집 규칙은 `datastore-spec.md` 6장을 참조하세요.

### 1.1 Query Operations 성능 vs 완전성 정책

QueryOperations는 성능과 완전성 사이의 균형을 고려하여 두 가지 접근 방식을 사용합니다:

#### DocumentIterator 사용 (성능 우선)
- **findNodesByType**: 타입 필터링으로 효율적
- **findChildrenByParentId**: 직접 접근으로 효율적  
- **findNodesByDepth**: 깊이 제한으로 효율적

#### 전체 순회 사용 (완전성 우선)
- **findNodes**: 고아 노드 포함 모든 노드 검색
- **findRootNodes**: 고아 노드도 루트로 간주
- **findNodesByAttribute**: 속성 검색 (고아 노드 포함)
- **findNodesByText**: 텍스트 검색 (고아 노드 포함)
- **searchText**: 텍스트 검색 (고아 노드 포함)

이 정책은 데이터 무결성 검사, 정리 작업, 디버깅 시 고아 노드까지 찾아야 하는 요구사항과 일반적인 성능 최적화 요구사항을 모두 만족합니다.

## 2. CoreOperations

### 2.1 목적
기본 CRUD(Create, Read, Update, Delete) 기능을 제공하며, 스키마 검증과 ID 생성을 담당합니다.

### 2.2 주요 메서드

#### 2.2.1 setNode(node: INode, validate: boolean = true): void
```typescript
// 노드를 DataStore에 저장
dataStore.setNode({
  id: 'text-1',
  type: 'inline-text',
  text: 'Hello World',
  parentId: 'para-1'
}, true); // validate=true로 스키마 검증 수행
```

**특징**:
- 스키마 검증 옵션 제공
- 중복 ID 방지
- Operation 이벤트 발생
- 부모-자식 관계 자동 업데이트

#### 2.2.2 getNode(nodeId: string): INode | undefined
```typescript
// 노드 조회
const node = dataStore.getNode('text-1');
if (node) {
  console.log(node.text); // "Hello World"
}
```

**특징**:
- O(1) 조회 성능
- 존재하지 않는 노드에 대해 undefined 반환

#### 2.2.3 deleteNode(nodeId: string): boolean
```typescript
// 노드 삭제
const deleted = dataStore.deleteNode('text-1');
if (deleted) {
  console.log('Node deleted successfully');
}
```

**특징**:
- 자식 노드들도 함께 삭제
- 부모의 content 배열에서 자동 제거
- Operation 이벤트 발생

#### 2.2.4 updateNode(nodeId: string, updates: Partial<INode>, validate: boolean = true): { valid: boolean; errors: string[] } | null
```typescript
// 노드 업데이트
const result = dataStore.updateNode('text-1', {
  text: 'Updated text',
  attributes: { class: 'highlight' }
});

if (result?.valid) {
  console.log('Update successful');
} else {
  console.log('Validation errors:', result?.errors);
}
```

**특징**:
- 부분 업데이트 지원
- type 변경 방지
- 스키마 검증 옵션
- 상세한 에러 정보 제공

#### 2.2.5 createNodeWithChildren(node: INode, schema?: Schema): INode
```typescript
// 중첩 구조를 가진 노드 생성
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
          text: 'Hello World'
        }
      ]
    }
  ]
};

const createdDoc = dataStore.createNodeWithChildren(document, schema);
```

**특징**:
- 중첩된 객체에 자동 ID 할당
- 스키마 검증 수행
- 모든 하위 노드를 개별적으로 생성
- 원자적 연산 보장

### 2.3 내부 메서드

#### 2.3.1 _setNodeInternal(node: INode): void
- 내부적으로만 사용되는 노드 저장 메서드
- 검증 없이 직접 저장
- Operation 이벤트 발생

#### 2.3.2 _createAllNodesRecursively(node: INode): void
- 중첩 구조의 모든 노드를 재귀적으로 생성
- ID가 이미 할당된 노드들을 처리

#### 2.3.3 _assignIdsRecursively(node: INode): void
- 중첩 구조의 모든 객체에 ID 할당
- Figma 스타일 ID 생성 사용

## 3. QueryOperations

### 3.1 목적
검색, 조회, 필터링 기능을 제공하며, 다양한 조건으로 노드를 찾을 수 있습니다. 성능과 완전성 사이의 균형을 고려하여 DocumentIterator와 전체 순회 방식을 적절히 조합하여 사용합니다.

### 3.2 주요 메서드

#### 3.2.1 findNodes(predicate: (node: INode) => boolean): INode[]
- **전체 순회 사용**: 고아 노드 포함 모든 노드 검색
- **Overlay-aware**: 현재 상태 반영 (overlay 변경사항 포함)
- **순서**: Map 순회 순서 (보장되지 않음)

```typescript
// 복합 조건 검색 (고아 노드 포함)
const importantParagraphs = dataStore.findNodes(node => 
  node.type === 'paragraph' && 
  node.attributes?.class === 'important'
);
```

#### 3.2.2 findNodesByType(type: string): INode[]
- **DocumentIterator 사용**: 타입 필터링으로 효율적
- **Overlay-aware**: 현재 상태 반영 (overlay 변경사항 포함)
- **순서**: 문서 순회 순서 (루트 설정 시)

```typescript
// 타입별 검색 (성능 최적화)
const paragraphs = dataStore.findNodesByType('paragraph');
const textNodes = dataStore.findNodesByType('inline-text');
```

#### 3.2.3 findNodesByAttribute(key: string, value: any): INode[]
- **전체 순회 사용**: 고아 노드 포함 모든 노드 검색
- **Overlay-aware**: 현재 상태 반영 (overlay 변경사항 포함)
- **순서**: Map 순회 순서 (보장되지 않음)

```typescript
// 속성별 검색 (고아 노드 포함)
const boldTexts = dataStore.findNodesByAttribute('class', 'bold');
const highlightedNodes = dataStore.findNodesByAttribute('highlighted', true);
```

#### 3.2.4 findNodesByText(text: string): INode[]
- **전체 순회 사용**: 고아 노드 포함 모든 노드 검색
- **Overlay-aware**: 현재 상태 반영 (overlay 변경사항 포함)
- **순서**: Map 순회 순서 (보장되지 않음)

```typescript
// 텍스트 검색 (고아 노드 포함)
const helloNodes = dataStore.findNodesByText('Hello');
const worldNodes = dataStore.findNodesByText('World');
```

#### 3.2.5 findChildrenByParentId(parentId: string): INode[]
- **직접 접근 사용**: 부모 노드의 content 배열 직접 접근
- **Overlay-aware**: 현재 상태 반영 (overlay 변경사항 포함)
- **순서**: 문서 순회 순서 (부모가 연결된 경우)

```typescript
// 자식 노드들을 객체 배열로 반환 (성능 최적화)
const children = dataStore.findChildrenByParentId('para-1');
children.forEach(child => {
  console.log(child.text);
});
```

#### 3.2.6 getNodeChildrenDeep(nodeId: string): INode[]
```typescript
// 모든 하위 노드를 재귀적으로 조회
const allDescendants = dataStore.getNodeChildrenDeep('doc-1');
```

#### 3.2.7 getNodeWithChildren(nodeId: string): INode | null
```typescript
// 노드와 모든 자식을 중첩 구조로 반환
const nodeWithChildren = dataStore.getNodeWithChildren('para-1');
console.log(nodeWithChildren.content); // INode[] 배열
```

#### 3.2.8 getAllNodesWithChildren(): INode[]
```typescript
// 모든 노드를 중첩 구조로 반환
const allNodes = dataStore.getAllNodesWithChildren();
```

### 3.3 성능 최적화 전략

#### 3.3.1 DocumentIterator 활용
- **타입 필터링**: `findNodesByType`에서 타입별 필터로 효율적 순회
- **직접 접근**: `findChildrenByParentId`에서 부모의 content 배열 직접 접근
- **깊이 제한**: `findNodesByDepth`에서 깊이 제한으로 불필요한 순회 방지

#### 3.3.2 전체 순회 활용
- **고아 노드 검색**: `findNodes`, `findNodesByAttribute`, `findNodesByText`, `searchText`에서 고아 노드 포함
- **데이터 무결성**: 정리 작업, 디버깅 시 모든 노드 검색 필요
- **Overlay-aware**: 모든 메서드에서 현재 상태 반영

#### 3.3.3 메서드별 최적화 전략
- **성능 우선**: 일반적인 검색 작업에서 DocumentIterator 사용
- **완전성 우선**: 데이터 무결성 검사에서 전체 순회 사용
- **적절한 조합**: 요구사항에 따라 적절한 방식 선택

## 4. ContentOperations

### 4.1 목적
부모-자식 관계를 관리하고, 노드의 이동, 복사, 재정렬 기능을 제공합니다.

### 4.2 주요 메서드

#### 4.2.1 addChild(parentId: string, child: INode | string, position?: number): string
```typescript
// 자식 노드 추가
const childId = dataStore.addChild('para-1', {
  id: 'text-2',
  type: 'inline-text',
  text: 'New text'
}, 0); // 첫 번째 위치에 추가
```

#### 4.2.2 removeChild(parentId: string, childId: string): boolean
```typescript
// 자식 노드 제거
const removed = dataStore.removeChild('para-1', 'text-1');
```

#### 4.2.3 moveNode(nodeId: string, newParentId: string, position?: number): void
```typescript
// 노드 이동
dataStore.moveNode('text-1', 'para-2', 1); // para-2의 두 번째 위치로 이동
```

#### 4.2.4 copyNode(nodeId: string, newParentId?: string): string
```typescript
// 노드 복사
const copiedId = dataStore.copyNode('text-1', 'para-2');
```

#### 4.2.5 cloneNodeWithChildren(nodeId: string, newParentId?: string): string
```typescript
// 서브트리 전체 복사
const clonedId = dataStore.cloneNodeWithChildren('para-1', 'doc-2');
```

#### 4.2.6 reorderChildren(parentId: string, childIds: string[]): void
```typescript
// 자식 노드 순서 변경
dataStore.reorderChildren('para-1', ['text-3', 'text-1', 'text-2']);
```

### 4.3 일괄 작업

#### 4.3.1 addChildren(parentId: string, children: (INode | string)[], position?: number): string[]
```typescript
// 여러 자식 노드 일괄 추가
const childIds = dataStore.addChildren('doc-1', [
  { id: 'para-1', type: 'paragraph', content: [] },
  { id: 'para-2', type: 'paragraph', content: [] }
]);
```

#### 4.3.2 removeChildren(parentId: string, childIds: string[]): boolean[]
```typescript
// 여러 자식 노드 일괄 제거
const results = dataStore.removeChildren('doc-1', ['para-1', 'para-2']);
```

#### 4.3.3 moveChildren(fromParentId: string, toParentId: string, childIds: string[], position?: number): void
```typescript
// 여러 자식 노드 일괄 이동
dataStore.moveChildren('doc-1', 'doc-2', ['para-1', 'para-2'], 0);
```

## 5. SplitMergeOperations

### 5.1 목적
텍스트와 블록의 분할/병합 기능을 제공하며, 텍스트 편집기의 핵심 기능을 지원합니다.

### 5.2 텍스트 분할/병합 (기본)

#### 5.2.1 splitTextNode(nodeId: string, splitPosition: number): string
```typescript
// 텍스트 노드 분할 (Enter 키)
const newTextId = dataStore.splitTextNode('text-1', 5);
// "Hello World" → "Hello" + " World"
```

#### 5.2.2 mergeTextNodes(leftNodeId: string, rightNodeId: string): string
```typescript
// 텍스트 노드 병합 (Backspace 키)
const mergedId = dataStore.mergeTextNodes('text-1', 'text-2');
// "Hello" + " World" → "Hello World"
```

#### 5.2.3 splitTextRange(nodeId: string, startPosition: number, endPosition: number): string
```typescript
// 텍스트 범위 분할
const middleNodeId = dataStore.splitTextRange('text-1', 3, 8);
// "Hello World" → "Hel" + "lo Wo" + "rld"
```

#### 5.2.4 autoMergeTextNodes(nodeId: string): string
```typescript
// 자동 병합 (양쪽 텍스트 노드와 병합)
const mergedId = dataStore.autoMergeTextNodes('text-2');
```

### 5.3 블록 분할/병합

#### 5.3.1 splitBlockNode(nodeId: string, splitPosition: number): string
```typescript
// 블록 노드 분할
const newBlockId = dataStore.splitBlockNode('para-1', 2);
// 두 번째 자식 이후에서 분할
```

#### 5.3.2 mergeBlockNodes(leftNodeId: string, rightNodeId: string): string
```typescript
// 블록 노드 병합
const mergedId = dataStore.mergeBlockNodes('para-1', 'para-2');
```

### 5.4 텍스트 편집 (RangeOperations 위임)

#### 5.4.1 insertText(contentRange: ContentRange, text: string): string
```typescript
// 같은 위치 범위에 텍스트 삽입
const range = { startNodeId: 'text-1', startOffset: 5, endNodeId: 'text-1', endOffset: 5 };
dataStore.insertText(range, ' Beautiful');
// "Hello World" → "Hello Beautiful World"
```

#### 5.4.2 deleteText(contentRange: ContentRange): string
```typescript
// 텍스트 범위 삭제
const range = { startNodeId: 'text-1', startOffset: 5, endNodeId: 'text-1', endOffset: 11 };
dataStore.deleteText(range);
// "Hello World" → "Hello"
```

#### 5.4.3 replaceText(contentRange: ContentRange, newText: string): string
```typescript
// 텍스트 범위 교체
const range = { startNodeId: 'text-1', startOffset: 6, endNodeId: 'text-1', endOffset: 11 };
dataStore.replaceText(range, 'Universe');
// "Hello World" → "Hello Universe"
```

### 5.5 마크 보존

분할/병합 시 마크가 올바르게 보존됩니다:
- 분할 시: 마크 범위가 자동으로 조정
- 병합 시: 마크가 올바르게 병합
- 삽입/삭제 시: 마크 범위가 자동으로 업데이트

## 6. MarkOperations

### 6.1 목적
마크의 정규화, 통계, 최적화 기능을 제공합니다.

### 6.2 마크 정규화/적용

#### 6.2.1 normalizeMarks(nodeId: string): void
```typescript
// Range 기반 마크 적용/제거/정리
const range = { startNodeId: 'text-1', startOffset: 0, endNodeId: 'text-1', endOffset: 5 };
dataStore.applyMark(range, { type: 'bold' });
dataStore.removeMark(range, 'bold');
dataStore.clearFormatting(range);
// 개별 노드 마크 정규화
dataStore.normalizeMarks('text-1');
```

#### 6.2.2 normalizeAllMarks(): number
```typescript
// 모든 노드의 마크 정규화
const normalizedCount = dataStore.normalizeAllMarks();
console.log(`Normalized ${normalizedCount} nodes`);
```

### 6.3 마크 통계

#### 6.3.1 getMarkStatistics(nodeId: string): MarkStatistics
```typescript
// 마크 통계 조회
const stats = dataStore.getMarkStatistics('text-1');
console.log(`Total marks: ${stats.totalMarks}`);
console.log(`Overlapping marks: ${stats.overlappingMarks}`);
console.log(`Empty marks: ${stats.emptyMarks}`);
```

#### 6.3.2 removeEmptyMarks(nodeId: string): number
```typescript
// 빈 마크 제거
const removedCount = dataStore.removeEmptyMarks('text-1');
console.log(`Removed ${removedCount} empty marks`);
```

### 6.4 마크 최적화

#### 6.4.1 중복 제거
- 동일한 타입과 범위의 마크 병합
- 불필요한 마크 제거

#### 6.4.2 겹침 처리
- 겹치는 마크 범위 병합
- 마크 우선순위 처리

#### 6.4.3 범위 정규화
- 빈 범위 마크 제거
- 범위 경계 정리

## 7. RangeOperations

### 7.1 목적
ContentRange 기반 텍스트/마크 조작을 제공합니다. 범위는 서로 다른 텍스트 노드를 가로지를 수 있으며, 내부적으로 `createRangeIterator`로 노드 범위를 순회합니다.

### 7.2 텍스트 조작

#### 7.2.1 deleteText(range: ContentRange): string
```typescript
// 범위 내 텍스트 삭제 (다중 노드 가능)
const range = { startNodeId: 'text-1', startOffset: 5, endNodeId: 'text-3', endOffset: 10 };
const deleted = dataStore.deleteText(range);
```

#### 7.2.2 insertText(range: ContentRange, text: string): string
```typescript
// 단일 위치 삽입 (start==end)
const caret = { startNodeId: 'text-1', startOffset: 5, endNodeId: 'text-1', endOffset: 5 };
dataStore.insertText(caret, ' Beautiful');
```

#### 7.2.3 replaceText(range: ContentRange, newText: string): string
```typescript
// 범위 교체 후, 삭제된 텍스트 반환
const deleted = dataStore.replaceText(range, 'Universe');
```

#### 7.2.4 extractText(range: ContentRange): string
```typescript
// 범위 텍스트 추출 (원본 변경 없음)
const extracted = dataStore.extractText(range);
```

#### 7.2.5 copyText(range: ContentRange): string
```typescript
// extractText 별칭
const copied = dataStore.copyText(range);
```

#### 7.2.6 moveText(fromRange: ContentRange, toRange: ContentRange): string
```typescript
// 텍스트 이동 (삭제 후 삽입)
dataStore.moveText(
  { startNodeId: 'text-1', startOffset: 0, endNodeId: 'text-1', endOffset: 5 },
  { startNodeId: 'text-2', startOffset: 0, endNodeId: 'text-2', endOffset: 0 }
);
```

#### 7.2.7 duplicateText(range: ContentRange): string
```typescript
// 범위 텍스트를 끝 위치에 복제 삽입
dataStore.duplicateText({ startNodeId: 'text-1', startOffset: 0, endNodeId: 'text-1', endOffset: 5 });
```

### 7.3 마크 조작

#### 7.3.1 applyMark(range: ContentRange, mark: IMark): IMark
#### 7.3.2 removeMark(range: ContentRange, markType: string): number
#### 7.3.3 clearFormatting(range: ContentRange): number
#### 7.3.4 toggleMark(range: ContentRange, markType: string, attrs?): void
#### 7.3.5 constrainMarksToRange(range: ContentRange): number

### 7.4 텍스트 유틸리티

#### 7.4.1 findText(range: ContentRange, searchText: string): number
#### 7.4.2 getTextLength(range: ContentRange): number
#### 7.4.3 trimText(range: ContentRange): number
#### 7.4.4 normalizeWhitespace(range: ContentRange): string
#### 7.4.5 wrap(range: ContentRange, prefix: string, suffix: string): string
#### 7.4.6 unwrap(range: ContentRange, prefix: string, suffix: string): string
#### 7.4.7 replace(range: ContentRange, pattern: string|RegExp, replacement: string): number
#### 7.4.8 findAll(range: ContentRange, pattern: string|RegExp): Array<{ start: number; end: number }>
#### 7.4.9 indent(range: ContentRange, indent = '  '): string
#### 7.4.10 outdent(range: ContentRange, indent = '  '): string
#### 7.4.11 expandToWord(range: ContentRange): ContentRange
#### 7.4.12 expandToLine(range: ContentRange): ContentRange
#### 7.4.13 normalizeRange(range: ContentRange): ContentRange

## 8. UtilityOperations

### 8.1 목적
데이터 분석, 복제, 관계 검사 등의 유틸리티 기능을 제공합니다.

### 8.2 데이터 분석

#### 8.2.1 getNodeCount(): number
```typescript
// 전체 노드 수 조회
const totalNodes = dataStore.getNodeCount();
```

#### 8.2.2 getAllNodes(): INode[]
```typescript
// 모든 노드 조회
const allNodes = dataStore.getAllNodes();
```

#### 8.2.3 getAllNodesMap(): Map<string, INode>
```typescript
// 모든 노드의 Map 반환
const nodesMap = dataStore.getAllNodesMap();
```

### 8.3 데이터 복제

#### 8.3.1 clone(): DataStore
```typescript
// DataStore 전체 복제
const clonedStore = dataStore.clone();
```

#### 8.3.2 restoreFromSnapshot(nodes: Map<string, INode>, rootNodeId?: string, version: number = 1): void
```typescript
// 스냅샷에서 복원
const newStore = new DataStore();
newStore.restoreFromSnapshot(snapshot, 'doc-1', 1);
```

### 8.4 관계 검사

#### 8.4.1 hasNode(nodeId: string): boolean
```typescript
// 노드 존재 여부 확인
const exists = dataStore.hasNode('text-1');
```

#### 8.4.2 getChildCount(nodeId: string): number
```typescript
// 자식 노드 수 조회
const childCount = dataStore.getChildCount('para-1');
```

#### 8.4.3 isLeafNode(nodeId: string): boolean
```typescript
// 리프 노드 여부 확인
const isLeaf = dataStore.isLeafNode('text-1');
```

#### 8.4.4 isRootNode(nodeId: string): boolean
```typescript
// 루트 노드 여부 확인
const isRoot = dataStore.isRootNode('doc-1');
```

#### 8.4.5 isDescendant(nodeId: string, ancestorId: string): boolean
```typescript
// 조상-후손 관계 확인
const isDescendant = dataStore.isDescendant('text-1', 'doc-1');
```

### 8.5 경로 및 깊이

#### 8.5.1 getNodePath(nodeId: string): string[]
```typescript
// 노드 경로 조회
const path = dataStore.getNodePath('text-1');
// ['doc-1', 'para-1', 'text-1']
```

#### 8.5.2 getNodeDepth(nodeId: string): number
```typescript
// 노드 깊이 조회
const depth = dataStore.getNodeDepth('text-1'); // 2
```

#### 8.5.3 getAllDescendants(nodeId: string): INode[]
```typescript
// 모든 후손 노드 조회
const descendants = dataStore.getAllDescendants('doc-1');
```

#### 8.5.4 getAllAncestors(nodeId: string): INode[]
```typescript
// 모든 조상 노드 조회
const ancestors = dataStore.getAllAncestors('text-1');
```

### 8.6 형제 노드

#### 8.6.1 getSiblings(nodeId: string): INode[]
```typescript
// 형제 노드들 조회
const siblings = dataStore.getSiblings('text-1');
```

#### 8.6.2 getSiblingIndex(nodeId: string): number
```typescript
// 형제 노드 중 인덱스 조회
const index = dataStore.getSiblingIndex('text-1'); // 0, 1, 2...
```

## 9. 성능 고려사항

### 9.1 메모리 사용량
- ID 기반 참조로 메모리 효율성 확보
- 중첩 구조 대신 평면적 저장
- 불필요한 복사 최소화

### 9.2 연산 복잡도
- 대부분의 기본 연산이 O(1)
- 검색 연산은 O(n)이지만 인덱싱으로 최적화
- 복잡한 쿼리는 캐싱으로 성능 향상

### 9.3 확장성
- 새로운 연산 클래스 추가 용이
- 기존 클래스 수정 없이 기능 확장
- 독립적인 테스트 및 유지보수 가능

---

이 문서는 DataStore의 각 연산 클래스별 상세 기능을 다룹니다. 실제 사용 예제는 [DataStore Usage Scenarios](./datastore-usage-scenarios.md)를 참조하세요.
