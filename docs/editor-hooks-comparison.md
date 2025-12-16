# 에디터별 Hooks/Events 아키텍처 비교

## 개요

주요 에디터들(ProseMirror, Tiptap, Slate, Draft.js)이 어떻게 hooks와 events를 분리하고 관리하는지 비교 분석합니다.

---

## 1. ProseMirror

### 구조

**Plugin 시스템 사용:**
- Plugin은 별도의 객체
- Extension과 분리되어 있음
- Hooks는 Plugin 내부에 정의

### Hooks (Plugin 내부)

```javascript
const myPlugin = new Plugin({
  // Before hook: Transaction 가로채기/취소
  filterTransaction(transaction, state) {
    if (shouldBlock(transaction)) {
      return false; // 취소
    }
    return true; // 허용
  },
  
  // After hook: Transaction 실행 후 추가 작업
  appendTransaction(transactions, oldState, newState) {
    let tr = newState.tr;
    // 추가 transaction 생성
    return tr; // 또는 null
  },
  
  // State 관리
  state: {
    init() { return {}; },
    apply(tr, value) { return value; }
  }
});
```

### Events (별도 시스템)

```javascript
// EditorView의 dispatchTransaction
const view = new EditorView(container, {
  state,
  dispatchTransaction(transaction) {
    // 이벤트 리스너처럼 동작
    const newState = view.state.apply(transaction);
    view.updateState(newState);
  }
});

// 또는 Plugin에서 이벤트 emit
editorView.dom.addEventListener('click', (e) => {
  // DOM 이벤트 처리
});
```

### 특징

- ✅ **Hooks와 Events 분리**: Plugin hooks와 DOM events는 별도
- ✅ **Plugin은 Stateful**: Plugin이 자체 state를 가질 수 있음
- ✅ **Before/After 명확히 구분**: `filterTransaction` (before), `appendTransaction` (after)
- ❌ **Extension 개념 없음**: Plugin이 모든 것을 담당

---

## 2. Tiptap

### 구조

**Extension 시스템 사용:**
- Extension이 모든 것을 담당 (commands, hooks, events)
- ProseMirror 기반이지만 Extension 중심

### Hooks (Extension 내부)

```javascript
import { Extension } from '@tiptap/core';

const CustomExtension = Extension.create({
  name: 'custom',
  
  // Lifecycle hooks
  onCreate({ editor }) {
    // Extension 생성 시
  },
  
  onDestroy({ editor }) {
    // Extension 제거 시
  },
  
  // Transaction hooks
  onTransaction({ editor, transaction }) {
    // Transaction 실행 후 (after)
    console.log('Transaction:', transaction);
  },
  
  // Content hooks
  onUpdate({ editor }) {
    // Content 변경 후 (after)
    console.log('Content updated:', editor.getJSON());
  },
  
  // Selection hooks
  onSelectionUpdate({ editor }) {
    // Selection 변경 후 (after)
    console.log('Selection:', editor.state.selection);
  },
  
  // Before hooks (ProseMirror Plugin 사용)
  addProseMirrorPlugins() {
    return [
      new Plugin({
        filterTransaction: (transaction) => {
          // Before hook
          return true;
        }
      })
    ];
  }
});
```

### Events (별도 시스템)

```javascript
// Editor 이벤트 리스너
editor.on('transaction', ({ transaction }) => {
  console.log('Transaction event');
});

editor.on('update', ({ editor }) => {
  console.log('Update event');
});

editor.on('selectionUpdate', ({ editor }) => {
  console.log('Selection update event');
});
```

### 특징

- ✅ **Extension 내부에 Hooks**: `onTransaction`, `onUpdate` 등
- ✅ **Events는 별도**: `editor.on()` 사용
- ✅ **Before hooks는 Plugin으로**: `addProseMirrorPlugins()` 사용
- ⚠️ **중복 가능**: Extension hooks와 Events가 기능적으로 중복

---

## 3. Slate

### 구조

**Plugin/Component Props 혼합:**
- Plugin: Middleware 패턴
- Component Props: React 이벤트 핸들러

### Hooks (Plugin Middleware)

```javascript
const MyPlugin = {
  // Before hooks: 이벤트 가로채기
  onKeyDown(event, editor, next) {
    if (event.key === 'Enter') {
      // 커스텀 로직
      return true; // 기본 동작 차단
    }
    return next(); // 다음 핸들러로 전달
  },
  
  onBeforeInput(event, editor, next) {
    // 입력 전 가로채기
    return next();
  },
  
  // After hooks: 변경 후
  onChange(editor, next) {
    // 변경 후 로직
    return next();
  }
};

// 사용
const editor = withReact(createEditor());
const editorWithPlugin = withMyPlugin(editor);
```

### Events (Component Props)

```jsx
<Editable
  onClick={(event) => {
    // 클릭 이벤트
  }}
  onKeyDown={(event) => {
    // 키보드 이벤트
  }}
  onDrop={(event) => {
    // 드롭 이벤트
    return true; // 기본 동작 차단
  }}
/>
```

### 특징

- ✅ **Middleware 패턴**: `next()`로 체인 구성
- ✅ **Component Props**: React 이벤트 핸들러
- ✅ **Before/After 구분**: `onKeyDown` (before), `onChange` (after)
- ⚠️ **혼합 구조**: Plugin과 Component Props 혼용

---

## 4. Draft.js

### 구조

**Props 기반:**
- 모든 것이 Editor 컴포넌트의 props
- 이벤트 핸들러만 제공

### Hooks (Props로 제공)

```javascript
<Editor
  editorState={editorState}
  onChange={setEditorState}
  
  // Before hooks (이벤트 가로채기)
  handleKeyCommand={(command, editorState) => {
    if (command === 'bold') {
      setEditorState(RichUtils.toggleInlineStyle(editorState, 'BOLD'));
      return 'handled'; // 기본 동작 차단
    }
    return 'not-handled'; // 기본 동작 허용
  }}
  
  handlePastedText={(text, html, editorState) => {
    // 붙여넣기 전 처리
    return 'handled';
  }}
  
  // After hooks (이벤트 리스너)
  onFocus={() => {
    console.log('Focused');
  }}
  
  onBlur={() => {
    console.log('Blurred');
  }}
/>
```

### 특징

- ✅ **단순한 구조**: Props만 사용
- ✅ **명확한 Before/After**: `handle*` (before), `on*` (after)
- ❌ **확장성 제한**: Props만으로는 복잡한 로직 어려움
- ❌ **Extension 개념 없음**: 모든 것이 Editor 컴포넌트에 집중

---

## 비교표

| 에디터 | Hooks 위치 | Events 위치 | Before Hook | After Hook | Extension/Plugin |
|--------|-----------|-------------|-------------|------------|-------------------|
| **ProseMirror** | Plugin 내부 | 별도 (DOM/View) | `filterTransaction` | `appendTransaction` | Plugin만 |
| **Tiptap** | Extension 내부 | 별도 (`editor.on()`) | `addProseMirrorPlugins()` | `onTransaction` 등 | Extension |
| **Slate** | Plugin Middleware | Component Props | `onKeyDown` 등 | `onChange` | Plugin |
| **Draft.js** | Editor Props | Editor Props | `handle*` | `on*` | 없음 |
| **Barocss (현재)** | Extension 내부 | 별도 (`editor.on()`) | `onBeforeTransaction` | `onTransaction` | Extension |

---

## 패턴 분석

### 1. Hooks와 Events 분리 여부

**분리하는 에디터:**
- ✅ **ProseMirror**: Plugin hooks와 DOM events 분리
- ✅ **Tiptap**: Extension hooks와 `editor.on()` events 분리
- ✅ **Barocss**: Extension hooks와 `editor.on()` events 분리

**분리하지 않는 에디터:**
- ❌ **Slate**: Plugin middleware와 Component props 혼용
- ❌ **Draft.js**: 모든 것이 Props

### 2. Before/After Hooks 구분

**명확히 구분:**
- ✅ **ProseMirror**: `filterTransaction` (before), `appendTransaction` (after)
- ✅ **Tiptap**: `addProseMirrorPlugins()` (before), `onTransaction` (after)
- ✅ **Slate**: `onKeyDown` (before), `onChange` (after)
- ✅ **Draft.js**: `handle*` (before), `on*` (after)
- ✅ **Barocss**: `onBeforeTransaction` (before), `onTransaction` (after)

### 3. Extension/Plugin 개념

**Extension 중심:**
- ✅ **Tiptap**: Extension이 모든 것을 담당
- ✅ **Barocss**: Extension이 모든 것을 담당

**Plugin 중심:**
- ✅ **ProseMirror**: Plugin이 모든 것을 담당
- ✅ **Slate**: Plugin이 모든 것을 담당

**없음:**
- ❌ **Draft.js**: Extension/Plugin 개념 없음

---

## Barocss와의 비교

### 현재 Barocss 구조

```typescript
interface Extension {
  // Before hooks (가로채기/수정)
  onBeforeTransaction?(...): Transaction | null | void;
  onBeforeSelectionChange?(...): SelectionState | null | void;
  onBeforeContentChange?(...): DocumentState | null | void;
  
  // After hooks (알림)
  onTransaction?(...): void;
  onSelectionChange?(...): void;
  onContentChange?(...): void;
}

// Events (별도)
editor.on('editor:content.change', (data) => { ... });
```

### 다른 에디터와의 차이점

**1. Tiptap과 유사:**
- ✅ Extension 내부에 hooks
- ✅ Events는 별도 (`editor.on()`)
- ✅ Before/After 구분

**2. 차이점:**
- ⚠️ **Tiptap**: Before hooks는 `addProseMirrorPlugins()`로 (ProseMirror Plugin 사용)
- ✅ **Barocss**: Before hooks는 Extension 인터페이스에 직접 정의

**3. ProseMirror와의 차이:**
- ⚠️ **ProseMirror**: Plugin이 hooks 담당, Extension 개념 없음
- ✅ **Barocss**: Extension이 hooks 담당

---

## 결론 및 권장사항

### 현재 Barocss 구조는 적절합니다

**이유:**
1. ✅ **Tiptap과 유사한 패턴**: 검증된 아키텍처
2. ✅ **Hooks와 Events 분리**: 명확한 역할 구분
3. ✅ **Before/After 구분**: 명확한 시점 구분
4. ✅ **Extension 중심**: 일관된 확장 모델

### 개선 제안

**1. After hooks는 선택적으로 사용:**
```typescript
// 권장: Events 사용
editor.on('editor:content.change', (data) => { ... });

// 선택적: Extension hooks 사용 (타입 안정성이 필요할 때)
onContentChange(editor, content) { ... }
```

**2. Before hooks는 Extension 인터페이스에 유지:**
- 가로채기/수정이 핵심 기능
- 타입 안정성 중요
- Priority 기반 순서 보장 필요

**3. 새로운 훅은 신중하게 추가:**
- 실제 필요할 때만 추가
- Before hooks 패턴 유지
- Events로 해결 가능한지 먼저 검토

### 최종 권장 구조

```typescript
interface Extension {
  // Lifecycle (필수)
  onCreate?(editor: Editor): void;
  onDestroy?(editor: Editor): void;
  
  // Before hooks (가로채기/수정) - 권장
  onBeforeTransaction?(...): Transaction | null | void;
  onBeforeSelectionChange?(...): SelectionState | null | void;
  onBeforeContentChange?(...): DocumentState | null | void;
  
  // After hooks (알림) - 선택적, Events 권장
  onTransaction?(...): void; // @deprecated - editor.on() 사용 권장
  onSelectionChange?(...): void; // @deprecated
  onContentChange?(...): void; // @deprecated
  
  commands?: Command[];
}
```

**핵심 원칙:**
- **Before hooks**: Extension 인터페이스에 유지 (가로채기/수정)
- **After hooks**: Events 권장, Extension hooks는 선택적
- **Lifecycle hooks**: Extension 인터페이스에 유지 (필수)
