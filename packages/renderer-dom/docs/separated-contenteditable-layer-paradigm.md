# 분리된 ContentEditable 레이어 패러다임: EditableSimulator를 통한 렌더링과 편집의 완전한 분리

## Abstract

본 논문은 ContentEditable 기반 리치 텍스트 에디터의 근본적인 문제를 해결하기 위해 **EditableSimulator**라는 새로운 개념을 도입하여 **렌더링 영역과 ContentEditable 레이어를 완전히 분리**하는 패러다임을 제안합니다. 

**EditableSimulator**는 디자인 툴의 사이드바나 속성 창과 같이 외부에서 모델을 편집하는 새로운 도구 개념입니다. 원본의 구조를 그대로 본떠서 에디팅 가능한 상태로 조합한 다음에 ContentEditable을 적용하는 형태로, 투명성을 활용하여 커서 위치와 Selection만 정확히 맞추면 하위 구조는 크게 신경 쓰지 않아도 되는 장점이 있습니다.

기존 에디터들은 ContentEditable 영역에서 렌더링과 편집을 동시에 처리하여 Selection/Cursor 관리의 복잡성과 이중 상태 관리 문제에 직면합니다. 본 논문은 **투명한 ContentEditable 레이어를 렌더링 영역 위에 덮어씌워** 편집 기능만 담당하고, 실제 렌더링은 모델 기반으로 처리하는 방식을 제안합니다.

이 접근법은 사용자가 키보드로 특정 영역에 텍스트를 입력하는 기존 습관을 유지하면서도, ContentEditable의 문제를 근본적으로 해결할 수 있습니다.

**Keywords**: EditableSimulator, Separated ContentEditable Layer, Rendering-Edit Separation, Overlay ContentEditable, Transparent Input Layer, Rich Text Editor

---

## 1. Introduction

### 1.1 기존 접근법의 문제

기존 ContentEditable 기반 에디터들은:
- 렌더링과 편집이 같은 영역에서 발생
- ContentEditable이 DOM을 직접 변경
- MutationObserver로 DOM 변경을 감지하여 모델 동기화
- 이중 상태 관리 (DOM ↔ 모델)
- Selection/Cursor 관리의 복잡성

### 1.2 새로운 관점: EditableSimulator

**핵심 아이디어**: **EditableSimulator**라는 새로운 도구 개념을 도입합니다.

**EditableSimulator**는:
- **Editable에 대한 것만 처리**하여 시뮬레이션을 가능하도록 돕는 도구
- 디자인 툴의 사이드바, 속성 창과 같이 **외부에서 모델을 편집하는 새로운 도구 개념**
- 원본의 구조를 그대로 본떠서 **에디팅 가능한 상태로 조합**한 다음에 ContentEditable을 적용
- 투명성을 활용하여 **커서 위치/Selection만 맞으면 하위 구조는 크게 신경 쓰지 않아도 됨**

**렌더링 영역과 ContentEditable 영역의 완전한 분리**:

1. **렌더링 영역**: ContentEditable 없이 모델 기반으로 렌더링
2. **EditableSimulator (편집 레이어)**: 투명한 ContentEditable 레이어를 렌더링 영역 위에 덮어씌움
3. **동기화**: 편집 레이어의 입력을 모델로 변환하고, 모델 변경을 렌더링 영역에 반영

이렇게 하면:
- 렌더링 영역은 단방향 데이터 흐름 (모델 → DOM)
- EditableSimulator는 입력만 담당 (키보드/마우스 → 모델)
- 두 영역이 완전히 분리되어 각각의 문제를 독립적으로 해결 가능

### 1.3 사용자 경험 유지

사용자는 여전히:
- 키보드로 특정 영역에 텍스트를 입력
- 마우스로 클릭하여 커서 이동
- 드래그로 텍스트 선택

하지만 내부적으로는:
- 렌더링 영역과 편집 레이어가 분리되어 있음
- 각 영역이 독립적으로 동작

---

## 2. Architecture

### 2.1 전체 구조

```typescript
interface SeparatedEditorLayout {
  renderLayer: RenderLayer;        // 렌더링 영역 (ContentEditable 없음)
  editableSimulator: EditableSimulator;  // EditableSimulator (투명한 ContentEditable)
  syncManager: SyncManager;        // 동기화 관리자
}

class SeparatedContentEditableEditor {
  private layout: SeparatedEditorLayout;
  private model: DocumentModel;
  
  setup(): void {
    // 1. 렌더링 영역 설정 (ContentEditable 없음)
    this.layout.renderLayer = new RenderLayer({
      container: this.container,
      model: this.model
    });
    
    // 2. EditableSimulator 설정 (투명한 ContentEditable)
    this.layout.editableSimulator = new EditableSimulator({
      container: this.container,
      renderLayer: this.layout.renderLayer,
      onInput: (text, offset) => this.handleInput(text, offset)
    });
    
    // 3. 동기화 관리자 설정
    this.layout.syncManager = new SyncManager({
      renderLayer: this.layout.renderLayer,
      editableSimulator: this.layout.editableSimulator,
      model: this.model
    });
  }
}
```

### 2.2 레이어 구조 다이어그램

```
┌─────────────────────────────────────────┐
│  Edit Layer (투명한 ContentEditable)    │
│  - 렌더링 영역과 완전히 동일한 구조     │
│  - inline-text 안에서 텍스트 동일        │
│  - 안보이게 설정 (opacity: 0)           │
│  - 커서만 보임                          │
│  - 실시간 동기화                        │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  Render Layer (모델 기반 렌더링)        │
│  - ContentEditable 없음                 │
│  - 모델 → DOM 단방향 데이터 흐름         │
│  - 완전한 제어 가능                     │
│  - 지속적으로 렌더링 가능               │
└─────────────────────────────────────────┘
```

**핵심**: 편집 레이어는 렌더링 영역과 **완전히 동일한 구조**로 되어 있으므로 위치 계산이 필요 없습니다. 단지 투명하게만 만들면 됩니다.

### 2.3 실시간 동기화

**핵심 원칙**: 편집 레이어와 렌더링 영역을 **실시간으로 동기화**합니다.

```typescript
class SyncManager {
  private renderLayer: RenderLayer;
  private editLayer: EditLayer;
  private model: DocumentModel;
  
  // 실시간 동기화 설정
  setupRealtimeSync(): void {
    // 1. 편집 레이어 → 모델 → 렌더링 영역 (입력 시)
    this.editLayer.onInput((text, offset) => {
      // 모델 업데이트
      this.model.insertText(offset, text);
      
      // 렌더링 영역 즉시 업데이트
      this.renderLayer.render();
      
      // 편집 레이어 내용 재동기화 (렌더링 영역과 동일하게)
      this.editLayer.syncContentFromRender();
    });
    
    // 2. 모델 변경 → 렌더링 영역 → 편집 레이어 (외부 변경 시)
    this.model.onChange(() => {
      // 렌더링 영역 업데이트
      this.renderLayer.render();
      
      // 편집 레이어 내용 재동기화 (렌더링 영역과 동일하게)
      this.editLayer.syncContentFromRender();
      
      // 커서 위치 유지
      this.editLayer.preserveCursorPosition();
    });
  }
}
```

**동기화 방식**:
- 편집 레이어는 렌더링 영역과 **완전히 동일한 구조**로 유지
- 렌더링 영역이 변경되면 편집 레이어도 즉시 동일하게 업데이트
- 위치 계산 불필요 (구조가 동일하므로)

---

## 3. Implementation

### 3.1 렌더링 영역 (Render Layer)

```typescript
class RenderLayer {
  private container: HTMLElement;
  private model: DocumentModel;
  private renderer: DOMRenderer;
  
  setup(): void {
    // ContentEditable 없음
    this.container.contentEditable = 'false';
    
    // 모델 기반 렌더링
    this.renderer = new DOMRenderer(this.container);
  }
  
  render(): void {
    // 모델 → DOM 단방향 데이터 흐름
    this.renderer.render(this.model);
  }
  
  // 커서 위치 계산 (편집 레이어 동기화용)
  getCursorPosition(modelOffset: number): { x: number; y: number } {
    // 모델 offset을 DOM 위치로 변환
    const textNode = this.findTextNodeAtOffset(modelOffset);
    const offsetInNode = modelOffset - textNode.startOffset;
    
    const range = document.createRange();
    range.setStart(textNode.domNode, offsetInNode);
    range.setEnd(textNode.domNode, offsetInNode);
    
    const rect = range.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();
    
    return {
      x: rect.left - containerRect.left,
      y: rect.top - containerRect.top
    };
  }
  
  // 텍스트 범위 계산 (Selection 동기화용)
  getTextRange(startOffset: number, endOffset: number): DOMRect[] {
    // 모델 offset 범위를 DOM 위치로 변환
    const ranges: DOMRect[] = [];
    // ... 범위 계산 로직
    return ranges;
  }
}
```

### 3.2 편집 레이어 (Edit Layer)

**핵심**: 편집 레이어는 렌더링 영역과 **완전히 동일한 구조**로 되어 있습니다. 단지 투명하게만 만들면 됩니다.

```typescript
class EditLayer {
  private container: HTMLElement;
  private editElement: HTMLElement; // 투명한 ContentEditable
  private renderLayer: RenderLayer;
  private model: DocumentModel;
  
  setup(): void {
    // 편집 레이어 컨테이너
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: auto;
      z-index: 10;
    `;
    
    // 투명한 ContentEditable 요소
    // 렌더링 영역과 완전히 동일한 구조로 생성
    this.editElement = this.cloneRenderStructure();
    this.editElement.contentEditable = 'true';
    
    // 투명하게 설정 (커서만 보임)
    this.editElement.style.cssText = `
      width: 100%;
      height: 100%;
      opacity: 0;  // 완전히 투명
      color: transparent;  // 텍스트도 투명
      background: transparent;
      caret-color: #000;  // 커서만 보임
      outline: none;
      pointer-events: auto;
    `;
    
    // inline-text 안에서 텍스트는 동일하게 유지
    // (렌더링 영역과 동일한 구조이므로)
    
    this.container.appendChild(this.editElement);
    
    // 편집 레이어를 렌더링 영역 위에 배치
    this.renderLayer.container.appendChild(this.container);
    
    // 이벤트 리스너 설정
    this.setupEventListeners();
    
    // 실시간 동기화 설정
    this.setupRealtimeSync();
  }
  
  // 렌더링 영역의 구조를 복제
  cloneRenderStructure(): HTMLElement {
    // 렌더링 영역의 DOM 구조를 복제
    const renderElement = this.renderLayer.container.cloneNode(true) as HTMLElement;
    
    // 모든 텍스트는 그대로 유지 (투명하게 보이지만 구조는 동일)
    // inline-text 안에서 텍스트가 동일하게 유지됨
    
    return renderElement;
  }
  
  setupEventListeners(): void {
    // 입력 이벤트
    this.editElement.addEventListener('input', (e) => {
      this.handleInput(e);
    });
    
    // Selection 변경 이벤트
    this.editElement.addEventListener('selectionchange', () => {
      this.handleSelectionChange();
    });
    
    // IME 이벤트
    this.editElement.addEventListener('compositionstart', (e) => {
      this.handleCompositionStart(e);
    });
    
    this.editElement.addEventListener('compositionend', (e) => {
      this.handleCompositionEnd(e);
    });
  }
  
  // 실시간 동기화 설정
  setupRealtimeSync(): void {
    // 렌더링 영역 변경 감지
    const observer = new MutationObserver(() => {
      // 렌더링 영역이 변경되면 편집 레이어도 즉시 동기화
      this.syncContentFromRender();
    });
    
    observer.observe(this.renderLayer.container, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
  
  // 렌더링 영역에서 편집 레이어로 내용 동기화
  syncContentFromRender(): void {
    // 렌더링 영역의 구조를 복제하여 편집 레이어에 반영
    // 위치 계산 불필요 (구조가 동일하므로)
    
    const renderHTML = this.renderLayer.container.innerHTML;
    
    // 편집 레이어에 동일한 구조 적용
    this.editElement.innerHTML = renderHTML;
    
    // 투명하게 설정 (이미 설정되어 있지만 재확인)
    this.makeTransparent(this.editElement);
    
    // 커서 위치 유지
    this.preserveCursorPosition();
  }
  
  // 모든 요소를 투명하게 만들기 (커서만 보이도록)
  makeTransparent(element: HTMLElement): void {
    // 모든 자식 요소를 순회하며 투명하게 설정
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      null
    );
    
    let node;
    while (node = walker.nextNode()) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        el.style.color = 'transparent';
        el.style.opacity = '0';
        el.style.background = 'transparent';
      }
    }
    
    // 커서만 보이도록
    element.style.caretColor = '#000';
  }
  
  // 커서 위치 유지
  preserveCursorPosition(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    // 현재 커서 위치 저장
    const range = selection.getRangeAt(0);
    const offset = this.getOffsetInEditLayer(range);
    
    // 동기화 후 커서 위치 복원
    requestAnimationFrame(() => {
      this.setCursorOffset(offset);
    });
  }
  
  // 입력 처리 (단순화)
  handleInput(event: InputEvent): void {
    // 편집 레이어의 변경사항을 모델로 변환
    const newText = this.editElement.textContent || '';
    const oldText = this.model.getText();
    
    // 변경사항 계산 (간단한 diff)
    const changes = this.calculateChanges(oldText, newText);
    
    // 모델 업데이트
    for (const change of changes) {
      if (change.type === 'insert') {
        this.model.insertText(change.offset, change.text);
      } else if (change.type === 'delete') {
        this.model.deleteText(change.offset, change.length);
      }
    }
    
    // 렌더링 영역 즉시 업데이트 (지속적으로 렌더링 가능)
    this.renderLayer.render();
    
    // 편집 레이어 내용 재동기화 (렌더링 영역과 동일하게)
    // 실시간 동기화로 자동 처리됨
    this.syncContentFromRender();
  }
  
  // 변경사항 계산 (단순화)
  calculateChanges(oldText: string, newText: string): Change[] {
    // 간단한 diff 알고리즘
    // 또는 text-analyzer 사용
    const changes: Change[] = [];
    
    // LCS/LCP 알고리즘으로 최소 변경 감지
    // ...
    
    return changes;
  }
  
  // Selection 변경 처리
  handleSelectionChange(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    const editOffset = this.getOffsetInEditLayer(range);
    
    // 모델 Selection으로 변환
    const modelSelection = this.convertToModelSelection(editOffset);
    
    // 렌더링 영역에 Selection 표시 (선택적)
    // this.renderLayer.renderSelection(modelSelection);
  }
  
  // IME 처리
  handleCompositionStart(event: CompositionEvent): void {
    // IME 조합 시작
    // 편집 레이어가 ContentEditable이므로 자연스럽게 처리됨
  }
  
  handleCompositionEnd(event: CompositionEvent): void {
    // IME 조합 완료
    // 편집 레이어의 변경사항을 모델로 동기화
    this.handleInput(event as any);
  }
}
```

### 3.3 입력 단순화

편집 레이어가 렌더링 영역과 완전히 동일한 구조로 되어 있으므로, 입력 처리가 단순해집니다:

```typescript
class EditLayer {
  // 입력 처리 단순화
  handleInput(event: InputEvent): void {
    // 편집 레이어는 ContentEditable이므로 브라우저가 자동으로 처리
    // 우리는 변경사항만 감지하여 모델로 변환하면 됨
    
    // 1. 편집 레이어의 현재 상태
    const editText = this.editElement.textContent || '';
    
    // 2. 모델의 현재 상태
    const modelText = this.model.getText();
    
    // 3. 변경사항 계산 (간단한 diff)
    if (editText !== modelText) {
      const changes = this.calculateSimpleDiff(modelText, editText);
      
      // 4. 모델 업데이트
      this.applyChangesToModel(changes);
      
      // 5. 렌더링 영역 업데이트 (지속적으로 렌더링 가능)
      this.renderLayer.render();
      
      // 6. 편집 레이어 재동기화 (자동으로 처리됨)
      // 실시간 동기화로 인해 자동으로 렌더링 영역과 동일하게 됨
    }
  }
  
  // 간단한 diff 계산
  calculateSimpleDiff(oldText: string, newText: string): Change[] {
    // text-analyzer 또는 간단한 LCS 알고리즘 사용
    // ...
  }
}
```

**핵심**: 편집 레이어는 렌더링 영역과 동일한 구조이므로, 입력 처리가 매우 단순합니다. 브라우저가 ContentEditable로 자동 처리하고, 우리는 변경사항만 감지하여 모델로 변환하면 됩니다.

### 3.4 커서 Decorator로 렌더링 영역에 표시

**핵심 아이디어**: 편집 레이어를 완전히 투명하게 만들고, 커서를 **decorator로 렌더링 영역에 표시**합니다. 이렇게 하면 사용자는 커서가 렌더링 영역에 있는 것처럼 보이게 할 수 있습니다.

```typescript
class EditLayer {
  setup(): void {
    // 편집 레이어 스타일 - 완전히 투명
    this.editElement.style.cssText = `
      width: 100%;
      height: 100%;
      opacity: 0;  // 완전히 투명
      color: transparent;  // 텍스트 투명
      background: transparent;
      caret-color: transparent;  // 편집 레이어의 커서도 투명
      outline: none;
      font-family: inherit;  // 렌더링 영역과 동일한 폰트
      font-size: inherit;
      line-height: inherit;
      padding: inherit;
      margin: inherit;
    `;
    
    // 편집 레이어의 커서는 보이지 않음
    // 대신 렌더링 영역에 decorator로 커서 표시
  }
  
  // Selection 변경 시 커서 위치 업데이트
  handleSelectionChange(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    // 편집 레이어의 커서 위치를 모델 offset으로 변환
    const range = selection.getRangeAt(0);
    const modelOffset = this.convertToModelOffset(range);
    
    // 렌더링 영역에 커서 decorator 표시
    this.renderLayer.showCursorDecorator(modelOffset);
    
    // Selection도 렌더링 영역에 표시
    if (!selection.isCollapsed) {
      const modelSelection = this.convertToModelSelection(range);
      this.renderLayer.renderSelection(modelSelection);
    }
  }
}
```

```typescript
class RenderLayer {
  private cursorDecorator: HTMLElement | null = null;
  
  // 커서 decorator 표시
  showCursorDecorator(modelOffset: number): void {
    // 기존 커서 decorator 제거
    if (this.cursorDecorator) {
      this.cursorDecorator.remove();
    }
    
    // 모델 offset을 DOM 위치로 변환
    const position = this.getCursorPosition(modelOffset);
    
    // 커서 decorator 생성
    this.cursorDecorator = document.createElement('div');
    this.cursorDecorator.className = 'cursor-decorator';
    this.cursorDecorator.style.cssText = `
      position: absolute;
      left: ${position.x}px;
      top: ${position.y}px;
      width: 2px;
      height: ${position.height}px;
      background: #000;
      pointer-events: none;
      z-index: 100;
      animation: blink 1s infinite;
    `;
    
    // 커서 decorator를 렌더링 영역에 추가
    this.container.appendChild(this.cursorDecorator);
  }
  
  // 커서 decorator 제거
  hideCursorDecorator(): void {
    if (this.cursorDecorator) {
      this.cursorDecorator.remove();
      this.cursorDecorator = null;
    }
  }
  
  // 커서 위치 업데이트 (편집 레이어의 커서 위치 변경 시)
  updateCursorDecorator(modelOffset: number): void {
    const position = this.getCursorPosition(modelOffset);
    
    if (this.cursorDecorator) {
      this.cursorDecorator.style.left = `${position.x}px`;
      this.cursorDecorator.style.top = `${position.y}px`;
      this.cursorDecorator.style.height = `${position.height}px`;
    } else {
      this.showCursorDecorator(modelOffset);
    }
  }
}
```

**장점**:
- ✅ **사용자 경험**: 사용자는 커서가 렌더링 영역에 있는 것처럼 보임
- ✅ **완전한 분리**: 편집 레이어는 완전히 투명하므로 어떤 텍스트를 입력하더라도 보이지 않음
- ✅ **커서 제어**: 커서를 decorator로 완전히 제어 가능 (애니메이션, 스타일 등)
- ✅ **렌더링 영역 독립성**: 렌더링 영역은 편집 레이어와 완전히 독립적으로 동작

**동작 방식**:
1. 사용자가 편집 레이어에서 텍스트 입력
2. 편집 레이어는 완전히 투명하므로 텍스트가 보이지 않음
3. 편집 레이어의 커서 위치를 모델 offset으로 변환
4. 렌더링 영역에 커서 decorator 표시
5. 사용자는 커서가 렌더링 영역에 있는 것처럼 보임
6. 입력된 텍스트는 모델로 변환되어 렌더링 영역에 표시됨

---

## 4. Advantages

### 4.1 완전한 분리

- ✅ **렌더링 영역**: ContentEditable 없이 모델 기반 렌더링 (단방향 데이터 흐름)
- ✅ **편집 레이어**: ContentEditable로 입력만 담당 (IME 완벽 지원)
- ✅ **독립적 관리**: 각 영역이 독립적으로 동작하여 문제 해결 용이

### 4.2 사용자 경험 유지

- ✅ **기존 습관 유지**: 키보드로 특정 영역에 텍스트 입력
- ✅ **커서 표시**: 커서 decorator로 렌더링 영역에 표시 (사용자는 커서가 렌더링 영역에 있는 것처럼 보임)
- ✅ **완전한 투명성**: 편집 레이어는 완전히 투명하므로 어떤 텍스트를 입력하더라도 보이지 않음
- ✅ **IME 지원**: ContentEditable이 자연스럽게 IME 처리

### 4.3 Selection/Cursor 관리 단순화

- ✅ **렌더링 영역**: Selection/Cursor decorator로 표시 (읽기 전용)
- ✅ **편집 레이어**: 브라우저 Selection API 활용 (ContentEditable, 완전히 투명)
- ✅ **동기화**: 편집 레이어의 커서 위치를 모델 offset으로 변환하여 렌더링 영역에 decorator로 표시
- ✅ **커서 제어**: 커서 decorator로 완전한 제어 가능 (애니메이션, 스타일 등)

### 4.4 이중 상태 관리 제거

- ✅ **렌더링 영역**: 모델 → DOM (단방향)
- ✅ **편집 레이어**: 입력 → 모델 (단방향)
- ✅ **동기화**: 편집 레이어 → 모델 → 렌더링 영역 (명확한 흐름)

---

## 5. Challenges

### 5.1 동기화 복잡성

**문제**: 렌더링 영역과 편집 레이어를 동기화해야 함

**해결 방안**:
- 편집 레이어의 텍스트를 모델과 항상 동기화
- 모델 변경 시 편집 레이어도 업데이트
- 커서 위치를 정확히 계산하여 동기화

### 5.2 위치 계산 불필요 ✅

**핵심**: 편집 레이어가 렌더링 영역과 **완전히 동일한 구조**로 되어 있으므로 위치 계산이 필요 없습니다.

**이유**:
- 편집 레이어는 렌더링 영역의 구조를 복제
- inline-text 안에서 텍스트가 동일하게 유지
- 단지 투명하게만 만들면 됨
- 구조가 동일하므로 커서 위치도 자동으로 맞춰짐

**구현**:
- 렌더링 영역의 DOM 구조를 그대로 복제
- 모든 스타일도 동일하게 적용 (투명하게만 설정)
- 실시간 동기화로 항상 동일한 구조 유지

### 5.3 성능

**문제**: 두 개의 레이어를 관리해야 하므로 성능 오버헤드 가능

**해결 방안**:
- **렌더링 지속 가능**: 렌더링 영역은 지속적으로 렌더링해도 상관없음 (편집 레이어와 분리되어 있으므로)
- **실시간 동기화 최적화**: MutationObserver로 변경사항만 감지
- **구조 복제 최적화**: 렌더링 영역의 구조를 효율적으로 복제
- **가상화**: 보이는 부분만 렌더링 (선택적)

### 5.4 복잡한 레이아웃

**문제**: 복잡한 레이아웃(표, 이미지 등)에서 위치 계산이 어려울 수 있음

**해결 방안**:
- 각 블록 요소를 별도의 편집 레이어로 분리
- 또는 편집 레이어를 텍스트 영역에만 제한

---

## 6. Implementation Details

### 6.1 편집 레이어 초기화

```typescript
class EditLayer {
  initialize(): void {
    // 1. 렌더링 영역의 텍스트를 편집 레이어에 복사
    const text = this.model.getText();
    this.editElement.textContent = text;
    
    // 2. 스타일 동기화
    this.syncStyles();
    
    // 3. 커서 위치 설정
    this.setCursorOffset(0);
  }
  
  syncStyles(): void {
    // 렌더링 영역의 스타일을 편집 레이어에 복사
    const renderStyles = window.getComputedStyle(this.renderLayer.container);
    
    this.editElement.style.fontFamily = renderStyles.fontFamily;
    this.editElement.style.fontSize = renderStyles.fontSize;
    this.editElement.style.lineHeight = renderStyles.lineHeight;
    this.editElement.style.padding = renderStyles.padding;
    this.editElement.style.margin = renderStyles.margin;
    // ... 기타 스타일
  }
}
```

### 6.2 실시간 동기화 구현

```typescript
class SyncManager {
  // 실시간 동기화 설정
  setupRealtimeSync(): void {
    // 1. 편집 레이어 → 모델 → 렌더링 영역 (입력 시)
    this.editLayer.onInput(() => {
      // 모델 업데이트
      this.updateModelFromEditLayer();
      
      // 렌더링 영역 즉시 업데이트 (지속적으로 렌더링 가능)
      this.renderLayer.render();
      
      // 편집 레이어 재동기화 (렌더링 영역과 동일하게)
      this.editLayer.syncContentFromRender();
    });
    
    // 2. 모델 변경 → 렌더링 영역 → 편집 레이어 (외부 변경 시)
    this.model.onChange(() => {
      // 렌더링 영역 즉시 업데이트
      this.renderLayer.render();
      
      // 편집 레이어 실시간 동기화
      this.editLayer.syncContentFromRender();
    });
    
    // 3. 렌더링 영역 변경 감지 (MutationObserver)
    const observer = new MutationObserver(() => {
      // 렌더링 영역이 변경되면 편집 레이어도 즉시 동기화
      this.editLayer.syncContentFromRender();
    });
    
    observer.observe(this.renderLayer.container, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
  
  // 편집 레이어에서 모델로 업데이트
  updateModelFromEditLayer(): void {
    const editText = this.editLayer.getText();
    const modelText = this.model.getText();
    
    if (editText !== modelText) {
      const changes = this.calculateChanges(modelText, editText);
      this.applyChangesToModel(changes);
    }
  }
}
```

**핵심**: 실시간 동기화로 편집 레이어와 렌더링 영역이 항상 동일한 구조를 유지합니다.

### 6.3 커서 및 Selection 표시

```typescript
class RenderLayer {
  private cursorDecorator: HTMLElement | null = null;
  private selectionHighlights: HTMLElement[] = [];
  
  // 커서 decorator 표시
  showCursorDecorator(modelOffset: number): void {
    // 기존 커서 decorator 제거
    this.hideCursorDecorator();
    
    // 모델 offset을 DOM 위치로 변환
    const position = this.getCursorPosition(modelOffset);
    
    // 커서 decorator 생성
    this.cursorDecorator = document.createElement('div');
    this.cursorDecorator.className = 'cursor-decorator';
    this.cursorDecorator.style.cssText = `
      position: absolute;
      left: ${position.x}px;
      top: ${position.y}px;
      width: 2px;
      height: ${position.height}px;
      background: #000;
      pointer-events: none;
      z-index: 100;
      animation: blink 1s infinite;
    `;
    
    // 커서 decorator를 렌더링 영역에 추가
    this.container.appendChild(this.cursorDecorator);
  }
  
  // 커서 decorator 제거
  hideCursorDecorator(): void {
    if (this.cursorDecorator) {
      this.cursorDecorator.remove();
      this.cursorDecorator = null;
    }
  }
  
  // 커서 위치 업데이트
  updateCursorDecorator(modelOffset: number): void {
    const position = this.getCursorPosition(modelOffset);
    
    if (this.cursorDecorator) {
      this.cursorDecorator.style.left = `${position.x}px`;
      this.cursorDecorator.style.top = `${position.y}px`;
      this.cursorDecorator.style.height = `${position.height}px`;
    } else {
      this.showCursorDecorator(modelOffset);
    }
  }
  
  // Selection을 렌더링 영역에 표시
  renderSelection(selection: ModelSelection): void {
    // 기존 Selection 제거
    this.clearSelection();
    
    // 모델 Selection을 DOM 위치로 변환
    const ranges = this.getTextRange(selection.anchor, selection.focus);
    
    // Selection 하이라이트 표시
    for (const range of ranges) {
      const highlight = document.createElement('div');
      highlight.className = 'selection-highlight';
      highlight.style.cssText = `
        position: absolute;
        left: ${range.left}px;
        top: ${range.top}px;
        width: ${range.width}px;
        height: ${range.height}px;
        background: rgba(0, 0, 255, 0.2);
        pointer-events: none;
        z-index: 50;
      `;
      this.container.appendChild(highlight);
      this.selectionHighlights.push(highlight);
    }
  }
  
  // Selection 제거
  clearSelection(): void {
    for (const highlight of this.selectionHighlights) {
      highlight.remove();
    }
    this.selectionHighlights = [];
  }
}
```

**핵심**: 커서와 Selection을 decorator로 렌더링 영역에 표시하여, 사용자는 편집 레이어의 존재를 전혀 느끼지 못하고 렌더링 영역에서 직접 편집하는 것처럼 보이게 할 수 있습니다.

### 6.4 IME 처리

```typescript
class EditLayer {
  handleCompositionStart(event: CompositionEvent): void {
    // IME 조합 시작
    // 편집 레이어가 ContentEditable이므로 자연스럽게 처리됨
    // 편집 레이어는 완전히 투명하므로 조합 중인 텍스트도 보이지 않음
    // 렌더링 영역은 변경하지 않음
  }
  
  handleCompositionUpdate(event: CompositionEvent): void {
    // IME 조합 중
    // 편집 레이어에서만 처리 (완전히 투명하므로 보이지 않음)
    // 커서 decorator는 계속 업데이트됨
    const modelOffset = this.getCurrentModelOffset();
    this.renderLayer.updateCursorDecorator(modelOffset);
    
    // 렌더링 영역은 변경하지 않음
  }
  
  handleCompositionEnd(event: CompositionEvent): void {
    // IME 조합 완료
    // 편집 레이어의 변경사항을 모델로 동기화
    const newText = this.editElement.textContent || '';
    const oldText = this.model.getText();
    
    // 변경사항 계산 및 모델 업데이트
    this.syncToModel(newText, oldText);
    
    // 렌더링 영역 업데이트 (조합 완료된 텍스트 표시)
    this.renderLayer.render();
    
    // 편집 레이어 재동기화
    this.syncContentFromRender();
    
    // 커서 decorator 업데이트
    const modelOffset = this.getCurrentModelOffset();
    this.renderLayer.updateCursorDecorator(modelOffset);
  }
}
```

**핵심**: IME 조합 중에도 편집 레이어는 완전히 투명하므로 조합 중인 텍스트가 보이지 않습니다. 조합 완료 후에만 렌더링 영역에 텍스트가 표시됩니다.

---

## 7. EditableSimulator: 개념 정의

### 7.1 EditableSimulator란?

**EditableSimulator**는 렌더링 영역 위에 투명한 ContentEditable 레이어를 덮어씌워 편집 기능을 시뮬레이션하는 도구입니다.

**핵심 특징**:
- **Editable에 대한 것만 처리**: 편집 기능(입력, 커서, Selection)만 담당
- **원본 구조 복제**: 렌더링 영역의 구조를 그대로 본떠서 에디팅 가능한 상태로 조합
- **투명성 활용**: 완전히 투명하므로 커서 위치/Selection만 맞으면 하위 구조는 크게 신경 쓰지 않아도 됨
- **외부 편집 도구**: 디자인 툴의 사이드바, 속성 창처럼 외부에서 모델을 편집하는 새로운 도구 개념

### 7.2 디자인 툴과의 유사성

**디자인 툴 (Figma, Sketch 등)**:
- 왼쪽: 트리 구조 (문서 구조)
- 오른쪽: 속성 창 (선택한 요소의 속성)
- 중앙: 캔버스 (렌더링 영역)

**EditableSimulator**:
- 렌더링 영역: 모델 기반 렌더링 (캔버스와 유사)
- EditableSimulator: 투명한 편집 레이어 (외부 편집 도구와 유사)
- 모델: 중앙 데이터 구조 (트리 구조와 유사)

**차이점**: 디자인 툴은 속성 창에서 직접 모델을 편집하지만, EditableSimulator는 **키보드 입력을 통해 모델을 편집**합니다.

### 7.3 구조 복제 전략

```typescript
class EditableSimulator {
  private renderLayer: RenderLayer;
  private editLayer: HTMLElement;
  
  // 원본 구조를 그대로 본떠서 에디팅 가능한 상태로 조합
  createEditableLayer(): HTMLElement {
    // 1. 렌더링 영역의 구조를 복제
    const cloned = this.renderLayer.container.cloneNode(true) as HTMLElement;
    
    // 2. ContentEditable 적용
    cloned.contentEditable = 'true';
    
    // 3. 투명하게 설정
    cloned.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      color: transparent;
      background: transparent;
      caret-color: transparent;
      pointer-events: auto;
      z-index: 10;
    `;
    
    return cloned;
  }
  
  // 커서 위치/Selection만 맞추면 하위는 크게 상관 없음
  syncCursorAndSelection(): void {
    // 편집 레이어의 커서 위치를 모델 offset으로 변환
    const modelOffset = this.getModelOffsetFromEditLayer();
    
    // 렌더링 영역에 커서 decorator 표시
    this.renderLayer.showCursorDecorator(modelOffset);
    
    // Selection도 동일하게 처리
    const selection = this.getSelectionFromEditLayer();
    if (selection) {
      this.renderLayer.renderSelection(selection);
    }
  }
}
```

**핵심**: EditableSimulator는 **원본 구조를 복제**하여 편집 가능하게 만들지만, 실제로는 **커서 위치와 Selection만 정확히 맞추면** 하위 구조가 완전히 동일하지 않아도 작동할 수 있습니다. 투명하므로 사용자는 하위 구조의 차이를 느끼지 못합니다.

### 7.4 기존 시도와의 비교

**현재까지의 조사 결과**:
- 직접적으로 동일한 시도를 하는 곳은 확인되지 않음
- 유사한 개념으로는:
  - **WebView**: 웹 콘텐츠를 애플리케이션에 통합하는 기술 (렌더링과 편집의 분리와는 다름)
  - **WYSIWYG 에디터**: ContentEditable을 직접 사용 (렌더링과 편집이 분리되지 않음)
  - **디자인 툴의 속성 창**: 외부에서 모델을 편집 (키보드 입력이 아닌 속성 편집)

**EditableSimulator의 차별점**:
- ✅ 렌더링 영역과 편집 레이어의 **완전한 분리**
- ✅ 투명한 편집 레이어로 **사용자 경험 유지**
- ✅ 키보드 입력을 통한 **자연스러운 편집**
- ✅ 커서 위치/Selection만 맞추면 **하위 구조는 크게 신경 쓰지 않아도 됨**

---

## 8. EditableSimulator 동기화 전략

### 8.1 동기화의 핵심 과제

EditableSimulator의 동기화는 다음 세 가지 핵심 과제를 해결해야 합니다:

1. **구조 동기화**: 렌더링 영역의 DOM 구조를 EditableSimulator에 복제
2. **커서/Selection 동기화**: EditableSimulator의 커서 위치를 렌더링 영역에 decorator로 표시
3. **내용 동기화**: EditableSimulator의 입력을 모델로 변환하고, 모델 변경을 렌더링 영역에 반영

### 8.2 구조 복제 전략

#### 8.2.1 완전 복제 vs 최소 복제

**완전 복제 (Full Clone)**:
```typescript
class EditableSimulator {
  // 렌더링 영역의 전체 구조를 그대로 복제
  cloneRenderStructure(): HTMLElement {
    return this.renderLayer.container.cloneNode(true) as HTMLElement;
  }
}
```

**장점**:
- ✅ 구조가 완전히 동일하므로 커서 위치 계산이 정확함
- ✅ 복잡한 레이아웃에서도 안정적

**단점**:
- ❌ 성능 오버헤드 (큰 문서의 경우)
- ❌ 불필요한 요소까지 복제

**최소 복제 (Minimal Clone)**:
```typescript
class EditableSimulator {
  // 텍스트 노드와 기본 구조만 복제
  cloneRenderStructure(): HTMLElement {
    const cloned = document.createElement('div');
    
    // 텍스트 노드만 추출하여 복제
    const textNodes = this.extractTextNodes(this.renderLayer.container);
    for (const textNode of textNodes) {
      const span = document.createElement('span');
      span.textContent = textNode.textContent;
      cloned.appendChild(span);
    }
    
    return cloned;
  }
}
```

**장점**:
- ✅ 성능 최적화
- ✅ 필요한 부분만 복제

**단점**:
- ❌ 구조가 다를 수 있어 커서 위치 계산이 복잡해질 수 있음
- ❌ 복잡한 레이아웃에서 문제 발생 가능

**권장 전략**: **하이브리드 접근법**
- 기본적으로는 **완전 복제**를 사용하여 정확성 보장
- 성능이 중요한 경우 **텍스트 영역만 최소 복제**하고, 커서 위치는 **렌더링 영역의 실제 DOM 위치를 참조**하여 계산

#### 8.2.2 투명성 활용: 하위 구조 완전 동일 불필요

**핵심 인사이트**: EditableSimulator가 완전히 투명하므로, **커서 위치와 Selection만 정확히 맞추면** 하위 구조가 완전히 동일하지 않아도 됩니다.

```typescript
class EditableSimulator {
  // 커서 위치만 맞추면 하위 구조는 크게 상관 없음
  syncCursorAndSelection(): void {
    // 1. EditableSimulator의 커서 위치를 모델 offset으로 변환
    const modelOffset = this.getModelOffsetFromEditLayer();
    
    // 2. 모델 offset을 렌더링 영역의 실제 DOM 위치로 변환
    const renderPosition = this.renderLayer.getCursorPosition(modelOffset);
    
    // 3. 렌더링 영역에 커서 decorator 표시 (실제 DOM 위치 사용)
    this.renderLayer.showCursorDecorator(renderPosition);
    
    // EditableSimulator의 하위 구조가 렌더링 영역과 다르더라도
    // 커서 decorator는 렌더링 영역의 실제 위치에 표시되므로 문제 없음
  }
}
```

**이유**:
- EditableSimulator는 투명하므로 사용자는 하위 구조를 보지 못함
- 커서 decorator는 렌더링 영역의 실제 DOM 위치에 표시됨
- Selection도 동일하게 렌더링 영역의 실제 DOM 위치를 사용

**결론**: EditableSimulator의 구조는 **커서 위치 계산을 위한 참조**로만 사용하고, 실제 표시는 **렌더링 영역의 DOM 위치**를 사용합니다.

### 8.3 커서/Selection 동기화 전략

#### 8.3.1 커서 위치 동기화

**방법 1: 모델 Offset 기반 (권장)**
```typescript
class EditableSimulator {
  syncCursor(): void {
    // 1. EditableSimulator의 커서 위치를 모델 offset으로 변환
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    const modelOffset = this.convertToModelOffset(range);
    
    // 2. 모델 offset을 렌더링 영역의 DOM 위치로 변환
    const renderPosition = this.renderLayer.getCursorPosition(modelOffset);
    
    // 3. 렌더링 영역에 커서 decorator 표시
    this.renderLayer.showCursorDecorator(renderPosition);
  }
  
  // EditableSimulator의 DOM 위치를 모델 offset으로 변환
  convertToModelOffset(range: Range): number {
    // EditableSimulator의 텍스트 노드를 순회하며 offset 계산
    // 렌더링 영역과 구조가 동일하다고 가정
    let offset = 0;
    const walker = document.createTreeWalker(
      this.editElement,
      NodeFilter.SHOW_TEXT
    );
    
    let node;
    while ((node = walker.nextNode())) {
      if (range.startContainer === node) {
        offset += range.startOffset;
        break;
      }
      offset += node.textContent?.length || 0;
    }
    
    return offset;
  }
}
```

**방법 2: 직접 DOM 위치 참조**
```typescript
class EditableSimulator {
  syncCursor(): void {
    // 1. EditableSimulator의 커서 위치를 렌더링 영역의 해당 위치로 매핑
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    
    // 2. EditableSimulator의 텍스트 노드를 렌더링 영역의 해당 텍스트 노드로 매핑
    const renderTextNode = this.mapToRenderTextNode(range.startContainer);
    const renderOffset = range.startOffset;
    
    // 3. 렌더링 영역의 실제 DOM 위치 계산
    const renderPosition = this.calculateRenderPosition(renderTextNode, renderOffset);
    
    // 4. 커서 decorator 표시
    this.renderLayer.showCursorDecorator(renderPosition);
  }
  
  // EditableSimulator의 텍스트 노드를 렌더링 영역의 텍스트 노드로 매핑
  mapToRenderTextNode(editTextNode: Node): Text {
    // EditableSimulator와 렌더링 영역의 구조가 동일하다고 가정
    // 같은 위치의 텍스트 노드를 찾음
    const editPath = this.getNodePath(editTextNode, this.editElement);
    return this.findNodeByPath(editPath, this.renderLayer.container) as Text;
  }
}
```

**권장 전략**: **방법 1 (모델 Offset 기반)**이 더 안정적입니다. 모델 offset을 중간 단계로 사용하면 EditableSimulator와 렌더링 영역의 구조가 다르더라도 정확한 위치를 계산할 수 있습니다.

#### 8.3.2 Selection 동기화

```typescript
class EditableSimulator {
  syncSelection(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    
    // 1. EditableSimulator의 Selection을 모델 Selection으로 변환
    const anchorOffset = this.convertToModelOffset({
      container: range.startContainer,
      offset: range.startOffset
    });
    const focusOffset = this.convertToModelOffset({
      container: range.endContainer,
      offset: range.endOffset
    });
    
    // 2. 모델 Selection을 렌더링 영역의 DOM 위치로 변환
    const renderRanges = this.renderLayer.getTextRange(anchorOffset, focusOffset);
    
    // 3. 렌더링 영역에 Selection 하이라이트 표시
    this.renderLayer.renderSelection(renderRanges);
  }
}
```

### 8.4 내용 동기화 전략

#### 8.4.1 입력 시 동기화 (EditableSimulator → 모델 → 렌더링 영역)

```typescript
class EditableSimulator {
  handleInput(event: InputEvent): void {
    // 1. EditableSimulator의 변경사항을 모델로 변환
    const changes = this.calculateChanges(event);
    
    // 2. 모델 업데이트
    this.model.applyChanges(changes);
    
    // 3. 렌더링 영역 업데이트
    this.renderLayer.render();
    
    // 4. EditableSimulator 재동기화 (렌더링 영역과 동일하게)
    // ⚠️ 중요: 커서 위치를 먼저 저장
    const savedCursorOffset = this.getCurrentModelOffset();
    
    // 5. EditableSimulator 내용 재동기화
    this.syncContentFromRender();
    
    // 6. 커서 위치 복원
    this.restoreCursorPosition(savedCursorOffset);
  }
  
  // 렌더링 영역의 내용을 EditableSimulator에 동기화
  syncContentFromRender(): void {
    // 방법 1: 완전 재생성 (간단하지만 성능 오버헤드)
    this.editElement.innerHTML = '';
    const cloned = this.renderLayer.container.cloneNode(true) as HTMLElement;
    this.editElement.appendChild(cloned);
    
    // 방법 2: 차이점만 업데이트 (복잡하지만 성능 최적화)
    // this.updateDiff(this.editElement, this.renderLayer.container);
  }
}
```

**타이밍 고려사항**:
- 입력 이벤트 직후 즉시 동기화하면 IME 조합이 깨질 수 있음
- `compositionend` 이후에 동기화하는 것이 안전
- 일반 입력은 즉시 동기화 가능

#### 8.4.2 외부 모델 변경 시 동기화 (모델 → 렌더링 영역 → EditableSimulator)

```typescript
class EditableSimulator {
  handleModelChange(): void {
    // 1. 렌더링 영역 업데이트
    this.renderLayer.render();
    
    // 2. 커서 위치 저장
    const savedCursorOffset = this.getCurrentModelOffset();
    
    // 3. EditableSimulator 내용 재동기화
    this.syncContentFromRender();
    
    // 4. 커서 위치 복원
    this.restoreCursorPosition(savedCursorOffset);
  }
  
  // 커서 위치 복원
  restoreCursorPosition(modelOffset: number): void {
    // 모델 offset을 EditableSimulator의 DOM 위치로 변환
    const editPosition = this.convertToEditPosition(modelOffset);
    
    // Selection 설정
    const range = document.createRange();
    range.setStart(editPosition.textNode, editPosition.offset);
    range.setEnd(editPosition.textNode, editPosition.offset);
    
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    
    // 렌더링 영역에도 커서 decorator 업데이트
    const renderPosition = this.renderLayer.getCursorPosition(modelOffset);
    this.renderLayer.showCursorDecorator(renderPosition);
  }
}
```

### 8.5 IME 조합 중 동기화

**핵심 원칙**: IME 조합 중에는 EditableSimulator의 내용을 변경하지 않습니다.

```typescript
class EditableSimulator {
  private isComposing: boolean = false;
  
  handleCompositionStart(): void {
    this.isComposing = true;
    // IME 조합 중에는 동기화 중지
  }
  
  handleCompositionUpdate(): void {
    // 커서 위치만 업데이트 (내용은 변경하지 않음)
    const modelOffset = this.getCurrentModelOffset();
    const renderPosition = this.renderLayer.getCursorPosition(modelOffset);
    this.renderLayer.updateCursorDecorator(renderPosition);
  }
  
  handleCompositionEnd(): void {
    this.isComposing = false;
    
    // 조합 완료 후에만 동기화
    this.handleInput({
      type: 'compositionend',
      data: this.getComposedText()
    } as InputEvent);
  }
  
  handleInput(event: InputEvent): void {
    // IME 조합 중이면 동기화 건너뜀
    if (this.isComposing) {
      return;
    }
    
    // 정상 동기화 진행
    // ...
  }
}
```

### 8.6 성능 최적화 전략

#### 8.6.1 지연 동기화 (Debounced Sync)

```typescript
class EditableSimulator {
  private syncTimer: number | null = null;
  
  scheduleSync(): void {
    // 동기화를 지연시켜 빠른 연속 입력 시 성능 최적화
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }
    
    this.syncTimer = window.setTimeout(() => {
      this.performSync();
      this.syncTimer = null;
    }, 16); // ~60fps
  }
}
```

**주의사항**: 커서 위치는 즉시 업데이트해야 하므로, 커서 동기화는 지연하지 않습니다.

#### 8.6.2 부분 동기화 (Partial Sync)

```typescript
class EditableSimulator {
  // 변경된 부분만 동기화
  syncPartial(changes: Change[]): void {
    for (const change of changes) {
      // 변경된 텍스트 노드만 업데이트
      const editNode = this.findNodeByModelOffset(change.offset);
      const renderNode = this.renderLayer.findNodeByModelOffset(change.offset);
      
      // EditableSimulator의 해당 노드만 업데이트
      editNode.textContent = renderNode.textContent;
    }
  }
}
```

#### 8.6.3 가상화 (Virtualization)

```typescript
class EditableSimulator {
  // 보이는 부분만 EditableSimulator에 복제
  syncVisibleOnly(): void {
    const viewport = this.getViewport();
    const visibleNodes = this.getVisibleNodes(viewport);
    
    // 보이는 노드만 EditableSimulator에 복제
    for (const node of visibleNodes) {
      this.cloneNodeToEditLayer(node);
    }
  }
}
```

#### 8.6.4 돋보기 방식 (Magnifying Glass)

**참고**: 돋보기 방식에 대한 자세한 내용은 [8.8 돋보기 방식: 부분 EditableSimulator](#88-돋보기-방식-부분-editablesimulator) 섹션을 참조하세요.

**핵심**: 커서 주변의 일부분만 EditableSimulator로 활성화하여 성능을 최적화합니다.

### 8.7 동기화 전략 비교

| 전략 | 정확성 | 성능 | 복잡도 | 권장 사용 |
|------|--------|------|--------|----------|
| 완전 복제 | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | 기본 전략 |
| 최소 복제 | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | 성능 중요 시 |
| 모델 Offset 기반 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | 권장 |
| 직접 DOM 참조 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 구조 동일 보장 시 |
| 지연 동기화 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | 빠른 입력 시 |
| 부분 동기화 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 대용량 문서 |
| **돋보기 방식 (하이브리드)** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | **대용량 문서, 권장** |

**권장 조합**:
- **MVP (초기 구현)**: **완전 복제 + 모델 Offset 기반 + 즉시 동기화** ⭐ **권장 시작점**
- 성능 최적화: **최소 복제 + 모델 Offset 기반 + 지연 동기화**
- 대용량 문서 (성능 문제 확인 후): **돋보기 방식 (하이브리드) + 모델 Offset 기반**

**⚠️ 중요**: 
- 돋보기 방식은 참고할 만한 구현 사례가 없으므로, **초기에는 전체 EditableSimulator로 시작**하고, 실제 성능 문제가 발생하면 최적화를 고려하는 것을 권장합니다.
- **더 중요한 고려사항**: 입력 중 decorator 실시간 적용이 정말 필요한지 확인하세요. 만약 불필요하다면 **EditableSimulator 자체가 필요 없을 수 있습니다** (8.9 섹션 참조).

### 8.8 돋보기 방식: 부분 EditableSimulator

#### 8.8.1 개념

**핵심 아이디어**: EditableSimulator를 전체 문서가 아닌 **커서 주변의 일부분만** 렌더링하는 방식입니다. 마치 돋보기처럼 커서 위치 주변만 확대하여 편집 가능하게 만드는 것입니다.

**장점**:
- ✅ 성능 최적화: 전체 문서를 복제하지 않으므로 메모리와 CPU 사용량 감소
- ✅ 빠른 응답: 작은 영역만 관리하므로 동기화 속도 향상
- ✅ 대용량 문서 지원: 문서 크기에 관계없이 일정한 성능 유지

**문제점**:
- ❌ 드래그나 영역 선택 시 문제: Selection이 EditableSimulator 영역을 벗어나면 처리 어려움
- ❌ 긴 텍스트 입력 시: 커서가 EditableSimulator 영역을 벗어나면 재생성 필요

#### 8.8.2 하이브리드 접근법: 커서 vs Selection

**해결책**: **커서가 있을 때만** EditableSimulator를 활성화하고, **Selection이 있을 때는** EditableSimulator를 비활성화하고 렌더링 영역을 직접 사용합니다.

```typescript
class EditableSimulator {
  private isActive: boolean = false;
  private viewport: HTMLElement | null = null; // 돋보기 영역
  
  // Selection 상태에 따라 EditableSimulator 활성화/비활성화
  handleSelectionChange(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      // Selection이 없으면 EditableSimulator 비활성화
      this.deactivate();
      return;
    }
    
    const range = selection.getRangeAt(0);
    
    // Selection이 있으면 (드래그 중)
    if (!range.collapsed) {
      // EditableSimulator 비활성화하고 렌더링 영역 직접 사용
      this.deactivate();
      this.renderLayer.renderSelection(range);
      return;
    }
    
    // 커서만 있으면 (collapsed Selection)
    // EditableSimulator 활성화 (돋보기 방식)
    this.activateAtCursor(range);
  }
  
  // 커서 위치에서 EditableSimulator 활성화
  activateAtCursor(range: Range): void {
    // 1. 커서 위치 주변의 텍스트 노드 추출
    const contextNodes = this.getContextNodes(range, {
      before: 100,  // 커서 앞 100자
      after: 100    // 커서 뒤 100자
    });
    
    // 2. 돋보기 영역 생성
    this.viewport = this.createViewport(contextNodes);
    
    // 3. EditableSimulator 활성화
    this.isActive = true;
    this.setupEditableSimulator(this.viewport);
  }
  
  // EditableSimulator 비활성화
  deactivate(): void {
    if (this.viewport) {
      this.viewport.remove();
      this.viewport = null;
    }
    this.isActive = false;
  }
  
  // 커서 주변의 텍스트 노드 추출
  getContextNodes(range: Range, context: { before: number; after: number }): Node[] {
    const nodes: Node[] = [];
    const modelOffset = this.convertToModelOffset(range);
    
    // 커서 앞의 텍스트 노드들
    const beforeNodes = this.renderLayer.getTextNodes(
      modelOffset - context.before,
      modelOffset
    );
    
    // 커서 뒤의 텍스트 노드들
    const afterNodes = this.renderLayer.getTextNodes(
      modelOffset,
      modelOffset + context.after
    );
    
    return [...beforeNodes, ...afterNodes];
  }
  
  // 돋보기 영역 생성
  createViewport(nodes: Node[]): HTMLElement {
    const viewport = document.createElement('div');
    viewport.className = 'editable-simulator-viewport';
    viewport.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      pointer-events: auto;
      z-index: 10;
    `;
    
    // 노드들을 복제하여 viewport에 추가
    for (const node of nodes) {
      const cloned = node.cloneNode(true);
      viewport.appendChild(cloned);
    }
    
    viewport.contentEditable = 'true';
    this.renderLayer.container.appendChild(viewport);
    
    return viewport;
  }
}
```

#### 8.8.3 동작 흐름

**시나리오 1: 커서만 있을 때**
```
1. 사용자가 텍스트 영역 클릭
2. Selection이 collapsed (커서만 있음)
3. EditableSimulator 활성화 (커서 주변만)
4. 사용자가 입력하면 EditableSimulator에서 처리
5. 입력 완료 후 모델 업데이트 → 렌더링 영역 업데이트
6. EditableSimulator 재동기화 (커서 주변만)
```

**시나리오 2: 드래그로 Selection 만들 때**
```
1. 사용자가 텍스트 드래그 시작
2. Selection이 생성됨 (collapsed = false)
3. EditableSimulator 즉시 비활성화
4. 렌더링 영역에서 직접 Selection 표시 (하이라이트)
5. 드래그 완료 후 Selection 유지 (렌더링 영역에서)
```

**시나리오 3: 드래그 후 다시 입력**
```
1. Selection이 있는 상태
2. 사용자가 키 입력 (예: 타이핑)
3. Selection을 삭제하고 입력된 텍스트로 교체
4. Selection이 collapsed로 변경됨
5. EditableSimulator 활성화 (새 커서 위치 주변)
```

#### 8.8.4 커서 이동 시 EditableSimulator 재생성

```typescript
class EditableSimulator {
  private lastCursorOffset: number = -1;
  
  handleCursorMove(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    if (!range.collapsed) return; // Selection이 있으면 무시
    
    const currentOffset = this.convertToModelOffset(range);
    
    // 커서가 EditableSimulator 영역을 벗어났는지 확인
    if (this.isOutOfViewport(currentOffset)) {
      // EditableSimulator 재생성 (새 커서 위치 주변)
      this.deactivate();
      this.activateAtCursor(range);
    }
    
    // 커서 위치만 업데이트 (EditableSimulator 내부)
    this.updateCursorInViewport(range);
    
    this.lastCursorOffset = currentOffset;
  }
  
  // 커서가 EditableSimulator 영역을 벗어났는지 확인
  isOutOfViewport(offset: number): boolean {
    if (!this.viewport) return true;
    
    const viewportStart = this.getViewportStartOffset();
    const viewportEnd = this.getViewportEndOffset();
    
    return offset < viewportStart || offset > viewportEnd;
  }
}
```

#### 8.8.5 장단점 비교

| 방식 | 장점 | 단점 | 사용 시기 |
|------|------|------|----------|
| 전체 EditableSimulator | ✅ 구조 단순<br>✅ Selection 처리 쉬움 | ❌ 성능 오버헤드<br>❌ 대용량 문서에서 느림 | 작은 문서, 단순한 구조 |
| 돋보기 방식 (커서만) | ✅ 성능 최적화<br>✅ 대용량 문서 지원<br>✅ 빠른 응답 | ❌ Selection 처리 복잡<br>❌ 커서 이동 시 재생성 필요 | 대용량 문서, 성능 중요 |
| 하이브리드 (커서/Selection 분리) | ✅ 성능 최적화<br>✅ Selection 처리 명확<br>✅ 사용자 경험 양호 | ❌ 구현 복잡도 증가<br>❌ 상태 관리 필요 | **권장** |

#### 8.8.6 구현 고려사항

**1. 커서 위치 추적**
- EditableSimulator 내부의 커서 위치를 모델 offset으로 변환
- 모델 offset을 렌더링 영역의 실제 DOM 위치로 변환하여 커서 decorator 표시

**2. Selection 처리**
- Selection이 시작되면 즉시 EditableSimulator 비활성화
- 렌더링 영역에서 직접 Selection 하이라이트 표시
- Selection 완료 후에도 EditableSimulator는 비활성화 상태 유지

**3. 입력 처리**
- Selection이 있을 때 입력하면 Selection 삭제 후 입력된 텍스트로 교체
- 이후 커서만 남으므로 EditableSimulator 활성화

**4. 성능 최적화**
- EditableSimulator 영역 크기 조절 가능 (커서 앞/뒤 문자 수)
- 커서 이동 시 재생성 임계값 설정 (일정 거리 이상 이동 시에만 재생성)

#### 8.8.7 UX 고려사항 및 대안

**문제점**: 커서 모드일 때만 EditableSimulator가 나타났다 사라지는 것이 사용자 경험상 이상할 수 있습니다.

**고려사항**:
- EditableSimulator는 완전히 투명하므로 시각적으로는 보이지 않지만
- Selection이 시작될 때 EditableSimulator가 제거되고, 커서만 남을 때 다시 생성되는 것이 자연스럽지 않을 수 있음
- 특히 빠르게 커서와 Selection을 전환할 때 성능 문제나 깜빡임이 발생할 수 있음

**대안 1: EditableSimulator 항상 유지, 비활성화만 하기**

```typescript
class EditableSimulator {
  // EditableSimulator를 제거하지 않고 비활성화만 함
  handleSelectionChange(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    
    if (!range.collapsed) {
      // Selection이 있을 때: EditableSimulator 비활성화 (제거하지 않음)
      this.disable();
      // 렌더링 영역에서 Selection 표시
      this.renderLayer.renderSelection(range);
    } else {
      // 커서만 있을 때: EditableSimulator 활성화
      this.enable();
    }
  }
  
  disable(): void {
    // pointer-events를 none으로 설정하여 입력 차단
    if (this.viewport) {
      this.viewport.style.pointerEvents = 'none';
    }
    this.isActive = false;
  }
  
  enable(): void {
    // pointer-events를 auto로 설정하여 입력 허용
    if (this.viewport) {
      this.viewport.style.pointerEvents = 'auto';
    }
    this.isActive = true;
  }
}
```

**장점**:
- ✅ EditableSimulator를 제거/생성하지 않으므로 성능 오버헤드 감소
- ✅ 전환이 부드러움
- ✅ 구조가 안정적

**단점**:
- ❌ Selection이 EditableSimulator 영역을 벗어나면 여전히 문제
- ❌ 메모리 사용량은 여전히 존재

**대안 2: Selection 영역도 EditableSimulator에 포함**

```typescript
class EditableSimulator {
  // Selection이 시작되면 Selection 영역까지 포함하여 EditableSimulator 확장
  handleSelectionStart(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    
    // Selection 범위를 포함하여 EditableSimulator 영역 확장
    const expandedRange = this.expandRangeToIncludeSelection(range);
    this.updateViewport(expandedRange);
  }
  
  expandRangeToIncludeSelection(range: Range): Range {
    const startOffset = this.convertToModelOffset({
      container: range.startContainer,
      offset: range.startOffset
    });
    const endOffset = this.convertToModelOffset({
      container: range.endContainer,
      offset: range.endOffset
    });
    
    // Selection 앞뒤로 여유 공간 추가
    return {
      start: Math.max(0, startOffset - 100),
      end: endOffset + 100
    };
  }
}
```

**장점**:
- ✅ Selection도 EditableSimulator 내에서 처리 가능
- ✅ EditableSimulator를 제거하지 않아도 됨
- ✅ 전환이 자연스러움

**단점**:
- ❌ Selection이 매우 길면 EditableSimulator 영역이 커짐
- ❌ 성능 오버헤드 증가 가능

**대안 3: 전체 EditableSimulator 유지 (성능이 중요하지 않은 경우)**

```typescript
class EditableSimulator {
  // 전체 문서를 EditableSimulator로 유지
  // Selection과 커서 모두 EditableSimulator에서 처리
  setup(): void {
    // 전체 렌더링 영역을 복제하여 EditableSimulator 생성
    this.editElement = this.renderLayer.container.cloneNode(true) as HTMLElement;
    this.editElement.contentEditable = 'true';
    // 투명하게 설정
    this.makeTransparent();
  }
  
  // Selection도 EditableSimulator에서 직접 처리
  handleSelectionChange(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    // EditableSimulator의 Selection을 렌더링 영역에 반영
    const range = selection.getRangeAt(0);
    const modelSelection = this.convertToModelSelection(range);
    this.renderLayer.renderSelection(modelSelection);
  }
}
```

**장점**:
- ✅ 구조가 가장 단순
- ✅ Selection과 커서 모두 자연스럽게 처리
- ✅ 전환 문제 없음

**단점**:
- ❌ 대용량 문서에서 성능 문제
- ❌ 메모리 사용량 증가

#### 8.8.8 권장 전략

**현재까지의 조사 결과**: 돋보기 방식(부분 EditableSimulator)을 구현한 사례는 확인되지 않았습니다.

**고려사항**:
1. **사용자 경험**: EditableSimulator가 나타났다 사라지는 것이 자연스러운가?
2. **성능**: 대용량 문서에서도 일정한 성능을 유지할 수 있는가?
3. **구현 복잡도**: 구현과 유지보수가 어려운가?

**단계적 접근 권장**:

**Phase 1: 전체 EditableSimulator (MVP)**
- 가장 단순한 구현
- 성능 문제가 실제로 발생하는지 확인
- 사용자 경험 테스트

**Phase 2: 성능 최적화 (필요 시)**
- 성능 문제가 확인되면 돋보기 방식 도입
- 또는 대안 1 (비활성화만 하기) 적용

**Phase 3: 하이브리드 (최적화)**
- 실제 사용 패턴을 분석하여 최적 전략 선택
- 커서 모드와 Selection 모드의 사용 빈도에 따라 전략 조정

**결론**: 
- **초기에는 전체 EditableSimulator로 시작**하는 것을 권장합니다.
- 실제 성능 문제가 발생하면 돋보기 방식이나 다른 최적화 전략을 고려합니다.
- 참고할 만한 구현 사례가 없으므로, 실제 프로토타입을 통해 검증하는 것이 중요합니다.

### 8.9 EditableSimulator 없이도 가능한가?

#### 8.9.1 핵심 질문: 입력 중 Decorator 실시간 적용이 필요한가?

**사용자 제안**:
- 글자를 입력할 때마다 뒤로 간다고 생각 (앞으로는 입력 불가)
- 입력 시점에서 **노출된 decorator만 그대로 두고**
- **새로 추가되는 decorator는 숨김 처리**
- 나중에 뷰 모드로 전환할 때 보여주면 됨

**핵심 목표**: 글 입력 도중에 실시간으로 decorator를 적용할 수 있느냐의 문제

#### 8.9.2 EditableSimulator가 필요한 이유 재검토

**EditableSimulator의 주요 목적**:
1. ✅ **ContentEditable을 통한 입력 처리** (IME 지원)
2. ✅ **커서 위치 관리**
3. ✅ **Selection 관리**
4. ❓ **입력 중 decorator 실시간 적용** ← **이것이 정말 필요한가?**

**만약 입력 중 decorator를 실시간으로 적용하지 않는다면**:
- 렌더링 영역에서 직접 ContentEditable을 사용할 수 있지 않을까?
- EditableSimulator가 필요한 이유가 사라질 수 있음

#### 8.9.3 Decorator 지연 적용 전략

```typescript
class RenderLayer {
  private isEditing: boolean = false;
  private pendingDecorators: Decorator[] = [];
  
  // 입력 시작
  startEditing(): void {
    this.isEditing = true;
    this.pendingDecorators = [];
    
    // 렌더링 영역을 ContentEditable로 전환
    this.container.contentEditable = 'true';
  }
  
  // 입력 중: 기존 decorator만 유지, 새 decorator는 숨김
  handleInput(event: InputEvent): void {
    // 1. 모델 업데이트
    this.updateModel(event);
    
    // 2. 기존 decorator는 그대로 유지 (이미 렌더링된 것)
    // 3. 새로 추가될 decorator는 pending에 저장 (숨김)
    const newDecorators = this.calculateNewDecorators();
    this.pendingDecorators.push(...newDecorators);
    
    // 4. 렌더링 영역 업데이트 (기존 decorator만 유지)
    this.render({
      skipNewDecorators: true,  // 새 decorator는 렌더링하지 않음
      preserveExistingDecorators: true  // 기존 decorator는 유지
    });
  }
  
  // 입력 종료 (뷰 모드로 전환)
  endEditing(): void {
    this.isEditing = false;
    
    // ContentEditable 비활성화
    this.container.contentEditable = 'false';
    
    // pending decorator 모두 적용
    this.applyPendingDecorators();
    
    // 전체 재렌더링 (모든 decorator 포함)
    this.render({
      includeAllDecorators: true
    });
  }
  
  // Pending decorator 적용
  applyPendingDecorators(): void {
    for (const decorator of this.pendingDecorators) {
      this.addDecorator(decorator);
    }
    this.pendingDecorators = [];
  }
}
```

**장점**:
- ✅ EditableSimulator 불필요
- ✅ 구조 단순화
- ✅ 성능 최적화 (입력 중 decorator 계산/렌더링 생략)
- ✅ 입력 완료 후 한 번에 decorator 적용

**단점**:
- ❌ 입력 중에는 새 decorator가 보이지 않음
- ❌ 실시간 피드백 부족

#### 8.9.4 하이브리드 접근법: 선택적 실시간 적용

```typescript
class RenderLayer {
  private decoratorApplicationMode: 'realtime' | 'deferred' = 'deferred';
  
  // 빠른 decorator는 실시간 적용, 느린 decorator는 지연
  handleInput(event: InputEvent): void {
    this.updateModel(event);
    
    // 빠른 decorator (예: syntax highlighting)는 실시간 적용
    const fastDecorators = this.calculateFastDecorators();
    this.applyDecorators(fastDecorators);
    
    // 느린 decorator (예: AI 분석, 외부 API 호출)는 지연
    const slowDecorators = this.calculateSlowDecorators();
    this.pendingDecorators.push(...slowDecorators);
    
    this.render({
      includeFastDecorators: true,
      skipSlowDecorators: true
    });
  }
}
```

#### 8.9.5 EditableSimulator vs 직접 ContentEditable 비교

| 방식 | EditableSimulator | 직접 ContentEditable |
|------|-------------------|---------------------|
| **구조 복잡도** | ⭐⭐⭐⭐ (복잡) | ⭐⭐ (단순) |
| **성능** | ⭐⭐⭐ (동기화 오버헤드) | ⭐⭐⭐⭐⭐ (오버헤드 없음) |
| **입력 중 decorator** | ✅ 실시간 적용 가능 | ⚠️ 지연 적용 가능 |
| **IME 지원** | ✅ 완벽 | ✅ 완벽 |
| **Selection 관리** | ⭐⭐⭐ (복잡) | ⭐⭐⭐⭐ (단순) |
| **커서 관리** | ⭐⭐⭐ (복잡) | ⭐⭐⭐⭐⭐ (브라우저 기본) |

#### 8.9.6 권장 전략

**핵심 질문**: 입력 중 decorator 실시간 적용이 정말 필요한가?

**시나리오별 권장**:

1. **입력 중 decorator 실시간 적용 불필요**
   - ✅ **직접 ContentEditable 사용** (EditableSimulator 불필요)
   - ✅ 구조 단순, 성능 최적화
   - ✅ 입력 완료 후 decorator 적용

2. **일부 decorator만 실시간 적용 필요**
   - ✅ **하이브리드 접근법**: 빠른 decorator는 실시간, 느린 decorator는 지연
   - ✅ 직접 ContentEditable 사용
   - ✅ EditableSimulator 불필요

3. **모든 decorator 실시간 적용 필요**
   - ⚠️ **EditableSimulator 고려**
   - ⚠️ 성능 오버헤드 감수
   - ⚠️ 구조 복잡도 증가

**결론**:
- **입력 중 decorator를 실시간으로 적용하지 않는다면 EditableSimulator는 필요 없습니다.**
- 렌더링 영역에서 직접 ContentEditable을 사용하고, 입력 완료 후 decorator를 적용하는 방식이 더 단순하고 효율적일 수 있습니다.
- 실제 요구사항에 따라 선택하되, **기본적으로는 직접 ContentEditable을 권장**합니다.

#### 8.9.7 실시간 Decorator가 필요한 실용적 예시

**실시간 decorator 적용이 유용한 경우**:

**1. 인라인 UI 컴포넌트 (예: Color Picker)**
```typescript
// 사용자가 "#ff0000" 입력 중
// → 즉시 color picker UI가 나타나야 함
const colorDecorator = {
  type: 'color-picker',
  pattern: /#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/g,
  // 입력 중에도 실시간으로 표시되어야 함
  showRealtime: true
};
```

**사용자 경험**:
- ✅ 사용자가 색상 코드를 입력하는 즉시 미리보기 가능
- ✅ 입력 완료를 기다릴 필요 없음
- ✅ 즉각적인 피드백

**2. 협업 편집 표시 (예: 다른 유저가 편집 중)**
```typescript
// 다른 유저가 특정 영역을 편집 중
// → 실시간으로 표시되어야 함
const collaborationDecorator = {
  type: 'user-editing',
  userId: 'user-123',
  // 입력 중에도 실시간으로 표시되어야 함
  showRealtime: true
};
```

**사용자 경험**:
- ✅ 다른 유저의 편집 상태를 즉시 확인 가능
- ✅ 충돌 방지
- ✅ 실시간 협업 피드백

**3. AI 편집 표시**
```typescript
// AI가 특정 영역을 편집 중
// → 실시간으로 표시되어야 함
const aiEditingDecorator = {
  type: 'ai-editing',
  status: 'processing',
  // 입력 중에도 실시간으로 표시되어야 함
  showRealtime: true
};
```

**4. Syntax Highlighting (빠른 피드백)**
```typescript
// 코드 입력 중 syntax highlighting
// → 실시간으로 표시되어야 함
const syntaxDecorator = {
  type: 'syntax-highlight',
  language: 'javascript',
  // 입력 중에도 실시간으로 표시되어야 함
  showRealtime: true
};
```

#### 8.9.8 실시간 vs 지연 Decorator 분류

**실시간 Decorator (입력 중 표시 필요)**:
- ✅ **인라인 UI 컴포넌트** (color picker, date picker 등)
- ✅ **협업 표시** (다른 유저 편집 중)
- ✅ **AI 편집 표시** (AI가 처리 중)
- ✅ **Syntax Highlighting** (빠른 피드백)
- ✅ **오류 표시** (실시간 검증)
- ✅ **자동완성 힌트** (입력 중 표시)

**지연 Decorator (입력 완료 후 표시 가능)**:
- ⏸️ **링크 미리보기** (입력 완료 후 충분)
- ⏸️ **이미지 썸네일** (입력 완료 후 충분)
- ⏸️ **복잡한 분석 결과** (AI 분석, 외부 API 호출)
- ⏸️ **통계 정보** (입력 완료 후 충분)

#### 8.9.9 하이브리드 전략: 실시간 + 지연

```typescript
class RenderLayer {
  private realtimeDecorators: Decorator[] = [];
  private deferredDecorators: Decorator[] = [];
  
  // 입력 중 처리
  handleInput(event: InputEvent): void {
    this.updateModel(event);
    
    // 1. 실시간 decorator 계산 및 적용
    const realtime = this.calculateRealtimeDecorators();
    this.applyRealtimeDecorators(realtime);
    
    // 2. 지연 decorator는 pending에 저장
    const deferred = this.calculateDeferredDecorators();
    this.deferredDecorators.push(...deferred);
    
    // 3. 렌더링 (실시간 decorator만 포함)
    this.render({
      includeRealtimeDecorators: true,
      skipDeferredDecorators: true
    });
  }
  
  // 입력 완료 후 처리
  endEditing(): void {
    // 지연 decorator 모두 적용
    this.applyDeferredDecorators();
    
    // 전체 재렌더링
    this.render({
      includeAllDecorators: true
    });
  }
  
  // 실시간 decorator 분류
  calculateRealtimeDecorators(): Decorator[] {
    return this.decorators.filter(d => 
      d.showRealtime === true ||
      d.type === 'color-picker' ||
      d.type === 'user-editing' ||
      d.type === 'ai-editing' ||
      d.type === 'syntax-highlight' ||
      d.type === 'error'
    );
  }
  
  // 지연 decorator 분류
  calculateDeferredDecorators(): Decorator[] {
    return this.decorators.filter(d => 
      d.showRealtime !== true &&
      d.type !== 'color-picker' &&
      d.type !== 'user-editing' &&
      d.type !== 'ai-editing' &&
      d.type !== 'syntax-highlight' &&
      d.type !== 'error'
    );
  }
}
```

#### 8.9.10 EditableSimulator 필요성 재평가

**실시간 decorator가 필요한 경우**:

| 시나리오 | 실시간 필요 | EditableSimulator 필요? |
|---------|------------|------------------------|
| 인라인 UI (color picker 등) | ✅ 필요 | ⚠️ 고려 |
| 협업 표시 | ✅ 필요 | ⚠️ 고려 |
| AI 편집 표시 | ✅ 필요 | ⚠️ 고려 |
| Syntax Highlighting | ✅ 필요 | ⚠️ 고려 |
| 오류 표시 | ✅ 필요 | ⚠️ 고려 |
| 링크 미리보기 | ❌ 불필요 | ❌ 불필요 |
| 이미지 썸네일 | ❌ 불필요 | ❌ 불필요 |

**결론**:
- **실시간 decorator가 많다면**: EditableSimulator 고려 (하지만 직접 ContentEditable에서도 가능)
- **실시간 decorator가 적다면**: 직접 ContentEditable 사용 권장
- **하이브리드 접근**: 실시간 decorator만 선택적으로 적용, 나머지는 지연

#### 8.9.11 직접 ContentEditable에서 실시간 Decorator 적용

**EditableSimulator 없이도 실시간 decorator 적용 가능**:

```typescript
class RenderLayer {
  // 렌더링 영역이 직접 ContentEditable
  setup(): void {
    this.container.contentEditable = 'true';
  }
  
  // 입력 중 실시간 decorator 적용
  handleInput(event: InputEvent): void {
    // 1. 모델 업데이트
    this.updateModel(event);
    
    // 2. 실시간 decorator만 계산
    const realtimeDecorators = this.calculateRealtimeDecorators();
    
    // 3. 실시간 decorator만 적용하여 재렌더링
    // ⚠️ 중요: 기존 텍스트는 유지하고 decorator만 추가/업데이트
    this.render({
      decorators: realtimeDecorators,
      preserveText: true,  // 기존 텍스트 유지
      updateDecoratorsOnly: true  // decorator만 업데이트
    });
  }
  
  // 입력 완료 후 모든 decorator 적용
  handleInputEnd(): void {
    // 모든 decorator 적용
    this.render({
      decorators: this.allDecorators,
      includeDeferred: true
    });
  }
}
```

**장점**:
- ✅ EditableSimulator 불필요
- ✅ 구조 단순
- ✅ 실시간 decorator도 지원 가능
- ✅ 성능 최적화 (실시간 decorator만 적용)

**주의사항**:
- ⚠️ 입력 중 DOM 업데이트 시 Selection/Cursor 관리 필요
- ⚠️ IME 조합 중 decorator 적용 주의

#### 8.9.12 최종 권장 전략

**시나리오별 권장**:

1. **실시간 decorator가 많고 복잡한 경우**
   - ⚠️ EditableSimulator 고려 (하지만 직접 ContentEditable도 가능)
   - ⚠️ 성능 테스트 필요

2. **실시간 decorator가 적거나 간단한 경우** ⭐ **권장**
   - ✅ **직접 ContentEditable 사용**
   - ✅ 실시간 decorator만 선택적으로 적용
   - ✅ 구조 단순, 성능 우수

3. **실시간 decorator가 전혀 없는 경우**
   - ✅ **직접 ContentEditable 사용**
   - ✅ 입력 완료 후 decorator 적용
   - ✅ 가장 단순한 구조

**핵심 원칙**:
- **실시간 decorator가 많다고 해서 반드시 EditableSimulator가 필요한 것은 아닙니다.**
- 직접 ContentEditable에서도 실시간 decorator를 선택적으로 적용할 수 있습니다.
- **기본적으로는 직접 ContentEditable을 권장**하고, 실제 성능 문제가 발생하면 EditableSimulator를 고려합니다.

#### 8.9.13 Decorator/Mark로 인한 Text 분할과 커서 문제

**핵심 문제**: Decorator/Mark에 따라 text가 쪼개져서 렌더링되어야 하므로, 중간에 특정 영역이 들어가면 커서가 애매해질 수 있습니다.

**예시**:
```typescript
// 초기 상태
text: "Hello World"
marks: [{ type: 'bold', range: [0, 5] }]

// 렌더링 결과
<span><strong>Hello</strong> World</span>

// 사용자가 "Hello" 뒤에 입력 중
// → 커서가 <strong>Hello</strong>와 " World" 사이에 있음
// → Decorator가 추가되면 text가 더 쪼개질 수 있음
```

**문제점**:
- 입력 중에 Decorator/Mark가 추가되면 text가 쪼개짐
- 커서가 있던 Text Node가 사라지거나 변경될 수 있음
- 커서 위치가 애매해짐

#### 8.9.14 Text Node Pool + Lock 전략

**해결책**: Text Node Pool 개념을 사용하여 현재 커서가 있는 text node를 최대한 유지하고, 입력 중에는 해당 영역을 락으로 보호합니다.

**전략 1: sid 기반 락 (Lock by sid)**

```typescript
class RenderLayer {
  private lockedTextNodes: Set<string> = new Set(); // locked sid set
  private currentCursorTextNodeSid: string | null = null;
  
  // 입력 시작: 현재 커서가 있는 text node의 sid를 락
  handleInputStart(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    const textNode = range.startContainer;
    
    // text node의 sid 찾기
    const sid = this.getTextNodeSid(textNode);
    if (sid) {
      this.currentCursorTextNodeSid = sid;
      this.lockedTextNodes.add(sid);
    }
  }
  
  // 렌더링 시: 락된 text node는 보존
  render(options?: RenderOptions): void {
    // 락된 text node는 재렌더링하지 않고 보존
    const preservedNodes = this.preserveLockedTextNodes();
    
    // 나머지 영역만 재렌더링
    this.renderUnlockedAreas();
    
    // 락된 text node 재삽입
    this.restoreLockedTextNodes(preservedNodes);
  }
  
  // 입력 종료: 락 해제
  handleInputEnd(): void {
    if (this.currentCursorTextNodeSid) {
      this.lockedTextNodes.delete(this.currentCursorTextNodeSid);
      this.currentCursorTextNodeSid = null;
    }
  }
  
  // Text Node Pool을 통한 보존
  preserveLockedTextNodes(): Map<string, Text> {
    const preserved = new Map<string, Text>();
    
    for (const sid of this.lockedTextNodes) {
      const textNode = this.findTextNodeBySid(sid);
      if (textNode) {
        // Text Node Pool에 저장
        this.textNodePool.preserve(sid, textNode);
        preserved.set(sid, textNode);
      }
    }
    
    return preserved;
  }
  
  // 락된 text node 재삽입
  restoreLockedTextNodes(preserved: Map<string, Text>): void {
    for (const [sid, textNode] of preserved) {
      // Text Node Pool에서 가져와서 재삽입
      const restored = this.textNodePool.get(sid);
      if (restored) {
        this.insertTextNode(restored);
      }
    }
  }
}
```

**전략 2: 입력 멈춤 감지 후 Decorator 적용**

```typescript
class RenderLayer {
  private inputTimer: number | null = null;
  private lastInputTime: number = 0;
  private readonly INPUT_IDLE_THRESHOLD = 500; // 500ms
  
  // 입력 중
  handleInput(event: InputEvent): void {
    // 1. 입력 시간 기록
    this.lastInputTime = Date.now();
    
    // 2. 타이머 리셋
    if (this.inputTimer) {
      clearTimeout(this.inputTimer);
    }
    
    // 3. 모델 업데이트
    this.updateModel(event);
    
    // 4. 실시간 decorator는 적용하지 않음 (입력 중이므로)
    // 5. 입력 멈춤 타이머 설정
    this.inputTimer = window.setTimeout(() => {
      this.handleInputIdle();
    }, this.INPUT_IDLE_THRESHOLD);
  }
  
  // 입력 멈춤 감지
  handleInputIdle(): void {
    const timeSinceLastInput = Date.now() - this.lastInputTime;
    
    // 입력이 멈춘 것으로 판단
    if (timeSinceLastInput >= this.INPUT_IDLE_THRESHOLD) {
      // 이제 decorator를 안전하게 적용할 수 있음
      this.applyDeferredDecorators();
      
      // 락 해제 (입력이 멈췄으므로)
      this.handleInputEnd();
    }
  }
  
  // Space 키 입력 시 즉시 decorator 적용 고려
  handleKeyDown(event: KeyboardEvent): void {
    if (event.key === ' ' || event.key === 'Space') {
      // Space 입력 후 약간의 지연 후 decorator 적용
      setTimeout(() => {
        this.applyDeferredDecorators();
      }, 100);
    }
  }
}
```

**전략 3: Text Node Pool과 Lock 통합**

```typescript
class TextNodePool {
  private pool: Map<string, Text> = new Map();
  private locked: Set<string> = new Set();
  
  // Text Node 보존 (락된 경우)
  preserve(sid: string, textNode: Text): void {
    if (this.locked.has(sid)) {
      // 락된 경우에만 보존
      this.pool.set(sid, textNode);
    }
  }
  
  // Text Node 가져오기
  get(sid: string): Text | null {
    return this.pool.get(sid) || null;
  }
  
  // 락 설정
  lock(sid: string): void {
    this.locked.add(sid);
  }
  
  // 락 해제
  unlock(sid: string): void {
    this.locked.delete(sid);
    // 락 해제 후 pool에서도 제거 (더 이상 보존 불필요)
    this.pool.delete(sid);
  }
  
  // 락된 text node인지 확인
  isLocked(sid: string): boolean {
    return this.locked.has(sid);
  }
}
```

#### 8.9.15 통합 전략: Lock + Idle Detection

```typescript
class RenderLayer {
  private textNodePool: TextNodePool;
  private inputState: {
    isActive: boolean;
    cursorTextNodeSid: string | null;
    lastInputTime: number;
    idleTimer: number | null;
  } = {
    isActive: false,
    cursorTextNodeSid: null,
    lastInputTime: 0,
    idleTimer: null
  };
  
  // 입력 시작
  handleInputStart(): void {
    this.inputState.isActive = true;
    this.inputState.lastInputTime = Date.now();
    
    // 현재 커서가 있는 text node의 sid 락
    const sid = this.getCurrentCursorTextNodeSid();
    if (sid) {
      this.inputState.cursorTextNodeSid = sid;
      this.textNodePool.lock(sid);
    }
  }
  
  // 입력 중
  handleInput(event: InputEvent): void {
    // 1. 입력 시간 업데이트
    this.inputState.lastInputTime = Date.now();
    
    // 2. 모델 업데이트
    this.updateModel(event);
    
    // 3. 락된 text node는 보존하면서 렌더링
    this.render({
      preserveLockedTextNodes: true,
      skipNewDecorators: true  // 새 decorator는 적용하지 않음
    });
    
    // 4. 입력 멈춤 타이머 리셋
    this.resetIdleTimer();
  }
  
  // 입력 멈춤 감지
  resetIdleTimer(): void {
    if (this.inputState.idleTimer) {
      clearTimeout(this.inputState.idleTimer);
    }
    
    this.inputState.idleTimer = window.setTimeout(() => {
      this.handleInputIdle();
    }, 500); // 500ms 입력 없으면 멈춘 것으로 판단
  }
  
  // 입력 멈춤 처리
  handleInputIdle(): void {
    // 입력이 멈췄으므로 decorator를 안전하게 적용할 수 있음
    this.applyDeferredDecorators();
    
    // 락 해제
    if (this.inputState.cursorTextNodeSid) {
      this.textNodePool.unlock(this.inputState.cursorTextNodeSid);
      this.inputState.cursorTextNodeSid = null;
    }
    
    this.inputState.isActive = false;
  }
  
  // Space 키 입력 시 즉시 처리
  handleKeyDown(event: KeyboardEvent): void {
    if (event.key === ' ' || event.key === 'Space') {
      // Space 입력 후 약간의 지연 후 decorator 적용
      setTimeout(() => {
        if (this.inputState.isActive) {
          this.handleInputIdle();
        }
      }, 100);
    }
  }
  
  // 렌더링 시 락된 text node 보존
  render(options?: RenderOptions): void {
    // 락된 text node 보존
    if (options?.preserveLockedTextNodes) {
      this.preserveLockedTextNodes();
    }
    
    // 일반 렌더링
    // ...
    
    // 락된 text node 복원
    if (options?.preserveLockedTextNodes) {
      this.restoreLockedTextNodes();
    }
  }
}
```

#### 8.9.16 장점 및 고려사항

**장점**:
- ✅ **커서 안정성**: 입력 중 커서가 있는 text node가 보존됨
- ✅ **성능 최적화**: 입력 중에는 decorator 적용을 건너뛰어 성능 향상
- ✅ **사용자 경험**: 입력이 멈추면 자동으로 decorator 적용
- ✅ **유연성**: Space 키 등으로 즉시 decorator 적용 가능

**고려사항**:
- ⚠️ **락 관리**: 락이 제대로 해제되지 않으면 문제 발생 가능
- ⚠️ **타이밍**: 입력 멈춤 감지 임계값 조정 필요
- ⚠️ **복잡도**: Text Node Pool과 Lock 관리로 인한 복잡도 증가

**권장 설정**:
- 입력 멈춤 임계값: 500ms (조정 가능)
- Space 키 입력 시: 100ms 지연 후 decorator 적용
- 락 해제: 입력 멈춤 감지 시 또는 명시적 해제

#### 8.9.17 VNodeBuilder 통합 구조 설계

**핵심 요구사항**:
- 로컬 락이 걸리면 decorator가 새로 생성될 때는 추가하지 않기
- Decorator별로 생성 날짜와 sid의 lock 시간을 비교하여 필터링
- VNodeBuilder에서 이 로직을 처리

**구조 설계**:

**1. Lock 정보 관리 (EditorViewDOM/RenderLayer 레벨)**

```typescript
class EditorViewDOM {
  private lockManager: LockManager;
  
  // Lock 정보 관리
  private lockManager = {
    // sid → lock 정보 매핑
    locks: new Map<string, LockInfo>(),
    
    // sid 락 설정
    lock(sid: string): void {
      this.locks.set(sid, {
        sid,
        lockedAt: Date.now(),
        lockedBy: 'input' // 'input' | 'external' | 'manual'
      });
    },
    
    // sid 락 해제
    unlock(sid: string): void {
      this.locks.delete(sid);
    },
    
    // sid가 락되어 있는지 확인
    isLocked(sid: string): boolean {
      return this.locks.has(sid);
    },
    
    // 락 시간 가져오기
    getLockTime(sid: string): number | null {
      const lock = this.locks.get(sid);
      return lock ? lock.lockedAt : null;
    }
  };
}
```

**2. Decorator 생성 시간 추적**

```typescript
interface Decorator {
  sid: string;
  type: string;
  target: {
    sid: string;  // inline-text의 sid
    startOffset: number;
    endOffset: number;
  };
  data: any;
  createdAt?: number;  // decorator 생성 시간 (추가)
}

class DecoratorManager {
  // Decorator 추가 시 생성 시간 기록
  add(decorator: Decorator): void {
    const decoratorWithTime: Decorator = {
      ...decorator,
      createdAt: Date.now()  // 생성 시간 기록
    };
    this.decorators.push(decoratorWithTime);
  }
}
```

**3. VNodeBuilder에 Lock 정보 전달 (Context)**

```typescript
class EditorViewDOM {
  render(): void {
    // 1. Lock 정보 수집
    const lockContext = this.collectLockContext();
    
    // 2. VNodeBuilder에 context로 전달
    const vnode = this.vnodeBuilder.build(modelData, {
      decorators: this.decorators,
      lockContext: lockContext  // Lock 정보 전달
    });
    
    // 3. DOMRenderer에 전달
    this.domRenderer.render(vnode, modelData, this.decorators, undefined, {
      lockContext: lockContext
    });
  }
  
  // Lock Context 수집
  collectLockContext(): LockContext {
    return {
      locks: Array.from(this.lockManager.locks.values()),
      isLocked: (sid: string) => this.lockManager.isLocked(sid),
      getLockTime: (sid: string) => this.lockManager.getLockTime(sid)
    };
  }
}
```

**4. VNodeBuilder에서 Decorator 필터링**

```typescript
class VNodeBuilder {
  build(data: ModelData, context?: BuildContext): VNode {
    const lockContext = context?.lockContext;
    
    // Decorator 필터링: 락된 sid의 decorator는 제외
    const filteredDecorators = this.filterDecoratorsByLock(
      context?.decorators || [],
      lockContext
    );
    
    // 필터링된 decorator로 VNode 생성
    return this.buildVNode(data, {
      ...context,
      decorators: filteredDecorators
    });
  }
  
  // Lock 기반 Decorator 필터링
  filterDecoratorsByLock(
    decorators: Decorator[],
    lockContext?: LockContext
  ): Decorator[] {
    if (!lockContext) {
      // Lock 정보가 없으면 모든 decorator 반환
      return decorators;
    }
    
    return decorators.filter(decorator => {
      // 1. Decorator의 target sid 확인
      const targetSid = decorator.target?.sid;
      if (!targetSid) {
        // target sid가 없으면 통과 (패턴 decorator 등)
        return true;
      }
      
      // 2. 해당 sid가 락되어 있는지 확인
      if (!lockContext.isLocked(targetSid)) {
        // 락되지 않았으면 통과
        return true;
      }
      
      // 3. 락되어 있으면 생성 시간과 락 시간 비교
      const lockTime = lockContext.getLockTime(targetSid);
      const decoratorCreatedAt = decorator.createdAt;
      
      if (!lockTime || !decoratorCreatedAt) {
        // 시간 정보가 없으면 안전하게 제외
        return false;
      }
      
      // 4. Decorator가 락 이전에 생성되었으면 통과 (기존 decorator)
      //    Decorator가 락 이후에 생성되었으면 제외 (새 decorator)
      return decoratorCreatedAt < lockTime;
    });
  }
}
```

**5. 통합 흐름**

```typescript
// 1. 입력 시작
handleInputStart(): void {
  const sid = this.getCurrentCursorTextNodeSid();
  if (sid) {
    this.lockManager.lock(sid);  // sid 락
  }
}

// 2. 입력 중 Decorator 추가 시도
addDecorator(decorator: Decorator): void {
  // Decorator 추가 (생성 시간 기록)
  this.decoratorManager.add(decorator);
  
  // 렌더링 (VNodeBuilder가 자동으로 필터링)
  this.render();
}

// 3. VNodeBuilder에서 필터링
// - 락된 sid의 decorator 중 락 이후 생성된 것은 제외
// - 락된 sid의 decorator 중 락 이전 생성된 것은 포함 (기존 decorator)

// 4. 입력 멈춤
handleInputIdle(): void {
  // 락 해제
  this.lockManager.unlock(this.inputState.cursorTextNodeSid);
  
  // 이제 모든 decorator 적용 가능
  this.render();
}
```

**6. 구조 다이어그램**

```
┌─────────────────────────────────────────┐
│  EditorViewDOM                          │
│  - LockManager (sid → lock time)       │
│  - DecoratorManager (decorator + time)  │
└─────────────────────────────────────────┘
           │
           │ context (lockContext)
           ▼
┌─────────────────────────────────────────┐
│  VNodeBuilder                           │
│  - filterDecoratorsByLock()            │
│  - decorator.createdAt < lock.lockedAt │
└─────────────────────────────────────────┘
           │
           │ filtered decorators
           ▼
┌─────────────────────────────────────────┐
│  DOMRenderer                            │
│  - VNode → DOM                          │
└─────────────────────────────────────────┘
```

**7. 구현 예시**

```typescript
// Lock Context 인터페이스
interface LockContext {
  locks: LockInfo[];
  isLocked(sid: string): boolean;
  getLockTime(sid: string): number | null;
}

interface LockInfo {
  sid: string;
  lockedAt: number;
  lockedBy: 'input' | 'external' | 'manual';
}

// VNodeBuilder BuildContext 확장
interface BuildContext {
  decorators?: Decorator[];
  lockContext?: LockContext;
  // ... 기타 context
}

// 사용 예시
const lockContext: LockContext = {
  locks: [
    { sid: 'text-1', lockedAt: 1000, lockedBy: 'input' }
  ],
  isLocked: (sid) => sid === 'text-1',
  getLockTime: (sid) => sid === 'text-1' ? 1000 : null
};

const decorators: Decorator[] = [
  {
    sid: 'decorator-1',
    target: { sid: 'text-1', startOffset: 0, endOffset: 5 },
    createdAt: 500  // 락 이전 생성 → 포함
  },
  {
    sid: 'decorator-2',
    target: { sid: 'text-1', startOffset: 5, endOffset: 10 },
    createdAt: 1500  // 락 이후 생성 → 제외
  },
  {
    sid: 'decorator-3',
    target: { sid: 'text-2', startOffset: 0, endOffset: 5 },
    createdAt: 2000  // 락되지 않은 sid → 포함
  }
];

// 필터링 결과
// decorator-1: 포함 (락 이전 생성)
// decorator-2: 제외 (락 이후 생성)
// decorator-3: 포함 (락되지 않은 sid)
```

**8. 고려사항**

**장점**:
- ✅ **명확한 책임 분리**: Lock 관리는 EditorViewDOM, 필터링은 VNodeBuilder
- ✅ **시간 기반 비교**: 생성 시간과 락 시간을 비교하여 정확한 필터링
- ✅ **기존 decorator 보존**: 락 이전에 생성된 decorator는 유지
- ✅ **확장성**: Context를 통해 유연하게 정보 전달

**주의사항**:
- ⚠️ **시간 동기화**: 서버 시간과 클라이언트 시간이 다를 수 있음 (로컬 decorator만 고려)
- ⚠️ **성능**: 모든 decorator를 순회하며 비교 (decorator가 많으면 최적화 필요)
- ⚠️ **락 해제 타이밍**: 입력 멈춤 감지가 정확해야 함

**최적화 방안**:
```typescript
// 락된 sid만 Set으로 관리하여 빠른 조회
private lockedSids: Set<string> = new Set();

filterDecoratorsByLock(decorators: Decorator[], lockContext?: LockContext): Decorator[] {
  if (!lockContext || lockContext.locks.length === 0) {
    return decorators;  // 락이 없으면 빠른 반환
  }
  
  // 락된 sid Set 생성 (한 번만)
  const lockedSids = new Set(lockContext.locks.map(l => l.sid));
  const lockTimeMap = new Map(
    lockContext.locks.map(l => [l.sid, l.lockedAt])
  );
  
  // 필터링 (락된 sid만 확인)
  return decorators.filter(decorator => {
    const targetSid = decorator.target?.sid;
    if (!targetSid || !lockedSids.has(targetSid)) {
      return true;  // 락되지 않은 sid는 통과
    }
    
    const lockTime = lockTimeMap.get(targetSid);
    const createdAt = decorator.createdAt;
    
    return createdAt && lockTime && createdAt < lockTime;
  });
}
```

#### 8.9.18 Inline Decorator를 VNode Children으로 분리하는 접근법

**핵심 아이디어**: Inline decorator를 VNode의 별도 children으로 분리하여 처리하면, text node 구조가 변경되지 않아 reconcile 시 안정성을 보장할 수 있습니다.

**현재 구조의 문제점**:
- Inline decorator가 text와 같은 레벨에 배치되면 text node가 분할됨
- Decorator 추가/제거 시 text node 구조가 변경됨
- Reconcile 시 text node가 틀어질 수 있음

**제안하는 구조**:

**1. VNode 구조 변경**

```typescript
interface VNode {
  tag?: string;
  text?: string;
  children?: VNode[];  // 일반 children (mark로 분리한 span 등)
  decorators?: VNode[];  // Inline decorator children (별도 분리)
  // ... 기타 속성
}
```

**2. 렌더링 구조 고민**

**제안 1: Decorator를 별도 영역으로 분리 (위쪽 배치)**
```typescript
// 제안 1: Decorator를 위쪽에 별도 영역으로 배치
<div>
  <!-- decorators: text run 위쪽에 배치 -->
  <div class="decorators">
    <decorator-color>#ff0000</decorator-color>
  </div>
  
  <!-- children: mark로 분리한 span만 나열 -->
  <span>Hello</span>
  <span>World</span>
</div>
```
- ✅ Text node 구조 안정적
- ❌ Decorator 위치가 text와 분리되어 자연스럽지 않을 수 있음

**제안 2: Decorator를 span 내부에 포함 (원래 위치)**
```typescript
// 제안 2: Decorator를 span 내부에 포함
<div>
  <span>Hello</span>
  <span>World <decorators /></span>  <!-- decorator가 span 내부 -->
</div>
```
- ✅ Decorator가 원래 위치에 있음 (자연스러움)
- ⚠️ 커서가 있을 때는 decorator를 위로 보이고, 없으면 원래 위치?
- ❌ 커서 유무에 따라 decorator 위치가 바뀌면 이상할 수 있음

**제안 3: Decorator를 항상 원래 위치에 유지**
```typescript
// 제안 3: Decorator를 항상 원래 위치에 유지
<div>
  <span>Hello</span>
  <span>
    World
    <decorator-color>#ff0000</decorator-color>  <!-- 항상 여기 -->
  </span>
</div>
```
- ✅ Decorator 위치가 일관적
- ⚠️ Text node 구조가 변경될 수 있음 (decorator 추가/제거 시)

**고민 사항**:
- 커서가 있을 때 decorator를 위로 보이는 것은 사용자 경험상 이상할 수 있음
- Decorator 위치가 일관적이어야 사용자가 혼란스럽지 않음
- 하지만 text node 구조 안정성도 중요함

**3. VNodeBuilder 구현**

```typescript
class VNodeBuilder {
  buildInlineText(data: ModelData, decorators: Decorator[]): VNode {
    const text = data.text || '';
    const marks = data.marks || [];
    
    // 1. Mark로 분리한 span children 생성
    const markChildren = this.buildMarkedRuns(text, marks);
    
    // 2. Inline decorator children 생성 (별도)
    const decoratorChildren = this.buildInlineDecorators(decorators, data.sid);
    
    // 3. VNode 생성
    return {
      tag: 'div',
      children: markChildren,  // mark로 분리한 span만
      decorators: decoratorChildren,  // decorator는 별도
      attrs: {
        'data-bc-sid': data.sid
      }
    };
  }
  
  // Mark로 분리한 span children
  buildMarkedRuns(text: string, marks: Mark[]): VNode[] {
    // 기존 로직: mark에 따라 text를 span으로 분리
    // 예: "Hello World" + bold[0,5] → [<span><strong>Hello</strong></span>, <span> World</span>]
    return this.splitTextByMarks(text, marks);
  }
  
  // Inline decorator children (위쪽에 배치)
  buildInlineDecorators(decorators: Decorator[], textSid: string): VNode[] {
    // 해당 text node에 적용되는 inline decorator만 필터링
    const inlineDecorators = decorators.filter(d => 
      d.category === 'inline' && 
      d.target?.sid === textSid
    );
    
    // Decorator VNode 생성
    return inlineDecorators.map(decorator => ({
      tag: `decorator-${decorator.type}`,
      decoratorSid: decorator.sid,
      attrs: {
        'data-bc-decorator-sid': decorator.sid,
        'data-bc-target-sid': decorator.target.sid,
        'data-bc-start-offset': decorator.target.startOffset,
        'data-bc-end-offset': decorator.target.endOffset
      },
      // Decorator 컴포넌트 렌더링
      component: decorator.type,
      props: decorator.data
    }));
  }
}
```

**4. DOM 렌더링 구조**

```typescript
// VNode → DOM 변환
function renderVNodeToDOM(vnode: VNode, container: HTMLElement): void {
  const element = document.createElement(vnode.tag || 'div');
  
  // 1. Decorators를 먼저 위쪽에 배치
  if (vnode.decorators && vnode.decorators.length > 0) {
    const decoratorContainer = document.createElement('div');
    decoratorContainer.className = 'decorators';
    decoratorContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      pointer-events: none;
      z-index: 10;
    `;
    
    for (const decoratorVNode of vnode.decorators) {
      renderVNodeToDOM(decoratorVNode, decoratorContainer);
    }
    
    element.appendChild(decoratorContainer);
  }
  
  // 2. 일반 children (mark로 분리한 span) 배치
  if (vnode.children) {
    for (const childVNode of vnode.children) {
      renderVNodeToDOM(childVNode, element);
    }
  }
  
  container.appendChild(element);
}
```

**5. 구조 비교 및 고민**

**기존 구조 (문제 있음)**:
```
<div>
  <span>Hello</span>           <!-- text node 1 -->
  <decorator-color>#ff0000</decorator-color>  <!-- decorator -->
  <span>World</span>           <!-- text node 2 -->
</div>
```
- Decorator 추가/제거 시 text node 순서 변경
- Reconcile 시 text node 매칭 어려움

**제안 구조들**:

**구조 A: Decorator를 위쪽에 별도 영역**
```
<div>
  <div class="decorators">     <!-- decorator 영역 (위쪽) -->
    <decorator-color>#ff0000</decorator-color>
  </div>
  <span>Hello</span>           <!-- text node 1 -->
  <span>World</span>           <!-- text node 2 -->
</div>
```
- ✅ Decorator 추가/제거가 text node에 영향 없음
- ✅ Text node 구조가 항상 동일
- ❌ Decorator 위치가 text와 분리되어 자연스럽지 않을 수 있음

**구조 B: Decorator를 span 내부에 포함**
```
<div>
  <span>Hello</span>
  <span>
    World
    <decorator-color>#ff0000</decorator-color>  <!-- span 내부 -->
  </span>
</div>
```
- ✅ Decorator가 원래 위치에 있음 (자연스러움)
- ⚠️ 커서 유무에 따라 decorator 위치 변경? (이상할 수 있음)
- ⚠️ Text node 구조가 변경될 수 있음

**구조 C: 하이브리드 (고민 필요)**
```
<div>
  <span>Hello</span>
  <span>World</span>
  <!-- decorator는 별도로 관리하되, CSS로 원래 위치에 배치 -->
  <decorator-color style="position: absolute; ...">#ff0000</decorator-color>
</div>
```
- ✅ Text node 구조 안정적
- ✅ Decorator는 CSS로 원래 위치에 배치
- ⚠️ 위치 계산 복잡도 증가

**고민 사항**:
- 커서가 있을 때 decorator를 위로 보이는 것은 사용자 경험상 이상할 수 있음
- Decorator 위치가 일관적이어야 사용자가 혼란스럽지 않음
- Text node 구조 안정성과 decorator 위치 자연스러움의 균형 필요

**중요한 특성**:
- **Inline decorator는 `contenteditable="false"`**: 선택 대상이 아님
- **이벤트는 발생할 수 있음**: 클릭, 호버 등은 가능
- 이 특성을 활용하면 구조 설계가 달라질 수 있음

**핵심 인사이트**: Inline decorator가 `contenteditable="false"`이므로, **text node를 1열로 유지하는 것이 괜찮을 수 있습니다**.

**이유**:
- Decorator는 선택 대상이 아니므로, text node 사이에 있어도 선택에 영향을 주지 않음
- Text node 구조를 1열로 유지하면 reconcile 시 안정적
- Decorator는 별도로 배치하되, CSS로 원하는 위치에 표시 가능

**제안 구조**:
```typescript
// Text node는 1열로 유지
<div>
  <span>Hello</span>
  <span>World</span>
  <!-- decorator는 별도로 배치, contenteditable="false" -->
  <decorator-color contenteditable="false">#ff0000</decorator-color>
</div>
```

**장점**:
- ✅ Text node 구조가 항상 1열로 일관적
- ✅ Decorator 추가/제거가 text node 순서에 영향 없음
- ✅ Reconcile 시 text node 매칭이 안정적
- ✅ Decorator는 선택 대상이 아니므로 선택에 영향 없음

**구현**:
```typescript
class VNodeBuilder {
  buildInlineText(data: ModelData, decorators: Decorator[]): VNode {
    // 1. Mark로 분리한 span children (1열로 유지)
    const markChildren = this.buildMarkedRuns(data.text, data.marks);
    
    // 2. Inline decorator children (별도로 추가, contenteditable="false")
    const decoratorChildren = this.buildInlineDecorators(decorators, data.sid);
    
    // 3. VNode 생성: children에 mark와 decorator 모두 포함
    // 하지만 decorator는 contenteditable="false"이므로 선택에 영향 없음
    return {
      tag: 'div',
      children: [
        ...markChildren,  // mark로 분리한 span들
        ...decoratorChildren  // decorator들 (contenteditable="false")
      ],
      attrs: {
        'data-bc-sid': data.sid
      }
    };
  }
  
  buildInlineDecorators(decorators: Decorator[], textSid: string): VNode[] {
    const inlineDecorators = decorators.filter(d => 
      d.category === 'inline' && 
      d.target?.sid === textSid
    );
    
    return inlineDecorators.map(decorator => ({
      tag: `decorator-${decorator.type}`,
      decoratorSid: decorator.sid,
      attrs: {
        'contenteditable': 'false',  // 선택 대상 아님
        'data-bc-decorator-sid': decorator.sid,
        'data-bc-target-sid': decorator.target.sid,
        'data-bc-start-offset': decorator.target.startOffset,
        'data-bc-end-offset': decorator.target.endOffset
      },
      component: decorator.type,
      props: decorator.data
    }));
  }
}
```

**Selection 동작**:
- Text node만 선택 대상이므로, decorator가 text node 사이에 있어도 선택이 자연스럽게 text node만 포함
- Decorator는 `contenteditable="false"`이므로 선택 범위에 포함되지 않음
- 사용자가 드래그할 때 decorator를 건너뛰고 text node만 선택됨

**6. 장점**

**구조적 안정성**:
- ✅ Text node 구조가 변경되지 않음
- ✅ Decorator 추가/제거가 text node에 영향 없음
- ✅ Reconcile 시 text node 매칭이 안정적

**위치 관리**:
- ✅ Decorator는 절대 위치로 text run 위쪽에 배치
- ✅ Text node는 상대 위치로 자연스럽게 배치
- ✅ CSS로 decorator 위치 조정 가능

**성능**:
- ✅ Text node 재사용이 쉬움
- ✅ Decorator만 별도로 업데이트 가능
- ✅ 불필요한 DOM 조작 최소화

**7. 구현 고려사항**

**위치 계산**:
```typescript
// Decorator 위치를 text run의 실제 위치에 맞춤
function calculateDecoratorPosition(
  decorator: Decorator,
  textRunElement: HTMLElement
): { top: number; left: number; width: number } {
  const rect = textRunElement.getBoundingClientRect();
  const containerRect = textRunElement.parentElement?.getBoundingClientRect();
  
  // Text run의 시작 위치 계산
  const startOffset = decorator.target.startOffset;
  const endOffset = decorator.target.endOffset;
  
  // Text run 내에서 decorator 범위 계산
  const range = document.createRange();
  // ... range 설정
  
  return {
    top: rect.top - (containerRect?.top || 0),
    left: range.getBoundingClientRect().left - (containerRect?.left || 0),
    width: range.getBoundingClientRect().width
  };
}
```

**Reconcile 최적화**:
```typescript
class Reconciler {
  reconcileVNodeChildren(
    parent: HTMLElement,
    prevVNode: VNode,
    nextVNode: VNode
  ): void {
    // 1. Decorator children 별도 처리
    if (nextVNode.decorators) {
      this.reconcileDecorators(parent, prevVNode.decorators, nextVNode.decorators);
    }
    
    // 2. 일반 children (text node) 처리
    // Text node 구조가 동일하므로 안정적으로 매칭 가능
    this.reconcileTextNodes(parent, prevVNode.children, nextVNode.children);
  }
  
  reconcileDecorators(
    parent: HTMLElement,
    prevDecorators: VNode[],
    nextDecorators: VNode[]
  ): void {
    // Decorator만 별도로 reconcile
    // Text node에 영향 없음
  }
  
  reconcileTextNodes(
    parent: HTMLElement,
    prevChildren: VNode[],
    nextChildren: VNode[]
  ): void {
    // Text node 구조가 동일하므로 안정적으로 매칭
    // Decorator 추가/제거와 무관하게 동작
  }
}
```

**8. Lock 전략과의 통합**

```typescript
// Lock이 걸려도 text node 구조는 변경되지 않음
// Decorator만 필터링하면 됨

class VNodeBuilder {
  buildInlineText(data: ModelData, decorators: Decorator[], lockContext?: LockContext): VNode {
    // 1. Mark로 분리한 span children (항상 동일)
    const markChildren = this.buildMarkedRuns(data.text, data.marks);
    
    // 2. Inline decorator 필터링 (Lock 기반)
    const filteredDecorators = this.filterDecoratorsByLock(decorators, lockContext);
    
    // 3. Inline decorator children 생성
    const decoratorChildren = this.buildInlineDecorators(filteredDecorators, data.sid);
    
    return {
      tag: 'div',
      children: markChildren,  // 항상 동일한 구조
      decorators: decoratorChildren  // Lock에 따라 필터링됨
    };
  }
}
```

**9. Text Node 1열 유지 전략 (권장)**

**핵심**: Inline decorator가 `contenteditable="false"`이므로, text node를 1열로 유지하는 것이 가능합니다.

**구조**:
```typescript
<div>
  <span>Hello</span>           <!-- text node 1 -->
  <span>World</span>           <!-- text node 2 -->
  <decorator-color contenteditable="false">#ff0000</decorator-color>  <!-- decorator -->
</div>
```

**장점**:
- ✅ **Text node 구조 일관성**: 항상 1열로 유지되어 reconcile 안정적
- ✅ **선택 안정성**: Decorator는 선택 대상이 아니므로 선택에 영향 없음
- ✅ **구조 단순화**: 복잡한 위치 계산 불필요
- ✅ **Lock 전략 통합**: Decorator만 필터링하면 되고, text node는 항상 동일한 구조

**Selection 동작**:
- 사용자가 드래그할 때 decorator를 건너뛰고 text node만 선택됨
- Decorator는 `contenteditable="false"`이므로 선택 범위에 포함되지 않음
- Text node만 선택 대상이므로 자연스러운 선택 경험

**⚠️ 중요한 문제: 입력 중 Decorator가 글자를 가로막을 수 있음**

**문제 시나리오**:
```typescript
// 구조
<div>
  <span>Hello</span>
  <decorator-color contenteditable="false">#ff0000</decorator-color>
  <span>World</span>
</div>

// 사용자가 "Hello" 뒤에 입력 중
// → Decorator가 중간에 있어서 글자가 decorator 위치에서 잘릴 수 있음
// → 입력이 decorator를 건너뛰고 "World" 앞에 들어갈 수 있음
```

**해결책: 입력 상태에서는 Decorator를 막기**

```typescript
class VNodeBuilder {
  buildInlineText(
    data: ModelData, 
    decorators: Decorator[],
    lockContext?: LockContext
  ): VNode {
    // 1. Mark로 분리한 span children (1열로 유지)
    const markChildren = this.buildMarkedRuns(data.text, data.marks);
    
    // 2. 입력 상태 확인
    const isInputActive = lockContext?.isLocked(data.sid) || false;
    
    // 3. Inline decorator 필터링
    // 입력 중이면 decorator 제외 (글자가 잘리는 것 방지)
    const filteredDecorators = isInputActive 
      ? []  // 입력 중에는 decorator 제외
      : this.filterDecoratorsByLock(decorators, lockContext);
    
    // 4. Inline decorator children 생성
    const decoratorChildren = this.buildInlineDecorators(filteredDecorators, data.sid);
    
    // 5. VNode 생성
    return {
      tag: 'div',
      children: [
        ...markChildren,  // mark로 분리한 span들 (항상 포함)
        ...decoratorChildren  // decorator들 (입력 중이면 빈 배열)
      ],
      attrs: {
        'data-bc-sid': data.sid
      }
    };
  }
}
```

**입력 상태 감지**:
```typescript
class EditorViewDOM {
  render(): void {
    // 1. 입력 상태 확인 (락된 sid가 있으면 입력 중)
    const lockContext = this.collectLockContext();
    const isInputActive = lockContext.locks.length > 0;
    
    // 2. VNodeBuilder에 전달
    const vnode = this.vnodeBuilder.build(modelData, {
      decorators: this.decorators,
      lockContext: lockContext,
      isInputActive: isInputActive  // 입력 상태 전달
    });
    
    // 3. 렌더링
    this.domRenderer.render(vnode);
  }
}
```

**동작 흐름**:
1. **입력 시작**: sid 락 → `isInputActive = true`
2. **입력 중**: Decorator 제외 → text node만 렌더링 (글자 잘림 방지)
3. **입력 멈춤**: 락 해제 → `isInputActive = false`
4. **입력 완료**: Decorator 포함 → 전체 렌더링

**장점**:
- ✅ **입력 중 글자 잘림 방지**: Decorator가 없으므로 입력이 자연스럽게 진행
- ✅ **입력 완료 후 Decorator 표시**: 입력이 멈추면 decorator가 다시 나타남
- ✅ **Text node 구조 안정성**: 입력 중에도 text node 구조는 동일하게 유지

**구현 예시**:
```typescript
// VNode 구조
{
  tag: 'div',
  children: [
    { tag: 'span', text: 'Hello' },  // text node 1
    { tag: 'span', text: 'World' },  // text node 2
    { 
      tag: 'decorator-color',
      attrs: { contenteditable: 'false' },
      decoratorSid: 'decorator-1'
    }  // decorator (선택 대상 아님)
  ]
}

// DOM 구조
<div>
  <span>Hello</span>
  <span>World</span>
  <decorator-color contenteditable="false">#ff0000</decorator-color>
</div>
```

**10. 입력 중 Decorator 처리 전략**

**핵심 문제**: Decorator가 text node 사이에 있으면, 입력 중에 글자가 decorator 위치에서 잘릴 수 있습니다.

**해결책**: 입력 상태에서는 Decorator를 완전히 제외합니다.

```typescript
class VNodeBuilder {
  buildInlineText(
    data: ModelData, 
    decorators: Decorator[],
    lockContext?: LockContext
  ): VNode {
    const markChildren = this.buildMarkedRuns(data.text, data.marks);
    
    // 입력 중이면 decorator 완전히 제외
    const isInputActive = lockContext?.isLocked(data.sid) || false;
    const decoratorChildren = isInputActive 
      ? []  // 입력 중: decorator 제외 (글자 잘림 방지)
      : this.buildInlineDecorators(
          this.filterDecoratorsByLock(decorators, lockContext),
          data.sid
        );
    
    return {
      tag: 'div',
      children: [
        ...markChildren,  // 항상 포함
        ...decoratorChildren  // 입력 중이면 빈 배열
      ]
    };
  }
}
```

**동작 흐름**:
1. **입력 시작**: sid 락 → decorator 제외
2. **입력 중**: text node만 렌더링 (decorator 없음)
3. **입력 멈춤**: 락 해제 → decorator 포함
4. **입력 완료**: decorator 다시 표시

**장점**:
- ✅ **입력 중 글자 잘림 방지**: Decorator가 없으므로 입력이 자연스럽게 진행
- ✅ **입력 완료 후 Decorator 표시**: 입력이 멈추면 decorator가 다시 나타남
- ✅ **Text node 구조 안정성**: 입력 중에도 text node 구조는 동일하게 유지

**11. 결론**

이 접근법의 핵심 장점:
- ✅ **Text node 구조 안정성**: Decorator 추가/제거와 무관하게 text node를 1열로 유지
- ✅ **Reconcile 안정성**: Text node 매칭이 항상 안정적 (항상 같은 순서)
- ✅ **선택 안정성**: Decorator는 `contenteditable="false"`이므로 선택에 영향 없음
- ✅ **입력 안정성**: 입력 중에는 decorator를 제외하여 글자 잘림 방지
- ✅ **구조 단순화**: 복잡한 위치 계산이나 별도 영역 관리 불필요
- ✅ **Lock 전략 통합**: 입력 상태에 따라 decorator만 필터링하면 되고, text node는 항상 동일한 구조

이 방식은 **구조적 안정성**을 최우선으로 하되, **`contenteditable="false"` 특성과 입력 상태 감지**를 활용하여 text node를 1열로 유지하면서도 입력 안정성과 선택 안정성을 모두 보장합니다.

```typescript
class EditableSimulator {
  private config = {
    contextBefore: 100,    // 커서 앞 100자
    contextAfter: 100,     // 커서 뒤 100자
    recreateThreshold: 50   // 50자 이상 이동 시 재생성
  };
  
  // 커서 이동 감지 및 재생성 결정
  handleCursorMove(): void {
    const currentOffset = this.getCurrentModelOffset();
    const distance = Math.abs(currentOffset - this.lastCursorOffset);
    
    // 임계값 이상 이동했거나 영역을 벗어났을 때만 재생성
    if (distance > this.config.recreateThreshold || this.isOutOfViewport(currentOffset)) {
      this.deactivate();
      this.activateAtCursor(this.getCurrentRange());
    }
  }
}
```

---

## 9. Comparison with Existing Approaches

### 7.1 기존 ContentEditable 기반 에디터

**방식**: 렌더링과 편집이 같은 영역

**문제점**:
- ❌ 이중 상태 관리
- ❌ Selection/Cursor 관리 복잡
- ❌ DOM과 모델 동기화 문제

### 7.2 분리된 ContentEditable 레이어

**방식**: 렌더링 영역과 편집 레이어 분리

**장점**:
- ✅ 렌더링 영역: 단방향 데이터 흐름, 지속적으로 렌더링 가능
- ✅ 편집 레이어: ContentEditable로 입력만 담당, 입력 처리 단순화
- ✅ 완전한 분리로 각 영역 독립적 관리
- ✅ 위치 계산 불필요 (구조가 동일하므로)

**단점**:
- ⚠️ 실시간 동기화 필요
- ⚠️ 구조 복제 성능 고려 필요
- ⚠️ 동기화 타이밍 조절 필요

### 7.3 Model-Direct Editing (순수)

**방식**: ContentEditable 완전 제거

**장점**:
- ✅ 완전한 제어
- ✅ 단방향 데이터 흐름

**단점**:
- ❌ IME 지원 어려움
- ❌ 모든 입력 처리 직접 구현 필요

---

## 10. Use Cases

### 8.1 일반 텍스트 편집

- 사용자가 키보드로 텍스트 입력
- 편집 레이어가 입력을 받아 모델로 변환
- 렌더링 영역이 모델 기반으로 렌더링

### 8.2 복잡한 레이아웃 편집

- 표, 이미지 등 복잡한 레이아웃
- 렌더링 영역에서 완전한 제어로 렌더링
- 편집 레이어는 텍스트 영역에만 적용

### 8.3 멀티 도큐먼트 편집

- 여러 문서를 동시에 편집
- 각 문서마다 별도의 편집 레이어
- 렌더링 영역에서 각 문서를 독립적으로 렌더링

---

## 11. Future Work

### 9.1 성능 최적화

- 편집 레이어 가상화
- 불필요한 동기화 최소화
- 렌더링 최적화

### 9.2 복잡한 레이아웃 지원

- 표 편집 지원
- 이미지 편집 지원
- 복잡한 블록 요소 편집

### 9.3 접근성

- 스크린 리더 호환
- 키보드 네비게이션
- ARIA 속성 지원

---

## 12. Conclusion

본 논문은 ContentEditable 기반 리치 텍스트 에디터의 문제를 해결하기 위해 **렌더링 영역과 ContentEditable 레이어를 완전히 분리**하는 새로운 패러다임을 제안했습니다.

**핵심 기여**:
1. **EditableSimulator 개념 도입**: 디자인 툴의 사이드바, 속성 창처럼 외부에서 모델을 편집하는 새로운 도구 개념
2. **완전한 분리**: 렌더링 영역과 편집 레이어를 독립적으로 관리
3. **구조 복제 전략**: 원본의 구조를 그대로 본떠서 에디팅 가능한 상태로 조합
4. **투명성 활용**: 커서 위치/Selection만 맞으면 하위 구조는 크게 신경 쓰지 않아도 됨
5. **사용자 경험 유지**: 기존 습관(키보드 입력)을 그대로 유지
6. **커서 Decorator**: 커서를 decorator로 렌더링 영역에 표시하여 사용자는 커서가 렌더링 영역에 있는 것처럼 보임
7. **완전한 투명성**: 편집 레이어는 완전히 투명하므로 어떤 텍스트를 입력하더라도 보이지 않음
8. **IME 완벽 지원**: ContentEditable 레이어로 IME 자연스럽게 처리
9. **단방향 데이터 흐름**: 각 영역이 명확한 데이터 흐름을 가짐

**장점**:
- ✅ 렌더링 영역: ContentEditable 없이 모델 기반 렌더링
- ✅ 편집 레이어: ContentEditable로 입력만 담당
- ✅ 완전한 분리로 각 영역의 문제를 독립적으로 해결 가능

**도전 과제**:
- ⚠️ **실시간 동기화**: 편집 레이어와 렌더링 영역을 실시간으로 동기화해야 함
- ⚠️ 구조 복제 성능: 렌더링 영역의 구조를 효율적으로 복제해야 함
- ⚠️ 동기화 타이밍: 렌더링과 동기화의 타이밍 조절 필요

이 접근법은 사용자의 기존 습관을 유지하면서도 ContentEditable의 문제를 근본적으로 해결할 수 있는 현실적인 해결책을 제시합니다.

---

## References

1. W3C. "ContentEditable". https://html.spec.whatwg.org/multipage/interaction.html#contenteditable
2. MDN. "Selection API". https://developer.mozilla.org/en-US/docs/Web/API/Selection
3. ProseMirror. "Document Model". https://prosemirror.net/docs/guide/#document
4. Figma. "How Figma Works". https://www.figma.com/blog/how-figma-works/

