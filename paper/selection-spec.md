# Selection System Specification

## Overview

Selection 시스템은 Barocss Editor에서 문서의 특정 부분을 선택하고 조작할 수 있는 핵심 기능입니다. 본 문서는 Model 레벨에서의 Selection 관리와 DOM ↔ Model 간의 양방향 변환을 다룹니다.

### 주요 원칙

- **Model 중심**: Selection 상태는 Model 레벨에서 관리
- **DOM 분리**: DOM 조작은 editor-view-dom에서 처리
- **양방향 변환**: DOM Selection ↔ Model Selection 자동 변환
- **Text Run Index**: 중첩된 마크 구조에서 정확한 위치 매핑
- **안전한 검증**: DOM에 있지만 Model에 없는 요소는 안전하게 처리

## Core Concepts

### 1. Model Selection 구조

```typescript
// Model 레벨에서의 Selection 표현
interface ModelSelection {
  anchorId: string;      // 선택 시작점 노드 ID
  anchorOffset: number;  // 선택 시작점 오프셋
  focusId: string;       // 선택 끝점 노드 ID  
  focusOffset: number;   // 선택 끝점 오프셋
}

// SelectionManager 기본 API
class SelectionManager {
  getCurrentSelection(): ModelSelection | null;
  setSelection(selection: ModelSelection | null): void;
  clearSelection(): void;
  isEmpty(): boolean;
  isInNode(nodeId: string): boolean;
  isAtPosition(nodeId: string, position: number): boolean;
  isInRange(nodeId: string, start: number, end: number): boolean;
  overlapsWith(nodeId: string, start: number, end: number): boolean;
}
```


### 2. DOM ↔ Model 변환 시스템

#### 2.1 DOMSelectionHandler

```typescript
interface DOMSelectionHandler {
  handleSelectionChange(): void;
  convertDOMSelectionToModel(selection: Selection): any;
  convertModelSelectionToDOM(modelSelection: any): void;
}

// DOM Selection → Model Selection 변환
convertDOMSelectionToModel(selection: Selection): ModelSelection {
  // 1. data-bc-sid 속성을 가진 요소 찾기
  // 2. Text Run Index로 정확한 offset 계산  
  // 3. Model에 노드가 존재하는지 검증
  // 4. Model Selection 객체 생성
}

// Model Selection → DOM Selection 변환
convertModelSelectionToDOM(modelSelection: ModelSelection): void {
  // 1. 텍스트 컨테이너 식별 (data-text-container="true")
  // 2. Text Run Index로 DOM Text 노드 찾기
  // 3. Binary Search로 정확한 offset 매핑
  // 4. DOM Range 생성 및 선택 적용
}
```

#### 2.2 Text Run Index 시스템

중첩된 마크 구조에서 정확한 DOM ↔ Model 위치 매핑을 위한 시스템입니다.

```typescript
interface TextRun {
  domTextNode: Text;        // DOM Text 노드
  start: number;            // 시작 오프셋
  end: number;              // 끝 오프셋 (exclusive)
}

interface ContainerRuns {
  runs: TextRun[];          // Text Run 배열
  total: number;            // 총 텍스트 길이
  byNode?: Map<Text, { start: number; end: number }>; // O(1) 역매핑
}

// Text Run Index 생성
function buildTextRunIndex(container: Element): ContainerRuns {
  // 1. 컨테이너 내 모든 Text 노드 순회
  // 2. 각 Text 노드의 길이를 누적하여 오프셋 계산
  // 3. byNode Map으로 O(1) 역매핑 지원
}

// Binary Search로 효율적인 offset 변환
function binarySearchRun(runs: TextRun[], targetOffset: number): number {
  // O(log n) 시간복잡도로 적절한 Text Run 찾기
}
```

#### 2.3 Model 검증 및 안전성

```typescript
// Model에 노드가 실제로 존재하는지 확인
private nodeExistsInModel(nodeId: string): boolean {
  try {
    if (this.editor.dataStore) {
      const node = this.editor.dataStore.getNode(nodeId);
      return node !== null && node !== undefined;
    }
    return true; // dataStore가 없는 경우 기본값
  } catch (error) {
    console.warn('[SelectionHandler] Error checking node existence:', error);
    return false;
  }
}

// DOM에 있지만 Model에 없는 요소 처리
if (!this.nodeExistsInModel(startNodeId) || !this.nodeExistsInModel(endNodeId)) {
  console.warn('[SelectionHandler] Node does not exist in model:', {
    startNodeId,
    endNodeId,
    startExists: this.nodeExistsInModel(startNodeId),
    endExists: this.nodeExistsInModel(endNodeId)
  });
  return { type: 'none' }; // 안전하게 선택 해제
}
```

#### 2.4 Selection 방향 감지

```typescript
// Selection 방향 결정 (forward/backward)
private determineSelectionDirection(
  selection: Selection, 
  startNode: Element, 
  endNode: Element, 
  startOffset: number, 
  endOffset: number
): 'forward' | 'backward' {
  // 같은 노드 내 선택
  if (startNode === endNode) {
    return startOffset <= endOffset ? 'forward' : 'backward';
  }
  
  // Cross-node 선택: anchor/focus 노드 기반으로 방향 판단
  const anchorNode = this.findBestContainer(selection.anchorNode);
  const focusNode = this.findBestContainer(selection.focusNode);
  
  if (anchorNode === startNode && focusNode === endNode) {
    return 'forward';
  } else if (anchorNode === endNode && focusNode === startNode) {
    return 'backward';
  }
  
  // Fallback: DOM document position 비교
  return startNode.compareDocumentPosition(endNode) & Node.DOCUMENT_POSITION_FOLLOWING 
    ? 'forward' : 'backward';
}
```

### 3. PositionBasedSelectionManager (고급 기능)

복잡한 Position 기반 Selection 관리가 필요한 경우 사용하는 고급 시스템입니다.

```typescript
// Position 기반 Selection 타입
interface PositionBasedSelection {
  id: string;
  type: 'text' | 'node' | 'cross-node' | 'multi-node' | 'document';
  startPosition: Position;
  endPosition?: Position;
  nodeSelections: NodeSelection[];
  documentId: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

interface Position {
  id: string;
  absolute: number;           // 절대 위치
  nodeOffset: number;         // 노드 내 오프셋
  nodeId: string;             // 노드 ID
  path: string[];             // 경로
  parentId?: string;          // 부모 노드 ID
  siblingIndex?: number;      // 형제 노드 인덱스
  documentVersion: number;    // 문서 버전
  lastUpdated: Date;          // 마지막 업데이트
  isInvalidated: boolean;     // 무효화 여부
  invalidationReason?: string; // 무효화 이유
  isValid: boolean;           // 유효성
  type: 'text' | 'anchor' | 'focus'; // 타입
  timestamp: Date;            // 생성 시점
  metadata?: Record<string, any>; // 메타데이터
  references: {               // 참조 추적
    highlights: string[];
    decorations: string[];
    selections: string[];
  };
}

// 통합된 Selection API
class PositionBasedSelectionManager {
  // 통합된 텍스트 선택 (단일 노드 또는 Cross Node 자동 감지)
  selectRange(
    startNodeId: string, 
    startOffset: number, 
    endNodeId: string, 
    endOffset: number
  ): string {
    // 같은 노드인지 자동 감지하여 적절한 Selection 타입 생성
  }

  // 편의 메서드들
  selectTextRange(nodeId: string, startOffset: number, endOffset: number): string;
  selectCrossNode(startNodeId: string, startOffset: number, endNodeId: string, endOffset: number): string;
  selectAbsoluteRange(startOffset: number, endOffset: number): string;
  selectNode(nodeId: string): string;

  // Selection 관리
  getCurrentSelection(): PositionBasedSelection | null;
  getSelectedText(): string;
  getSelectedNodes(): INode[];
  clearSelection(): void;
  validateSelection(): boolean;

  // 히스토리 관리
  getSelectionHistory(): PositionBasedSelection[];
  undoSelection(): boolean;
  restoreSelection(selection: PositionBasedSelection): void;
}
```

### 4. 사용 예시

#### 4.1 기본 Selection 사용법

```typescript
// 1. SelectionManager 기본 사용
const selectionManager = new SelectionManager({ dataStore });

// Selection 설정
selectionManager.setSelection({
  anchorId: 'text-1',
  anchorOffset: 0,
  focusId: 'text-1', 
  focusOffset: 5
});

// Selection 상태 확인
const currentSelection = selectionManager.getCurrentSelection();
console.log(currentSelection); // { anchorId: 'text-1', anchorOffset: 0, focusId: 'text-1', focusOffset: 5 }

// Selection이 특정 노드에 있는지 확인
const isInNode = selectionManager.isInNode('text-1'); // true

// Selection이 특정 위치에 있는지 확인 (collapsed)
const isAtPosition = selectionManager.isAtPosition('text-1', 3); // false

// Selection이 특정 범위에 있는지 확인
const isInRange = selectionManager.isInRange('text-1', 0, 10); // true
```

#### 4.2 DOM ↔ Model 변환 사용법

```typescript
// 1. DOM Selection → Model Selection 변환
const domSelection = window.getSelection();
const modelSelection = selectionHandler.convertDOMSelectionToModel(domSelection);

console.log(modelSelection);
// {
//   type: 'range',
//   startNodeId: 'text-1',
//   startOffset: 0,
//   endNodeId: 'text-1', 
//   endOffset: 5,
//   direction: 'forward'
// }

// 2. Model Selection → DOM Selection 변환
const modelSelection = {
  type: 'text',
  anchor: { nodeId: 'text-1', offset: 0 },
  focus: { nodeId: 'text-1', offset: 5 }
};

selectionHandler.convertModelSelectionToDOM(modelSelection);
// DOM에서 해당 범위가 선택됨
```

#### 4.3 PositionCalculator 사용법

```typescript
// 1. 위치 변환 유틸리티 사용
const calculator = new PositionCalculator(dataStore);

// nodeId + offset을 절대 위치로 변환
const absolutePos = calculator.calculateAbsolutePosition('text-1', 3);

// 절대 위치를 nodeId + offset으로 변환
const nodePos = calculator.findNodeByAbsolutePosition(absolutePos);

// 노드 경로 계산
const path = calculator.getNodePath('text-1'); // ['doc-1', 'para-1', 'text-1']

// 부모 ID 및 형제 순서 조회
const parentId = calculator.getParentId('text-1');
const siblingIndex = calculator.getSiblingIndex('text-1');

// 노드 간 거리 계산
const distance = calculator.calculateDistance('text-1', 'text-2');
```

## 2. SelectionManager 사용 가이드

### 2.1 언제 어떤 SelectionManager를 사용해야 할까?

#### **기본 SelectionManager (editor-core)**
- **사용 시기**: Editor 클래스에서 기본적인 Selection 관리가 필요할 때
- **특징**: 간단한 `ModelSelection` 인터페이스 (anchorId, anchorOffset, focusId, focusOffset)
- **용도**: 
  - DOM과 분리된 순수 Model 레벨 Selection 관리
  - 기본적인 선택 상태 확인 및 설정
  - Editor의 기본 Selection 기능

```typescript
// Editor에서 기본 SelectionManager 사용
const editor = new Editor({ dataStore });
const selection = editor.selectionManager.getCurrentSelection();

// 기본 Selection 상태 확인
if (selection) {
  console.log(`선택된 범위: ${selection.anchorId}:${selection.anchorOffset} ~ ${selection.focusId}:${selection.focusOffset}`);
}
```

#### **PositionCalculator (model)**
- **사용 시기**: 위치 변환이 필요할 때
- **특징**: 절대 위치와 nodeId + offset 간의 변환 유틸리티
- **용도**:
  - DOM ↔ Model 위치 변환
  - 노드 경로 계산
  - 부모-자식 관계 조회
  - 노드 간 거리 계산

```typescript
// 위치 변환이 필요한 경우
const calculator = new PositionCalculator(dataStore);

// DOM에서 받은 절대 위치를 Model 좌표로 변환
const domAbsolutePosition = 15;
const modelPosition = calculator.findNodeByAbsolutePosition(domAbsolutePosition);

// Model 좌표를 DOM 절대 위치로 변환
const backToDomPosition = calculator.calculateAbsolutePosition(
  modelPosition.nodeId, 
  modelPosition.offset
);

// 노드 구조 정보 조회
const path = calculator.getNodePath('text-1');
const parentId = calculator.getParentId('text-1');
```

### 2.2 절대 좌표 vs Model Selection 변환 시나리오

#### **언제 절대 좌표를 사용해야 할까?**

1. **ProseMirror 스타일 API가 필요할 때**
   ```typescript
   // 절대 위치 기반 선택 (ProseMirror와 유사)
   const selection = positionManager.selectAbsoluteRange(10, 20);
   ```

2. **Cross-node Selection이 필요할 때**
   ```typescript
   // 여러 노드에 걸친 선택
   const selection = positionManager.selectRange('text-1', 5, 'text-2', 3);
   ```

3. **Selection 히스토리가 필요할 때**
   ```typescript
   // 선택 히스토리 관리
   const history = positionManager.getSelectionHistory();
   const undone = positionManager.undoSelection();
   ```

4. **복잡한 Position 추적이 필요할 때**
   ```typescript
   // Position 객체로 동적 변화 추적
   const selection = positionManager.getCurrentSelection();
   console.log(selection.startPosition.absolute); // 절대 위치
   console.log(selection.startPosition.path);     // 노드 경로
   ```

#### **언제 Model Selection을 사용해야 할까?**

1. **기본적인 선택 상태 관리**
   ```typescript
   // 간단한 선택 상태 확인
   const selection = selectionManager.getCurrentSelection();
   if (selection) {
     console.log(`선택된 노드: ${selection.anchorId}`);
   }
   ```

2. **DOM과의 기본적인 연동**
   ```typescript
   // DOM Selection과 Model Selection 간 변환
   const domSelection = window.getSelection();
   const modelSelection = selectionHandler.convertDOMSelectionToModel(domSelection);
   ```

3. **Editor의 기본 기능**
   ```typescript
   // Editor의 기본 Selection 기능
   editor.selectionManager.setSelection({
     anchorId: 'text-1',
     anchorOffset: 0,
     focusId: 'text-1',
     focusOffset: 5
   });
   ```

### 2.3 절대 좌표 ↔ Model Selection 변환 시나리오

#### **절대 좌표 → Model Selection 변환**

```typescript
// 1. 절대 위치를 nodeId + offset으로 변환
const positionCalculator = new PositionCalculator(dataStore);
const nodePos = positionCalculator.findNodeByAbsolutePosition(10);

// 2. Model Selection으로 변환
const modelSelection: ModelSelection = {
  anchorId: nodePos.nodeId,
  anchorOffset: nodePos.offset,
  focusId: nodePos.nodeId,
  focusOffset: nodePos.offset + 5
};

// 3. SelectionManager에 설정
selectionManager.setSelection(modelSelection);
```

#### **Model Selection → 절대 좌표 변환**

```typescript
// 1. Model Selection에서 nodeId + offset 추출
const selection = selectionManager.getCurrentSelection();
if (selection) {
  // 2. 절대 위치로 변환
  const anchorAbsolute = positionCalculator.calculateAbsolutePosition(
    selection.anchorId, 
    selection.anchorOffset
  );
  const focusAbsolute = positionCalculator.calculateAbsolutePosition(
    selection.focusId, 
    selection.focusOffset
  );
  
  // 3. 절대 위치 기반 선택
  positionManager.selectAbsoluteRange(anchorAbsolute, focusAbsolute);
}
```

### 2.4 실제 사용 시나리오

#### **시나리오 1: 기본 텍스트 편집**
```typescript
// Editor에서 기본 SelectionManager 사용
const editor = new Editor({ dataStore });

// 사용자가 텍스트를 선택하면 DOM → Model 변환
editor.on('selectionchange', () => {
  const domSelection = window.getSelection();
  const modelSelection = editor.selectionHandler.convertDOMSelectionToModel(domSelection);
  editor.selectionManager.setSelection(modelSelection);
});

// 텍스트 편집 시 Model Selection 사용
const selection = editor.selectionManager.getCurrentSelection();
if (selection) {
  // 선택된 텍스트에 마크 적용
  editor.executeCommand('bold');
}
```

#### **시나리오 2: 복잡한 문서 조작**
```typescript
// 복잡한 Selection 관리가 필요한 경우
const positionManager = new PositionBasedSelectionManager(dataStore);

// 여러 노드에 걸친 선택
const selectionId = positionManager.selectRange('text-1', 5, 'text-2', 3);

// 선택된 텍스트 조작
const selectedText = positionManager.getSelectedText();
const selectedNodes = positionManager.getSelectedNodes();

// 히스토리 관리
const history = positionManager.getSelectionHistory();
```

#### **시나리오 3: ProseMirror 스타일 API**
```typescript
// ProseMirror와 유사한 절대 위치 기반 API
const positionManager = new PositionBasedSelectionManager(dataStore);

// 절대 위치 기반 선택
const selection = positionManager.selectAbsoluteRange(10, 20);

// 절대 위치 기반 텍스트 삽입
const position = positionCalculator.findNodeByAbsolutePosition(15);
if (position) {
  // 해당 위치에 텍스트 삽입
  editor.executeCommand('insertText', { 
    nodeId: position.nodeId, 
    offset: position.offset, 
    text: 'Hello' 
  });
}
```

## 3. 구현 상태

### ✅ 완료된 기능

#### **1. 기본 SelectionManager**
- **ModelSelection 인터페이스**: 간단한 anchor/focus 기반 Selection 표현
- **기본 API**: `getCurrentSelection()`, `setSelection()`, `clearSelection()` 등
- **상태 확인**: `isEmpty()`, `isInNode()`, `isAtPosition()`, `isInRange()` 등
- **겹침 검사**: `overlapsWith()` 메서드로 Selection 겹침 확인

#### **2. DOM ↔ Model 변환 시스템**
- **DOMSelectionHandler**: DOM Selection과 Model Selection 간 양방향 변환
- **convertDOMSelectionToModel()**: 브라우저 선택을 모델 좌표로 변환
- **convertModelSelectionToDOM()**: 모델 좌표를 브라우저 선택으로 변환
- **Model 검증**: DOM에 있지만 Model에 없는 요소 안전 처리
- **Selection 방향 감지**: forward/backward 방향 정보 제공

#### **3. Text Run Index 시스템**
- **중첩 마크 구조 지원**: 복잡한 마크 구조에서 정확한 위치 매핑
- **Binary Search**: O(log n) 시간복잡도로 효율적인 offset 변환
- **O(1) 역매핑**: `byNode` Map으로 빠른 DOM Text 노드 찾기
- **컨테이너별 인덱싱**: `data-text-container="true"` 속성으로 텍스트 컨테이너 식별

#### **4. PositionBasedSelectionManager (고급 기능)**
- **통합된 selectRange() API**: 단일 노드 vs Cross Node 자동 감지
- **편의 메서드**: `selectTextRange()`, `selectCrossNode()`, `selectAbsoluteRange()` 등
- **Selection 관리**: 선택 조회, 검증, 히스토리 관리
- **Position 기반**: 복잡한 Position 객체로 동적 변화 추적

#### **5. 성능 최적화**
- **드래그 감지**: 마우스 이벤트 기반 드래그 상태 추적
- **디바운싱**: 일반 선택(16ms), 드래그 중(100ms) 최적화
- **드래그 종료**: 즉시 selection 처리로 정확한 최종 상태 보장

### 🆕 최신 구현 기능 (2024년 업데이트)

#### **Model Selection to DOM Selection 변환**
- **구현**: `DOMSelectionHandler`에 `convertModelSelectionToDOM` 메서드 추가
- **지원 타입**: `text`, `node`, `none` Selection 타입
- **핵심 알고리즘**:
  1. 텍스트 컨테이너 식별 (`data-text-container="true"`)
  2. Text Run Index 활용한 DOM Text 노드 매핑
  3. Binary Search로 효율적인 offset 변환
  4. DOM Range 생성 및 정확한 선택 범위 설정

#### **안전한 Model 검증**
- **nodeExistsInModel()**: Model에 노드가 실제로 존재하는지 확인
- **안전한 변환**: DOM에 있지만 Model에 없는 요소는 `{ type: 'none' }` 반환
- **일관성 유지**: Model과 DOM 간의 동기화 상태 보장

#### **Selection Direction 정보**
- **구현**: `determineSelectionDirection` 메서드로 방향 판단
- **알고리즘**: 
  - 같은 노드 내: `startOffset <= endOffset ? 'forward' : 'backward'`
  - Cross-node: anchor/focus 노드 기반 방향 판단
  - Fallback: DOM document position 비교

### 🚧 향후 구현 예정
- **Highlight 시스템**: 텍스트 하이라이트 기능
- **Decoration 시스템**: 밑줄, 배경색 등 장식 기능
- **사용자 친화적 API**: SimplePositionManager, UserFriendlyPositionManager
- **성능 최적화**: 대용량 문서 처리 최적화

## 3. 결론

Selection 시스템이 Model 중심의 간단한 구조로 완전히 재설계되었습니다.

### 🎯 핵심 장점:

1. **단순함**: `ModelSelection` 인터페이스로 간단한 Selection 표현
2. **DOM 분리**: Model 레벨에서만 Selection 관리, DOM 조작은 editor-view-dom에서 처리
3. **양방향 변환**: DOM ↔ Model Selection 자동 변환으로 완벽한 동기화
4. **안전성**: Model 검증을 통한 안전한 변환 처리
5. **성능 최적화**: Text Run Index와 Binary Search로 효율적인 위치 매핑
6. **방향 정보**: forward/backward 방향 정보로 Selection 의미 명확화
7. **드래그 최적화**: 디바운싱으로 부드러운 사용자 경험
8. **고급 기능**: PositionBasedSelectionManager로 복잡한 Selection 관리 지원

### 🚀 사용법:

```typescript
// 1. 기본 SelectionManager (권장)
const selectionManager = new SelectionManager({ dataStore });
selectionManager.setSelection({
  anchorId: 'text-1',
  anchorOffset: 0,
  focusId: 'text-1',
  focusOffset: 5
});

// 2. DOM ↔ Model 변환
const modelSelection = selectionHandler.convertDOMSelectionToModel(domSelection);
selectionHandler.convertModelSelectionToDOM(modelSelection);

// 3. 고급 PositionBasedSelectionManager
const positionManager = new PositionBasedSelectionManager(dataStore);
positionManager.selectRange('text-1', 0, 'text-2', 5); // 자동 감지
```

### 🆕 최신 기능 활용:

```typescript
// Selection Direction 정보 포함
const modelSelection = selectionHandler.convertDOMSelectionToModel(domSelection);
console.log(modelSelection.direction); // 'forward' | 'backward'

// 드래그 최적화 (자동 적용)
// - 일반 선택: 16ms 디바운싱
// - 드래그 중: 100ms 디바운싱  
// - 드래그 종료: 즉시 처리

// Text Run Index로 정확한 위치 매핑
// - 중첩된 마크 구조에서도 정확한 offset 변환
// - O(log n) Binary Search로 빠른 성능
```

## 4. 통합 방향 및 권장사항

### 4.1 현재 구조의 문제점

1. **중복된 기능**: 두 SelectionManager가 비슷한 기능을 제공
2. **일관성 부족**: Editor와 Transaction에서 다른 SelectionManager 사용
3. **복잡성**: 개발자가 어떤 것을 사용해야 할지 혼란
4. **유지보수**: 두 개의 클래스를 관리해야 하는 부담

### 4.2 권장 통합 방향

#### **옵션 1: 통합 (권장)**
```typescript
// SelectionManager에 Position 기능 통합
class SelectionManager {
  private _basicSelection: ModelSelection | null = null;
  private _positionManager?: PositionBasedSelectionManager;
  
  // 기본 기능 (항상 사용 가능)
  getCurrentSelection(): ModelSelection | null {
    return this._basicSelection;
  }
  
  setSelection(selection: ModelSelection | null): void {
    this._basicSelection = selection;
  }
  
  // 고급 기능 (필요시 PositionManager 활성화)
  selectRange(startNodeId: string, startOffset: number, endNodeId: string, endOffset: number): string {
    if (!this._positionManager) {
      this._positionManager = new PositionBasedSelectionManager(this._dataStore);
    }
    return this._positionManager.selectRange(startNodeId, startOffset, endNodeId, endOffset);
  }
  
  selectAbsoluteRange(startOffset: number, endOffset: number): string {
    if (!this._positionManager) {
      this._positionManager = new PositionBasedSelectionManager(this._dataStore);
    }
    return this._positionManager.selectAbsoluteRange(startOffset, endOffset);
  }
  
  getSelectionHistory(): PositionBasedSelection[] {
    if (!this._positionManager) {
      return [];
    }
    return this._positionManager.getSelectionHistory();
  }
  
  undoSelection(): boolean {
    if (!this._positionManager) {
      return false;
    }
    return this._positionManager.undoSelection();
  }
}
```

#### **장점**
- **단순함**: 하나의 SelectionManager로 모든 기능 제공
- **일관성**: Editor와 Transaction에서 동일한 API 사용
- **점진적 사용**: 기본 기능부터 고급 기능까지 단계적 사용 가능
- **유지보수**: 하나의 클래스로 관리하여 복잡성 감소
- **성능**: 필요할 때만 PositionManager 생성

#### **사용 예시**
```typescript
// Editor에서 통합된 SelectionManager 사용
const editor = new Editor({ dataStore });

// 기본 기능 (항상 사용 가능)
const selection = editor.selectionManager.getCurrentSelection();
editor.selectionManager.setSelection({
  anchorId: 'text-1',
  anchorOffset: 0,
  focusId: 'text-1',
  focusOffset: 5
});

// 고급 기능 (필요시 자동 활성화)
const selectionId = editor.selectionManager.selectRange('text-1', 0, 'text-2', 3);
const absoluteSelection = editor.selectionManager.selectAbsoluteRange(10, 20);
const history = editor.selectionManager.getSelectionHistory();
```

### 4.3 구현 단계

1. **1단계**: PositionBasedSelectionManager 테스트 수정 및 안정화
2. **2단계**: SelectionManager에 Position 기능 통합
3. **3단계**: Editor에서 통합된 SelectionManager 사용
4. **4단계**: 기존 PositionBasedSelectionManager 제거 (선택사항)

## 5. 결론

이제 Selection 시스템이 Model 중심의 간단하고 안전한 구조로 완전히 재설계되어, 사용자 친화적이면서도 강력하고 성능이 최적화된 Selection 기능을 제공합니다.

### 주요 장점

1. **단순함**: Model 레벨에서 Selection을 간단하게 관리
2. **DOM 분리**: DOM 조작과 Model 상태를 명확히 분리
3. **양방향 변환**: DOM ↔ Model 간 자동 변환으로 개발자 편의성 제공
4. **안전성**: Model 검증으로 DOM-Model 불일치 상황 안전 처리
5. **성능**: Text Run Index와 드래그 최적화로 효율적인 처리
6. **방향 정보**: Selection 방향 정보로 사용자 의도 파악
7. **드래그 최적화**: 드래그 중 디바운싱으로 성능 향상
8. **고급 기능**: PositionBasedSelectionManager로 복잡한 Selection 관리 지원
9. **통합성**: 하나의 SelectionManager로 모든 기능 제공 (통합 후)

### 사용 패턴

- **기본 사용**: `SelectionManager`로 간단한 Selection 관리
- **DOM 연동**: `DOMSelectionHandler`로 자동 변환
- **고급 사용**: `PositionBasedSelectionManager`로 복잡한 Selection 관리 (통합 전)
- **통합 사용**: 통합된 `SelectionManager`로 모든 기능 사용 (통합 후)
- **성능 최적화**: 드래그 감지와 디바운싱 활용
