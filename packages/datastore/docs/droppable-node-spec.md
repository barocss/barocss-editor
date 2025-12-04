# Droppable Node 명세

## 개요

이 문서는 "Droppable Node"의 정의, 용도, 판단 기준을 명확히 정의합니다. Droppable Node는 드래그 앤 드롭 시스템에서 **드롭 타겟**이 될 수 있는 노드입니다.

---

## 1. Droppable Node란?

**Droppable Node**는 **다른 노드를 받을 수 있는 노드**입니다. 즉, 사용자가 노드를 드래그하여 이 노드에 드롭할 수 있는 노드입니다.

### 핵심 개념

- **드롭 타겟**: 다른 노드를 받을 수 있는 노드
- **content 기반**: 스키마의 `content` 정의에 따라 어떤 노드를 받을 수 있는지 결정
- **드래그 앤 드롭의 반대편**: draggable은 "무엇을 드래그하는가", droppable은 "어디에 드롭하는가"

### 중요한 구분: Draggable vs Droppable

#### Draggable Node (드래그 소스)
- **무엇을 드래그하는가**: 드래그할 수 있는 노드
- **기본적으로 모든 노드는 드래그 가능** (document 제외)
- `draggable: false`로 명시하면 드래그 불가능

#### Droppable Node (드롭 타겟)
- **어디에 드롭하는가**: 드롭할 수 있는 노드
- **content가 정의된 노드만 드롭 가능** (기본적으로)
- `droppable: false`로 명시하면 드롭 불가능
- 스키마의 `content` 정의에 따라 어떤 노드를 받을 수 있는지 결정

### 관계

- **Draggable Node**: 드래그할 수 있는 노드 (대부분의 노드)
- **Droppable Node**: 드롭할 수 있는 노드 (content가 있는 노드)
- **일부 노드는 둘 다 가능**: paragraph는 draggable이면서 droppable (자신을 드래그할 수 있고, 다른 노드를 받을 수 있음)

---

## 2. Droppable Node 판단 기준

### 2.1 우선순위 기반 판단

`_isDroppableNode(nodeId)` 함수는 다음 순서로 판단합니다:

#### 1단계: 스키마 droppable 속성 확인 (최우선)

```typescript
// 스키마에서 노드 타입의 droppable 속성 확인
const nodeType = schema.getNodeType(node.stype);

// droppable 속성이 명시적으로 false이면 드롭 불가능
if (nodeType.droppable === false) {
  return false;
}
```

#### 2단계: 스키마 content 확인

```typescript
// content가 있으면 드롭 가능 (기본값)
if (nodeType.content) {
  return true;
}

// content가 없으면 드롭 불가능 (기본값)
return false;
```

**예시:**
- `document` (content: 'block+') → **드롭 가능**
- `paragraph` (content: 'inline*') → **드롭 가능**
- `heading` (content: 'inline*') → **드롭 가능**
- `inline-text` (content 없음) → **드롭 불가능**
- `inline-image` (content 없음, atom: true) → **드롭 불가능**
- `fixedBlock` (content: 'inline*', droppable: false) → **드롭 불가능**

#### 3단계: 노드 content 필드 확인 (폴백)

```typescript
// 스키마 정보가 없으면 노드의 content 필드 확인
if (node.content !== undefined) {
  // content 필드가 있으면 드롭 가능
  return true;
}
```

#### 4단계: 기본값 (안전하게 false)

```typescript
// 그 외의 경우는 드롭 불가능 (안전하게 false)
return false;
```

---

## 3. 특정 노드 드롭 가능 여부 확인

### 3.1 canDropNode 함수

`canDropNode(targetNodeId, draggedNodeId)` 함수는 특정 노드를 드롭 타겟에 드롭할 수 있는지 확인합니다.

**판단 순서:**

1. **드롭 타겟이 droppable인지 확인**
   ```typescript
   if (!_isDroppableNode(targetNodeId)) {
     return false;
   }
   ```

2. **드래그되는 노드가 draggable인지 확인**
   ```typescript
   if (!_isDraggableNode(draggedNodeId)) {
     return false;
   }
   ```

3. **스키마의 content 정의 확인**
   ```typescript
   const targetNodeType = schema.getNodeType(targetNode.stype);
   const draggedNodeType = schema.getNodeType(draggedNode.stype);
   
   const contentModel = targetNodeType.content;
   const draggedGroup = draggedNodeType.group;
   const draggedStype = draggedNode.stype;
   
   // content 모델에서 draggedNode의 group 또는 stype이 허용되는지 확인
   if (contentModel.includes(draggedGroup) || contentModel.includes(draggedStype)) {
     return true;
   }
   ```

**예시:**

```typescript
// block 노드를 document에 드롭 가능
canDropNode('document-1', 'paragraph-1') // true (document의 content: 'block+')

// inline 노드를 paragraph에 드롭 가능
canDropNode('paragraph-1', 'inline-text-1') // true (paragraph의 content: 'inline*')
canDropNode('paragraph-1', 'inline-image-1') // true (paragraph의 content: 'inline*')

// block 노드를 inline 노드에 드롭 불가능
canDropNode('inline-text-1', 'paragraph-1') // false (inline-text는 content 없음)

// droppable: false인 노드에는 드롭 불가능
canDropNode('nonDroppableBlock-1', 'paragraph-1') // false
```

---

## 4. Droppable Node의 종류

### 4.1 Document 노드

**판단 기준:**
- `group: 'document'` (스키마에서 확인)
- `content: 'block+'` (스키마에서 확인)
- `droppable: false`가 아니면 드롭 가능

**특징:**
- block 노드를 받을 수 있음
- 최상위 컨테이너
- 다른 노드의 부모가 될 수 있음

**예시:**
```typescript
{
  stype: 'document',
  content: ['paragraph-1', 'paragraph-2']
  // 스키마 정의: { group: 'document', content: 'block+' }
}
// 사용자가 paragraph를 document에 드롭하면:
// moveNode({ nodeId: 'paragraph-1', newParentId: 'document-1', position: 2 })
```

### 4.2 Block 노드

**판단 기준:**
- `group: 'block'` (스키마에서 확인)
- `content` 정의 있음 (스키마에서 확인)
- `droppable: false`가 아니면 드롭 가능

**특징:**
- 일반적으로 inline 노드를 받을 수 있음
- Block 전체가 드롭 타겟이 됨

**예시:**
```typescript
{
  stype: 'paragraph',
  content: ['text-1', 'text-2']
  // 스키마 정의: { group: 'block', content: 'inline*' }
}
// 사용자가 inline-text를 paragraph에 드롭하면:
// moveNode({ nodeId: 'text-1', newParentId: 'paragraph-2', position: 1 })
```

### 4.3 Droppable이 아닌 노드

**판단 기준:**
- `content` 정의 없음
- `droppable: false`로 명시

**특징:**
- 드롭 타겟이 될 수 없음
- Atom 노드, 텍스트 노드 등

**예시:**
```typescript
{
  stype: 'inline-text',
  text: 'Hello World'
  // 스키마 정의: { group: 'inline' } (content 없음)
}
// inline-text는 드롭 불가능
```

---

## 5. 사용 케이스

### 5.1 드롭 타겟 확인

**시나리오**: 사용자가 노드를 드래그하여 다른 노드 위에 호버

```
Before:
[paragraph-1: "Hello"]
[paragraph-2: "World"]
         ↑ 드래그 중
         ↑ 호버 (드롭 가능한지 확인)

동작:
if (dataStore.isDroppableNode('paragraph-2')) {
  // 드롭 타겟으로 표시 (예: 배경색 변경)
  element.classList.add('droppable');
} else {
  // 드롭 불가능 표시 (예: 커서 변경)
  element.classList.add('no-drop');
}
```

**동작:**
```typescript
// 사용자가 노드를 드래그하여 다른 노드 위에 호버
function handleDragOver(targetNodeId: string) {
  if (dataStore.isDroppableNode(targetNodeId)) {
    // 드롭 타겟으로 표시
    event.preventDefault(); // 드롭 허용
    element.classList.add('droppable');
  } else {
    // 드롭 불가능 표시
    element.classList.add('no-drop');
  }
}
```

### 5.2 특정 노드 드롭 가능 여부 확인

**시나리오**: 사용자가 paragraph를 드래그하여 다른 paragraph 위에 드롭 시도

```
Before:
[paragraph-1: "Hello"]
[paragraph-2: "World"]
         ↑ 드래그 중
         ↑ 드롭 시도

동작:
if (dataStore.canDropNode('paragraph-2', 'paragraph-1')) {
  // 드롭 가능: moveNode 실행
} else {
  // 드롭 불가능: 드롭 차단
}
```

**동작:**
```typescript
// 사용자가 노드를 드롭했을 때
function handleDrop(targetNodeId: string, position: number, draggedNodeId: string) {
  // 특정 노드를 드롭할 수 있는지 확인
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
  } else {
    // 드롭 불가능: 드롭 차단
    event.preventDefault();
    // 시각적 피드백 제공
  }
}
```

### 5.3 드롭 가능한 노드 목록 조회

**시나리오**: 드래그 중일 때 드롭 가능한 노드에만 시각적 피드백 제공

```
Before:
[paragraph-1: "Hello"]
[paragraph-2: "World"]
[inline-text-1: "Foo"]
         ↑ 드래그 중

동작:
const droppableNodes = dataStore.getDroppableNodes();
// paragraph-1, paragraph-2만 포함 (inline-text-1은 제외)
droppableNodes.forEach(node => {
  highlightDroppableArea(node.sid);
});
```

**동작:**
```typescript
// 사용자가 노드를 드래그 시작했을 때
function handleDragStart(draggedNodeId: string) {
  // 모든 드롭 가능한 노드에 시각적 피드백 제공
  const droppableNodes = dataStore.getDroppableNodes();
  droppableNodes.forEach(node => {
    const element = document.querySelector(`[data-bc-sid="${node.sid}"]`);
    if (element) {
      element.classList.add('droppable-target');
    }
  });
}

// 드래그 종료 시 피드백 제거
function handleDragEnd() {
  const droppableNodes = dataStore.getDroppableNodes();
  droppableNodes.forEach(node => {
    const element = document.querySelector(`[data-bc-sid="${node.sid}"]`);
    if (element) {
      element.classList.remove('droppable-target');
    }
  });
}
```

---

## 6. 판단 로직 상세

### 6.1 _isDroppableNode 구현

```typescript
private _isDroppableNode(nodeId: string): boolean {
  const node = this.dataStore.getNode(nodeId);
  if (!node) {
    return false;
  }
  
  // 1. 스키마에서 content와 droppable 확인 (최우선)
  const schema = this.dataStore.getActiveSchema();
  if (schema) {
    try {
      const nodeType = schema.getNodeType(node.stype);
      if (nodeType) {
        // droppable 속성이 명시적으로 false이면 드롭 불가능
        if (nodeType.droppable === false) {
          return false;
        }
        
        // content가 있으면 드롭 가능 (기본값)
        if (nodeType.content) {
          return true;
        }
        
        // content가 없으면 드롭 불가능 (기본값)
        return false;
      }
    } catch (error) {
      // 스키마 조회 실패 시 계속 진행
    }
  }
  
  // 2. 스키마 정보가 없으면 노드의 content 필드 확인
  if (node.content !== undefined) {
    // content 필드가 있으면 드롭 가능
    return true;
  }
  
  // 3. 그 외의 경우는 드롭 불가능 (안전하게 false)
  return false;
}
```

### 6.2 canDropNode 구현

```typescript
canDropNode(targetNodeId: string, draggedNodeId: string): boolean {
  // 1. 드롭 타겟이 droppable인지 확인
  if (!this._isDroppableNode(targetNodeId)) {
    return false;
  }
  
  // 2. 드래그되는 노드가 draggable인지 확인
  if (!this._isDraggableNode(draggedNodeId)) {
    return false;
  }
  
  // 3. 스키마의 content 정의 확인
  const schema = this.dataStore.getActiveSchema();
  if (!schema) {
    return true; // 스키마가 없으면 기본적으로 허용
  }
  
  const targetNode = this.dataStore.getNode(targetNodeId);
  const draggedNode = this.dataStore.getNode(draggedNodeId);
  
  if (!targetNode || !draggedNode) {
    return false;
  }
  
  const targetNodeType = schema.getNodeType(targetNode.stype);
  const draggedNodeType = schema.getNodeType(draggedNode.stype);
  
  if (!targetNodeType || !draggedNodeType) {
    return false;
  }
  
  const contentModel = targetNodeType.content;
  if (!contentModel) {
    return false; // content가 없으면 드롭 불가능
  }
  
  // content 모델에서 draggedNode의 group 또는 stype이 허용되는지 확인
  const draggedGroup = draggedNodeType.group;
  const draggedStype = draggedNode.stype;
  
  const contentModelLower = contentModel.toLowerCase();
  
  // group 기반 확인
  if (draggedGroup && contentModelLower.includes(draggedGroup)) {
    return true;
  }
  
  // stype 기반 확인
  if (contentModelLower.includes(draggedStype)) {
    return true;
  }
  
  return false;
}
```

---

## 7. Draggable vs Droppable 비교

### 7.1 핵심 구분

| 구분 | Draggable Node | Droppable Node |
|------|---------------|----------------|
| **의미** | 드래그할 수 있는 노드 (드래그 소스) | 드롭할 수 있는 노드 (드롭 타겟) |
| **판단 기준** | 기본적으로 모든 노드 (document 제외) | content가 있는 노드만 |
| **제어** | `draggable: false`로 명시 | `droppable: false`로 명시 |
| **예시** | paragraph, inline-text, inline-image | document, paragraph, heading |

### 7.2 관계

**Venn Diagram:**
```
Draggable Node (대부분의 노드)
  ├── Droppable Node (content가 있는 노드)
  │     └── 둘 다 가능 (paragraph, heading 등)
  └── Non-Droppable Draggable (content가 없는 노드)
        └── inline-text, inline-image 등
```

**예시:**
- **둘 다 가능**: paragraph, heading, document
  - 드래그할 수 있고, 다른 노드를 받을 수 있음
- **Draggable만 가능**: inline-text, inline-image
  - 드래그할 수 있지만, 다른 노드를 받을 수 없음
- **둘 다 불가능**: draggable: false, droppable: false인 노드

---

## 8. 주요 사용처

### 8.1 드래그 앤 드롭 이벤트 처리

```typescript
// 사용자가 노드를 드래그하여 다른 노드 위에 호버
function handleDragOver(targetNodeId: string, draggedNodeId: string) {
  // 드롭 타겟이 droppable인지 확인
  if (dataStore.isDroppableNode(targetNodeId)) {
    // 특정 노드를 드롭할 수 있는지 확인
    if (dataStore.canDropNode(targetNodeId, draggedNodeId)) {
      // 드롭 가능: 드롭 허용
      event.preventDefault();
      element.classList.add('droppable');
    } else {
      // 드롭 불가능: 드롭 차단
      element.classList.add('no-drop');
    }
  }
}

// 사용자가 노드를 드롭했을 때
function handleDrop(targetNodeId: string, position: number, draggedNodeId: string) {
  // 드롭 가능 여부 확인
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

### 8.2 드롭 가능한 노드 목록 조회

```typescript
// 문서 내 모든 드롭 가능한 노드 조회
const droppableNodes = dataStore.getDroppableNodes();

// Block 노드만 조회
const blockNodes = dataStore.getDroppableNodes({
  includeBlocks: true,
  includeInline: false,
  includeDocument: false
});
```

### 8.3 드롭 가능 여부 확인

```typescript
// 특정 노드가 드롭 타겟이 될 수 있는지 확인
if (dataStore.isDroppableNode(nodeId)) {
  // 드롭 UI 활성화 (예: 드롭 영역 표시)
  element.setAttribute('data-droppable', 'true');
} else {
  // 드롭 UI 비활성화
  element.setAttribute('data-droppable', 'false');
}
```

---

## 9. 요약

### Droppable Node의 정의

1. **드롭 타겟이 될 수 있는 노드** (다른 노드를 받을 수 있음)
2. **content가 정의된 노드** (기본적으로 드롭 가능)
3. **스키마의 content 정의에 따라 어떤 노드를 받을 수 있는지 결정**

### 핵심 구분

- **Draggable Node**: 드래그할 수 있는 노드 (대부분의 노드)
- **Droppable Node**: 드롭할 수 있는 노드 (content가 있는 노드)
- **canDropNode**: 특정 노드를 드롭 타겟에 드롭할 수 있는지 확인

### 판단 기준 (우선순위)

1. **스키마 droppable 속성** (최우선)
   - `droppable: false` → 드롭 불가능
2. **스키마 content 확인**
   - `content` 있음 → 드롭 가능 (기본값)
   - `content` 없음 → 드롭 불가능 (기본값)
3. **노드 content 필드 확인** (폴백)
   - `content` 필드 있음 → 드롭 가능
4. **기본값**
   - 그 외는 드롭 불가능 (안전하게 false)

### 주요 사용처

- 드래그 앤 드롭 이벤트 처리: 드롭 타겟 확인 및 드롭 가능 여부 확인
- moveNode operation: 드롭 가능한 노드만 이동 가능
- 드롭 UI: 드롭 가능한 노드에만 드롭 영역 표시

---

## 10. 참고 자료

- `packages/datastore/src/operations/utility-operations.ts`: `_isDroppableNode`, `canDropNode` 구현
- `packages/datastore/test/get-editable-node.test.ts`: 테스트 케이스
- `packages/datastore/docs/draggable-node-spec.md`: Draggable Node 명세
- `packages/model/src/operations/moveNode.ts`: moveNode operation 구현
- `packages/schema/src/validators.ts`: Content 모델 검증 로직

