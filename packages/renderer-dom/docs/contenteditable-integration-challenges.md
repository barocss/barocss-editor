# ContentEditable과 렌더링 시스템 통합: 고민해야 할 영역들

## 개요

렌더링 시스템이 완성되었다고 해도, **contenteditable과 함께 사용할 때는 추가적인 고민이 필요**합니다. 사용자의 입력 변경에 민감하게 반응하면서도 렌더링과의 충돌을 방지해야 합니다.

---

## 핵심 문제: 이중 상태 관리

### 문제 상황

```
사용자 입력
    ↓
브라우저가 DOM 직접 변경 (ContentEditable)
    ↓
MutationObserver 감지
    ↓
모델 업데이트
    ↓
렌더링 시스템이 DOM 재생성
    ↓
충돌! (브라우저 변경 vs 렌더링 변경)
```

**핵심 문제:**
- 브라우저가 DOM을 직접 변경 (ContentEditable)
- 렌더링 시스템도 DOM을 변경
- **두 시스템이 동시에 DOM을 조작** → 충돌 가능

---

## 고민해야 할 영역들

### 1. 입력 감지와 렌더링 타이밍 ⭐ **가장 중요**

#### 문제
- 사용자가 입력하는 동안 렌더링이 발생하면?
- 렌더링 중 사용자가 입력하면?

#### 해결 방안

**1-1. 렌더링 중 입력 차단**
```typescript
class EditorViewDOM {
  private _isRendering = false;
  
  render() {
    this._isRendering = true;
    try {
      // 렌더링 수행
      this.domRenderer.render(...);
    } finally {
      this._isRendering = false;
    }
  }
  
  handleTextContentChange() {
    // 렌더링 중이면 입력 무시
    if (this._isRendering) {
      return;
    }
    // 입력 처리
  }
}
```

**1-2. 입력 중 렌더링 지연**
```typescript
class EditorViewDOM {
  private renderDebounceTimer: NodeJS.Timeout | null = null;
  
  onContentChange() {
    // 입력 중이면 렌더링 지연
    if (this.isUserTyping) {
      this.renderDebounceTimer = setTimeout(() => {
        this.render();
      }, 100); // 100ms 지연
      return;
    }
    
    // 즉시 렌더링
    this.render();
  }
}
```

**1-3. 배치 처리**
```typescript
class EditorViewDOM {
  private pendingRenders: Set<string> = new Set();
  
  onContentChange(nodeId: string) {
    this.pendingRenders.add(nodeId);
    
    // 다음 프레임에 한 번만 렌더링
    requestAnimationFrame(() => {
      if (this.pendingRenders.size > 0) {
        this.render();
        this.pendingRenders.clear();
      }
    });
  }
}
```

---

### 2. Selection (커서/선택 영역) 관리 ⭐ **매우 중요**

#### 문제
- 렌더링 시 Selection이 사라짐
- 사용자가 입력 중인데 커서 위치가 변경됨
- 브라우저 Selection과 모델 Selection 동기화

#### 해결 방안

**2-1. Selection 보존**
```typescript
class EditorViewDOM {
  private preserveSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    
    const range = selection.getRangeAt(0);
    const startContainer = range.startContainer;
    const startOffset = range.startOffset;
    
    // TextNode의 sid와 offset 저장
    const textNodeSid = this.getSidFromTextNode(startContainer);
    
    return {
      textNodeSid,
      offset: startOffset,
      // 복원 함수
      restore: (newTextNode: Text, offset: number) => {
        const range = document.createRange();
        range.setStart(newTextNode, offset);
        range.setEnd(newTextNode, offset);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    };
  }
  
  render() {
    // 렌더링 전 Selection 저장
    const savedSelection = this.preserveSelection();
    
    // 렌더링 수행
    this.domRenderer.render(...);
    
    // 렌더링 후 Selection 복원
    if (savedSelection) {
      const newTextNode = this.findTextNodeBySid(savedSelection.textNodeSid);
      if (newTextNode) {
        savedSelection.restore(newTextNode, savedSelection.offset);
      }
    }
  }
}
```

**2-2. TextNode 재사용 (Selection 보존)**
```typescript
class TextNodePool {
  private sidToTextNodes: Map<string, Text[]> = new Map();
  
  getOrCreateTextNode(sid: string, text: string, selectionTextNode?: Text): Text {
    // Selection이 있는 TextNode 우선 재사용
    if (selectionTextNode && this.sidToTextNodes.get(sid)?.includes(selectionTextNode)) {
      selectionTextNode.textContent = text;
      return selectionTextNode;
    }
    
    // 기존 TextNode 재사용
    const existing = this.sidToTextNodes.get(sid)?.[0];
    if (existing) {
      existing.textContent = text;
      return existing;
    }
    
    // 새로 생성
    const newTextNode = document.createTextNode(text);
    this.register(sid, newTextNode);
    return newTextNode;
  }
}
```

**2-3. 모델 기반 Selection 관리**
```typescript
// 모델의 offset으로 Selection 관리
interface ModelSelection {
  nodeId: string;
  startOffset: number;
  endOffset: number;
}

class EditorViewDOM {
  private modelSelection: ModelSelection | null = null;
  
  // 모델 Selection을 DOM Selection으로 변환
  applyModelSelection(selection: ModelSelection) {
    const textNode = this.findTextNodeBySid(selection.nodeId);
    if (!textNode) return;
    
    const range = document.createRange();
    range.setStart(textNode, selection.startOffset);
    range.setEnd(textNode, selection.endOffset);
    
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }
  
  // DOM Selection을 모델 Selection으로 변환
  getModelSelection(): ModelSelection | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    
    const range = selection.getRangeAt(0);
    const textNode = range.startContainer;
    const sid = this.getSidFromTextNode(textNode);
    
    return {
      nodeId: sid,
      startOffset: range.startOffset,
      endOffset: range.endOffset
    };
  }
}
```

---

### 3. IME (조합형 입력) 처리 ⭐ **복잡함**

#### 문제
- 한글, 일본어, 중국어 입력 시 여러 번 DOM 변경
- 조합 중에는 렌더링하면 안 됨
- 조합 완료 후에만 모델 업데이트

#### 해결 방안

**3-1. 조합 상태 추적**
```typescript
class EditorViewDOM {
  private _isComposing = false;
  
  handleCompositionStart() {
    this._isComposing = true;
    // 조합 중에는 렌더링 차단
  }
  
  handleCompositionUpdate() {
    // 조합 중 변경사항은 pending에 저장
    this.pendingChanges.push(...);
  }
  
  handleCompositionEnd() {
    this._isComposing = false;
    // 조합 완료 후 모델 업데이트 및 렌더링
    this.commitPendingChanges();
    this.render();
  }
  
  onContentChange() {
    if (this._isComposing) {
      // 조합 중에는 렌더링 안 함
      return;
    }
    this.render();
  }
}
```

**3-2. 조합 중 디바운싱**
```typescript
class InputHandler {
  private pendingTextNodeId: string | null = null;
  private pendingTimer: NodeJS.Timeout | null = null;
  
  handleTextContentChange() {
    if (this.isComposing) {
      // 조합 중 변경사항을 pending에 저장
      this.pendingTextNodeId = textNodeId;
      
      // 100ms 디바운싱으로 모델 업데이트
      if (this.pendingTimer) clearTimeout(this.pendingTimer);
      this.pendingTimer = setTimeout(() => {
        this.commitPendingImmediate();
      }, 100);
      return;
    }
    
    // 즉시 처리
    this.processImmediate();
  }
}
```

---

### 4. MutationObserver와 렌더링 충돌 방지

#### 문제
- 렌더링이 DOM을 변경하면 MutationObserver가 트리거됨
- 무한 루프 발생 가능

#### 해결 방안

**4-1. 렌더링 플래그**
```typescript
class EditorViewDOM {
  private _isRendering = false;
  
  render() {
    this._isRendering = true;
    try {
      this.domRenderer.render(...);
    } finally {
      this._isRendering = false;
    }
  }
  
  // MutationObserver 콜백
  onDOMChange() {
    if (this._isRendering) {
      // 렌더링 중 발생한 변경은 무시
      return;
    }
    // 사용자 입력으로 간주하고 처리
    this.handleUserInput();
  }
}
```

**4-2. 변경 소스 추적**
```typescript
class MutationObserverManager {
  private changeSource: 'user' | 'render' | 'unknown' = 'unknown';
  
  observe() {
    const observer = new MutationObserver((mutations) => {
      // 변경 소스 확인
      if (this.changeSource === 'render') {
        // 렌더링으로 인한 변경은 무시
        this.changeSource = 'unknown';
        return;
      }
      
      // 사용자 입력으로 간주
      this.changeSource = 'user';
      this.handleUserInput(mutations);
    });
  }
  
  markAsRenderChange() {
    this.changeSource = 'render';
  }
}
```

---

### 5. 성능 최적화

#### 문제
- 사용자가 빠르게 입력할 때 렌더링이 너무 자주 발생
- 성능 저하

#### 해결 방안

**5-1. 디바운싱**
```typescript
class EditorViewDOM {
  private renderDebounceTimer: NodeJS.Timeout | null = null;
  
  onContentChange() {
    // 이전 타이머 취소
    if (this.renderDebounceTimer) {
      clearTimeout(this.renderDebounceTimer);
    }
    
    // 50ms 후 렌더링
    this.renderDebounceTimer = setTimeout(() => {
      this.render();
      this.renderDebounceTimer = null;
    }, 50);
  }
}
```

**5-2. Throttling**
```typescript
class EditorViewDOM {
  private lastRenderTime = 0;
  private readonly RENDER_INTERVAL = 16; // 60fps
  
  onContentChange() {
    const now = Date.now();
    if (now - this.lastRenderTime < this.RENDER_INTERVAL) {
      // 너무 자주 렌더링하지 않음
      return;
    }
    
    this.render();
    this.lastRenderTime = now;
  }
}
```

**5-3. 부분 업데이트**
```typescript
class EditorViewDOM {
  onContentChange(nodeId: string) {
    // 변경된 노드만 부분 업데이트
    if (this.canPartialUpdate(nodeId)) {
      this.renderPartial(nodeId);
    } else {
      this.render();
    }
  }
}
```

---

### 6. 브라우저 기본 동작 제어

#### 문제
- ContentEditable의 기본 동작이 원하지 않는 결과를 만듦
- 예: Enter 키, Backspace, 복사/붙여넣기

#### 해결 방안

**6-1. beforeinput 이벤트로 제어**
```typescript
class EditorViewDOM {
  handleBeforeInput(event: InputEvent) {
    // 기본 동작 차단
    event.preventDefault();
    
    // 우리가 원하는 동작 수행
    switch (event.inputType) {
      case 'insertText':
        this.handleInsertText(event.data);
        break;
      case 'insertLineBreak':
        this.handleInsertLineBreak();
        break;
      case 'deleteContentBackward':
        this.handleBackspace();
        break;
    }
  }
}
```

**6-2. keydown 이벤트로 제어**
```typescript
class EditorViewDOM {
  handleKeydown(event: KeyboardEvent) {
    // 특정 키는 기본 동작 차단
    if (event.key === 'Enter' || event.key === 'Backspace') {
      event.preventDefault();
      this.handleCustomKeyAction(event.key);
    }
  }
}
```

---

### 7. 복사/붙여넣기 처리

#### 문제
- 브라우저 기본 붙여넣기가 HTML을 그대로 삽입
- 우리 모델 구조와 맞지 않음

#### 해결 방안

**7-1. Clipboard API 사용**
```typescript
class EditorViewDOM {
  handlePaste(event: ClipboardEvent) {
    event.preventDefault();
    
    const clipboardData = event.clipboardData;
    if (!clipboardData) return;
    
    // 텍스트만 가져오기
    const text = clipboardData.getData('text/plain');
    
    // 모델에 삽입
    this.insertTextAtSelection(text);
    
    // 렌더링
    this.render();
  }
  
  handleCopy(event: ClipboardEvent) {
    event.preventDefault();
    
    const selection = this.getModelSelection();
    if (!selection) return;
    
    const text = this.getTextFromSelection(selection);
    
    // 클립보드에 텍스트 설정
    event.clipboardData?.setData('text/plain', text);
  }
}
```

---

### 8. 에러 복구 및 안정성

#### 문제
- 렌더링 중 에러 발생 시 상태 불일치
- 사용자 입력과 모델 불일치

#### 해결 방안

**8-1. 트랜잭션 롤백**
```typescript
class EditorViewDOM {
  render() {
    try {
      const prevState = this.saveState();
      this.domRenderer.render(...);
    } catch (error) {
      // 에러 발생 시 이전 상태로 복구
      this.restoreState(prevState);
      console.error('Render error:', error);
    }
  }
}
```

**8-2. 모델-DOM 동기화 검증**
```typescript
class EditorViewDOM {
  private validateSync() {
    const modelText = this.getModelText();
    const domText = this.getDOMText();
    
    if (modelText !== domText) {
      console.warn('Model-DOM mismatch detected, re-rendering...');
      this.render();
    }
  }
  
  // 주기적으로 검증
  startValidation() {
    setInterval(() => {
      this.validateSync();
    }, 1000);
  }
}
```

---

## 구현 우선순위

### Phase 1: 기본 안정성 (필수)
1. ✅ **렌더링 중 입력 차단** (`_isRendering` 플래그)
2. ✅ **Selection 보존** (TextNode 재사용)
3. ✅ **MutationObserver 충돌 방지** (변경 소스 추적)

### Phase 2: 사용자 경험 개선 (중요)
4. ✅ **IME 처리** (조합 상태 추적)
5. ✅ **성능 최적화** (디바운싱/Throttling)
6. ✅ **브라우저 기본 동작 제어** (beforeinput)

### Phase 3: 고급 기능 (선택)
7. ⚠️ **복사/붙여넣기** (Clipboard API)
8. ⚠️ **에러 복구** (트랜잭션 롤백)
9. ⚠️ **동기화 검증** (주기적 검증)

---

## 현재 구현 상태

### 이미 구현된 것들
- ✅ MutationObserver로 DOM 변경 감지
- ✅ InputHandler로 입력 처리
- ✅ IME 조합 상태 추적 (`_isComposing`)
- ✅ 렌더링 플래그 (`_isRendering`)
- ✅ Selection 보존 (TextNodePool)
- ✅ 디바운싱 (조합 중)

### 개선이 필요한 영역들
- ⚠️ **부분 업데이트**: 현재는 전체 렌더링
- ⚠️ **에러 복구**: 트랜잭션 롤백 미구현
- ⚠️ **동기화 검증**: 주기적 검증 미구현
- ⚠️ **복사/붙여넣기**: 기본 동작만 사용

---

## 결론

**렌더링 시스템만으로는 부족합니다:**

1. ✅ **입력 감지와 렌더링 타이밍 조율** (가장 중요)
2. ✅ **Selection 관리** (매우 중요)
3. ✅ **IME 처리** (복잡하지만 필수)
4. ✅ **충돌 방지** (무한 루프 방지)
5. ⚠️ **성능 최적화** (사용자 경험)
6. ⚠️ **에러 복구** (안정성)

**핵심 원칙:**
- **사용자 입력을 우선** (렌더링보다 입력이 먼저)
- **상태 일관성 유지** (모델-DOM 동기화)
- **성능과 안정성 균형** (너무 자주 렌더링하지 않기)

