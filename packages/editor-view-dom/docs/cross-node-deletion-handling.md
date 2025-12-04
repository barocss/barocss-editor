# 노드 경계 삭제 처리 (Cross-Node Deletion)

## 개요

노드 경계에서 삭제(Backspace/Delete)를 처리할 때, 현재 노드 내부가 아닌 이전/다음 노드와의 상호작용이 필요합니다.

---

## 시나리오

### 시나리오 1: 노드 시작 위치에서 Backspace

**상황**: 
- 커서가 `inline-text` 노드의 시작 위치(offset 0)에 있음
- 사용자가 Backspace 키 입력

**예시**:
```
[text-1: "Hello"] [text-2: "World"]
                    ↑ 커서 (offset 0)
```

**처리 방법**:
1. **이전 노드가 같은 부모의 형제이고 `.text` 필드를 가진 경우**:
   - 이전 노드의 마지막 문자 삭제
   - 이전 노드가 비어있으면 이전 노드 삭제 후 현재 노드와 병합 (선택적)

2. **이전 노드가 `.text` 필드가 없는 inline 노드인 경우**:
   - 이전 노드 전체 삭제 (예: inline-image)

3. **이전 노드가 block 노드이거나 다른 부모인 경우**:
   - 아무 동작도 하지 않음

**구현 로직**:
```typescript
if (startOffset === 0) {
  const prevNodeId = dataStore.getPreviousNode(startNodeId);
  if (prevNodeId) {
    const prevNode = dataStore.getNode(prevNodeId);
    const prevParent = dataStore.getParent(prevNodeId);
    const currentParent = dataStore.getParent(startNodeId);
    
    // 같은 부모의 형제인지 확인
    if (prevParent?.sid === currentParent?.sid) {
      // .text 필드가 있는 경우: 문자 삭제
      if (prevNode?.text !== undefined && typeof prevNode.text === 'string') {
        const prevTextLength = prevNode.text.length;
        if (prevTextLength > 0) {
          return {
            startNodeId: prevNodeId,
            startOffset: prevTextLength - 1,
            endNodeId: prevNodeId,
            endOffset: prevTextLength
          };
        }
        // 이전 노드가 비어있으면 병합 (선택적)
        // TODO: 노드 병합 구현
      } else {
        // .text 필드가 없는 경우: 노드 전체 삭제
        return { _deleteNode: true, nodeId: prevNodeId };
      }
    }
  }
  // 이전 노드가 없거나 조건 불만족: 아무 동작도 하지 않음
  return null;
}
```

---

### 시나리오 2: 노드 끝 위치에서 Delete

**상황**:
- 커서가 `inline-text` 노드의 끝 위치(offset === text.length)에 있음
- 사용자가 Delete 키 입력

**예시**:
```
[text-1: "Hello"] [text-2: "World"]
         ↑ 커서 (offset 5, text.length === 5)
```

**처리 방법**:
1. **다음 노드가 같은 부모의 형제이고 `.text` 필드를 가진 경우**:
   - 다음 노드의 첫 문자 삭제
   - 다음 노드가 비어있으면 다음 노드 삭제 후 현재 노드와 병합 (선택적)

2. **다음 노드가 `.text` 필드가 없는 inline 노드인 경우**:
   - 다음 노드 전체 삭제 (예: inline-image)

3. **다음 노드가 block 노드이거나 다른 부모인 경우**:
   - 아무 동작도 하지 않음

**구현 로직**:
```typescript
const node = dataStore.getNode(startNodeId);
const textLength = node?.text?.length || 0;
if (startOffset >= textLength) {
  const nextNodeId = dataStore.getNextNode(startNodeId);
  if (nextNodeId) {
    const nextNode = dataStore.getNode(nextNodeId);
    const nextParent = dataStore.getParent(nextNodeId);
    const currentParent = dataStore.getParent(startNodeId);
    
    // 같은 부모의 형제인지 확인
    if (nextParent?.sid === currentParent?.sid) {
      // .text 필드가 있는 경우: 문자 삭제
      if (nextNode?.text !== undefined && typeof nextNode.text === 'string') {
        if (nextNode.text.length > 0) {
          return {
            startNodeId: nextNodeId,
            startOffset: 0,
            endNodeId: nextNodeId,
            endOffset: 1
          };
        }
        // 다음 노드가 비어있으면 병합 (선택적)
        // TODO: 노드 병합 구현
      } else {
        // .text 필드가 없는 경우: 노드 전체 삭제
        return { _deleteNode: true, nodeId: nextNodeId };
      }
    }
  }
  // 다음 노드가 없거나 조건 불만족: 아무 동작도 하지 않음
  return null;
}
```

---

## 규칙 정리

### 1. 형제 노드 확인

**조건**:
- 이전/다음 노드가 같은 부모를 가져야 함
- 이전/다음 노드가 block 노드가 아니어야 함

**이유**:
- 다른 부모의 노드는 다른 블록이므로 병합하면 안 됨
- block 노드는 블록 경계이므로 삭제 대상이 아님

### 2. 삭제 우선순위

1. **이전/다음 노드의 문자 삭제** (우선)
   - 같은 부모의 형제이고 `.text` 필드를 가진 경우
   - 노드가 비어있지 않은 경우

2. **이전/다음 노드 전체 삭제**
   - 같은 부모의 형제이지만 `.text` 필드가 없는 경우 (예: inline-image)
   - 노드 전체를 삭제

3. **노드 병합** (선택적, Phase 2)
   - 이전/다음 노드가 비어있는 경우
   - 현재 노드와 병합

4. **아무 동작도 하지 않음** (fallback)
   - 이전/다음 노드가 없거나 조건 불만족
   - block 노드인 경우

### 3. 노드 병합 vs 문자 삭제

**문자 삭제를 우선하는 이유**:
- 사용자 기대: "이전/다음 노드의 문자를 삭제하고 싶다"
- 노드 병합은 부수 효과가 큼 (marks, decorators 등)

**노드 병합이 필요한 경우**:
- 이전/다음 노드가 이미 비어있는 경우
- 사용자가 명시적으로 노드 병합을 원하는 경우 (예: 빈 줄 삭제)

---

## 구현 계획

### Phase 1: 기본 구현 (현재)

1. ✅ 노드 시작 위치에서 Backspace: 이전 노드의 마지막 문자 삭제
2. ✅ 노드 끝 위치에서 Delete: 다음 노드의 첫 문자 삭제
3. ✅ 형제 노드 확인 로직
4. ✅ 조건 불만족 시 fallback (아무 동작도 하지 않음)

### Phase 2: 노드 병합 (향후)

1. 이전/다음 노드가 비어있을 때 병합
2. 병합 시 marks, decorators 처리
3. 병합 후 selection 위치 조정

---

## 예외 케이스

### 케이스 1: 이전/다음 노드가 다른 타입

#### 1-1. inline-image 같은 단일 inline 노드

**예시**:
```
[text-1: "Hello"] [image-1] [text-2: "World"]
                    ↑ 커서 (text-2의 offset 0)
```

**처리**: 
- Backspace: `image-1` 노드 전체 삭제
- Delete: `image-1` 노드 전체 삭제 (text-1의 끝에서)

**구현**:
- `calculateCrossNodeDeleteRange`가 `{ _deleteNode: true, nodeId: 'image-1' }` 반환
- `handleDelete`에서 `dataStore.deleteNode('image-1')` 호출

#### 1-2. block 노드

**예시**:
```
[paragraph-1 > text-1: "Hello"]
[paragraph-2 > text-2: "World"]
                    ↑ 커서 (paragraph-2의 text-2 시작)
```

**처리**: 아무 동작도 하지 않음 (블록 경계이므로)

### 케이스 2: 이전/다음 노드가 다른 부모

**예시**:
```
[paragraph-1 > text-1: "Hello"]
[paragraph-2 > text-2: "World"]
                    ↑ 커서 (paragraph-2의 text-2 시작)
```

**처리**: 아무 동작도 하지 않음 (다른 블록이므로 병합하면 안 됨)

### 케이스 3: 이전/다음 노드가 비어있음

**예시**:
```
[text-1: ""] [text-2: "World"]
              ↑ 커서
```

**처리**: 
- Phase 1: 아무 동작도 하지 않음
- Phase 2: 노드 병합 (향후 구현)

---

## 테스트 시나리오

### 테스트 1: 기본 Backspace (노드 시작)
```
초기: [text-1: "Hello"] [text-2: "World"]
커서: text-2의 offset 0
동작: Backspace
예상: [text-1: "Hell"] [text-2: "World"]
```

### 테스트 2: 기본 Delete (노드 끝)
```
초기: [text-1: "Hello"] [text-2: "World"]
커서: text-1의 offset 5 (끝)
동작: Delete
예상: [text-1: "Hello"] [text-2: "orld"]
```

### 테스트 3: 이전 노드가 다른 타입
```
초기: [text-1: "Hello"] [image-1] [text-2: "World"]
커서: text-2의 offset 0
동작: Backspace
예상: 변화 없음
```

### 테스트 4: 이전 노드가 다른 부모
```
초기: [paragraph-1 > text-1: "Hello"]
      [paragraph-2 > text-2: "World"]
커서: text-2의 offset 0
동작: Backspace
예상: 변화 없음
```

### 테스트 5: 이전 노드가 비어있음
```
초기: [text-1: ""] [text-2: "World"]
커서: text-2의 offset 0
동작: Backspace
예상: Phase 1 - 변화 없음, Phase 2 - 노드 병합
```

---

## 다른 에디터들의 구현 방식

### 1. ProseMirror

**접근 방식**: Model-First, Transaction 기반

**노드 경계 삭제 처리**:
- `deleteContentBackward`/`deleteContentForward`를 `beforeinput`에서 감지
- `preventDefault()` 후 Transaction으로 모델 변경
- ProseMirror의 `delete` 명령은 자동으로 노드 경계를 처리:
  - 이전 노드의 마지막 문자 삭제
  - 빈 노드 자동 병합
  - block 경계에서는 아무 동작도 하지 않음

**구현 예시**:
```typescript
// ProseMirror는 내부적으로 노드 경계를 자동 처리
const tr = state.tr.delete(selection.from, selection.to);
// delete 명령이 자동으로:
// - 이전/다음 노드의 문자 삭제
// - 빈 노드 병합
// - block 경계 처리
dispatch(tr);
```

**특징**:
- Transaction 시스템이 노드 경계를 자동으로 처리
- 사용자가 명시적으로 노드 경계를 처리할 필요 없음
- Schema 기반으로 노드 타입 확인

---

### 2. Slate.js

**접근 방식**: Model-First, Transforms API

**노드 경계 삭제 처리**:
- `beforeinput`에서 `preventDefault()`
- `Transforms.delete()`가 노드 경계를 처리:
  - 이전/다음 노드의 문자 삭제
  - 빈 노드 병합 (선택적)
  - block 경계에서는 아무 동작도 하지 않음

**구현 예시**:
```typescript
// Slate는 Transforms API로 노드 경계 처리
Transforms.delete(editor, {
  at: selection,
  // 내부적으로 이전/다음 노드 처리
  // 빈 노드 병합 옵션 제공
});
```

**특징**:
- Transforms API가 노드 경계를 자동 처리
- React 기반이므로 모델 변경 후 자동 리렌더링
- 노드 병합은 옵션으로 제공

---

### 3. Lexical

**접근 방식**: Model-First, Selection API

**노드 경계 삭제 처리**:
- `beforeinput`에서 `preventDefault()`
- `$getSelection().removeText()`가 노드 경계를 처리:
  - 이전/다음 노드의 문자 삭제
  - 빈 노드 병합
  - block 경계에서는 아무 동작도 하지 않음

**구현 예시**:
```typescript
// Lexical은 Selection API로 노드 경계 처리
editor.update(() => {
  const selection = $getSelection();
  if (selection) {
    selection.removeText();
    // removeText()가 자동으로:
    // - 이전/다음 노드의 문자 삭제
    // - 빈 노드 병합
  }
});
```

**특징**:
- Selection API가 노드 경계를 자동 처리
- 내부적으로 노드 타입 확인 및 처리
- React 기반이므로 모델 변경 후 자동 리렌더링

---

### 4. Quill

**접근 방식**: 하이브리드 (Delta 모델 + DOM)

**노드 경계 삭제 처리**:
- 일부는 `beforeinput` 사용, 일부는 MutationObserver 사용
- Delta 모델을 기반으로 노드 경계 처리:
  - 이전/다음 노드의 문자 삭제
  - 빈 노드 병합 (선택적)

**특징**:
- Delta 모델이 노드 경계를 처리
- DOM과 모델의 동기화가 복잡할 수 있음

---

## 비교 요약

| 에디터 | 접근 방식 | 노드 경계 처리 | 빈 노드 병합 | block 경계 처리 |
|--------|----------|---------------|-------------|----------------|
| **ProseMirror** | Model-First | Transaction 자동 처리 | 자동 | 아무 동작 안 함 |
| **Slate.js** | Model-First | Transforms API 자동 처리 | 옵션 | 아무 동작 안 함 |
| **Lexical** | Model-First | Selection API 자동 처리 | 자동 | 아무 동작 안 함 |
| **Quill** | 하이브리드 | Delta 모델 처리 | 선택적 | 아무 동작 안 함 |
| **우리 에디터** | 하이브리드 | 명시적 처리 (`.text` 필드 기반) | Phase 2 예정 | Schema 기반 확인 |

---

## 공통 패턴

### 1. Model-First 접근
- 대부분의 에디터가 Model-First 접근 방식 채택
- `beforeinput`에서 `preventDefault()` 후 모델 변경
- 모델 변경 후 DOM 업데이트

### 2. 자동 노드 경계 처리
- 대부분의 에디터가 노드 경계를 자동으로 처리
- 사용자가 명시적으로 노드 경계를 처리할 필요 없음
- 내부 API가 이전/다음 노드 처리

### 3. 빈 노드 병합
- 대부분의 에디터가 빈 노드 병합 지원
- ProseMirror, Lexical: 자동 병합
- Slate: 옵션으로 제공

### 4. Block 경계 처리
- 모든 에디터가 block 경계에서는 아무 동작도 하지 않음
- Block은 독립적인 단위이므로 병합하지 않음

### 5. Schema 기반 타입 확인
- 대부분의 에디터가 Schema를 통해 노드 타입 확인
- 우리 에디터는 `.text` 필드 존재 여부로 판단 (커스텀 schema 대응)

---

## 우리 에디터의 차별점

### 1. `.text` 필드 기반 판단
- 다른 에디터: Schema의 노드 타입 이름으로 판단
- 우리 에디터: `.text` 필드 존재 여부로 판단
- **이유**: 커스텀 schema 대응 (inline-text, inline-image 등이 모두 커스텀)

### 2. 명시적 노드 경계 처리
- 다른 에디터: 내부 API가 자동 처리
- 우리 에디터: `calculateCrossNodeDeleteRange`로 명시적 처리
- **이유**: 더 세밀한 제어 가능

### 3. 하이브리드 접근
- 다른 에디터: 대부분 Model-First
- 우리 에디터: 텍스트 입력은 DOM-First, 삭제는 Model-First
- **이유**: IME 입력 안정성

---

## 참고

- `DataStore.getPreviousNode(nodeId)`: 이전 노드 ID 반환
- `DataStore.getNextNode(nodeId)`: 다음 노드 ID 반환
- `DataStore.getParent(nodeId)`: 부모 노드 반환
- `DataStore.getNode(nodeId)`: 노드 정보 반환

