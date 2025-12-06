# 브라우저 입력 이벤트 → 편집 기능 매핑 계획

## 1. 목표
- 브라우저에서 발생하는 입력 관련 이벤트를 구조화하여 모델/뷰 편집 기능에 연결한다.
- 각 이벤트가 어떤 데이터와 상태를 필요로 하는지 명확히 정의하고, 처리 순서를 일관되게 유지한다.
- IME/붙여넣기/특수키 등 다양한 시나리오를 커버할 수 있는 공통 레이어를 마련한다.
- **한글 입력 깨짐을 최소화하기 위해 브라우저의 기본 동작을 최대한 활용한다.**

---

## 2. 핵심 원칙

### 2.1 사용하지 않는 이벤트
- ❌ **`input` 이벤트**: 사용하지 않음. MutationObserver와 중복되며, DOM 변경 후 발생하여 타이밍 이슈 발생 가능.
- ❌ **`compositionstart/update/end` 이벤트**: 사용하지 않음. 브라우저가 자동으로 처리하도록 두어 한글 입력 깨짐을 방지.

### 2.2 사용하는 이벤트
- ✅ **`beforeinput`**: 구조 변경(`insertParagraph`, `insertLineBreak`)만 감지하여 `preventDefault()` 처리. 나머지는 브라우저가 자동 처리하도록 둠.
- ✅ **`keydown`**: 단축키, 브라우저가 `inputType`을 제공하지 않는 특수 키 조합(예: Ctrl+B, Ctrl+Z, Enter fallback 등) 처리.
- ✅ **`selectionchange`**: DOM selection이 바뀔 때 모델 selection과 동기화.
- ✅ **`MutationObserver`**: **주요 처리 레이어**. DOM 변경을 감지하여 모델 업데이트. 브라우저가 자동으로 DOM을 변경한 후 이를 감지.

### 2.3 핵심 처리 전략

**일반 텍스트 입력/삭제**:
- `beforeinput`에서 `preventDefault()` 하지 않음
- 브라우저가 자동으로 DOM 변경
- `MutationObserver`가 DOM 변경 감지 → 모델 업데이트

**구조 변경 (insertParagraph, insertLineBreak)**:
- `beforeinput`에서 `preventDefault()` 함
- 모델을 먼저 변경
- 렌더링으로 DOM 업데이트
- Selection 업데이트

---

## 3. 이벤트 소스별 역할

| 이벤트 | 목적 | 비고 |
| --- | --- | --- |
| `beforeinput` | **구조 변경만 감지**: `insertParagraph`, `insertLineBreak` 등 구조 변경 시에만 `preventDefault()` 후 모델 먼저 변경. 나머지는 브라우저가 자동 처리하도록 둠. | 구조 변경만 처리. 텍스트 입력/삭제는 처리하지 않음. |
| `keydown / keyup` | 단축키, 브라우저가 `inputType`을 제공하지 않는 특수 키 조합(예: Ctrl+B, Ctrl+Z, Enter fallback 등) 처리. | beforeinput 부족 시 보완. |
| `selectionchange` | DOM selection이 바뀔 때 모델 selection과 동기화. SelectionManager 업데이트 후 `editor:selection.change` emit. | 상시 구독. |
| `MutationObserver` | **주요 처리 레이어**: 브라우저가 자동으로 변경한 DOM을 감지하여 모델 업데이트. 텍스트 입력/삭제의 대부분을 여기서 처리. | 주요 처리 레이어. |

---

## 4. beforeinput inputType 매핑 테이블

### 4.1 텍스트 입력 관련

| inputType | 키/동작 | 편집 동작 | DataStore 연산 | Selection 상태 | 브라우저 지원 |
| --- | --- | --- | --- | --- | --- |
| `insertText` | 일반 문자 입력 (a-z, 0-9, 한글 등) | **MutationObserver에서 처리**: DOM 변경 감지 후 모델 업데이트 | `dataStore.range.replaceText(contentRange, text)` | collapsed 또는 range | ✅ Chrome, Firefox, Safari, Edge |
| `insertCompositionText` | IME 중간 입력 (한글 조합 중) | **브라우저가 자동 처리하도록 두고, MutationObserver에서 최종 결과만 감지** | `dataStore.range.replaceText(contentRange, text)` (최종 결과만) | collapsed | ✅ Chrome, Firefox, Safari, Edge |
| `insertFromPaste` | Ctrl+V / Cmd+V | **MutationObserver에서 처리**: 붙여넣기된 텍스트를 DOM에서 감지 후 모델 업데이트 | `dataStore.range.replaceText(contentRange, pastedText)` | collapsed 또는 range | ✅ Chrome, Firefox, Safari, Edge |
| `insertFromDrop` | 드래그 앤 드롭 | **MutationObserver에서 처리**: 드롭된 텍스트를 DOM에서 감지 후 모델 업데이트 | `dataStore.range.replaceText(contentRange, droppedText)` | collapsed 또는 range | ✅ Chrome, Firefox, Safari, Edge |
| `insertFromYank` | 일부 에디터의 yank 동작 | **MutationObserver에서 처리**: 텍스트 삽입 | `dataStore.range.replaceText(contentRange, text)` | collapsed 또는 range | ⚠️ 제한적 지원 |

#### 상세 처리 흐름

**`insertText` (일반 텍스트 입력)**:
1. 브라우저가 자동으로 DOM에 텍스트 삽입
2. `MutationObserver`가 `characterData` 또는 `childList` 변경 감지
3. `handleTextContentChange(oldValue, newValue, target)` 호출
4. `dataStore.range.replaceText(contentRange, insertedText)` 실행
   - `contentRange`: 현재 selection 범위
   - `insertedText`: 삽입된 텍스트 (DOM에서 추출)
   - marks/decorators 자동 조정
5. `editor.emit('editor:content.change', { skipRender: true })` 발생

**`insertCompositionText` (IME 입력)**:
1. 브라우저가 자동으로 IME 조합 중간 단계 처리
2. `MutationObserver`가 중간 변경 감지하지만 보류 (composition 중)
3. IME 입력 완료 후 최종 텍스트 변경 감지
4. `dataStore.range.replaceText(contentRange, finalText)` 실행
5. `editor.emit('editor:content.change', { skipRender: true })` 발생

### 4.2 구조 변경 관련

| inputType | 키/동작 | 편집 동작 | DataStore 연산 | Selection 상태 | 브라우저 지원 |
| --- | --- | --- | --- | --- | --- |
| `insertParagraph` | Enter | **beforeinput에서 preventDefault() 후 처리**: 블록 분리, 새 paragraph 생성 | `dataStore.range.splitNode(nodeId, position)` + `dataStore.core.setNode(newParagraphNode)` | collapsed | ✅ Chrome, Firefox, Safari, Edge |
| `insertLineBreak` | Shift+Enter | **beforeinput에서 preventDefault() 후 처리**: soft break 노드 삽입 | `dataStore.range.insertText(contentRange, '\n')` 또는 inline break 노드 삽입 | collapsed | ✅ Chrome, Firefox, Safari, Edge |
| `insertOrderedList` | 브라우저 단축키 | **MutationObserver에서 처리**: ordered list 삽입 | `dataStore.core.setNode(orderedListNode)` | collapsed 또는 range | ✅ Chrome, Firefox, Safari, Edge |
| `insertUnorderedList` | 브라우저 단축키 | **MutationObserver에서 처리**: unordered list 삽입 | `dataStore.core.setNode(unorderedListNode)` | collapsed 또는 range | ✅ Chrome, Firefox, Safari, Edge |
| `insertHorizontalRule` | 브라우저 단축키 | **MutationObserver에서 처리**: horizontal rule 삽입 | `dataStore.core.setNode(horizontalRuleNode)` | collapsed | ✅ Chrome, Firefox, Safari, Edge |

#### 상세 처리 흐름

**`insertParagraph` (Enter 키)**:
1. `beforeinput` 이벤트에서 `event.preventDefault()` 실행
2. 현재 selection 위치 확인 (`selectionManager.current`)
3. **모델 먼저 변경**:
   - `dataStore.range.splitNode(currentNodeId, cursorPosition)` 실행
     - 현재 노드를 커서 위치에서 분할
     - 왼쪽 부분은 기존 노드 유지
     - 오른쪽 부분은 새 노드로 생성
   - 새 paragraph 노드 생성: `dataStore.core.setNode(newParagraphNode)`
   - 부모 노드의 `content` 배열에 새 paragraph 삽입
4. **렌더링**: `editor.render()` 호출하여 DOM 업데이트
5. **Selection 업데이트**: 새 paragraph의 시작 위치로 selection 이동
   - `selectionManager.setSelection({ nodeId: newParagraphId, offset: 0 })`
   - `editor.emit('editor:selection.change', { selection })`

**`insertLineBreak` (Shift+Enter)**:
1. `beforeinput` 이벤트에서 `event.preventDefault()` 실행
2. 현재 selection 위치 확인
3. **모델 먼저 변경**:
   - 옵션 1: 텍스트에 `\n` 삽입
     - `dataStore.range.insertText(contentRange, '\n')`
   - 옵션 2: inline break 노드 삽입
     - `dataStore.core.setNode(breakNode)` (예: `{ type: 'line-break' }`)
4. **렌더링**: `editor.render()` 호출
5. **Selection 업데이트**: break 노드 다음 위치로 이동

### 4.3 삭제 관련

| inputType | 키/동작 | 편집 동작 | DataStore 연산 | Selection 상태 | 브라우저 지원 |
| --- | --- | --- | --- | --- | --- |
| `deleteContentBackward` | Backspace | **MutationObserver에서 처리**: DOM에서 삭제된 텍스트 감지 후 모델 업데이트 | `dataStore.range.deleteText(contentRange)` | collapsed 또는 range | ✅ Chrome, Firefox, Safari, Edge |
| `deleteContentForward` | Delete | **MutationObserver에서 처리**: forward 방향 삭제 | `dataStore.range.deleteText(contentRange)` | collapsed 또는 range | ✅ Chrome, Firefox, Safari, Edge |
| `deleteWordBackward` | Option+Backspace (Mac) / Ctrl+Backspace (Windows) | **MutationObserver에서 처리**: 단어 범위 삭제 | `dataStore.range.deleteText(expandedContentRange)` | collapsed | ✅ Chrome, Firefox, Safari, Edge |
| `deleteWordForward` | Option+Delete (Mac) / Ctrl+Delete (Windows) | **MutationObserver에서 처리**: 단어 범위 삭제 | `dataStore.range.deleteText(expandedContentRange)` | collapsed | ✅ Chrome, Firefox, Safari, Edge |
| `deleteSoftLineBackward` | 브라우저별 구현 | **MutationObserver에서 처리**: soft line 단위 삭제 | `dataStore.range.deleteText(softLineRange)` | collapsed | ⚠️ 브라우저별 차이 |
| `deleteSoftLineForward` | 브라우저별 구현 | **MutationObserver에서 처리**: soft line 단위 삭제 | `dataStore.range.deleteText(softLineRange)` | collapsed | ⚠️ 브라우저별 차이 |
| `deleteHardLineBackward` | 브라우저별 구현 | **MutationObserver에서 처리**: hard line 단위 삭제 | `dataStore.range.deleteText(hardLineRange)` | collapsed | ⚠️ 브라우저별 차이 |
| `deleteHardLineForward` | 브라우저별 구현 | **MutationObserver에서 처리**: hard line 단위 삭제 | `dataStore.range.deleteText(hardLineRange)` | collapsed | ⚠️ 브라우저별 차이 |
| `deleteByDrag` | 드래그로 선택 후 삭제 | **MutationObserver에서 처리**: 선택된 범위 삭제 | `dataStore.range.deleteText(contentRange)` | range | ✅ Chrome, Firefox, Safari, Edge |
| `deleteByCut` | Ctrl+X / Cmd+X | **MutationObserver에서 처리**: 선택된 범위 삭제 및 클립보드 복사 | `dataStore.range.deleteText(contentRange)` | range | ✅ Chrome, Firefox, Safari, Edge |

#### 상세 처리 흐름

**`deleteContentBackward` (Backspace)**:
1. 브라우저가 자동으로 DOM에서 텍스트 삭제
2. `MutationObserver`가 `characterData` 또는 `childList` 변경 감지
3. `handleTextContentChange(oldValue, newValue, target)` 호출
4. 삭제 범위 계산:
   - collapsed selection인 경우: 커서 앞의 문자 삭제 (유니코드, surrogate pair 고려)
   - range selection인 경우: 선택된 범위 삭제
5. `dataStore.range.deleteText(contentRange)` 실행
   - `contentRange`: 삭제할 범위
   - marks/decorators 자동 조정 (split/trim/shift)
6. `editor.emit('editor:content.change', { skipRender: true })` 발생

**`deleteContentForward` (Delete)**:
- `deleteContentBackward`와 동일한 흐름
- 차이점: 커서 뒤의 문자 삭제

**`deleteWordBackward` (Option+Backspace)**:
1. 브라우저가 자동으로 단어 범위까지 확장하여 삭제
2. `MutationObserver`가 변경 감지
3. 삭제된 단어 범위 계산
4. `dataStore.range.deleteText(expandedContentRange)` 실행

### 4.4 포맷 관련

| inputType | 키/동작 | 편집 동작 | DataStore 연산 | Selection 상태 | 브라우저 지원 | 중요 사항 |
| --- | --- | --- | --- | --- | --- | --- |
| `formatBold` | Ctrl+B / Cmd+B | **MutationObserver에서 처리**: DOM에서 포맷 변경 감지 후 모델 업데이트 | `dataStore.range.toggleMark(contentRange, { stype: 'bold' })` | **range만** (collapsed에서는 발생하지 않음) | ✅ Chrome, Firefox, Safari, Edge | ⚠️ **collapsed selection에서는 발생하지 않음** |
| `formatItalic` | Ctrl+I / Cmd+I | **MutationObserver에서 처리**: DOM에서 포맷 변경 감지 | `dataStore.range.toggleMark(contentRange, { stype: 'italic' })` | **range만** | ✅ Chrome, Firefox, Safari, Edge | ⚠️ **collapsed selection에서는 발생하지 않음** |
| `formatUnderline` | Ctrl+U / Cmd+U | **MutationObserver에서 처리**: DOM에서 포맷 변경 감지 | `dataStore.range.toggleMark(contentRange, { stype: 'underline' })` | **range만** | ✅ Chrome, Firefox, Safari, Edge | ⚠️ **collapsed selection에서는 발생하지 않음** |
| `formatStrikeThrough` | 브라우저 단축키 | **MutationObserver에서 처리**: DOM에서 포맷 변경 감지 | `dataStore.range.toggleMark(contentRange, { stype: 'strikeThrough' })` | **range만** | ✅ Chrome, Firefox, Safari, Edge | ⚠️ **collapsed selection에서는 발생하지 않음** |
| `formatSuperscript` | 브라우저 단축키 | **MutationObserver에서 처리**: DOM에서 포맷 변경 감지 | `dataStore.range.toggleMark(contentRange, { stype: 'superscript' })` | **range만** | ⚠️ 제한적 지원 | |
| `formatSubscript` | 브라우저 단축키 | **MutationObserver에서 처리**: DOM에서 포맷 변경 감지 | `dataStore.range.toggleMark(contentRange, { stype: 'subscript' })` | **range만** | ⚠️ 제한적 지원 | |
| `formatRemove` | 브라우저 단축키 | **MutationObserver에서 처리**: 모든 포맷 제거 | `dataStore.range.clearMarks(contentRange)` | range | ⚠️ 제한적 지원 | |
| `formatJustifyFull` | 브라우저 단축키 | **MutationObserver에서 처리**: justify 정렬 | `dataStore.core.updateNode(nodeId, { attributes: { align: 'justify' } })` | collapsed 또는 range | ⚠️ 제한적 지원 | |
| `formatJustifyCenter` | 브라우저 단축키 | **MutationObserver에서 처리**: center 정렬 | `dataStore.core.updateNode(nodeId, { attributes: { align: 'center' } })` | collapsed 또는 range | ⚠️ 제한적 지원 | |
| `formatJustifyRight` | 브라우저 단축키 | **MutationObserver에서 처리**: right 정렬 | `dataStore.core.updateNode(nodeId, { attributes: { align: 'right' } })` | collapsed 또는 range | ⚠️ 제한적 지원 | |
| `formatJustifyLeft` | 브라우저 단축키 | **MutationObserver에서 처리**: left 정렬 | `dataStore.core.updateNode(nodeId, { attributes: { align: 'left' } })` | collapsed 또는 range | ⚠️ 제한적 지원 | |
| `formatIndent` | Tab / 브라우저 단축키 | **MutationObserver에서 처리**: 들여쓰기 증가 | `dataStore.core.updateNode(nodeId, { attributes: { indent: currentIndent + 1 } })` | collapsed 또는 range | ⚠️ 브라우저별 차이 | |
| `formatOutdent` | Shift+Tab / 브라우저 단축키 | **MutationObserver에서 처리**: 들여쓰기 감소 | `dataStore.core.updateNode(nodeId, { attributes: { indent: Math.max(0, currentIndent - 1) } })` | collapsed 또는 range | ⚠️ 브라우저별 차이 | |

#### 상세 처리 흐름

**`formatBold` (Ctrl+B / Cmd+B)**:
1. 브라우저가 자동으로 DOM에 `<strong>` 또는 `<b>` 태그 추가/제거
2. `MutationObserver`가 `attributes` 또는 `childList` 변경 감지
3. 변경된 범위와 포맷 타입 확인
4. `dataStore.range.toggleMark(contentRange, { stype: 'bold' })` 실행
   - `contentRange`: 포맷이 적용된 텍스트 범위
   - 기존에 bold가 있으면 제거, 없으면 추가
   - `dataStore.marks.toggleMark()` 내부적으로 호출
5. `editor.emit('editor:content.change', { skipRender: true })` 발생

**`formatItalic`, `formatUnderline` 등**:
- `formatBold`와 동일한 흐름
- 차이점: `stype` 값만 다름 (`'italic'`, `'underline'` 등)

**`formatRemove` (모든 포맷 제거)**:
1. 브라우저가 자동으로 DOM에서 포맷 태그 제거
2. `MutationObserver`가 변경 감지
3. `dataStore.range.clearMarks(contentRange)` 실행
   - 선택된 범위의 모든 marks 제거

### 4.5 히스토리 관련

| inputType | 키/동작 | 편집 동작 | DataStore 연산 | Selection 상태 | 브라우저 지원 | 중요 사항 |
| --- | --- | --- | --- | --- | --- | --- |
| `historyUndo` | Ctrl+Z / Cmd+Z | **beforeinput에서 preventDefault() 후 처리**: 에디터 history 시스템에 연결 | `editor.history.undo()` (내부적으로 DataStore 상태 복원) | collapsed 또는 range | ✅ Chrome, Firefox, Safari, Edge | ⚠️ OS 기본 undo와 충돌 가능 |
| `historyRedo` | Ctrl+Shift+Z / Cmd+Shift+Z | **beforeinput에서 preventDefault() 후 처리**: 에디터 history 시스템에 연결 | `editor.history.redo()` (내부적으로 DataStore 상태 복원) | collapsed 또는 range | ✅ Chrome, Firefox, Safari, Edge | ⚠️ OS 기본 redo와 충돌 가능 |

#### 상세 처리 흐름

**`historyUndo` (Ctrl+Z / Cmd+Z)**:
1. `beforeinput` 이벤트에서 `event.preventDefault()` 실행
2. `editor.history.undo()` 호출
   - HistoryManager가 이전 상태로 복원
   - 내부적으로 `dataStore`의 이전 상태로 되돌림
   - TransactionalOverlay를 사용하여 원자적 복원
3. **렌더링**: `editor.render()` 호출하여 DOM 업데이트
4. **Selection 업데이트**: 이전 상태의 selection으로 복원

**`historyRedo` (Ctrl+Shift+Z / Cmd+Shift+Z)**:
- `historyUndo`와 동일한 흐름
- 차이점: `editor.history.redo()` 호출

### 4.6 기타

| inputType | 키/동작 | 편집 동작 | Selection 상태 | 브라우저 지원 |
| --- | --- | --- | --- | --- |
| `insertReplacementText` | 자동완성/교정 | 교정 텍스트 삽입 | collapsed 또는 range | ⚠️ 제한적 지원 |
| `insertFromComposition` | IME 최종 입력 | IME 입력 완료 후 텍스트 삽입 | collapsed | ⚠️ 브라우저별 차이 |

---

### 4.7 브라우저별 차이점 및 주의사항

#### Chrome/Edge (Chromium 기반)
- ✅ 대부분의 `inputType` 지원
- ✅ `formatBold`, `formatItalic` 등 포맷 관련 `inputType` 잘 지원
- ⚠️ `formatBold`는 **range selection에서만 발생** (collapsed에서는 발생하지 않음)
- ✅ `historyUndo`, `historyRedo` 지원

#### Firefox
- ✅ 대부분의 `inputType` 지원
- ⚠️ 일부 포맷 관련 `inputType`이 Chrome보다 제한적일 수 있음
- ⚠️ `formatBold`는 **range selection에서만 발생** (collapsed에서는 발생하지 않음)
- ✅ `historyUndo`, `historyRedo` 지원

#### Safari
- ⚠️ 일부 `inputType` 지원이 제한적
- ⚠️ `formatBold` 등 포맷 관련 `inputType`이 Chrome보다 제한적일 수 있음
- ⚠️ `formatBold`는 **range selection에서만 발생** (collapsed에서는 발생하지 않음)
- ⚠️ `historyUndo`, `historyRedo` 지원이 불안정할 수 있음

#### 공통 주의사항
1. **포맷 관련 `inputType`은 range selection에서만 발생**
   - `formatBold`, `formatItalic` 등은 텍스트가 선택된 상태(range)에서만 발생
   - collapsed selection(커서만 있는 상태)에서는 발생하지 않음
   - 따라서 collapsed 상태에서 포맷을 적용하려면 `keydown` 이벤트로 처리해야 함

2. **브라우저별 `inputType` 지원 차이**
   - Safari는 일부 `inputType`을 지원하지 않을 수 있음
   - 따라서 `keydown` fallback이 필수적

3. **히스토리 관련 `inputType`**
   - `historyUndo`, `historyRedo`는 OS 기본 undo/redo와 충돌할 수 있음
   - 에디터 자체 history 시스템을 사용하려면 `preventDefault()` 후 자체 로직 실행 필요

---

## 5. 단축키 및 Hook 시스템

### 5.1 KeyBinding 시스템

**결정**: **`KeyBinding`만 사용**. 별도의 hook 개념은 제공하지 않음.

**이유**:
1. 다른 에디터들(ProseMirror, Slate, Lexical 등)도 `inputType` hook을 제공하지 않음
2. 브라우저 호환성 문제 (Safari 제한적 지원)
3. 키 조합을 직접 파싱하는 것이 더 유연하고 제어 가능
4. 기존 `KeymapManager`와의 일관성 유지
5. `KeyBinding`에 이미 `before`/`after` hook이 포함되어 있어 별도 hook 개념 불필요

**KeyBinding 구조**:

```ts
interface KeyBinding {
  // 단축키 식별자 (Key 기반만)
  key: string;           // 예: 'Ctrl+B', 'Enter', 'Cmd+B'
  
  // Command 연결 (선택사항)
  command?: string;       // 예: 'bold.toggle'
  commandPayload?: any;   // Command에 전달할 payload
  
  // 또는 직접 handler (Command 없이 사용 가능)
  handler?: () => void;
  
  // Hook 지원
  before?: (event: KeyboardEvent, context: EditorContext) => boolean | void;
  after?: (event: KeyboardEvent, context: EditorContext, result: any) => void;
  
  // 우선순위 (낮을수록 먼저 실행)
  priority?: number;
}
```

**처리 순서**:
1. `keydown` 이벤트 발생
2. `KeyBinding`의 `before` hook 확인 및 실행
3. `command` 또는 `handler` 실행
4. `KeyBinding`의 `after` hook 실행

### 5.2 단축키 처리 흐름

단축키가 있는 행위들은 다음 순서로 처리됩니다:

1. **KeyBinding의 before hook**: 외부에서 단축키를 가로채서 다른 행위를 수행할 수 있음
2. **기본 동작**: Hook이 처리하지 않은 경우 기본 동작 수행
3. **Key 기반 Hook (after)**: 기본 동작 완료 후 추가 처리

### 5.3 외부에서 단축키 가로채기

**예시 1**: `Ctrl+B` (Bold 토글)를 커스터마이징

```ts
// KeyBinding으로 hook 등록 (Command 없이 handler만 사용)
keyBindingManager.registerBinding({
  key: 'Ctrl+B', // 또는 'Cmd+B' (플랫폼별)
  handler: () => {
    // 커스텀 Bold 동작
    performCustomBoldAction(editor);
  },
  before: (event, context) => {
    // 조건부로 기본 동작 스킵
    if (shouldUseCustomBold(context)) {
      event.preventDefault();
      return true; // handler 실행, 기본 동작 스킵
    }
  },
  after: (event, context, result) => {
    // Bold 토글 후 로깅
    logBoldAction(context, result);
  },
  priority: 100
});
```

**예시 2**: `Enter` 키 (단락 삽입)를 커스터마이징

```ts
// KeyBinding으로 hook 등록
keyBindingManager.registerBinding({
  key: 'Enter',
  handler: () => {
    // 코드 블록 내에서는 커스텀 동작
    if (isInCodeBlock(editor)) {
      insertCodeBlockLineBreak(editor);
    } else {
      // 기본 동작 (기존 Command 실행)
      editor.executeCommand('insertParagraph');
    }
  },
  before: (event, context) => {
    // 코드 블록 내에서는 기본 동작 스킵
    if (isInCodeBlock(context)) {
      event.preventDefault();
      return true; // handler 실행, 기본 동작 스킵
    }
  },
  after: (event, context, result) => {
    // 단락 삽입 후 로깅
    analytics.track('paragraph_inserted', { result });
  },
  priority: 100
});
```

**예시 3**: Command와 연결된 단축키에 추가 처리만 (로깅)

```ts
// 기존 Command는 그대로 사용하고, 추가 처리만
keyBindingManager.registerBinding({
  key: 'Ctrl+B',
  command: 'bold.toggle', // 기존 Command 사용
  after: (event, context, result) => {
    // Command 실행 후 로깅만 추가
    analytics.track('bold_toggled', { result });
  },
  priority: 2000 // Command 실행 후 실행
});
```

### 5.4 Hook 실행 순서

#### keydown 이벤트 처리

```ts
function handleKeyDown(event: KeyboardEvent) {
  const key = getKeyString(event); // 예: 'Ctrl+B', 'Enter'
  
  // KeyBinding 찾기
  const bindings = keyBindingManager.getBindings(key).sort((a, b) => 
    (a.priority || 1000) - (b.priority || 1000)
  );
  
  // before hooks 실행
  for (const binding of bindings) {
    if (binding.before) {
      const result = binding.before(event, editorContext);
      if (result === true) {
        // 기본 동작 스킵 (하지만 handler나 command는 실행 가능)
        // binding.handler 또는 binding.command 실행
        if (binding.handler) {
          binding.handler();
        } else if (binding.command) {
          editor.executeCommand(binding.command, binding.commandPayload);
        }
        // after hooks 실행
        for (const b of bindings) {
          b.after?.(event, editorContext, null);
        }
        return;
      }
    }
  }
  
  // 기본 동작 수행 (Command 또는 handler)
  let defaultResult = null;
  for (const binding of bindings) {
    if (binding.command) {
      defaultResult = editor.executeCommand(binding.command, binding.commandPayload);
      break;
    } else if (binding.handler) {
      binding.handler();
      break;
    }
  }
  
  // after hooks 실행
  for (const binding of bindings) {
    if (binding.after) {
      binding.after(event, editorContext, defaultResult);
    }
  }
}
```

#### 처리 흐름

```
사용자 입력 (예: Enter 키)
  ↓
keydown 이벤트 발생
  ├─ key: 'Enter' 확인
  ├─ Key 기반 hook의 before 실행
  ├─ 기본 동작 수행 또는 스킵
  └─ Key 기반 hook의 after 실행
```

### 5.5 Key 기반 Hook 사용 가이드

#### Key 기반 Hook 사용

✅ **모든 단축키는 Key 기반으로 처리**:
- `keydown` 이벤트에서 키 조합을 직접 파싱
- 플랫폼별 차이 처리 (Ctrl vs Cmd)
- 모든 selection 상태에서 동일하게 동작

**예시**:
```ts
// Enter 키 → 단락 삽입 (Command 연결)
keyBindingManager.bindCommand('Enter', 'insertParagraph');

// 또는 추가 처리와 함께
keyBindingManager.registerBinding({
  key: 'Enter',
  command: 'insertParagraph',
  before: (event, context) => { /* ... */ }
});

// Ctrl+B → Bold 토글 (모든 selection 상태)
keyBindingManager.bindCommand('Ctrl+B', 'bold.toggle');
keyBindingManager.bindCommand('Cmd+B', 'bold.toggle');
```

#### 플랫폼별 키 처리

```ts
// 플랫폼 자동 감지
const modifier = navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl';
keyBindingManager.bindCommand(`${modifier}+B`, 'bold.toggle');

// 또는 명시적으로 둘 다 등록
keyBindingManager.bindCommand('Ctrl+B', 'bold.toggle'); // Windows/Linux
keyBindingManager.bindCommand('Cmd+B', 'bold.toggle'); // macOS
```

### 5.6 다른 에디터들의 처리 방식 (참고)

#### 조사 결과

**대부분의 에디터들은 `inputType` hook을 제공하지 않음**:

1. **ProseMirror**: `keydown` 이벤트 기반 `Keymap` 플러그인 사용
2. **Slate.js**: `beforeinput` 이벤트 사용하지만 `inputType` hook은 제공하지 않음
3. **Lexical (Meta)**: `keydown` 이벤트 기반 처리
4. **Tiptap**: ProseMirror 기반이므로 `keydown` 이벤트 사용
5. **Quill**: `keydown` 이벤트 기반 처리

#### 왜 inputType hook을 제공하지 않는가?

1. **브라우저 호환성 문제**: Safari에서 제한적 지원
2. **기존 시스템과의 통합 어려움**: 대부분의 에디터가 이미 `keydown` 기반 시스템 구축
3. **세밀한 제어 필요**: 키 조합을 직접 파싱하는 것이 더 유연함

#### 우리의 결정

**Key 기반 hook만 제공**:
- 다른 에디터들과 동일한 접근법
- 브라우저 호환성 최대화
- 기존 `KeymapManager`와의 일관성 유지
- 모든 selection 상태에서 동일하게 동작

---

### 5.7 KeymapManager와 Command 시스템 통합

#### 현재 상태

**KeymapManager** (`packages/editor-view-dom/src/keymap/keymap-manager.ts`):
- ✅ 이미 존재함
- 단순한 `key → handler` 매핑
- `register(key: string, handler: () => void)` 형태
- Command와 직접 연결되지 않음

**Command 시스템** (`packages/editor-core/src/editor.ts`):
- `registerCommand({ name, execute, before, after })` 형태
- Extension에서 command 등록
- 단축키와 직접 연결되지 않음

#### 통합 필요성

✅ **단축키 → Command 연결이 필요함**:
- Extension에서 command를 등록하고, 단축키로 실행할 수 있어야 함
- KeymapManager가 Command를 호출하도록 통합 필요
- Hook 시스템과 Command 시스템을 함께 사용할 수 있어야 함

#### 통합 방안: KeyBindingManager

**Option 1: KeymapManager 확장 (권장)**

```ts
interface KeyBinding {
  // 단축키 식별자 (Key 기반만)
  key: string;           // 예: 'Ctrl+B', 'Enter', 'Cmd+B'
  
  // Command 연결
  command?: string;       // 예: 'bold.toggle'
  commandPayload?: any;   // Command에 전달할 payload
  
  // 또는 직접 handler (기존 KeymapManager 호환)
  handler?: () => void;
  
  // Hook 지원
  before?: (event: KeyboardEvent, context: EditorContext) => boolean | void;
  after?: (event: KeyboardEvent, context: EditorContext, result: any) => void;
  
  // 우선순위
  priority?: number;
}

interface KeyBindingManager extends KeymapManager {
  // KeyBinding 등록
  registerBinding(binding: KeyBinding): () => void; // unregister 함수 반환
  
  // Command와 단축키 연결 (편의 메서드)
  bindCommand(key: string, command: string, payload?: any): void;
  
  // 등록된 binding 조회
  getBindings(key?: string): KeyBinding[];
  
  // 기존 KeymapManager API 유지 (하위 호환성)
  register(key: string, handler: () => void): void;
  getHandler(key: string): (() => void) | undefined;
  remove(key: string): void;
  clear(): void;
}
```

**사용 예시**:

```ts
// Extension에서 Command 등록
editor.registerCommand({
  name: 'bold.toggle',
  before: (editor, payload) => {
    console.log('Before bold toggle');
  },
  execute: (editor, payload) => {
    return editor.dataStore.range.toggleMark(...);
  },
  after: (editor, payload) => {
    console.log('After bold toggle');
  }
});

// KeyBindingManager로 단축키와 Command 연결
keyBindingManager.bindCommand('Ctrl+B', 'bold.toggle');
keyBindingManager.bindCommand('Cmd+B', 'bold.toggle'); // macOS

// 또는 더 세밀한 제어
keyBindingManager.registerBinding({
  key: 'Ctrl+B',
  command: 'bold.toggle',
  before: (event, context) => {
    if (!canToggleBold(context)) {
      event.preventDefault();
      return true; // Command 실행 스킵
    }
  },
  after: (event, context, result) => {
    analytics.track('bold_toggled', { result });
  },
  priority: 100
});
```

**처리 흐름**:

```
사용자 입력 (예: Ctrl+B)
  ↓
keydown 이벤트 (key: 'Ctrl+B')
  ├─ KeyBinding의 before hook 실행
  ├─ Command의 before hook 실행
  ├─ Command의 execute 실행
  ├─ Command의 after hook 실행
  └─ KeyBinding의 after hook 실행
```

**실행 순서**:
1. KeyBinding `before` hook (Key 기반)
2. Command `before` hook
3. Command `execute`
4. Command `after` hook
5. KeyBinding `after` hook

#### 기존 KeymapManager와의 호환성

기존 `KeymapManager` API는 유지하되, 내부적으로 `KeyBindingManager`를 사용:

```ts
// 기존 API (하위 호환성)
keymapManager.register('Ctrl+B', () => {
  editor.executeCommand('bold.toggle');
});

// 새로운 API (Command 직접 연결)
keyBindingManager.bindCommand('Ctrl+B', 'bold.toggle');
```

### 5.8 Extension 기반 Keymap 등록

#### 현재 문제점

현재 `EditorViewDOM`에서 일일이 키를 등록하고 있음:

```ts
// editor-view-dom.ts
this.keymapManager.register('Ctrl+b', () => this.toggleBold());
this.keymapManager.register('Cmd+b', () => this.toggleBold());
this.keymapManager.register('Ctrl+i', () => this.toggleItalic());
this.keymapManager.register('Cmd+i', () => this.toggleItalic());
// ... 반복
```

**문제점**:
- 플랫폼별 키 조합을 일일이 등록해야 함 (Ctrl vs Cmd)
- Extension이 추가될 때마다 `EditorViewDOM`을 수정해야 함
- Command와 단축키의 연결이 분산되어 있음

#### 해결 방안: Extension 기반 등록

**Extension에서 직접 keymap 등록**:

```ts
// packages/editor-core/src/extensions/bold.ts
export class BoldExtension implements Extension {
  name = 'bold';
  
  onCreate(editor: Editor): void {
    // Command 등록
    editor.registerCommand({
      name: 'bold.toggle',
      execute: (editor) => {
        // Bold 토글 로직
        return true;
      },
      canExecute: (editor) => {
        return true;
      }
    });
    
    // KeyBinding 등록 (Extension에서 직접)
    const keyBindingManager = editor._viewDOM?._keyBindingManager;
    if (keyBindingManager) {
      // 플랫폼 자동 감지
      const modKey = navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl';
      
      keyBindingManager.bindCommand(`${modKey}+B`, 'bold.toggle');
      
      // 또는 명시적으로 둘 다 등록
      keyBindingManager.bindCommand('Ctrl+B', 'bold.toggle');
      keyBindingManager.bindCommand('Cmd+B', 'bold.toggle');
    }
  }
}
```

**장점**:
- Extension이 자신의 Command와 단축키를 함께 관리
- `EditorViewDOM` 수정 불필요
- Extension 추가/제거 시 자동으로 keymap도 추가/제거

#### KeyProfile 개념 (선택사항)

**KeyProfile**: 사용자나 환경에 따라 다른 키 매핑을 적용할 수 있는 프로파일 시스템

**위지윅 에디터의 Vim 모드 지원 현황**:

| 에디터 타입 | Vim 모드 지원 | 비고 |
|------------|--------------|------|
| **코드 에디터** (VS Code, Sublime Text, Atom) | ✅ 제공 | 코드 편집용이므로 vim 모드가 일반적 |
| **전통적인 WYSIWYG** (Google Docs, Notion, Word Online) | ❌ 제공하지 않음 | GUI 중심, 모달 편집 방식과 맞지 않음 |
| **라이브러리 기반** (ProseMirror, Tiptap, Slate.js) | ⚠️ 제한적 | 공식적으로 제공하지 않지만, 커뮤니티 플러그인 존재 가능 |
| **마크다운 에디터** (Typora, Obsidian) | ⚠️ 일부 제공 | 마크다운 모드에서는 vim 스타일 단축키 제공하는 경우 있음 |

**결론**:
- **전통적인 WYSIWYG 에디터**는 vim 모드를 제공하지 않는 것이 일반적
- **코드 에디터**는 vim 모드가 표준 기능
- **라이브러리 기반 에디터**는 커뮤니티 플러그인으로 구현 가능하지만, 공식 지원은 드묾
- **우리 에디터**는 KeyProfile 시스템으로 vim 모드를 선택적으로 제공 가능 (초기 구현에서는 선택사항)

**사용 사례**:
1. **기본 프로파일**: 표준 단축키 (Ctrl+B, Ctrl+I 등)
2. **Vim 프로파일**: Vim 스타일 단축키 (예: `i` = insert mode, `dd` = delete line) - **선택사항**
3. **Emacs 프로파일**: Emacs 스타일 단축키 (예: `Ctrl+X Ctrl+S` = save) - **선택사항**
4. **사용자 커스텀 프로파일**: 사용자가 직접 정의한 단축키

**구현 방식**:

```ts
interface KeyProfile {
  name: string;
  keymaps: Record<string, string>; // key -> command 매핑
}

// 기본 프로파일
const defaultProfile: KeyProfile = {
  name: 'default',
  keymaps: {
    'Ctrl+B': 'bold.toggle',
    'Ctrl+I': 'italic.toggle',
    'Enter': 'insertParagraph',
    // ...
  }
};

// Vim 프로파일
const vimProfile: KeyProfile = {
  name: 'vim',
  keymaps: {
    'i': 'insertMode',
    'dd': 'deleteLine',
    'yy': 'copyLine',
    // ...
  }
};

// KeyBindingManager에 프로파일 적용
keyBindingManager.loadProfile(defaultProfile);
// 또는
keyBindingManager.loadProfile(vimProfile);
```

**모드 전환 기능**:

```ts
interface KeyBindingManager {
  // 프로파일 로드
  loadProfile(profile: KeyProfile): void;
  
  // 현재 프로파일 조회
  getCurrentProfile(): KeyProfile | null;
  
  // 프로파일 전환
  switchProfile(profileName: string): void;
  
  // 사용 가능한 프로파일 목록
  getAvailableProfiles(): KeyProfile[];
  
  // 프로파일 등록
  registerProfile(profile: KeyProfile): void;
}

// 사용 예시
keyBindingManager.registerProfile(defaultProfile);
keyBindingManager.registerProfile(vimProfile);
keyBindingManager.registerProfile(emacsProfile);

// 프로파일 전환
keyBindingManager.switchProfile('vim'); // Vim 모드로 전환
keyBindingManager.switchProfile('default'); // 기본 모드로 전환
```

**Vim 모드의 경우 추가 고려사항**:

Vim은 모달 편집기이므로 단순 키 매핑만으로는 부족합니다:

```ts
// Vim 모드 상태 관리
interface VimModeState {
  mode: 'normal' | 'insert' | 'visual' | 'command';
  pendingKeys: string[]; // 다중 키 명령어 (예: 'dd', 'yy')
}

// Vim 프로파일은 모드별로 다른 키 매핑 필요
const vimProfile: KeyProfile = {
  name: 'vim',
  keymaps: {
    // Normal 모드
    'i': 'vim.enterInsertMode',
    'v': 'vim.enterVisualMode',
    'dd': 'deleteLine',
    'yy': 'copyLine',
    'p': 'paste',
    // ...
  },
  // 모드별 키 매핑 분리
  modeKeymaps: {
    normal: {
      'i': 'vim.enterInsertMode',
      'dd': 'deleteLine',
      // ...
    },
    insert: {
      'Escape': 'vim.enterNormalMode',
      // 일반 텍스트 입력은 그대로
    },
    visual: {
      'd': 'delete',
      'y': 'copy',
      'Escape': 'vim.enterNormalMode',
      // ...
    }
  }
};
```

**모드 전환 시 주의사항**:

1. **상태 초기화**: 모드 전환 시 pending keys 초기화
2. **UI 피드백**: 현재 모드 표시 (예: 상태바에 "NORMAL", "INSERT" 표시)
3. **기본 동작 복원**: 모드 전환 시 이전 모드의 키 바인딩 제거
4. **Extension 호환성**: Extension이 등록한 키 바인딩과의 충돌 처리

**구현 예시**:

```ts
class KeyBindingManagerImpl {
  private currentProfile: KeyProfile | null = null;
  private registeredProfiles: Map<string, KeyProfile> = new Map();
  
  loadProfile(profile: KeyProfile): void {
    // 기존 키 바인딩 제거
    this.clear();
    
    // 새 프로파일의 키 바인딩 등록
    for (const [key, command] of Object.entries(profile.keymaps)) {
      this.bindCommand(key, command);
    }
    
    this.currentProfile = profile;
    this.emit('profile:changed', { profile });
  }
  
  switchProfile(profileName: string): void {
    const profile = this.registeredProfiles.get(profileName);
    if (!profile) {
      throw new Error(`Profile "${profileName}" not found`);
    }
    this.loadProfile(profile);
  }
  
  registerProfile(profile: KeyProfile): void {
    this.registeredProfiles.set(profile.name, profile);
  }
  
  getCurrentProfile(): KeyProfile | null {
    return this.currentProfile;
  }
  
  getAvailableProfiles(): KeyProfile[] {
    return Array.from(this.registeredProfiles.values());
  }
}
```

**다른 에디터들의 키 바인딩 관리 방식**:

| 에디터 | 키 바인딩 관리 방식 | 프로파일 지원 | 비고 |
|--------|-------------------|--------------|------|
| **VS Code** | `keybindings.json` 파일 기반 | ✅ 키 바인딩 프로파일 (예: Vim, Emacs) | JSON 파일로 관리, 확장 프로그램으로 프로파일 제공 |
| **ProseMirror** | `prosemirror-keymap` 플러그인 | ❌ 프로파일 없음 | 플러그인 단위로 키맵 등록, 런타임 전환 불가 |
| **Tiptap** | ProseMirror 기반 | ❌ 프로파일 없음 | Extension에서 키맵 등록 |
| **Slate.js** | 플러그인/Extension 기반 | ❌ 프로파일 없음 | 각 플러그인이 자체 키맵 관리 |
| **Sublime Text** | `.sublime-keymap` 파일 | ✅ 키맵 파일별 프로파일 | 플랫폼별 키맵 파일 (Default, Linux, OSX, Windows) |
| **Atom** | `keymap.cson` 파일 | ✅ 키맵 파일별 프로파일 | CoffeeScript Object Notation 파일 |
| **Vim/Neovim** | `.vimrc` / `init.vim` | ✅ 설정 파일별 프로파일 | 모달 편집기, 모드별 키맵 |

**VS Code의 키 바인딩 관리**:

```json
// keybindings.json
[
  {
    "key": "ctrl+b",
    "command": "editor.action.toggleBold",
    "when": "editorTextFocus"
  },
  {
    "key": "ctrl+i",
    "command": "editor.action.toggleItalic"
  }
]
```

- JSON 파일로 키 바인딩 관리
- 확장 프로그램이 키 바인딩 추가 가능
- Vim 확장 프로그램이 별도 키맵 제공 (프로파일 개념)

**ProseMirror의 키맵 관리**:

```ts
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';

// 키맵 플러그인 등록
const keymapPlugin = keymap({
  'Mod+b': toggleBold,
  'Mod+i': toggleItalic,
  // ...
});

// 여러 키맵 병합
const allKeymaps = keymap([
  ...baseKeymap,
  customKeymap,
  anotherKeymap
]);
```

- 플러그인 단위로 키맵 등록
- 여러 키맵을 병합하여 사용
- 런타임에 프로파일 전환 불가 (플러그인 재등록 필요)

**Sublime Text의 키맵 프로파일**:

```
Default (Linux).sublime-keymap
Default (OSX).sublime-keymap
Default (Windows).sublime-keymap
```

- 플랫폼별 키맵 파일 자동 선택
- 사용자 키맵 파일로 오버라이드 가능
- 프로파일 전환은 파일 교체 방식

**우리 에디터의 접근법**:

우리는 **하이브리드 접근법**을 사용:

1. **Extension 기반 등록** (기본): ProseMirror/Tiptap과 유사
   - Extension에서 키맵 자동 등록
   - 코드와 함께 관리

2. **KeyProfile 시스템** (선택사항): VS Code/Sublime Text와 유사
   - 런타임에 프로파일 전환 가능
   - 사용자 커스터마이징 지원
   - Vim/Emacs 등 특수 모드 지원

**장점**:
- Extension 개발자는 간단하게 키맵 등록 (ProseMirror 방식)
- 사용자는 프로파일로 커스터마이징 가능 (VS Code 방식)
- 두 가지 방식을 모두 지원하여 유연성 확보

**KeyProfile vs 일일이 등록**:

| 방식 | 장점 | 단점 | 권장 사용 |
|------|------|------|----------|
| **Extension 기반 등록** | - Extension과 단축키가 함께 관리됨<br>- 자동으로 추가/제거됨<br>- 코드가 분산되지 않음 | - Extension이 keyBindingManager에 접근해야 함 | ✅ **권장**: 기본 방식 |
| **일일이 등록** | - 간단함<br>- 명시적 | - 플랫폼별 키를 일일이 등록해야 함<br>- Extension 추가 시 수정 필요 | ❌ 비권장 |
| **KeyProfile** | - 사용자 커스터마이징 가능<br>- 여러 프로파일 전환 가능<br>- Vim/Emacs 등 특수 에디터 스타일 지원 | - 구현 복잡도 증가<br>- 기본 사용에는 불필요 | ⚠️ **선택사항**: 사용자 커스터마이징이 필요한 경우만 |

**결론**:
- **기본**: Extension 기반 등록 사용 (일일이 등록하지 않음)
- **KeyProfile**: 사용자 커스터마이징이 필요한 경우에만 추가 (초기 구현에서는 선택사항)

### 5.9 Command 매개변수 전달

**단축키에 Command를 매핑할 때 매개변수도 전달 가능**:

```ts
// 매개변수 없이
keyBindingManager.bindCommand('Ctrl+B', 'bold.toggle');

// 매개변수와 함께
keyBindingManager.bindCommand('Ctrl+Shift+B', 'bold.toggle', { 
  weight: 'bold' 
});

// 또는 registerBinding 사용
keyBindingManager.registerBinding({
  key: 'Ctrl+1',
  command: 'heading.set',
  commandPayload: { level: 1 } // Command의 execute(editor, payload)로 전달됨
});

keyBindingManager.registerBinding({
  key: 'Ctrl+2',
  command: 'heading.set',
  commandPayload: { level: 2 }
});
```

**Command에서 매개변수 사용**:

```ts
// Extension에서 Command 등록
editor.registerCommand({
  name: 'heading.set',
  execute: (editor, payload?: { level: number }) => {
    const level = payload?.level ?? 1;
    // heading 설정 로직
    return true;
  }
});

// 단축키로 실행 시
// Ctrl+1 → execute(editor, { level: 1 })
// Ctrl+2 → execute(editor, { level: 2 })
```

**동일한 Command, 다른 매개변수로 여러 단축키 등록 가능**:

```ts
// Extension에서 여러 단축키 등록
keyBindingManager.bindCommand('Ctrl+1', 'heading.set', { level: 1 });
keyBindingManager.bindCommand('Ctrl+2', 'heading.set', { level: 2 });
keyBindingManager.bindCommand('Ctrl+3', 'heading.set', { level: 3 });
// ...
```

#### 구현 고려사항

1. **KeyBindingManager는 KeymapManager를 확장**
   - 기존 코드 호환성을 위해 확장 형태 권장
   - `KeymapManagerImpl`을 `KeyBindingManagerImpl`로 확장

2. **Hook 시스템 통합**
   - KeyBinding의 `before`/`after` hook이 Command의 `before`/`after` hook과 함께 실행
   - 실행 순서: KeyBinding before → Command before → Command execute → Command after → KeyBinding after

3. **Extension에서의 사용**
   - Extension에서 command 등록 시 자동으로 단축키 바인딩 가능
   - 또는 Extension에서 명시적으로 단축키 바인딩 등록

---

## 6. 처리 파이프라인

### 6.1 전체 흐름
1. **beforeinput 구조 변경 감지** (구조 변경만 처리)  
   - `insertParagraph`, `insertLineBreak` 등 구조 변경 시에만 `preventDefault()` 후 처리.  
   - 처리 순서: 모델 먼저 변경 → 렌더링 → selection 업데이트.  
   - 나머지 `inputType`은 브라우저가 자동 처리하도록 둠.

2. **MutationObserver** (주요 처리 레이어)  
   - 브라우저가 자동으로 변경한 DOM을 감지하여 모델 업데이트.  
   - 텍스트 입력/삭제의 대부분을 여기서 처리.  
   - IME 입력 완료 후 최종 텍스트 변경도 여기서 감지.

3. **keydown fallback** (보조 처리)  
   - `Meta/Control` 조합 단축키 (Bold, Italic, Underline 등)  
   - `Enter`/`Backspace` 등에서 일부 브라우저가 `inputType`을 제공하지 않을 경우 수동 처리.  
   - **`event.isComposing` 체크는 하되, composition 이벤트는 직접 처리하지 않음.**

### 6.2 의사코드
```ts
function handleBeforeInput(event: InputEvent) {
  // 구조 변경만 처리, 나머지는 브라우저가 자동 처리하도록 둠
  
  // 구조 변경: preventDefault 후 모델 먼저 변경 → 렌더링 → selection
  if (event.inputType === 'insertParagraph' || 
      event.inputType === 'insertLineBreak') {
    event.preventDefault();
    
    const selection = selectionManager.ensureModelSelection();
    
    // 1. 모델 먼저 변경
    let result;
    if (event.inputType === 'insertParagraph') {
      result = splitBlock(selection);
    } else if (event.inputType === 'insertLineBreak') {
      result = insertLineBreak(selection);
    }
    
    // 2. 렌더링 (DOM 업데이트)
    editor.render();
    
    // 3. Selection 업데이트
    const newSelection = calculateNewSelection(selection);
    selectionManager.setSelection(newSelection);
    editor.emit('editor:selection.change', { selection: newSelection });
    
    return;
  }
  
  // 히스토리 관련 (에디터 자체 history 사용 시)
  if (event.inputType === 'historyUndo') {
    event.preventDefault();
    editor.history.undo();
    return;
  }
  
  if (event.inputType === 'historyRedo') {
    event.preventDefault();
    editor.history.redo();
    return;
  }
  
  // 나머지는 preventDefault 하지 않음
  // 브라우저가 자동으로 DOM 변경하고, MutationObserver가 감지하여 모델 업데이트
}

function handleMutationObserver(event: MutationEvent) {
  // 브라우저가 자동으로 변경한 DOM을 감지하여 모델 업데이트
  // 텍스트 입력/삭제의 대부분을 여기서 처리
  
  if (event.type === 'characterData' || event.type === 'childList') {
    const textNodeId = resolveModelTextNodeId(event.target);
    if (textNodeId) {
      // DOM 변경을 모델에 반영
      updateModelFromDOMChange(textNodeId, event.oldValue, event.newValue);
    }
  }
}

function handleKeyDown(event: KeyboardEvent) {
  // composition 중이어도 특수 키는 처리 가능 (단축키 등)
  // 단, 텍스트 입력 관련 키는 브라우저에 맡김
  
  const key = getKeyString(event); // 예: 'Ctrl+B', 'Enter'
  
  // KeyBindingManager에서 binding 찾기
  const bindings = keyBindingManager.getBindings(key);
  const sortedBindings = bindings.sort((a, b) => 
    (a.priority || 1000) - (b.priority || 1000)
  );
  
  // before hooks 실행
  for (const binding of sortedBindings) {
    if (binding.before) {
      const result = binding.before(event, editorContext);
      if (result === true) {
        // Hook이 처리했으므로 기본 동작 스킵
        // after hooks는 실행하지 않음 (기본 동작이 없으므로)
        return;
      }
    }
  }
  
  // 기본 동작 수행
  let defaultResult = null;
  
  // Command가 연결된 경우
  for (const binding of sortedBindings) {
    if (binding.command) {
      defaultResult = await editor.executeCommand(binding.command, binding.commandPayload);
      break; // 첫 번째 command만 실행
    } else if (binding.handler) {
      // 기존 handler 방식
      binding.handler();
      break;
    }
  }
  
  // KeymapManager에서 기본 handler 찾기 (fallback)
  if (!defaultResult && !sortedBindings.some(b => b.command || b.handler)) {
    const handler = keymapManager.getHandler(key);
    if (handler) {
      handler();
    }
  }
  
  // after hooks 실행
  for (const binding of sortedBindings) {
    if (binding.after) {
      binding.after(event, editorContext, defaultResult);
    }
  }
}

// composition 이벤트는 사용하지 않음
// 브라우저가 자동으로 처리하고, MutationObserver가 최종 결과를 감지
```

---

## 7. IME 입력 처리 전략 (composition 이벤트 미사용)

### 6.1 핵심 원칙
- **composition 이벤트(`compositionstart/update/end`)는 사용하지 않음**
- 브라우저가 자동으로 IME 입력을 처리하도록 두어 한글 입력 깨짐을 방지
- `beforeinput`의 `insertCompositionText` 또는 `insertText`로 처리
- 최종 결과는 `MutationObserver`가 감지하여 모델 업데이트

### 6.2 처리 흐름
1. **사용자가 한글 입력 시작**
   - 브라우저가 자동으로 composition 상태 관리
   - `beforeinput` 이벤트 발생 (`insertCompositionText` 또는 `insertText`)
   - **우리는 `preventDefault()` 하지 않고 브라우저가 자동 처리하도록 둠**

2. **입력 중간 단계**
   - 브라우저가 자동으로 DOM 업데이트
   - `MutationObserver`가 변경 감지하지만, composition 중이면 무시 또는 보류

3. **입력 완료**
   - 브라우저가 최종 텍스트를 DOM에 반영
   - `MutationObserver`가 최종 텍스트 변경을 감지
   - 모델 업데이트 (`dataStore.range.replaceText`)

### 6.3 장점
- 브라우저의 기본 IME 처리를 활용하여 한글 입력 깨짐 최소화
- composition 이벤트의 복잡한 상태 관리 불필요
- 브라우저별 차이를 신경 쓸 필요 없음

---

## 8. Selection 동기화
- `selectionchange` 이벤트에서 DOM Selection → Model Selection 변환 (`DOMSelectionHandlerImpl` 재사용).
- `editor.selectionManager.setSelection(modelSelection)` 호출 후 `editor.emit('editor:selection.change', { selection })`.
- beforeinput/keydown 처리 전에도 SelectionManager 상태를 최신으로 유지해야 정확한 범위를 편집할 수 있음.

---

## 9. MutationObserver 역할 (주요 처리 레이어)
- **주 목적**: 브라우저가 자동으로 변경한 DOM을 감지하여 모델 업데이트
- **텍스트 입력/삭제의 대부분을 여기서 처리**
- **IME 입력 완료 후 최종 텍스트 변경 감지**
- 구조 변경(`insertParagraph`, `insertLineBreak`)은 `beforeinput`에서 이미 처리되므로 스킵

### 9.1 처리 로직
```ts
function handleTextContentChange(oldValue: string | null, newValue: string | null, target: Node) {
  // 구조 변경은 beforeinput에서 이미 처리되었으므로 스킵
  if (isStructuralChange(target)) {
    return;
  }
  
  // 렌더링 중 발생하는 DOM 변경은 무시 (무한루프 방지)
  if (editor.isRendering) {
    return;
  }
  
  // 브라우저가 자동으로 변경한 DOM을 모델에 반영
  const textNodeId = resolveModelTextNodeId(target);
  if (textNodeId) {
    // DOM 변경을 모델에 반영
    updateModelFromDOMChange(textNodeId, oldValue, newValue);
    
    // skipRender: true로 이벤트 발생 (무한루프 방지)
    editor.emit('editor:content.change', {
      skipRender: true,
      from: 'MutationObserver',
      content: editor.document
    });
  }
}
```

---

## 10. 데이터 조작 API
- **텍스트 편집**: `dataStore.range.replaceText(contentRange, newText)`  
  - marks/decorators 자동 조정.
- **노드 삭제/삽입**: `dataStore.deleteNode`, `dataStore.insertNode`, `transactionManager` 활용.
- **마크 토글**: `editor.chain().toggleMark('bold')` 또는 직접 `dataStore.marks.toggleMark`.
- **블록 분리**: `splitBlock(selection)` 구현 (현재 커서 블록을 분할하고 새 노드 삽입).

---

## 11. 구현 순서 제안
1. **이벤트 핸들러 스캐폴딩**  
   - `packages/editor-view-dom/src/event-handlers`에 `beforeinput-handler.ts`, `keydown-handler.ts` 추가.
   - **`composition-handler.ts`는 생성하지 않음** (composition 이벤트 미사용).

2. **Selection 헬퍼**  
   - DOM selection → Model selection 변환 유틸 (`selection-handler.ts`) 재사용.
   - handleBeforeInput 내부에서 항상 최신 selection 확보.

3. **beforeinput handler map 구현**  
   - `insertText`부터 구현하여 텍스트 편집 기본 동작 확보.
   - `insertCompositionText`는 `insertText`와 동일하게 처리 (브라우저가 자동 처리).

4. **Enter/Shift+Enter/Backspace**  
   - 엔터(단락 분리), 소프트 브레이크, Backspace 특수 케이스 처리.

5. **붙여넣기/드롭**  
   - clipboard 데이터 파싱, 드롭 데이터 처리.

6. **MutationObserver 안전망 강화**  
   - beforeinput에서 처리된 변경과 구분하는 로직 추가.
   - IME 입력 완료 후 최종 텍스트 변경 감지 로직 개선.

7. **단축키/명령**  
   - Bold/Italic/Tabs 등의 keydown 처리 및 command 시스템 연계.

8. **테스트**  
   - beforeinput 기반 단위 테스트 (Vitest + jsdom)  
   - 통합 테스트: 사용자 시나리오 (Enter, Backspace, 붙여넣기, **한글 입력**).

---

## 12. KeyBinding 시스템 구현 고려사항

### 12.1 KeyBinding 등록 API

```ts
interface KeyBindingManager {
  // KeyBinding 등록
  registerBinding(binding: KeyBinding): () => void; // unregister 함수 반환
  
  // Command와 단축키 연결 (편의 메서드)
  bindCommand(key: string, command: string, payload?: any): void;
  
  // 등록된 binding 조회
  getBindings(key?: string): KeyBinding[];
  
  // 기존 KeymapManager API 유지 (하위 호환성)
  register(key: string, handler: () => void): void;
  getHandler(key: string): (() => void) | undefined;
  remove(key: string): void;
  clear(): void;
}
```

### 12.2 Hook 우선순위

- 낮은 `priority` 값이 먼저 실행됨
- 기본 동작은 `priority: 1000`으로 간주
- 외부 hook은 `priority: 100` (기본 동작 전) 또는 `priority: 2000` (기본 동작 후) 권장

### 12.3 Hook과 기본 동작의 관계

- `before` hook이 `true`를 반환하면 기본 동작 스킵 (하지만 `handler`나 `command`는 실행 가능)
- `before` hook이 `false` 또는 `undefined`를 반환하면 기본 동작 수행
- `after` hook은 항상 실행됨 (기본 동작 성공 여부와 무관)

### 12.4 외부에서 단축키 가로채기 시나리오

**시나리오 1: 커스텀 Bold 동작**
```ts
keyBindingManager.registerBinding({
  key: 'Ctrl+B',
  handler: () => {
    performCustomBoldAction(editor);
  },
  before: (event, context) => {
    if (context.selection.isCollapsed && shouldUseCustomBold(context)) {
      event.preventDefault();
      return true; // handler 실행, 기본 동작 스킵
    }
  }
});
```

**시나리오 2: Enter 키 커스터마이징**
```ts
keyBindingManager.registerBinding({
  key: 'Enter',
  handler: () => {
    if (isInCodeBlock(editor)) {
      insertCodeBlockLineBreak(editor);
    } else {
      editor.executeCommand('insertParagraph');
    }
  },
  before: (event, context) => {
    if (isInCodeBlock(context)) {
      event.preventDefault();
      return true; // handler 실행, 기본 동작 스킵
    }
  }
});
```

**시나리오 3: 로깅 및 분석 (Command는 그대로 사용)**
```ts
keyBindingManager.registerBinding({
  key: 'Ctrl+Z',
  command: 'history.undo', // 기존 Command 사용
  after: (event, context, result) => {
    analytics.track('undo_performed', {
      success: result,
      timestamp: Date.now()
    });
  },
  priority: 2000 // Command 실행 후 실행
});
```

---

## 13. 키 입력 처리 세부사항

### 13.1 키 문자열 파싱 (`getKeyString`)

**구현**:

```ts
function getKeyString(event: KeyboardEvent): string {
  const modifiers = [];
  
  // Modifier 키 순서: Ctrl, Cmd, Alt, Shift
  if (event.ctrlKey) modifiers.push('Ctrl');
  if (event.metaKey) modifiers.push('Cmd'); // macOS의 Command 키
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');
  
  // 키 이름 정규화
  const key = normalizeKeyName(event.key);
  
  return modifiers.length > 0 
    ? [...modifiers, key].join('+')
    : key;
}

function normalizeKeyName(key: string): string {
  // 키 이름 정규화 규칙
  const keyMap: Record<string, string> = {
    ' ': 'Space',
    'ArrowUp': 'Up',
    'ArrowDown': 'Down',
    'ArrowLeft': 'Left',
    'ArrowRight': 'Right',
    // 필요시 추가
  };
  
  return keyMap[key] || key;
}
```

**키 문자열 형식 규칙**:
- Modifier 순서: `Ctrl`, `Cmd`, `Alt`, `Shift` 순서로 정렬
- 키 이름: 대문자로 시작 (예: `B`, `Enter`, `Space`)
- 구분자: `+` 사용 (예: `Ctrl+B`, `Shift+Enter`)
- 단일 키: Modifier 없으면 키 이름만 (예: `Enter`, `Backspace`)

**예시**:
```ts
// Ctrl+B → 'Ctrl+B'
// Cmd+B → 'Cmd+B'
// Shift+Enter → 'Shift+Enter'
// Enter → 'Enter'
// Space → 'Space'
```

### 13.2 플랫폼별 키 매핑

**Modifier 키 매핑**:

| 플랫폼 | Ctrl | Meta/Cmd | Alt | Shift |
|--------|------|----------|-----|-------|
| Windows/Linux | `Ctrl` | `Cmd` (일부 브라우저) | `Alt` | `Shift` |
| macOS | `Ctrl` | `Cmd` | `Option` (Alt) | `Shift` |

**주의사항**:
- macOS에서 `metaKey`는 Command 키를 의미
- Windows/Linux에서 `metaKey`는 일반적으로 `false`
- `navigator.platform` 또는 `navigator.userAgent`로 플랫폼 감지

**플랫폼 감지 예시**:
```ts
function isMac(): boolean {
  return navigator.platform.toUpperCase().includes('MAC') ||
         navigator.userAgent.toUpperCase().includes('MAC');
}

// 사용
const modKey = isMac() ? 'Cmd' : 'Ctrl';
```

### 13.3 키 이벤트 필터링

**처리하지 않아야 하는 키 이벤트**:

1. **Composition 중인 텍스트 입력 키**:
   ```ts
   if (event.isComposing && isTextInputKey(event.key)) {
     return; // 브라우저가 자동 처리하도록 둠
   }
   ```

2. **에디터 외부 포커스**:
   ```ts
   if (!editor.isFocused()) {
     return; // 에디터가 포커스되지 않았으면 무시
   }
   ```

3. **시스템 단축키**:
   ```ts
   // 일부 시스템 단축키는 브라우저가 처리
   // 예: Cmd+Q (macOS 종료), Ctrl+W (창 닫기)
   // preventDefault()로 막을 수 없음
   ```

**텍스트 입력 키 판별**:
```ts
function isTextInputKey(key: string): boolean {
  // 길이가 1인 키는 일반적으로 텍스트 입력
  if (key.length === 1) return true;
  
  // 특수 키는 텍스트 입력이 아님
  const specialKeys = ['Enter', 'Backspace', 'Delete', 'Tab', 'Escape', 
                       'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  return !specialKeys.includes(key);
}
```

### 13.4 키 바인딩 등록 규칙

**중복 등록 처리**:
- 동일한 `key`로 여러 `KeyBinding` 등록 가능
- `priority`로 실행 순서 결정
- 첫 번째로 실행된 `command`/`handler`만 실행 (나머지는 스킵)

**키 문자열 대소문자**:
- 키 이름은 대문자로 정규화 (예: `B`, `Enter`)
- Modifier는 첫 글자만 대문자 (예: `Ctrl`, `Cmd`, `Shift`)
- 등록 시 대소문자 구분하지 않음 (내부적으로 정규화)

**잘못된 키 문자열 처리**:
```ts
// 잘못된 형식 예시
'ctrl+b'  // 소문자 → 정규화하여 'Ctrl+B'로 변환
'Ctrl + B' // 공백 포함 → 공백 제거하여 'Ctrl+B'로 변환
'B+Ctrl'  // 순서 잘못 → 정규화하여 'Ctrl+B'로 변환
```

### 13.5 beforeinput과 keydown의 관계

**처리 순서**:

```
사용자 입력
  ↓
beforeinput 이벤트 발생
  ├─ 구조 변경 (insertParagraph, insertLineBreak) → preventDefault() 후 처리
  ├─ 히스토리 (historyUndo, historyRedo) → preventDefault() 후 처리
  └─ 나머지 → preventDefault() 하지 않음
  ↓
keydown 이벤트 발생
  ├─ beforeinput에서 preventDefault() 했으면 → KeyBinding만 실행 (Command 실행 안 함)
  └─ preventDefault() 안 했으면 → KeyBinding 실행 (Command 실행)
```

**주의사항**:
- `beforeinput`에서 `preventDefault()` 하면 `keydown`에서도 기본 동작이 막힘
- `keydown`에서 `preventDefault()` 해도 `beforeinput`의 기본 동작은 이미 실행됨
- 구조 변경은 `beforeinput`에서 처리, 단축키는 `keydown`에서 처리

### 13.6 에러 처리

**예외 상황**:

1. **존재하지 않는 Command**:
   ```ts
   keyBindingManager.bindCommand('Ctrl+B', 'nonexistent.command');
   // executeCommand 시 에러 발생 → 에러 로깅 후 무시
   ```

2. **잘못된 키 문자열**:
   ```ts
   keyBindingManager.bindCommand('Invalid+Key', 'bold.toggle');
   // 정규화 시도 후 등록, 매칭 실패 시 무시
   ```

3. **중복 등록**:
   ```ts
   // 동일한 key로 여러 번 등록 가능
   // priority로 실행 순서 결정
   ```

## 14. 향후 고려사항
- undo/redo: OS 기본 undo를 disable하고 에디터 history만 사용하도록 할지 결정.
- inputType 커버리지: 브라우저별 차이를 대비한 fallback (특히 Safari).
- 접근성: selection 변경 시 스크린리더 호환성 확인.
- KeyBinding 시스템: KeyBinding 시스템 구현 및 테스트.
- IME 입력 안정성: MutationObserver가 IME 입력 완료를 정확히 감지하는지 지속적으로 모니터링.
- 키 바인딩 충돌 해결: 동일한 키에 여러 바인딩이 등록된 경우 사용자에게 알림.
- 키 바인딩 커스터마이징 UI: 사용자가 단축키를 변경할 수 있는 UI 제공.

---

## 13. 핵심 요약

### 사용하는 이벤트
- ✅ `beforeinput`: **구조 변경만 처리** (`insertParagraph`, `insertLineBreak`)
- ✅ `keydown`: 단축키 및 특수 키 처리 (fallback)
- ✅ `selectionchange`: Selection 동기화
- ✅ `MutationObserver`: **주요 처리 레이어** (텍스트 입력/삭제 대부분 처리)

### 사용하지 않는 이벤트
- ❌ `input`: 사용하지 않음
- ❌ `compositionstart/update/end`: 사용하지 않음 (브라우저가 자동 처리)

### 처리 전략
1. **일반 텍스트 입력/삭제**: 
   - `beforeinput`에서 `preventDefault()` 하지 않음
   - 브라우저가 자동으로 DOM 변경
   - `MutationObserver`가 DOM 변경 감지 → 모델 업데이트

2. **구조 변경 (`insertParagraph`, `insertLineBreak`)**:
   - `beforeinput`에서 `preventDefault()` 함
   - 모델 먼저 변경 → 렌더링 → selection 업데이트

3. **IME 입력 처리**:
   - 브라우저가 자동으로 IME 입력을 처리하도록 둠
   - 최종 결과는 `MutationObserver`가 감지하여 모델 업데이트
   - **한글 입력 깨짐을 최소화하기 위한 핵심 전략**

---

이 계획을 바탕으로 이벤트 레이어와 편집 기능을 단계적으로 구현하면, 브라우저 입력과 모델 편집 사이의 동기화를 안정적으로 확립할 수 있으며, 특히 한글 입력의 안정성을 보장할 수 있다.

