ㅗ 이# Draggable Node 명세

## 개요

이 문서는 "Draggable Node"의 정의, 용도, 판단 기준을 명확히 정의합니다.

---

## 1. Draggable Node란?

**Draggable Node**는 **드래그 앤 드롭으로 이동 가능한 노드**입니다. 즉, 사용자가 마우스로 노드를 드래그하여 다른 위치로 이동시킬 수 있는 노드입니다.

### 핵심 개념

- **드래그 앤 드롭 가능**: 사용자가 노드를 드래그하여 다른 위치로 이동 가능
- **노드 이동**: `moveNode` operation을 통해 노드의 부모나 위치 변경
- **편집 명령과는 독립적**: Editable Node, Selectable Node와는 별개 개념

### 중요한 구분: Editable vs Selectable vs Draggable

#### Editable Node (커서로 탐색 가능)
- **텍스트 노드**: `.text` 필드가 있는 노드
- **Inline 노드**: `group: 'inline'`인 노드
- **Editable Block**: `group: 'block'` + `editable: true` + `.text` 필드 있음
- **특징**: Backspace/Delete/화살표 키로 탐색 가능

#### Selectable Node (클릭으로 선택 가능)
- **Block 노드**: paragraph, heading, table 등
- **Inline 노드**: inline-image, inline-link 등
- **텍스트 노드**: inline-text 등
- **특징**: 클릭하면 Node Selection 또는 Range Selection으로 선택 가능

#### Draggable Node (드래그로 이동 가능)
- **Block 노드**: paragraph, heading, table 등 (기본적으로 드래그 가능)
- **Inline 노드**: inline-image, inline-link 등 (기본적으로 드래그 가능)
- **텍스트 노드**: inline-text 등 (기본적으로 드래그 가능)
- **특징**: 
  - 드래그 앤 드롭으로 노드 이동 가능
  - `draggable: false`로 명시하면 드래그 불가능
  - Editable Node, Selectable Node와는 별개 (드래그 가능하지만 선택 불가능할 수 있음)

---

## 2. Draggable Node 판단 기준

### 2.1 우선순위 기반 판단

`_isDraggableNode(nodeId)` 함수는 다음 순서로 판단합니다:

#### 1단계: 스키마 Group 확인 (최우선)

```typescript
// 스키마에서 노드 타입의 group 확인
const nodeType = schema.getNodeType(node.stype);
const group = nodeType?.group;

// document 노드는 항상 드래그 불가능
if (group === 'document') {
  return false;
}

// draggable 속성이 명시적으로 false이면 드래그 불가능
if (nodeType.draggable === false) {
  return false;
}

// 그 외의 경우는 드래그 가능 (기본값 true)
return true;
```

**예시:**
- `paragraph` (group: 'block') → **드래그 가능**
- `inline-image` (group: 'inline') → **드래그 가능**
- `inline-text` (group: 'inline') → **드래그 가능**
- `document` (group: 'document') → **드래그 불가능**
- `fixedBlock` (group: 'block', draggable: false) → **드래그 불가능**

#### 2단계: stype 확인 (폴백)

```typescript
// stype이 'document'이면 드래그 불가능
if (node.stype === 'document') {
  return false;
}
```

#### 3단계: 기본값 (안전하게 true)

```typescript
// 그 외의 경우는 드래그 가능 (안전하게 true)
return true;
```

---

## 3. Draggable Node의 종류

### 3.1 Block 노드

**판단 기준:**
- `group: 'block'` (스키마에서 확인)
- `draggable: false`가 아니면 드래그 가능

**특징:**
- 드래그 앤 드롭으로 다른 위치로 이동 가능
- Block 전체가 이동됨 (내부 노드 포함)
- Editable Node가 아님 (편집 명령으로 탐색 불가능)

**예시:**
```typescript
{
  stype: 'paragraph',
  content: ['text-1', 'text-2']
  // 스키마 정의: { group: 'block' }
}
// 사용자가 paragraph를 드래그하면:
// moveNode({ nodeId: 'paragraph-1', newParentId: 'document', position: 2 })
```

**사용 케이스:**
- Block 순서 변경
- Block을 다른 부모로 이동
- Block 복사 및 이동

### 3.2 Inline Atom 노드

**판단 기준:**
- `group: 'inline'` (스키마에서 확인)
- `atom: true` (스키마에서 확인)
- `.text` 필드 없음
- `draggable: false`가 아니면 드래그 가능

**특징:**
- 드래그 앤 드롭으로 다른 위치로 이동 가능
- 노드 전체가 이동됨 (offset 없음)
- Editable Node임 (편집 명령으로 탐색 가능)

**예시:**
```typescript
{
  stype: 'inline-image',
  attributes: { src: 'image.jpg', alt: 'Image' }
  // 스키마 정의: { group: 'inline', atom: true }
}
// 사용자가 inline-image를 드래그하면:
// moveNode({ nodeId: 'image-1', newParentId: 'paragraph-2', position: 1 })
```

**사용 케이스:**
- 이미지 위치 변경
- 이미지를 다른 paragraph로 이동
- 이미지 복사 및 이동

### 3.3 텍스트 노드

**판단 기준:**
- `.text` 필드가 있고 `typeof node.text === 'string'`
- `group: 'inline'` (스키마에서 확인)
- `draggable: false`가 아니면 드래그 가능

**특징:**
- 드래그 앤 드롭으로 다른 위치로 이동 가능
- 텍스트 노드 전체가 이동됨
- Editable Node임 (편집 명령으로 탐색 가능)

**예시:**
```typescript
{
  stype: 'inline-text',
  text: 'Hello World'
  // 스키마 정의: { group: 'inline' }
}
// 사용자가 텍스트 노드를 드래그하면:
// moveNode({ nodeId: 'text-1', newParentId: 'paragraph-2', position: 0 })
```

**사용 케이스:**
- 텍스트 노드 위치 변경
- 텍스트를 다른 paragraph로 이동
- 텍스트 복사 및 이동

### 3.4 Editable Block 노드

**판단 기준:**
- `group: 'block'` (스키마에서 확인)
- `editable: true` (스키마에서 확인)
- `.text` 필드 있음
- `draggable: false`가 아니면 드래그 가능

**특징:**
- 드래그 앤 드롭으로 다른 위치로 이동 가능
- Editable Node임 (편집 명령으로 탐색 가능)

**예시:**
```typescript
{
  stype: 'codeBlock',
  text: 'const x = 1;'
  // 스키마 정의: { group: 'block', editable: true }
}
// 사용자가 codeBlock을 드래그하면:
// moveNode({ nodeId: 'codeBlock-1', newParentId: 'document', position: 3 })
```

---

## 4. Draggable Node가 아닌 것

### 4.1 Document 노드

**특징:**
- `group: 'document'`
- 최상위 컨테이너
- 드래그 대상이 아님

**예시:**
```typescript
{
  stype: 'document',
  content: ['paragraph-1', 'paragraph-2']
}
// document 노드는 드래그 불가능
```

### 4.2 draggable: false인 노드

**특징:**
- 스키마에서 `draggable: false`로 명시
- 드래그해도 이동되지 않음
- 고정된 UI 요소나 시스템 노드에 사용

**예시:**
```typescript
// 스키마 정의
{
  'fixedBlock': {
    name: 'fixedBlock',
    group: 'block',
    draggable: false  // 드래그 불가능
  }
}
```

---

## 5. 사용 케이스

### 5.1 드래그 앤 드롭으로 노드 이동

**시나리오**: 사용자가 paragraph를 드래그하여 다른 위치로 이동

```
Before:
[paragraph-1: "Hello"]
[paragraph-2: "World"]
[paragraph-3: "Foo"]
         ↑ 드래그

After:
[paragraph-1: "Hello"]
[paragraph-3: "Foo"]
[paragraph-2: "World"]  ← 이동됨

Operation: moveNode({ nodeId: 'paragraph-2', newParentId: 'document', position: 2 })
```

**동작:**
```typescript
// 사용자가 paragraph를 드래그
if (dataStore.isDraggableNode('paragraph-2')) {
  // moveNode operation 실행
  await transaction(editor, [
    {
      type: 'moveNode',
      payload: {
        nodeId: 'paragraph-2',
        newParentId: 'document',
        position: 2
      }
    }
  ]).commit();
}
```

### 5.2 드래그 앤 드롭으로 이미지 이동

**시나리오**: 사용자가 inline-image를 드래그하여 다른 paragraph로 이동

```
Before:
[paragraph-1: "Hello"] [image-1] [text-2: "World"]
                        ↑ 드래그
[paragraph-2: "Foo"]

After:
[paragraph-1: "Hello"] [text-2: "World"]
[paragraph-2: "Foo"] [image-1]  ← 이동됨

Operation: moveNode({ nodeId: 'image-1', newParentId: 'paragraph-2', position: 1 })
```

**동작:**
```typescript
// 사용자가 inline-image를 드래그
if (dataStore.isDraggableNode('image-1')) {
  // moveNode operation 실행
  await transaction(editor, [
    {
      type: 'moveNode',
      payload: {
        nodeId: 'image-1',
        newParentId: 'paragraph-2',
        position: 1
      }
    }
  ]).commit();
}
```

### 5.3 드래그 불가능한 노드 처리

**시나리오**: 사용자가 draggable: false인 노드를 드래그 시도

```
Before:
[fixedBlock: "Fixed Content"]
         ↑ 드래그 시도

After:
[fixedBlock: "Fixed Content"]  ← 이동되지 않음

동작: 드래그 이벤트 무시 또는 시각적 피드백 제공
```

**동작:**
```typescript
// 사용자가 노드를 드래그 시도
function handleDragStart(nodeId: string) {
  if (!dataStore.isDraggableNode(nodeId)) {
    // 드래그 불가능한 노드
    event.preventDefault();
    // 시각적 피드백 제공 (예: 커서 변경, 툴팁 표시)
    return;
  }
  
  // 드래그 가능한 노드: 드래그 시작
  // ...
}
```

---

## 6. 판단 로직 상세

### 6.1 _isDraggableNode 구현

```typescript
private _isDraggableNode(nodeId: string): boolean {
  const node = this.dataStore.getNode(nodeId);
  if (!node) {
    return false;
  }
  
  // 1. 스키마에서 group 확인 (최우선)
  const schema = this.dataStore.getActiveSchema();
  if (schema) {
    try {
      const nodeType = schema.getNodeType(node.stype);
      if (nodeType) {
        const group = nodeType.group;
        
        // document 노드는 항상 드래그 불가능
        if (group === 'document') {
          return false;
        }
        
        // draggable 속성이 명시적으로 false이면 드래그 불가능
        if (nodeType.draggable === false) {
          return false;
        }
        
        // 그 외의 경우는 드래그 가능 (기본값 true)
        return true;
      }
    } catch (error) {
      // 스키마 조회 실패 시 계속 진행
    }
  }
  
  // 2. 스키마 정보가 없으면 기본적으로 드래그 가능 (document 제외)
  if (node.stype === 'document') {
    return false;
  }
  
  // 3. 그 외의 경우는 드래그 가능 (안전하게 true)
  return true;
}
```

### 6.2 판단 순서의 중요성

**왜 스키마 Group을 먼저 확인하는가?**

1. **정확성**: 스키마 정의가 가장 정확한 정보
2. **명시적 제어**: `draggable: false`로 명시적으로 제어 가능
3. **일관성**: 스키마 기반으로 일관된 동작 보장

---

## 7. Editable vs Selectable vs Draggable 비교

### 7.1 핵심 구분

| 구분 | Editable Node | Selectable Node | Draggable Node |
|------|--------------|----------------|----------------|
| **탐색 방법** | 커서로 탐색 (Backspace/Delete/화살표 키) | 클릭으로 선택 | 드래그로 이동 |
| **편집 명령** | `getPreviousEditableNode` / `getNextEditableNode`로 탐색 가능 | 탐색 불가능 | 탐색 불가능 |
| **Selection** | Range 또는 Node Selection | Node Selection 또는 Range Selection | Selection과 무관 |
| **예시** | `.text` 필드가 있는 노드, `group: 'inline'`인 노드, `editable: true`인 block | `group: 'block'`인 노드, `group: 'inline'`인 노드, 모든 노드 (document 제외) | 모든 노드 (document, `draggable: false` 제외) |

### 7.2 관계

**Venn Diagram:**
```
Draggable Node (가장 넓음)
  ├── Selectable Node
  │     └── Editable Node (가장 좁음)
  └── Non-Selectable Draggable (드래그 가능하지만 선택 불가능)
```

**예시:**
- **Editable Node**: 텍스트 노드, inline 노드, editable block
  - 모두 Selectable Node
  - 모두 Draggable Node
- **Selectable Node (Non-Editable)**: 일반 block 노드
  - Editable Node가 아님
  - Draggable Node
- **Draggable Node (Non-Selectable)**: 드래그 가능하지만 선택 불가능한 노드 (현재는 없음)
  - Editable Node가 아님
  - Selectable Node가 아님

---

## 8. 주요 사용처

### 8.1 드래그 앤 드롭 이벤트 처리

```typescript
// 사용자가 노드를 드래그 시작했을 때
function handleDragStart(nodeId: string) {
  if (dataStore.isDraggableNode(nodeId)) {
    // 드래그 가능한 노드: 드래그 시작
    const node = dataStore.getNode(nodeId);
    event.dataTransfer.setData('text/plain', nodeId);
    // 드래그 시각적 피드백 제공
  } else {
    // 드래그 불가능한 노드: 드래그 차단
    event.preventDefault();
  }
}

// 사용자가 노드를 드롭했을 때
function handleDrop(targetNodeId: string, position: number, draggedNodeId: string) {
  // 드래그되는 노드가 draggable인지 확인
  if (!dataStore.isDraggableNode(draggedNodeId)) {
    return;
  }
  
  // 드롭 타겟이 droppable이고 특정 노드를 받을 수 있는지 확인
  if (dataStore.canDropNode(targetNodeId, draggedNodeId)) {
    // moveNode operation 실행
    await transaction(editor, [
      {
        type: 'moveNode',
        payload: {
          nodeId: draggedNodeId,
          newParentId: targetNodeId,
          position: position
        }
      }
    ]).commit();
  }
}
```

### 8.2 드래그 가능한 노드 목록 조회

```typescript
// 문서 내 모든 드래그 가능한 노드 조회
const draggableNodes = dataStore.getDraggableNodes();

// Block 노드만 조회
const blockNodes = dataStore.getDraggableNodes({
  includeBlocks: true,
  includeInline: false,
  includeEditable: false
});
```

### 8.3 드래그 가능 여부 확인

```typescript
// 특정 노드가 드래그 가능한지 확인
if (dataStore.isDraggableNode(nodeId)) {
  // 드래그 UI 활성화 (예: 드래그 핸들 표시)
  element.setAttribute('draggable', 'true');
} else {
  // 드래그 UI 비활성화
  element.setAttribute('draggable', 'false');
}
```

---

## 9. 요약

### Draggable Node의 정의

1. **드래그 앤 드롭으로 이동 가능한 노드** (마우스 드래그)
2. **moveNode operation의 대상이 될 수 있는 노드**
3. **Document 노드가 아닌 노드** (기본적으로 모든 노드는 드래그 가능)

### 핵심 구분

- **Editable Node**: 커서로 탐색 가능 (텍스트, inline, editable block)
- **Selectable Node**: 클릭으로 선택 가능 (block, inline, 텍스트 모두)
- **Draggable Node**: 드래그로 이동 가능 (block, inline, 텍스트 모두, document 제외)

### 판단 기준 (우선순위)

1. **스키마 Group** (최우선)
   - `group: 'document'` → 드래그 불가능
   - `draggable: false` → 드래그 불가능
   - 그 외 → 드래그 가능 (기본값 true)
2. **stype 확인** (폴백)
   - `stype === 'document'` → 드래그 불가능
3. **기본값**
   - 그 외는 드래그 가능 (안전하게 true)

### 주요 사용처

- 드래그 앤 드롭 이벤트 처리: 노드 드래그 시작/종료 시 드래그 가능 여부 확인
- moveNode operation: 드래그 가능한 노드만 이동 가능
- 드래그 UI: 드래그 가능한 노드에만 드래그 핸들 표시

---

## 10. 참고 자료

- `packages/datastore/src/operations/utility-operations.ts`: `_isDraggableNode` 구현
- `packages/datastore/test/get-editable-node.test.ts`: 테스트 케이스
- `packages/datastore/docs/editable-node-spec.md`: Editable Node 명세
- `packages/datastore/docs/selectable-node-spec.md`: Selectable Node 명세
- `packages/datastore/docs/droppable-node-spec.md`: Droppable Node 명세 (드롭 타겟)
- `packages/model/src/operations/moveNode.ts`: moveNode operation 구현

