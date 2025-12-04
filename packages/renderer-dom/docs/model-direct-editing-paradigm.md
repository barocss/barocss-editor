# 모델 직접 편집 패러다임: ContentEditable 없는 리치 텍스트 에디터 설계

## Abstract

본 논문은 ContentEditable 기반 리치 텍스트 에디터의 근본적인 한계를 분석하고, **모델 직접 편집(Model-Direct Editing) 패러다임**을 제안합니다. 기존 에디터들은 ContentEditable의 Selection/Cursor 핸들링 어려움을 해결하기 위해 복잡한 보완 메커니즘(Text Node Pool, Selection 복원 등)을 도입하지만, 이는 근본적인 해결책이 아닙니다.

본 논문은 **ContentEditable을 완전히 제거**하고, AI가 모델을 직접 변경하듯이 **사용자 입력을 모델 변경으로 직접 변환**하는 새로운 편집 인터페이스를 제안합니다. 이는 키보드/마우스 입력을 ContentEditable을 거치지 않고 모델 변경 이벤트로 변환하여, Selection/Cursor 관리의 복잡성을 근본적으로 제거합니다.

**Keywords**: Model-Direct Editing, ContentEditable Alternative, Rich Text Editor, Selection Management, Cursor Handling, Direct Manipulation

---

## 1. Introduction

### 1.1 ContentEditable의 근본적인 문제

ContentEditable 기반 리치 텍스트 에디터는 다음과 같은 근본적인 문제에 직면합니다:

1. **Selection/Cursor 핸들링의 복잡성**
   - 브라우저 Selection API는 DOM Node에 대한 직접 참조를 유지
   - DOM 변경 시 Selection이 깨지기 쉬움
   - 복잡한 보완 메커니즘(Text Node Pool, Selection 복원 등) 필요

2. **이중 상태 관리**
   - DOM 상태와 모델 상태를 동기화해야 함
   - MutationObserver를 통한 DOM → 모델 변환
   - 모델 → DOM 렌더링
   - 동기화 실패 시 버그 발생

3. **IME(Input Method Editor) 호환성**
   - 한글, 일본어 등 조합형 입력의 복잡한 처리
   - Composition 이벤트와 DOM 변경의 타이밍 이슈
   - 브라우저마다 다른 동작

4. **접근성(Accessibility) 문제**
   - 스크린 리더와의 호환성
   - 키보드 네비게이션
   - 복잡한 DOM 구조에서의 접근성 저하

### 1.2 기존 해결 방안의 한계

기존 에디터들은 ContentEditable의 문제를 해결하기 위해 다양한 보완 메커니즘을 도입했습니다:

- **Text Node Pool**: Selection이 있는 Text Node를 보존하여 Selection 안정성 확보
- **Selection 복원**: DOM 업데이트 후 Selection을 복원
- **MutationObserver**: DOM 변경을 감지하여 모델 동기화
- **Per-Character Rendering**: 각 문자를 별도 DOM 요소로 렌더링하여 Selection 안정성 향상

하지만 이러한 접근법들은 모두 **ContentEditable의 근본적인 문제를 우회하는 것**일 뿐, 근본적인 해결책이 아닙니다.

### 1.3 새로운 관점: 사람 vs AI의 편집 방식

**AI의 편집 방식**:
- ContentEditable을 사용하지 않음
- 모델을 직접 변경 (insert, delete, update)
- Selection/Cursor는 모델의 offset으로 표현
- DOM은 단순히 모델의 렌더링 결과

**사람의 편집 방식 (현재)**:
- ContentEditable을 통해 키보드/마우스 입력을 받음
- 브라우저가 DOM을 직접 변경
- MutationObserver가 DOM 변경을 감지하여 모델 동기화
- Selection/Cursor는 브라우저 Selection API에 의존

**핵심 질문**: 사람도 AI처럼 모델을 직접 편집할 수 있다면?

---

## 2. Problem Statement

### 2.1 ContentEditable이 필요한 이유

ContentEditable을 사용하는 이유는 **사용자가 키보드/마우스로 직접 텍스트를 입력하고 편집할 수 있게 하기 위함**입니다. 하지만 이것이 ContentEditable을 사용해야 하는 **유일한 이유**는 아닙니다.

### 2.2 ContentEditable의 실제 역할

ContentEditable은 다음과 같은 역할을 합니다:

1. **키보드 입력 수신**: 사용자가 키를 누르면 브라우저가 DOM에 텍스트를 삽입
2. **마우스 클릭 처리**: 클릭 위치에 커서를 배치
3. **텍스트 선택**: 드래그로 텍스트 범위 선택
4. **IME 입력**: 조합형 입력 처리

하지만 이러한 기능들은 모두 **ContentEditable 없이도 구현 가능**합니다:

- **키보드 입력**: `keydown`, `keypress`, `input` 이벤트로 수신 가능
- **마우스 클릭**: `click`, `mousedown` 이벤트로 위치 계산 가능
- **텍스트 선택**: `mousedown`, `mousemove`, `mouseup` 이벤트로 구현 가능
- **IME 입력**: `compositionstart`, `compositionupdate`, `compositionend` 이벤트로 처리 가능

### 2.3 ContentEditable의 진짜 문제

ContentEditable의 진짜 문제는 **브라우저가 DOM을 직접 변경**한다는 것입니다:

1. 사용자가 키를 누름
2. 브라우저가 DOM에 텍스트를 삽입
3. 에디터가 MutationObserver로 DOM 변경을 감지
4. 에디터가 모델을 업데이트
5. 에디터가 DOM을 다시 렌더링

이 과정에서 **이중 상태 관리**와 **동기화 문제**가 발생합니다.

---

## 3. Proposed Solution: Model-Direct Editing Paradigm

### 3.1 핵심 아이디어

**ContentEditable을 완전히 제거**하고, **사용자 입력을 모델 변경으로 직접 변환**합니다:

1. 사용자가 키를 누름
2. 에디터가 입력 이벤트를 받음
3. 에디터가 **모델을 직접 변경** (insert, delete, update)
4. 에디터가 DOM을 렌더링 (단방향 데이터 흐름)

이렇게 하면:
- **Selection/Cursor는 모델의 offset으로 관리** (브라우저 Selection API 불필요)
- **DOM은 모델의 렌더링 결과** (단방향 데이터 흐름)
- **동기화 문제 제거** (단일 소스 of truth)

### 3.2 AI vs 사람의 편집 방식 통합

**AI의 편집 방식**:
```typescript
// AI는 모델을 직접 변경
editor.insertText(modelOffset, "Hello");
editor.deleteText(modelOffset, 5);
editor.applyMark(modelOffset, 5, "bold");
```

**사람의 편집 방식 (제안)**:
```typescript
// 사람도 모델을 직접 변경 (키보드 입력을 모델 변경으로 변환)
handleKeydown(event: KeyboardEvent) {
  const modelOffset = this.getCursorOffset(); // 모델의 offset
  if (event.key === 'a') {
    this.editor.insertText(modelOffset, 'a'); // 모델 직접 변경
  }
}
```

**차이점**: AI는 프로그래밍 방식으로 모델을 변경하고, 사람은 키보드/마우스 입력을 모델 변경으로 변환합니다.

### 3.3 ContentEditable 없는 편집 인터페이스

```typescript
class ModelDirectEditor {
  private model: Model;
  private cursorOffset: number = 0; // 모델의 offset
  
  // ContentEditable 없이 키보드 입력 처리
  handleKeydown(event: KeyboardEvent): void {
    event.preventDefault(); // 브라우저 기본 동작 방지
    
    if (event.key.length === 1) {
      // 일반 문자 입력
      this.model.insertText(this.cursorOffset, event.key);
      this.cursorOffset += event.key.length;
    } else if (event.key === 'Backspace') {
      // 백스페이스
      if (this.cursorOffset > 0) {
        this.model.deleteText(this.cursorOffset - 1, 1);
        this.cursorOffset -= 1;
      }
    } else if (event.key === 'ArrowLeft') {
      // 왼쪽 화살표
      this.cursorOffset = Math.max(0, this.cursorOffset - 1);
    } else if (event.key === 'ArrowRight') {
      // 오른쪽 화살표
      this.cursorOffset = Math.min(this.model.getLength(), this.cursorOffset + 1);
    }
    
    // 모델 변경 후 DOM 렌더링
    this.render();
    // 커서 위치 업데이트
    this.updateCursor();
  }
  
  // ContentEditable 없이 마우스 클릭 처리
  handleClick(event: MouseEvent): void {
    const domOffset = this.getOffsetFromPoint(event.clientX, event.clientY);
    const modelOffset = this.convertDOMOffsetToModel(domOffset);
    this.cursorOffset = modelOffset;
    this.updateCursor();
  }
  
  // ContentEditable 없이 텍스트 선택 처리
  handleMouseDown(event: MouseEvent): void {
    this.selectionStart = this.getOffsetFromPoint(event.clientX, event.clientY);
  }
  
  handleMouseMove(event: MouseEvent): void {
    if (this.selectionStart !== null) {
      const selectionEnd = this.getOffsetFromPoint(event.clientX, event.clientY);
      this.selectionRange = { start: this.selectionStart, end: selectionEnd };
      this.renderSelection();
    }
  }
  
  handleMouseUp(event: MouseEvent): void {
    // 선택 완료
  }
  
  // IME 입력 처리
  handleCompositionStart(event: CompositionEvent): void {
    this.isComposing = true;
    this.compositionText = '';
  }
  
  handleCompositionUpdate(event: CompositionEvent): void {
    this.compositionText = event.data;
    // 조합 중인 텍스트를 임시로 표시
    this.renderComposition();
  }
  
  handleCompositionEnd(event: CompositionEvent): void {
    this.isComposing = false;
    // 조합 완료된 텍스트를 모델에 삽입
    this.model.insertText(this.cursorOffset, event.data);
    this.cursorOffset += event.data.length;
    this.render();
  }
  
  // 커서 위치 업데이트 (DOM에 커서 표시)
  updateCursor(): void {
    const cursorElement = this.getCursorElement();
    const position = this.getCursorPosition(this.cursorOffset);
    cursorElement.style.left = `${position.x}px`;
    cursorElement.style.top = `${position.y}px`;
  }
}
```

### 3.4 모델 기반 Selection/Cursor 관리

```typescript
interface ModelSelection {
  anchor: number;  // 모델의 offset
  focus: number;   // 모델의 offset
}

class ModelDirectEditor {
  private selection: ModelSelection | null = null;
  private cursorOffset: number = 0;
  
  // Selection은 모델의 offset으로 관리
  getSelection(): ModelSelection | null {
    return this.selection;
  }
  
  setSelection(anchor: number, focus: number): void {
    this.selection = { anchor, focus };
    this.renderSelection();
  }
  
  // Cursor는 모델의 offset으로 관리
  getCursorOffset(): number {
    return this.cursorOffset;
  }
  
  setCursorOffset(offset: number): void {
    this.cursorOffset = offset;
    this.updateCursor();
  }
  
  // DOM에 Selection 표시
  renderSelection(): void {
    if (!this.selection) return;
    
    // 모델의 offset을 DOM 위치로 변환
    const startPos = this.getDOMPosition(this.selection.anchor);
    const endPos = this.getDOMPosition(this.selection.focus);
    
    // Selection을 시각적으로 표시
    this.highlightSelection(startPos, endPos);
  }
  
  // DOM에 Cursor 표시
  updateCursor(): void {
    const position = this.getDOMPosition(this.cursorOffset);
    this.cursorElement.style.left = `${position.x}px`;
    this.cursorElement.style.top = `${position.y}px`;
  }
}
```

---

## 4. Implementation Strategy

### 4.1 키보드 입력 처리

```typescript
class ModelDirectEditor {
  private container: HTMLElement;
  
  setup(): void {
    // ContentEditable 없이 키보드 이벤트 수신
    this.container.addEventListener('keydown', (e) => this.handleKeydown(e));
    this.container.setAttribute('tabindex', '0'); // 포커스 가능하게 설정
  }
  
  handleKeydown(event: KeyboardEvent): void {
    // 브라우저 기본 동작 방지 (ContentEditable이 없으므로)
    event.preventDefault();
    
    const key = event.key;
    const modelOffset = this.cursorOffset;
    
    if (key.length === 1 && !event.ctrlKey && !event.metaKey) {
      // 일반 문자 입력
      this.model.insertText(modelOffset, key);
      this.cursorOffset += key.length;
    } else if (key === 'Backspace') {
      // 백스페이스
      if (modelOffset > 0) {
        this.model.deleteText(modelOffset - 1, 1);
        this.cursorOffset -= 1;
      }
    } else if (key === 'Delete') {
      // Delete 키
      if (modelOffset < this.model.getLength()) {
        this.model.deleteText(modelOffset, 1);
      }
    } else if (key === 'ArrowLeft') {
      // 왼쪽 화살표
      this.cursorOffset = Math.max(0, modelOffset - 1);
    } else if (key === 'ArrowRight') {
      // 오른쪽 화살표
      this.cursorOffset = Math.min(this.model.getLength(), modelOffset + 1);
    } else if (key === 'ArrowUp') {
      // 위쪽 화살표 (라인 이동)
      this.cursorOffset = this.moveCursorUp(modelOffset);
    } else if (key === 'ArrowDown') {
      // 아래쪽 화살표 (라인 이동)
      this.cursorOffset = this.moveCursorDown(modelOffset);
    } else if (key === 'Enter') {
      // Enter 키 (줄바꿈)
      this.model.insertText(modelOffset, '\n');
      this.cursorOffset += 1;
    }
    
    // 모델 변경 후 렌더링
    this.render();
    this.updateCursor();
  }
}
```

### 4.2 마우스 입력 처리

```typescript
class ModelDirectEditor {
  private isSelecting: boolean = false;
  private selectionStart: number | null = null;
  
  setup(): void {
    this.container.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.container.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.container.addEventListener('mouseup', (e) => this.handleMouseUp(e));
  }
  
  handleMouseDown(event: MouseEvent): void {
    // 클릭 위치의 모델 offset 계산
    const modelOffset = this.getModelOffsetFromPoint(event.clientX, event.clientY);
    
    if (event.shiftKey && this.selection) {
      // Shift + 클릭: Selection 확장
      this.setSelection(this.selection.anchor, modelOffset);
    } else {
      // 일반 클릭: Cursor 이동
      this.cursorOffset = modelOffset;
      this.selection = null;
      this.isSelecting = true;
      this.selectionStart = modelOffset;
    }
    
    this.updateCursor();
    this.renderSelection();
  }
  
  handleMouseMove(event: MouseEvent): void {
    if (this.isSelecting && this.selectionStart !== null) {
      // 드래그 중: Selection 업데이트
      const modelOffset = this.getModelOffsetFromPoint(event.clientX, event.clientY);
      this.setSelection(this.selectionStart, modelOffset);
    }
  }
  
  handleMouseUp(event: MouseEvent): void {
    this.isSelecting = false;
  }
  
  // DOM 좌표를 모델 offset으로 변환
  getModelOffsetFromPoint(x: number, y: number): number {
    // DOM에서 가장 가까운 텍스트 위치 찾기
    const range = document.caretRangeFromPoint(x, y);
    if (!range) return 0;
    
    // DOM 위치를 모델 offset으로 변환
    return this.convertDOMPositionToModel(range.startContainer, range.startOffset);
  }
}
```

### 4.3 IME 입력 처리

```typescript
class ModelDirectEditor {
  private isComposing: boolean = false;
  private compositionText: string = '';
  private compositionOffset: number = 0;
  
  setup(): void {
    this.container.addEventListener('compositionstart', (e) => this.handleCompositionStart(e));
    this.container.addEventListener('compositionupdate', (e) => this.handleCompositionUpdate(e));
    this.container.addEventListener('compositionend', (e) => this.handleCompositionEnd(e));
  }
  
  handleCompositionStart(event: CompositionEvent): void {
    this.isComposing = true;
    this.compositionText = '';
    this.compositionOffset = this.cursorOffset;
    
    // 조합 중인 텍스트를 임시로 표시할 위치 저장
  }
  
  handleCompositionUpdate(event: CompositionEvent): void {
    this.compositionText = event.data;
    
    // 조합 중인 텍스트를 임시로 렌더링
    this.renderComposition(this.compositionOffset, this.compositionText);
  }
  
  handleCompositionEnd(event: CompositionEvent): void {
    this.isComposing = false;
    
    // 조합 완료된 텍스트를 모델에 삽입
    if (this.compositionText) {
      this.model.insertText(this.compositionOffset, this.compositionText);
      this.cursorOffset = this.compositionOffset + this.compositionText.length;
    }
    
    // 조합 텍스트 제거 및 정상 렌더링
    this.clearComposition();
    this.render();
    this.updateCursor();
  }
  
  // 조합 중인 텍스트를 임시로 표시
  renderComposition(offset: number, text: string): void {
    // 조합 텍스트를 하이라이트하여 표시
    const compositionElement = this.createCompositionElement(text);
    const position = this.getDOMPosition(offset);
    compositionElement.style.position = 'absolute';
    compositionElement.style.left = `${position.x}px`;
    compositionElement.style.top = `${position.y}px`;
    this.container.appendChild(compositionElement);
  }
}
```

### 4.4 커서 및 Selection 시각화

```typescript
class ModelDirectEditor {
  private cursorElement: HTMLElement;
  private selectionOverlay: HTMLElement;
  
  setup(): void {
    // 커서 요소 생성
    this.cursorElement = document.createElement('div');
    this.cursorElement.className = 'editor-cursor';
    this.cursorElement.style.cssText = `
      position: absolute;
      width: 2px;
      height: 1.2em;
      background: #000;
      pointer-events: none;
      animation: blink 1s infinite;
    `;
    this.container.appendChild(this.cursorElement);
    
    // Selection 오버레이 생성
    this.selectionOverlay = document.createElement('div');
    this.selectionOverlay.className = 'editor-selection';
    this.selectionOverlay.style.cssText = `
      position: absolute;
      background: rgba(0, 0, 255, 0.2);
      pointer-events: none;
    `;
    this.container.appendChild(this.selectionOverlay);
  }
  
  // 커서 위치 업데이트
  updateCursor(): void {
    const position = this.getDOMPosition(this.cursorOffset);
    this.cursorElement.style.left = `${position.x}px`;
    this.cursorElement.style.top = `${position.y}px`;
    this.cursorElement.style.height = `${position.height}px`;
  }
  
  // Selection 표시
  renderSelection(): void {
    if (!this.selection) {
      this.selectionOverlay.style.display = 'none';
      return;
    }
    
    const startPos = this.getDOMPosition(this.selection.anchor);
    const endPos = this.getDOMPosition(this.selection.focus);
    
    // Selection 영역 계산
    if (startPos.y === endPos.y) {
      // 같은 라인
      this.selectionOverlay.style.left = `${startPos.x}px`;
      this.selectionOverlay.style.top = `${startPos.y}px`;
      this.selectionOverlay.style.width = `${endPos.x - startPos.x}px`;
      this.selectionOverlay.style.height = `${startPos.height}px`;
    } else {
      // 여러 라인 (복잡한 계산 필요)
      // ...
    }
    
    this.selectionOverlay.style.display = 'block';
  }
  
  // 모델 offset을 DOM 위치로 변환
  getDOMPosition(modelOffset: number): { x: number; y: number; height: number } {
    // 모델의 offset을 DOM의 텍스트 위치로 변환
    // 텍스트 레이아웃 정보를 사용하여 정확한 위치 계산
    const textNode = this.findTextNodeAtOffset(modelOffset);
    const offsetInNode = modelOffset - textNode.startOffset;
    
    // Range API를 사용하여 정확한 위치 계산
    const range = document.createRange();
    range.setStart(textNode.domNode, offsetInNode);
    range.setEnd(textNode.domNode, offsetInNode);
    
    const rect = range.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();
    
    return {
      x: rect.left - containerRect.left,
      y: rect.top - containerRect.top,
      height: rect.height
    };
  }
}
```

---

## 5. Advantages and Challenges

### 5.1 장점

#### 5.1.1 Selection/Cursor 관리의 단순화

- **모델 기반 관리**: Selection/Cursor가 모델의 offset으로 관리되어 복잡한 DOM 참조 불필요
- **브라우저 의존성 제거**: 브라우저 Selection API에 의존하지 않음
- **일관성 보장**: 모든 브라우저에서 동일한 동작

#### 5.1.2 단방향 데이터 흐름

- **단일 소스 of truth**: 모델이 유일한 상태 소스
- **동기화 문제 제거**: DOM과 모델 간 동기화 불필요
- **예측 가능한 동작**: 모델 변경 → DOM 렌더링의 단순한 흐름

#### 5.1.3 성능 향상

- **불필요한 DOM 조작 제거**: MutationObserver 불필요
- **최적화된 렌더링**: 모델 변경만 렌더링하면 됨
- **메모리 효율**: Text Node Pool 등 복잡한 메커니즘 불필요

#### 5.1.4 접근성 향상

- **완전한 제어**: 커서/Selection의 시각적 표현을 완전히 제어 가능
- **스크린 리더 호환**: ARIA 속성으로 접근성 향상 가능
- **키보드 네비게이션**: 모든 키보드 동작을 직접 구현 가능

### 5.2 도전 과제

#### 5.2.1 IME의 근본적인 한계 ⚠️

**가장 큰 문제**: ContentEditable 없이 IME를 완전히 구현하는 것은 **거의 불가능**합니다.

**IME가 제공하는 기능들**:
1. **조합 중인 텍스트의 시각적 표시**: 브라우저가 자동으로 처리
   - 한글 입력 시 "ㅎㅏㄴ" → "한" 조합 과정 표시
   - 일본어 입력 시 히라가나 → 한자 변환 과정 표시
   - 이는 OS 레벨의 IME 엔진과 브라우저가 협력하여 처리

2. **IME 후보 단어 선택 UI**: OS 레벨에서 제공
   - 한자 후보 목록
   - 단어 추천 목록
   - 이는 브라우저가 ContentEditable 요소에 대해 자동으로 표시

3. **커서 위치 자동 조정**: 브라우저가 조합 중인 텍스트 길이에 맞춰 자동 조정
   - 조합 중인 텍스트가 길어지면 커서가 자동으로 이동
   - 조합 취소 시 커서 위치 복원

4. **조합 취소/완료 처리**: 브라우저와 OS가 협력하여 처리
   - ESC 키로 조합 취소
   - Enter 키로 조합 완료

**문제점**:
- ContentEditable 없이는 이러한 기능들을 직접 구현할 수 없음
- Composition 이벤트만으로는 IME의 모든 기능을 재현 불가능
- OS 레벨의 IME UI와 통합 불가능
- 사용자 경험이 크게 저하됨

**결론**: IME 입력을 위해서는 **ContentEditable이 필수적**입니다.

#### 5.2.2 복잡한 구현

- **모든 입력 처리**: 키보드, 마우스, IME 등 모든 입력을 직접 처리해야 함
- **커서/Selection 시각화**: DOM 위치 계산 및 시각적 표현 구현 필요
- **텍스트 레이아웃**: 정확한 커서 위치 계산을 위한 레이아웃 정보 필요

#### 5.2.3 브라우저 호환성

- **텍스트 입력**: 일부 브라우저에서 특수 문자 입력 처리 어려움
- **접근성**: 스크린 리더와의 호환성 검증 필요

#### 5.2.3 사용자 경험

- **기존 습관**: 사용자가 ContentEditable에 익숙함
- **복사/붙여넣기**: 클립보드 API와의 통합 필요
- **드래그 앤 드롭**: 파일 드롭 등 추가 기능 구현 필요

### 5.3 하이브리드 접근법: IME만 ContentEditable 사용

IME의 한계를 고려할 때, **하이브리드 접근법**이 가장 현실적입니다. 하지만 **기술적 제약**이 있습니다:

#### 5.3.0 기술적 제약: IME만 ContentEditable 사용의 어려움 ⚠️

**문제점**:
1. **compositionstart는 이미 늦음**: `compositionstart` 이벤트가 발생할 때는 이미 IME가 시작된 후입니다. 이 시점에 포커스를 이동하는 것은 이미 늦을 수 있습니다.
2. **IME는 포커스된 요소에서 시작**: IME는 현재 포커스된 요소에서 시작됩니다. ContentEditable이 아닌 요소에서는 IME가 제대로 작동하지 않을 수 있습니다.
3. **IME UI 위치**: IME 후보 단어 선택 UI는 포커스된 ContentEditable 요소 근처에 표시됩니다. 숨겨진 요소에 포커스가 있으면 UI가 잘못된 위치에 표시될 수 있습니다.

**결론**: IME만 별도의 ContentEditable 요소에서 처리하는 것은 **기술적으로 어렵습니다**.

#### 5.3.1 현실적인 접근법: 메인 영역을 ContentEditable로 두되 일반 입력은 막기

가장 현실적인 방법은 **메인 편집 영역 자체를 ContentEditable로 두되, 일반 입력은 preventDefault로 막고 모델 직접 편집으로 처리**하는 것입니다:

```typescript
class HybridEditor {
  private container: HTMLElement;
  private isComposing: boolean = false;
  
  setup(): void {
    // 메인 편집 영역: ContentEditable 활성화 (IME를 위해 필요)
    this.container.contentEditable = 'true';
    
    // 일반 입력은 preventDefault로 막고 모델 직접 편집
    this.setupModelDirectEditing();
    
    // IME 입력은 ContentEditable에서 자연스럽게 처리
    this.setupIMEHandling();
  }
  
  setupModelDirectEditing(): void {
    // 일반 키보드 입력 처리
    this.container.addEventListener('keydown', (e) => {
      // IME 조합 중이면 ContentEditable에 맡김
      if (this.isComposing) {
        return; // ContentEditable이 처리하도록 함
      }
      
      // 일반 입력은 preventDefault로 막고 모델 직접 편집
      if (this.isNormalInput(e)) {
        e.preventDefault();
        this.handleKeydown(e);
      }
    });
    
    // input 이벤트는 무시 (모델 직접 편집으로 처리했으므로)
    this.container.addEventListener('input', (e) => {
      if (!this.isComposing) {
        e.preventDefault();
        // 이미 모델 직접 편집으로 처리했으므로 무시
      }
    });
  }
  
  setupIMEHandling(): void {
    // IME 조합 시작: ContentEditable이 처리하도록 함
    this.container.addEventListener('compositionstart', (e) => {
      this.isComposing = true;
      // ⚠️ 중요: IME 조합 중에는 DOM 변경을 막아야 함
      this.pauseRendering = true; // 렌더링 일시 중지
      // ContentEditable이 IME를 처리하도록 함
    });
    
    // IME 조합 중: ContentEditable이 처리
    this.container.addEventListener('compositionupdate', (e) => {
      // 조합 중인 텍스트는 ContentEditable이 표시
      // ⚠️ 중요: 이 시점에 DOM을 변경하면 IME가 깨질 수 있음
      // 필요시 모델에도 반영 (선택적, 하지만 DOM은 변경하지 않음)
    });
    
    // IME 조합 완료: ContentEditable에서 완료된 텍스트를 모델로 동기화
    this.container.addEventListener('compositionend', (e) => {
      this.isComposing = false;
      
      // ContentEditable의 변경사항을 모델로 동기화
      this.syncDOMToModel();
      
      // 렌더링 재개
      this.pauseRendering = false;
      
      // ContentEditable 초기화 (모델 기반으로 다시 렌더링)
      this.render();
    });
  }
  
  // 렌더링 시 IME 조합 중인지 확인
  render(): void {
    // ⚠️ 중요: IME 조합 중에는 렌더링하지 않음
    if (this.isComposing || this.pauseRendering) {
      return; // IME가 깨지지 않도록 렌더링 건너뜀
    }
    
    // 정상 렌더링
    // ...
  }
  
  isNormalInput(event: KeyboardEvent): boolean {
    // IME가 아닌 일반 입력인지 확인
    const key = event.key;
    
    // 화살표 키, 기능 키 등은 ContentEditable에 맡김 (선택적)
    if (key.startsWith('Arrow') || key === 'Home' || key === 'End') {
      return false; // ContentEditable이 처리
    }
    
    // 일반 문자 입력
    if (key.length === 1 && !event.ctrlKey && !event.metaKey) {
      return true; // 모델 직접 편집
    }
    
    // Backspace, Delete 등
    if (key === 'Backspace' || key === 'Delete') {
      return true; // 모델 직접 편집
    }
    
    return false;
  }
  
  syncDOMToModel(): void {
    // ContentEditable에서 IME로 입력된 텍스트를 모델로 동기화
    const domText = this.container.textContent || '';
    const modelText = this.model.getText();
    
    if (domText !== modelText) {
      // 텍스트 변경 감지 및 모델 업데이트
      // (MutationObserver 또는 text-analyzer 사용)
      this.applyTextChanges(domText, modelText);
    }
  }
}
```

**장점**:
- ✅ IME는 ContentEditable에서 자연스럽게 작동
- ✅ 일반 입력은 모델 직접 편집으로 처리 (선택적)
- ✅ IME UI가 올바른 위치에 표시됨

**단점**:
- ⚠️ 메인 영역이 ContentEditable이므로 여전히 일부 문제 발생 가능
- ⚠️ 일반 입력과 IME 입력을 구분하는 로직 필요
- ⚠️ DOM과 모델 동기화 필요 (IME 입력 시)

#### 5.3.2 IME 조합 중 DOM 변경 방지 ⚠️

**핵심 문제**: IME 입력 도중에 DOM을 변경하면 IME가 깨질 수 있습니다.

**시나리오**:
1. 사용자가 한글을 입력 중 (IME 조합 중)
2. 다른 곳에서 모델이 업데이트됨 (예: 협업 편집, 자동 완성 등)
3. 렌더링이 발생하여 DOM이 변경됨
4. **IME가 깨짐** ❌

**해결 방안**:

```typescript
class HybridEditor {
  private isComposing: boolean = false;
  private pendingRenders: (() => void)[] = []; // 대기 중인 렌더링
  
  setupIMEHandling(): void {
    this.container.addEventListener('compositionstart', () => {
      this.isComposing = true;
      // IME 조합 중에는 렌더링 일시 중지
    });
    
    this.container.addEventListener('compositionend', () => {
      this.isComposing = false;
      
      // 대기 중인 렌더링 실행
      this.flushPendingRenders();
    });
  }
  
  render(): void {
    // ⚠️ 중요: IME 조합 중에는 렌더링하지 않음
    if (this.isComposing) {
      // 렌더링을 대기열에 추가
      this.pendingRenders.push(() => {
        // 실제 렌더링 로직
        this.doRender();
      });
      return;
    }
    
    // 정상 렌더링
    this.doRender();
  }
  
  flushPendingRenders(): void {
    // IME 조합 완료 후 대기 중인 렌더링 실행
    while (this.pendingRenders.length > 0) {
      const renderFn = this.pendingRenders.shift();
      renderFn?.();
    }
  }
}
```

**주의사항**:
- IME 조합 중에는 **절대 DOM을 변경하지 않아야 함**
- 다른 컴포넌트나 이벤트에서도 렌더링을 트리거할 수 있으므로, 모든 렌더링 경로에서 IME 상태를 확인해야 함
- 모델 업데이트는 가능하지만, DOM 렌더링은 IME 조합 완료 후에만 수행

#### 5.3.3 대안: 항상 ContentEditable 사용하되 모델 직접 편집 최대화

또 다른 접근법은 **항상 ContentEditable을 사용하되, 일반 입력도 모델 직접 편집으로 처리**하는 것입니다:

```typescript
class HybridEditor {
  private container: HTMLElement;
  
  setup(): void {
    // 항상 ContentEditable 활성화 (IME를 위해)
    this.container.contentEditable = 'true';
    
    // 모든 입력을 모델 직접 편집으로 처리
    this.container.addEventListener('keydown', (e) => {
      e.preventDefault(); // 브라우저 기본 동작 방지
      this.handleKeydown(e); // 모델 직접 편집
    });
    
    // input 이벤트 무시
    this.container.addEventListener('input', (e) => {
      e.preventDefault();
    });
    
    // IME는 ContentEditable이 처리하도록 함
    this.container.addEventListener('compositionstart', () => {
      // IME 조합 중에는 모델 직접 편집 비활성화
      // ContentEditable이 IME를 처리
    });
    
    this.container.addEventListener('compositionend', (e) => {
      // IME 완료된 텍스트를 모델에 반영
      const text = e.data;
      this.model.insertText(this.cursorOffset, text);
      this.cursorOffset += text.length;
      
      // ContentEditable 초기화 및 모델 기반 렌더링
      this.render();
    });
  }
}
```

이 방법은 **모든 입력을 모델 직접 편집으로 처리하되, IME만 ContentEditable에 맡기는** 하이브리드 방식입니다.

#### 5.3.4 동적 ContentEditable 전환 (대안)

```typescript
class HybridEditor {
  private container: HTMLElement;
  private useContentEditable: boolean = false;
  
  setup(): void {
    // 기본적으로 모델 직접 편집 모드
    this.container.contentEditable = 'false';
    this.setupModelDirectEditing();
    
    // IME 감지 시 ContentEditable로 전환
    this.container.addEventListener('compositionstart', () => {
      this.switchToContentEditable();
    });
    
    this.container.addEventListener('compositionend', () => {
      this.switchToModelDirectEditing();
    });
  }
  
  switchToContentEditable(): void {
    if (this.useContentEditable) return;
    
    this.useContentEditable = true;
    this.container.contentEditable = 'true';
    
    // 현재 모델 상태를 DOM에 반영
    this.syncModelToDOM();
    
    // Selection 복원
    this.restoreSelection();
  }
  
  switchToModelDirectEditing(): void {
    if (!this.useContentEditable) return;
    
    // DOM 변경을 모델로 동기화
    this.syncDOMToModel();
    
    this.useContentEditable = false;
    this.container.contentEditable = 'false';
    
    // 모델 직접 편집 모드로 전환
    this.setupModelDirectEditing();
  }
  
  syncDOMToModel(): void {
    // ContentEditable에서 변경된 내용을 모델로 동기화
    const domText = this.container.textContent || '';
    const modelText = this.model.getText();
    
    if (domText !== modelText) {
      // 텍스트 변경 감지 및 모델 업데이트
      this.applyTextChanges(domText, modelText);
    }
  }
  
  syncModelToDOM(): void {
    // 모델 상태를 DOM에 반영
    this.render();
  }
}
```

#### 5.3.5 IME 전용 숨겨진 요소 (비권장)

```typescript
class HybridEditor {
  private imeProxy: HTMLElement;
  
  setup(): void {
    // 메인 편집 영역: 모델 직접 편집
    this.container.contentEditable = 'false';
    
    // IME 전용 프록시 요소 (완전히 숨김)
    this.imeProxy = document.createElement('div');
    this.imeProxy.contentEditable = 'true';
    this.imeProxy.style.cssText = `
      position: fixed;
      left: -9999px;
      width: 1px;
      height: 1px;
      overflow: hidden;
    `;
    document.body.appendChild(this.imeProxy);
    
    // IME 입력 시 프록시로 리다이렉트
    this.setupIMERedirect();
  }
  
  setupIMERedirect(): void {
    // 메인 영역에서 IME 시작 감지
    this.container.addEventListener('compositionstart', (e) => {
      // 프록시 요소로 포커스 이동
      this.imeProxy.focus();
      
      // 프록시에서 IME 처리
      this.imeProxy.addEventListener('compositionend', (e) => {
        const text = e.data;
        
        // 모델에 삽입
        this.model.insertText(this.cursorOffset, text);
        this.cursorOffset += text.length;
        
        // 프록시 초기화
        this.imeProxy.textContent = '';
        
        // 메인 영역으로 포커스 복귀
        this.container.focus();
        
        // 렌더링
        this.render();
      }, { once: true });
    });
  }
}
```

#### 5.3.6 하이브리드 접근법의 장단점

**장점**:
- ✅ IME의 모든 기능 활용 가능
- ✅ 일반 입력은 모델 직접 편집의 장점 활용
- ✅ Selection/Cursor 관리 단순화 (IME 입력 시에만 복잡)

**단점**:
- ⚠️ 두 가지 모드 간 전환 로직 필요
- ⚠️ IME 입력 시에만 ContentEditable의 문제 발생
- ⚠️ **IME 조합 중 DOM 변경 금지**: IME 입력 도중 DOM을 변경하면 IME가 깨질 수 있음
- ⚠️ 구현 복잡도 증가

**결론**: 
- **기술적 제약**: IME만 별도의 ContentEditable 요소에서 처리하는 것은 어렵습니다.
- **현실적인 해결책**: 메인 영역을 ContentEditable로 두되, 일반 입력은 모델 직접 편집으로 처리하고 IME만 ContentEditable에 맡기는 방식이 가장 현실적입니다.
- **트레이드오프**: 완전한 모델 직접 편집의 장점을 포기하되, IME 지원을 보장합니다.

---

## 6. IME 처리 전략 비교

### 6.1 완전한 ContentEditable 제거 (비현실적)

**방식**: ContentEditable을 완전히 제거하고 Composition 이벤트만으로 IME 처리

**문제점**:
- ❌ OS 레벨 IME UI와 통합 불가능
- ❌ 조합 중인 텍스트의 시각적 표시를 직접 구현해야 함
- ❌ 후보 단어 선택 UI를 직접 구현해야 함
- ❌ 커서 위치 자동 조정을 직접 구현해야 함
- ❌ 사용자 경험이 크게 저하됨

**결론**: **비현실적** - IME 지원이 필요한 언어(한글, 일본어, 중국어 등)에서는 사용 불가능

### 6.2 하이브리드 접근법 (권장)

**방식**: 
- 메인 영역: ContentEditable 활성화 (IME를 위해 필요)
- 일반 입력: preventDefault로 막고 모델 직접 편집으로 처리
- IME 입력: ContentEditable이 자연스럽게 처리

**장점**:
- ✅ IME의 모든 기능 활용 가능
- ✅ IME UI가 올바른 위치에 표시됨
- ✅ 일반 입력은 모델 직접 편집의 장점 활용 (선택적)

**단점**:
- ⚠️ 메인 영역이 ContentEditable이므로 여전히 일부 문제 발생 가능
- ⚠️ 일반 입력과 IME 입력을 구분하는 로직 필요
- ⚠️ DOM과 모델 동기화 필요 (IME 입력 시)
- ⚠️ **IME 조합 중 DOM 변경 금지**: IME 입력 도중 다른 곳에서 모델이 업데이트되어 렌더링이 발생하면 IME가 깨질 수 있음. 모든 렌더링 경로에서 IME 상태를 확인해야 함.
- ⚠️ 완전한 모델 직접 편집의 장점을 완전히 활용할 수 없음

**결론**: **권장** - IME 지원이 필요한 경우 가장 현실적인 접근법. 완전한 모델 직접 편집의 장점을 포기하되, IME 지원을 보장합니다.

### 6.3 완전한 ContentEditable 사용 (기존 방식)

**방식**: 모든 입력을 ContentEditable로 처리

**장점**:
- ✅ IME 완벽 지원
- ✅ 브라우저 네이티브 기능 활용

**단점**:
- ❌ Selection/Cursor 관리 복잡
- ❌ 이중 상태 관리
- ❌ 동기화 문제

**결론**: 기존 방식 - ContentEditable의 모든 문제를 안고 감

---

## 7. ProseMirror의 IME 처리 방식

ProseMirror는 실제로 사용되는 ContentEditable 기반 에디터로서, IME 입력 도중 DOM 변경 문제를 어떻게 처리하는지 살펴보겠습니다.

### 7.1 ProseMirror의 IME 보호 전략

**핵심 원칙**: **IME 입력이 진행되는 동안 DOM을 변경하지 않음**

ProseMirror는 다음과 같은 전략을 사용합니다:

1. **IME 조합 중 DOM 변경 금지**
   - `compositionstart` 이벤트에서 IME 조합 시작을 감지
   - IME 조합 중에는 커서 주변의 DOM을 변경하지 않음
   - 특히 Chrome 브라우저에서 IME 입력 중 DOM 변경이 발생하면 텍스트 중복 등의 문제가 발생할 수 있음

2. **모델 업데이트 지연**
   - IME 조합 중에는 모델 트랜잭션을 완전히 차단
   - 변경사항을 pending에 저장
   - `compositionend` 이벤트에서 조합 완료된 텍스트를 모델에 반영

3. **렌더링 일시 중지**
   - IME 조합 중에는 렌더링을 건너뜀
   - 다른 곳에서 모델이 업데이트되어도 DOM 렌더링을 하지 않음

### 7.2 ProseMirror 스타일 구현 예제

```typescript
class ProseMirrorStyleEditor {
  private isComposing: boolean = false;
  private pendingChanges: Array<{ textNodeId: string; oldText: string; newText: string }> = [];
  
  setupIMEHandling(): void {
    // IME 조합 시작
    this.container.addEventListener('compositionstart', () => {
      this.isComposing = true;
      // IME 조합 중에는 DOM 변경을 완전히 차단
    });
    
    // MutationObserver에서 텍스트 변경 감지
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          this.handleTextContentChange(mutation);
        }
      }
    });
  }
  
  handleTextContentChange(mutation: MutationRecord): void {
    const oldText = mutation.oldValue || '';
    const newText = (mutation.target as Text).data;
    const textNodeId = this.resolveTextNodeId(mutation.target);
    
    // ⚠️ 중요: 조합 중에는 모델 트랜잭션을 완전히 차단하고 브라우저에 맡김
    if (this.isComposing) {
      // 조합 중 변경사항을 pending에 저장
      this.pendingChanges.push({
        textNodeId,
        oldText,
        newText
      });
      // 조합 종료 누락 대비: 400ms 무입력 시 커밋
      if (this.pendingTimer) clearTimeout(this.pendingTimer);
      this.pendingTimer = setTimeout(() => {
        this.commitPendingChanges();
      }, 400);
      return; // 모델 업데이트 차단
    }
    
    // 조합이 아닐 때만 모델 업데이트
    this.applyTextChanges(textNodeId, oldText, newText);
  }
  
  // IME 조합 완료
  handleCompositionEnd(event: CompositionEvent): void {
    this.isComposing = false;
    
    // pending된 변경사항을 모델에 반영
    this.commitPendingChanges();
  }
  
  commitPendingChanges(): void {
    // pending된 모든 변경사항을 모델에 반영
    for (const change of this.pendingChanges) {
      this.applyTextChanges(change.textNodeId, change.oldText, change.newText);
    }
    this.pendingChanges = [];
  }
  
  // 렌더링 시 IME 조합 중인지 확인
  render(): void {
    // ⚠️ 중요: IME 조합 중에는 렌더링하지 않음
    if (this.isComposing) {
      return; // ProseMirror도 동일한 전략 사용
    }
    
    // 정상 렌더링
    // ...
  }
}
```

### 7.3 ProseMirror의 한계

ProseMirror도 완벽하지 않습니다:

1. **Chrome 브라우저의 문제**
   - Chrome에서 IME 입력 중 DOM 변경이 발생하면 텍스트 중복 등의 문제가 발생할 수 있음
   - ProseMirror는 이를 방지하기 위해 IME 조합 중 DOM 변경을 완전히 차단

2. **렌더링 지연**
   - IME 조합 중에는 다른 곳에서 모델이 업데이트되어도 렌더링하지 않음
   - 조합 완료 후에야 모든 변경사항이 반영됨

3. **Selection 관리의 복잡성**
   - 여전히 ContentEditable을 사용하므로 Selection 관리가 복잡함
   - Text Node Pool 등의 메커니즘 필요

### 7.4 시사점

ProseMirror의 접근법은 본 논문에서 제안하는 하이브리드 접근법과 유사합니다:

- ✅ **IME 조합 중 DOM 변경 금지**: 본 논문의 제안과 동일
- ✅ **렌더링 일시 중지**: 본 논문의 제안과 동일
- ⚠️ **여전히 ContentEditable 사용**: 완전한 모델 직접 편집은 아님

**차이점**:
- ProseMirror: 모든 입력을 ContentEditable로 처리
- 본 논문의 제안: 일반 입력은 모델 직접 편집, IME만 ContentEditable

---

## 8. Comparison with Existing Approaches

### 8.1 ContentEditable 기반 에디터

**장점**:
- 브라우저 네이티브 기능 활용
- 구현이 상대적으로 간단

**단점**:
- Selection/Cursor 관리 복잡
- 이중 상태 관리
- 동기화 문제

### 8.2 Model-Direct Editing (순수)

**장점**:
- Selection/Cursor 관리 단순
- 단방향 데이터 흐름
- 완전한 제어

**단점**:
- 모든 입력 처리 직접 구현 필요
- 복잡한 구현

### 8.3 하이브리드 접근법 (권장)

**장점**:
- 필요에 따라 ContentEditable 사용
- 점진적 마이그레이션 가능

**단점**:
- 두 가지 방식을 모두 지원해야 함
- 복잡도 증가

---

## 9. Implementation Example

### 9.1 기본 구조 (하이브리드)

```typescript
class ModelDirectEditor {
  private model: Model;
  private cursorOffset: number = 0;
  private selection: ModelSelection | null = null;
  private container: HTMLElement;
  private renderer: DOMRenderer;
  
  constructor(container: HTMLElement) {
    this.container = container;
    this.model = new Model();
    this.renderer = new DOMRenderer(container);
    this.setup();
  }
  
  setup(): void {
    // ContentEditable 비활성화
    this.container.contentEditable = 'false';
    this.container.setAttribute('tabindex', '0');
    
    // 이벤트 리스너 등록
    this.container.addEventListener('keydown', (e) => this.handleKeydown(e));
    this.container.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.container.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.container.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    this.container.addEventListener('compositionstart', (e) => this.handleCompositionStart(e));
    this.container.addEventListener('compositionupdate', (e) => this.handleCompositionUpdate(e));
    this.container.addEventListener('compositionend', (e) => this.handleCompositionEnd(e));
    
    // 커서 및 Selection 시각화 설정
    this.setupVisualization();
  }
  
  // 모델 변경 후 렌더링
  render(): void {
    this.renderer.render(this.model);
    this.updateCursor();
    this.renderSelection();
  }
}
```

### 9.2 사용 예제

```typescript
// 에디터 생성
const editor = new ModelDirectEditor(document.getElementById('editor'));

// 모델 직접 변경 (AI처럼)
editor.model.insertText(0, 'Hello');
editor.model.insertText(5, ' World');
editor.model.applyMark(0, 11, 'bold');

// 사용자 입력 (키보드)
// 사용자가 'a' 키를 누르면
// → handleKeydown에서 모델 직접 변경
// → render() 호출
// → 커서 위치 업데이트

// Selection 관리
editor.setSelection(0, 5); // "Hello" 선택
editor.setCursorOffset(11); // 커서를 끝으로 이동
```

---

## 10. Alternative Paradigm: Graphic Editor Style Document Composition

### 10.1 새로운 관점: 문서 편집 vs 문서 구성

기존의 ContentEditable 기반 에디터는 **문서를 편집**하는 관점입니다:
- 사용자가 텍스트를 직접 입력하고 수정
- ContentEditable을 통해 브라우저가 DOM을 직접 변경
- Selection/Cursor 관리의 복잡성

하지만 **그래픽 에디터(Figma, Sketch 등)처럼 문서를 구성**하는 관점도 있습니다:
- 왼쪽: 트리 구조 (문서 구조)
- 오른쪽: 속성 창 (선택한 요소의 속성)
- 중앙: 멀티 도큐먼트 편집 가능한 빌보드 형태의 거대한 판

이 접근법은 ContentEditable의 문제를 **완전히 우회**할 수 있습니다.

### 10.2 그래픽 에디터 스타일 문서 편집기

```typescript
interface DocumentEditorLayout {
  leftPanel: DocumentTree;      // 문서 구조 트리
  centerPanel: Canvas;          // 빌보드 형태의 편집 영역
  rightPanel: PropertyPanel;    // 선택한 요소의 속성
}

class GraphicStyleDocumentEditor {
  private layout: DocumentEditorLayout;
  private model: DocumentModel;
  
  setup(): void {
    // 왼쪽: 문서 구조 트리
    this.layout.leftPanel = new DocumentTree({
      model: this.model,
      onSelect: (nodeId) => this.selectNode(nodeId)
    });
    
    // 중앙: 빌보드 형태의 편집 영역
    this.layout.centerPanel = new Canvas({
      model: this.model,
      onSelect: (nodeId) => this.selectNode(nodeId),
      onDrag: (nodeId, position) => this.moveNode(nodeId, position)
    });
    
    // 오른쪽: 속성 창
    this.layout.rightPanel = new PropertyPanel({
      selectedNode: this.selectedNode,
      onUpdate: (properties) => this.updateNodeProperties(properties)
    });
  }
  
  selectNode(nodeId: string): void {
    this.selectedNode = this.model.getNode(nodeId);
    this.layout.rightPanel.update(this.selectedNode);
    this.layout.centerPanel.highlight(nodeId);
  }
  
  updateNodeProperties(properties: Record<string, any>): void {
    // 모델 직접 변경 (ContentEditable 없음)
    this.model.updateNode(this.selectedNode.id, properties);
    this.layout.centerPanel.render();
  }
}
```

### 10.3 빌보드 형태의 편집 영역

```typescript
class Canvas {
  private container: HTMLElement;
  private model: DocumentModel;
  private zoom: number = 1.0;
  private pan: { x: number; y: number } = { x: 0, y: 0 };
  
  setup(): void {
    // ContentEditable 없음
    this.container.contentEditable = 'false';
    
    // 빌보드 형태의 거대한 편집 영역
    this.container.style.cssText = `
      width: 100%;
      height: 100%;
      overflow: auto;
      position: relative;
      background: #f5f5f5;
    `;
    
    // 멀티 도큐먼트 편집 가능
    this.setupMultiDocumentEditing();
  }
  
  render(): void {
    // 모델 기반 렌더링 (단방향 데이터 흐름)
    const documents = this.model.getDocuments();
    
    for (const doc of documents) {
      const docElement = this.renderDocument(doc);
      docElement.style.position = 'absolute';
      docElement.style.left = `${doc.position.x}px`;
      docElement.style.top = `${doc.position.y}px`;
      this.container.appendChild(docElement);
    }
  }
  
  renderDocument(doc: Document): HTMLElement {
    // 문서를 렌더링 (ContentEditable 없음)
    const docElement = document.createElement('div');
    docElement.className = 'document';
    docElement.style.cssText = `
      width: ${doc.width}px;
      min-height: ${doc.height}px;
      background: white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      padding: 40px;
    `;
    
    // 문서 내용 렌더링
    const content = this.renderContent(doc.content);
    docElement.appendChild(content);
    
    return docElement;
  }
  
  renderContent(content: ContentNode[]): HTMLElement {
    const contentElement = document.createElement('div');
    
    for (const node of content) {
      if (node.type === 'text') {
        // 텍스트 노드: ContentEditable 없이 렌더링
        const textElement = this.renderTextNode(node);
        contentElement.appendChild(textElement);
      } else if (node.type === 'heading') {
        // 제목 노드
        const headingElement = this.renderHeading(node);
        contentElement.appendChild(headingElement);
      }
      // ...
    }
    
    return contentElement;
  }
  
  renderTextNode(node: TextNode): HTMLElement {
    const textElement = document.createElement('div');
    textElement.textContent = node.text;
    textElement.setAttribute('data-node-id', node.id);
    
    // 클릭 시 선택
    textElement.addEventListener('click', () => {
      this.selectNode(node.id);
    });
    
    // 더블 클릭 시 편집 모드
    textElement.addEventListener('dblclick', () => {
      this.enterEditMode(node.id);
    });
    
    return textElement;
  }
  
  enterEditMode(nodeId: string): void {
    // 편집 모드: 인라인 편집기 표시
    const node = this.model.getNode(nodeId);
    const editor = new InlineEditor({
      node,
      onSave: (text) => {
        // 모델 직접 변경
        this.model.updateNode(nodeId, { text });
        this.render();
      }
    });
    
    editor.show();
  }
}
```

### 10.4 인라인 편집기 (선택적 ContentEditable)

```typescript
class InlineEditor {
  private node: TextNode;
  private editor: HTMLElement;
  
  show(): void {
    // 편집 모드에서만 ContentEditable 사용
    this.editor = document.createElement('div');
    this.editor.contentEditable = 'true';
    this.editor.textContent = this.node.text;
    
    // 편집 완료 시 모델 업데이트
    this.editor.addEventListener('blur', () => {
      const newText = this.editor.textContent || '';
      this.onSave(newText);
      this.hide();
    });
    
    // ESC 키로 취소
    this.editor.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hide();
      }
    });
    
    // 노드 위치에 표시
    const nodeElement = document.querySelector(`[data-node-id="${this.node.id}"]`);
    nodeElement?.replaceWith(this.editor);
    this.editor.focus();
  }
  
  hide(): void {
    // 편집 모드 종료
    this.editor.remove();
  }
}
```

### 10.5 장점

1. **ContentEditable 문제 완전 우회**
   - 일반 편집 시 ContentEditable 사용 안 함
   - 인라인 편집 모드에서만 선택적으로 사용
   - Selection/Cursor 관리 복잡성 제거

2. **문서 구조 시각화**
   - 트리 구조로 문서 구조를 명확히 표시
   - 계층 구조 이해 용이

3. **멀티 도큐먼트 편집**
   - 여러 문서를 동시에 편집 가능
   - 빌보드 형태로 자유롭게 배치

4. **속성 기반 편집**
   - 선택한 요소의 속성을 명확히 표시
   - 속성 변경이 모델 직접 변경으로 처리

5. **AI와의 통합 용이**
   - AI가 모델을 직접 변경 가능
   - 사람도 속성 창을 통해 모델 변경

### 10.6 단점

1. **기존 습관과의 차이**
   - 사용자가 기존 에디터에 익숙함
   - 학습 곡선 존재

2. **텍스트 입력의 불편함**
   - 더블 클릭으로 편집 모드 진입 필요
   - 연속적인 텍스트 입력이 불편할 수 있음

3. **복잡한 구현**
   - 트리, 캔버스, 속성 창 등 여러 컴포넌트 필요
   - 레이아웃 관리 복잡

### 10.7 하이브리드 접근법

일반 텍스트 편집과 그래픽 에디터 스타일을 결합할 수 있습니다:

```typescript
class HybridDocumentEditor {
  private mode: 'text' | 'graphic' = 'text';
  
  setMode(mode: 'text' | 'graphic'): void {
    this.mode = mode;
    
    if (mode === 'text') {
      // 일반 텍스트 편집 모드
      this.showTextEditor();
    } else {
      // 그래픽 에디터 스타일 모드
      this.showGraphicEditor();
    }
  }
  
  showTextEditor(): void {
    // ContentEditable 기반 텍스트 편집기
    // (하이브리드 접근법: 일반 입력은 모델 직접 편집, IME만 ContentEditable)
  }
  
  showGraphicEditor(): void {
    // 그래픽 에디터 스타일 편집기
    // (ContentEditable 거의 사용 안 함)
  }
}
```

### 10.8 시사점

그래픽 에디터 스타일 접근법은:
- ✅ ContentEditable의 문제를 완전히 우회
- ✅ 문서 구조를 시각적으로 표현
- ✅ AI와 사람의 편집 방식을 통합
- ⚠️ 기존 사용자 습관과의 차이
- ⚠️ 연속적인 텍스트 입력의 불편함

**결론**: 문서를 "편집"하는 것이 아니라 "구성"하는 관점으로 전환하면, ContentEditable의 문제를 근본적으로 해결할 수 있습니다. 특히 복잡한 문서 구조를 다루거나 멀티 도큐먼트 편집이 필요한 경우에 유용합니다.

---

## 11. Future Work

### 11.1 완전한 구현

- 모든 키보드 단축키 지원
- 복사/붙여넣기 완전 구현
- 드래그 앤 드롭 지원
- 접근성 완전 지원

### 11.2 성능 최적화

- 가상 스크롤링
- 렌더링 최적화
- 메모리 관리

### 11.3 사용자 경험 개선

- 커서 애니메이션
- Selection 시각화 개선
- IME 입력 경험 개선

---

## 12. Conclusion

본 논문은 ContentEditable 기반 리치 텍스트 에디터의 근본적인 한계를 분석하고, **Model-Direct Editing 패러다임**을 제안했습니다. 

**핵심 발견**: IME(Input Method Editor) 지원이 필요한 경우, ContentEditable을 완전히 제거하는 것은 **비현실적**입니다. IME는 OS 레벨과 브라우저의 협력이 필요한 복잡한 시스템이며, 이를 직접 구현하는 것은 거의 불가능합니다.

**제안하는 해결책**: **하이브리드 접근법**을 제안합니다:
- **일반 입력**: ContentEditable 없이 모델 직접 편집 (Selection/Cursor 관리 단순화)
- **IME 입력**: ContentEditable 사용 (IME 전용 요소 또는 동적 전환)

이 접근법은 일반 입력의 장점을 활용하면서도 IME의 모든 기능을 지원할 수 있습니다.

**핵심 기여**:
1. **ContentEditable의 근본적인 문제 분석**: Selection/Cursor 핸들링의 복잡성과 이중 상태 관리 문제
2. **IME의 한계 명확화**: ContentEditable 없이 IME를 완전히 구현하는 것은 비현실적임을 분석
3. **하이브리드 패러다임 제안**: 일반 입력은 모델 직접 편집, IME 입력만 ContentEditable 사용
4. **구현 전략 제시**: IME 전용 요소 또는 동적 ContentEditable 전환 방법
5. **ProseMirror 비교 분석**: 실제 사용되는 에디터의 IME 처리 방식 분석
6. **그래픽 에디터 스타일 대안 제안**: 문서를 "편집"하는 것이 아니라 "구성"하는 관점으로 전환

**최종 제안**:
- **단기**: 하이브리드 접근법 (일반 입력은 모델 직접 편집, IME만 ContentEditable)
- **장기**: 그래픽 에디터 스타일 문서 구성기 (ContentEditable 거의 사용 안 함)

이 접근법들은 ContentEditable의 한계를 최소화하거나 완전히 우회할 수 있는 현실적인 해결책을 제시합니다.

---

## References

1. W3C. "ContentEditable". https://html.spec.whatwg.org/multipage/interaction.html#contenteditable
2. MDN. "Selection API". https://developer.mozilla.org/en-US/docs/Web/API/Selection
3. ProseMirror. "Document Model". https://prosemirror.net/docs/guide/#document
4. Slate.js. "Architecture". https://docs.slatejs.org/concepts/architecture
5. Draft.js. "Overview". https://draftjs.org/docs/overview

