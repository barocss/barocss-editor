# Transaction vs Extension 아키텍처

## 현재 구조

### 1. **Transaction 시스템** (`@barocss/model`)

**위치**: Core 기능 (기본 에디터 기능)

**구성**:
```
@barocss/model
  ├── TransactionManager      → Transaction 실행 관리
  ├── transaction() DSL        → Transaction 생성 함수
  └── operations/              → 기본 Operations
      ├── insertText           → 텍스트 삽입
      ├── deleteTextRange      → 텍스트 범위 삭제
      ├── delete               → 노드 삭제
      ├── replaceText          → 텍스트 교체
      └── ... (기타 operations)
```

**특징**:
- ✅ **Core 기능**: 모든 에디터에서 사용 가능
- ✅ **기본 Operations**: `insertText`, `deleteTextRange`, `delete` 등
- ✅ **History 자동 관리**: TransactionManager가 자동으로 History에 추가
- ✅ **Extension과 무관**: Transaction은 독립적으로 동작

**사용 예시**:
```typescript
import { transaction, control } from '@barocss/model';

// Transaction 직접 사용 (Extension 없이도 가능)
await transaction(editor, [
  ...control(nodeId, [
    { type: 'insertText', payload: { pos: 5, text: 'Hello' } }
  ])
]).commit();
```

---

### 2. **Extension 시스템** (`@barocss/extensions`)

**위치**: Extension (bold/italic처럼 외부에서 제공)

**구성**:
```
@barocss/extensions
  ├── TextExtension           → insertText, deleteText command 등록
  ├── DeleteExtension         → delete command 등록
  ├── ParagraphExtension      → paragraph 관련 command
  ├── BoldExtension           → toggleBold command
  └── ItalicExtension         → toggleItalic command
```

**특징**:
- ✅ **Extension으로 제공**: 사용자가 명시적으로 등록 필요
- ✅ **Command 래퍼**: Transaction operations를 Command로 래핑
- ✅ **키보드 단축키**: Extension에서 키보드 이벤트 처리
- ✅ **편의성**: `editor.executeCommand('delete')` 형태로 사용

**사용 예시**:
```typescript
import { createCoreExtensions } from '@barocss/extensions';

const editor = new Editor({
  coreExtensions: createCoreExtensions() // ← 명시적으로 등록
});

// Command로 사용 (Extension이 등록되어 있어야 함)
await editor.executeCommand('delete', { range });
```

---

## 아키텍처 비교

### ProseMirror 구조

```
@prosemirror/state
  └── Transaction          → Core (기본 기능)

@prosemirror/commands
  └── insertText, delete  → 별도 패키지 (기본 편집 기능)

@prosemirror/example-setup
  └── baseKeymap          → 별도 패키지 (키보드 단축키)
```

**특징**:
- Transaction은 **Core**
- 기본 Command들은 **별도 패키지**
- 키보드 단축키도 **별도 패키지**

---

### 우리 에디터 구조

```
@barocss/model
  └── Transaction + Operations  → Core (기본 기능)

@barocss/extensions
  └── TextExtension, DeleteExtension  → Extension (기본 편집 기능)
```

**특징**:
- Transaction은 **Core** (`@barocss/model`)
- 기본 Command들은 **Extension** (`@barocss/extensions`)
- 키보드 단축키도 **Extension**에서 처리

---

## 핵심 차이점

### Transaction Operations vs Commands

| 구분 | Transaction Operations | Commands (Extension) |
|------|----------------------|---------------------|
| **위치** | `@barocss/model` (Core) | `@barocss/extensions` (Extension) |
| **사용법** | `transaction(editor, [op])` | `editor.executeCommand('name')` |
| **역할** | 데이터 변경 (저수준) | 사용자 액션 (고수준) |
| **필수 여부** | 항상 사용 가능 | Extension 등록 필요 |
| **예시** | `insertText`, `deleteTextRange` | `insertText`, `delete` |

---

## 실제 사용 흐름

### 1. Extension 없이 Transaction 직접 사용

```typescript
import { transaction, control } from '@barocss/model';

// Extension 등록 없이도 사용 가능
await transaction(editor, [
  ...control(nodeId, [
    { type: 'insertText', payload: { pos: 5, text: 'Hello' } }
  ])
]).commit();
```

### 2. Extension을 통한 Command 사용

```typescript
import { createCoreExtensions } from '@barocss/extensions';

const editor = new Editor({
  coreExtensions: createCoreExtensions() // Extension 등록
});

// Command로 사용 (Extension이 Transaction을 래핑)
await editor.executeCommand('delete', { range });
```

---

## 결론

### ✅ **Transaction은 Core 기능**

- `@barocss/model`에 포함
- Extension 등록 없이도 사용 가능
- 기본 Operations 제공 (`insertText`, `deleteTextRange`, `delete` 등)

### ✅ **기본 편집 기능은 Extension**

- `@barocss/extensions`에 포함
- `TextExtension`, `DeleteExtension` 등
- Command 형태로 Transaction을 래핑
- 키보드 단축키 처리 포함

### ✅ **ProseMirror와 유사한 구조**

- Transaction은 Core
- 기본 편집 기능은 별도 패키지 (Extension)
- 사용자가 명시적으로 등록 필요

---

## 권장 사용 패턴

### 기본 사용 (Extension 사용)

```typescript
const editor = new Editor({
  coreExtensions: createCoreExtensions()
});

// Command 사용 (권장)
await editor.executeCommand('delete', { range });
```

### 고급 사용 (Transaction 직접 사용)

```typescript
// Extension 없이도 Transaction 직접 사용 가능
await transaction(editor, [
  ...control(nodeId, [
    { type: 'insertText', payload: { pos: 5, text: 'Hello' } }
  ])
]).commit();
```

