# SelectionManager 아키텍처

## 개요

Barocss Editor는 단순하고 효율적인 Selection 관리 시스템을 제공합니다:

1. **기본 SelectionManager** (`editor-core`): Editor 클래스에서 사용하는 기본적인 Selection 관리
2. **PositionCalculator** (`model`): 절대 위치와 nodeId + offset 간의 변환 유틸리티

## 아키텍처 구조

### 1. 기본 SelectionManager (editor-core)

**파일**: `packages/editor-core/src/selection-manager.ts`

**용도**: Editor 클래스에서 기본적인 Selection 관리

**인터페이스**: `ModelSelection`
```typescript
interface ModelSelection {
  anchorId: string;
  anchorOffset: number;
  focusId: string;
  focusOffset: number;
}
```

**주요 기능**:
- Selection 상태 관리 (설정, 조회, 클리어)
- Selection 상태 확인 (비어있음, 특정 노드 내 위치 등)
- Selection 방향 확인 (forward/backward)
- 선택된 텍스트 조회
- DOM과 완전히 분리된 순수 Model 레벨 관리

**사용 예시**:
```typescript
import { SelectionManager } from '@barocss/editor-core';

const selectionManager = new SelectionManager({ dataStore });

// Selection 설정
selectionManager.setSelection({
  anchorId: 'text-1',
  anchorOffset: 0,
  focusId: 'text-1',
  focusOffset: 5
});

// Selection 조회
const currentSelection = selectionManager.getCurrentSelection();
```

### 2. PositionCalculator (model)

**파일**: `packages/model/src/position.ts`

**용도**: 절대 위치와 nodeId + offset 간의 변환 유틸리티

**주요 기능**:
- 절대 위치를 nodeId + offset으로 변환
- nodeId + offset을 절대 위치로 변환
- 노드 경로 계산
- 부모 ID 및 형제 순서 조회
- 노드 간 거리 계산

**사용 예시**:
```typescript
import { PositionCalculator } from '@barocss/model';

const calculator = new PositionCalculator(dataStore);

// nodeId + offset을 절대 위치로 변환
const absolutePos = calculator.calculateAbsolutePosition('text-1', 3);

// 절대 위치를 nodeId + offset으로 변환
const nodePos = calculator.findNodeByAbsolutePosition(absolutePos);

// 노드 경로 계산
const path = calculator.getNodePath('text-1'); // ['doc-1', 'para-1', 'text-1']

// 부모 ID 조회
const parentId = calculator.getParentId('text-1'); // 'para-1'

// 형제 순서 조회
const siblingIndex = calculator.getSiblingIndex('text-1'); // 0
```

## 사용 시나리오

### 기본 Editor 사용
```typescript
// Editor 클래스에서 기본 SelectionManager 사용
const editor = new Editor({ dataStore });
const selection = editor.selectionManager.getCurrentSelection();

if (selection) {
  console.log(`선택된 범위: ${selection.anchorId}:${selection.anchorOffset} ~ ${selection.focusId}:${selection.focusOffset}`);
}
```

### 위치 계산이 필요한 경우
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
const siblingIndex = calculator.getSiblingIndex('text-1');
```

### Transaction에서 사용
```typescript
// Transaction에서 SelectionManager 사용
const transactionContext = createTransactionContext(
  dataStore,
  selectionManager, // editor-core의 SelectionManager
  schema
);

// Transaction 실행
const result = await transaction(editor, [
  create(node('paragraph', {}, [textNode('inline-text', 'Hello World')]))
]).commit();
```

## DOM ↔ Model 변환

### DOMSelectionHandler (editor-view-dom)
DOM Selection과 Model Selection 간의 변환을 담당합니다.

```typescript
// DOM Selection → Model Selection 변환
const domSelection = window.getSelection();
const modelSelection = selectionHandler.convertDOMSelectionToModel(domSelection);

// Model Selection → DOM Selection 변환
selectionHandler.convertModelSelectionToDOM(modelSelection);
```

## 파일 구조

```
packages/
├── editor-core/
│   └── src/
│       └── selection-manager.ts          # 기본 SelectionManager
├── model/
│   └── src/
│       ├── position.ts                   # PositionCalculator 유틸리티
│       └── create-transaction-context.ts # Transaction에서 SelectionManager 사용
└── editor-view-dom/
    └── src/
        └── dom-selection-handler.ts      # DOM ↔ Model 변환
```

## 장점

### 1. 단순한 구조
- **기본 SelectionManager**: Editor의 기본 Selection 기능
- **PositionCalculator**: 위치 변환 유틸리티

### 2. 성능 최적화
- 기본 기능은 가벼운 `ModelSelection` 사용
- 위치 변환은 필요시에만 `PositionCalculator` 사용

### 3. 유연성
- Editor는 기본 SelectionManager만 사용
- 위치 변환이 필요한 경우 PositionCalculator 사용

### 4. 호환성
- 기존 Editor 코드는 변경 없이 작동
- 위치 변환 기능은 선택적으로 사용

## 결론

현재 아키텍처는 다음과 같은 장점을 제공합니다:

1. **단순함**: 기본 Editor 사용자는 간단한 `ModelSelection`만 사용
2. **유틸리티**: 위치 변환이 필요한 경우 `PositionCalculator` 사용
3. **성능**: 필요에 따라 적절한 기능 사용
4. **유지보수**: 각 기능의 책임이 명확히 분리됨

이 구조를 통해 개발자는 기본적인 Selection 관리와 위치 변환 기능을 효율적으로 사용할 수 있습니다.
