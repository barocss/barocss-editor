# Extension Hooks 최종 설계

## 핵심 원칙

**핵심 모델 변경만 훅으로 제공, 나머지는 커스텀 이벤트로 처리**

---

## 훅으로 제공 (핵심 변경)

### Before Hooks (가로채기/수정)

```typescript
interface Extension {
  // Transaction 변경 전
  onBeforeTransaction?(
    editor: Editor, 
    transaction: Transaction
  ): Transaction | null | void;
  
  // Selection 변경 전
  onBeforeSelectionChange?(
    editor: Editor, 
    selection: SelectionState
  ): SelectionState | null | void;
  
  // Content 변경 전
  onBeforeContentChange?(
    editor: Editor, 
    content: DocumentState
  ): DocumentState | null | void;
}
```

**이유:**
- ✅ 가로채기/수정이 가능해야 함
- ✅ 타입 안정성 중요
- ✅ Priority 기반 순서 보장 필요
- ✅ 모델의 핵심 변경 사항

### After Hooks (알림)

```typescript
interface Extension {
  // Transaction 실행 후
  onTransaction?(editor: Editor, transaction: Transaction): void;
  
  // Selection 변경 후
  onSelectionChange?(editor: Editor, selection: SelectionState): void;
  
  // Content 변경 후
  onContentChange?(editor: Editor, content: DocumentState): void;
}
```

**이유:**
- ✅ 모델의 핵심 변경 사항
- ✅ 타입 안정성 제공
- ⚠️ Events로도 가능하지만, 타입 안정성을 위해 훅도 제공

---

## 이벤트로 제공 (나머지)

### Node 이벤트

```typescript
// 훅 없음 → 이벤트로만 제공
editor.on('editor:node.create', (data) => {
  const { node, position } = data;
  // ...
});

editor.on('editor:node.update', (data) => {
  const { node, oldNode } = data;
  // ...
});

editor.on('editor:node.delete', (data) => {
  const { node, position } = data;
  // ...
});
```

### Command 이벤트

```typescript
// 훅 없음 → 이벤트로만 제공
editor.on('editor:command.execute', (data) => {
  const { command, payload, success } = data;
  // ...
});

editor.on('editor:command.before', (data) => {
  const { command, payload } = data;
  // ...
});

editor.on('editor:command.after', (data) => {
  const { command, payload, success } = data;
  // ...
});
```

### History 이벤트

```typescript
// 훅 없음 → 이벤트로만 제공
editor.on('editor:history.change', (data) => {
  const { canUndo, canRedo } = data;
  // ...
});

editor.on('editor:history.undo', (data) => {
  const { document } = data;
  // ...
});

editor.on('editor:history.redo', (data) => {
  const { document } = data;
  // ...
});
```

### 기타 이벤트

```typescript
// Editable 상태 변경
editor.on('editor:editable.change', (data) => {
  const { editable } = data;
  // ...
});

// Selection focus/blur
editor.on('editor:selection.focus', (data) => {
  const { selection } = data;
  // ...
});

editor.on('editor:selection.blur', (data) => {
  const { selection } = data;
  // ...
});

// 에러 이벤트
editor.on('error:selection', (data) => {
  const { error } = data;
  // ...
});

editor.on('error:command', (data) => {
  const { command, payload, error } = data;
  // ...
});

// Extension 이벤트
editor.on('extension:add', (data) => {
  const { extension } = data;
  // ...
});

// 커스텀 이벤트
editor.on('plugin:myPlugin.action', (data) => {
  // ...
});

editor.on('user:save', (data) => {
  // ...
});
```

---

## 사용 가이드

### 1. 모델 변경 가로채기/수정 → Before Hooks

```typescript
class ReadOnlyExtension implements Extension {
  onBeforeTransaction(editor: Editor, transaction: Transaction): Transaction | null {
    if (editor.getContext('readOnly')) {
      return null; // 취소
    }
    return transaction;
  }
}
```

### 2. 모델 변경 알림 → After Hooks 또는 Events

**타입 안정성이 중요할 때:**
```typescript
class LoggingExtension implements Extension {
  onTransaction(editor: Editor, transaction: Transaction): void {
    console.log('Transaction:', transaction.sid);
  }
}
```

**유연성이 중요할 때:**
```typescript
class LoggingExtension implements Extension {
  onCreate(editor: Editor): void {
    editor.on('editor:content.change', (data) => {
      console.log('Content changed');
    });
  }
}
```

### 3. 기타 이벤트 → Events만 사용

```typescript
class MyExtension implements Extension {
  onCreate(editor: Editor): void {
    // Command 실행 감지
    editor.on('editor:command.execute', (data) => {
      console.log('Command:', data.command);
    });
    
    // History 변경 감지
    editor.on('editor:history.change', (data) => {
      console.log('History:', data.canUndo, data.canRedo);
    });
    
    // 커스텀 이벤트
    editor.on('user:save', (data) => {
      // 저장 로직
    });
  }
}
```

---

## 비교표

| 변경 사항 | Before Hook | After Hook | Event | 이유 |
|----------|------------|------------|-------|------|
| **Transaction** | ✅ | ✅ | ✅ | 핵심 모델 변경 |
| **Selection** | ✅ | ✅ | ✅ | 핵심 모델 변경 |
| **Content** | ✅ | ✅ | ✅ | 핵심 모델 변경 |
| **Node (create/update/delete)** | ❌ | ❌ | ✅ | 세부 변경, 이벤트로 충분 |
| **Command** | ❌ | ❌ | ✅ | 세부 변경, 이벤트로 충분 |
| **History** | ❌ | ❌ | ✅ | 세부 변경, 이벤트로 충분 |
| **Editable** | ❌ | ❌ | ✅ | 상태 변경, 이벤트로 충분 |
| **Error** | ❌ | ❌ | ✅ | 예외 상황, 이벤트로 충분 |
| **Extension** | ❌ | ❌ | ✅ | 메타 이벤트, 이벤트로 충분 |

---

## 최종 Extension 인터페이스

```typescript
interface Extension {
  name: string;
  priority?: number;
  dependencies?: string[];
  
  // Lifecycle (필수)
  onBeforeCreate?(editor: Editor): void;
  onCreate?(editor: Editor): void;
  onDestroy?(editor: Editor): void;
  
  // Command registration
  commands?: Command[];
  
  // Before hooks (핵심 모델 변경 - 가로채기/수정)
  onBeforeTransaction?(
    editor: Editor, 
    transaction: Transaction
  ): Transaction | null | void;
  
  onBeforeSelectionChange?(
    editor: Editor, 
    selection: SelectionState
  ): SelectionState | null | void;
  
  onBeforeContentChange?(
    editor: Editor, 
    content: DocumentState
  ): DocumentState | null | void;
  
  // After hooks (핵심 모델 변경 - 알림)
  onTransaction?(editor: Editor, transaction: Transaction): void;
  onSelectionChange?(editor: Editor, selection: SelectionState): void;
  onContentChange?(editor: Editor, content: DocumentState): void;
  
  // State extension
  addState?: (editor: Editor) => void;
  addStorage?: (editor: Editor) => void;
}
```

**총 6개의 훅 (Before 3개 + After 3개)**

---

## 장점

### 1. 명확한 역할 구분

- **훅**: 핵심 모델 변경 (Transaction, Selection, Content)
- **이벤트**: 세부 변경 및 메타 이벤트

### 2. 확장성

- 새로운 이벤트 추가 시 인터페이스 수정 불필요
- 커스텀 이벤트 (`plugin:*`, `user:*`) 자유롭게 사용

### 3. 타입 안정성

- 핵심 변경은 훅으로 타입 안정성 보장
- 세부 변경은 이벤트로 유연성 제공

### 4. 단순성

- Extension 인터페이스가 복잡하지 않음
- 핵심 변경만 훅으로 제공

---

## 마이그레이션 가이드

### 기존 코드 (변경 없음)

```typescript
// Before hooks는 그대로 사용
onBeforeTransaction(editor, transaction) {
  return transaction;
}

// After hooks도 그대로 사용 가능
onTransaction(editor, transaction) {
  console.log('Transaction');
}

// 또는 Events로 전환 가능 (선택적)
onCreate(editor) {
  editor.on('editor:content.change', (data) => {
    console.log('Content changed');
  });
}
```

### 새로운 기능 추가

```typescript
// Node 변경 감지 → Events 사용
onCreate(editor) {
  editor.on('editor:node.create', (data) => {
    console.log('Node created:', data.node);
  });
}

// Command 실행 감지 → Events 사용
onCreate(editor) {
  editor.on('editor:command.execute', (data) => {
    console.log('Command:', data.command);
  });
}
```

---

## 결론

**핵심 원칙:**
- ✅ **핵심 모델 변경 (Transaction, Selection, Content)**: 훅으로 제공
- ✅ **나머지 모든 변경**: 이벤트로 제공
- ✅ **Before hooks**: 가로채기/수정이 필요한 경우
- ✅ **After hooks**: 타입 안정성이 중요한 경우 (선택적, Events도 가능)

**이 구조는:**
- 명확한 역할 구분
- 확장 가능
- 타입 안정성과 유연성의 균형
- 단순하고 이해하기 쉬움
