# 편집 행위 (Editing Operations) 문서

## 개요

이 문서는 contenteditable 기반 에디터에서 처리해야 하는 모든 편집 행위를 나열하고, 각 행위에 대한 처리 전략과 모델 업데이트 방법을 정리합니다.

## 편집 행위 분류

### 1. 텍스트 입력 (Text Input)

#### 1.1 일반 텍스트 입력
- **이벤트**: `input` (InputEvent)
- **MutationObserver**: `characterData` 변경 감지
- **현재 처리 방식**:
  - MutationObserver가 DOM 변경 감지
  - `handleTextContentChange`에서 `handleEfficientEdit` 호출
  - 모델 텍스트와 DOM 텍스트 비교하여 차이만 업데이트
  - Marks/Decorators 범위 자동 조정
- **모델 업데이트 전략**:
  - `dataStore.updateNode`로 텍스트 업데이트
  - `dataStore.marks.setMarks`로 Marks 범위 조정
  - `editor:content.change` 이벤트 발생

#### 1.2 IME 입력 (한글, 일본어 등)
- **이벤트**: `compositionstart`, `compositionupdate`, `compositionend`
- **MutationObserver**: 조합 중에도 DOM 변경 감지
- **현재 처리 방식**:
  - `isComposing` 플래그로 조합 상태 추적
  - 조합 중 변경사항을 `pendingTextNodeId`에 저장
  - 100ms 디바운싱으로 `commitPendingImmediate` 호출
  - `compositionend`에서 즉시 커밋
- **모델 업데이트 전략**:
  - 조합 중에도 실시간 모델 업데이트 (디바운싱 적용)
  - DOM에서 직접 텍스트 재구성하여 모델과 비교
  - 일반 텍스트 입력과 동일한 업데이트 로직 사용

### 2. 삭제 (Deletion)

#### 2.1 Backspace
- **이벤트**: `keydown` (key === 'Backspace')
- **현재 처리 방식**:
  - 브라우저 기본 동작 허용
  - MutationObserver가 DOM 변경 감지
  - 일반 텍스트 입력과 동일하게 처리
- **모델 업데이트 전략**:
  - MutationObserver 변경 감지 후 `handleTextContentChange` 호출
  - 텍스트 차이 분석하여 삭제된 부분만 모델에서 제거
  - Marks 범위 자동 조정

#### 2.2 Delete
- **이벤트**: `keydown` (key === 'Delete')
- **현재 처리 방식**:
  - 브라우저 기본 동작 허용
  - MutationObserver가 DOM 변경 감지
  - Backspace와 동일하게 처리
- **모델 업데이트 전략**:
  - Backspace와 동일

#### 2.3 선택 영역 삭제
- **이벤트**: `keydown` (Backspace/Delete + selection)
- **현재 처리 방식**:
  - 브라우저가 선택 영역 삭제
  - MutationObserver가 DOM 변경 감지
- **모델 업데이트 전략**:
  - 삭제된 텍스트 범위 계산
  - 여러 노드에 걸친 경우 각 노드별로 업데이트
  - Marks 범위 조정

### 3. 줄바꿈 (Line Break)

#### 3.1 Enter 키
- **이벤트**: `keydown` (key === 'Enter')
- **현재 처리 방식**: 미구현
- **필요한 처리**:
  - 새 paragraph 노드 생성
  - 현재 paragraph를 커서 위치에서 분할
  - 커서를 새 paragraph로 이동
- **모델 업데이트 전략**:
  - `dataStore.insertNode`로 새 paragraph 삽입
  - 현재 paragraph의 텍스트를 분할하여 새 paragraph에 할당
  - `editor:content.change` 이벤트 발생

#### 3.2 Shift+Enter (soft break)
- **이벤트**: `keydown` (key === 'Enter' + shiftKey)
- **현재 처리 방식**: 미구현
- **필요한 처리**:
  - `<br>` 태그 삽입 또는 line-break 노드 생성
- **모델 업데이트 전략**:
  - inline-text 노드 내에 line-break 마커 삽입
  - 또는 별도 line-break 노드 생성

### 4. 복사/붙여넣기 (Copy/Paste)

#### 4.1 복사 (Copy)
- **이벤트**: `copy` (ClipboardEvent)
- **현재 처리 방식**: 미구현
- **필요한 처리**:
  - 선택된 영역을 모델에서 추출
  - HTML/텍스트 형식으로 클립보드에 저장
  - 커스텀 데이터 형식 포함 (marks, decorators 등)
- **모델 업데이트 전략**:
  - 모델에서 선택된 노드들을 직렬화
  - HTML 형식으로 변환
  - 클립보드 API로 저장

#### 4.2 붙여넣기 (Paste)
- **이벤트**: `paste` (ClipboardEvent)
- **현재 처리 방식**: 미구현
- **필요한 처리**:
  - 클립보드 데이터 파싱 (HTML/텍스트)
  - 모델 형식으로 변환
  - 커서 위치에 삽입
  - Marks/Decorators 적용
- **모델 업데이트 전략**:
  - HTML 파싱하여 모델 노드 트리 생성
  - `dataStore.insertNode`로 노드 삽입
  - 기존 Marks 유지 또는 새 Marks 적용
  - `editor:content.change` 이벤트 발생

#### 4.3 잘라내기 (Cut)
- **이벤트**: `cut` (ClipboardEvent)
- **현재 처리 방식**: 미구현
- **필요한 처리**:
  - 복사 + 삭제 조합
  - 선택된 영역을 클립보드에 저장
  - 선택된 영역 삭제
- **모델 업데이트 전략**:
  - 복사 로직 실행
  - 삭제 로직 실행

### 5. 선택 (Selection)

#### 5.1 마우스 드래그 선택
- **이벤트**: `mousedown`, `mousemove`, `mouseup`
- **현재 처리 방식**:
  - 브라우저 기본 동작 사용
  - `selectionchange` 이벤트로 선택 변경 감지
  - `DOMSelectionHandler`에서 모델 selection으로 변환
- **모델 업데이트 전략**:
  - DOM Selection을 모델 좌표로 변환
  - `editor.updateSelection` 호출
  - `editor:selection.change` 이벤트 발생

#### 5.2 키보드 선택 (Shift+Arrow, Shift+Home/End 등)
- **이벤트**: `keydown` (Shift + Arrow/Home/End/PageUp/PageDown)
- **현재 처리 방식**:
  - 브라우저 기본 동작 사용
  - `selectionchange` 이벤트로 선택 변경 감지
- **모델 업데이트 전략**:
  - 마우스 드래그 선택과 동일

#### 5.3 전체 선택 (Select All)
- **이벤트**: `keydown` (Ctrl/Cmd+A)
- **현재 처리 방식**: 미구현
- **필요한 처리**:
  - 문서 전체를 선택
  - `editor:selection.change` 이벤트 발생
- **모델 업데이트 전략**:
  - 루트 노드의 시작과 끝을 선택
  - `editor.updateSelection` 호출

### 6. 포맷팅 (Formatting)

#### 6.1 Bold (굵게)
- **이벤트**: `keydown` (Ctrl/Cmd+B) 또는 툴바 버튼
- **현재 처리 방식**:
  - `editor:command.execute` 이벤트로 처리
  - Bold mark 추가/제거
- **모델 업데이트 전략**:
  - 선택된 텍스트 범위에 `bold` mark 추가
  - `dataStore.marks.setMarks` 호출
  - `editor:content.change` 이벤트 발생

#### 6.2 Italic (기울임)
- **이벤트**: `keydown` (Ctrl/Cmd+I) 또는 툴바 버튼
- **현재 처리 방식**: Bold와 동일
- **모델 업데이트 전략**: Bold와 동일

#### 6.3 Underline (밑줄)
- **이벤트**: `keydown` (Ctrl/Cmd+U) 또는 툴바 버튼
- **현재 처리 방식**: 미구현
- **모델 업데이트 전략**: Bold와 동일

#### 6.4 기타 포맷팅
- StrikeThrough, Superscript, Subscript 등
- **모델 업데이트 전략**: 모두 Marks로 처리

### 7. 구조 변경 (Structural Changes)

#### 7.1 Heading 변환
- **이벤트**: `keydown` (Ctrl/Cmd+Alt+1/2/3) 또는 툴바
- **현재 처리 방식**:
  - `editor:command.execute` 이벤트로 처리
  - paragraph를 heading으로 변환
- **모델 업데이트 전략**:
  - 현재 노드의 `stype` 변경
  - `dataStore.updateNode`로 노드 타입 업데이트
  - `editor:content.change` 이벤트 발생

#### 7.2 List (목록)
- **이벤트**: `keydown` 또는 툴바
- **현재 처리 방식**: 미구현
- **필요한 처리**:
  - paragraph를 list-item으로 변환
  - list 노드 생성 및 list-item 추가
- **모델 업데이트 전략**:
  - 노드 타입 변경
  - 부모-자식 관계 재구성
  - `editor:content.change` 이벤트 발생

#### 7.3 Blockquote (인용)
- **이벤트**: 툴바
- **현재 처리 방식**: 미구현
- **모델 업데이트 전략**: Heading과 동일

### 8. Undo/Redo

#### 8.1 Undo
- **이벤트**: `keydown` (Ctrl/Cmd+Z)
- **현재 처리 방식**: 미구현
- **필요한 처리**:
  - 히스토리 스택에서 이전 상태 복원
  - 모델 전체를 이전 상태로 되돌림
- **모델 업데이트 전략**:
  - 히스토리 관리 시스템 필요
  - 각 편집 행위마다 스냅샷 저장
  - Undo 시 스냅샷 복원
  - `editor:content.change` 이벤트 발생

#### 8.2 Redo
- **이벤트**: `keydown` (Ctrl/Cmd+Shift+Z 또는 Ctrl/Cmd+Y)
- **현재 처리 방식**: 미구현
- **모델 업데이트 전략**: Undo와 동일 (반대 방향)

### 9. 드래그 앤 드롭 (Drag and Drop)

#### 9.1 텍스트 드래그
- **이벤트**: `dragstart`, `drag`, `dragend`, `drop`
- **현재 처리 방식**: 미구현
- **필요한 처리**:
  - 드래그 시작 시 선택된 텍스트 저장
  - 드롭 위치에 텍스트 삽입
  - 원본 위치에서 텍스트 삭제
- **모델 업데이트 전략**:
  - 드래그 시작: 선택된 노드들 추출
  - 드롭: 새 위치에 노드 삽입
  - 원본 위치에서 노드 삭제
  - `editor:content.change` 이벤트 발생

#### 9.2 외부 파일 드롭
- **이벤트**: `drop` (파일)
- **현재 처리 방식**: 미구현
- **필요한 처리**:
  - 파일 타입 확인 (이미지, 텍스트 등)
  - 이미지: image 노드 생성
  - 텍스트: 텍스트 노드로 변환
- **모델 업데이트 전략**:
  - 파일 타입에 따라 적절한 노드 생성
  - `dataStore.insertNode` 호출
  - `editor:content.change` 이벤트 발생

### 10. 기타 편집 행위

#### 10.1 탭 (Tab)
- **이벤트**: `keydown` (key === 'Tab')
- **현재 처리 방식**: 미구현
- **필요한 처리**:
  - 리스트에서 들여쓰기/내어쓰기
  - 또는 일반 텍스트로 탭 문자 삽입
- **모델 업데이트 전략**:
  - 리스트 컨텍스트: list-item 레벨 변경
  - 일반 텍스트: 탭 문자 삽입

#### 10.2 Home/End
- **이벤트**: `keydown` (key === 'Home'/'End')
- **현재 처리 방식**: 브라우저 기본 동작
- **필요한 처리**:
  - 커서를 줄의 시작/끝으로 이동
  - 모델 selection 업데이트

#### 10.3 PageUp/PageDown
- **이벤트**: `keydown` (key === 'PageUp'/'PageDown')
- **현재 처리 방식**: 브라우저 기본 동작
- **필요한 처리**:
  - 페이지 단위 스크롤 및 커서 이동
  - 모델 selection 업데이트

## 모델 업데이트 전략

### 공통 원칙

1. **DOM 우선 (DOM-First)**: 
   - 모든 편집 행위는 먼저 DOM에 반영됨
   - MutationObserver가 DOM 변경을 감지
   - DOM 변경을 모델로 동기화

2. **효율적인 업데이트**:
   - 전체 모델을 재구성하지 않음
   - 변경된 부분만 업데이트
   - `handleEfficientEdit`를 사용하여 텍스트 차이만 계산

3. **Marks 범위 자동 조정**:
   - 텍스트 삽입/삭제 시 Marks 범위 자동 조정
   - 커서 위치의 Marks 유지

4. **이벤트 기반**:
   - 모든 모델 변경은 `editor:content.change` 이벤트 발생
   - 렌더링은 이벤트 리스너에서 처리

### 업데이트 패턴

#### 패턴 1: 텍스트 변경 (입력, 삭제)
```typescript
1. MutationObserver 감지
2. handleTextContentChange 호출
3. handleEfficientEdit로 텍스트 차이 계산
4. dataStore.updateNode로 텍스트 업데이트
5. dataStore.marks.setMarks로 Marks 범위 조정
6. editor:content.change 이벤트 발생
```

#### 패턴 2: 구조 변경 (Enter, 포맷팅)
```typescript
1. keydown 이벤트 처리
2. editor:command.execute 이벤트 발생
3. Command Handler에서 모델 변경
4. dataStore.insertNode/updateNode/deleteNode 호출
5. editor:content.change 이벤트 발생
```

#### 패턴 3: 복사/붙여넣기
```typescript
1. paste 이벤트 처리
2. 클립보드 데이터 파싱
3. 모델 노드 트리 생성
4. dataStore.insertNode로 삽입
5. editor:content.change 이벤트 발생
```

## 구현 우선순위

### Phase 1: 기본 편집 (완료)
- ✅ 텍스트 입력 (일반, IME)
- ✅ Backspace/Delete
- ✅ 선택 (마우스, 키보드)

### Phase 2: 필수 편집 (진행 중)
- ✅ IME 컴포징 중 모델 업데이트 보장 (composing 체크 제거)
- ⬜ Enter (줄바꿈)
- ⬜ 복사/붙여넣기
- ⬜ 포맷팅 (Bold, Italic 등)

### Phase 3: 고급 편집
- ⬜ Undo/Redo
- ⬜ 드래그 앤 드롭
- ⬜ 리스트, Blockquote 등 구조 변경

### Phase 4: 최적화
- ⬜ 히스토리 관리 최적화
- ⬜ 대용량 문서 처리
- ⬜ 성능 최적화

## 참고사항

- 모든 편집 행위는 **비동기적으로** 처리됨
- MutationObserver는 **배치 처리**로 최적화 가능
- 모델 업데이트는 **트랜잭션 기반**으로 처리 (향후 구현)
- 렌더링은 **diff 알고리즘**으로 최적화됨

