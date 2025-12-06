# Delete 기능의 복잡성 분석

## 문제점

Delete 기능은 단순해 보이지만 실제로는 매우 복잡합니다:

1. **방향 문제**: Backspace (뒤로) vs Delete (앞으로)
2. **무엇을 지울지**: 텍스트, 노드, 블록
3. **선택 범위**: block 선택 vs inline 선택

---

## Delete 시나리오 분류

### 1. 방향에 따른 분류

#### 1-1. Backspace (deleteContentBackward)
- **방향**: 뒤로 (이전 문자/노드)
- **동작**: 커서 앞의 내용 삭제

#### 1-2. Delete (deleteContentForward)
- **방향**: 앞으로 (다음 문자/노드)
- **동작**: 커서 뒤의 내용 삭제

---

### 2. 선택 범위에 따른 분류

#### 2-1. Collapsed Selection (커서만 있음)
- **상황**: `selection.collapsed === true`
- **처리**:
  - 현재 위치의 문자 삭제
  - 노드 경계에서 이전/다음 노드 처리

#### 2-2. Range Selection (텍스트 선택)
- **상황**: `selection.collapsed === false`
- **처리**: 선택된 범위 전체 삭제

#### 2-3. Block Selection (블록 선택)
- **상황**: 전체 블록이 선택됨
- **처리**: 블록 전체 삭제 또는 블록 내부만 삭제?

#### 2-4. Inline Selection (인라인 선택)
- **상황**: 인라인 노드가 선택됨
- **처리**: 인라인 노드 전체 삭제 또는 텍스트만 삭제?

---

### 3. 무엇을 지울지에 따른 분류

#### 3-1. 텍스트 삭제
- **조건**: 같은 노드 내에서 문자 삭제
- **예시**: `"Hello"` → `"Hllo"` (e 삭제)

#### 3-2. 노드 전체 삭제
- **조건**: 
  - `.text` 필드가 없는 inline 노드 (예: inline-image)
  - 빈 노드
- **예시**: `[image-1]` → 삭제

#### 3-3. 블록 삭제
- **조건**: 전체 블록이 선택됨
- **예시**: `[paragraph-1]` → 삭제

#### 3-4. Cross-Node 삭제
- **조건**: 여러 노드에 걸친 범위 삭제
- **예시**: `[text-1: "Hello"] [text-2: "World"]` → `[text-1: "He"] [text-2: "ld"]`

---

## ProseMirror의 처리 방식

### ProseMirror `baseKeymap`의 delete 동작

```typescript
{
  "Backspace": deleteSelection | joinBackward,
  "Delete": deleteSelection | joinForward
}
```

**동작**:
1. **선택이 있으면**: `deleteSelection` (선택된 범위 삭제)
2. **선택이 없으면**: 
   - Backspace → `joinBackward` (이전 블록과 병합 또는 이전 문자 삭제)
   - Delete → `joinForward` (다음 블록과 병합 또는 다음 문자 삭제)

**특징**:
- 블록 병합 (`joinBackward`/`joinForward`) 지원
- 선택 우선 처리
- 방향에 따른 다른 동작

---

## 우리 에디터의 현재 구현

### 현재 `calculateDeleteRange` 로직

```typescript
private calculateDeleteRange(modelSelection: any, inputType: string, currentNodeId: string): any | null {
  // 1. Range selection: 선택된 범위 삭제
  if (!collapsed) {
    return { startNodeId, startOffset, endNodeId, endOffset };
  }

  // 2. Collapsed selection: 방향에 따라 처리
  switch (inputType) {
    case 'deleteContentBackward': // Backspace
      if (startOffset > 0) {
        // 같은 노드 내: 이전 문자 삭제
        return { startNodeId, startOffset: startOffset - 1, endNodeId, endOffset: startOffset };
      } else {
        // 노드 경계: 이전 노드 처리
        return calculateCrossNodeDeleteRange(startNodeId, 'backward', dataStore);
      }

    case 'deleteContentForward': // Delete
      if (startOffset < textLength) {
        // 같은 노드 내: 다음 문자 삭제
        return { startNodeId, startOffset, endNodeId, endOffset: startOffset + 1 };
      } else {
        // 노드 경계: 다음 노드 처리
        return calculateCrossNodeDeleteRange(startNodeId, 'forward', dataStore);
      }
  }
}
```

### 현재 `calculateCrossNodeDeleteRange` 로직

```typescript
private calculateCrossNodeDeleteRange(
  currentNodeId: string,
  direction: 'backward' | 'forward',
  dataStore: any
): any | null {
  // 1. 형제 노드 찾기
  // 2. Block 노드 체크 (block이면 null 반환)
  // 3. .text 필드 체크
  //    - 있으면: 문자 삭제
  //    - 없으면: 노드 전체 삭제 ({ _deleteNode: true })
}
```

---

## 개선이 필요한 부분

### 1. Block Selection 처리

**현재**: Block 선택 시 단순히 범위 삭제

**문제**:
- Block 전체를 삭제해야 하는가?
- Block 내부만 삭제해야 하는가?

**예시**:
```
[paragraph-1 > text-1: "Hello"]
↑ 전체 블록 선택
```

**옵션**:
- 옵션 A: Block 전체 삭제
- 옵션 B: Block 내부 텍스트만 삭제 (Block은 유지)

---

### 2. Inline Selection 처리

**현재**: Inline 노드 선택 시 범위 삭제

**문제**:
- Inline 노드 전체를 삭제해야 하는가?
- Inline 노드 내부 텍스트만 삭제해야 하는가?

**예시**:
```
[text-1: "Hello"] [image-1] [text-2: "World"]
                  ↑ 인라인 이미지 선택
```

**옵션**:
- 옵션 A: Inline 노드 전체 삭제 (image-1 삭제)
- 옵션 B: 선택된 범위만 삭제 (하지만 image는 범위가 없음)

---

### 3. 방향에 따른 다른 동작

**현재**: Backspace와 Delete가 거의 동일하게 처리

**문제**:
- Block 병합 (`joinBackward`/`joinForward`) 미구현
- 빈 노드 병합 미구현

**예시**:
```
[paragraph-1 > text-1: "Hello"]
[paragraph-2 > text-2: ""]  ← 빈 단락
↑ 커서 (paragraph-2의 시작)
```

**Backspace 시**:
- 현재: 아무 동작도 하지 않음
- 기대: paragraph-2 삭제 또는 paragraph-1과 병합

---

## 권장 개선 방안

### 1. Delete 범위 계산 로직 개선

```typescript
private calculateDeleteRange(
  modelSelection: any,
  inputType: string,
  currentNodeId: string
): DeleteRange | null {
  // 1. 선택 범위 확인
  if (!modelSelection.collapsed) {
    return this._calculateRangeDelete(modelSelection);
  }

  // 2. 방향에 따른 처리
  if (inputType === 'deleteContentBackward') {
    return this._calculateBackwardDelete(modelSelection, currentNodeId);
  } else if (inputType === 'deleteContentForward') {
    return this._calculateForwardDelete(modelSelection, currentNodeId);
  }

  return null;
}

private _calculateRangeDelete(modelSelection: any): DeleteRange {
  // 선택된 범위 삭제
  // Block 선택인지 Inline 선택인지 확인
  const isBlockSelection = this._isBlockSelection(modelSelection);
  
  if (isBlockSelection) {
    // Block 전체 삭제 또는 Block 내부만 삭제?
    return this._calculateBlockDelete(modelSelection);
  } else {
    // Inline 범위 삭제
    return {
      startNodeId: modelSelection.startNodeId,
      startOffset: modelSelection.startOffset,
      endNodeId: modelSelection.endNodeId,
      endOffset: modelSelection.endOffset
    };
  }
}

private _calculateBackwardDelete(modelSelection: any, currentNodeId: string): DeleteRange | null {
  const { startNodeId, startOffset } = modelSelection;
  
  // 같은 노드 내
  if (startOffset > 0) {
    return {
      startNodeId,
      startOffset: startOffset - 1,
      endNodeId: startNodeId,
      endOffset: startOffset
    };
  }

  // 노드 경계: 이전 노드 처리
  return this.calculateCrossNodeDeleteRange(startNodeId, 'backward', dataStore);
}

private _calculateForwardDelete(modelSelection: any, currentNodeId: string): DeleteRange | null {
  const { startNodeId, startOffset } = modelSelection;
  const node = dataStore.getNode(startNodeId);
  const textLength = node?.text?.length || 0;
  
  // 같은 노드 내
  if (startOffset < textLength) {
    return {
      startNodeId,
      startOffset,
      endNodeId: startNodeId,
      endOffset: startOffset + 1
    };
  }

  // 노드 경계: 다음 노드 처리
  return this.calculateCrossNodeDeleteRange(startNodeId, 'forward', dataStore);
}
```

---

### 2. Block vs Inline 선택 구분

```typescript
private _isBlockSelection(modelSelection: any): boolean {
  // 선택이 블록 전체를 포함하는지 확인
  const startNode = dataStore.getNode(modelSelection.startNodeId);
  const endNode = dataStore.getNode(modelSelection.endNodeId);
  
  // 시작 노드가 블록의 첫 번째 자식이고
  // 끝 노드가 블록의 마지막 자식이면 블록 선택
  // TODO: 정확한 로직 구현 필요
  return false;
}

private _calculateBlockDelete(modelSelection: any): DeleteRange {
  // 옵션 A: Block 전체 삭제
  const blockId = this._getBlockId(modelSelection);
  return { _deleteNode: true, nodeId: blockId };
  
  // 옵션 B: Block 내부만 삭제 (Block은 유지)
  // return {
  //   startNodeId: modelSelection.startNodeId,
  //   startOffset: modelSelection.startOffset,
  //   endNodeId: modelSelection.endNodeId,
  //   endOffset: modelSelection.endOffset
  // };
}
```

---

### 3. 노드 병합 로직 추가

```typescript
private calculateCrossNodeDeleteRange(
  currentNodeId: string,
  direction: 'backward' | 'forward',
  dataStore: any
): DeleteRange | null {
  // ... 기존 로직 ...

  // 빈 노드 처리
  if (targetTextLength === 0) {
    // 옵션 A: 노드 병합
    return this._mergeNodes(currentNodeId, targetNodeId, direction, dataStore);
    
    // 옵션 B: 빈 노드 삭제
    return { _deleteNode: true, nodeId: targetNodeId };
  }

  // ... 기존 로직 ...
}

private _mergeNodes(
  currentNodeId: string,
  targetNodeId: string,
  direction: 'backward' | 'forward',
  dataStore: any
): DeleteRange | null {
  // 노드 병합 로직
  // 1. targetNode의 내용을 currentNode에 병합
  // 2. targetNode 삭제
  // 3. marks, decorators 처리
  // TODO: 구현 필요
  return null;
}
```

---

## 결정이 필요한 사항

### 1. Block 선택 시 동작

**질문**: Block 전체를 삭제해야 하는가, Block 내부만 삭제해야 하는가?

**옵션**:
- **옵션 A**: Block 전체 삭제 (권장)
  - 사용자 기대: "선택한 블록을 삭제하고 싶다"
  - 구현: `{ _deleteNode: true, nodeId: blockId }`

- **옵션 B**: Block 내부만 삭제
  - 사용자 기대: "블록은 유지하고 내용만 삭제"
  - 구현: 범위 삭제

---

### 2. Inline 노드 선택 시 동작

**질문**: Inline 노드 전체를 삭제해야 하는가?

**옵션**:
- **옵션 A**: Inline 노드 전체 삭제 (권장)
  - 예: `[image-1]` 선택 → `image-1` 삭제
  - 구현: `{ _deleteNode: true, nodeId: inlineNodeId }`

- **옵션 B**: 선택된 범위만 삭제
  - 하지만 Inline 노드는 범위가 없음 (atom)
  - 구현 불가능

---

### 3. 빈 노드 병합

**질문**: 빈 노드를 삭제할 때 병합해야 하는가?

**옵션**:
- **옵션 A**: 빈 노드 삭제 (현재)
  - 구현: `{ _deleteNode: true, nodeId: emptyNodeId }`

- **옵션 B**: 이전/다음 노드와 병합
  - 구현: `_mergeNodes()` 호출
  - 복잡도 증가

---

## 권장 사항

### ✅ **Block 선택: Block 전체 삭제**

```typescript
if (isBlockSelection) {
  return { _deleteNode: true, nodeId: blockId };
}
```

### ✅ **Inline 노드 선택: 노드 전체 삭제**

```typescript
if (isInlineNodeSelection) {
  return { _deleteNode: true, nodeId: inlineNodeId };
}
```

### ✅ **빈 노드: 노드 삭제 (병합은 Phase 2)**

```typescript
if (targetTextLength === 0) {
  return { _deleteNode: true, nodeId: targetNodeId };
}
```

---

## 구현 우선순위

### Phase 1: 기본 구현 (현재)
- ✅ Collapsed selection 삭제
- ✅ Range selection 삭제
- ✅ Cross-node 삭제
- ✅ 방향 처리 (Backspace/Delete)

### Phase 2: 개선 (향후)
- ⏳ Block selection 처리
- ⏳ Inline 노드 selection 처리
- ⏳ 빈 노드 병합
- ⏳ Block 병합 (`joinBackward`/`joinForward`)

