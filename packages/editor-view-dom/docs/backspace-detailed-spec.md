# Backspace 키 처리 상세 명세

## 개요

이 문서는 Backspace 키 입력 시 처리해야 하는 모든 케이스를 상세히 정의합니다.

---

## 1. 기본 처리 흐름

```
사용자 Backspace 키 입력
    ↓
1. keydown 이벤트 발생
    ↓
2. isComposing 체크
    ↓
3. IF isComposing === true:
      브라우저 기본 동작 허용 (IME 조합 중)
      RETURN
    ↓
4. preventDefault() (Model-First)
    ↓
5. DOM Selection → Model Selection 변환
    ↓
6. 삭제 범위 계산
    ↓
7. Command 실행 (deleteText)
    ↓
8. Transaction 완료 후 selectionAfter 적용
```

---

## 2. 케이스별 처리

### 2.1 Composing 상태에서 Backspace

**상황 (다이어그램):**
```
Before:
┌─────────────────────────────┐
│ IME 조합 중 (예: "ㅎ" → "하") │
└─────────────────────────────┘
           ↑
     Backspace keydown

After (우리가 개입하지 않을 때):
┌──────────────────────────────┐
│ 브라우저: 조합 문자 취소     │
│ 모델: 변경 없음              │
│ Selection: IME가 관리       │
└──────────────────────────────┘

조건:
- event.isComposing === true
- 또는 내부 플래그 _isComposing === true
```

**처리 방법:**
```
IF isComposing:
  preventDefault() 하지 않음
  브라우저 기본 동작 허용
  RETURN
```

**이유:**
- IME 조합 중에는 브라우저가 조합 문자를 관리함
- 조합 중 Backspace는 조합 문자를 취소하는 동작
- 우리가 개입하면 IME 동작이 깨질 수 있음

**예시:**
```
사용자 입력: "ㅎ" → "하" (조합 중)
Backspace 입력: 조합 취소 → "ㅎ" 또는 빈 상태
```

**구현 위치:**
```typescript
// packages/editor-view-dom/src/editor-view-dom.ts
private handleKeydown(event: KeyboardEvent): void {
  // IME 조합 중이면 브라우저 기본 동작 허용
  if (this._isComposing && event.key === 'Backspace') {
    return; // preventDefault() 하지 않음
  }
  
  // Model-First 처리
  if (event.key === 'Backspace') {
    event.preventDefault();
    this.handleBackspaceKey();
  }
}
```

---

### 2.2 Offset 0에서 Backspace

**상황:**
- 커서가 텍스트 노드의 시작 위치 (offset 0)
- `modelSelection.startOffset === 0`

**처리 전략:**
1. 이전 노드의 마지막 문자 삭제 (우선)
2. 이전 노드가 비어있으면 노드 병합 (Phase 2)
3. 이전 노드가 `.text` 필드 없으면 노드 전체 삭제

**처리 흐름 다이어그램:**

```
Offset 0에서 Backspace
    ↓
이전 노드 존재?
    ├─ NO → 아무 동작 안 함
    └─ YES
        ↓
같은 부모의 형제?
    ├─ NO → 아무 동작 안 함 (블록 경계)
    └─ YES
        ↓
이전 노드 타입 확인
    ├─ .text 필드 있음 (inline-text)
    │   ├─ 텍스트 길이 > 0
    │   │   └─ 마지막 문자 삭제 (deleteText operation)
    │   └─ 텍스트 길이 === 0 (빈 노드)
    │       └─ 노드 병합 (mergeTextNodes operation) [Phase 2]
    └─ .text 필드 없음 (inline-image 등)
        └─ 노드 전체 삭제 (deleteNode operation)
```

#### 2.2.1 케이스 분류

**케이스 A: 이전 노드의 마지막 문자 삭제**

**상황 (다이어그램):**
```
Before:
┌────────────────────┐    ┌────────────────────┐
│ text-1: "Hello"    │    │ text-2: "World"    │
└────────────────────┘    └────────────────────┘
                      ↑ 커서 (text-2 offset 0)

After Backspace:
┌────────────────────┐    ┌────────────────────┐
│ text-1: "Hell"     │    │ text-2: "World"    │
└────────────────────┘    └────────────────────┘
                      ↑ 커서 (text-2 offset 0)

Operation:
- deleteText({ startNodeId: "text-1", startOffset: 4, endNodeId: "text-1", endOffset: 5 })
```

**구현:**
```typescript
if (prevNode?.text !== undefined && typeof prevNode.text === 'string') {
  const prevTextLength = prevNode.text.length;
  if (prevTextLength > 0) {
    const deleteRange: ModelSelection = {
      type: 'range',
      startNodeId: prevNodeId,
      startOffset: prevTextLength - 1,
      endNodeId: prevNodeId,
      endOffset: prevTextLength,
      collapsed: false,
      direction: 'forward'
    };
    
    this.editor.executeCommand('deleteText', { range: deleteRange });
    return;
  }
}
```

**필요한 Operation:**
- ✅ `deleteTextRange` operation (이미 구현됨)

---

**케이스 B: 빈 노드 병합**

**상황 (다이어그램):**
```
Before:
┌────────────────────┐    ┌────────────────────┐
│ text-1: ""         │    │ text-2: "World"    │
└────────────────────┘    └────────────────────┘
                      ↑ 커서 (text-2 offset 0)

After Backspace:
┌────────────────────┐
│ text-1: "World"    │
└────────────────────┘
↑ 커서 (text-1 offset 0)

Operation:
- mergeTextNodes({ leftNodeId: "text-1", rightNodeId: "text-2" })
  - text-2 삭제됨
  - text-1의 텍스트가 "World"로 변경됨
```

**구현:**
```typescript
if (prevTextLength === 0) {
  // 노드 병합
  this.editor.executeCommand('mergeTextNodes', {
    leftNodeId: prevNodeId,
    rightNodeId: modelSelection.startNodeId
  });
  return;
}
```

**필요한 Operation:**
- ✅ `mergeTextNodes` operation (이미 구현됨)
- ⚠️ Command로 노출 필요 (`deleteText` extension에 추가)

**병합 시 고려사항:**
- Marks 병합: 두 노드의 marks를 합쳐야 함
- Decorators 병합: 두 노드의 decorators를 합쳐야 함
- Selection 위치: 병합 후 커서 위치 조정 필요

---

**케이스 C: 이전 노드 전체 삭제 (`.text` 필드 없음)**

**상황 (다이어그램 + Schema):**
```
Schema:
- inline-image:
  - group: 'inline'
  - atom: true
  - text: 없음
- inline-text:
  - group: 'inline'
  - text: string

Before:
┌────────────────────┐    ┌────────────────────┐    ┌────────────────────┐
│ text-1: "Hello"    │    │ inline-image       │    │ text-2: "World"    │
└────────────────────┘    └────────────────────┘    └────────────────────┘
                                               ↑ 커서 (text-2 offset 0)

After Backspace:
┌────────────────────┐    ┌────────────────────┐
│ text-1: "Hello"    │    │ text-2: "World"    │
└────────────────────┘    └────────────────────┘
                      ↑ 커서 (text-2 offset 0)

Operation:
- deleteNode({ nodeId: "image-1" })
```

**구현:**
```typescript
if (prevNode?.text === undefined) {
  // 노드 전체 삭제
  this.editor.executeCommand('deleteNode', { nodeId: prevNodeId });
  return;
}
```

**필요한 Operation:**
- ⚠️ `deleteNode` operation (구현 필요 또는 확인 필요)

---

**케이스 D: 이전 노드가 다른 부모 (블록 병합)**  

**상황 (다이어그램):**
```
Before:
┌─────────────────────────────┐
│ paragraph-1                 │
│   ┌──────────────────────┐  │
│   │ text-1: "Hello"      │  │
│   └──────────────────────┘  │
└─────────────────────────────┘
┌─────────────────────────────┐
│ paragraph-2                 │
│   ┌──────────────────────┐  │
│   │ text-2: "World"      │  │
│   └──────────────────────┘  │
│         ↑ 커서 (offset 0)   │  // 두 번째 블록의 시작
└─────────────────────────────┘

After Backspace:
┌─────────────────────────────┐
│ paragraph-1                 │
│   ┌────────────────────────┐│
│   │ text-1: "HelloWorld"   ││  // 또는 "Hello World"
│   └────────────────────────┘│
└─────────────────────────────┘
// paragraph-2는 삭제되거나 비워진 상태에서 제거됨

Operation (개념):
- Cross-block 범위 삭제 + 병합
  - range:
    - startNodeId: paragraph-1의 마지막 inline 텍스트 노드 ID
    - startOffset: 해당 텍스트 길이
    - endNodeId: paragraph-2의 첫 inline 텍스트 노드 ID
    - endOffset: 0
  - dataStore.range.deleteText(range)
  - 또는 별도 mergeBlockNodes({ leftBlockId: "paragraph-1", rightBlockId: "paragraph-2" })
```

---

**케이스 E: 이전 노드가 없음**

**상황 (다이어그램):**
```
Before:
┌────────────────────┐
│ text-1: "World"    │
└────────────────────┘
↑ 커서 (offset 0, 문서의 가장 앞)

After Backspace:
┌────────────────────┐
│ text-1: "World"    │
└────────────────────┘
↑ 커서 (offset 0, 변화 없음)

Operation:
- 없음 (이전 노드가 없으므로 삭제/병합 대상이 없음)
```

**구현:**
```typescript
// 블록 노드를 건너뛰고, 커서 기준 "이전 편집 가능한 노드"를 찾는다.
const prevEditableNodeId = dataStore.getPreviousEditableNode(modelSelection.startNodeId);
if (!prevEditableNodeId) {
  // 이전 편집 가능한 노드가 없음
  return;
}
```

---

### 2.3 일반적인 Backspace (offset > 0)

**상황 (다이어그램):**
```
Before:
┌────────────────────────────┐
│ text-1: "Hello World"      │
│              ↑ 커서 (5)    │  // 'o' 뒤 (공백 앞)
└────────────────────────────┘

After Backspace:
┌────────────────────────────┐
│ text-1: "Hell World"       │
│             ↑ 커서 (4)     │  // 삭제된 위치
└────────────────────────────┘

삭제 범위:
- { startNodeId: "text-1", startOffset: 4, endNodeId: "text-1", endOffset: 5 }
```

**구현:**
```typescript
if (modelSelection.startOffset > 0) {
  const deleteRange: ModelSelection = {
    type: 'range',
    startNodeId: modelSelection.startNodeId,
    startOffset: modelSelection.startOffset - 1,
    endNodeId: modelSelection.startNodeId,
    endOffset: modelSelection.startOffset,
    collapsed: false,
    direction: 'forward'
  };
  
  this.editor.executeCommand('deleteText', { range: deleteRange });
  return;
}
```

---

### 2.4 Range Selection에서 Backspace

**상황 (다이어그램):**
```
Before:
┌────────────────────────────┐
│ text-1: "Hello World"      │
│    ↑── 선택 범위 ──↑       │  // "ell" (offset 1-4)
└────────────────────────────┘

After Backspace:
┌────────────────────────────┐
│ text-1: "Ho World"         │
│      ↑ 커서 (offset 1)     │  // 삭제된 위치
└────────────────────────────┘

삭제 범위:
- { startNodeId: "text-1", startOffset: 1, endNodeId: "text-1", endOffset: 4 }
```

**구현:**
```typescript
if (!modelSelection.collapsed) {
  // 선택된 범위 삭제
  this.editor.executeCommand('deleteText', {
    range: modelSelection
  });
  return;
}
```

---

## 3. 처리 우선순위 및 의사코드

### 3.1 전체 처리 흐름 다이어그램

```
Backspace 키 입력
    ↓
[1] isComposing 체크
    ├─ YES → 브라우저 기본 동작 허용 → RETURN
    └─ NO
        ↓
[2] DOM Selection → Model Selection 변환
    ↓
[3] Range Selection 체크
    ├─ YES → 선택된 범위 삭제 → RETURN
    └─ NO
        ↓
[4] Offset 0 체크
    ├─ YES → Offset 0 처리 (섹션 3.2 참조)
    └─ NO
        ↓
[5] 일반 Backspace 처리 (offset > 0)
    └─ 왼쪽 한 글자 삭제 → RETURN
```

### 3.2 Offset 0 처리 상세 흐름

```
Offset 0에서 Backspace
    ↓
[4-1] 이전 "편집 가능한" 노드 조회 (getPreviousEditableNode)
    ├─ 없음 → [케이스 E] RETURN (아무 동작 안 함)
    └─ 있음 (prevEditableNode)
        ↓
[4-2] 부모 노드 확인
    ├─ 다른 부모 → [케이스 D] 블록 병합
    │   └─ 이전/현재 블록 타입이 같을 때만 mergeBlockNodes
    └─ 같은 부모
        ↓
[4-3] 이전 노드 타입 확인
    ├─ .text 필드 있음 (텍스트 노드)
    │   ├─ 텍스트 길이 > 0
    │   │   └─ [케이스 A] 마지막 문자 삭제
    │   │       └─ deleteText operation
    │   └─ 텍스트 길이 === 0
    │       └─ [케이스 B] 노드 병합
    │           └─ mergeTextNodes operation
    └─ .text 필드 없음 (inline-image 등 atom/inline)
        └─ [케이스 C] 이전 노드 전체 삭제
            └─ deleteNode operation
```

### 3.3 의사코드

```typescript
handleBackspaceKey():
  // [1] Composing 상태 체크 (최우선)
  IF isComposing:
    RETURN (브라우저 기본 동작 허용)
  
  // [2] DOM Selection → Model Selection 변환
  domSelection = window.getSelection()
  modelSelection = convertDOMSelectionToModel(domSelection)
  
  IF !modelSelection OR modelSelection.type === 'none':
    WARN("Failed to convert DOM selection")
    RETURN
  
  // [3] Range Selection 처리
  IF !modelSelection.collapsed:
    executeCommand('deleteText', { range: modelSelection })
    RETURN
  
  // [4] Offset 0 처리
  IF modelSelection.startOffset === 0:
    prevNodeId = dataStore.getPreviousNode(modelSelection.startNodeId)
    
    // [4-1] 이전 노드 없음
    IF !prevNodeId:
      RETURN
    
    prevNode = dataStore.getNode(prevNodeId)
    prevParent = dataStore.getParent(prevNodeId)
    currentParent = dataStore.getParent(modelSelection.startNodeId)
    
    // [4-2] 다른 부모 (블록 경계)
    IF prevParent?.sid !== currentParent?.sid:
      RETURN
    
    // [4-3] 이전 노드 타입 확인
    IF prevNode?.text !== undefined AND typeof prevNode.text === 'string':
      // inline-text 노드
      prevTextLength = prevNode.text.length
      
      IF prevTextLength > 0:
        // [케이스 A] 마지막 문자 삭제
        deleteRange = {
          startNodeId: prevNodeId,
          startOffset: prevTextLength - 1,
          endNodeId: prevNodeId,
          endOffset: prevTextLength
        }
        executeCommand('deleteText', { range: deleteRange })
        RETURN
      ELSE:
        // [케이스 B] 빈 노드 병합
        executeCommand('mergeTextNodes', {
          leftNodeId: prevNodeId,
          rightNodeId: modelSelection.startNodeId
        })
        RETURN
    ELSE:
      // [케이스 C] .text 필드 없음 (inline-image 등)
      executeCommand('deleteNode', { nodeId: prevNodeId })
      RETURN
  
  // [5] 일반 Backspace 처리 (offset > 0)
  IF modelSelection.startOffset > 0:
    deleteRange = {
      startNodeId: modelSelection.startNodeId,
      startOffset: modelSelection.startOffset - 1,
      endNodeId: modelSelection.startNodeId,
      endOffset: modelSelection.startOffset
    }
    executeCommand('deleteText', { range: deleteRange })
    RETURN
  
  // 지원되지 않는 경우
  WARN("Unsupported selection")
```

---

## 4. 엣지 케이스

### 4.1 여러 노드에 걸친 Range Selection

**상황 (다이어그램):**
```
Before:
┌────────────────────┐    ┌────────────────────┐
│ text-1: "Hello"    │    │ text-2: "World"    │
└────────────────────┘    └────────────────────┘
       ↑──── 선택 ────↑        (예: "ello Wor")

After Backspace:
┌────────────────────┐
│ text-1: "Hd"       │  // 구현에 따라 병합/분할 결과는 달라질 수 있음
└────────────────────┘
// 또는 text-1/text-2를 병합한 다른 형태 (Cross-node delete 정책에 따름)

Operation (DataStore 레벨):
- dataStore.range.deleteText(range)
  - range.startNodeId !== range.endNodeId 인 Cross-node 범위
```

**구현:**
```typescript
// DeleteExtension에서 처리
if (range.startNodeId !== range.endNodeId) {
  // Cross-node 범위는 DataStore의 range.deleteText 사용
  dataStore.range.deleteText(range);
  return true;
}
```

---

### 4.2 Mark가 있는 텍스트에서 삭제

**상황 (다이어그램):**
```
Before:
텍스트: "bold and italic"
Marks:
- [0, 4)   : bold
- [5, 8)   : italic
커서: "and" 뒤 (예: offset 8)

Backspace:
- offset 7~8 구간의 문자 삭제

After Backspace:
텍스트: "bold an italic"
Marks:
- bold/italic 범위가 한 글자 줄어든 텍스트에 맞게 자동 조정

Operation:
- deleteText(range)  // RangeOperations.deleteText 내부에서 mark 범위 조정
```

**구현:**
- `deleteTextRange` operation이 자동으로 Mark 범위 조정
- `RangeOperations.deleteText`에서 처리

---

### 4.3 한글 조합 중 Backspace

**상황 (다이어그램):**
```
Before:
┌─────────────────────────────┐
│ IME 조합 중 (예: "ㅎ" → "하") │
└─────────────────────────────┘
           ↑
     Backspace keydown

After:
┌──────────────────────────────┐
│ 브라우저: 조합 문자 취소     │
│ 모델: 변경 없음              │
│ Selection: IME가 관리       │
└──────────────────────────────┘

조건 / 처리:
- isComposing === true 이면 preventDefault() 호출 안 함
- 브라우저 기본 동작으로 조합 취소 처리
```

---

### 4.4 빈 텍스트 노드에서 Backspace

**상황 (다이어그램):**
```
Before:
┌────────────────────┐    ┌────────────────────┐
│ text-1: ""         │    │ text-2: "World"    │
└────────────────────┘    └────────────────────┘
                      ↑ 커서 (text-2 offset 0)

After Backspace (Phase 1 - 현재 구현):
┌────────────────────┐    ┌────────────────────┐
│ text-1: ""         │    │ text-2: "World"    │
└────────────────────┘    └────────────────────┘
                      ↑ 커서 (text-2 offset 0, 변화 없음)

After Backspace (Phase 2 - 향후 구현 아이디어):
┌────────────────────┐
│ text-1: "World"    │   // text-2 병합 후 text-2 삭제
└────────────────────┘
↑ 커서 (text-1 offset 0)

Operation (Phase 2 구상):
- deleteNode(text-1) 또는 mergeTextNodes/autoMergeTextNodes 조합
```

---

## 5. 필요한 Operations

### 5.1 현재 사용 중인 Operations

#### 5.1.1 `deleteTextRange` Operation
- **용도**: 텍스트 범위 삭제
- **사용 케이스**: 
  - 일반 Backspace (offset > 0)
  - Range Selection 삭제
  - Offset 0에서 이전 노드의 마지막 문자 삭제 (케이스 A)
- **상태**: ✅ 이미 구현됨
- **위치**: `packages/model/src/operations/deleteTextRange.ts`

#### 5.1.2 `mergeTextNodes` Operation
- **용도**: 인접한 두 텍스트 노드 병합
- **사용 케이스**: 
  - Offset 0에서 이전 노드가 비어있는 경우 (케이스 B)
- **상태**: ✅ Operation은 구현됨, ⚠️ Command로 노출 필요
- **위치**: `packages/model/src/operations/mergeTextNodes.ts`
- **필요한 작업**:
  - `DeleteExtension`에 `mergeTextNodes` command 추가
  - 또는 별도 `MergeExtension` 생성

**Operation 시그니처:**
```typescript
mergeTextNodes({ leftNodeId: string, rightNodeId: string })
```

**병합 시 처리사항:**
- 왼쪽 노드의 텍스트 + 오른쪽 노드의 텍스트
- Marks 병합: 두 노드의 marks를 합침
- Decorators 병합: 두 노드의 decorators를 합침
- 오른쪽 노드 삭제
- Selection 위치 조정

### 5.2 구현 필요한 Operations

#### 5.2.1 `deleteNode` Operation
- **용도**: 노드 전체 삭제
- **사용 케이스**: 
  - Offset 0에서 이전 노드가 `.text` 필드 없는 경우 (케이스 C)
- **상태**: ⚠️ 확인 필요 (이미 있을 수도 있음)
- **필요한 작업**:
  - Operation 존재 여부 확인
  - 없으면 구현 또는 `DeleteExtension`에 추가

---

## 6. 구현 체크리스트

### Phase 1: 기본 구현 (현재)

- [x] Composing 상태 체크
- [x] 일반 Backspace 처리 (offset > 0)
- [x] Range Selection 처리
- [ ] Offset 0에서 이전 노드 문자 삭제 (케이스 A)
- [ ] Offset 0에서 이전 노드 전체 삭제 (케이스 C)

### Phase 2: 노드 병합 구현

- [ ] `mergeTextNodes` Command 추가 (`DeleteExtension` 또는 별도 Extension)
- [ ] Offset 0에서 빈 노드 병합 (케이스 B)
- [ ] Marks 병합 로직 검증
- [ ] Decorators 병합 로직 검증
- [ ] Selection 위치 조정 검증

### Phase 3: 최적화 및 검증

- [ ] 여러 노드에 걸친 Range Selection 최적화
- [ ] Mark 범위 조정 검증
- [ ] 성능 테스트

---

## 7. 테스트 시나리오

### 테스트 1: Composing 상태에서 Backspace
```
초기 상태:
텍스트: "안녕" (조합 중: "ㅎ" → "하" 입력 중)
커서: 조합 중

동작: Backspace 입력

예상 결과:
- 조합 취소 (브라우저 기본 동작)
- 모델 변경 없음
```

---

### 테스트 2: Offset 0에서 Backspace (케이스 A - 이전 노드 문자 삭제)
```
초기 상태:
[text-1: "Hello"] [text-2: "World"]
                    ↑ 커서 (text-2의 offset 0)

동작: Backspace 입력

예상 결과:
[text-1: "Hell"] [text-2: "World"]
                 ↑ 커서 (text-2의 offset 0 유지)

Operation: deleteText({ startNodeId: "text-1", startOffset: 4, endOffset: 5 })
```

---

### 테스트 3: Offset 0에서 Backspace (케이스 B - 빈 노드 병합)
```
초기 상태:
[text-1: ""] [text-2: "World"]
             ↑ 커서 (text-2의 offset 0)

동작: Backspace 입력

예상 결과:
[text-1: "World"]
↑ 커서 (text-1의 offset 0)

Operation: mergeTextNodes({ leftNodeId: "text-1", rightNodeId: "text-2" })

검증 사항:
- text-2 노드 삭제됨
- text-1의 텍스트가 "World"로 변경됨
- Marks 병합 확인
- Decorators 병합 확인
```

---

### 테스트 4: Offset 0에서 Backspace (케이스 C - 이전 노드 전체 삭제)
```
초기 상태:
[text-1: "Hello"] [image-1] [text-2: "World"]
                    ↑ 커서 (text-2의 offset 0)

동작: Backspace 입력

예상 결과:
[text-1: "Hello"] [text-2: "World"]
                 ↑ 커서 (text-2의 offset 0 유지)

Operation: deleteNode({ nodeId: "image-1" })
```

---

### 테스트 5: Offset 0에서 Backspace (케이스 D - 다른 부모)
```
초기 상태:
[paragraph-1 > text-1: "Hello"]
[paragraph-2 > text-2: "World"]
                    ↑ 커서 (text-2의 offset 0)

동작: Backspace 입력

예상 결과:
변화 없음 (블록 경계이므로)

Operation: 없음
```

---

### 테스트 6: Offset 0에서 Backspace (케이스 E - 이전 노드 없음)
```
초기 상태:
[text-1: "World"]
↑ 커서 (offset 0)

동작: Backspace 입력

예상 결과:
변화 없음

Operation: 없음
```

---

### 테스트 7: 일반 Backspace (offset > 0)
```
초기 상태:
텍스트: "Hello World"
커서: offset 5 ("o" 뒤)

동작: Backspace 입력

예상 결과:
텍스트: "Hell World"
커서: offset 4 ("l" 뒤)

Operation: deleteText({ startNodeId: "text-1", startOffset: 4, endOffset: 5 })
```

---

### 테스트 8: Range Selection에서 Backspace
```
초기 상태:
텍스트: "Hello World"
선택: "ell" (offset 1-4)

동작: Backspace 입력

예상 결과:
텍스트: "Ho World"
커서: offset 1 (삭제된 위치)

Operation: deleteText({ startNodeId: "text-1", startOffset: 1, endOffset: 4 })
```

---

### 테스트 9: Mark가 있는 텍스트에서 Backspace
```
초기 상태:
텍스트: "bold and italic" (bold+italic mark, 전체)
커서: "and" 뒤 (offset 9)

동작: Backspace 입력

예상 결과:
텍스트: "bold nd italic"
Mark: 자동 조정됨 (분리되지 않음)
커서: offset 8

검증 사항:
- Mark 범위가 올바르게 조정됨
- Mark가 분리되지 않음
```

---

### 테스트 10: 여러 노드에 걸친 Range Selection 삭제
```
초기 상태:
[text-1: "Hello"] [text-2: "World"]
     ↑---선택---↑

동작: Backspace 입력

예상 결과:
[text-1: "H"] [text-2: "orld"]
또는
[text-1: "Horld"] (병합 후)

Operation: deleteText({ startNodeId: "text-1", startOffset: 1, endNodeId: "text-2", endOffset: 1 })
또는
Cross-node 범위 삭제
```

---

## 8. 케이스별 시각적 다이어그램

### 8.1 케이스 A: 이전 노드의 마지막 문자 삭제

**상황:**
```
[text-1: "Hello"] [text-2: "World"]
                     ↑ 커서 (text-2의 offset 0)

처리:
1. 이전 노드 text-1의 마지막 문자 삭제
2. 삭제 범위: { startNodeId: "text-1", startOffset: 4, endNodeId: "text-1", endOffset: 5 }
3. 결과: [text-1: "Hell"] [text-2: "World"]
4. 커서: text-2의 offset 0 유지
```

### 8.2 케이스 B: 빈 노드 병합

**상황:**
```
초기 상태:
[text-1: ""] [text-2: "World"]
             ↑ 커서 (text-2의 offset 0)

처리:
1. 이전 노드 text-1이 빈 문자열
2. Operation: mergeTextNodes({ leftNodeId: "text-1", rightNodeId: "text-2" })
3. 결과: [text-1: "World"] (text-2 삭제됨)
4. 커서: text-1의 offset 0
```

### 8.3 케이스 C: 이전 노드 전체 삭제

**상황:**
```
초기 상태:
[text-1: "Hello"] [image-1] [text-2: "World"]
                   ↑ 커서 (text-2의 offset 0)

// Schema 관점
- image-1: group: 'inline', atom: true, text 필드 없음 (예: inline-image)
- text-1 / text-2: group: 'inline', text: string (inline-text)

처리:
1. 이전 노드 image-1이 `.text` 필드 없음
2. Operation: deleteNode({ nodeId: "image-1" })
3. 결과: [text-1: "Hello"] [text-2: "World"]
4. 커서: text-2의 offset 0 유지
```

### 8.4 케이스 D: 다른 부모 (블록 경계)

**상황:**
```
Before:
┌─────────────────────────────┐
│ paragraph-1                 │
│   ┌──────────────────────┐  │
│   │ text-1: "Hello"      │  │
│   └──────────────────────┘  │
└─────────────────────────────┘
┌─────────────────────────────┐
│ paragraph-2                 │
│   ┌──────────────────────┐  │
│   │ text-2: "World"      │  │
│   └──────────────────────┘  │
│         ↑ 커서 (offset 0)   │
└─────────────────────────────┘

After Backspace:
┌─────────────────────────────┐
│ paragraph-1                 │
│   ┌────────────────────────┐│
│   │ text-1: "HelloWorld"   ││  // 또는 "Hello World"
│   └────────────────────────┘│
└─────────────────────────────┘

Operation (개념):
- Cross-block 범위 삭제 + 병합
- 또는 mergeBlockNodes({ leftBlockId: "paragraph-1", rightBlockId: "paragraph-2" })
```

### 8.5 일반 Backspace (offset > 0)

**상황:**
```
텍스트: "Hello World"
커서: offset 5 (공백 앞, 'o' 뒤)

처리:
1. 왼쪽 한 글자 삭제 (offset 4의 문자)
2. Operation: deleteText({ startNodeId: "text-1", startOffset: 4, endNodeId: "text-1", endOffset: 5 })
3. 결과: "Hell World"
4. 커서: offset 4
```

---

## 9. Selection 변경 시 Node Selection vs Range Selection

### 9.1 문제 상황

Backspace로 인해 selection이 바뀔 때, 다음과 같은 경우가 발생할 수 있습니다:

1. **Inline-image가 선택된 상태**: Backspace로 이전 노드가 삭제되고, 커서가 inline-image 앞에 위치할 때
2. **Block 요소가 선택된 상태**: Backspace로 블록 병합 후, 특정 block 요소가 선택된 상태가 될 때
3. **텍스트 범위 선택**: 일반적인 텍스트 선택 (기존 range selection)

**핵심 질문**: 
- 언제 `type: 'node'` selection을 사용해야 하는가?
- 언제 `type: 'range'` selection을 사용해야 하는가?
- ComponentManager에 어떤 이벤트를 주어야 하는가?

### 9.2 Node Selection vs Range Selection 정의

#### Range Selection (`type: 'range'`)
- **용도**: 텍스트 범위 선택 (offset 기반)
- **구조**: `{ type: 'range', startNodeId, startOffset, endNodeId, endOffset, collapsed }`
- **사용 케이스**:
  - 텍스트 노드 내의 특정 범위 선택
  - Cross-node 텍스트 선택
  - Collapsed selection (커서)

#### Node Selection (`type: 'node'`)
- **용도**: 노드 전체 선택 (offset 없음)
- **구조**: `{ type: 'node', nodeId }`
- **사용 케이스**:
  - **Inline-image, inline-video 등 atom 노드**: `.text` 필드가 없는 노드
  - **Block 요소**: paragraph, heading 등 block 그룹 노드
  - **사용자가 노드를 클릭하여 선택한 경우**

### 9.3 Backspace 후 Selection 변경 규칙

#### 규칙 1: 텍스트 노드로 이동 → Range Selection
```
Before Backspace:
[text-1: "Hello"] [image-1] [text-2: "World"]
                   ↑ 커서 (text-2 offset 0)

After Backspace (image-1 삭제):
[text-1: "Hello"] [text-2: "World"]
                 ↑ 커서 (text-2 offset 0)

Selection: { type: 'range', startNodeId: 'text-2', startOffset: 0, ... }
```

#### 규칙 2: Atom 노드(예: inline-image)로 이동 → Node Selection
```
Before Backspace:
[text-1: "Hello"] [image-1] [text-2: "World"]
                   ↑ 커서 (text-2 offset 0)

After Backspace (특정 케이스):
[text-1: "Hello"] [image-1]
                   ↑ image-1이 선택된 상태

Selection: { type: 'node', nodeId: 'image-1' }
```

**판단 기준**:
- `selectionAfter`의 `startNodeId`가 `.text` 필드가 없는 노드인가?
- → YES: `type: 'node'` selection으로 변환
- → NO: `type: 'range'` selection 유지

#### 규칙 3: Block 요소로 이동 → Node Selection
```
Before Backspace:
[paragraph-1 > text-1: "Hello"]
[paragraph-2 > text-2: "World"]
                    ↑ 커서 (text-2 offset 0)

After Backspace (블록 병합 후):
[paragraph-1 > text-1: "HelloWorld"]
                    ↑ paragraph-1이 선택된 상태?

Selection: { type: 'node', nodeId: 'paragraph-1' }
또는
Selection: { type: 'range', startNodeId: 'text-1', startOffset: 5, ... }
```

**판단 기준**:
- Block 요소를 선택해야 하는가? (예: 사용자가 block을 클릭)
- → YES: `type: 'node'` selection
- → NO: Block 내부의 텍스트 노드로 range selection

### 9.4 ComponentManager 이벤트 처리

#### 현재 상태
- ComponentManager는 `select`/`deselect` 이벤트 시스템이 있음
- 하지만 selection 변경 시 자동으로 이벤트를 emit하지 않음

#### 제안: Selection 변경 시 ComponentManager 이벤트

**위치**: `EditorViewDOM` 또는 `DOMRenderer`에서 처리

```typescript
// editor:selection.model 이벤트 수신 시
this.editor.on('editor:selection.model', (selection: ModelSelection) => {
  // 1. 이전에 선택된 노드들 deselect
  if (this._lastSelectedNodes) {
    this._lastSelectedNodes.forEach(sid => {
      this.componentManager.emit('deselect', sid, {});
    });
  }
  
  // 2. 새로운 selection에서 선택된 노드 추출
  const selectedNodes: string[] = [];
  
  if (selection.type === 'node') {
    // Node selection: nodeId 직접 사용
    selectedNodes.push(selection.nodeId);
  } else if (selection.type === 'range') {
    // Range selection: startNodeId와 endNodeId 확인
    // .text 필드가 없는 노드인 경우 node selection으로 변환
    const startNode = this.editor.dataStore.getNode(selection.startNodeId);
    const endNode = this.editor.dataStore.getNode(selection.endNodeId);
    
    if (startNode && typeof startNode.text !== 'string') {
      // Atom 노드 (예: inline-image)
      selectedNodes.push(selection.startNodeId);
    } else if (endNode && typeof endNode.text !== 'string') {
      // Atom 노드
      selectedNodes.push(selection.endNodeId);
    } else {
      // 텍스트 노드: range selection 유지 (ComponentManager 이벤트 없음)
      // 또는 텍스트 노드도 선택 상태로 표시할 수 있음
    }
  }
  
  // 3. 선택된 노드들에 select 이벤트 emit
  this._lastSelectedNodes = selectedNodes;
  selectedNodes.forEach(sid => {
    this.componentManager.emit('select', sid, {
      selection,
      nodeId: sid
    });
  });
});
```

### 9.5 구현 체크리스트

- [ ] Selection 변경 시 Node Selection vs Range Selection 판단 로직 구현
- [ ] Atom 노드 (`.text` 필드 없음) 감지 로직
- [ ] Block 요소 선택 시 Node Selection 변환 로직
- [ ] ComponentManager `select`/`deselect` 이벤트 자동 emit
- [ ] Backspace 후 selectionAfter에서 자동으로 node selection 변환

### 9.6 참고 문서

- [Selection Algorithm](./selection-algorithm.md): Range selection 변환 알고리즘
- [Selection Handling](./selection-handling.md): DOM ↔ Model selection 변환
- [Selection Spec](../../paper/selection-spec.md): Selection 타입 정의

---

## 10. 참고 자료

- [Cross-Node Deletion Handling](./cross-node-deletion-handling.md)
- [Input Delete Flow Summary](./input-delete-flow-summary.md)
- [Delete Test Scenarios](./delete-test-scenarios.md)
- [Selection Algorithm](./selection-algorithm.md)

