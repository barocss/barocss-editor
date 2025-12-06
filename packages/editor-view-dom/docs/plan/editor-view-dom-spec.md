# editor-view-dom 스펙 문서

본 문서는 `@barocss/editor-view-dom` 패키지의 기술 스펙이다. 구현과 테스트는 본 문서를 기준으로 한다.

## 목차

1. [아키텍처 개요](#1-아키텍처-개요)
2. [레이어 시스템](#2-레이어-시스템)
3. [renderer-dom 통합](#3-renderer-dom-통합)
4. [이벤트 핸들러 시스템](#4-이벤트-핸들러-시스템)
5. [Decorator 시스템](#5-decorator-시스템)
6. [skipNodes 기능](#6-skipnodes-기능)
7. [Keymap 시스템](#7-keymap-시스템)
8. [Native Commands](#8-native-commands)
9. [Selection 관리](#9-selection-관리)
10. [생명주기](#10-생명주기)
11. [오류 처리](#11-오류-처리)
12. [성능 요구사항](#12-성능-요구사항)

---

## 1. 아키텍처 개요

### 1.1 역할과 책임

`EditorViewDOM`은 `editor-core`와 브라우저 DOM 사이의 브리지 역할을 한다.

**주요 책임:**
- `editor-core`의 모델 데이터를 DOM으로 렌더링
- 사용자 입력(DOM 이벤트)을 모델 변경으로 변환
- Selection 관리 (DOM ↔ Model)
- Decorator 시스템 관리
- 레이어 시스템 관리 (5개 레이어)

### 1.2 전체 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                    EditorViewDOM                             │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Editor (editor-core)                              │    │
│  │  - getDocumentProxy() → Proxy<INode>              │    │
│  │  - exportDocument() → INode                        │    │
│  │  - dataStore.getAllDecorators() → Decorator[]     │    │
│  └────────────────────────────────────────────────────┘    │
│                          │                                   │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Event Handlers                                    │    │
│  │  - InputHandler (input, beforeinput, composition) │    │
│  │  - SelectionHandler (DOM ↔ Model)                 │    │
│  │  - MutationObserverManager (DOM 변경 감지)         │    │
│  └────────────────────────────────────────────────────┘    │
│                          │                                   │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────┐    │
│  │  renderer-dom Integration                          │    │
│  │  - DOMRenderer (Content 레이어)                    │    │
│  │  - DOMRenderer (Decorator/Selection/Context/Custom)│    │
│  │  - RendererRegistry                                 │    │
│  └────────────────────────────────────────────────────┘    │
│                          │                                   │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Layer System (5 layers)                           │    │
│  │  - content (contentEditable)                       │    │
│  │  - decorator, selection, context, custom            │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 데이터 흐름

#### 렌더링 흐름 (Model → DOM)

```
Editor.getDocumentProxy() 또는 외부 ModelData
    │
    ├─ ModelData 형식 (sid, stype 사용)
    │
    ▼
EditorViewDOM.render()
    │
    ├─ Decorator 데이터 수집 (dataStore.getAllDecorators())
    │
    ▼
DOMRenderer.render(container, modelData, decorators, skipNodes)
    │
    ├─ VNodeBuilder: ModelData → VNode Tree
    ├─ Reconciler: VNode Tree → DOM diff (skipNodes 적용)
    └─ DOMOperations: DOM 업데이트
    │
    ▼
layers.content (contentEditable)
```

#### 입력 흐름 (DOM → Model)

```
사용자 입력 (DOM 이벤트)
    │
    ├─ InputHandler.handleInput()
    │  └─ beforeInput 이벤트 처리
    │
    ├─ MutationObserverManager
    │  └─ DOM 변경 감지
    │
    ▼
InputHandler.handleTextContentChange()
    │
    ├─ SmartTextAnalyzer: DOM 변경 → TextChange
    │
    ▼
Editor.executeTransaction()
    │
    ├─ 모델 업데이트
    │
    ▼
editor:content.change 이벤트
    │
    ▼
EditorViewDOM.render() (skipNodes 적용)
```

### 1.4 핵심 원칙

- **레이어 분리**: 5개의 독립적인 레이어로 UI 요소를 분리
- **renderer-dom 통합**: 모든 렌더링은 `renderer-dom`을 통해 수행
- **이벤트 기반**: DOM 이벤트를 모델 변경으로 변환
- **skipNodes 보호**: 사용자 입력 중인 노드는 외부 변경으로부터 보호
- **모델 우선**: 모델이 항상 단일 소스 오브 트루스 (Single Source of Truth)

---

## 2. 레이어 시스템

### 2.1 레이어 구조

`EditorViewDOM`은 5개의 독립적인 레이어를 사용한다:

```
Container (position: relative)
├─ Layer 1: Content (z-index: 1)
│  └─ contentEditable = true
│  └─ renderer-dom이 여기에 렌더링
│
├─ Layer 2: Decorator (z-index: 10)
│  └─ layer 카테고리 decorator들
│
├─ Layer 3: Selection (z-index: 100)
│  └─ 선택 영역 표시
│
├─ Layer 4: Context (z-index: 200)
│  └─ 툴팁, 컨텍스트 메뉴
│
└─ Layer 5: Custom (z-index: 1000)
   └─ 커스텀 오버레이
```

### 2.2 레이어별 특성

| Layer | Z-Index | Position | Pointer Events | Purpose | Diff Included |
|-------|---------|----------|----------------|---------|---------------|
| **Content** | 1 | `relative` | ✅ Enabled | Editable content, text input | ✅ Yes |
| **Decorator** | 10 | `absolute` | ❌ Disabled* | Highlights, annotations, widgets | Layer: ✅ / Widget: ❌ |
| **Selection** | 100 | `absolute` | ❌ Disabled | Selection indicators, cursor | ❌ No |
| **Context** | 200 | `absolute` | ❌ Disabled | Context menus, tooltips | ❌ No |
| **Custom** | 1000 | `absolute` | ❌ Disabled | User-defined overlays | ❌ No |

*일부 decorator 요소(inline/block widgets)는 pointer events를 활성화할 수 있음

### 2.3 레이어 생성

레이어는 `EditorViewDOM` 생성자에서 자동으로 생성된다:

```typescript
const view = new EditorViewDOM(editor, {
  container: document.getElementById('editor-container'),
  layers: {
    contentEditable: {
      className: 'my-editor-content',
      attributes: { 'data-testid': 'editor' }
    },
    decorator: {
      className: 'my-decorators'
    },
    // ... 기타 레이어 설정
  }
});
```

### 2.4 레이어 접근

```typescript
view.layers.content      // HTMLElement - contentEditable layer
view.layers.decorator    // HTMLElement - decorator overlay layer
view.layers.selection    // HTMLElement - selection UI layer
view.layers.context      // HTMLElement - context UI layer
view.layers.custom       // HTMLElement - custom overlay layer
```

---

## 3. renderer-dom 통합

### 3.1 DOMRenderer 인스턴스

`EditorViewDOM`은 여러 개의 `DOMRenderer` 인스턴스를 사용한다:

- **`_domRenderer`**: Content 레이어용 (Selection 보존 활성화)
- **`_decoratorRenderer`**: Decorator 레이어용
- **`_selectionRenderer`**: Selection 레이어용
- **`_contextRenderer`**: Context 레이어용
- **`_customRenderer`**: Custom 레이어용

각 `DOMRenderer`는 독립적인 `prevVNodeTree`를 유지한다.

### 3.2 렌더링 흐름

```typescript
// EditorViewDOM.render()
render(tree?: ModelData, options?: { sync?: boolean }): void {
  // 1. 모델 데이터 가져오기
  const modelData = tree || this.editor.getDocumentProxy();
  
  // 2. Decorator 데이터 수집
  const allDecorators = this.editor.dataStore.getAllDecorators();
  const decoratorData = allDecorators.map(d => convertToDecoratorData(d));
  
  // 3. Selection 컨텍스트 준비
  const selectionContext = this.selectionHandler.getSelectionContext();
  
  // 4. Content 레이어 렌더링 (동기)
  this._domRenderer?.render(
    this.layers.content,
    modelData,
    decoratorData,
    undefined,
    selectionContext,
    { skipNodes: this._editingNodes.size > 0 ? this._editingNodes : undefined }
  );
  
  // 5. 다른 레이어들 렌더링 (requestAnimationFrame 이후)
  // ...
}
```

### 3.3 데이터 형식

**모든 데이터는 ModelData 형식 (sid, stype 사용)**:

```typescript
{
  sid: 'doc-1',           // 노드 식별자 (필수)
  stype: 'document',      // 노드 타입 (필수)
  content: [...],         // 자식 노드 배열
  text: '...',            // 텍스트 내용 (선택적)
  marks: [...],           // 텍스트 마크
  attributes: {...}        // 노드 속성
}
```

**변환 없이 직접 사용**: 모든 데이터는 이미 ModelData 형식이므로 변환 없이 `renderer-dom`에 전달한다.

### 3.4 Decorator 데이터 변환

```typescript
function convertToDecoratorData(decorator: any): DecoratorData {
  return {
    sid: decorator.sid || decorator.id,
    stype: decorator.stype || decorator.type,
    category: decorator.category || 'inline',
    position: decorator.position, // 'before' | 'after' | 'inside'
    target: {
      sid: decorator.target.sid || decorator.target.nodeId,
      startOffset: decorator.target.startOffset,
      endOffset: decorator.target.endOffset
    },
    data: decorator.data || {}
  };
}
```

---

## 4. 이벤트 핸들러 시스템

### 4.1 InputHandler

**역할**: 사용자 입력 처리 (텍스트 입력, IME 조합)

**주요 메서드:**
- `handleInput(event: InputEvent)`: input 이벤트 처리
- `handleBeforeInput(event: InputEvent)`: beforeInput 이벤트 처리
- `handleTextContentChange(oldValue, newValue, target)`: MutationObserver에서 호출, 모델 업데이트
- `handleCompositionStart/Update/End()`: IME 조합 처리

**동작 흐름:**
```
DOM 변경 (MutationObserver)
    │
    ▼
InputHandler.handleTextContentChange()
    │
    ├─ SmartTextAnalyzer: DOM 변경 → TextChange
    │
    ▼
Editor.executeTransaction()
    │
    ├─ 모델 업데이트
    │
    ▼
editor:content.change 이벤트
    │
    ▼
EditorViewDOM.render() (skipNodes 적용)
```

### 4.2 SelectionHandler

**역할**: DOM Selection ↔ Model Selection 변환

**주요 메서드:**
- `convertDOMSelectionToModel(sel: Selection)`: DOM → Model 변환
- `convertModelSelectionToDOM(sel: ModelSelection)`: Model → DOM 변환

**동작:**
- `selectionchange` 이벤트 발생 시 DOM Selection을 Model Selection으로 변환
- `editor:selection.model` 이벤트 발생 시 Model Selection을 DOM Selection으로 변환

### 4.3 MutationObserverManager

**역할**: DOM 변경 감지

**주요 기능:**
- 텍스트 변경 감지 (`onTextChange`)
- 구조 변경 감지 (`onStructureChange`)
- 속성 변경 감지 (`onAttributeChange`)

**보호 메커니즘:**
- `_isRendering` 플래그로 렌더링 중 발생하는 DOM 변경은 무시 (무한루프 방지)

### 4.4 이벤트 리스너 설정

```typescript
private setupEventListeners(): void {
  // 입력 이벤트
  this.contentEditableElement.addEventListener('input', this.handleInput.bind(this));
  this.contentEditableElement.addEventListener('beforeinput', this.handleBeforeInput.bind(this));
  this.contentEditableElement.addEventListener('keydown', this.handleKeydown.bind(this));
  this.contentEditableElement.addEventListener('paste', this.handlePaste.bind(this));
  this.contentEditableElement.addEventListener('drop', this.handleDrop.bind(this));
  
  // 조합 이벤트 (IME)
  this.contentEditableElement.addEventListener('compositionstart', this.handleCompositionStart.bind(this));
  this.contentEditableElement.addEventListener('compositionupdate', this.handleCompositionUpdate.bind(this));
  this.contentEditableElement.addEventListener('compositionend', this.handleCompositionEnd.bind(this));
  
  // 선택 이벤트
  document.addEventListener('selectionchange', this.handleSelectionChange.bind(this));
  
  // 포커스 이벤트
  this.contentEditableElement.addEventListener('focus', this.handleFocus.bind(this));
  this.contentEditableElement.addEventListener('blur', this.handleBlur.bind(this));
}
```

---

## 5. Decorator 시스템

### 5.1 Decorator 카테고리

1. **Layer Decorator**: CSS/overlay-only representation (diff에 포함)
2. **Inline Decorator**: 텍스트 내부에 삽입되는 DOM 위젯 (diff에서 제외)
3. **Block Decorator**: 블록 레벨에서 삽입되는 DOM 위젯 (diff에서 제외)

### 5.2 Decorator 관리자

- **`DecoratorRegistry`**: Decorator 타입과 renderer 등록
- **`DecoratorManager`**: Decorator CRUD 작업
- **`RemoteDecoratorManager`**: 원격 Decorator 관리
- **`PatternDecoratorConfigManager`**: 패턴 기반 Decorator 설정 관리
- **`DecoratorGeneratorManager`**: 함수 기반 Decorator 생성 관리

### 5.3 Decorator 렌더링

```typescript
// Decorator 추가
view.decoratorManager.add({
  id: 'highlight-1',
  category: 'layer',
  type: 'highlight',
  target: { nodeId: 'text-1', startOffset: 0, endOffset: 5 },
  data: { backgroundColor: 'yellow' }
});

// Decorator 렌더링은 render() 호출 시 자동으로 수행됨
view.render();
```

---

## 6. skipNodes 기능

### 6.1 목적

사용자 입력 중인 노드를 외부 변경(AI, 동시편집)으로부터 보호한다.

### 6.2 동작 원리

```typescript
// 입력 시작 시
private _onInputStart(): void {
  const sids = this._getEditingNodeSids();
  sids.forEach(sid => this._editingNodes.add(sid));
}

// 입력 종료 시 (디바운싱)
private _onInputEnd(): void {
  if (this._inputEndDebounceTimer) {
    clearTimeout(this._inputEndDebounceTimer);
  }
  
  this._inputEndDebounceTimer = window.setTimeout(() => {
    this._editingNodes.clear();
    // skipNodes 없이 재렌더링하여 최신 모델 반영
    this.render();
  }, 300); // 300ms 디바운싱
}
```

### 6.3 렌더링에 적용

```typescript
this._domRenderer?.render(
  this.layers.content,
  modelData,
  allDecorators,
  undefined,
  selectionContext,
  { skipNodes: this._editingNodes.size > 0 ? this._editingNodes : undefined }
);
```

### 6.4 동작 흐름

```
1. 사용자 입력 시작
   → _onInputStart() → editingNodes에 추가

2. 외부 변경 발생 (AI, 동시편집)
   → 모델 업데이트 (항상 수행)
   → render({ skipNodes: editingNodes })
   → DOM 업데이트 스킵 (입력 중인 노드 보호)

3. 사용자 입력 종료
   → _onInputEnd() → editingNodes 제거 (300ms 디바운싱)
   → render() (skipNodes 없음)
   → DOM 업데이트 (최신 모델 반영)
```

### 6.5 핸들러와의 관계

**핵심**: `skipNodes`는 렌더링 단계의 개념이며, 핸들러들은 모델 업데이트를 담당하므로 `skipNodes`와 무관하다.

- **InputHandler**: 모델 업데이트는 항상 수행 (skipNodes와 무관)
- **SelectionHandler**: Selection 변환만 담당 (skipNodes와 무관)
- **MutationObserverManager**: DOM 변경 감지만 담당 (이미 `_isRendering`으로 보호)

---

## 7. Keymap 시스템

### 7.1 기본 키맵

```typescript
// 포맷팅
Ctrl+B / Cmd+B → toggleBold()
Ctrl+I / Cmd+I → toggleItalic()
Ctrl+U / Cmd+U → toggleUnderline()

// 편집
Enter → insertParagraph()
Shift+Enter → insertLineBreak()

// 히스토리
Ctrl+Z / Cmd+Z → historyUndo()
Ctrl+Y / Cmd+Y → historyRedo()
Ctrl+Shift+Z / Cmd+Shift+Z → historyRedo()

// 선택
Ctrl+A / Cmd+A → selectAll()
```

### 7.2 커스텀 키맵 등록

```typescript
view.keymapManager.register('Ctrl+Shift+h', () => {
  editor.executeCommand('heading.insert', { level: 2 });
});

view.keymapManager.register('Ctrl+/', () => {
  editor.executeCommand('comment.toggle');
});
```

---

## 8. Native Commands

### 8.1 지원 명령

```typescript
// 텍스트 삽입/삭제
view.insertText('Hello world');
view.insertParagraph();
view.deleteSelection();

// 히스토리
view.historyUndo();
view.historyRedo();

// 포맷팅
view.toggleBold();
view.toggleItalic();
view.toggleUnderline();
```

### 8.2 동작 원리

모든 Native Command는 `editor-core`의 명령 시스템을 통해 모델을 업데이트하고, 이후 `render()`가 자동으로 호출된다.

---

## 9. Selection 관리

### 9.1 DOM ↔ Model 변환

```typescript
// DOM Selection → Model Selection
const modelSelection = view.selectionHandler.convertDOMSelectionToModel(
  window.getSelection()
);

// Model Selection → DOM Selection
view.selectionHandler.convertModelSelectionToDOM({
  nodeId: 'text-1',
  startOffset: 0,
  endOffset: 5
});
```

### 9.2 Selection 이벤트

```typescript
// DOM Selection 변경 시
view.on('editor:selection.change', (data) => {
  console.log('Model selection:', data.selection);
});

// Model Selection 변경 시
editor.on('editor:selection.model', (sel) => {
  // DOM Selection으로 변환하여 적용
});
```

---

## 10. 생명주기

### 10.1 초기화

```typescript
const view = new EditorViewDOM(editor, {
  container: document.getElementById('editor-container'),
  registry: getGlobalRegistry(),
  autoRender: true,
  initialTree: { ... } // 선택적
});
```

**초기화 순서:**
1. 레이어 구조 생성
2. Decorator 시스템 초기화
3. 이벤트 핸들러 초기화
4. Keymap 설정
5. 이벤트 리스너 설정
6. MutationObserver 설정
7. 렌더러 설정
8. `autoRender`가 true이고 `initialTree`가 있으면 자동 렌더링

### 10.2 렌더링

```typescript
// 전체 문서 렌더링
view.render();

// 특정 모델 데이터로 렌더링
view.render({
  sid: 'doc1',
  stype: 'document',
  content: [...]
});
```

### 10.3 정리

```typescript
view.destroy();
```

**정리 작업:**
- 이벤트 리스너 제거
- MutationObserver 해제
- Decorator 정리
- 키맵 정리
- 렌더러 정리

---

## 11. 오류 처리

### 11.1 렌더링 오류

```typescript
try {
  this._domRenderer?.render(...);
} catch (error) {
  console.error('[EditorViewDOM] Error rendering content:', error);
  // Content 렌더링 실패해도 decorator는 렌더링 시도
}
```

### 11.2 모델 검증

- `stype` 필드가 없으면 에러 발생 (필수 필드)
- `sid` 필드가 없으면 에러 발생 (필수 필드)
- 템플릿이 등록되지 않은 `stype`은 에러 발생

### 11.3 Decorator 변환 실패

Decorator 변환 실패는 경고만 출력하고 계속 진행한다.

---

## 12. 성능 요구사항

### 12.1 렌더링 성능

- 대용량 문서(5000+ 노드)에서도 렌더링 시간 < 100ms
- `skipNodes`를 통한 부분 업데이트로 입력 중 성능 유지

### 12.2 이벤트 처리 성능

- 입력 이벤트 처리 < 1ms
- Selection 변경 처리 < 16ms (60fps)

### 12.3 메모리 사용

- Proxy 기반 lazy evaluation으로 초기 로딩 시간 및 메모리 사용량 최적화
- 레이어별 독립적인 `prevVNodeTree`로 메모리 사용량 증가 (필요한 트레이드오프)

---

## 참고 자료

- [renderer-dom 명세](../../renderer-dom/docs/renderer-dom-spec.md)
- [renderer-dom 통합 명세](./renderer-dom-integration-spec.md)
- [skipNodes 핸들러 통합 가이드](./skipnodes-handlers-integration.md)

