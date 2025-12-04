# Context Provider 스펙

## 1. 개요

`ContextProvider`는 Editor의 현재 상태를 나타내는 context key들을 관리하고 제공하는 시스템입니다. VS Code의 [when clause contexts](https://code.visualstudio.com/api/references/when-clause-contexts)를 참고하여 설계되었습니다.

Context key는 `when` clause에서 사용되어 keybinding, command, UI 요소의 활성화/비활성화를 제어합니다.

## 2. 용도

ContextProvider는 다음과 같은 용도로 사용됩니다:

1. **Keybinding 활성화/비활성화**: `when` clause를 사용하여 특정 상태에서만 keybinding이 활성화되도록 제어
2. **Command 활성화/비활성화**: Extension에서 command의 활성화 조건을 context key로 제어
3. **UI 상태 관리**: Extension에서 UI 요소의 표시/숨김을 context key로 제어
4. **상태 기반 로직**: Editor의 현재 상태에 따라 다른 동작을 수행

## 3. ContextProvider 인터페이스

```typescript
export interface ContextProvider {
  getContext(): Record<string, unknown>;
}
```

`Editor`는 `ContextProvider`를 구현하며, `KeybindingRegistry`에 자동으로 등록됩니다.

## 4. 기본 Context Key

Editor는 다음 context key들을 자동으로 관리합니다. 이 값들은 **Editor 생성 시 자동으로 초기화되며, Extension의 `onCreate`가 실행되기 전에 이미 존재합니다.**

### 4.1 기본 Context Key 정의

기본 context key는 `@barocss/editor-core/src/context/default-context.ts`에 명시적으로 정의되어 있습니다:

```typescript
import { 
  DEFAULT_CONTEXT_KEYS, 
  DEFAULT_CONTEXT_INITIAL_VALUES,
  DEFAULT_CONTEXT_DESCRIPTIONS 
} from '@barocss/editor-core';

// 기본 context key 상수 사용
const isFocused = editor.getContext()[DEFAULT_CONTEXT_KEYS.EDITOR_FOCUS];
```

### 4.2 에디터 상태

| Context Key | 타입 | 초기값 | 설명 |
|------------|------|--------|------|
| `editorFocus` | `boolean` | `false` | Editor가 포커스를 가지고 있는지 여부 |
| `editorEditable` | `boolean` | `true` | Editor가 편집 가능한 상태인지 여부 |

### 4.3 플랫폼 상태

| Context Key | 타입 | 초기값 | 설명 |
|------------|------|--------|------|
| `isMac` | `boolean` | `false` | 현재 실행 환경이 macOS 인지 여부 (`@barocss/shared`의 `IS_MAC` 기반) |
| `isLinux` | `boolean` | `false` | 현재 실행 환경이 Linux 인지 여부 (`IS_LINUX` 기반) |
| `isWindows` | `boolean` | `false` | 현재 실행 환경이 Windows 인지 여부 (`IS_WINDOWS` 기반) |

이 값들은 Editor 생성 시 기본값으로 초기화된 뒤, `_updateBuiltinContext()` 호출 시 항상 최신 플랫폼 상수로 덮어써집니다.  
즉, Extension에서는 언제든지 `when` 절에서 안전하게 `isMac`, `isLinux`, `isWindows` 를 사용할 수 있습니다.

### 4.4 선택 상태

| Context Key | 타입 | 초기값 | 설명 |
|------------|------|--------|------|
| `selectionEmpty` | `boolean` | `true` | Selection이 비어있는지 여부 (collapsed) |
| `selectionType` | `'range' \| 'node' \| 'multi-node' \| 'cell' \| 'table' \| null` | `null` | Selection 타입 |
| `selectionDirection` | `'forward' \| 'backward' \| null` | `null` | Selection 방향 |

### 4.5 히스토리 상태

| Context Key | 타입 | 초기값 | 설명 |
|------------|------|--------|------|
| `historyCanUndo` | `boolean` | `false` | Undo가 가능한지 여부 |
| `historyCanRedo` | `boolean` | `false` | Redo가 가능한지 여부 |

### 4.6 자동 업데이트

위의 기본 context key들은 Editor 상태가 변경될 때 자동으로 업데이트됩니다:

- `editorFocus`: Editor 포커스 변경 시
- `editorEditable`: `setEditable()` 호출 시
- `selectionEmpty`, `selectionType`, `selectionDirection`: `updateSelection()` 호출 시
- `historyCanUndo`, `historyCanRedo`: History 상태 변경 시
- `isMac`, `isLinux`, `isWindows`: 플랫폼 상수(`IS_MAC` 등)에 따라 `_updateBuiltinContext()` 호출 시마다 다시 설정되며, 런타임 동안 불변으로 유지됩니다.

**중요**: 기본 context key는 `_updateBuiltinContext()` 메서드로 업데이트되며, 이 메서드는 `setContext()`를 호출하지 않으므로 **이벤트가 발생하지 않습니다**. Extension은 이 값들이 항상 존재한다고 가정할 수 있습니다.

### 4.7 Extension에서 기본 Context 사용
### 4.7 Extension에서 기본 Context 사용

Extension의 `onCreate`에서 기본 context key를 사용할 때는, 이 값들이 항상 존재한다고 가정할 수 있습니다:

```typescript
export class MyExtension implements Extension {
  onCreate(editor: Editor): void {
    // 기본 context key는 항상 존재하므로 안전하게 사용 가능
    const isFocused = editor.getContext()['editorFocus'] as boolean;
    const isEditable = editor.getContext()['editorEditable'] as boolean;
    const isMac = editor.getContext()['isMac'] as boolean;
    
    // when clause에서도 안전하게 사용 가능
    editor.keybindings.register({
      key: 'Mod+b',
      command: 'toggleBold',
      when: 'editorFocus && editorEditable' // 항상 정의되어 있음
    });

    // OS별로 다른 keybinding을 등록할 수도 있다.
    editor.keybindings.register({
      key: isMac ? 'Alt+ArrowLeft' : 'Ctrl+ArrowLeft',
      command: 'moveCursorWordLeft',
      when: 'editorFocus'
    });
  }
}
```

## 5. 커스텀 Context 추가

Extension이나 호스트 애플리케이션에서 커스텀 context key를 추가할 수 있습니다.

### 5.1 Context Key 값의 타입

Context key는 다음 타입의 값을 가질 수 있습니다:

- **boolean**: `true`, `false`
- **string**: `'edit'`, `'view'` 등
- **number**: `0`, `5`, `-1` 등
- **array**: `['test', 'foo', 'bar']` 등
- **object**: `{ test: true, foo: 'anything' }` 등
- **null**: Context key를 제거할 때 사용
- **undefined**: Context key를 제거할 때 사용

### 5.2 직접 메서드 호출

```typescript
// boolean 값 설정
editor.setContext('myExtension.showMyCommand', true);

// 숫자 값 설정
editor.setContext('myExtension.numberOfItems', 5);

// 문자열 값 설정
editor.setContext('myExtension.currentMode', 'edit');

// 배열 값 설정
editor.setContext('myExtension.supportedFolders', ['test', 'foo', 'bar']);

// 객체 값 설정 (key 존재 여부로 체크)
editor.setContext('myExtension.supportedFolders', {
  test: true,
  foo: 'anything',
  bar: true
});

// Context key 제거
editor.setContext('myExtension.showMyCommand', null);
// 또는
editor.setContext('myExtension.showMyCommand', undefined);
```

### 5.3 Command 사용 (VS Code 스타일)

```typescript
// setContext command 사용
await editor.executeCommand('setContext', {
  key: 'myExtension.showMyCommand',
  value: true
});

// Context key 제거
await editor.executeCommand('setContext', {
  key: 'myExtension.showMyCommand',
  value: null
});
```

### 5.4 Context Key 초기화 시점

Context key는 다음과 같은 시점에 초기화됩니다:

1. **Editor 생성 시**: 기본 context key들이 자동으로 초기화됩니다.
2. **Extension 활성화 시**: `onCreate`에서 context key를 설정하는 것이 일반적입니다.
3. **상태 변경 시**: Editor 상태가 변경될 때 관련 context key가 자동으로 업데이트됩니다.

```typescript
export class MyExtension implements Extension {
  onCreate(editor: Editor): void {
    // Extension 활성화 시 context 초기화
    editor.setContext('myExtension.enabled', true);
    editor.setContext('myExtension.mode', 'default');
  }
  
  onDestroy(editor: Editor): void {
    // Extension 제거 시 context 정리
    editor.setContext('myExtension.enabled', false);
    editor.setContext('myExtension.mode', null);
  }
}
```

## 6. Context 변경 이벤트 구독

Context가 변경되면 이벤트가 발생합니다. 특정 key만 구독하거나 모든 변경을 구독할 수 있습니다.

### 6.1 모든 Context 변경 구독

```typescript
editor.on('editor:context.change', ({ key, value, oldValue }) => {
  console.log(`Context ${key} changed:`, value);
});
```

### 6.2 특정 Key만 구독 (권장)

```typescript
// 방법 1: 특정 key 이벤트 직접 구독
editor.on('editor:context.change:myExtension.showMyCommand', ({ value, oldValue }) => {
  console.log('showMyCommand changed:', value);
});

// 방법 2: 편의 메서드 사용 (권장)
const unsubscribe = editor.onContextChange('myExtension.showMyCommand', ({ value, oldValue }) => {
  console.log('showMyCommand changed:', value);
});

// 필요시 구독 해제
unsubscribe();
```

### 6.3 ⚠️ 초기화 시점 이벤트 누락 문제

**문제**: `onCreate`에서 `setContext`를 호출하면 이벤트가 발생하지만, 다른 Extension의 `onCreate`가 아직 실행되지 않았을 수 있어 초기 설정 시점의 이벤트를 놓칠 수 있습니다.

**시나리오**:
```typescript
// Extension A (먼저 등록됨)
export class ExtensionA implements Extension {
  onCreate(editor: Editor): void {
    editor.setContext('extensionA.key', 'value'); // 이벤트 발생
  }
}

// Extension B (나중에 등록됨)
export class ExtensionB implements Extension {
  onCreate(editor: Editor): void {
    // Extension A의 onCreate가 이미 실행되어 이벤트가 발생했지만,
    // 이 시점에 리스너가 아직 등록되지 않아 이벤트를 받지 못함
    editor.onContextChange('extensionA.key', (data) => {
      console.log('Received:', data); // 초기 설정 이벤트는 받지 못함
    });
  }
}
```

**해결 방법**:

1. **초기 상태 확인 패턴** (권장):
```typescript
export class ExtensionB implements Extension {
  onCreate(editor: Editor): void {
    // 1. 리스너 등록
    editor.onContextChange('extensionA.key', ({ value }) => {
      this.handleChange(value);
    });

    // 2. 초기 상태 확인 (이미 설정되어 있을 수 있음)
    const initialValue = editor.getContext()['extensionA.key'];
    if (initialValue !== undefined) {
      this.handleChange(initialValue);
    }
  }

  private handleChange(value: unknown): void {
    // 변경 처리
  }
}
```

2. **Extension 등록 순서 조정**:
```typescript
// Extension B가 Extension A보다 먼저 등록되도록 순서 조정
const editor = new Editor({
  extensions: [
    new ExtensionB(), // 먼저 등록 (리스너 등록)
    new ExtensionA()  // 나중에 등록 (context 설정)
  ]
});
```

3. **의존성 명시**:
```typescript
export class ExtensionB implements Extension {
  name = 'extensionB';
  dependencies = ['extensionA']; // Extension A가 먼저 등록되도록 보장

  onCreate(editor: Editor): void {
    // Extension A가 이미 onCreate를 실행했을 수 있으므로 초기 상태 확인
    const initialValue = editor.getContext()['extensionA.key'];
    if (initialValue !== undefined) {
      this.handleChange(initialValue);
    }

    // 이후 변경 구독
    editor.onContextChange('extensionA.key', ({ value }) => {
      this.handleChange(value);
    });
  }
}
```

**권장 사항**:
- Extension 간 의존성이 있는 경우, 초기 상태를 확인하는 패턴을 사용하세요.
- `onCreate`에서 `setContext`를 호출하는 것은 문제없지만, 다른 Extension이 이를 구독할 때는 초기 상태를 확인해야 합니다.
- 리스너는 "변경"을 감지하는 것이므로, 초기 설정 시점의 이벤트를 놓치는 것은 일반적이며, 초기 상태를 확인하는 것으로 해결할 수 있습니다.

## 7. When Clause에서 사용

Context key는 `when` clause에서 사용되어 keybinding이나 command의 활성화 조건을 제어합니다.

### 7.1 기본 사용 예시

```typescript
// Editor가 포커스를 가지고 있고 편집 가능할 때만 활성화
editor.keybindings.register({
  key: 'Mod+b',
  command: 'toggleBold',
  when: 'editorFocus && editorEditable'
});

// Selection이 비어있지 않을 때만 활성화
editor.keybindings.register({
  key: 'Mod+c',
  command: 'copy',
  when: '!selectionEmpty'
});

// 특정 Selection 타입일 때만 활성화
editor.keybindings.register({
  key: 'Mod+d',
  command: 'duplicateNode',
  when: 'selectionType == "node"'
});
```

### 7.2 커스텀 Context 사용 예시

```typescript
// Extension에서 context 설정
editor.setContext('myExtension.showMyCommand', true);

// 커스텀 context를 사용한 keybinding
editor.keybindings.register({
  key: 'Mod+Shift+m',
  command: 'myCustomCommand',
  when: 'myExtension.showMyCommand && editorFocus',
  source: 'extension'
});
```

### 7.3 복잡한 조건 예시

```typescript
// Undo 가능하고 Editor가 편집 가능할 때만 활성화
editor.keybindings.register({
  key: 'Mod+z',
  command: 'undo',
  when: 'historyCanUndo && editorEditable'
});

// Selection이 비어있지 않고 특정 타입일 때만 활성화
editor.keybindings.register({
  key: 'Delete',
  command: 'deleteSelection',
  when: '!selectionEmpty && selectionType == "range"'
});
```

## 8. Context Key 네이밍 규칙

커스텀 context key를 추가할 때는 다음 규칙을 따르는 것을 권장합니다:

1. **Extension 이름 접두사 사용**: `myExtension.keyName` 형식
2. **camelCase 사용**: `showMyCommand`, `numberOfItems` 등
3. **명확한 이름**: 목적이 명확하게 드러나는 이름 사용
4. **boolean 값**: `is`, `has`, `can`, `show` 등의 접두사 사용

예시:
- ✅ `myExtension.showMyCommand`
- ✅ `myExtension.canEdit`
- ✅ `myExtension.hasSelection`
- ❌ `showCommand` (extension 이름 없음)
- ❌ `SHOW_COMMAND` (대문자 사용)

## 9. Context 조회

Context key를 조회하는 방법은 두 가지가 있습니다:

### 9.1 전체 Context 조회

```typescript
const context = editor.getContext();
console.log(context);
// {
//   editorFocus: true,
//   editorEditable: true,
//   selectionEmpty: false,
//   selectionType: 'range',
//   selectionDirection: 'forward',
//   historyCanUndo: true,
//   historyCanRedo: false,
//   myExtension.showMyCommand: true,
//   ...
// }
```

### 9.2 특정 Key 조회 (편의 메서드)

특정 context key만 조회하려면 `getContext(key)`를 사용할 수 있습니다:

```typescript
// 특정 key 조회 (권장)
const isFocused = editor.getContext('editorFocus') as boolean;
const isEditable = editor.getContext('editorEditable') as boolean;
const selectionType = editor.getContext('selectionType') as string | null;

// 커스텀 context key 조회
const showCommand = editor.getContext('myExtension.showMyCommand') as boolean;

// 존재하지 않는 key는 undefined 반환
const unknown = editor.getContext('unknown.key'); // undefined
```

**장점**:
- 더 간결한 코드: `editor.getContext('key')` vs `editor.getContext()['key']`
- 타입 안정성: TypeScript에서 타입 캐스팅이 더 명확함
- 가독성: 의도가 더 명확함

**기존 방식도 여전히 사용 가능**:
```typescript
// 기존 방식도 계속 사용 가능
const context = editor.getContext();
const isFocused = context['editorFocus'] as boolean;
```

## 10. VS Code와의 호환성

이 ContextProvider 시스템은 VS Code의 when clause contexts 시스템을 참고하여 설계되었습니다:

- **동일한 개념**: Context key를 통한 상태 관리
- **동일한 사용법**: `setContext` command 사용
- **유사한 기본 context**: Editor 상태, Selection 상태 등
- **확장 가능**: Extension에서 커스텀 context 추가 가능

VS Code 문서: [When clause contexts](https://code.visualstudio.com/api/references/when-clause-contexts)

## 11. 사용 예시: Extension에서 Context 활용

```typescript
import { Extension, Editor } from '@barocss/editor-core';

export class MyExtension implements Extension {
  name = 'myExtension';

  onCreate(editor: Editor): void {
    // Extension 활성화 시 context 설정
    editor.setContext('myExtension.enabled', true);
    
    // 특정 조건에서 context 업데이트
    editor.on('editor:selection.model', () => {
      const selection = editor.selection;
      if (selection && selection.type === 'node') {
        editor.setContext('myExtension.hasNodeSelection', true);
      } else {
        editor.setContext('myExtension.hasNodeSelection', false);
      }
    });
    
    // Context 변경 구독
    const unsubscribe = editor.onContextChange('myExtension.enabled', ({ value }) => {
      console.log('Extension enabled:', value);
    });
    
    // Extension 제거 시 정리
    this.onDestroy = () => {
      unsubscribe();
      editor.setContext('myExtension.enabled', false);
    };
  }
}
```

## 12. 디버깅

### 12.1 Context Key 조회

현재 모든 context key를 조회하여 디버깅할 수 있습니다:

```typescript
const context = editor.getContext();
console.log('Current context keys:', context);

// 특정 key 확인
console.log('showMyCommand:', context['myExtension.showMyCommand']);
```

### 12.2 Context 변경 추적

Context 변경을 추적하여 디버깅할 수 있습니다:

```typescript
// 모든 context 변경 로깅
editor.on('editor:context.change', ({ key, value, oldValue }) => {
  console.log(`[Context] ${key}: ${oldValue} → ${value}`);
});

// 특정 key만 추적
editor.onContextChange('myExtension.showMyCommand', ({ value, oldValue }) => {
  console.log(`[Context] showMyCommand: ${oldValue} → ${value}`);
});
```

### 12.3 When Clause 평가 확인

Keybinding이 활성화되지 않을 때, context key를 확인하여 원인을 파악할 수 있습니다:

```typescript
import { evaluateWhenExpression } from '@barocss/editor-core';

// Keybinding 등록
editor.keybindings.register({
  key: 'Mod+b',
  command: 'toggleBold',
  when: 'myExtension.showMyCommand && editorFocus'
});

// Context 확인
const context = editor.getContext();
console.log('showMyCommand:', context['myExtension.showMyCommand']); // true/false
console.log('editorFocus:', context['editorFocus']); // true/false

// When clause 수동 평가 (디버깅용)
const whenExpr = 'myExtension.showMyCommand && editorFocus';
const result = evaluateWhenExpression(whenExpr, context);
console.log(`When clause "${whenExpr}" evaluates to:`, result);
```

## 13. 성능 고려사항

### 13.1 Context Key 수

많은 수의 context key를 관리할 때는 다음을 고려하세요:

1. **필요한 key만 설정**: 사용하지 않는 context key는 설정하지 않거나 제거하세요.
2. **특정 key만 구독**: 모든 context 변경을 구독하는 대신, 필요한 key만 구독하세요.
3. **이벤트 리스너 정리**: Extension 제거 시 이벤트 리스너를 정리하세요.

```typescript
export class MyExtension implements Extension {
  private unsubscribeCallbacks: (() => void)[] = [];

  onCreate(editor: Editor): void {
    // 여러 context 변경 구독
    this.unsubscribeCallbacks.push(
      editor.onContextChange('myExtension.key1', this.handleKey1Change),
      editor.onContextChange('myExtension.key2', this.handleKey2Change)
    );
  }

  onDestroy(editor: Editor): void {
    // 모든 구독 해제
    this.unsubscribeCallbacks.forEach(unsubscribe => unsubscribe());
    this.unsubscribeCallbacks = [];
  }
}
```

### 13.2 Context 변경 빈도

자주 변경되는 context key는 성능에 영향을 줄 수 있습니다:

- **과도한 업데이트 방지**: 필요한 경우에만 context를 업데이트하세요.
- **배치 업데이트**: 여러 context를 한 번에 업데이트하는 것이 효율적일 수 있습니다.

```typescript
// 비효율적: 여러 번 업데이트
editor.setContext('myExtension.item1', value1);
editor.setContext('myExtension.item2', value2);
editor.setContext('myExtension.item3', value3);

// 효율적: 객체로 한 번에 업데이트
editor.setContext('myExtension.items', {
  item1: value1,
  item2: value2,
  item3: value3
});
```

## 14. 일반적인 패턴

### 14.1 Extension 활성화 상태 관리

```typescript
export class MyExtension implements Extension {
  onCreate(editor: Editor): void {
    editor.setContext('myExtension.enabled', true);
  }

  onDestroy(editor: Editor): void {
    editor.setContext('myExtension.enabled', false);
  }
}
```

### 14.2 Selection 기반 Context 업데이트

```typescript
editor.on('editor:selection.model', () => {
  const selection = editor.selection;
  
  // Selection 타입에 따라 context 업데이트
  if (selection?.type === 'node') {
    editor.setContext('myExtension.hasNodeSelection', true);
  } else {
    editor.setContext('myExtension.hasNodeSelection', false);
  }
});
```

### 14.3 모드 기반 Context 관리

```typescript
class EditorMode {
  private currentMode: string = 'default';

  setMode(editor: Editor, mode: string): void {
    this.currentMode = mode;
    editor.setContext('myExtension.mode', mode);
  }

  getMode(): string {
    return this.currentMode;
  }
}
```

### 14.4 조건부 Keybinding 등록

```typescript
// Extension 활성화 시에만 keybinding 등록
editor.onContextChange('myExtension.enabled', ({ value }) => {
  if (value) {
    editor.keybindings.register({
      key: 'Mod+Shift+m',
      command: 'myCustomCommand',
      when: 'editorFocus',
      source: 'extension'
    });
  }
});
```

## 17. 실제 사용 케이스

### 17.1 읽기 전용 모드 관리

에디터가 읽기 전용 모드일 때 특정 명령어를 비활성화합니다:

```typescript
export class ReadOnlyExtension implements Extension {
  name = 'readOnly';

  onCreate(editor: Editor): void {
    // 읽기 전용 모드 설정
    editor.setEditable(false);
    // 또는 커스텀 context 사용
    editor.setContext('readOnlyExtension.enabled', true);
  }

  setReadOnly(editor: Editor, readOnly: boolean): void {
    editor.setEditable(!readOnly);
    editor.setContext('readOnlyExtension.enabled', readOnly);
    
    // 읽기 전용일 때 편집 관련 keybinding 비활성화
    editor.keybindings.register({
      key: 'Mod+b',
      command: 'toggleBold',
      when: '!readOnlyExtension.enabled && editorFocus',
      source: 'extension'
    });
  }
}
```

### 17.2 편집 모드 전환 (일반/마크다운/코드)

다양한 편집 모드에 따라 다른 동작을 수행합니다:

```typescript
export class ModeExtension implements Extension {
  name = 'mode';
  private currentMode: 'normal' | 'markdown' | 'code' = 'normal';

  onCreate(editor: Editor): void {
    editor.setContext('modeExtension.currentMode', 'normal');
    
    // 모드별 keybinding 등록
    editor.keybindings.register({
      key: 'Mod+Shift+m',
      command: 'toggleMarkdownMode',
      when: 'modeExtension.currentMode != "markdown"',
      source: 'extension'
    });
    
    editor.keybindings.register({
      key: 'Mod+Shift+c',
      command: 'toggleCodeMode',
      when: 'modeExtension.currentMode != "code"',
      source: 'extension'
    });
  }

  setMode(editor: Editor, mode: 'normal' | 'markdown' | 'code'): void {
    this.currentMode = mode;
    editor.setContext('modeExtension.currentMode', mode);
  }
}
```

### 17.3 선택된 노드 타입에 따른 UI 표시

선택된 노드의 타입에 따라 다른 툴바나 메뉴를 표시합니다:

```typescript
export class NodeTypeExtension implements Extension {
  name = 'nodeType';

  onCreate(editor: Editor): void {
    // Selection 변경 시 노드 타입 context 업데이트
    editor.on('editor:selection.model', () => {
      const selection = editor.selection;
      if (selection?.type === 'node') {
        const node = editor.dataStore.getNode(selection.nodeId);
        if (node) {
          editor.setContext('nodeTypeExtension.selectedType', node.stype);
          editor.setContext('nodeTypeExtension.isImage', node.stype === 'inline-image');
          editor.setContext('nodeTypeExtension.isTable', node.stype === 'table');
        }
      } else {
        editor.setContext('nodeTypeExtension.selectedType', null);
        editor.setContext('nodeTypeExtension.isImage', false);
        editor.setContext('nodeTypeExtension.isTable', false);
      }
    });
    
    // 이미지 선택 시에만 이미지 편집 명령어 활성화
    editor.keybindings.register({
      key: 'Mod+i',
      command: 'editImage',
      when: 'nodeTypeExtension.isImage && editorFocus',
      source: 'extension'
    });
  }
}
```

### 17.4 다중 선택 상태 관리

여러 노드가 선택되었을 때의 상태를 관리합니다:

```typescript
export class MultiSelectionExtension implements Extension {
  name = 'multiSelection';

  onCreate(editor: Editor): void {
    editor.on('editor:selection.model', () => {
      const selection = editor.selection;
      const isMultiSelection = selection?.type === 'multi-node';
      const selectionCount = isMultiSelection 
        ? (selection as any).nodeIds?.length || 0 
        : 0;
      
      editor.setContext('multiSelectionExtension.hasMultiple', isMultiSelection);
      editor.setContext('multiSelectionExtension.count', selectionCount);
    });
    
    // 다중 선택 시에만 일괄 작업 명령어 활성화
    editor.keybindings.register({
      key: 'Mod+Shift+d',
      command: 'duplicateSelected',
      when: 'multiSelectionExtension.hasMultiple && editorFocus',
      source: 'extension'
    });
  }
}
```

### 17.5 드래그 앤 드롭 상태 관리

드래그 중일 때 특정 동작을 비활성화합니다:

```typescript
export class DragDropExtension implements Extension {
  name = 'dragDrop';
  private isDragging = false;

  onCreate(editor: Editor): void {
    editor.setContext('dragDropExtension.isDragging', false);
    
    // DOM 이벤트 리스너
    const element = editor.selectionManager.getContentEditableElement();
    if (element) {
      element.addEventListener('dragstart', () => {
        this.isDragging = true;
        editor.setContext('dragDropExtension.isDragging', true);
      });
      
      element.addEventListener('dragend', () => {
        this.isDragging = false;
        editor.setContext('dragDropExtension.isDragging', false);
      });
    }
    
    // 드래그 중에는 텍스트 선택 비활성화
    editor.keybindings.register({
      key: 'Mod+a',
      command: 'selectAll',
      when: '!dragDropExtension.isDragging && editorFocus',
      source: 'extension'
    });
  }
}
```

### 17.6 에러 상태 관리

에러가 발생했을 때 특정 동작을 제한합니다:

```typescript
export class ErrorStateExtension implements Extension {
  name = 'errorState';

  onCreate(editor: Editor): void {
    editor.setContext('errorStateExtension.hasError', false);
    editor.setContext('errorStateExtension.errorMessage', null);
    
    // 에러 발생 시 context 업데이트
    editor.on('error:command', ({ error }) => {
      editor.setContext('errorStateExtension.hasError', true);
      editor.setContext('errorStateExtension.errorMessage', error.message);
      
      // 에러 발생 후 일정 시간 후 자동 해제
      setTimeout(() => {
        editor.setContext('errorStateExtension.hasError', false);
        editor.setContext('errorStateExtension.errorMessage', null);
      }, 3000);
    });
    
    // 에러 상태일 때 일부 명령어 비활성화
    editor.keybindings.register({
      key: 'Mod+s',
      command: 'save',
      when: '!errorStateExtension.hasError && editorFocus',
      source: 'extension'
    });
  }
}
```

### 17.7 로딩 상태 관리

비동기 작업 중일 때 UI를 제어합니다:

```typescript
export class LoadingStateExtension implements Extension {
  name = 'loadingState';
  private loadingCount = 0;

  onCreate(editor: Editor): void {
    editor.setContext('loadingStateExtension.isLoading', false);
    editor.setContext('loadingStateExtension.loadingCount', 0);
    
    this.startLoading = (editor: Editor) => {
      this.loadingCount++;
      editor.setContext('loadingStateExtension.isLoading', true);
      editor.setContext('loadingStateExtension.loadingCount', this.loadingCount);
    };
    
    this.stopLoading = (editor: Editor) => {
      this.loadingCount = Math.max(0, this.loadingCount - 1);
      editor.setContext('loadingStateExtension.isLoading', this.loadingCount > 0);
      editor.setContext('loadingStateExtension.loadingCount', this.loadingCount);
    };
  }

  startLoading(editor: Editor): void {}
  stopLoading(editor: Editor): void {}
}
```

### 17.8 히스토리 기반 Undo/Redo 버튼 상태

히스토리 상태에 따라 Undo/Redo 버튼의 활성화를 제어합니다:

```typescript
export class HistoryUIExtension implements Extension {
  name = 'historyUI';

  onCreate(editor: Editor): void {
    // 히스토리 변경 시 context 업데이트
    editor.on('editor:history.change', () => {
      editor.setContext('historyUIExtension.canUndo', editor.historyManager.canUndo());
      editor.setContext('historyUIExtension.canRedo', editor.historyManager.canRedo());
    });
    
    // 초기 상태 설정
    editor.setContext('historyUIExtension.canUndo', false);
    editor.setContext('historyUIExtension.canRedo', false);
    
    // Undo/Redo keybinding은 기본 context를 사용하지만,
    // UI 버튼 활성화를 위해 커스텀 context도 사용 가능
    editor.keybindings.register({
      key: 'Mod+z',
      command: 'undo',
      when: 'historyUIExtension.canUndo && editorEditable',
      source: 'extension'
    });
  }
}
```

### 17.9 확장 기능별 설정 상태

확장 기능의 설정에 따라 동작을 변경합니다:

```typescript
export class SettingsExtension implements Extension {
  name = 'settings';
  private settings: Record<string, unknown> = {};

  onCreate(editor: Editor): void {
    // 설정을 context로 관리
    this.updateSettings(editor, {
      autoSave: true,
      theme: 'light',
      fontSize: 14
    });
  }

  updateSettings(editor: Editor, newSettings: Record<string, unknown>): void {
    this.settings = { ...this.settings, ...newSettings };
    
    // 각 설정을 context key로 설정
    Object.entries(newSettings).forEach(([key, value]) => {
      editor.setContext(`settingsExtension.${key}`, value);
    });
    
    // 설정에 따라 keybinding 활성화/비활성화
    editor.keybindings.register({
      key: 'Mod+Shift+s',
      command: 'toggleAutoSave',
      when: 'settingsExtension.autoSave == false',
      source: 'extension'
    });
  }
}
```

### 17.10 복합 조건: 여러 Context Key 조합

여러 context key를 조합하여 복잡한 조건을 만듭니다:

```typescript
export class ComplexConditionExtension implements Extension {
  name = 'complexCondition';

  onCreate(editor: Editor): void {
    // 여러 조건을 조합한 keybinding
    editor.keybindings.register({
      key: 'Mod+Shift+p',
      command: 'preview',
      when: 'editorFocus && !readOnlyExtension.enabled && modeExtension.currentMode == "markdown" && !loadingStateExtension.isLoading',
      source: 'extension'
    });
    
    // 특정 노드 타입이고 다중 선택이 아닐 때만 활성화
    editor.keybindings.register({
      key: 'Mod+Shift+e',
      command: 'editNode',
      when: 'nodeTypeExtension.isImage && !multiSelectionExtension.hasMultiple && editorFocus',
      source: 'extension'
    });
  }
}
```

## 15. Context Key와 When Clause 재평가

Context key가 변경되면, `editor:context.change` 이벤트가 발생합니다. 하지만 `when` clause는 **즉시 자동으로 재평가되지 않습니다**.

### 15.1 재평가 시점

`when` clause는 다음 시점에 재평가됩니다:

1. **Keybinding resolve 시**: `editor.keybindings.resolve(key)`가 호출될 때
2. **키 입력 시**: `editor-view-dom`에서 키 입력을 받아 `resolve()`를 호출할 때

### 15.2 동작 흐름

```
1. Context 변경: editor.setContext('myExtension.showMyCommand', true)
2. 이벤트 발생: editor:context.change 이벤트 발생
3. 키 입력: 사용자가 키를 누름
4. resolve 호출: editor.keybindings.resolve(key) 호출
5. When Clause 평가: 현재 context로 when clause 재평가
6. Keybinding 활성화/비활성화: 재평가 결과에 따라 keybinding 반환 여부 결정
```

### 15.3 주의사항

- Context key를 변경해도 **즉시 keybinding이 활성화/비활성화되지 않습니다**.
- 다음 키 입력 시점에 재평가되어 반영됩니다.
- UI에서 keybinding 상태를 표시하려면, context 변경 이벤트를 구독하여 수동으로 UI를 업데이트해야 합니다.

## 16. 주의사항

1. **Context Key는 문자열**: 모든 context key는 문자열로 저장되며, 값은 `unknown` 타입입니다.
2. **자동 업데이트**: 기본 context key는 Editor 상태 변경 시 자동으로 업데이트됩니다.
3. **이벤트 기반**: Context 변경은 이벤트를 통해 알림되므로, 필요한 경우에만 구독하세요.
4. **성능**: 특정 key만 구독하면 불필요한 이벤트 처리를 줄일 수 있습니다.
5. **네이밍 충돌**: Extension 이름을 접두사로 사용하여 다른 Extension과의 충돌을 방지하세요.
6. **Context Key 제거**: `null` 또는 `undefined`를 설정하면 context key가 완전히 제거됩니다 (`delete` 연산자 사용). `getContext()`에서도 사라집니다.
7. **When Clause 평가**: Context key가 `undefined`이거나 존재하지 않으면, `when` clause에서 `false`로 평가됩니다.
8. **타입 안정성**: Context key 값은 `unknown` 타입이므로, 사용 시 타입 체크가 필요할 수 있습니다.

---

## 18. 관련 문서

- [Keybinding & Context 사용 예시 가이드](./keybinding-and-context-examples.md) - **실제 사용 예시 및 샘플 코드 모음** ⭐
- [Keyboard Shortcut Spec](./keyboard-shortcut-spec.md) - Keybinding 시스템 상세 스펙
- [When Expression Spec](./when-expression-spec.md) - `when` 절 평가 스펙
- [Keybinding Defaults and Customization](./keybinding-defaults-and-customization.md) - 기본 keybinding 관리 스펙

