# DataStore API Reference

본 문서는 공개 API 시그니처와 주요 동작을 요약한다. 상세 정책은 `datastore-spec.md`를 참조.

## Transaction (수집)

- begin(): void
- getCollectedOperations(): AtomicOperation[]
- end(): AtomicOperation[]
- commit(): void
- rollback(): void

## Core/Utility

- setNode(node: INode, validate = true): void
- updateNode(nodeId: string, updates: Partial<INode>, validate = true): { valid: true; errors: [] } | { valid: false; errors: string[] }
- deleteNode(nodeId: string): boolean
- getNode(nodeId: string): INode | undefined
- createNodeWithChildren(node: INode, schema?: Schema): INode
- getAllNodes(): INode[]
- getAllNodesMap(): Map<string, INode>
- getRootNode(): INode | undefined
- getRootNodeId(): string | undefined
- setRoot(rootId: string): void
- setRootNodeId(nodeId: string): void

## Content

- addChild(parentId: string, child: INode | string, position?: number): string
- removeChild(parentId: string, childId: string): boolean
- moveNode(nodeId: string, newParentId: string, position?: number): void
- reorderChildren(parentId: string, childIds: string[]): void
- addChildren(parentId: string, children: (INode | string)[], position?: number): string[]
- removeChildren(parentId: string, childIds: string[]): boolean[]
- moveChildren(fromParentId: string, toParentId: string, childIds: string[], position?: number): void
- copyNode(nodeId: string, newParentId?: string): string
- cloneNodeWithChildren(nodeId: string, newParentId?: string): string

## Marks/Range(Text)

- normalizeMarks(nodeId: string): void
- normalizeAllMarks(): number
- getMarkStatistics(nodeId: string): { totalMarks: number; markTypes: Record<string, number>; overlappingMarks: number; emptyMarks: number }
- removeEmptyMarks(nodeId: string): number

- deleteText(range: ContentRange): string
- extractText(range: ContentRange): string
- insertText(range: ContentRange, text: string): string
- replaceText(range: ContentRange, newText: string): string
- copyText(range: ContentRange): string
- moveText(fromRange: ContentRange, toRange: ContentRange): string
- duplicateText(range: ContentRange): string
- applyMark(range: ContentRange, mark: IMark): IMark
- toggleMark(range: ContentRange, markType: string, attrs?: Record<string, any>): void
- removeMark(range: ContentRange, markType: string): number
- clearFormatting(range: ContentRange): number
- constrainMarksToRange(range: ContentRange): number
- findText(range: ContentRange, searchText: string): number
- getTextLength(range: ContentRange): number
- trimText(range: ContentRange): number
- normalizeWhitespace(range: ContentRange): string
- wrap(range: ContentRange, prefix: string, suffix: string): string
- unwrap(range: ContentRange, prefix: string, suffix: string): string
- replace(range: ContentRange, pattern: string | RegExp, replacement: string): number
- findAll(range: ContentRange, pattern: string | RegExp): Array<{ start: number; end: number }>
- expandToWord(range: ContentRange): ContentRange
- expandToLine(range: ContentRange): ContentRange
- normalizeRange(range: ContentRange): ContentRange

## Iterators & Visitors

- createDocumentIterator(options?: DocumentIteratorOptions): DocumentIterator
- createRangeIterator(startNodeId: string, endNodeId: string, options?: { includeStart?: boolean; includeEnd?: boolean; filter?: any; customFilter?: (nodeId: string, node: any) => boolean }): any

- traverse(visitor: DocumentVisitor, options?: VisitorTraversalOptions): { visitedCount: number; skippedCount: number; stopped: boolean }
- traverse(visitors: DocumentVisitor[], options?: VisitorTraversalOptions): Array<{ visitor: DocumentVisitor; result: { visitedCount: number; skippedCount: number; stopped: boolean } }>
- traverse(...visitors: DocumentVisitor[]): Array<{ visitor: DocumentVisitor; result: { visitedCount: number; skippedCount: number; stopped: boolean } }>

본 문서는 DataStore의 공개 API를 간단 요약합니다. 상세 동작/설계는 `datastore-spec.md`를 참고하세요.

## 수집(경량 트랜잭션)
- `begin(): void`
- `getCollectedOperations(): AtomicOperation[]`
- `end(): AtomicOperation[]`
 - `commit(): void`
 - `rollback(): void`

### Notes
- normalizeWhitespace, trimText: 동일 범위를 반복 호출할 때 내용 변화가 없으면 update 오퍼레이션을 발생시키지 않는다.

## Content
- `addChild(parentId, child, position?) → string`
- `removeChild(parentId, childId) → boolean`
- `reorderChildren(parentId, childIds) → void`
- `moveNode(nodeId, newParentId, position?) → void`
- `moveChildren(fromParentId, toParentId, childIds, position?) → void`
- `copyNode(nodeId, newParentId?) → string`
- `cloneNodeWithChildren(nodeId, newParentId?) → string`

## Range/Text/Mark
- 텍스트: `deleteText`, `extractText`, `insertText`, `replaceText`, `copyText`, `moveText`, `duplicateText`
- 마크: `applyMark`, `removeMark`, `clearFormatting`, `toggleMark`, `constrainMarksToRange`
- 검색/정규화: `findText`, `getTextLength`, `trimText`, `normalizeWhitespace`, `wrap`, `unwrap`, `replace`, `findAll`, `expandToWord`, `expandToLine`, `normalizeRange`

## Core/Utility
- Core: `setNode`, `updateNode`, `deleteNode`, `getNode`, `createNodeWithChildren`
- Utility: `getAllNodes`, `getAllNodesMap`, `getRootNodeId`, `getNodePath`, `getNodeDepth`, `compareDocumentOrder`, `getNextNode`, `getPreviousNode`, `createDocumentIterator`, `createRangeIterator`, `traverse`

## Operation 타입(JSON)
단일 op: `{ type, nodeId, timestamp, parentId?, position?, data? }`
배치: `{ sessionId, version, operations: Operation[] }`

## 1. 개요

이 문서는 DataStore의 모든 API를 체계적으로 정리한 레퍼런스입니다. 각 메서드의 시그니처, 매개변수, 반환값, 사용 예제를 포함합니다.

## 2. DataStore 클래스

### 2.1 생성자

```typescript
constructor(rootNodeId?: string, schema?: Schema, sessionId?: number)
```

**매개변수**:
- `rootNodeId` (optional): 루트 노드 ID
- `schema` (optional): 기본 스키마
- `sessionId` (optional): 세션 ID (기본값: 0)

**예제**:
```typescript
const dataStore = new DataStore();
const dataStoreWithSchema = new DataStore('doc-1', schema, 1);
```

### 2.2 연산 클래스 접근자

```typescript
// 각 연산 클래스에 대한 접근자
readonly core: CoreOperations;
readonly query: QueryOperations;
readonly content: ContentOperations;
readonly splitMerge: SplitMergeOperations;
readonly marks: MarkOperations;
readonly multiNodeRange: MultiNodeRangeOperations;
readonly utility: UtilityOperations;
```

## 3. CoreOperations

### 3.1 setNode

```typescript
setNode(node: INode, validate: boolean = true): void
```

**설명**: 노드를 DataStore에 저장합니다.

**매개변수**:
- `node`: 저장할 노드
- `validate`: 스키마 검증 여부 (기본값: true)

**예제**:
```typescript
dataStore.setNode({
  id: 'text-1',
  type: 'inline-text',
  text: 'Hello World'
}, true);
```

### 3.2 getNode

```typescript
getNode(nodeId: string): INode | undefined
```

**설명**: ID로 노드를 조회합니다.

**매개변수**:
- `nodeId`: 조회할 노드 ID

**반환값**: 노드 객체 또는 undefined

**예제**:
```typescript
const node = dataStore.getNode('text-1');
if (node) {
  console.log(node.text);
}
```

### 3.3 deleteNode

```typescript
deleteNode(nodeId: string): boolean
```

**설명**: 노드를 삭제합니다.

**매개변수**:
- `nodeId`: 삭제할 노드 ID

**반환값**: 삭제 성공 여부

**예제**:
```typescript
const deleted = dataStore.deleteNode('text-1');
```

### 3.4 updateNode

```typescript
updateNode(nodeId: string, updates: Partial<INode>, validate: boolean = true): { valid: boolean; errors: string[] } | null
```

**설명**: 노드를 업데이트합니다.

**매개변수**:
- `nodeId`: 업데이트할 노드 ID
- `updates`: 업데이트할 속성들
- `validate`: 스키마 검증 여부

**반환값**: 검증 결과 또는 null (노드가 존재하지 않는 경우)

**예제**:
```typescript
const result = dataStore.updateNode('text-1', {
  text: 'Updated text',
  attributes: { class: 'highlight' }
});
```

### 3.5 createNodeWithChildren

```typescript
createNodeWithChildren(node: INode, schema?: Schema): INode
```

**설명**: 중첩 구조를 가진 노드를 생성합니다.

**매개변수**:
- `node`: 생성할 노드 (중첩 구조 포함)
- `schema`: 사용할 스키마

**반환값**: 생성된 노드

**예제**:
```typescript
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

## 4. QueryOperations

### 4.1 findNodes

```typescript
findNodes(predicate: (node: INode) => boolean): INode[]
```

**설명**: 조건을 만족하는 모든 노드를 찾습니다.

**매개변수**:
- `predicate`: 검색 조건 함수

**반환값**: 조건을 만족하는 노드 배열

**예제**:
```typescript
const paragraphs = dataStore.findNodes(node => node.type === 'paragraph');
```

### 4.2 findNodesByType

```typescript
findNodesByType(type: string): INode[]
```

**설명**: 특정 타입의 노드들을 찾습니다.

**매개변수**:
- `type`: 노드 타입

**반환값**: 해당 타입의 노드 배열

**예제**:
```typescript
const textNodes = dataStore.findNodesByType('inline-text');
```

### 4.3 findNodesByAttribute

```typescript
findNodesByAttribute(key: string, value: any): INode[]
```

**설명**: 특정 속성을 가진 노드들을 찾습니다. 고아 노드 포함 전체 순회를 사용합니다.

**매개변수**:
- `key`: 속성 키
- `value`: 속성 값

**반환값**: 조건을 만족하는 노드 배열 (고아 노드 포함)

**특징**:
- **전체 순회 사용**: 고아 노드 포함 모든 노드 검색
- **Overlay-aware**: 현재 상태 반영 (overlay 변경사항 포함)
- **순서**: Map 순회 순서 (보장되지 않음)

**예제**:
```typescript
const boldNodes = dataStore.findNodesByAttribute('class', 'bold');
```

### 4.4 findNodesByText

```typescript
findNodesByText(text: string): INode[]
```

**설명**: 특정 텍스트가 포함된 노드들을 찾습니다. 고아 노드 포함 전체 순회를 사용합니다.

**매개변수**:
- `text`: 검색할 텍스트

**반환값**: 해당 텍스트가 포함된 노드 배열 (고아 노드 포함)

**특징**:
- **전체 순회 사용**: 고아 노드 포함 모든 노드 검색
- **Overlay-aware**: 현재 상태 반영 (overlay 변경사항 포함)
- **순서**: Map 순회 순서 (보장되지 않음)

**예제**:
```typescript
const helloNodes = dataStore.findNodesByText('Hello');
```

### 4.5 findChildrenByParentId

```typescript
findChildrenByParentId(parentId: string): INode[]
```

**설명**: 특정 노드의 직접 자식들을 객체 배열로 반환합니다. 직접 접근으로 성능을 최적화합니다.

**매개변수**:
- `parentId`: 부모 노드 ID

**반환값**: 자식 노드들의 배열

**특징**:
- **직접 접근 사용**: 부모 노드의 content 배열 직접 접근
- **Overlay-aware**: 현재 상태 반영 (overlay 변경사항 포함)
- **순서**: 문서 순회 순서 (부모가 연결된 경우)

**예제**:
```typescript
const children = dataStore.findChildrenByParentId('para-1');
```

### 4.6 getNodeChildrenDeep

```typescript
getNodeChildrenDeep(nodeId: string): INode[]
```

**설명**: 노드의 모든 하위 노드를 재귀적으로 조회합니다.

**매개변수**:
- `nodeId`: 부모 노드 ID

**반환값**: 모든 하위 노드 배열

**예제**:
```typescript
const allDescendants = dataStore.getNodeChildrenDeep('doc-1');
```

### 4.7 getNodeWithChildren

```typescript
getNodeWithChildren(nodeId: string): INode | null
```

**설명**: 노드와 모든 자식을 중첩 구조로 반환합니다.

**매개변수**:
- `nodeId`: 노드 ID

**반환값**: 중첩 구조의 노드 또는 null

**예제**:
```typescript
const nodeWithChildren = dataStore.getNodeWithChildren('para-1');
```

### 4.8 getAllNodesWithChildren

```typescript
getAllNodesWithChildren(): INode[]
```

**설명**: 모든 노드를 중첩 구조로 반환합니다.

**반환값**: 모든 노드의 중첩 구조 배열

**예제**:
```typescript
const allNodes = dataStore.getAllNodesWithChildren();
```

### 4.9 searchText

```typescript
searchText(query: string): INode[]
```

**설명**: 텍스트 내용으로 노드를 검색합니다 (대소문자 구분 없음). 고아 노드 포함 전체 순회를 사용합니다.

**매개변수**:
- `query`: 검색할 텍스트 (대소문자 구분 없음)

**반환값**: 해당 텍스트를 포함하는 노드들의 배열 (고아 노드 포함)

**특징**:
- **전체 순회 사용**: 고아 노드 포함 모든 노드 검색
- **Overlay-aware**: 현재 상태 반영 (overlay 변경사항 포함)
- **순서**: Map 순회 순서 (보장되지 않음)
- **대소문자 무시**: 쿼리와 노드 텍스트를 모두 소문자로 변환하여 비교

**예제**:
```typescript
const helloNodes = dataStore.searchText('hello world');
```

## 5. ContentOperations

### 5.1 addChild

```typescript
addChild(parentId: string, child: INode | string, position?: number): string
```

**설명**: 부모 노드에 자식을 추가합니다.

**매개변수**:
- `parentId`: 부모 노드 ID
- `child`: 추가할 자식 (노드 객체 또는 ID)
- `position`: 삽입 위치 (기본값: 끝에 추가)

**반환값**: 추가된 자식의 ID

**예제**:
```typescript
const childId = dataStore.addChild('para-1', {
  id: 'text-2',
  type: 'inline-text',
  text: 'New text'
}, 0);
```

### 5.2 removeChild

```typescript
removeChild(parentId: string, childId: string): boolean
```

**설명**: 부모 노드에서 자식을 제거합니다.

**매개변수**:
- `parentId`: 부모 노드 ID
- `childId`: 제거할 자식 ID

**반환값**: 제거 성공 여부

**예제**:
```typescript
const removed = dataStore.removeChild('para-1', 'text-1');
```

### 5.3 moveNode

```typescript
moveNode(nodeId: string, newParentId: string, position?: number): void
```

**설명**: 노드를 다른 부모로 이동합니다.

**매개변수**:
- `nodeId`: 이동할 노드 ID
- `newParentId`: 새로운 부모 ID
- `position`: 새로운 위치 (기본값: 끝에 추가)

**예제**:
```typescript
dataStore.moveNode('text-1', 'para-2', 1);
```

### 5.4 copyNode

```typescript
copyNode(nodeId: string, newParentId?: string): string
```

**설명**: 노드를 복사합니다.

**매개변수**:
- `nodeId`: 복사할 노드 ID
- `newParentId`: 새로운 부모 ID (기본값: 원래 부모)

**반환값**: 복사된 노드의 ID

**예제**:
```typescript
const copiedId = dataStore.copyNode('text-1', 'para-2');
```

### 5.5 cloneNodeWithChildren

```typescript
cloneNodeWithChildren(nodeId: string, newParentId?: string): string
```

**설명**: 노드와 모든 하위 노드를 복사합니다.

**매개변수**:
- `nodeId`: 복사할 노드 ID
- `newParentId`: 새로운 부모 ID

**반환값**: 복사된 노드의 ID

**예제**:
```typescript
const clonedId = dataStore.cloneNodeWithChildren('para-1', 'doc-2');
```

### 5.6 reorderChildren

```typescript
reorderChildren(parentId: string, childIds: string[]): void
```

**설명**: 자식 노드들의 순서를 변경합니다.

**매개변수**:
- `parentId`: 부모 노드 ID
- `childIds`: 새로운 순서의 자식 ID 배열

**예제**:
```typescript
dataStore.reorderChildren('para-1', ['text-3', 'text-1', 'text-2']);
```

### 5.7 addChildren

```typescript
addChildren(parentId: string, children: (INode | string)[], position?: number): string[]
```

**설명**: 여러 자식 노드를 일괄 추가합니다.

**매개변수**:
- `parentId`: 부모 노드 ID
- `children`: 추가할 자식들
- `position`: 삽입 위치

**반환값**: 추가된 자식들의 ID 배열

**예제**:
```typescript
const childIds = dataStore.addChildren('doc-1', [
  { id: 'para-1', type: 'paragraph', content: [] },
  { id: 'para-2', type: 'paragraph', content: [] }
]);
```

### 5.8 removeChildren

```typescript
removeChildren(parentId: string, childIds: string[]): boolean[]
```

**설명**: 여러 자식 노드를 일괄 제거합니다.

**매개변수**:
- `parentId`: 부모 노드 ID
- `childIds`: 제거할 자식 ID 배열

**반환값**: 각 자식의 제거 성공 여부 배열

**예제**:
```typescript
const results = dataStore.removeChildren('doc-1', ['para-1', 'para-2']);
```

### 5.9 moveChildren

```typescript
moveChildren(fromParentId: string, toParentId: string, childIds: string[], position?: number): void
```

**설명**: 여러 자식 노드를 일괄 이동합니다.

**매개변수**:
- `fromParentId`: 원래 부모 ID
- `toParentId`: 새로운 부모 ID
- `childIds`: 이동할 자식 ID 배열
- `position`: 새로운 위치

**예제**:
```typescript
dataStore.moveChildren('doc-1', 'doc-2', ['para-1', 'para-2'], 0);
```

## 6. SplitMergeOperations

### 6.1 splitTextNode

```typescript
splitTextNode(nodeId: string, splitPosition: number): string
```

**설명**: 텍스트 노드를 지정된 위치에서 분할합니다.

**매개변수**:
- `nodeId`: 분할할 텍스트 노드 ID
- `splitPosition`: 분할 위치

**반환값**: 새로 생성된 오른쪽 노드의 ID

**예제**:
```typescript
const newTextId = dataStore.splitTextNode('text-1', 5);
// "Hello World" → "Hello" + " World"
```

### 6.2 mergeTextNodes

```typescript
mergeTextNodes(leftNodeId: string, rightNodeId: string): string
```

**설명**: 두 텍스트 노드를 병합합니다.

**매개변수**:
- `leftNodeId`: 왼쪽 노드 ID
- `rightNodeId`: 오른쪽 노드 ID

**반환값**: 병합된 노드의 ID (왼쪽 노드)

**예제**:
```typescript
const mergedId = dataStore.mergeTextNodes('text-1', 'text-2');
// "Hello" + " World" → "Hello World"
```

### 6.3 splitBlockNode

```typescript
splitBlockNode(nodeId: string, splitPosition: number): string
```

**설명**: 블록 노드를 지정된 위치에서 분할합니다.

**매개변수**:
- `nodeId`: 분할할 블록 노드 ID
- `splitPosition`: 분할 위치 (자식 인덱스)

**반환값**: 새로 생성된 오른쪽 노드의 ID

**예제**:
```typescript
const newBlockId = dataStore.splitBlockNode('para-1', 2);
```

### 6.4 mergeBlockNodes

```typescript
mergeBlockNodes(leftNodeId: string, rightNodeId: string): string
```

**설명**: 두 블록 노드를 병합합니다.

**매개변수**:
- `leftNodeId`: 왼쪽 노드 ID
- `rightNodeId`: 오른쪽 노드 ID

**반환값**: 병합된 노드의 ID (왼쪽 노드)

**예제**:
```typescript
const mergedId = dataStore.mergeBlockNodes('para-1', 'para-2');
```

### 6.5 splitTextRange

```typescript
splitTextRange(nodeId: string, startPosition: number, endPosition: number): string
```

**설명**: 텍스트 노드의 특정 범위를 분할합니다.

**매개변수**:
- `nodeId`: 분할할 텍스트 노드 ID
- `startPosition`: 시작 위치
- `endPosition`: 끝 위치

**반환값**: 중간에 생성된 노드의 ID

**예제**:
```typescript
const middleNodeId = dataStore.splitTextRange('text-1', 3, 8);
// "Hello World" → "Hel" + "lo Wo" + "rld"
```

### 6.6 autoMergeTextNodes

```typescript
autoMergeTextNodes(nodeId: string): string
```

**설명**: 노드와 양쪽 인접한 텍스트 노드를 자동으로 병합합니다.

**매개변수**:
- `nodeId`: 중앙 노드 ID

**반환값**: 병합된 노드의 ID

**예제**:
```typescript
const mergedId = dataStore.autoMergeTextNodes('text-2');
```

### 6.7 insertText

```typescript
insertText(nodeId: string, position: number, text: string): string
```

**설명**: 텍스트 노드에 텍스트를 삽입합니다.

**매개변수**:
- `nodeId`: 텍스트 노드 ID
- `position`: 삽입 위치
- `text`: 삽입할 텍스트

**반환값**: 수정된 노드의 ID

**예제**:
```typescript
const newTextId = dataStore.insertText('text-1', 5, ' Beautiful');
// "Hello World" → "Hello Beautiful World"
```

### 6.8 deleteTextRange

```typescript
deleteTextRange(nodeId: string, startPosition: number, endPosition: number): string
```

**설명**: 텍스트 노드에서 특정 범위를 삭제합니다.

**매개변수**:
- `nodeId`: 텍스트 노드 ID
- `startPosition`: 시작 위치
- `endPosition`: 끝 위치

**반환값**: 수정된 노드의 ID

**예제**:
```typescript
const newTextId = dataStore.deleteTextRange('text-1', 5, 11);
// "Hello World" → "Hello"
```

### 6.9 replaceTextRange

```typescript
replaceTextRange(nodeId: string, startPosition: number, endPosition: number, newText: string): string
```

**설명**: 텍스트 노드에서 특정 범위를 새로운 텍스트로 교체합니다.

**매개변수**:
- `nodeId`: 텍스트 노드 ID
- `startPosition`: 시작 위치
- `endPosition`: 끝 위치
- `newText`: 교체할 새로운 텍스트

**반환값**: 교체된 원본 텍스트

**예제**:
```typescript
const replacedText = dataStore.replaceTextRange('text-1', 6, 11, 'Universe');
// "Hello World" → "Hello Universe"
// 반환값: "World"
```

## 7. MarkOperations

### 7.1 normalizeMarks

```typescript
normalizeMarks(nodeId: string): void
```

**설명**: 노드의 마크를 정규화합니다.

**매개변수**:
- `nodeId`: 정규화할 노드 ID

**예제**:
```typescript
dataStore.normalizeMarks('text-1');
```

### 7.2 normalizeAllMarks

```typescript
normalizeAllMarks(): number
```

**설명**: 모든 노드의 마크를 정규화합니다.

**반환값**: 정규화된 노드 수

**예제**:
```typescript
const normalizedCount = dataStore.normalizeAllMarks();
```

### 7.3 getMarkStatistics

```typescript
getMarkStatistics(nodeId: string): {
  totalMarks: number;
  markTypes: Record<string, number>;
  overlappingMarks: number;
  emptyMarks: number;
}
```

**설명**: 노드의 마크 통계를 조회합니다.

**매개변수**:
- `nodeId`: 통계를 조회할 노드 ID

**반환값**: 마크 통계 객체

**예제**:
```typescript
const stats = dataStore.getMarkStatistics('text-1');
console.log(`Total marks: ${stats.totalMarks}`);
```

### 7.4 removeEmptyMarks

```typescript
removeEmptyMarks(nodeId: string): number
```

**설명**: 노드의 빈 마크를 제거합니다.

**매개변수**:
- `nodeId`: 빈 마크를 제거할 노드 ID

**반환값**: 제거된 마크 수

**예제**:
```typescript
const removedCount = dataStore.removeEmptyMarks('text-1');
```

## 8. MultiNodeRangeOperations

### 8.1 deleteMultiNodeRange

```typescript
deleteMultiNodeRange(startNodeId: string, startOffset: number, endNodeId: string, endOffset: number): string
```

**설명**: 여러 노드에 걸친 텍스트를 삭제합니다.

**매개변수**:
- `startNodeId`: 시작 노드 ID
- `startOffset`: 시작 오프셋
- `endNodeId`: 끝 노드 ID
- `endOffset`: 끝 오프셋

**반환값**: 삭제된 내용의 ID

**예제**:
```typescript
const deletedContent = dataStore.deleteMultiNodeRange('text-1', 5, 'text-3', 10);
```

### 8.2 insertTextAtMultiNodeRange

```typescript
insertTextAtMultiNodeRange(startNodeId: string, startOffset: number, endNodeId: string, endOffset: number, text: string): void
```

**설명**: 여러 노드에 걸친 위치에 텍스트를 삽입합니다.

**매개변수**:
- `startNodeId`: 시작 노드 ID
- `startOffset`: 시작 오프셋
- `endNodeId`: 끝 노드 ID
- `endOffset`: 끝 오프셋
- `text`: 삽입할 텍스트

**예제**:
```typescript
dataStore.insertTextAtMultiNodeRange('text-1', 5, 'text-3', 10, 'New content');
```

### 8.3 extractMultiNodeRange

```typescript
extractMultiNodeRange(startNodeId: string, startOffset: number, endNodeId: string, endOffset: number): string
```

**설명**: 여러 노드에 걸친 텍스트를 추출합니다.

**매개변수**:
- `startNodeId`: 시작 노드 ID
- `startOffset`: 시작 오프셋
- `endNodeId`: 끝 노드 ID
- `endOffset`: 끝 오프셋

**반환값**: 추출된 텍스트의 ID

**예제**:
```typescript
const extractedText = dataStore.extractMultiNodeRange('text-1', 0, 'text-3', 5);
```

### 8.4 applyMarkToMultiNodeRange

```typescript
applyMarkToMultiNodeRange(startNodeId: string, startOffset: number, endNodeId: string, endOffset: number, mark: IMark): void
```

**설명**: 여러 노드에 걸친 범위에 마크를 적용합니다.

**매개변수**:
- `startNodeId`: 시작 노드 ID
- `startOffset`: 시작 오프셋
- `endNodeId`: 끝 노드 ID
- `endOffset`: 끝 오프셋
- `mark`: 적용할 마크

**예제**:
```typescript
dataStore.applyMarkToMultiNodeRange('text-1', 0, 'text-3', 5, {
  type: 'bold',
  range: [0, 20]
});
```

### 8.5 removeMarkFromMultiNodeRange

```typescript
removeMarkFromMultiNodeRange(startNodeId: string, startOffset: number, endNodeId: string, endOffset: number, markType: string): void
```

**설명**: 여러 노드에 걸친 범위에서 마크를 제거합니다.

**매개변수**:
- `startNodeId`: 시작 노드 ID
- `startOffset`: 시작 오프셋
- `endNodeId`: 끝 노드 ID
- `endOffset`: 끝 오프셋
- `markType`: 제거할 마크 타입

**예제**:
```typescript
dataStore.removeMarkFromMultiNodeRange('text-1', 0, 'text-3', 5, 'bold');
```

## 9. UtilityOperations

### 9.1 getNodeCount

```typescript
getNodeCount(): number
```

**설명**: 전체 노드 수를 조회합니다.

**반환값**: 노드 수

**예제**:
```typescript
const totalNodes = dataStore.getNodeCount();
```

### 9.2 clone

```typescript
clone(): DataStore
```

**설명**: DataStore를 복제합니다.

**반환값**: 복제된 DataStore 인스턴스

**예제**:
```typescript
const clonedStore = dataStore.clone();
```

### 9.3 getAllNodes

```typescript
getAllNodes(): INode[]
```

**설명**: 모든 노드를 조회합니다.

**반환값**: 모든 노드 배열

**예제**:
```typescript
const allNodes = dataStore.getAllNodes();
```

### 9.4 getAllNodesMap

```typescript
getAllNodesMap(): Map<string, INode>
```

**설명**: 모든 노드의 Map을 반환합니다.

**반환값**: 노드 Map

**예제**:
```typescript
const nodesMap = dataStore.getAllNodesMap();
```

### 9.5 hasNode

```typescript
hasNode(nodeId: string): boolean
```

**설명**: 노드 존재 여부를 확인합니다.

**매개변수**:
- `nodeId`: 확인할 노드 ID

**반환값**: 존재 여부

**예제**:
```typescript
const exists = dataStore.hasNode('text-1');
```

### 9.6 getChildCount

```typescript
getChildCount(nodeId: string): number
```

**설명**: 노드의 자식 수를 조회합니다.

**매개변수**:
- `nodeId`: 부모 노드 ID

**반환값**: 자식 수

**예제**:
```typescript
const childCount = dataStore.getChildCount('para-1');
```

### 9.7 isLeafNode

```typescript
isLeafNode(nodeId: string): boolean
```

**설명**: 노드가 리프 노드인지 확인합니다.

**매개변수**:
- `nodeId`: 확인할 노드 ID

**반환값**: 리프 노드 여부

**예제**:
```typescript
const isLeaf = dataStore.isLeafNode('text-1');
```

### 9.8 isRootNode

```typescript
isRootNode(nodeId: string): boolean
```

**설명**: 노드가 루트 노드인지 확인합니다.

**매개변수**:
- `nodeId`: 확인할 노드 ID

**반환값**: 루트 노드 여부

**예제**:
```typescript
const isRoot = dataStore.isRootNode('doc-1');
```

### 9.9 isDescendant

```typescript
isDescendant(nodeId: string, ancestorId: string): boolean
```

**설명**: 노드가 다른 노드의 후손인지 확인합니다.

**매개변수**:
- `nodeId`: 확인할 노드 ID
- `ancestorId`: 조상 노드 ID

**반환값**: 후손 여부

**예제**:
```typescript
const isDescendant = dataStore.isDescendant('text-1', 'doc-1');
```

### 9.10 getNodePath

```typescript
getNodePath(nodeId: string): string[]
```

**설명**: 노드의 경로를 조회합니다.

**매개변수**:
- `nodeId`: 경로를 조회할 노드 ID

**반환값**: 경로 배열 (루트부터 해당 노드까지)

**예제**:
```typescript
const path = dataStore.getNodePath('text-1');
// ['doc-1', 'para-1', 'text-1']
```

### 9.11 getNodeDepth

```typescript
getNodeDepth(nodeId: string): number
```

**설명**: 노드의 깊이를 조회합니다.

**매개변수**:
- `nodeId`: 깊이를 조회할 노드 ID

**반환값**: 깊이 (루트는 0)

**예제**:
```typescript
const depth = dataStore.getNodeDepth('text-1'); // 2
```

### 9.12 getAllDescendants

```typescript
getAllDescendants(nodeId: string): INode[]
```

**설명**: 노드의 모든 후손을 조회합니다.

**매개변수**:
- `nodeId`: 부모 노드 ID

**반환값**: 모든 후손 노드 배열

**예제**:
```typescript
const descendants = dataStore.getAllDescendants('doc-1');
```

### 9.13 getAllAncestors

```typescript
getAllAncestors(nodeId: string): INode[]
```

**설명**: 노드의 모든 조상을 조회합니다.

**매개변수**:
- `nodeId`: 조상을 조회할 노드 ID

**반환값**: 모든 조상 노드 배열

**예제**:
```typescript
const ancestors = dataStore.getAllAncestors('text-1');
```

### 9.14 getSiblings

```typescript
getSiblings(nodeId: string): INode[]
```

**설명**: 노드의 형제 노드들을 조회합니다.

**매개변수**:
- `nodeId`: 형제를 조회할 노드 ID

**반환값**: 형제 노드 배열

**예제**:
```typescript
const siblings = dataStore.getSiblings('text-1');
```

### 9.15 getSiblingIndex

```typescript
getSiblingIndex(nodeId: string): number
```

**설명**: 노드의 형제 중 인덱스를 조회합니다.

**매개변수**:
- `nodeId`: 인덱스를 조회할 노드 ID

**반환값**: 형제 중 인덱스 (0부터 시작)

**예제**:
```typescript
const index = dataStore.getSiblingIndex('text-1'); // 0, 1, 2...
```

### 9.16 restoreFromSnapshot

```typescript
restoreFromSnapshot(nodes: Map<string, INode>, rootNodeId?: string, version: number = 1): void
```

**설명**: 스냅샷에서 DataStore를 복원합니다.

**매개변수**:
- `nodes`: 노드 Map
- `rootNodeId`: 루트 노드 ID
- `version`: 버전 번호

**예제**:
```typescript
dataStore.restoreFromSnapshot(snapshot, 'doc-1', 1);
```

## 10. 이벤트 시스템

### 10.1 onOperation

```typescript
onOperation(callback: (operation: AtomicOperation) => void, operationType?: string): () => void
```

**설명**: Operation 이벤트를 구독합니다.

**매개변수**:
- `callback`: 이벤트 콜백 함수
- `operationType`: 특정 타입만 구독 (선택사항)

**반환값**: 구독 해제 함수

**예제**:
```typescript
const unsubscribe = dataStore.onOperation((operation) => {
  console.log('Operation:', operation.type, operation.nodeId);
});
```

### 10.2 offOperation

```typescript
offOperation(callback: (operation: AtomicOperation) => void): void
```

**설명**: Operation 이벤트 구독을 해제합니다.

**매개변수**:
- `callback`: 구독 해제할 콜백 함수

**예제**:
```typescript
dataStore.offOperation(handler);
```

## 11. 스키마 관리

### 11.1 registerSchema

```typescript
registerSchema(schema: Schema): void
```

**설명**: 스키마를 등록합니다.

**매개변수**:
- `schema`: 등록할 스키마

**예제**:
```typescript
dataStore.registerSchema(schema);
```

### 11.2 setActiveSchema

```typescript
setActiveSchema(schema: Schema): void
```

**설명**: 활성 스키마를 설정합니다.

**매개변수**:
- `schema`: 활성화할 스키마

**예제**:
```typescript
dataStore.setActiveSchema(schema);
```

### 11.3 getActiveSchema

```typescript
getActiveSchema(): Schema | undefined
```

**설명**: 활성 스키마를 조회합니다.

**반환값**: 활성 스키마 또는 undefined

**예제**:
```typescript
const activeSchema = dataStore.getActiveSchema();
```

### 11.4 validateNode

```typescript
validateNode(node: INode, schema?: Schema): ValidationResult
```

**설명**: 노드를 스키마로 검증합니다.

**매개변수**:
- `node`: 검증할 노드
- `schema`: 사용할 스키마 (기본값: 활성 스키마)

**반환값**: 검증 결과

**예제**:
```typescript
const result = dataStore.validateNode(node, schema);
if (!result.valid) {
  console.log('Validation errors:', result.errors);
}
```

---

이 API 레퍼런스는 DataStore의 모든 공개 메서드를 다룹니다. 더 자세한 사용 예제는 [DataStore Usage Scenarios](./datastore-usage-scenarios.md)를 참조하세요.
