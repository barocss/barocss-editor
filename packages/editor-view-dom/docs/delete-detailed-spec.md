## Delete 키 상세 동작 스펙 (Model 기준)

이 문서는 **Delete 키(Forward Delete)** 가 Model 상에서 어떻게 동작해야 하는지 정의한다.  
구조와 표현은 `backspace-detailed-spec.md`와 최대한 대칭이 되도록 맞춘다.

핵심 포인트:
- **탐색 기준**: `DataStore.getNextEditableNode(nodeId)`  
  - Backspace가 `getPreviousEditableNode`를 사용하는 것과 정확히 대칭.
- **텍스트 노드 판별**: `.stype`가 아니라 `typeof node.text === 'string'` 인지로만 판별.
- **블록 병합 기준**: 스키마 `group === 'block'` 이면서 `stype`이 동일한 부모끼리만 병합.
- **Selection**: Delete 역시 항상 **ModelSelection**(range / collapsed)을 기준으로 처리한다.

---

## 1. Delete 키 처리 개요

### 1.1 DOM → Model Selection

- `DOMSelectionHandler`가 DOM Selection을 ModelSelection으로 변환한 이후를 전제로 한다.
- Delete 키 입력 시, ModelSelection 정보:
  - `type`: `'range'`
  - `startNodeId`, `startOffset`
  - `endNodeId`, `endOffset`
  - `collapsed`: `true` 또는 `false`
  - `direction`: `'forward'` (Delete는 기본적으로 앞으로 지우는 방향)

### 1.2 처리 우선순위

Delete 키 입력 시 전체 흐름은 Backspace와 거의 동일하되, 방향이 반대다.

```
Delete 키 입력
    ↓
[1] isComposing 체크
    ├─ YES → 브라우저 기본 동작 허용 → RETURN
    └─ NO
        ↓
[2] DOM Selection → Model Selection 변환
    ↓
[3] Range Selection 체크
    ├─ YES → 선택된 범위 삭제 → RETURN
    └─ NO (collapsed)
        ↓
[4] Offset == 텍스트 길이 체크 (커서가 텍스트 끝인지 여부)
    ├─ YES → 텍스트 끝에서 Delete 처리 (섹션 2.2 참조)
    └─ NO
        ↓
[5] 일반 Delete 처리 (텍스트 중간 또는 시작)
        └─ 오른쪽 한 글자 삭제 → RETURN
```

---

## 2. 케이스별 Delete 동작

### 2.1 Composing 중 Delete

Backspace와 동일하게, IME composing 중에는 **브라우저 기본 동작에 위임**한다.

---

### 2.2 텍스트 끝에서 Delete (Offset == text.length)

#### 2.2.1 케이스 A′: 다음 노드의 첫 문자 삭제 (텍스트 길이 > 0)

**상황 (다이어그램):**

```
Schema:
- inline-text:
  - group: 'inline'
  - text: string

Before:
┌────────────────────┐    ┌────────────────────┐
│ text-1: "Hello"    │    │ text-2: "World"    │
└────────────────────┘    └────────────────────┘
                     ↑ 커서 (text-1 offset 5)  // "Hello" 끝

After Delete:
┌────────────────────┐    ┌────────────────────┐
│ text-1: "Hello"    │    │ text-2: "orld"     │
└────────────────────┘    └────────────────────┘
                     ↑ 커서 (text-1 offset 5)

Operation:
- deleteText({
    startNodeId: "text-2", startOffset: 0,
    endNodeId: "text-2", endOffset: 1
  })
```

**구현 (개념, DeleteExtension):**

```typescript
// 1. 현재 노드의 텍스트 길이 확인
const currentNode = dataStore.getNode(selection.startNodeId);
if (typeof currentNode?.text === 'string') {
  const textLength = currentNode.text.length;

  // Offset == text.length 인 경우만 여기로 들어온다고 가정
  if (selection.startOffset === textLength) {
    // 2. 다음 편집 가능한 노드 조회
    const nextEditableNodeId = dataStore.getNextEditableNode(selection.startNodeId);
    if (!nextEditableNodeId) {
      // 다음 편집 가능한 노드가 없으면 아무 동작 안 함 (케이스 E′)
      return false;
    }

    const nextNode = dataStore.getNode(nextEditableNodeId);
    if (typeof nextNode?.text === 'string' && nextNode.text.length > 0) {
      const deleteRange: ModelSelection = {
        type: 'range',
        startNodeId: nextEditableNodeId,
        startOffset: 0,
        endNodeId: nextEditableNodeId,
        endOffset: 1,
        collapsed: false,
        direction: 'forward'
      };
      return await this._executeDeleteText(editor, deleteRange);
    }
  }
}
```

---

### 2.2.2 케이스 B′: 다음 노드가 빈 텍스트 노드 (병합)

**상황 (다이어그램):**

```
Schema:
- inline-text:
  - group: 'inline'
  - text: string

Before:
┌────────────────────┐    ┌────────────────────┐
│ text-1: "Hello"    │    │ text-2: ""         │
└────────────────────┘    └────────────────────┘
                     ↑ 커서 (text-1 offset 5)

After Delete:
┌────────────────────┐
│ text-1: "Hello"    │
└────────────────────┘
                     ↑ 커서 (text-1 offset 5)

Operation:
- mergeTextNodes({
    leftNodeId: "text-1",
    rightNodeId: "text-2"
  })
```

**구현 (개념):**

```typescript
if (typeof nextNode?.text === 'string' && nextNode.text.length === 0) {
  // 현재 노드와 다음 노드가 모두 텍스트 노드인 경우에만 병합
  if (typeof currentNode?.text === 'string') {
    return await this._executeMergeTextNodes(editor, selection.startNodeId, nextEditableNodeId);
  }

  // 텍스트 노드가 아니면 병합하지 않음
  return false;
}
```

---

### 2.2.3 케이스 C′: 다음 노드 전체 삭제 (.text 필드 없음)

**상황 (다이어그램):**

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
                     ↑ 커서 (text-1 offset 5)

After Delete:
┌────────────────────┐    ┌────────────────────┐
│ text-1: "Hello"    │    │ text-2: "World"    │
└────────────────────┘    └────────────────────┘
                     ↑ 커서 (text-1 offset 5)

Operation:
- deleteNode({ nodeId: "image-1" })
```

**구현 (개념):**

```typescript
if (typeof nextNode?.text !== 'string') {
  // 다음 노드 전체 삭제
  return await this._executeDeleteNode(editor, nextEditableNodeId);
}
```

---

### 2.2.4 케이스 D′: 다음 노드가 다른 부모 (블록 경계) - 블록 병합

Backspace의 케이스 D(이전 블록과 현재 블록 병합)의 **정방향 버전**이다.

**상황 (다이어그램):**

```
Before:
┌─────────────────────────────┐
│ paragraph-1                 │
│   ┌──────────────────────┐  │
│   │ text-1: "Hello"      │  │
│   └──────────────────────┘  │
│         ↑ 커서 (offset 5)   │  // 첫 번째 블록의 끝
└─────────────────────────────┘
┌─────────────────────────────┐
│ paragraph-2                 │
│   ┌──────────────────────┐  │
│   │ text-2: "World"      │  │
│   └──────────────────────┘  │
└─────────────────────────────┘

After Delete:
┌─────────────────────────────┐
│ paragraph-1                 │
│   ┌────────────────────────┐│
│   │ text-1: "HelloWorld"   ││  // 또는 "Hello World"
│   └────────────────────────┘│
└─────────────────────────────┘
// paragraph-2는 병합 후 제거됨

Operation (개념):
- mergeBlockNodes({
    leftBlockId: "paragraph-1",
    rightBlockId: "paragraph-2"
  })
```

**구현 (개념):**

```typescript
const currentParent = dataStore.getParent(selection.startNodeId);
const nextParent = dataStore.getParent(nextEditableNodeId);

// 부모가 다르면 블록 경계
if (currentParent?.sid !== nextParent?.sid) {
  if (!currentParent || !nextParent) {
    return false;
  }

  // 같은 타입의 블록만 병합
  if (currentParent.stype !== nextParent.stype) {
    return false;
  }

  // 블록 병합 (현재 블록 + 다음 블록)
  return await this._executeMergeBlockNodes(editor, currentParent.sid!, nextParent.sid!);
}
```

---

### 2.2.5 케이스 E′: 다음 편집 가능한 노드 없음

**상황 (다이어그램):**

```
Before:
┌────────────────────┐
│ text-1: "World"    │
└────────────────────┘
          ↑ 커서 (offset 5, 문서의 마지막)

After Delete:
┌────────────────────┐
│ text-1: "World"    │
└────────────────────┘
          ↑ 커서 (offset 5, 변화 없음)

Operation:
- 없음 (다음 편집 가능한 노드가 없으므로 삭제/병합 대상이 없음)
```

**구현 (개념):**

```typescript
const nextEditableNodeId = dataStore.getNextEditableNode(selection.startNodeId);
if (!nextEditableNodeId) {
  // 다음 편집 가능한 노드가 없음
  return false;
}
```

---

### 2.3 일반적인 Delete (offset < text.length)

**상황 (다이어그램):**

```
Before:
┌────────────────────────────┐
│ text-1: "Hello World"      │
│              ↑ 커서 (5)    │  // 'o' 뒤 (공백 앞)
└────────────────────────────┘

After Delete:
┌────────────────────────────┐
│ text-1: "HelloWorld"       │
│              ↑ 커서 (5)    │  // 삭제된 위치
└────────────────────────────┘

삭제 범위:
- { startNodeId: "text-1", startOffset: 5, endNodeId: "text-1", endOffset: 6 }
```

**구현 (개념):**

```typescript
if (selection.startOffset < textLength) {
  const deleteRange: ModelSelection = {
    type: 'range',
    startNodeId: selection.startNodeId,
    startOffset: selection.startOffset,
    endNodeId: selection.startNodeId,
    endOffset: selection.startOffset + 1,
    collapsed: false,
    direction: 'forward'
  };

  return await this._executeDeleteText(editor, deleteRange);
}
```

---

### 2.4 Range Selection에서 Delete

Range Selection에서의 Delete는 Backspace와 완전히 동일하게 동작한다.  
유일한 차이는 **사용자 키 입력이 Delete라는 것뿐**이며, ModelSelection 처리와 `deleteText` 호출은 같다.

**상황 (다이어그램):**

```
Before:
┌────────────────────────────┐
│ text-1: "Hello World"      │
│    ↑── 선택 범위 ──↑       │  // "ell" (offset 1-4)
└────────────────────────────┘

After Delete:
┌────────────────────────────┐
│ text-1: "Ho World"         │
│      ↑ 커서 (offset 1)     │  // 삭제된 위치
└────────────────────────────┘

삭제 범위:
- { startNodeId: "text-1", startOffset: 1, endNodeId: "text-1", endOffset: 4 }
```

**구현 (개념):**

```typescript
if (!selection.collapsed) {
  // 선택된 범위 삭제
  return await this._executeDeleteText(editor, selection);
}
```

---

## 3. Delete 처리 의사코드 (요약)

```typescript
handleDeleteKey():
  if (isComposing) return allowBrowserDefault()

  const selection = getModelSelectionFromDOM()

  // [1] Range Selection
  if (!selection.collapsed) {
    return this._executeDeleteText(editor, selection)
  }

  const dataStore = editor.dataStore
  const currentNode = dataStore.getNode(selection.startNodeId)

  // 텍스트 노드가 아니면 여기서는 Delete 하지 않고 다른 명령(예: node 삭제/선택)에 위임
  if (typeof currentNode?.text !== 'string') {
    return false
  }

  const textLength = currentNode.text.length

  // [2] Offset < text.length → 일반 Delete (한 글자 삭제)
  if (selection.startOffset < textLength) {
    const deleteRange: ModelSelection = {
      type: 'range',
      startNodeId: selection.startNodeId,
      startOffset: selection.startOffset,
      endNodeId: selection.startNodeId,
      endOffset: selection.startOffset + 1,
      collapsed: false,
      direction: 'forward'
    }
    return this._executeDeleteText(editor, deleteRange)
  }

  // [3] Offset == text.length → 텍스트 끝에서 Delete
  const nextEditableNodeId = dataStore.getNextEditableNode(selection.startNodeId)
  if (!nextEditableNodeId) {
    // 케이스 E′: 다음 편집 가능한 노드 없음
    return false
  }

  const nextNode = dataStore.getNode(nextEditableNodeId)
  const currentParent = dataStore.getParent(selection.startNodeId)
  const nextParent = dataStore.getParent(nextEditableNodeId)

  // [3-1] 다른 부모 → 케이스 D′ (블록 병합)
  if (currentParent?.sid !== nextParent?.sid) {
    if (!currentParent || !nextParent) return false
    if (currentParent.stype !== nextParent.stype) return false
    return this._executeMergeBlockNodes(editor, currentParent.sid!, nextParent.sid!)
  }

  // [3-2] 같은 부모 → 케이스 A′/B′/C′
  if (typeof nextNode?.text === 'string') {
    if (nextNode.text.length > 0) {
      // A′: 다음 노드 첫 문자 삭제
      const deleteRange: ModelSelection = {
        type: 'range',
        startNodeId: nextEditableNodeId,
        startOffset: 0,
        endNodeId: nextEditableNodeId,
        endOffset: 1,
        collapsed: false,
        direction: 'forward'
      }
      return this._executeDeleteText(editor, deleteRange)
    } else {
      // B′: 빈 텍스트 노드 병합
      if (typeof currentNode.text === 'string') {
        return this._executeMergeTextNodes(editor, selection.startNodeId, nextEditableNodeId)
      }
      return false
    }
  } else {
    // C′: 다음 노드 전체 삭제 (.text 없음)
    return this._executeDeleteNode(editor, nextEditableNodeId)
  }
```

---

## 4. Backspace 스펙과의 대칭 관계 정리

| 항목                      | Backspace                                      | Delete                                        |
|---------------------------|-----------------------------------------------|-----------------------------------------------|
| 탐색 기준                 | `getPreviousEditableNode(nodeId)`            | `getNextEditableNode(nodeId)`                |
| Offset 기준               | `startOffset === 0`                          | `startOffset === text.length`                |
| 한 글자 삭제              | `offset > 0` → 왼쪽 한 글자                  | `offset < text.length` → 오른쪽 한 글자      |
| 블록 병합                 | 이전 블록(parent) + 현재 블록(parent)       | 현재 블록(parent) + 다음 블록(parent)       |
| 이전/다음 편집 노드 없음  | 문서 맨 앞에서 Backspace → no-op            | 문서 맨 끝에서 Delete → no-op               |
| 텍스트/노드 판별 기준     | `typeof node.text === 'string'`              | 동일                                         |
| Range Selection 동작      | 선택 범위 `deleteText`                       | 동일                                         |

이 문서를 기준으로, `DeleteExtension`에 **Delete 전용 커맨드**를 추가하고  
Backspace와 동일한 수준의 테스트/다이어그램을 점진적으로 확장할 수 있다.


