# Core Extensions 개념 정리

## 현재 문제점

### 1. **모호한 개념**
- `coreExtensions`와 `extensions`의 구분이 불명확
- "Core"가 무엇을 의미하는지 모호함
- 필수인지 선택인지 불명확

### 2. **현재 구조**
```typescript
interface EditorOptions {
  coreExtensions?: Extension[]; // 기본 편집 기능?
  extensions?: Extension[];     // 추가 기능?
}
```

**문제**:
- 둘 다 optional이므로 Editor는 생성 가능
- 하지만 기본 편집 기능 없이는 실제로 편집 불가
- 사용자가 혼란스러울 수 있음

---

## ProseMirror 방식 (참고)

```typescript
// ProseMirror는 단순히 plugins 배열만 사용
const view = new EditorView(document.body, {
  state: EditorState.create({
    plugins: [
      keymap(baseKeymap),  // 기본 기능
      // ... 다른 plugins
    ]
  })
});
```

**특징**:
- ✅ 단순한 구조: `plugins` 배열 하나만
- ✅ 명확함: 모든 plugin을 동일하게 처리
- ✅ 구분 없음: "core" vs "extension" 구분 없음

---

## 개선 방안

### 옵션 1: `coreExtensions` 제거, `extensions`로 통일 ✅ **권장**

**구조**:
```typescript
interface EditorOptions {
  extensions?: Extension[]; // 모든 Extension (구분 없음)
}
```

**사용법**:
```typescript
const editor = new Editor({
  extensions: [
    ...createCoreExtensions(),  // 기본 편집 기능
    ...createBasicExtensions()  // 추가 기능
  ]
});
```

**장점**:
- ✅ 단순하고 명확함
- ✅ ProseMirror와 유사한 구조
- ✅ 구분 없이 모든 Extension을 동일하게 처리
- ✅ 사용자가 필요한 Extension만 선택

**단점**:
- ⚠️ 사용자가 `createCoreExtensions()`를 호출해야 함 (하지만 이것이 의도된 동작)

---

### 옵션 2: `coreExtensions`를 필수로 만들기

**구조**:
```typescript
interface EditorOptions {
  coreExtensions: Extension[]; // 필수
  extensions?: Extension[];    // 선택
}
```

**사용법**:
```typescript
const editor = new Editor({
  coreExtensions: createCoreExtensions(), // 필수
  extensions: createBasicExtensions()    // 선택
});
```

**장점**:
- ✅ 필수/선택 구분 명확
- ✅ 기본 편집 기능 누락 방지

**단점**:
- ⚠️ 여전히 "core" 개념이 모호함
- ⚠️ 사용자가 항상 `createCoreExtensions()` 호출 필요

---

### 옵션 3: 편의 함수 제공

**구조**:
```typescript
// @barocss/extensions
export function createEditorWithDefaults(options?: EditorOptions) {
  const editor = new Editor(options);
  
  // Core Extension 자동 등록
  createCoreExtensions().forEach(ext => editor.use(ext));
  
  // 사용자 Extension 추가 등록
  if (options?.extensions) {
    options.extensions.forEach(ext => editor.use(ext));
  }
  
  return editor;
}
```

**사용법**:
```typescript
// 간단한 사용 (기본 기능 자동 포함)
const editor = createEditorWithDefaults({
  extensions: createBasicExtensions()
});

// 고급 사용 (모든 Extension 직접 제어)
const editor = new Editor({
  extensions: [
    ...createCoreExtensions(),
    ...createBasicExtensions()
  ]
});
```

**장점**:
- ✅ 간단한 사용법 제공
- ✅ 고급 사용자도 직접 제어 가능
- ✅ 기본 기능 누락 방지

**단점**:
- ⚠️ 두 가지 방식이 혼재 (혼란 가능)

---

## 권장 방안

### ✅ **옵션 1: `coreExtensions` 제거, `extensions`로 통일**

**이유**:
1. **단순성**: 하나의 옵션만 사용
2. **명확성**: "core" vs "extension" 구분 불필요
3. **일관성**: ProseMirror와 유사한 구조
4. **유연성**: 사용자가 필요한 Extension만 선택

**구현**:
```typescript
// EditorOptions 수정
interface EditorOptions {
  extensions?: Extension[]; // 모든 Extension (구분 없음)
}

// 사용법
const editor = new Editor({
  extensions: [
    ...createCoreExtensions(),  // 기본 편집 기능
    ...createBasicExtensions()  // 추가 기능
  ]
});
```

**주의사항**:
- `createCoreExtensions()`를 호출하지 않으면 기본 편집 기능 없음
- 하지만 이것이 의도된 동작 (ProseMirror와 동일)
- 문서에서 명확히 안내 필요

---

## 결론

### ✅ **`coreExtensions` 제거 권장**

**이유**:
1. 개념이 모호함
2. ProseMirror와 유사하게 단순화
3. 모든 Extension을 동일하게 처리

**구현**:
- `coreExtensions` 옵션 제거
- `extensions` 옵션만 사용
- 사용자가 `createCoreExtensions()`를 `extensions`에 포함

