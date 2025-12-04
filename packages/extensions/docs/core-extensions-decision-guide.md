# Core Extensions 결정 가이드

## ProseMirror의 `baseKeymap` 분석

### ProseMirror `baseKeymap`에 포함된 키

ProseMirror의 `@prosemirror/example-setup`에서 제공하는 `baseKeymap`:

```typescript
{
  "Enter": splitBlock,              // 블록 분할 (새 단락)
  "Backspace": deleteSelection | joinBackward,  // 선택 삭제 또는 이전 블록 병합
  "Delete": deleteSelection | joinForward,     // 선택 삭제 또는 다음 블록 병합
  "Mod+b": toggleMark('strong'),   // Bold
  "Mod+i": toggleMark('em'),       // Italic
  "Mod+z": undo,                    // Undo
  "Mod+y": redo,                    // Redo (또는 Mod+Shift+z)
}
```

**중요 발견**:
- ✅ **Enter, Backspace, Delete**: 기본 편집 기능 (Core)
- ✅ **Undo/Redo**: History 기능 (Core)
- ❌ **Bold, Italic**: 서식 기능 (선택적)
- ❌ **텍스트 입력**: `baseKeymap`에 없음 (브라우저 기본 동작 사용)

---

## 우리 에디터의 현재 구조

### 현재 `createCoreExtensions()`

```typescript
export function createCoreExtensions(): Extension[] {
  return [
    new TextExtension(),      // insertText, deleteText, backspace, delete
    new DeleteExtension(),    // delete command (Transaction 기반)
    new ParagraphExtension()  // insertParagraph, setParagraph
  ];
}
```

### 문제점 발견

#### 1. **중복된 `delete` command**

**TextExtension**:
- `backspace` command
- `delete` command (키보드 이벤트 처리)

**DeleteExtension**:
- `delete` command (Transaction 기반)

**문제**: 두 Extension 모두 `delete` command를 제공 → 충돌 가능

---

## Core Extensions 결정 기준

### ✅ **Core에 포함되어야 하는 것**

#### 1. **기본 텍스트 편집** (모든 에디터 필수)
- `insertText`: 텍스트 입력
- `deleteText`: 텍스트 삭제
- **키보드 이벤트**: Backspace, Delete (키보드 단축키 매핑)

#### 2. **기본 구조 편집** (문서 구조 필수)
- `insertParagraph`: Enter 키 처리
- `setParagraph`: 단락 설정

#### 3. **Transaction 기반 삭제** (데이터 변경 필수)
- `delete`: Transaction 기반 삭제 command
- Cross-node 삭제 지원
- 노드 전체 삭제 지원

---

### ❌ **Core에 포함되지 않아야 하는 것**

#### 1. **서식 기능** (선택적)
- Bold, Italic
- Heading
- 기타 마크/스타일

#### 2. **History 기능** (자동 처리)
- Undo/Redo는 TransactionManager가 자동 처리
- Extension 불필요

---

## 권장 구조

### 옵션 1: 현재 구조 유지 (역할 분리) ✅ **권장**

**TextExtension**:
- 역할: **키보드 이벤트 처리** + **기본 텍스트 편집**
- Command: `insertText`, `deleteText`, `backspace`, `delete` (키보드 이벤트)
- 구현: 키보드 이벤트를 받아서 적절한 command 호출

**DeleteExtension**:
- 역할: **Transaction 기반 삭제** (실제 데이터 변경)
- Command: `delete` (Transaction 기반)
- 구현: `editor.executeCommand('delete')`를 받아서 Transaction 실행

**장점**:
- 역할 분리 명확
- TextExtension은 키보드 이벤트만 처리
- DeleteExtension은 Transaction만 처리

**주의**:
- `TextExtension`의 `delete` command는 키보드 이벤트 처리용
- `DeleteExtension`의 `delete` command는 Transaction 실행용
- 이름 충돌 방지 필요 (예: `deleteKey` vs `delete`)

---

### 옵션 2: 통합 (TextExtension에 모든 기능 포함)

**TextExtension**:
- `insertText`
- `deleteText`
- `backspace` (키보드 이벤트 → Transaction 호출)
- `delete` (키보드 이벤트 → Transaction 호출)
- `deleteSelection` (Transaction 기반)

**DeleteExtension 제거**

**장점**:
- 단순한 구조
- 중복 제거

**단점**:
- TextExtension이 너무 많은 책임
- 역할 분리 어려움

---

## ProseMirror와의 비교

### ProseMirror 구조

```
@prosemirror/example-setup
  └── baseKeymap
      ├── Enter → splitBlock
      ├── Backspace → deleteSelection / joinBackward
      ├── Delete → deleteSelection / joinForward
      ├── Mod+b → toggleMark('strong')  ← 서식도 포함!
      ├── Mod+i → toggleMark('em')      ← 서식도 포함!
      ├── Mod+z → undo
      └── Mod+y → redo
```

**특징**:
- `baseKeymap`에 Bold, Italic도 포함 (하지만 이것은 "example-setup"이므로 선택적)
- 실제로는 사용자가 필요한 것만 선택

---

### 우리 에디터 권장 구조

```
createCoreExtensions()
  ├── TextExtension
  │   ├── insertText
  │   ├── deleteText
  │   ├── backspace (키보드 이벤트)
  │   └── delete (키보드 이벤트)
  ├── DeleteExtension
  │   └── delete (Transaction 기반)
  └── ParagraphExtension
      ├── insertParagraph
      └── setParagraph
```

---

## 최종 권장 사항

### ✅ **Core Extensions (필수)**

```typescript
export function createCoreExtensions(): Extension[] {
  return [
    new TextExtension(),      // insertText, deleteText, backspace, delete (키보드)
    new DeleteExtension(),    // delete (Transaction 기반)
    new ParagraphExtension()  // insertParagraph, setParagraph
  ];
}
```

### ✅ **역할 분리 명확화**

**TextExtension**:
- 키보드 이벤트 처리 (`backspace`, `delete` 키)
- 기본 텍스트 편집 (`insertText`, `deleteText`)
- 키보드 이벤트를 받아서 `DeleteExtension`의 `delete` command 호출

**DeleteExtension**:
- Transaction 기반 삭제 (`delete` command)
- Cross-node 삭제
- 노드 전체 삭제

**ParagraphExtension**:
- Enter 키 처리 (`insertParagraph`)
- 단락 설정 (`setParagraph`)

---

## 결정 기준 요약

### Core Extensions 포함 기준

1. **모든 에디터에서 필수적인 기능**
   - ✅ 텍스트 입력/삭제
   - ✅ 기본 구조 편집 (단락)

2. **브라우저 기본 동작으로 처리할 수 없는 기능**
   - ✅ Transaction 기반 삭제
   - ✅ 구조 변경 (단락 생성)

3. **키보드 단축키가 표준화된 기능**
   - ✅ Enter (새 단락)
   - ✅ Backspace/Delete (삭제)

### Basic Extensions 포함 기준

1. **일반적으로 사용되지만 필수는 아닌 기능**
   - Bold, Italic
   - Heading

2. **사용자가 선택적으로 제거할 수 있는 기능**

