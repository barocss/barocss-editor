# Editable Node 명세

## 개요

이 문서는 "Editable Node"의 정의, 용도, 판단 기준을 명확히 정의합니다.

---

## 1. Editable Node란?

**Editable Node**는 **커서로 탐색 가능한 노드**입니다. 즉, Backspace, Delete, 화살표 키 등의 편집 명령으로 이전/다음 노드를 찾을 수 있는 노드입니다.

### 핵심 개념

- **커서로 탐색 가능**: `getPreviousEditableNode` / `getNextEditableNode`로 이전/다음 노드를 찾을 수 있음
- **편집 명령 적용**: Backspace, Delete, 화살표 키 등의 편집 명령이 적용되는 노드
- **Selection 대상**: Range Selection 또는 Node Selection의 대상이 될 수 있음

### 중요한 구분: Editable vs Selectable

#### Editable Node (커서로 탐색 가능)
- **텍스트 노드**: `.text` 필드가 있는 노드 (offset 기반 커서 이동 가능)
- **Inline 노드**: `group: 'inline'`인 노드 (atom 노드 포함)
- **특징**: Backspace/Delete/화살표 키로 탐색 가능

#### Selectable Node (클릭으로 선택 가능)
- **Block 노드**: paragraph, heading, table 등
- **특징**: 
  - 클릭하면 Node Selection으로 선택 가능
  - 하지만 Backspace/Delete/화살표 키로는 탐색 불가능 (editable node가 아님)
  - Block 노드 자체는 편집 명령으로 탐색할 수 없고, 내부의 inline 노드만 탐색 가능

### Selection 방식의 차이

Editable Node는 노드 타입에 따라 다른 Selection 방식을 사용합니다:

#### 텍스트 노드 (Text Nodes)
- **Range Selection**: offset 기반으로 커서를 둘 수 있음
- 예: `{ type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5 }`

#### Inline Atom 노드 (Inline Atomic Nodes)
- **Node Selection**: 노드 전체를 선택 (offset 없음)
- 예: `{ type: 'node', nodeId: 'image-1' }`

### Editable Node가 아닌 것

- **Block 노드**: `paragraph`, `heading`, `table`, `codeBlock` 등
  - 클릭하면 선택 가능하지만, 편집 명령으로 탐색할 수 없음
  - 내부의 inline 노드들은 편집 가능하지만, block 노드 자체는 편집 불가능
- **Document 노드**: 최상위 컨테이너 (편집 대상이 아님)

---

## 2. Editable Node 판단 기준

### 2.1 우선순위 기반 판단

`_isEditableNode(nodeId)` 함수는 다음 순서로 판단합니다:

#### 1단계: 스키마 Group 확인 (최우선)

```typescript
// 스키마에서 노드 타입의 group 확인
const nodeType = schema.getNodeType(node.stype);
const group = nodeType?.group;

// Editable Block: block이지만 editable=true이면 편집 가능
if (group === 'block' && nodeType.editable === true) {
  // .text 필드가 있어야 편집 가능
  if (node.text !== undefined && typeof node.text === 'string') {
    return true; // 편집 가능한 block
  }
  return false;
}

if (group === 'block' || group === 'document') {
  return false; // 편집 불가능
}
if (group === 'inline') {
  return true; // 편집 가능
}
```

**예시:**
- `paragraph` (group: 'block') → **편집 불가능**
- `codeBlock` (group: 'block', editable: true, .text 필드 있음) → **편집 가능**
- `.text` 필드가 있는 노드 (group: 'inline') → **편집 가능**
- `group: 'inline'`인 노드 → **편집 가능**

#### 2단계: stype 접두사 확인 (폴백)

```typescript
// 'inline-' 접두사가 있으면 inline 노드로 간주
if (node.stype && node.stype.startsWith('inline-')) {
  return true; // 편집 가능
}
```

**예시:**
- `stype`이 `'inline-'` 접두사를 가지는 노드 → **편집 가능**
- 스키마 정보가 없을 때의 폴백 로직

#### 3단계: Block 노드 추정 (폴백)

```typescript
// content가 있고 text 필드가 없으면 block으로 간주
if (node.content && node.text === undefined) {
  return false; // 편집 불가능
}
```

#### 4단계: .text 필드 확인

```typescript
// .text 필드가 있고 문자열 타입이면 텍스트 노드
// 주의: codeBlock처럼 .text 필드가 있어도 group이 'block'이면 이미 1단계에서 false 반환됨
if (node.text !== undefined && typeof node.text === 'string') {
  return true; // 편집 가능
}
```

**예시:**
- `.text` 필드가 있고 문자열 타입인 노드 → **편집 가능**
- `codeBlock`처럼 `.text` 필드가 있어도 `group: 'block'`이면 이미 1단계에서 false 반환

#### 5단계: 기본값 (안전하게 true)

```typescript
// 그 외의 경우는 편집 가능한 노드로 간주 (안전하게 true)
return true;
```

---

## 3. Editable Node의 종류

### 3.1 텍스트 노드 (Text Nodes)

**판단 기준:**
- `.text` 필드가 있고 `typeof node.text === 'string'`
- `group: 'inline'` (또는 스키마 정보 없을 때 폴백 로직)

**특징:**
- 커서를 텍스트 내부에 둘 수 있음
- 텍스트 편집(삽입, 삭제) 가능
- Range Selection 사용 (offset 기반)

**예시:**
```typescript
{
  stype: 'inline-text', // stype은 중요하지 않음
  text: 'Hello World'   // .text 필드가 있으면 텍스트 노드로 판단
}
// 또는
{
  stype: 'custom-text-node', // 다른 stype이어도
  text: 'Hello World'         // .text 필드가 있으면 텍스트 노드
}
```

**사용 케이스:**
- 텍스트 입력
- Backspace/Delete로 문자 삭제
- 화살표 키로 커서 이동

### 3.2 Inline Atom 노드 (Inline Atomic Nodes)

**판단 기준:**
- `group: 'inline'` (스키마에서 확인)
- `atom: true` (스키마에서 확인)
- `.text` 필드 없음

**특징:**
- 원자적(atomic) 노드로, 내부 편집 불가능
- 노드 전체를 선택/삭제할 수 있음
- Node Selection 사용 (offset 없음)

**예시:**
```typescript
{
  stype: 'inline-image', // stype은 중요하지 않음
  attributes: { src: 'image.jpg', alt: 'Image' }
  // .text 필드 없음
  // 스키마 정의: { group: 'inline', atom: true }
}
// 또는
{
  stype: 'custom-atom-node', // 다른 stype이어도
  attributes: { ... }
  // 스키마 정의: { group: 'inline', atom: true }이면 atom 노드
}
```

**사용 케이스:**
- Backspace로 노드 전체 삭제
- 화살표 키로 노드를 건너뛰고 이동
- 노드 선택 (Node Selection)

### 3.3 기타 Inline 노드

**판단 기준:**
- `group: 'inline'` (스키마에서 확인)
- `.text` 필드 없음
- `atom: false` 또는 `atom` 속성 없음

**특징:**
- Inline 노드이지만 텍스트 노드도 atom 노드도 아님
- 링크, 멘션, 버튼 등

**예시:**
```typescript
{
  stype: 'inline-link', // 또는 다른 inline 노드
  attributes: { href: 'https://example.com' }
  // 스키마: { group: 'inline' }
}
```

**사용 케이스:**
- Backspace/Delete로 노드 삭제
- 화살표 키로 탐색

---

## 4. Editable Node가 아닌 것

### 4.1 Block 노드

**특징:**
- `group: 'block'`
- 내부에 inline 노드들을 포함
- 커서를 직접 둘 수 없음 (내부의 inline 노드에만 커서 가능)

**예시:**
```typescript
{
  stype: 'paragraph',
  content: ['text-1', 'text-2'] // 내부의 text 노드들이 편집 가능
}
```

**동작:**
- `getPreviousEditableNode` / `getNextEditableNode`에서 **건너뜀**
- 내부의 inline 노드들을 찾아서 반환

### 4.2 Document 노드

**특징:**
- `group: 'document'`
- 최상위 컨테이너
- 편집 대상이 아님

**예시:**
```typescript
{
  stype: 'document',
  content: ['paragraph-1', 'paragraph-2']
}
```

### 4.3 특수 케이스: Editable Block (codeBlock, mathBlock 등)

**개념:**
- `group: 'block'`이지만 `.text` 필드를 가질 수 있음
- `editableBlock: true` 속성을 설정하면 **편집 가능**한 block 노드가 됨

**예시:**
```typescript
// 스키마 정의
{
  'codeBlock': {
    name: 'codeBlock',
    group: 'block',
    editable: true,  // 편집 가능한 block
    content: 'text*',
    attrs: {
      language: { type: 'string', default: 'text' }
    }
  }
}

// 노드 인스턴스
{
  stype: 'codeBlock',
  text: 'const x = 1;', // .text 필드가 있고
  // editable: true이므로 편집 가능
}
```

**판단 로직:**
1. 1단계(스키마 Group 확인)에서 `group: 'block'` 확인
2. `editable: true`이고 `.text` 필드가 있으면 → **편집 가능**
3. 그렇지 않으면 → **편집 불가능**

**사용 케이스:**
- `codeBlock`: 코드 편집
- `mathBlock`: 수식 편집
- `formula`: Excel 스타일 수식 편집

**자세한 내용:**
- 편집 상태 관리, 고급 에디터 통합 등은 `block-text-editing-strategies.md` 참고

---

## 5. 사용 케이스

### 5.1 Backspace 키 처리

**목적:** 이전 편집 가능한 노드를 찾아서 처리

**동작:**
```typescript
// Offset 0에서 Backspace
const prevEditableNodeId = dataStore.getPreviousEditableNode(currentNodeId);

if (prevEditableNodeId) {
  // 이전 편집 가능한 노드 처리
  // - 텍스트 노드: 마지막 문자 삭제 또는 병합
  // - Inline atom 노드: 노드 전체 삭제
}
```

**예시:**
```
Before:
[paragraph-1: "Hello"] [paragraph-2: "World"]
                        ↑ 커서 (paragraph-2의 text-2 offset 0)

Backspace 입력:
→ getPreviousEditableNode('text-2') 
→ 'text-1' 반환 (paragraph-1의 마지막 텍스트)
→ 블록 병합 또는 문자 삭제
```

### 5.2 Delete 키 처리

**목적:** 다음 편집 가능한 노드를 찾아서 처리

**동작:**
```typescript
// 텍스트 끝에서 Delete
const nextEditableNodeId = dataStore.getNextEditableNode(currentNodeId);

if (nextEditableNodeId) {
  // 다음 편집 가능한 노드 처리
}
```

### 5.3 화살표 키 처리

**목적:** 이전/다음 편집 가능한 노드로 커서 이동

**동작:**
```typescript
// 왼쪽 화살표 키
const prevEditableNodeId = dataStore.getPreviousEditableNode(currentNodeId);
if (prevEditableNodeId) {
  // 커서를 이전 노드로 이동
}

// 오른쪽 화살표 키
const nextEditableNodeId = dataStore.getNextEditableNode(currentNodeId);
if (nextEditableNodeId) {
  // 커서를 다음 노드로 이동
}
```

---

## 6. 판단 로직 상세

### 6.1 _isEditableNode 구현

```typescript
private _isEditableNode(nodeId: string): boolean {
  const node = this.dataStore.getNode(nodeId);
  if (!node) {
    return false;
  }

  // 1. 스키마에서 group 확인 (우선순위 높음)
  const schema = this.dataStore.getActiveSchema();
  if (schema) {
    try {
      const nodeType = schema.getNodeType(node.stype);
      if (nodeType) {
        const group = nodeType.group;
        // block 또는 document 노드는 편집 불가능
        if (group === 'block' || group === 'document') {
          return false;
        }
        // inline 노드는 편집 가능
        if (group === 'inline') {
          return true;
        }
      }
    } catch (error) {
      // 스키마 조회 실패 시 계속 진행
    }
  }

  // 2. 스키마 정보가 없으면 stype으로 추정
  // 'inline-' 접두사가 있으면 inline 노드로 간주
  if (node.stype && node.stype.startsWith('inline-')) {
    return true;
  }

  // 3. block 노드로 추정 (content가 있고 text 필드가 없으면 block으로 간주)
  if (node.content && node.text === undefined) {
    return false;
  }

  // 4. 텍스트 노드 (.text 필드가 있고, block이 아닌 경우)
  // 주의: codeBlock처럼 .text 필드가 있어도 group이 'block'이면 이미 위에서 false 반환됨
  if (node.text !== undefined && typeof node.text === 'string') {
    return true;
  }

  // 5. 그 외의 경우는 편집 가능한 노드로 간주 (안전하게 true)
  return true;
}
```

### 6.2 판단 순서의 중요성

**왜 스키마 Group을 먼저 확인하는가?**

1. **정확성**: 스키마 정의가 가장 정확한 정보
2. **codeBlock 케이스**: `.text` 필드가 있어도 `group: 'block'`이면 편집 불가능
3. **일관성**: 스키마 기반 판단이 가장 신뢰할 수 있음

**예시:**
```typescript
// codeBlock은 .text 필드를 가지지만 block 노드
{
  stype: 'codeBlock',
  text: 'const x = 1;',
  // group: 'block' (스키마 정의)
}

// 판단 과정:
// 1단계: group === 'block' → false 반환 (편집 불가능)
// 2단계: .text 필드 확인까지 도달하지 않음
```

---

## 7. Edge Cases

### 7.1 빈 Block 노드

**상황:**
```typescript
{
  stype: 'paragraph',
  content: [] // 빈 paragraph
}
```

**동작:**
- Block 노드이므로 `_isEditableNode` → `false`
- `getPreviousEditableNode` / `getNextEditableNode`에서 건너뜀
- 이전/다음 편집 가능한 노드를 찾아서 반환

### 7.2 중첩된 Block 구조

**상황:**
```typescript
{
  stype: 'blockQuote',
  content: [
    {
      stype: 'paragraph',
      content: [
        { stype: 'inline-text', text: 'Quote' } // .text 필드가 있는 노드
      ]
    }
  ]
}
```

**동작:**
- `blockQuote` (block) → 건너뜀
- `paragraph` (block) → 건너뜀
- `.text` 필드가 있는 노드 → **편집 가능** (반환)

### 7.3 Table 구조

**상황:**
```typescript
{
  stype: 'table',
  content: [
    {
      stype: 'tableRow',
      content: [
        {
          stype: 'tableCell',
          content: [
            { stype: 'inline-text', text: 'Cell Text' } // .text 필드가 있는 노드
          ]
        }
      ]
    }
  ]
}
```

**동작:**
- `table` (block) → 건너뜀
- `tableRow` (block) → 건너뜀
- `tableCell` (block) → 건너뜀
- `.text` 필드가 있는 노드 → **편집 가능** (반환)

---

## 8. 선택(Selection)과의 관계

### 8.1 Range Selection

**Editable Node 내에서:**
- 텍스트 노드: offset 기반 범위 선택 가능
- Inline atom 노드: 노드 전체 선택 (offset 없음)

**예시:**
```typescript
// 텍스트 노드 범위 선택
{
  type: 'range',
  startNodeId: 'text-1',
  startOffset: 5,
  endNodeId: 'text-1',
  endOffset: 10
}

// Inline image 노드 선택
{
  type: 'node',
  nodeId: 'image-1'
}
```

### 8.2 Node Selection

**Editable Node 전체 선택:**
- Inline atom 노드: 노드 전체 선택
- 텍스트 노드: 전체 텍스트 범위 선택

**예시:**
```typescript
// Inline image 노드 선택
{
  type: 'node',
  nodeId: 'image-1'
}

// 텍스트 노드 전체 선택 (Range로 변환)
{
  type: 'range',
  startNodeId: 'text-1',
  startOffset: 0,
  endNodeId: 'text-1',
  endOffset: textLength
}
```

---

## 9. Editable vs Selectable 구분

### 9.1 핵심 구분

| 구분 | Editable Node | Selectable Node (Block) |
|------|--------------|------------------------|
| **탐색 방법** | 커서로 탐색 (Backspace/Delete/화살표 키) | 클릭으로 선택 |
| **편집 명령** | `getPreviousEditableNode` / `getNextEditableNode`로 탐색 가능 | 탐색 불가능 (내부 inline 노드만 탐색 가능) |
| **Selection** | Range 또는 Node Selection | Node Selection만 |
| **예시** | `.text` 필드가 있는 노드, `group: 'inline'`인 노드 | `group: 'block'`인 노드 |

### 9.2 왜 Block 노드는 Editable Node가 아닌가?

**이유:**
- Block 노드는 **컨테이너** 역할을 함
- 실제 편집 대상은 내부의 inline 노드들
- Block 노드 자체를 Backspace/Delete로 탐색하는 것은 의미가 없음

**예시:**
```
[paragraph-1: "Hello"]
[paragraph-2: "World"]
         ↑ 커서 (paragraph-2의 text 노드 offset 0)

Backspace 입력:
→ getPreviousEditableNode('text-2')
→ 'text-1' 반환 (paragraph-1의 마지막 텍스트)
→ Block 병합 또는 문자 삭제

Block 노드 자체를 탐색하는 것이 아니라,
내부의 inline 노드를 탐색하는 것
```

### 9.3 Block 노드 선택은?

**Block 노드는 Selectable:**
- 사용자가 클릭하면 Node Selection으로 선택 가능
- 하지만 편집 명령으로는 탐색 불가능

**예시:**
```typescript
// 사용자가 paragraph를 클릭
{
  type: 'node',
  nodeId: 'paragraph-1'
}

// 하지만 Backspace/Delete/화살표 키로는 탐색 불가능
// → getPreviousEditableNode('paragraph-1')는 내부의 inline 노드를 찾음
```

---

## 10. 요약

### Editable Node의 정의

1. **커서로 탐색 가능한 노드** (Backspace/Delete/화살표 키)
2. **편집 명령으로 이전/다음 노드를 찾을 수 있는 노드**
3. **Block 노드가 아닌 노드** (block 노드는 내부의 inline 노드만 편집 가능)

### 핵심 구분

- **Editable Node**: 커서로 탐색 가능 (텍스트, inline)
- **Selectable Node**: 클릭으로 선택 가능 (block 포함)
- **Block 노드**: 클릭하면 선택 가능하지만, 편집 명령으로는 탐색 불가능

### 판단 기준 (우선순위)

1. **스키마 Group** (최우선)
   - `group: 'block'` + `editable: true` + `.text` 필드 있음 → **편집 가능** (Editable Block)
   - `group: 'block'` 또는 `'document'` → 편집 불가능
   - `group: 'inline'` → 편집 가능
2. **stype 접두사** (폴백)
   - `'inline-'` 접두사 → 편집 가능
3. **Block 추정** (폴백)
   - `content` 있고 `.text` 없으면 편집 불가능
4. **.text 필드**
   - 있으면 편집 가능 (단, 이미 block으로 판단된 경우 제외)
5. **기본값**
   - 그 외는 편집 가능 (안전하게 true)

### 주요 사용처

- `getPreviousEditableNode`: Backspace, 왼쪽 화살표 키
- `getNextEditableNode`: Delete, 오른쪽 화살표 키
- Selection 관리: Range Selection의 대상 노드

---

## 10. 참고 자료

- `packages/datastore/src/operations/utility-operations.ts`: `_isEditableNode` 구현
- `packages/datastore/test/get-editable-node.test.ts`: 테스트 케이스
- `packages/extensions/src/delete.ts`: Backspace 로직에서 사용
- `packages/datastore/docs/block-text-editing-strategies.md`: Block 노드 내부 텍스트 편집 전략 (codeBlock, mathBlock 등)
- `packages/datastore/docs/selectable-node-spec.md`: Selectable Node 명세 (클릭으로 선택 가능한 노드)

