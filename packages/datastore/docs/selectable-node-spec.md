# Selectable Node 명세

## 개요

이 문서는 "Selectable Node"의 정의, 용도, 판단 기준을 명확히 정의합니다.

---

## 1. Selectable Node란?

**Selectable Node**는 **클릭으로 선택 가능한 노드**입니다. 즉, 사용자가 마우스 클릭, 드래그, 또는 키보드 단축키로 노드를 선택할 수 있는 노드입니다.

### 핵심 개념

- **클릭으로 선택 가능**: 사용자가 노드를 클릭하면 Node Selection 또는 Range Selection으로 선택됨
- **Selection 대상**: Node Selection 또는 Range Selection의 대상이 될 수 있음
- **편집 명령과는 독립적**: Editable Node와는 별개 개념 (selectable이지만 editable이 아닐 수 있음)

### 중요한 구분: Editable vs Selectable

#### Editable Node (커서로 탐색 가능)
- **텍스트 노드**: `.text` 필드가 있는 노드
- **Inline 노드**: `group: 'inline'`인 노드
- **Editable Block**: `group: 'block'` + `editable: true` + `.text` 필드 있음
- **특징**: Backspace/Delete/화살표 키로 탐색 가능

#### Selectable Node (클릭으로 선택 가능)
- **Block 노드**: paragraph, heading, table 등
- **Inline 노드**: inline-image, inline-link 등
- **텍스트 노드**: inline-text 등
- **특징**: 
  - 클릭하면 Node Selection 또는 Range Selection으로 선택 가능
  - Editable Node와는 별개 (block 노드는 selectable이지만 editable이 아님)

### Selection 방식의 차이

Selectable Node는 노드 타입에 따라 다른 Selection 방식을 사용합니다:

#### Block 노드
- **Node Selection**: 노드 전체를 선택
- 예: `{ type: 'node', nodeId: 'paragraph-1' }`
- 사용자가 block을 클릭하면 Node Selection으로 선택됨

#### Inline Atom 노드
- **Node Selection**: 노드 전체를 선택 (offset 없음)
- 예: `{ type: 'node', nodeId: 'image-1' }`
- 사용자가 inline-image를 클릭하면 Node Selection으로 선택됨

#### 텍스트 노드
- **Range Selection**: offset 기반으로 커서를 둘 수 있음
- 예: `{ type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5 }`
- 사용자가 텍스트를 클릭하면 Range Selection (커서)로 선택됨
- 또는 텍스트 전체를 선택하면 Range Selection (범위)로 선택됨

---

## 2. Selectable Node 판단 기준

### 2.1 우선순위 기반 판단

`_isSelectableNode(nodeId)` 함수는 다음 순서로 판단합니다:

#### 1단계: 스키마 Group 확인 (최우선)

```typescript
// 스키마에서 노드 타입의 group 확인
const nodeType = schema.getNodeType(node.stype);
const group = nodeType?.group;

// document 노드는 항상 선택 불가능
if (group === 'document') {
  return false;
}

// selectable 속성이 명시적으로 false이면 선택 불가능
if (nodeType.selectable === false) {
  return false;
}

// 그 외의 경우는 선택 가능 (기본값 true)
return true;
```

**예시:**
- `paragraph` (group: 'block') → **선택 가능**
- `inline-image` (group: 'inline') → **선택 가능**
- `inline-text` (group: 'inline') → **선택 가능**
- `document` (group: 'document') → **선택 불가능**
- `hiddenBlock` (group: 'block', selectable: false) → **선택 불가능**

#### 2단계: stype 확인 (폴백)

```typescript
// stype이 'document'이면 선택 불가능
if (node.stype === 'document') {
  return false;
}
```

#### 3단계: 기본값 (안전하게 true)

```typescript
// 그 외의 경우는 선택 가능 (안전하게 true)
return true;
```

---

## 3. Selectable Node의 종류

### 3.1 Block 노드

**판단 기준:**
- `group: 'block'` (스키마에서 확인)
- `selectable: false`가 아니면 선택 가능

**특징:**
- 클릭하면 Node Selection으로 선택됨
- Block 전체가 선택됨 (내부 텍스트가 아닌 block 자체)
- Editable Node가 아님 (편집 명령으로 탐색 불가능)

**예시:**
```typescript
{
  stype: 'paragraph',
  content: ['text-1', 'text-2']
  // 스키마 정의: { group: 'block' }
}
// 사용자가 paragraph를 클릭하면:
// { type: 'node', nodeId: 'paragraph-1' }
```

**사용 케이스:**
- Block 전체 선택
- Block 삭제
- Block 이동/복사

### 3.2 Inline Atom 노드

**판단 기준:**
- `group: 'inline'` (스키마에서 확인)
- `atom: true` (스키마에서 확인)
- `.text` 필드 없음
- `selectable: false`가 아니면 선택 가능

**특징:**
- 클릭하면 Node Selection으로 선택됨
- 노드 전체가 선택됨 (offset 없음)
- Editable Node임 (편집 명령으로 탐색 가능)

**예시:**
```typescript
{
  stype: 'inline-image',
  attributes: { src: 'image.jpg', alt: 'Image' }
  // 스키마 정의: { group: 'inline', atom: true }
}
// 사용자가 inline-image를 클릭하면:
// { type: 'node', nodeId: 'image-1' }
```

**사용 케이스:**
- 이미지 선택
- 이미지 삭제
- 이미지 속성 편집

### 3.3 텍스트 노드

**판단 기준:**
- `.text` 필드가 있고 `typeof node.text === 'string'`
- `group: 'inline'` (스키마에서 확인)
- `selectable: false`가 아니면 선택 가능

**특징:**
- 클릭하면 Range Selection (커서)로 선택됨
- 텍스트 범위를 드래그하면 Range Selection (범위)로 선택됨
- Editable Node임 (편집 명령으로 탐색 가능)

**예시:**
```typescript
{
  stype: 'inline-text',
  text: 'Hello World'
  // 스키마 정의: { group: 'inline' }
}
// 사용자가 텍스트를 클릭하면:
// { type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5, collapsed: true }
```

**사용 케이스:**
- 텍스트 편집
- 텍스트 범위 선택
- 커서 이동

### 3.4 Editable Block 노드

**판단 기준:**
- `group: 'block'` (스키마에서 확인)
- `editable: true` (스키마에서 확인)
- `.text` 필드 있음
- `selectable: false`가 아니면 선택 가능

**특징:**
- 클릭하면 Node Selection 또는 Range Selection으로 선택 가능
- Editable Node임 (편집 명령으로 탐색 가능)

**예시:**
```typescript
{
  stype: 'codeBlock',
  text: 'const x = 1;'
  // 스키마 정의: { group: 'block', editable: true }
}
// 사용자가 codeBlock을 클릭하면:
// { type: 'node', nodeId: 'codeBlock-1' } 또는
// { type: 'range', startNodeId: 'codeBlock-1', startOffset: 0, ... }
```

---

## 4. Selectable Node가 아닌 것

### 4.1 Document 노드

**특징:**
- `group: 'document'`
- 최상위 컨테이너
- 선택 대상이 아님

**예시:**
```typescript
{
  stype: 'document',
  content: ['paragraph-1', 'paragraph-2']
}
// document 노드는 선택 불가능
```

### 4.2 selectable: false인 노드

**특징:**
- 스키마에서 `selectable: false`로 명시
- 클릭해도 선택되지 않음
- UI 요소나 숨겨진 노드에 사용

**예시:**
```typescript
// 스키마 정의
{
  'hiddenBlock': {
    name: 'hiddenBlock',
    group: 'block',
    selectable: false  // 선택 불가능
  }
}
```

---

## 5. 사용 케이스

### 5.1 클릭으로 노드 선택

**시나리오**: 사용자가 paragraph를 클릭

```
Before:
[paragraph-1: "Hello"]
[paragraph-2: "World"]
         ↑ 클릭

After:
[paragraph-1: "Hello"]
[paragraph-2: "World"] (선택됨)

Selection: { type: 'node', nodeId: 'paragraph-2' }
```

**동작:**
```typescript
// 사용자가 paragraph를 클릭
if (dataStore.isSelectableNode('paragraph-2')) {
  // Node Selection으로 선택
  editor.updateSelection({
    type: 'node',
    nodeId: 'paragraph-2'
  });
}
```

### 5.2 클릭으로 이미지 선택

**시나리오**: 사용자가 inline-image를 클릭

```
Before:
[text-1: "Hello"] [image-1] [text-2: "World"]
                   ↑ 클릭

After:
[text-1: "Hello"] [image-1 (선택됨)] [text-2: "World"]

Selection: { type: 'node', nodeId: 'image-1' }
```

**동작:**
```typescript
// 사용자가 inline-image를 클릭
if (dataStore.isSelectableNode('image-1')) {
  // Node Selection으로 선택
  editor.updateSelection({
    type: 'node',
    nodeId: 'image-1'
  });
  
  // ComponentManager에 select 이벤트 전달
  componentManager.emit('select', 'image-1', { ... });
}
```

### 5.3 클릭으로 텍스트 커서 이동

**시나리오**: 사용자가 텍스트를 클릭

```
Before:
[text-1: "Hello World"]
         ↑ 클릭 (offset 5)

After:
[text-1: "Hello World"]
     ↑ 커서 (offset 5)

Selection: { type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5, collapsed: true }
```

**동작:**
```typescript
// 사용자가 텍스트를 클릭
if (dataStore.isSelectableNode('text-1')) {
  // Range Selection (커서)로 선택
  editor.updateSelection({
    type: 'range',
    startNodeId: 'text-1',
    startOffset: 5,
    endNodeId: 'text-1',
    endOffset: 5,
    collapsed: true
  });
}
```

---

## 6. 판단 로직 상세

### 6.1 _isSelectableNode 구현

```typescript
private _isSelectableNode(nodeId: string): boolean {
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
        
        // document 노드는 항상 선택 불가능
        if (group === 'document') {
          return false;
        }
        
        // selectable 속성이 명시적으로 false이면 선택 불가능
        if (nodeType.selectable === false) {
          return false;
        }
        
        // 그 외의 경우는 선택 가능 (기본값 true)
        return true;
      }
    } catch (error) {
      // 스키마 조회 실패 시 계속 진행
    }
  }
  
  // 2. 스키마 정보가 없으면 기본적으로 선택 가능 (document 제외)
  if (node.stype === 'document') {
    return false;
  }
  
  // 3. 그 외의 경우는 선택 가능 (안전하게 true)
  return true;
}
```

### 6.2 판단 순서의 중요성

**왜 스키마 Group을 먼저 확인하는가?**

1. **정확성**: 스키마 정의가 가장 정확한 정보
2. **명시적 제어**: `selectable: false`로 명시적으로 제어 가능
3. **일관성**: 스키마 기반으로 일관된 동작 보장

---

## 7. Editable vs Selectable 비교

### 7.1 핵심 구분

| 구분 | Editable Node | Selectable Node |
|------|--------------|----------------|
| **탐색 방법** | 커서로 탐색 (Backspace/Delete/화살표 키) | 클릭으로 선택 |
| **편집 명령** | `getPreviousEditableNode` / `getNextEditableNode`로 탐색 가능 | 탐색 불가능 (editable node가 아닌 경우) |
| **Selection** | Range 또는 Node Selection | Node Selection 또는 Range Selection |
| **예시** | `.text` 필드가 있는 노드, `group: 'inline'`인 노드, `editable: true`인 block | `group: 'block'`인 노드, `group: 'inline'`인 노드, 모든 노드 (document 제외) |

### 7.2 관계

**Editable Node는 Selectable Node의 부분집합:**
- 모든 Editable Node는 Selectable Node입니다
- 하지만 Selectable Node가 모두 Editable Node는 아닙니다
- 예: `paragraph`는 Selectable이지만 Editable이 아닙니다

**Venn Diagram:**
```
Selectable Node
  ├── Editable Node (텍스트, inline, editable block)
  └── Non-Editable Selectable (일반 block 노드)
```

---

## 8. 주요 사용처

### 8.1 클릭 이벤트 처리

```typescript
// 사용자가 노드를 클릭했을 때
function handleNodeClick(nodeId: string) {
  if (dataStore.isSelectableNode(nodeId)) {
    // Node Selection 또는 Range Selection으로 선택
    const node = dataStore.getNode(nodeId);
    if (node.text !== undefined) {
      // 텍스트 노드: Range Selection
      editor.updateSelection({
        type: 'range',
        startNodeId: nodeId,
        startOffset: 0,
        endNodeId: nodeId,
        endOffset: node.text.length,
        collapsed: false
      });
    } else {
      // Atom 노드 또는 Block: Node Selection
      editor.updateSelection({
        type: 'node',
        nodeId: nodeId
      });
    }
  }
}
```

### 8.2 ComponentManager 이벤트

```typescript
// Node Selection이 발생했을 때
function handleNodeSelection(selection: ModelNodeSelection) {
  if (dataStore.isSelectableNode(selection.nodeId)) {
    // ComponentManager에 select 이벤트 전달
    componentManager.emit('select', selection.nodeId, {
      selection: selection
    });
  }
}
```

### 8.3 선택 가능한 노드 목록 조회

```typescript
// 문서 내 모든 선택 가능한 노드 조회
const selectableNodes = dataStore.getSelectableNodes();

// Block 노드만 조회
const blockNodes = dataStore.getSelectableNodes({
  includeBlocks: true,
  includeInline: false,
  includeEditable: false
});
```

---

## 9. 요약

### Selectable Node의 정의

1. **클릭으로 선택 가능한 노드** (마우스 클릭, 드래그, 키보드 단축키)
2. **Node Selection 또는 Range Selection의 대상이 될 수 있는 노드**
3. **Document 노드가 아닌 노드** (기본적으로 모든 노드는 선택 가능)

### 핵심 구분

- **Editable Node**: 커서로 탐색 가능 (텍스트, inline, editable block)
- **Selectable Node**: 클릭으로 선택 가능 (block, inline, 텍스트 모두)
- **관계**: Editable Node는 Selectable Node의 부분집합

### 판단 기준 (우선순위)

1. **스키마 Group** (최우선)
   - `group: 'document'` → 선택 불가능
   - `selectable: false` → 선택 불가능
   - 그 외 → 선택 가능 (기본값 true)
2. **stype 확인** (폴백)
   - `stype === 'document'` → 선택 불가능
3. **기본값**
   - 그 외는 선택 가능 (안전하게 true)

### 주요 사용처

- 클릭 이벤트 처리: 노드 클릭 시 선택 가능 여부 확인
- Selection 관리: Node Selection 또는 Range Selection의 대상 노드
- ComponentManager 이벤트: 선택된 노드에 대한 이벤트 전달

---

## 10. 참고 자료

- `packages/datastore/src/operations/utility-operations.ts`: `_isSelectableNode` 구현
- `packages/datastore/test/get-editable-node.test.ts`: 테스트 케이스
- `packages/datastore/docs/editable-node-spec.md`: Editable Node 명세
- `packages/editor-view-dom/docs/selection-system.md`: Selection System 명세

