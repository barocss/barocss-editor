# Core Extensions 결정 기준

## ProseMirror의 `baseKeymap` 분석

### ProseMirror `baseKeymap`에 포함된 기능

ProseMirror의 `@prosemirror/example-setup` 패키지에서 제공하는 `baseKeymap`에는 다음 키보드 단축키가 포함됩니다:

1. **Enter** → `splitBlock` (블록 분할, 새 단락 생성)
2. **Backspace** → `deleteSelection` 또는 `joinBackward` (선택 삭제 또는 이전 블록과 병합)
3. **Delete** → `deleteSelection` 또는 `joinForward` (선택 삭제 또는 다음 블록과 병합)
4. **Mod+b** → `toggleMark('strong')` (Bold 토글)
5. **Mod+i** → `toggleMark('em')` (Italic 토글)
6. **Mod+z** → `undo` (Undo)
7. **Mod+y** / **Mod+Shift+z** → `redo` (Redo)

**중요**: `baseKeymap`에는 **텍스트 입력(insertText)이 포함되지 않음**
- 텍스트 입력은 브라우저의 기본 동작을 사용
- ProseMirror는 `beforeinput` 이벤트나 `input` 이벤트를 통해 처리

---

## 우리 에디터의 현재 구조

### 현재 `createCoreExtensions()`에 포함된 것

```typescript
export function createCoreExtensions(): Extension[] {
  return [
    new TextExtension(),      // insertText, deleteText, backspace, delete
    new DeleteExtension(),    // delete command (Backspace, Delete 키)
    new ParagraphExtension()  // insertParagraph, setParagraph
  ];
}
```

### 각 Extension의 역할

#### 1. **TextExtension**
- `insertText`: 텍스트 삽입
- `deleteText`: 텍스트 범위 삭제
- `deleteSelection`: 선택된 텍스트 삭제
- `backspace`: Backspace 키 처리
- `delete`: Delete 키 처리

#### 2. **DeleteExtension**
- `delete`: 삭제 command (Transaction 기반)
- Cross-node 삭제 지원
- Inline 노드 전체 삭제 지원

#### 3. **ParagraphExtension**
- `insertParagraph`: 새 단락 삽입
- `setParagraph`: 현재 선택을 단락으로 설정

---

## Core Extensions 결정 기준

### ✅ **Core에 포함되어야 하는 것**

#### 1. **기본 텍스트 편집 기능**
- **이유**: 모든 에디터에서 필수
- **기능**: 
  - 텍스트 입력 (`insertText`)
  - 텍스트 삭제 (`deleteText`, `deleteSelection`)
  - Backspace/Delete 키 처리

#### 2. **기본 구조 편집 기능**
- **이유**: 문서 구조의 기본 단위
- **기능**:
  - 단락 생성 (`insertParagraph`)
  - Enter 키 처리 (새 단락 생성)

#### 3. **기본 삭제 기능**
- **이유**: 삭제는 모든 에디터에서 필수
- **기능**:
  - 범위 삭제 (Transaction 기반)
  - Cross-node 삭제
  - 노드 전체 삭제

---

### ❌ **Core에 포함되지 않아야 하는 것**

#### 1. **서식 기능** (Bold, Italic 등)
- **이유**: 선택적 기능
- **위치**: `createBasicExtensions()` 또는 개별 Extension

#### 2. **고급 구조 기능** (Heading, List 등)
- **이유**: 선택적 기능
- **위치**: `createBasicExtensions()` 또는 개별 Extension

#### 3. **History 기능** (Undo/Redo)
- **이유**: TransactionManager가 자동으로 처리
- **위치**: Core에 내장 (Extension 불필요)

---

## ProseMirror와의 비교

### ProseMirror 구조

```
@prosemirror/example-setup
  └── baseKeymap
      ├── Enter → splitBlock
      ├── Backspace → deleteSelection / joinBackward
      ├── Delete → deleteSelection / joinForward
      ├── Mod+b → toggleMark('strong')
      ├── Mod+i → toggleMark('em')
      ├── Mod+z → undo
      └── Mod+y → redo
```

**특징**:
- 텍스트 입력은 브라우저 기본 동작 사용
- `baseKeymap`은 키보드 단축키만 제공
- 실제 command는 `@prosemirror/commands`에서 제공

---

### 우리 에디터 구조

```
@barocss/extensions
  └── createCoreExtensions()
      ├── TextExtension → insertText, deleteText, backspace, delete
      ├── DeleteExtension → delete command (Transaction 기반)
      └── ParagraphExtension → insertParagraph, setParagraph
```

**차이점**:
- 우리는 텍스트 입력도 Extension으로 제공 (브라우저 기본 동작 사용 안 함)
- 우리는 Transaction 기반 삭제를 별도 Extension으로 제공
- 우리는 History를 TransactionManager가 자동 처리 (Extension 불필요)

---

## 권장 기준

### ✅ **Core Extensions에 포함**

1. **TextExtension** ✅
   - `insertText`: 텍스트 입력 (필수)
   - `deleteText`: 텍스트 삭제 (필수)
   - `backspace`, `delete`: 키보드 단축키 (필수)

2. **DeleteExtension** ✅
   - `delete`: Transaction 기반 삭제 (필수)
   - Cross-node 삭제 지원 (필수)

3. **ParagraphExtension** ✅
   - `insertParagraph`: Enter 키 처리 (필수)
   - `setParagraph`: 단락 설정 (선택적이지만 기본 구조)

---

### ❓ **고려 사항**

#### 1. **TextExtension과 DeleteExtension 중복?**

**현재 상황**:
- `TextExtension`: `backspace`, `delete` command 제공
- `DeleteExtension`: `delete` command 제공 (Transaction 기반)

**문제**:
- 두 Extension 모두 `delete` command를 제공
- 중복 가능성

**해결 방안**:
- `TextExtension`의 `backspace`, `delete`는 **키보드 이벤트 처리**만
- `DeleteExtension`의 `delete`는 **Transaction 기반 삭제** (실제 데이터 변경)
- 역할 분리: TextExtension = 키보드 이벤트, DeleteExtension = 데이터 변경

#### 2. **ParagraphExtension이 Core에 필요한가?**

**ProseMirror**: `splitBlock`이 `baseKeymap`에 포함됨

**우리 에디터**: `insertParagraph`가 Core에 포함됨

**결론**: ✅ 포함 필요 (Enter 키 처리는 필수)

---

## 최종 권장 사항

### ✅ **Core Extensions (필수)**

```typescript
export function createCoreExtensions(): Extension[] {
  return [
    new TextExtension(),      // insertText, deleteText, backspace, delete (키보드 이벤트)
    new DeleteExtension(),    // delete command (Transaction 기반)
    new ParagraphExtension()  // insertParagraph, setParagraph
  ];
}
```

### ✅ **Basic Extensions (선택적)**

```typescript
export function createBasicExtensions(): Extension[] {
  return [
    new BoldExtension(),      // toggleBold
    new ItalicExtension(),   // toggleItalic
    new HeadingExtension()    // setHeading
  ];
}
```

---

## 결정 기준 요약

### Core Extensions 포함 기준

1. **모든 에디터에서 필수적인 기능**
   - 텍스트 입력/삭제
   - 기본 구조 편집 (단락)

2. **브라우저 기본 동작으로 처리할 수 없는 기능**
   - Transaction 기반 삭제
   - 구조 변경 (단락 생성)

3. **키보드 단축키가 표준화된 기능**
   - Enter (새 단락)
   - Backspace/Delete (삭제)

### Basic Extensions 포함 기준

1. **일반적으로 사용되지만 필수는 아닌 기능**
   - Bold, Italic
   - Heading

2. **사용자가 선택적으로 제거할 수 있는 기능**

