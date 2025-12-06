# 기본 Extension 자동 등록 전략

## 문제 상황

현재 구조에서는 기본적으로 적용되어야 하는 command (예: `delete`, `insertText` 등)를 Extension으로 만들면, 모든 Editor 인스턴스에서 명시적으로 등록해야 합니다:

```typescript
// 현재 방식 (수동 등록 필요)
const editor = new Editor({
  extensions: createBasicExtensions() // 명시적으로 호출 필요
});
```

**문제점**:
- 매번 `createBasicExtensions()`를 호출해야 함
- 기본 기능(delete, insertText 등)이 누락될 수 있음
- 사용자가 실수로 기본 Extension을 빼먹을 수 있음

---

## 해결 방안 비교

### 옵션 1: Editor 생성자에서 자동 등록 ✅ (권장)

**구조**:
```typescript
// Editor 생성자
constructor(options: EditorOptions = {}) {
  // ...
  
  // 기본 Extension 자동 등록 (항상 포함)
  const coreExtensions = createCoreExtensions();
  coreExtensions.forEach(ext => this.use(ext));
  
  // 사용자 Extension 추가 등록 (선택적)
  if (options.extensions) {
    options.extensions.forEach(ext => this.use(ext));
  }
}
```

**장점**:
- ✅ 기본 기능이 항상 포함됨
- ✅ 사용자가 실수로 빼먹을 수 없음
- ✅ 간단한 사용법: `new Editor()`만으로도 기본 기능 사용 가능
- ✅ 사용자가 추가 Extension만 지정하면 됨

**단점**:
- ⚠️ 기본 Extension을 제거하고 싶을 때는 옵션 필요

**구현**:
```typescript
// packages/editor-core/src/extensions/index.ts
export function createCoreExtensions(): Extension[] {
  return [
    new TextExtension(),      // insertText, deleteText 등
    new DeleteExtension(),    // delete command
    new ParagraphExtension()  // 기본 구조
  ];
}

export function createBasicExtensions(): Extension[] {
  return [
    ...createCoreExtensions(), // Core Extension 포함
    new BoldExtension(),
    new ItalicExtension(),
    new HeadingExtension()
  ];
}
```

---

### 옵션 2: 기본값으로 사용하되 Override 가능

**구조**:
```typescript
// Editor 생성자
constructor(options: EditorOptions = {}) {
  // ...
  
  // extensions가 없으면 기본 Extension 사용
  const extensions = options.extensions || createBasicExtensions();
  extensions.forEach(ext => this.use(ext));
}
```

**장점**:
- ✅ 기본 Extension이 자동으로 포함됨
- ✅ 사용자가 완전히 커스터마이징 가능

**단점**:
- ⚠️ `extensions: []`로 빈 배열을 전달하면 기본 Extension이 없어짐
- ⚠️ Core Extension과 Optional Extension 구분이 어려움

---

### 옵션 3: Core Extension과 Optional Extension 구분

**구조**:
```typescript
// EditorOptions
interface EditorOptions {
  extensions?: Extension[];
  disableCoreExtensions?: boolean; // Core Extension 비활성화 옵션
}

// Editor 생성자
constructor(options: EditorOptions = {}) {
  // ...
  
  // Core Extension 등록 (비활성화 옵션이 없으면 항상 포함)
  if (options.disableCoreExtensions !== true) {
    const coreExtensions = createCoreExtensions();
    coreExtensions.forEach(ext => this.use(ext));
  }
  
  // 사용자 Extension 추가 등록
  if (options.extensions) {
    options.extensions.forEach(ext => this.use(ext));
  }
}
```

**장점**:
- ✅ Core Extension과 Optional Extension 명확히 구분
- ✅ 필요시 Core Extension 비활성화 가능
- ✅ 사용자가 추가 Extension만 지정 가능

**단점**:
- ⚠️ 옵션이 하나 더 추가됨

---

## 권장 사항

### ✅ 옵션 1: Editor 생성자에서 자동 등록

**이유**:
1. **가장 간단한 사용법**: `new Editor()`만으로도 기본 기능 사용 가능
2. **안전성**: 기본 기능이 항상 포함되어 실수 방지
3. **일관성**: 다른 에디터들(ProseMirror, Tiptap 등)도 유사한 패턴 사용

**구현 계획**:

1. **Core Extension 정의**
   ```typescript
   // packages/editor-core/src/extensions/index.ts
   export function createCoreExtensions(): Extension[] {
     return [
       new TextExtension(),      // insertText, deleteText 등
       new DeleteExtension(),    // delete command
       new ParagraphExtension()  // 기본 구조
     ];
   }
   ```

2. **Editor 생성자 수정**
   ```typescript
   // packages/editor-core/src/editor.ts
   constructor(options: EditorOptions = {}) {
     // ...
     
     // Core Extension 자동 등록 (항상 포함)
     const coreExtensions = createCoreExtensions();
     coreExtensions.forEach(ext => this.use(ext));
     
     // 사용자 Extension 추가 등록 (선택적)
     if (options.extensions) {
       options.extensions.forEach(ext => this.use(ext));
     }
   }
   ```

3. **createBasicExtensions 업데이트**
   ```typescript
   export function createBasicExtensions(): Extension[] {
     return [
       ...createCoreExtensions(), // Core Extension 포함
       new BoldExtension(),
       new ItalicExtension(),
       new HeadingExtension()
     ];
   }
   ```

---

## 사용 예시

### 기본 사용 (Core Extension만)
```typescript
// Core Extension 자동 포함 (TextExtension, DeleteExtension, ParagraphExtension)
const editor = new Editor();
// delete, insertText 등 기본 command 사용 가능
```

### 추가 Extension 포함
```typescript
// Core Extension + Bold, Italic
const editor = new Editor({
  extensions: [
    new BoldExtension(),
    new ItalicExtension()
  ]
});
```

### 모든 Extension 포함
```typescript
// Core Extension + Basic Extension
const editor = new Editor({
  extensions: createBasicExtensions()
});
```

---

## Core Extension 목록

### 필수 Extension (항상 포함)
- **TextExtension**: `insertText`, `deleteText` 등 기본 텍스트 편집
- **DeleteExtension**: `delete` command (Backspace, Delete 키)
- **ParagraphExtension**: 기본 구조 (paragraph 생성 등)

### 선택적 Extension (createBasicExtensions에 포함)
- **BoldExtension**: `toggleBold`
- **ItalicExtension**: `toggleItalic`
- **HeadingExtension**: `setHeading`

---

## 다른 에디터들의 접근 방식

### ProseMirror
- 기본 Schema와 Commands가 항상 포함됨
- 사용자가 추가 Plugin만 등록

### Tiptap
- Core Extension (Editor, History 등)이 자동 포함
- 사용자가 추가 Extension만 지정

### Slate.js
- 기본 기능이 Core에 포함
- Plugin은 선택적

---

## 결론

**옵션 1 (자동 등록)**을 권장합니다:
- ✅ 간단한 사용법
- ✅ 안전성 (기본 기능 보장)
- ✅ 다른 에디터들과 일관된 패턴
- ✅ 사용자가 추가 Extension만 지정하면 됨

