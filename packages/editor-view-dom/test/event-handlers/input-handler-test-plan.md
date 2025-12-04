# InputHandlerImpl 테스트 계획

## 개요

`InputHandlerImpl`은 DOM 입력 이벤트를 처리하고 모델 트랜잭션으로 변환하는 핵심 클래스입니다. MutationObserver에서 감지한 텍스트 변경을 처리하고, IME 조합 상태를 관리하며, mark/decorator 범위를 자동으로 조정합니다.

## 테스트 대상 메서드

### 1. 핵심 메서드
- `handleTextContentChange` - MutationObserver에서 호출되는 핵심 메서드
- `commitPendingImmediate` - IME 조합 완료 후 pending 변경사항 커밋
- `resolveModelTextNodeId` - DOM에서 nodeId 추출

### 2. IME 조합 처리
- `handleCompositionStart` - 조합 시작
- `handleCompositionUpdate` - 조합 중
- `handleCompositionEnd` - 조합 완료

### 3. 이벤트 처리
- `handleInput` - input 이벤트 처리
- `handleBeforeInput` - beforeinput 이벤트 처리

### 4. 유틸리티
- `getCurrentSelection` - 현재 Selection 정보 가져오기
- `marksChangedEfficient` - marks 변경 감지 (유틸 함수)

---

## 테스트 케이스 상세

### 1. handleTextContentChange 테스트

#### 1.1 Early Return 케이스 (필터링)

**1.1.1 filler <br> 감지**
- **시나리오**: Element 노드에 `br[data-bc-filler="true"]`가 있는 경우
- **기대**: `editor:input.skip_filler` 이벤트 발생, early return
- **검증**: `executeTransaction` 호출 안 됨

**1.1.2 nodeId 없음**
- **시나리오**: `resolveModelTextNodeId`가 `null` 반환
- **기대**: `editor:input.untracked_text` 이벤트 발생, early return
- **검증**: `executeTransaction` 호출 안 됨

**1.1.3 IME 조합 중**
- **시나리오**: `isComposing === true`인 경우
- **기대**: pending에 저장, `pendingTimer` 설정, early return
- **검증**: `executeTransaction` 호출 안 됨, `pendingTextNodeId` 설정됨

**1.1.4 Range Selection (collapsed 아님)**
- **시나리오**: `selection.length !== 0`
- **기대**: `editor:input.skip_range_selection` 이벤트 발생, early return
- **검증**: `executeTransaction` 호출 안 됨

**1.1.5 Inactive Node**
- **시나리오**: `activeTextNodeId`가 있고 `textNodeId !== activeTextNodeId`
- **기대**: `editor:input.skip_inactive_node` 이벤트 발생, early return
- **검증**: `executeTransaction` 호출 안 됨

**1.1.6 Model Node 없음**
- **시나리오**: `dataStore.getNode(textNodeId)`가 `null` 반환
- **기대**: `editor:input.node_not_found` 이벤트 발생, early return
- **검증**: `executeTransaction` 호출 안 됨

**1.1.7 Text Node 없음**
- **시나리오**: `target`이 Text 노드도 Element 노드도 아니거나, Element에서 text node를 찾을 수 없음
- **기대**: `editor:input.text_node_not_found` 이벤트 발생, early return
- **검증**: `executeTransaction` 호출 안 됨

**1.1.8 handleEfficientEdit가 null 반환**
- **시나리오**: `handleEfficientEdit`가 `null` 반환 (변경 없음)
- **기대**: early return
- **검증**: `executeTransaction` 호출 안 됨

#### 1.2 정상 처리 케이스

**1.2.1 기본 텍스트 삽입**
- **시나리오**: Text 노드에서 텍스트 삽입
- **기대**: `executeTransaction` 호출, `text_replace` 트랜잭션 실행
- **검증**: 
  - `nodeId`, `start: 0`, `end: oldModelText.length`, `text: newText` 확인
  - marks 변경 없으면 `marks` 필드 없음

**1.2.2 텍스트 삭제**
- **시나리오**: Text 노드에서 텍스트 삭제
- **기대**: `executeTransaction` 호출
- **검증**: `text` 필드가 삭제된 텍스트

**1.2.3 텍스트 교체**
- **시나리오**: Text 노드에서 텍스트 교체
- **기대**: `executeTransaction` 호출
- **검증**: `text` 필드가 교체된 텍스트

**1.2.4 Marks 변경 포함**
- **시나리오**: `marksChangedEfficient`가 `true` 반환
- **기대**: `executeTransaction`에 `marks` 필드 포함
- **검증**: `marks` 필드가 `adjustedMarks`와 일치

**1.2.5 Marks 변경 없음**
- **시나리오**: `marksChangedEfficient`가 `false` 반환
- **기대**: `executeTransaction`에 `marks` 필드 없음
- **검증**: 트랜잭션에 `marks` 필드 없음

**1.2.6 Decorators 변경 포함**
- **시나리오**: `decoratorsChanged === true`
- **기대**: `updateDecorators` 호출
- **검증**: `updateDecorators`가 `adjustedDecorators`로 호출됨

**1.2.7 Decorators 변경 없음**
- **시나리오**: `decoratorsChanged === false`
- **기대**: `updateDecorators` 호출 안 됨
- **검증**: `updateDecorators` 호출 안 됨

**1.2.8 Element 노드에서 text node 찾기**
- **시나리오**: `target`이 Element 노드인 경우
- **기대**: TreeWalker로 첫 번째 text node 찾기
- **검증**: 정상적으로 처리됨

#### 1.3 복잡한 시나리오

**1.3.1 Mark가 있는 텍스트 편집**
- **시나리오**: Mark가 적용된 텍스트 편집
- **기대**: `handleEfficientEdit`가 `adjustedMarks` 반환
- **검증**: `marksChangedEfficient`가 올바르게 작동

**1.3.2 Decorator가 있는 텍스트 편집**
- **시나리오**: Decorator가 적용된 텍스트 편집
- **기대**: `handleEfficientEdit`가 `adjustedDecorators` 반환
- **검증**: `updateDecorators`가 올바르게 호출됨

**1.3.3 Mark와 Decorator 모두 있는 텍스트 편집**
- **시나리오**: Mark와 Decorator가 모두 있는 텍스트 편집
- **기대**: 둘 다 조정됨
- **검증**: `marks`와 `decorators` 모두 업데이트됨

---

### 2. IME 조합 처리 테스트

#### 2.1 handleCompositionStart

**2.1.1 조합 시작**
- **시나리오**: `handleCompositionStart()` 호출
- **기대**: `isComposing = true`, `clearPending()` 호출
- **검증**: `isComposing` 상태 확인, pending 초기화 확인

#### 2.2 handleCompositionUpdate

**2.2.1 조합 중**
- **시나리오**: `handleCompositionUpdate()` 호출
- **기대**: 아무 동작 없음 (로깅만)
- **검증**: 상태 변경 없음

#### 2.3 handleCompositionEnd

**2.3.1 조합 완료**
- **시나리오**: `handleCompositionEnd()` 호출
- **기대**: `isComposing = false`, `commitPendingImmediate()` 호출
- **검증**: `isComposing` 상태 확인, `commitPendingImmediate` 호출 확인

#### 2.4 조합 중 텍스트 변경

**2.4.1 조합 중 텍스트 변경 저장**
- **시나리오**: `isComposing === true`일 때 `handleTextContentChange` 호출
- **기대**: pending에 저장, `pendingTimer` 설정
- **검증**: `pendingTextNodeId`, `pendingOldText`, `pendingNewText` 설정 확인

**2.4.2 조합 완료 후 커밋**
- **시나리오**: 조합 중 변경사항이 pending에 저장된 후 `handleCompositionEnd()` 호출
- **기대**: `commitPendingImmediate()`가 pending 변경사항을 커밋
- **검증**: `executeTransaction` 호출 확인

**2.4.3 조합 종료 누락 대비 (타이머)**
- **시나리오**: `pendingTimer`가 설정된 후 400ms 경과
- **기대**: `commitPendingImmediate()` 자동 호출
- **검증**: `executeTransaction` 호출 확인

---

### 3. commitPendingImmediate 테스트

#### 3.1 Early Return 케이스

**3.1.1 pendingTextNodeId 없음**
- **시나리오**: `pendingTextNodeId === null`
- **기대**: early return
- **검증**: `executeTransaction` 호출 안 됨

**3.1.2 조합 중**
- **시나리오**: `isComposing === true`
- **기대**: early return
- **검증**: `executeTransaction` 호출 안 됨

**3.1.3 Model Node 없음**
- **시나리오**: `dataStore.getNode(nodeId)`가 `null` 반환
- **기대**: early return (경고 로그)
- **검증**: `executeTransaction` 호출 안 됨

**3.1.4 inline-text 노드 없음**
- **시나리오**: `document.querySelector`가 `null` 반환
- **기대**: 기본 방식으로 트랜잭션 실행 (oldText/newText 사용)
- **검증**: `executeTransaction` 호출, `text: newText` 확인

**3.1.5 Text Node 없음**
- **시나리오**: TreeWalker로 text node를 찾을 수 없음
- **기대**: 기본 방식으로 트랜잭션 실행
- **검증**: `executeTransaction` 호출, `text: newText` 확인

**3.1.6 handleEfficientEdit가 null 반환**
- **시나리오**: `handleEfficientEdit`가 `null` 반환
- **기대**: early return
- **검증**: `executeTransaction` 호출 안 됨

#### 3.2 정상 처리 케이스

**3.2.1 정상 커밋**
- **시나리오**: 모든 조건이 충족된 경우
- **기대**: `handleEfficientEdit` 결과로 트랜잭션 실행
- **검증**: 
  - `executeTransaction` 호출
  - `text: editResult.newText` 확인
  - `clearPending()` 호출 확인

**3.2.2 Marks 변경 포함**
- **시나리오**: `marksChanged === true`
- **기대**: 트랜잭션에 `marks` 필드 포함
- **검증**: `marks` 필드 확인

**3.2.3 Decorators 변경 포함**
- **시나리오**: `decoratorsChanged === true`
- **기대**: `updateDecorators` 호출
- **검증**: `updateDecorators` 호출 확인

**3.2.4 clearPending 호출**
- **시나리오**: `finally` 블록에서 `clearPending()` 호출
- **기대**: pending 상태 초기화
- **검증**: `pendingTextNodeId`, `pendingOldText`, `pendingNewText`, `pendingTimer` 모두 초기화

---

### 4. resolveModelTextNodeId 테스트

#### 4.1 Text Node 처리

**4.1.1 Text Node에서 nodeId 추출**
- **시나리오**: `target.nodeType === Node.TEXT_NODE`
- **기대**: `parentElement.closest('[data-bc-sid]')`로 nodeId 찾기
- **검증**: 올바른 nodeId 반환

**4.1.2 Text Node의 parentElement가 null**
- **시나리오**: `target.parentElement === null`
- **기대**: `editor:input.unresolved_text_node` 이벤트 발생, `null` 반환
- **검증**: `null` 반환 확인

#### 4.2 Element Node 처리

**4.2.1 Element Node에서 nodeId 추출**
- **시나리오**: `target.nodeType === Node.ELEMENT_NODE`
- **기대**: `target.closest('[data-bc-sid]')`로 nodeId 찾기
- **검증**: 올바른 nodeId 반환

**4.2.2 Element Node에서 nodeId 없음**
- **시나리오**: `closest('[data-bc-sid]')`가 `null` 반환
- **기대**: `editor:input.unresolved_text_node` 이벤트 발생, `null` 반환
- **검증**: `null` 반환 확인

#### 4.3 기타 Node 타입

**4.3.1 기타 Node 타입**
- **시나리오**: `target.nodeType`이 TEXT_NODE나 ELEMENT_NODE가 아님
- **기대**: `editor:input.unresolved_text_node` 이벤트 발생, `null` 반환
- **검증**: `null` 반환 확인

---

### 5. handleBeforeInput 테스트

#### 5.1 Format 명령 처리

**5.1.1 formatBold**
- **시나리오**: `inputType === 'formatBold'`
- **기대**: `event.preventDefault()`, `editor:command.execute` 이벤트 발생, `command: 'bold.toggle'`
- **검증**: `preventDefault` 호출 확인, 이벤트 확인

**5.1.2 formatItalic**
- **시나리오**: `inputType === 'formatItalic'`
- **기대**: `event.preventDefault()`, `command: 'italic.toggle'`
- **검증**: 이벤트 확인

**5.1.3 기타 format 명령들**
- **시나리오**: `formatUnderline`, `formatStrikeThrough`, `formatSuperscript`, `formatSubscript`, `formatJustifyFull`, `formatJustifyCenter`, `formatJustifyRight`, `formatJustifyLeft`, `formatIndent`, `formatOutdent`, `formatRemove`
- **기대**: 각각 올바른 command로 이벤트 발생
- **검증**: 각 명령에 대한 이벤트 확인

#### 5.2 Structural 명령 처리

**5.2.1 insertParagraph**
- **시나리오**: `inputType === 'insertParagraph'`
- **기대**: `event.preventDefault()`, `command: 'paragraph.insert'`
- **검증**: 이벤트 확인

**5.2.2 기타 structural 명령들**
- **시나리오**: `insertOrderedList`, `insertUnorderedList`, `insertHorizontalRule`, `insertLineBreak`
- **기대**: 각각 올바른 command로 이벤트 발생
- **검증**: 각 명령에 대한 이벤트 확인

#### 5.3 일반 입력 처리

**5.3.1 일반 입력 (preventDefault 안 함)**
- **시나리오**: `inputType`이 format/structural이 아님
- **기대**: `preventDefault` 호출 안 됨, `false` 반환
- **검증**: `preventDefault` 호출 안 됨, `false` 반환 확인

---

### 6. getCurrentSelection 테스트

#### 6.1 Selection 없음

**6.1.1 Selection이 null**
- **시나리오**: `window.getSelection()`이 `null` 반환
- **기대**: `{ offset: 0, length: 0 }` 반환
- **검증**: 반환값 확인

**6.1.2 rangeCount가 0**
- **시나리오**: `selection.rangeCount === 0`
- **기대**: `{ offset: 0, length: 0 }` 반환
- **검증**: 반환값 확인

#### 6.2 Text Node Selection

**6.2.1 Collapsed Selection (Text Node)**
- **시나리오**: `startContainer.nodeType === Node.TEXT_NODE`, `collapsed === true`
- **기대**: `{ offset: startOffset, length: 0 }` 반환
- **검증**: 반환값 확인

**6.2.2 Range Selection (Text Node)**
- **시나리오**: `startContainer.nodeType === Node.TEXT_NODE`, `collapsed === false`
- **기대**: `{ offset: startOffset, length: endOffset - startOffset }` 반환
- **검증**: 반환값 확인

#### 6.3 Element Node Selection

**6.3.1 Collapsed Selection (Element Node)**
- **시나리오**: `startContainer.nodeType === Node.ELEMENT_NODE`, `collapsed === true`
- **기대**: 텍스트 자식들을 순회하여 offset 계산
- **검증**: 올바른 offset 계산 확인

**6.3.2 Range Selection (Element Node, 같은 컨테이너)**
- **시나리오**: `startContainer === endContainer`, Element Node
- **기대**: `length = endOffset - startOffset`
- **검증**: 반환값 확인

**6.3.3 Range Selection (Element Node, 다른 컨테이너)**
- **시나리오**: `startContainer !== endContainer`, Element Node
- **기대**: 복잡한 계산 (간단히 처리)
- **검증**: 반환값 확인

#### 6.4 기타 Node 타입

**6.4.1 기타 Node 타입**
- **시나리오**: `startContainer.nodeType`이 TEXT_NODE나 ELEMENT_NODE가 아님
- **기대**: `{ offset: 0, length: 0 }` 반환
- **검증**: 반환값 확인

---

### 7. marksChangedEfficient 테스트

#### 7.1 변경 없음

**7.1.1 동일한 marks**
- **시나리오**: `oldMarks`와 `newMarks`가 동일
- **기대**: `false` 반환
- **검증**: 반환값 확인

#### 7.2 변경 있음

**7.2.1 길이 다름**
- **시나리오**: `oldMarks.length !== newMarks.length`
- **기대**: `true` 반환
- **검증**: 반환값 확인

**7.2.2 type 다름**
- **시나리오**: 같은 인덱스의 mark의 `type`이 다름
- **기대**: `true` 반환
- **검증**: 반환값 확인

**7.2.3 range 다름**
- **시나리오**: 같은 인덱스의 mark의 `range`가 다름
- **기대**: `true` 반환
- **검증**: 반환값 확인

---

### 8. handleInput 테스트

#### 8.1 이벤트 발생

**8.1.1 input 이벤트 처리**
- **시나리오**: `handleInput(event)` 호출
- **기대**: `editor:input.detected` 이벤트 발생
- **검증**: 이벤트 데이터 확인 (`inputType`, `data`, `target`)

---

### 9. Constructor 및 이벤트 리스너 테스트

#### 9.1 Constructor

**9.1.1 초기화**
- **시나리오**: `new InputHandlerImpl(editor)` 호출
- **기대**: `editor:selection.dom.applied` 이벤트 리스너 등록
- **검증**: 이벤트 리스너 등록 확인

**9.1.2 activeTextNodeId 설정**
- **시나리오**: `editor:selection.dom.applied` 이벤트 발생
- **기대**: `activeTextNodeId` 설정
- **검증**: `activeTextNodeId` 값 확인

---

## 테스트 구조

### Mock 객체

1. **Editor Mock**
   - `emit` 메서드 (이벤트 발생 추적)
   - `executeTransaction` 메서드 (트랜잭션 실행 추적)
   - `dataStore.getNode` 메서드 (모델 노드 반환)
   - `getDecorators` 메서드 (decorators 반환)
   - `updateDecorators` 메서드 (decorators 업데이트)

2. **DOM Mock**
   - `window.getSelection()` Mock
   - `document.querySelector` Mock
   - `document.createTreeWalker` Mock

3. **handleEfficientEdit Mock**
   - `vi.mock`로 모킹
   - 다양한 반환값 시뮬레이션

### 테스트 파일 구조

```
test/event-handlers/
  input-handler.test.ts
    - describe('InputHandlerImpl')
      - describe('constructor')
      - describe('handleTextContentChange')
        - describe('Early Return Cases')
        - describe('Normal Processing')
        - describe('Complex Scenarios')
      - describe('IME Composition')
        - describe('handleCompositionStart')
        - describe('handleCompositionUpdate')
        - describe('handleCompositionEnd')
        - describe('Composition Flow')
      - describe('commitPendingImmediate')
        - describe('Early Return Cases')
        - describe('Normal Processing')
      - describe('resolveModelTextNodeId')
      - describe('handleBeforeInput')
        - describe('Format Commands')
        - describe('Structural Commands')
        - describe('Normal Input')
      - describe('getCurrentSelection')
      - describe('marksChangedEfficient')
      - describe('handleInput')
```

---

## 우선순위

### 높은 우선순위 (핵심 기능)
1. ✅ `handleTextContentChange` - Early Return 케이스
2. ✅ `handleTextContentChange` - 정상 처리 케이스
3. ✅ IME 조합 처리 (전체 플로우)
4. ✅ `commitPendingImmediate` - 정상 처리
5. ✅ `resolveModelTextNodeId` - 기본 케이스

### 중간 우선순위 (실제 사용 시나리오)
6. ✅ `handleTextContentChange` - 복잡한 시나리오 (Mark/Decorator)
7. ✅ `commitPendingImmediate` - Early Return 케이스
8. ✅ `handleBeforeInput` - Format/Structural 명령
9. ✅ `getCurrentSelection` - 다양한 Selection 케이스

### 낮은 우선순위 (Edge Cases)
10. ✅ `marksChangedEfficient` - 유틸 함수
11. ✅ `handleInput` - 이벤트 발생
12. ✅ Constructor 이벤트 리스너

---

## 테스트 작성 시 주의사항

1. **Mock 설정**: `handleEfficientEdit`는 이미 테스트된 함수이므로 Mock으로 처리
2. **이벤트 추적**: `editor.emit` 호출을 spy로 추적
3. **비동기 처리**: `pendingTimer`는 `vi.useFakeTimers()` 사용
4. **DOM 구조**: 실제 DOM 구조를 생성하여 테스트
5. **상태 관리**: `isComposing`, `activeTextNodeId`, `pending*` 상태 확인

---

## 예상 테스트 개수

- 총 약 **80-100개** 테스트 케이스
- 핵심 기능: 약 40개
- 실제 사용 시나리오: 약 30개
- Edge Cases: 약 20개

