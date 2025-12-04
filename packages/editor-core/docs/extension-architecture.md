# Extension 아키텍처 설계

## 현재 구조

현재 Extension들이 `packages/editor-core/src/extensions/`에 정의되어 있습니다:

```
packages/editor-core/
  src/
    extensions/
      - text.ts          (TextExtension)
      - delete.ts        (DeleteExtension)
      - paragraph.ts     (ParagraphExtension)
      - bold.ts          (BoldExtension)
      - italic.ts        (ItalicExtension)
      - heading.ts       (HeadingExtension)
```

---

## 문제점

### 1. **editor-core의 책임 범위**
- `editor-core`는 **핵심 기능**만 제공해야 함
  - Document 관리
  - Selection 관리
  - Command 시스템
  - Extension 시스템 (인터페이스)
- **구체적인 Extension 구현**은 editor-core의 책임이 아님

### 2. **의존성 문제**
- Extension들이 `@barocss/model`을 직접 import
- Extension들이 editor-core 내부 타입을 직접 사용
- editor-core가 구체적인 기능(Bold, Italic 등)에 의존하게 됨

### 3. **확장성 문제**
- 새로운 Extension을 추가할 때마다 editor-core 패키지를 수정해야 함
- 사용자가 커스텀 Extension을 만들 때 editor-core를 참조해야 함

---

## 다른 에디터들의 패턴

### ProseMirror
```
@prosemirror/core          → 최소한의 핵심 기능
@prosemirror/state         → Document/Selection 관리
@prosemirror/commands      → 기본 Command들
@prosemirror/schema-basic  → 기본 Schema + Extension들
@prosemirror/schema-list   → List Extension
@prosemirror/markdown      → Markdown Extension
```

**특징**:
- Core는 최소한의 기능만 제공
- Extension들은 별도 패키지로 분리
- 사용자가 필요한 Extension만 선택적으로 설치

### Tiptap
```
@tiptap/core               → 핵심 기능
@tiptap/extension-bold     → Bold Extension
@tiptap/extension-italic    → Italic Extension
@tiptap/extension-heading   → Heading Extension
```

**특징**:
- 각 Extension이 독립적인 패키지
- 사용자가 필요한 Extension만 설치
- Tree-shaking 최적화 가능

### Slate.js
```
slate                      → Core
slate-history              → History Extension
slate-react                → React Extension
```

**특징**:
- Core는 최소한
- Extension들은 별도 패키지

---

## 권장 아키텍처

### 옵션 1: Extension을 별도 패키지로 분리 ✅ (권장)

**구조**:
```
packages/
  editor-core/              → 핵심 기능만
    src/
      types.ts              → Extension 인터페이스 정의
      editor.ts             → Editor 클래스
      index.ts              → Extension 인터페이스 export
  
  editor-extensions/        → 기본 Extension들
    src/
      core/                 → 필수 Extension
        - text.ts
        - delete.ts
        - paragraph.ts
      basic/                → 기본 Extension
        - bold.ts
        - italic.ts
        - heading.ts
      index.ts              → createCoreExtensions, createBasicExtensions
```

**장점**:
- ✅ editor-core는 핵심 기능만 제공
- ✅ Extension들은 독립적으로 관리
- ✅ 사용자가 필요한 Extension만 선택적으로 설치
- ✅ Tree-shaking 최적화 가능
- ✅ 다른 에디터들과 일관된 패턴

**단점**:
- ⚠️ 패키지가 하나 더 추가됨
- ⚠️ 초기 설정이 조금 복잡해짐

---

### 옵션 2: Core Extension만 editor-core에 유지

**구조**:
```
packages/
  editor-core/
    src/
      extensions/
        core/               → 필수 Extension만
          - text.ts
          - delete.ts
          - paragraph.ts
  
  editor-extensions/        → 선택적 Extension
    src/
      - bold.ts
      - italic.ts
      - heading.ts
```

**장점**:
- ✅ 필수 Extension은 editor-core에 포함 (편의성)
- ✅ 선택적 Extension은 별도 패키지 (유연성)

**단점**:
- ⚠️ Core Extension도 editor-core에 있어야 하는가? (의문)
- ⚠️ 일관성 부족 (일부는 editor-core, 일부는 별도 패키지)

---

### 옵션 3: 현재 구조 유지 (비권장)

**구조**:
```
packages/
  editor-core/
    src/
      extensions/           → 모든 Extension
```

**장점**:
- ✅ 간단한 구조
- ✅ 모든 Extension이 한 곳에

**단점**:
- ❌ editor-core가 구체적인 기능에 의존
- ❌ 확장성 부족
- ❌ 다른 에디터들과 다른 패턴
- ❌ Tree-shaking 최적화 어려움

---

## 권장 사항

### ✅ 옵션 1: Extension을 별도 패키지로 분리

**이유**:
1. **관심사 분리**: editor-core는 핵심 기능만, Extension은 별도 관리
2. **확장성**: 새로운 Extension 추가 시 editor-core 수정 불필요
3. **일관성**: 다른 에디터들(ProseMirror, Tiptap)과 동일한 패턴
4. **최적화**: 사용자가 필요한 Extension만 설치 (Tree-shaking)

**구현 계획**:

1. **새 패키지 생성**: `packages/editor-extensions/`
   ```json
   {
     "name": "@barocss/extensions",
     "version": "0.1.0",
     "main": "./dist/index.js",
     "types": "./dist/index.d.ts",
     "dependencies": {
       "@barocss/editor-core": "workspace:*",
       "@barocss/model": "workspace:*"
     }
   }
   ```

2. **Extension 이동**:
   ```
   packages/editor-core/src/extensions/
     → packages/editor-extensions/src/
   ```

3. **editor-core 수정**:
   - Extension 구현 제거
   - Extension 인터페이스만 export
   - `createCoreExtensions` 제거 (editor-extensions로 이동)

4. **사용 예시**:
   ```typescript
   import { Editor } from '@barocss/editor-core';
   import { createCoreExtensions, createBasicExtensions } from '@barocss/extensions';
   
   const editor = new Editor({
     extensions: createBasicExtensions()
   });
   ```

---

## Core Extension의 위치

### 질문: Core Extension도 editor-core에 있어야 하는가?

**답변**: 아니요, 별도 패키지가 더 나음

**이유**:
1. **일관성**: 모든 Extension을 동일하게 관리
2. **유연성**: Core Extension도 선택적으로 제거 가능
3. **명확성**: editor-core는 인터페이스만 제공

**대안**: `createCoreExtensions()`를 editor-extensions에서 제공하고, Editor 생성자에서 자동으로 호출

```typescript
// packages/editor-extensions/src/index.ts
export function createCoreExtensions(): Extension[] {
  return [
    new TextExtension(),
    new DeleteExtension(),
    new ParagraphExtension()
  ];
}

// packages/editor-core/src/editor.ts
import { createCoreExtensions } from '@barocss/extensions';

constructor(options: EditorOptions = {}) {
  // Core Extension 자동 등록
  const coreExtensions = createCoreExtensions();
  coreExtensions.forEach(ext => this.use(ext));
  
  // 사용자 Extension 추가 등록
  if (options.extensions) {
    options.extensions.forEach(ext => this.use(ext));
  }
}
```

**주의**: 이 경우 editor-core가 editor-extensions에 의존하게 됨 (순환 의존 가능)

**해결책**: Editor 생성자에서 자동 등록하지 않고, 사용자가 명시적으로 등록

```typescript
// 사용자가 명시적으로 등록
import { Editor } from '@barocss/editor-core';
import { createCoreExtensions, createBasicExtensions } from '@barocss/extensions';

const editor = new Editor({
  extensions: [
    ...createCoreExtensions(),  // 필수
    ...createBasicExtensions()  // 선택
  ]
});
```

또는 편의 함수 제공:

```typescript
// packages/editor-extensions/src/index.ts
export function createEditorWithDefaults(options?: EditorOptions) {
  const editor = new Editor(options);
  
  // Core Extension 자동 등록
  const coreExtensions = createCoreExtensions();
  coreExtensions.forEach(ext => editor.use(ext));
  
  // 사용자 Extension 추가 등록
  if (options?.extensions) {
    options.extensions.forEach(ext => editor.use(ext));
  }
  
  return editor;
}
```

---

## 결론

### ✅ Extension을 별도 패키지로 분리 권장

**구조**:
```
packages/
  editor-core/              → 핵심 기능 + Extension 인터페이스
  editor-extensions/        → 모든 Extension 구현
```

**사용법**:
```typescript
import { Editor } from '@barocss/editor-core';
import { createCoreExtensions, createBasicExtensions } from '@barocss/extensions';

const editor = new Editor({
  extensions: [
    ...createCoreExtensions(),  // 필수
    ...createBasicExtensions()  // 선택
  ]
});
```

또는 편의 함수:

```typescript
import { createEditorWithDefaults } from '@barocss/extensions';

const editor = createEditorWithDefaults({
  extensions: createBasicExtensions()
});
```

