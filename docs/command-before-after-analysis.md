# Command Before/After 분석

## 현재 구현

### Command 인터페이스

```typescript
export interface Command {
  name: string;
  execute: (editor: Editor, payload?: any) => boolean | Promise<boolean>;
  canExecute?: (editor: Editor, payload?: any) => boolean;
  before?: (editor: Editor, payload?: any) => void;  // void 반환
  after?: (editor: Editor, payload?: any) => void;   // void 반환
}
```

### executeCommand 구현

```typescript
async executeCommand(command: string, payload?: any): Promise<boolean> {
  const commandDef = this._commands.get(command);
  if (!commandDef) {
    return false;
  }

  try {
    if (commandDef.canExecute && !commandDef.canExecute(this, payload)) {
      return false;
    }

    // before 호출 (반환값 무시)
    commandDef.before?.(this, payload);
    
    // execute 실행
    const result = await commandDef.execute(this, payload);
    
    // after 호출 (반환값 무시)
    commandDef.after?.(this, payload);

    // 이벤트 emit (execute만)
    this.emit('editor:command.execute', { command, payload, success: result });
    return result;
  } catch (error) {
    this.emit('error:command', { command, payload, error });
    return false;
  }
}
```

## 분석 결과

### 1. Hook처럼 동작하지 않음

**확인 사항:**
- ❌ `before`는 `void` 반환 - 가로채기/취소 불가능
- ❌ `after`는 `void` 반환 - 결과 수정 불가능
- ❌ 반환값을 사용하지 않음
- ❌ Extension에서 가로채기 불가능

**동작:**
- 단순히 Command 객체 내부의 메서드를 호출하는 것
- Side effect만 가능 (로깅, 상태 변경 등)
- Command 실행을 막거나 수정할 수 없음

### 2. 이벤트도 emit되지 않음

**확인 사항:**
- ✅ `editor:command.before` 타입은 정의되어 있음
- ✅ `editor:command.after` 타입은 정의되어 있음
- ❌ 실제로 emit되지 않음
- ✅ `editor:command.execute`만 emit됨

**현재 상태:**
```typescript
// 타입만 정의되어 있음
'editor:command.before': { command: string; payload?: any };
'editor:command.after': { command: string; payload?: any; success: boolean };

// 실제로는 emit되지 않음
// this.emit('editor:command.before', ...); // 없음
// this.emit('editor:command.after', ...);  // 없음
```

## 비교: Transaction Hooks vs Command Before/After

### Transaction Hooks (Hook처럼 동작)

```typescript
// Extension에서 가로채기 가능
onBeforeTransaction(editor, transaction): Transaction | null | void {
  if (shouldCancel) {
    return null; // 취소 가능
  }
  return modifiedTransaction; // 수정 가능
}
```

### Command Before/After (Hook처럼 동작하지 않음)

```typescript
// Command 내부에서만 사용
before(editor, payload): void {
  // 가로채기/취소 불가능
  // Side effect만 가능
  console.log('Before command');
}

after(editor, payload): void {
  // 결과 수정 불가능
  // Side effect만 가능
  console.log('After command');
}
```

## 사용 사례

### Command Before/After의 용도

**1. 로깅**
```typescript
before(editor, payload) {
  console.log('Command starting:', this.name);
}

after(editor, payload) {
  console.log('Command finished:', this.name);
}
```

**2. 상태 변경**
```typescript
before(editor, payload) {
  editor.setContext('commandExecuting', true);
}

after(editor, payload) {
  editor.setContext('commandExecuting', false);
}
```

**3. 애니메이션/UI 업데이트**
```typescript
before(editor, payload) {
  // UI 표시
  showLoadingIndicator();
}

after(editor, payload) {
  // UI 숨김
  hideLoadingIndicator();
}
```

## 개선 제안

### 옵션 1: 이벤트 emit 추가 (권장)

```typescript
async executeCommand(command: string, payload?: any): Promise<boolean> {
  const commandDef = this._commands.get(command);
  if (!commandDef) {
    return false;
  }

  try {
    if (commandDef.canExecute && !commandDef.canExecute(this, payload)) {
      return false;
    }

    // 이벤트 emit (before)
    this.emit('editor:command.before', { command, payload });
    
    // before 호출
    commandDef.before?.(this, payload);
    
    // execute 실행
    const result = await commandDef.execute(this, payload);
    
    // after 호출
    commandDef.after?.(this, payload);
    
    // 이벤트 emit (after)
    this.emit('editor:command.after', { command, payload, success: result });
    
    // 이벤트 emit (execute)
    this.emit('editor:command.execute', { command, payload, success: result });
    return result;
  } catch (error) {
    this.emit('error:command', { command, payload, error });
    return false;
  }
}
```

**장점:**
- ✅ Extension에서 Command 실행 감지 가능
- ✅ 타입 정의와 실제 동작 일치
- ✅ 기존 코드와 호환

### 옵션 2: Extension에서 Command 가로채기 (Before Hook 추가)

```typescript
interface Extension {
  // Command 가로채기 (새로운 기능)
  onBeforeCommand?(
    editor: Editor, 
    command: string, 
    payload?: any
  ): boolean | void;
  // - false 반환: Command 취소
  // - true/void: Command 실행
}
```

**장점:**
- ✅ Extension에서 Command 가로채기 가능
- ✅ 타입 안정성
- ✅ Priority 기반 순서 보장

**단점:**
- ❌ 새로운 훅 추가 필요
- ❌ Command는 핵심 모델 변경이 아니므로 훅으로 제공하지 않기로 한 원칙과 충돌

## 결론

### 현재 상태

1. **Command Before/After는 Hook이 아님**
   - 단순히 Command 객체 내부 메서드 호출
   - 가로채기/취소/수정 불가능
   - Side effect만 가능

2. **이벤트도 emit되지 않음**
   - 타입만 정의되어 있음
   - 실제로는 emit되지 않음

### 권장 사항

**옵션 1 채택 (이벤트 emit 추가):**
- `editor:command.before` 이벤트 emit
- `editor:command.after` 이벤트 emit
- Extension에서 Command 실행 감지 가능
- 기존 코드와 호환

**Command는 핵심 모델 변경이 아니므로:**
- Hook으로 제공하지 않음 (원칙 유지)
- 이벤트로만 제공 (현재 설계와 일치)
