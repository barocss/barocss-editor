# Keybinding 시스템에서 Selection 전달 방식 분석

## 문제 상황

Backspace/Delete command는 `{ selection: ModelSelection }` 파라미터가 필요합니다.

현재:
```typescript
// editor-view-dom.ts
handleBackspaceKey(): void {
  const modelSelection = this.selectionHandler.convertDOMSelectionToModel(domSelection);
  this.editor.executeCommand('backspace', { selection: modelSelection });
}
```

keybinding 시스템으로 통합할 때:
```typescript
// editor-view-dom.ts
const resolved = this.editor.keybindings.resolve(key);
if (resolved.length > 0) {
  const { command, args } = resolved[0];
  // selection을 어떻게 전달할까?
  void this.editor.executeCommand(command, args);
}
```

## 옵션 비교

### 옵션 A: Context에 Selection 저장

**구조**:
```typescript
// Editor._updateBuiltinContext()
this._context['selection'] = this.selection; // ModelSelection 객체 저장

// Command에서 사용
execute: async (editor: Editor, payload?: any) => {
  const selection = editor.getContext('selection') || editor.selection;
  return await this._executeBackspace(editor, selection);
}
```

**장점**:
1. ✅ **일관성**: Context는 이미 selection 메타데이터를 관리
2. ✅ **when 절에서 사용 가능**: `when: 'selection && !selectionEmpty'`
3. ✅ **자동 업데이트**: `_updateBuiltinContext()`에서 자동으로 최신 상태 유지
4. ✅ **명시적**: Context에 있다는 것이 명확

**단점**:
1. ❌ **Context 오염**: Context는 주로 boolean/string 값인데 객체 저장
2. ❌ **타입 안정성**: Context는 `Record<string, unknown>`이므로 타입 체크 어려움
3. ❌ **성능**: 매번 context 업데이트 시 selection 객체 복사
4. ❌ **순환 참조 위험**: Context에 복잡한 객체 저장은 위험할 수 있음

**VS Code 방식**:
- VS Code는 context에 selection 객체를 저장하지 않음
- 대신 selection의 메타데이터만 context에 저장

### 옵션 B: Command가 `editor.selection` 직접 읽기 (권장)

**구조**:
```typescript
// DeleteExtension
execute: async (editor: Editor, payload?: { selection?: ModelSelection }) => {
  // payload에 selection이 있으면 사용, 없으면 editor.selection 사용
  const selection = payload?.selection || editor.selection;
  if (!selection) {
    return false; // selection이 없으면 실행 불가
  }
  return await this._executeBackspace(editor, selection);
}
```

**장점**:
1. ✅ **단순함**: 가장 직접적인 방법
2. ✅ **타입 안정성**: `editor.selection`은 `ModelSelection | null` 타입
3. ✅ **성능**: Context 업데이트 오버헤드 없음
4. ✅ **명확성**: Command가 명시적으로 selection을 요구
5. ✅ **유연성**: 필요시 payload로 override 가능
6. ✅ **VS Code와 유사**: VS Code도 command가 내부에서 상태 읽기

**단점**:
1. ❌ **when 절에서 사용 불가**: `when: 'selection.startNodeId === ...'` 같은 복잡한 조건 불가
2. ❌ **명시적이지 않음**: Command 시그니처에 selection이 없어도 사용 가능

**해결 방법**:
- `when` 절은 메타데이터만 사용 (이미 구현됨: `selectionEmpty`, `selectionType`)
- Command는 `editor.selection`을 기본값으로 사용하되, payload로 override 가능

### 옵션 C: Keybinding 시스템에서 자동 전달

**구조**:
```typescript
// keybinding.ts resolve()
const resolved = this.editor.keybindings.resolve(key);
if (resolved.length > 0) {
  const { command, args } = resolved[0];
  
  // 특정 command는 자동으로 selection 추가
  const commandsNeedingSelection = ['backspace', 'deleteForward', 'insertParagraph'];
  if (commandsNeedingSelection.includes(command)) {
    const selection = this._contextProvider?.getContext('selection') || 
                      (this._contextProvider as any)?.selection;
    args = { ...args, selection };
  }
  
  void this.editor.executeCommand(command, args);
}
```

**장점**:
1. ✅ **자동화**: Command가 신경 쓸 필요 없음
2. ✅ **일관성**: 모든 selection이 필요한 command에 자동 적용

**단점**:
1. ❌ **하드코딩**: command 이름을 하드코딩해야 함
2. ❌ **확장성 제한**: 새로운 command 추가 시 수정 필요
3. ❌ **복잡성**: keybinding 시스템이 command의 요구사항을 알아야 함
4. ❌ **결합도 증가**: keybinding 시스템과 command 간 결합도 증가

### 옵션 D: Context에 Selection ID만 저장

**구조**:
```typescript
// Editor._updateBuiltinContext()
this._context['selectionId'] = this.selection ? 'current' : null;
// 또는 selection의 핵심 정보만 저장
this._context['selectionStartNodeId'] = this.selection?.startNodeId;
this._context['selectionStartOffset'] = this.selection?.startOffset;

// Command에서 사용
execute: async (editor: Editor, payload?: any) => {
  const selection = editor.selection; // 여전히 직접 읽기
  // context는 when 절에서만 사용
}
```

**장점**:
1. ✅ **Context 경량화**: 객체 대신 원시값만 저장
2. ✅ **when 절 활용**: `when: 'selectionStartNodeId === "node-1"'`

**단점**:
1. ❌ **복잡성**: Selection의 모든 정보를 context에 저장하기 어려움
2. ❌ **중복**: Command는 여전히 `editor.selection` 직접 읽기 필요

## 권장 사항

### 옵션 B (Command가 `editor.selection` 직접 읽기) 권장

**이유**:
1. **단순하고 명확함**: 가장 직접적인 방법
2. **타입 안정성**: TypeScript 타입 체크 가능
3. **성능**: Context 업데이트 오버헤드 없음
4. **VS Code와 유사**: 검증된 패턴
5. **유연성**: 필요시 payload로 override 가능

**구현 방법**:
```typescript
// DeleteExtension
execute: async (editor: Editor, payload?: { selection?: ModelSelection }) => {
  // 1. payload에 selection이 있으면 사용 (명시적 전달)
  // 2. 없으면 editor.selection 사용 (기본값)
  const selection = payload?.selection || editor.selection;
  
  if (!selection) {
    console.warn('[DeleteExtension] No selection available');
    return false;
  }
  
  return await this._executeBackspace(editor, selection);
}

canExecute: (editor: Editor, payload?: any) => {
  // selection이 있으면 실행 가능
  const selection = payload?.selection || editor.selection;
  return selection != null;
}
```

**keybinding 시스템 통합**:
```typescript
// editor-view-dom.ts
handleKeydown(event: KeyboardEvent): void {
  // ... IME 체크 ...
  
  const key = getKeyString(event);
  const resolved = this.editor.keybindings.resolve(key);
  
  if (resolved.length > 0) {
    const { command, args } = resolved[0];
    event.preventDefault();
    
    // Command가 자동으로 editor.selection을 읽음
    // 필요시 args로 override 가능
    void this.editor.executeCommand(command, args);
  }
}
```

**Context는 메타데이터만**:
- `selectionEmpty`: boolean
- `selectionType`: 'range' | 'node' | ...
- `selectionDirection`: 'forward' | 'backward' | null
- **Selection 객체 자체는 context에 저장하지 않음**

## 구현 계획

### 1단계: DeleteExtension 수정

```typescript
// packages/extensions/src/delete.ts
editor.registerCommand({
  name: 'backspace',
  execute: async (editor: Editor, payload?: { selection?: ModelSelection }) => {
    // payload에 selection이 있으면 사용, 없으면 editor.selection 사용
    const selection = payload?.selection || editor.selection;
    if (!selection) {
      return false;
    }
    return await this._executeBackspace(editor, selection);
  },
  canExecute: (editor: Editor, payload?: any) => {
    const selection = payload?.selection || editor.selection;
    return selection != null;
  }
});
```

### 2단계: editor-view-dom 수정

```typescript
// packages/editor-view-dom/src/editor-view-dom.ts
handleKeydown(event: KeyboardEvent): void {
  // ... IME 체크 ...
  
  const key = getKeyString(event);
  
  // Backspace/Delete 직접 처리 제거
  // 모든 키를 keybinding 시스템으로 통합
  
  const resolved = this.editor.keybindings.resolve(key);
  if (resolved.length > 0) {
    const { command, args } = resolved[0];
    event.preventDefault();
    void this.editor.executeCommand(command, args);
  }
}
```

### 3단계: Context는 메타데이터만 유지

```typescript
// Editor._updateBuiltinContext()
this._context['selectionEmpty'] = !this.selection || this.selection.collapsed;
this._context['selectionType'] = this.selection?.type || null;
this._context['selectionDirection'] = this.selection?.direction || null;
// selection 객체 자체는 context에 저장하지 않음
```

## 결론

**옵션 B (Command가 `editor.selection` 직접 읽기)를 권장합니다.**

**이유**:
1. 단순하고 명확함
2. 타입 안정성
3. 성능 최적화
4. VS Code와 유사한 패턴
5. Context는 메타데이터만 관리 (경량화)

**구현 시**:
- Command는 `payload?.selection || editor.selection` 패턴 사용
- Context는 selection 메타데이터만 저장
- `when` 절은 메타데이터만 사용

