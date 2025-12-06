## Enter 키 상세 스펙 (`enter-key-detailed-spec.md`)

### 1. 목표와 범위

- **목표**
  - Enter 키 입력 시, 모델 기준으로 **블록 분리 / 새 블록 생성 / 줄바꿈 삽입** 동작을 정의한다.
  - Backspace / DeleteForward / MoveSelection 과 동일하게 **Model-first + Command 패턴**으로 처리한다.
- **범위**
  - `SelectionType = 'range' | 'node'` 에 대한 Enter 동작.
  - `group: 'block'` / `group: 'inline'` 노드, `editable` / `atom` 속성이 있는 노드.
  - `paragraph` 를 기준으로 한 기본 규칙 + schema 확장 포인트 정의.

---

### 2. 아키텍처 개요

#### 2.1 이벤트 흐름

```
KeyboardEvent(Enter)
   ↓
EditorViewDOM.handleKeydown
   ↓  (key === 'Enter')
EditorViewDOM.insertParagraph()
   ↓
DOMSelection → ModelSelection 변환
   ↓
editor.executeCommand('insertParagraph', { selection })
   ↓
ParagraphExtension._insertParagraph(editor, selection)
   ↓
DataStore 트랜잭션 (split / create / merge)
   ↓
ModelSelection 업데이트
   ↓
EditorViewDOM (selection-handler) → DOMSelection 적용
```

#### 2.2 책임 분리

- **EditorViewDOM**
  - DOMSelection 을 ModelSelection으로 변환한다.
  - Enter 입력을 `insertParagraph` 커맨드 호출로만 전달한다.
- **ParagraphExtension**
  - `insertParagraph` 커맨드를 등록한다.
  - schema 와 selection 을 기반으로 **어디에서 어떤 블록을 어떻게 나눌지**를 결정한다.
- **DataStore**
  - 실제 노드 분리 / 새 노드 생성 / 자식 재배치를 트랜잭션으로 수행한다.

---

### 3. 기본 규칙 (paragraph 기준)

#### 3.1 전제

- `paragraph`:
  - `group: 'block'`
  - 자식으로 **inline 노드들**(`inline-text`, `inline-image` 등)을 가진다.
  - 텍스트 노드는 `.text` 필드를 가진 `inline-text` 노드이다.
- Enter 는 **항상 현재 블록을 기준으로** 동작한다.
  - selection 이 블록 내부 텍스트에 있으면 **현재 블록 split**.
  - selection 이 블록의 맨 앞/끝이면 **새 블록 생성**.

#### 3.2 카서가 paragraph 내부 텍스트에 있는 경우 (split)

**상황 A: 단일 paragraph, caret 이 중간 offset 에 위치**

Before:

```
┌──────────────────────────────────────────────┐
│ paragraph (sid: P1)                          │
│  └─ inline-text (sid: T1, text: "Hello│World") │
└──────────────────────────────────────────────┘
```

After (Enter):

```
┌──────────────────────────────────────────────┐
│ paragraph (sid: P1)                          │
│  └─ inline-text (sid: T1, text: "Hello")    │
└──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐
│ paragraph (sid: P2)                          │
│  └─ inline-text (sid: T2, text: "World")    │
└──────────────────────────────────────────────┘
                ▲
                └─ caret: (P2, T2, offset 0)
```

Operation:

- 선택된 `inline-text` 노드를 **split** 한다.
  - left: `"Hello"`
  - right: `"World"`
- 현재 paragraph(P1)에는 left 쪽 텍스트만 남긴다.
- 동일 부모(상위 블록 컨테이너) 아래에 **새 paragraph(P2)** 를 P1 뒤에 생성한다.
  - 자식으로 right 텍스트를 가진 `inline-text`(T2)를 추가한다.
- 새 paragraph 의 첫 텍스트 노드 시작 위치에 caret 을 둔다.

현재 구현 상태:

- `ParagraphExtension._insertParagraph` 에서
  - parent paragraph 가 **단일 텍스트 child**만 가질 때(`content.length === 1`이고 해당 child가 selection 대상 텍스트 노드일 때)에 한해  
    `dataStore.splitTextNode` + `dataStore.splitBlockNode` 조합으로 이 동작을 수행한다.
  - child 가 여러 개이거나 inline-image 등이 섞여 있는 경우에는 아직 split 을 수행하지 않고 `false` 를 반환한다 (no-op).

---

### 4. paragraph 경계에서의 Enter

#### 4.1 paragraph 맨 끝에서 Enter (빈 새 paragraph 생성)

**상황 B: caret 이 paragraph 의 마지막 offset 에 위치**

Before:

```
┌──────────────────────────────────────────────┐
│ paragraph (sid: P1)                          │
│  └─ inline-text (sid: T1, text: "Hello│")   │
└──────────────────────────────────────────────┘
```

After (Enter):

```
┌──────────────────────────────────────────────┐
│ paragraph (sid: P1)                          │
│  └─ inline-text (sid: T1, text: "Hello")    │
└──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐
│ paragraph (sid: P2)                          │
│  └─ inline-text (sid: T2, text: "")         │
└──────────────────────────────────────────────┘
                ▲
                └─ caret: (P2, T2, offset 0)
```

Operation:

- 현재 paragraph(P1)를 split 할 필요가 없으므로, **동일 부모 아래에 빈 paragraph(P2)** 를 추가한다.
- P2 의 첫 inline-text(T2)의 offset 0 에 caret 을 둔다.

#### 4.2 paragraph 맨 앞에서 Enter (위에 빈 paragraph 생성)

**상황 C: caret 이 paragraph 의 시작 offset 에 위치**

Before:

```
┌──────────────────────────────────────────────┐
│ paragraph (sid: P1)                          │
│  └─ inline-text (sid: T1, text: "│Hello")   │
└──────────────────────────────────────────────┘
```

After (Enter):

```
┌──────────────────────────────────────────────┐
│ paragraph (sid: P0)                          │
│  └─ inline-text (sid: T0, text: "")         │
└──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐
│ paragraph (sid: P1)                          │
│  └─ inline-text (sid: T1, text: "Hello")    │
└──────────────────────────────────────────────┘
                ▲
                └─ caret: (P0, T0, offset 0)
```

Operation:

- 현재 paragraph(P1)의 **앞쪽에 빈 paragraph(P0)** 를 삽입한다.
- P0 의 첫 inline-text(T0)의 offset 0 에 caret 을 둔다.

현재 구현 상태:

- `ParagraphExtension._insertParagraph` 에서
  - parent paragraph 의 부모(grandParent)를 찾은 뒤,
  - 동일 stype 과 attributes 를 가진 새 paragraph(P0)를 생성하고,
  - grandParent.content 에서 기존 P1 앞에 P0 를 삽입하는 방식으로 위 규칙을 구현하였다.

---

### 5. RangeSelection 에서의 Enter

#### 5.1 같은 paragraph 내부에서 RangeSelection

**상황 D: 같은 paragraph 내 텍스트 범위를 선택한 상태**

Before:

```
┌────────────────────────────────────────────────────────────┐
│ paragraph (sid: P1)                                        │
│  └─ inline-text (sid: T1, text: "He[llo W]orld")          │
│                        ^    ^                             │
│                      start end                            │
└────────────────────────────────────────────────────────────┘
```

After (Enter):

```
┌────────────────────────────────────────────────────────────┐
│ paragraph (sid: P1)                                        │
│  └─ inline-text (sid: T1, text: "He")                     │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ paragraph (sid: P2)                                        │
│  └─ inline-text (sid: T2, text: "orld")                   │
└────────────────────────────────────────────────────────────┘
                ▲
                └─ caret: (P2, T2, offset 0)
```

Operation:

1. RangeSelection 범위(`[start, end)`)를 삭제한다.
   - `"He" + "orld"` 형태로 논리 텍스트가 남는다.
2. 삭제 후 caret 이 위치한 offset 에 대해 **단일 caret 상황 A 와 동일한 split 규칙**을 적용한다.
   - `"He│orld"` 위치에서 Enter 를 친 것과 동일한 결과를 만든다.

현재 구현 상태:

- RangeSelection(`collapsed === false`) 인 경우 `insertParagraph` 는 아직 동작하지 않고 `false` 를 반환한다.
- RangeSelection 에서의 Enter 는 향후:
  - `dataStore.range.deleteText(selection)` 으로 범위를 삭제한 뒤,
  - 삭제 결과 위치를 기준으로 다시 `insertParagraph` 로직을 재적용하는 형태로 구현할 예정이다.

#### 5.2 여러 블록에 걸친 RangeSelection

**상황 E: paragraph-1 끝 ~ paragraph-2 중간까지 RangeSelection**

Before:

```
┌────────────────────────────────────────────────────────────┐
│ paragraph (sid: P1)                                        │
│  └─ inline-text (sid: T1, text: "Hello[")                 │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ paragraph (sid: P2)                                        │
│  └─ inline-text (sid: T2, text: "Wo]rld")                 │
└────────────────────────────────────────────────────────────┘
```

After (Enter):

```
┌────────────────────────────────────────────────────────────┐
│ paragraph (sid: P1)                                        │
│  └─ inline-text (sid: T1, text: "Hello")                  │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ paragraph (sid: P2')                                       │
│  └─ inline-text (sid: T2', text: "rld")                   │
└────────────────────────────────────────────────────────────┘
                ▲
                └─ caret: (P2', T2', offset 0)
```

Operation:

1. RangeSelection 에 포함된 **모든 블록 내부 내용**을 삭제한다.
   - P1 의 선택 이후 텍스트와 P2 의 선택 이전 텍스트가 제거된다.
   - P1 이후, P2 이전 사이의 블록은 모두 제거된다.
2. 삭제 후 caret 은 **P1 과 P2 경계 지점**에 위치한다.
3. 이 상태에서 Enter 는 **상황 B** (블록 끝에서 Enter) 와 동일한 규칙으로 동작한다.
   - 최종적으로 P1 그대로 + 새 paragraph(P2') 이 생기고, caret 은 P2' 시작에 위치한다.

현재 구현/계획:

- 현재 구현은 **같은 텍스트 노드 내 RangeSelection**까지만 지원한다.
  - `dataStore.range.deleteText(selection)` 호출 → `startOffset` 기준 collapsed selection 생성 →  
    위 3장(단일 caret) 규칙을 그대로 재사용.
- 여러 블록/복합 노드 Range 에 대해서는 다음과 같은 단계로 확장한다:
  1. `dataStore.range.deleteText(selection)` 으로 전체 범위를 삭제한다.
     - 시작/끝 텍스트의 꼬리/머리, 중간 텍스트 노드들을 schema 규칙에 따라 비운다.
  2. 삭제 후 caret 위치를 **ModelSelection** 으로 계산한다.
     - 1차 버전에서는 `startNodeId/startOffset` 을 기준으로 caret 을 두고,
     - 이후 Datastore 레벨 테스트를 통해 “삭제 후 caret 이 자연스럽게 둘 수 있는 위치인지”를 검증/보강한다.
  3. 계산된 collapsed selection 을 가지고 다시 `insertParagraph` 로직을 호출한다.
     - 결과적으로 여기서 정의한 상황 E 와 최대한 유사한 구조(앞 블록 + 새 paragraph)를 생성하는 것이 목표다.

---

### 6. 특수 블록 및 schema 기반 확장

#### 6.1 `editable: true` 인 block (codeBlock, mathBlock 등)

- `group: 'block'`, `editable: true`, `.text` 필드를 가진 블록은 **단일 텍스트 블록**으로 취급한다.
- Enter 규칙:
  - 같은 블록 내부에서 Enter:
    - 내부 텍스트에서 줄바꿈 문자(`\n`)를 삽입한다.
    - 별도의 block split 은 하지 않는다.
  - RangeSelection:
    - 선택 범위를 삭제한 뒤 한 개의 `\n` 을 삽입한다.

현재 구현 상태:

- `editable: true` 인 block 에 대한 특수 처리는 아직 구현되어 있지 않다.
- 이러한 블록에서 Enter 가 눌리면, 텍스트 노드가 아닌 부모/노드에 대해 `insertParagraph` 가 `false` 를 반환하여  
  별도의 구조 변경을 수행하지 않는다.

#### 6.2 `atom: true` 인 block (table, imageBlock 등)

- `group: 'block'`, `atom: true` 인 노드는 Enter 시 **블록 분리 대상이 아니다**.
- caret 이 atom block 에 NodeSelection 으로 있을 때 Enter:
  - 기본 동작: atom block **아래쪽에 paragraph** 를 새로 생성한다.
  - caret 은 새 paragraph 의 시작에 위치한다.

현재 구현 상태:

- NodeSelection 및 `atom: true` block 에 대한 Enter 동작은 아직 구현되어 있지 않다.
- inline-image 등의 non-text 노드를 대상으로 Enter 가 호출되면,
  - 현재 구현은 텍스트 노드가 아님을 감지하고 `false` 를 반환한다.

#### 6.3 schema 확장 포인트

- 각 노드 타입 정의(`NodeTypeDefinition`)에 다음 속성을 고려한다:
  - `enterBehavior?: 'split' | 'lineBreak' | 'afterBlock' | 'beforeBlock' | 'custom'`
  - `enterHandler?: (context) => EnterBehaviorResult`
- 기본 규칙:
  - `group: 'block'` + `editable !== true` → `enterBehavior: 'split'` (paragraph 스타일).
  - `group: 'block'` + `editable === true` → `enterBehavior: 'lineBreak'`.
  - `group: 'block'` + `atom === true` → `enterBehavior: 'afterBlock'`.

---

### 7. Pseudo-code (ParagraphExtension 기준)

```ts
function handleInsertParagraph(selection: ModelSelection) {
  if (selection.type !== 'range') return false;

  if (!selection.collapsed) {
    // 1) RangeSelection 이면 먼저 삭제 수행 (미구현)
    // deleteRange(selection);
    // 삭제 후 caret 을 collapse 한 Selection 으로 변환
    // selection = getCollapsedSelectionAfterDelete();
    return false; // 현재 구현 상태 반영
  }

  const { startNodeId, startOffset } = selection;
  const textNode = getNode(startNodeId);

  if (typeof textNode.text === 'string') {
    const parentBlock = getParentBlock(textNode);
    const blockType = getNodeType(parentBlock.stype);

    if (blockType.group === 'block' && blockType.editable !== true && !blockType.atom) {
      // paragraph 스타일 block split
      return splitParagraphLikeBlock(parentBlock, textNode, startOffset);
    }

    if (blockType.group === 'block' && blockType.editable === true) {
      // codeBlock 스타일: 내부 줄바꿈
      return insertLineBreakInEditableBlock(textNode, startOffset);
    }
  }

  // atom block 이거나, 블록 경계에 caret 이 있는 경우
  return insertParagraphAfterCurrentBlock(selection);
}
```

이 스펙을 기준으로, 이후 단계에서:

- `ParagraphExtension` 의 `insertParagraph` 구현을 실제 DataStore 연산으로 채우고,
- Backspace / DeleteForward / MoveSelection 과 동일한 테스트 패턴으로  
  Enter 에 대한 단위 테스트를 추가한다.


