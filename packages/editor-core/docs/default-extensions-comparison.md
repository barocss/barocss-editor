# 다른 에디터들의 기본 기능 관리 방식 비교

## 주요 에디터들의 접근 방식

### 1. **ProseMirror**

**구조**:
```
@prosemirror/core          → 최소한의 핵심 기능 (EditorState, Transaction)
@prosemirror/commands      → 기본 Command들 (insertText, delete, etc.)
@prosemirror/schema-basic  → 기본 Schema + Extension들
```

**특징**:
- ✅ Core는 **최소한만** 제공 (EditorState, Transaction)
- ✅ **기본 Command들은 별도 패키지** (`@prosemirror/commands`)
- ✅ 사용자가 명시적으로 import해서 사용
- ❌ Core에 기본 command가 포함되지 않음

**사용 예시**:
```typescript
import { EditorState } from '@prosemirror/state';
import { EditorView } from '@prosemirror/view';
import { Schema, DOMParser } from '@prosemirror/model';
import { schema } from '@prosemirror/schema-basic';
import { keymap } from '@prosemirror/keymap';
import { baseKeymap } from '@prosemirror/example-setup';

// 기본 기능을 명시적으로 plugins에 추가
const view = new EditorView(document.body, {
  state: EditorState.create({
    doc: DOMParser.fromSchema(schema).parse(document.body),
    plugins: [
      keymap(baseKeymap), // 기본 키보드 단축키 (Enter, Backspace 등)
      // ... 다른 plugins
    ]
  })
});
```

**핵심**:
- ProseMirror는 **기본 편집 기능도 외부에서 제공**
- `baseKeymap`이 Enter, Backspace 등의 기본 동작을 제공
- 사용자가 `plugins` 배열에 **명시적으로 추가**해야 함

---

### 2. **Slate.js**

**구조**:
```
slate                      → Core (Editor, Transforms)
slate-history              → History Extension
```

**특징**:
- ✅ Core에 **기본 Transform 함수들이 포함**됨
  - `Transforms.insertText()`
  - `Transforms.delete()`
  - `Transforms.insertNodes()`
- ✅ 기본 편집 기능이 **core에 내장**
- ✅ 사용자가 별도 import 없이 사용 가능

**사용 예시**:
```typescript
import { Editor, Transforms } from 'slate';

// 기본 Transform이 core에 포함되어 있음
Transforms.insertText(editor, 'Hello');
Transforms.delete(editor, { at: [0] });
```

---

### 3. **Tiptap**

**구조**:
```
@tiptap/core               → 핵심 기능 (Editor, Extension 시스템)
@tiptap/extension-bold      → Bold Extension
@tiptap/extension-italic    → Italic Extension
@tiptap/starter-kit         → 기본 Extension 세트
```

**특징**:
- ✅ Core는 **최소한만** 제공 (Editor, Extension 시스템)
- ✅ **모든 기능이 Extension**으로 제공
- ✅ `@tiptap/starter-kit`에 기본 Extension들이 포함
- ❌ Core에 기본 command가 포함되지 않음

**사용 예시**:
```typescript
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

const editor = new Editor({
  extensions: [StarterKit], // 기본 기능 포함
});
```

---

### 4. **Lexical**

**구조**:
```
lexical                    → Core (Editor, Node, Commands)
@lexical/rich-text         → Rich Text Extension
@lexical/plain-text        → Plain Text Extension
```

**특징**:
- ✅ Core에 **기본 Command들이 포함**됨
  - `$insertText()`
  - `$deleteSelection()`
  - `$getSelection()`
- ✅ 기본 편집 기능이 **core에 내장**
- ✅ 사용자가 별도 import 없이 사용 가능

**사용 예시**:
```typescript
import { $insertText, $deleteSelection } from 'lexical';

// 기본 command가 core에 포함되어 있음
$insertText('Hello');
$deleteSelection();
```

---

## 비교 요약

| 에디터 | Core에 기본 기능 포함? | 기본 기능 제공 방식 |
|--------|---------------------|-------------------|
| **ProseMirror** | ❌ | 별도 패키지 (`@prosemirror/commands`) |
| **Slate.js** | ✅ | Core에 `Transforms` 포함 |
| **Tiptap** | ❌ | Extension으로 제공 (`@tiptap/starter-kit`) |
| **Lexical** | ✅ | Core에 Command 함수 포함 |

---

## 패턴 분석

### 패턴 1: Core에 기본 기능 포함 (Slate.js, Lexical)
**장점**:
- ✅ 사용자가 즉시 사용 가능
- ✅ 별도 패키지 설치 불필요
- ✅ 간단한 사용법

**단점**:
- ⚠️ Core 패키지 크기 증가
- ⚠️ Tree-shaking 어려움
- ⚠️ 기본 기능 제거 불가

### 패턴 2: 별도 패키지로 제공 (ProseMirror, Tiptap)
**장점**:
- ✅ Core 패키지 경량화
- ✅ Tree-shaking 최적화 가능
- ✅ 사용자가 선택적으로 설치

**단점**:
- ⚠️ 사용자가 명시적으로 import 필요
- ⚠️ 기본 기능 누락 가능성
- ⚠️ 초기 설정 복잡

---

## 우리 에디터에 대한 권장사항

### 현재 상황
- `editor-core`: Extension 시스템만 제공
- `@barocss/extensions`: 기본 Extension들 제공
- 사용자가 명시적으로 `createCoreExtensions()` 호출 필요

### 권장 접근 방식

#### 옵션 A: Core에 기본 기능 포함 (Slate.js/Lexical 방식) ✅ **권장**

**이유**:
1. **사용자 경험**: 기본 편집 기능(insertText, delete)은 **항상 필요**
2. **일관성**: 다른 에디터들도 기본 기능은 core에 포함
3. **편의성**: 사용자가 별도 설정 없이 즉시 사용 가능

**구현**:
```typescript
// packages/editor-core/src/editor.ts
constructor(options: EditorOptions = {}) {
  // ...
  
  // 기본 Extension 자동 등록 (항상 포함)
  // TextExtension, DeleteExtension, ParagraphExtension
  this._registerCoreExtensions();
  
  // 사용자 Extension 추가 등록
  if (options.extensions) {
    options.extensions.forEach(ext => this.use(ext));
  }
}

private _registerCoreExtensions() {
  // Core Extension을 editor-core 내부에 직접 구현
  // 또는 @barocss/extensions를 optional dependency로 사용
}
```

**주의사항**:
- `editor-core`가 `@barocss/extensions`에 의존하게 됨
- 순환 의존 방지 필요

#### 옵션 B: 현재 방식 유지 (ProseMirror/Tiptap 방식)

**이유**:
1. **경량화**: Core 패키지 크기 최소화
2. **유연성**: 사용자가 필요한 Extension만 선택
3. **의존성 분리**: Core가 Extension 구현에 의존하지 않음

**현재 구현**:
```typescript
// 사용자가 명시적으로 등록
const editor = new Editor({
  coreExtensions: createCoreExtensions(),
  extensions: createBasicExtensions()
});
```

---

## 결론

### ✅ **권장: 옵션 A (Core에 기본 기능 포함)**

**이유**:
1. **기본 편집 기능은 필수**: `insertText`, `delete`는 모든 에디터에서 필요
2. **사용자 경험**: 별도 설정 없이 즉시 사용 가능
3. **일관성**: Slate.js, Lexical과 유사한 패턴

**구현 방법**:
- `editor-core` 내부에 기본 Extension 구현
- 또는 `@barocss/extensions`를 **optional dependency**로 사용
- Editor 생성자에서 자동 등록

**대안**:
- 현재 방식 유지하되, **편의 함수 제공**:
  ```typescript
  // @barocss/extensions
  export function createEditorWithDefaults(options?: EditorOptions) {
    const editor = new Editor(options);
    createCoreExtensions().forEach(ext => editor.use(ext));
    return editor;
  }
  ```

