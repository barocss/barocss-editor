# indentText / outdentText 명세

## 개요

`indentText`와 `outdentText`는 **텍스트 내용 자체에 들여쓰기 문자열을 추가/제거**하는 기능입니다. 

**⚠️ 주의: 이 기능은 주로 코드 블록(code-block) 같은 단일 텍스트 노드에서 사용하는 것이 적합합니다.**

여러 노드에 걸친 범위나 paragraph가 여러 inline-text를 가지는 경우에는 노드 경계에서 예상과 다르게 동작할 수 있습니다.

## 핵심 개념

### indentText vs indentNode

| 구분 | indentText | indentNode |
|------|-----------|------------|
| **대상** | 텍스트 노드의 **내용** | 블록 노드의 **구조** |
| **동작** | 각 줄 앞에 공백 문자열 추가 | 노드를 이전 형제의 자식으로 이동 |
| **사용 사례** | 코드 블록 내부 들여쓰기 | 리스트 아이템 들여쓰기 |
| **모델 변경** | `node.text` 내용 변경 | `node.parentId`, `parent.content` 변경 |

### 예시

#### indentText (텍스트 내용 변경)

**Before:**
```javascript
// Model
{
  sid: 'code-1',
  stype: 'code-block',
  text: 'function hello() {\n  return "world";\n}'
}
```

**After `indentText(range, '  ')`:**
```javascript
// Model
{
  sid: 'code-1',
  stype: 'code-block',
  text: '  function hello() {\n    return "world";\n  }'
}
```

#### indentNode (구조 변경)

**Before:**
```javascript
// Model
{
  sid: 'doc',
  content: [
    { sid: 'p1', stype: 'paragraph', text: 'First' },
    { sid: 'p2', stype: 'paragraph', text: 'Second' }
  ]
}
```

**After `indentNode('p2')`:**
```javascript
// Model
{
  sid: 'doc',
  content: [
    { 
      sid: 'p1', 
      stype: 'paragraph', 
      text: 'First',
      content: [
        { sid: 'p2', stype: 'paragraph', text: 'Second', parentId: 'p1' }
      ]
    }
  ]
}
```

## 동작 원리

### 1. DataStore 레벨 (`range.indent` / `range.outdent`)

```typescript
// packages/datastore/src/operations/range-operations.ts

indent(contentRange: ModelSelection, indent: string = '  '): string {
  // 1. 범위에서 텍스트 추출
  const text = this.extractText(contentRange);
  if (text.length === 0) return '';
  
  // 2. 각 줄 앞에 indent 문자열 추가
  // 정규식: (^|\n) - 줄 시작 또는 줄바꿈 뒤
  const transformed = text.replace(/(^|\n)/g, (m, g1) => g1 + indent);
  
  // 3. 원본 범위를 변환된 텍스트로 교체
  this.replaceText(contentRange, transformed);
  
  return transformed;
}

outdent(contentRange: ModelSelection, indent: string = '  '): string {
  const text = this.extractText(contentRange);
  if (text.length === 0) return '';
  
  // indent 문자열을 이스케이프하여 정규식으로 사용
  const escaped = indent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(`(^|\\n)${escaped}`, 'g');
  
  // 각 줄 앞의 indent 문자열 제거
  const transformed = text.replace(rx, (m, g1) => g1);
  
  this.replaceText(contentRange, transformed);
  return transformed;
}
```

### 2. Model 레벨 (`indentText` / `outdentText` operation)

```typescript
// packages/model/src/operations/indentText.ts

defineOperation('indentText', async (operation, context) => {
  const payload = operation.payload;
  const indent = payload.indent ?? '  ';
  
  // 범위 생성 및 검증
  const range: ModelSelection = {
    type: 'range',
    startNodeId: nodeId,
    startOffset: start,
    endNodeId: nodeId,
    endOffset: end,
    collapsed: false,
    direction: 'forward'
  };
  
  // DataStore의 range.indent 호출
  const result = context.dataStore.range.indent(range, indent);
  
  return {
    ok: true,
    data: result,  // 변환된 텍스트 반환
    inverse: { type: 'outdentText', payload: { nodeId, start, end, indent } }
  };
});
```

### 3. Extension 레벨 (Command)

```typescript
// packages/extensions/src/indent.ts

editor.registerCommand({
  name: 'indentText',
  execute: async (editor, payload) => {
    const selection = payload?.selection || editor.selection;
    if (!selection || selection.type !== 'range') return false;
    
    // operation 생성 및 transaction 실행
    const operations = [
      ...control(selection.startNodeId, [
        indentText(selection.startOffset, selection.endOffset, indentStr)
      ])
    ];
    
    const result = await transaction(editor, operations).commit();
    return result.success;
  }
});
```

## Renderer-DOM 표현

### 핵심 원리

**`indentText`/`outdentText`는 모델의 `node.text` 내용을 변경하므로, renderer-dom은 자동으로 변경된 텍스트를 렌더링합니다.**

### 렌더링 흐름

```
1. Model 변경
   node.text: 'function hello() {\n  return "world";\n}'
   ↓ indentText 실행
   node.text: '  function hello() {\n    return "world";\n  }'

2. Renderer-DOM 렌더링
   - data('text')로 텍스트 가져오기
   - VNode 생성: { tag: 'code', children: [{ text: '  function...' }] }
   - DOM 생성: <code>  function hello() {
     return "world";
   }</code>

3. 브라우저 표시
   - 공백 문자는 그대로 유지됨 (white-space: pre 또는 pre-wrap 필요)
   - CSS로 들여쓰기 시각화
```

### 실제 예시

#### 코드 블록 예시

**Model:**
```javascript
{
  sid: 'code-1',
  stype: 'code-block',
  attributes: { language: 'javascript' },
  text: 'function hello() {\n  return "world";\n}'
}
```

**indentText 실행 후:**
```javascript
{
  sid: 'code-1',
  stype: 'code-block',
  attributes: { language: 'javascript' },
  text: '  function hello() {\n    return "world";\n  }'
}
```

**Renderer-DOM VNode:**
```javascript
{
  tag: 'pre',
  attributes: { 'data-language': 'javascript' },
  children: [
    {
      tag: 'code',
      children: [
        { text: '  function hello() {\n    return "world";\n  }' }
      ]
    }
  ]
}
```

**DOM 결과:**
```html
<pre data-language="javascript">
  <code>  function hello() {
    return "world";
  }</code>
</pre>
```

**CSS 필요:**
```css
pre, code {
  white-space: pre;  /* 또는 pre-wrap */
  /* 공백 문자가 그대로 유지됨 */
}
```

### 주의사항

1. **공백 문자 보존**
   - `indentText`는 실제 공백 문자(` `, `\t`)를 텍스트에 추가합니다.
   - 브라우저는 기본적으로 연속된 공백을 하나로 축약하므로, `white-space: pre` 또는 `pre-wrap` CSS가 필요합니다.

2. **Mark 범위 조정**
   - `range.replaceText`는 마크 범위를 자동으로 조정합니다.
   - 들여쓰기로 인한 텍스트 길이 변경에 따라 마크 범위도 이동합니다.

3. **Cross-node 범위**
   - 여러 노드에 걸친 범위도 지원합니다.
   - 각 노드의 해당 부분에 들여쓰기가 적용됩니다.

## 사용 사례

### 1. 코드 블록 들여쓰기

```typescript
// 사용자가 코드 블록 내부에서 Tab 키를 누름
const selection = {
  type: 'range',
  startNodeId: 'code-1',
  startOffset: 0,
  endNodeId: 'code-1',
  endOffset: 20
};

// indentText 실행
await editor.executeCommand('indentText', {
  selection,
  indent: '  '  // 2 spaces
});

// 결과: 코드 블록의 선택된 부분이 2칸 들여쓰기됨
```

### 2. 인용문 들여쓰기

```typescript
// 인용문 내부 텍스트 들여쓰기
const selection = {
  type: 'range',
  startNodeId: 'quote-text-1',
  startOffset: 0,
  endNodeId: 'quote-text-1',
  endOffset: 50
};

await editor.executeCommand('indentText', {
  selection,
  indent: '> '  // 인용문 표시
});
```

### 3. 리스트 아이템 들여쓰기 (구조적)

```typescript
// 리스트 아이템 자체를 들여쓰기 (구조 변경)
await editor.executeCommand('indentNode', {
  nodeId: 'list-item-2'
});

// 이건 indentNode를 사용 (구조 변경)
```

## DSL 사용법

### 단일 노드 범위

```typescript
import { transaction, control, indentText } from '@barocss/model';

// control 사용
await transaction(editor, [
  ...control('code-1', [
    indentText(0, 20, '  ')  // start, end, indent
  ])
]).commit();

// 직접 호출
await transaction(editor, [
  indentText('code-1', 0, 20, '  ')  // nodeId, start, end, indent
]).commit();
```

### Cross-node 범위

```typescript
await transaction(editor, [
  indentText(
    'text-1', 5,      // startNodeId, startOffset
    'text-3', 10,    // endNodeId, endOffset
    '  '             // indent
  )
]).commit();
```

## 제한사항 및 주의사항

### 1. 텍스트 노드만 대상

**`indentText`/`outdentText`는 텍스트 노드(`node.text`가 있는 노드)만 대상으로 합니다.**

- ✅ **동작**: `inline-text`, `code-block` 등 텍스트를 가진 노드
- ❌ **무시**: `inline-image`, `page-break` 등 atom 노드 (텍스트 없음)
- ⚠️ **경고**: 텍스트가 없는 노드는 `extractText`에서 제외됨

### 2. 여러 노드에 걸친 범위의 동작

**Paragraph가 여러 inline-text를 가지는 경우:**

```javascript
// Model 구조
{
  sid: 'para-1',
  stype: 'paragraph',
  content: [
    { sid: 'text-1', stype: 'inline-text', text: 'Hello\n' },
    { sid: 'img-1', stype: 'inline-image', src: '...' },  // atom 노드
    { sid: 'text-2', stype: 'inline-text', text: 'World\n' }
  ]
}

// Range: text-1의 처음부터 text-2의 끝까지
const range = {
  startNodeId: 'text-1',
  startOffset: 0,
  endNodeId: 'text-2',
  endOffset: 6
};

// indentText 실행 시:
// 1. extractText: 'Hello\nWorld\n' 추출 (img-1은 제외)
// 2. 변환: '  Hello\n  World\n'
// 3. replaceText: deleteText + insertText로 처리
//    - text-1: '  Hello\n'로 교체
//    - text-2: '  World\n'로 교체
//    - img-1: 변경 없음 (텍스트 없음)
```

**결과:**
- ✅ 각 텍스트 노드의 첫 줄은 들여쓰기됨
- ✅ atom 노드(inline-image 등)는 영향 없음
- ⚠️ **하지만**: 여러 노드에 걸친 경우, `replaceText`가 `deleteText` + `insertText`로 처리되므로 **원래 구조가 변경될 수 있음**

### 3. 정확한 사용 사례

#### ✅ 적합한 사용 사례 (권장)

1. **코드 블록 (code-block) - 가장 적합**
   ```javascript
   // 단일 code-block 노드 내부
   {
     sid: 'code-1',
     stype: 'code-block',
     text: 'function hello() {\n  return "world";\n}'
   }
   // indentText → 각 줄 앞에 공백 추가
   // ✅ 단일 텍스트 노드이므로 안전하게 동작
   ```

2. **단일 텍스트를 가진 블록 노드**
   ```javascript
   // 단일 텍스트 노드만 가진 블록
   {
     sid: 'pre-1',
     stype: 'pre',
     text: 'Line 1\nLine 2\nLine 3'
   }
   // indentText → 각 줄 앞에 공백 추가
   // ✅ 단일 텍스트 노드이므로 안전하게 동작
   ```

#### ⚠️ 주의가 필요한 사용 사례 (비권장)

1. **여러 inline-text 노드에 걸친 범위**
   - 각 노드별로 개별 처리됨
   - 노드 경계에서 줄 단위 들여쓰기가 깨질 수 있음
   - 예: `text-1`의 마지막 줄과 `text-2`의 첫 줄이 같은 논리적 줄인 경우
   - **권장하지 않음**: paragraph가 여러 inline-text를 가지는 경우는 구조가 복잡해질 수 있음

2. **Atom 노드가 포함된 범위**
   - Atom 노드는 텍스트가 없으므로 `extractText`에서 제외됨
   - 들여쓰기 결과가 예상과 다를 수 있음
   - **권장하지 않음**: inline-image 등이 포함된 범위는 예상과 다르게 동작할 수 있음

#### ❌ 부적합한 사용 사례

1. **구조적 들여쓰기 (리스트 아이템 등)**
   - `indentNode`/`outdentNode` 사용해야 함
   - `indentText`는 텍스트 내용만 변경하므로 구조 변경 불가

2. **Block 노드 자체의 들여쓰기**
   - Block 노드는 보통 텍스트를 직접 가지지 않음
   - `indentNode` 사용해야 함

### 4. Tab 문자 (`\t`) vs 공백 문자 (` `)

**`indentText`는 어떤 문자열이든 추가할 수 있습니다:**

```typescript
// 공백 2개
indentText(range, '  ')

// Tab 문자
indentText(range, '\t')

// 커스텀 문자열
indentText(range, '> ')  // 인용문
indentText(range, '- ')   // 리스트 마커
```

**기본값은 공백 2개 (`'  '`)입니다.**

### 5. 실제 동작 예시

#### 예시 1: 단일 텍스트 노드 (코드 블록)

```javascript
// Before
{
  sid: 'code-1',
  stype: 'code-block',
  text: 'function hello() {\n  return "world";\n}'
}

// indentText(range, '  ') 실행
// extractText: 'function hello() {\n  return "world";\n}'
// transformed: '  function hello() {\n    return "world";\n  }'
// replaceText: 단일 노드이므로 직접 교체

// After
{
  sid: 'code-1',
  stype: 'code-block',
  text: '  function hello() {\n    return "world";\n  }'
}
```

#### 예시 2: 여러 텍스트 노드 (주의 필요)

```javascript
// Before
{
  sid: 'para-1',
  content: [
    { sid: 'text-1', text: 'Line 1\n' },
    { sid: 'text-2', text: 'Line 2\n' }
  ]
}

// Range: text-1[0] ~ text-2[7]
// extractText: 'Line 1\nLine 2\n'
// transformed: '  Line 1\n  Line 2\n'
// replaceText: deleteText + insertText
//   - text-1: '  Line 1\n'로 교체
//   - text-2: '  Line 2\n'로 교체

// After
{
  sid: 'para-1',
  content: [
    { sid: 'text-1', text: '  Line 1\n' },
    { sid: 'text-2', text: '  Line 2\n' }
  ]
}
```

**⚠️ 문제점:**
- 노드 경계에서 줄 단위 들여쓰기가 깨질 수 있음
- `text-1`의 마지막 줄과 `text-2`의 첫 줄이 같은 논리적 줄인 경우, 각각 개별 처리되어 의도와 다를 수 있음

## 요약

1. **`indentText`/`outdentText`는 텍스트 내용을 변경**합니다.
2. **모델의 `node.text`가 변경**되므로, renderer-dom은 자동으로 변경된 텍스트를 렌더링합니다.
3. **공백 문자는 실제 텍스트에 포함**되므로, CSS `white-space: pre`가 필요할 수 있습니다.
4. **구조적 들여쓰기는 `indentNode`/`outdentNode`를 사용**합니다.
5. **텍스트 노드만 대상**이며, atom 노드(inline-image 등)는 영향 없습니다.
6. **여러 노드에 걸친 범위는 주의 필요**: 각 노드별로 개별 처리되므로 노드 경계에서 예상과 다를 수 있습니다.
7. **Tab 문자(`\t`) 또는 공백(` `) 모두 사용 가능**: `indent` 파라미터로 지정합니다.
8. **⚠️ 권장 사용 사례: 코드 블록(code-block) 같은 단일 텍스트 노드에서만 사용**

