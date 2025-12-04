# Keybinding & Context 사용 예시 가이드

이 문서는 Barocss Editor의 Keybinding과 Context 시스템을 실제로 사용하는 방법을 다양한 케이스별로 보여줍니다. VS Code, ProseMirror, Slate 등의 에디터를 참고하여 실제 개발 시나리오에 맞는 예시를 제공합니다.

## 목차

1. [기본 사용법](#1-기본-사용법)
2. [Extension에서 Keybinding 등록](#2-extension에서-keybinding-등록)
3. [Context 기반 조건부 Keybinding](#3-context-기반-조건부-keybinding)
4. [사용자 커스터마이징](#4-사용자-커스터마이징)
5. [복잡한 시나리오](#5-복잡한-시나리오)
6. [Best Practices](#6-best-practices)

---

## 1. 기본 사용법

### 1.1 간단한 Keybinding 등록

가장 기본적인 형태로, 특정 키 조합에 커맨드를 연결합니다.

```typescript
import { Editor } from '@barocss/editor-core';

// Editor 인스턴스 생성 후
const editor = new Editor({ /* ... */ });

// 기본 keybinding 등록 (항상 활성)
editor.keybindings.register({
  key: 'Mod+b',
  command: 'toggleBold'
});

// 여러 modifier 조합
editor.keybindings.register({
  key: 'Ctrl+Shift+z',
  command: 'redo'
});

// 특수 키
editor.keybindings.register({
  key: 'Enter',
  command: 'insertParagraph'
});
```

### 1.2 Command 등록과 연결

Keybinding은 반드시 등록된 Command와 연결되어야 합니다.

```typescript
// Command 등록
editor.registerCommand({
  name: 'toggleBold',
  execute: async (editor: Editor) => {
    // Bold 토글 로직
    const selection = editor.selection;
    // ... 실제 구현
    return true;
  },
  canExecute: (editor: Editor) => {
    // 실행 가능 여부 확인
    return editor.selection !== null;
  }
});

// Keybinding 등록 (위의 Command와 연결)
editor.keybindings.register({
  key: 'Mod+b',
  command: 'toggleBold'
});
```

### 1.3 Command에 인자 전달

Keybinding에서 Command로 인자를 전달할 수 있습니다.

```typescript
// Command 등록 (인자 받기)
editor.registerCommand({
  name: 'insertHeading',
  execute: async (editor: Editor, args?: { level: number }) => {
    const level = args?.level ?? 1;
    // Heading 삽입 로직
    return true;
  }
});

// Keybinding 등록 (인자 포함)
editor.keybindings.register({
  key: 'Mod+Alt+1',
  command: 'insertHeading',
  args: { level: 1 }
});

editor.keybindings.register({
  key: 'Mod+Alt+2',
  command: 'insertHeading',
  args: { level: 2 }
});
```

---

## 2. Extension에서 Keybinding 등록

Extension의 `onCreate` 메서드에서 keybinding을 등록합니다. `source: 'extension'`은 자동으로 설정됩니다.

### 2.1 기본 Extension 패턴

```typescript
import { Editor, Extension } from '@barocss/editor-core';

export class BoldExtension implements Extension {
  name = 'bold';
  priority = 100;

  onCreate(editor: Editor): void {
    // Command 등록
    editor.registerCommand({
      name: 'toggleBold',
      execute: async (editor: Editor) => {
        // Bold 토글 로직
        return true;
      }
    });

    // Keybinding 등록 (source는 자동으로 'extension'으로 설정됨)
    editor.keybindings.register({
      key: 'Mod+b',
      command: 'toggleBold',
      when: 'editorFocus && editorEditable'
    });
  }

  onDestroy(_editor: Editor): void {
    // 정리 작업 (필요시)
  }
}
```

### 2.2 옵션 기반 Keybinding

Extension 옵션으로 keybinding을 커스터마이징할 수 있습니다.

```typescript
export interface BoldExtensionOptions {
  keyboardShortcut?: string;
  enabled?: boolean;
}

export class BoldExtension implements Extension {
  name = 'bold';
  private _options: BoldExtensionOptions;

  constructor(options: BoldExtensionOptions = {}) {
    this._options = {
      keyboardShortcut: 'Mod+b', // 기본값
      enabled: true,
      ...options
    };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    editor.registerCommand({
      name: 'toggleBold',
      execute: async (editor: Editor) => {
        // Bold 토글 로직
        return true;
      }
    });

    // 옵션에서 받은 keyboard shortcut 사용
    if (this._options.keyboardShortcut) {
      editor.keybindings.register({
        key: this._options.keyboardShortcut,
        command: 'toggleBold',
        when: 'editorFocus && editorEditable'
      });
    }
  }
}

// 사용 예시
const editor = new Editor({
  extensions: [
    new BoldExtension({
      keyboardShortcut: 'Mod+Shift+b' // 커스텀 단축키
    })
  ]
});
```

### 2.3 여러 Keybinding 등록

하나의 Extension에서 여러 keybinding을 등록할 수 있습니다.

```typescript
export class HeadingExtension implements Extension {
  name = 'heading';

  onCreate(editor: Editor): void {
    // Command 등록
    editor.registerCommand({
      name: 'insertHeading',
      execute: async (editor: Editor, args?: { level: number }) => {
        const level = args?.level ?? 1;
        // Heading 삽입 로직
        return true;
      }
    });

    // 여러 keybinding 등록
    editor.keybindings.register({
      key: 'Mod+Alt+1',
      command: 'insertHeading',
      args: { level: 1 },
      when: 'editorFocus && editorEditable'
    });

    editor.keybindings.register({
      key: 'Mod+Alt+2',
      command: 'insertHeading',
      args: { level: 2 },
      when: 'editorFocus && editorEditable'
    });

    editor.keybindings.register({
      key: 'Mod+Alt+3',
      command: 'insertHeading',
      args: { level: 3 },
      when: 'editorFocus && editorEditable'
    });
  }
}
```

---

## 3. Context 기반 조건부 Keybinding

Context를 사용하여 특정 조건에서만 keybinding이 활성화되도록 할 수 있습니다.

### 3.1 기본 Context Key 사용

Editor가 제공하는 기본 context key를 사용합니다.

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

// Undo 가능할 때만 활성화
editor.keybindings.register({
  key: 'Mod+z',
  command: 'undo',
  when: 'historyCanUndo && editorEditable'
});

// 특정 Selection 타입일 때만 활성화
editor.keybindings.register({
  key: 'Mod+d',
  command: 'duplicateNode',
  when: 'selectionType == "node"'
});
```

### 3.2 커스텀 Context Key 설정

Extension에서 커스텀 context key를 설정하고 사용합니다.

```typescript
export class ReadOnlyExtension implements Extension {
  name = 'readOnly';

  onCreate(editor: Editor): void {
    // 커스텀 context 설정
    editor.setContext('readOnlyExtension.enabled', false);

    // Context를 사용한 keybinding
    editor.keybindings.register({
      key: 'Mod+s',
      command: 'save',
      when: '!readOnlyExtension.enabled && editorFocus'
    });

    // Read-only 모드 토글 Command
    editor.registerCommand({
      name: 'toggleReadOnly',
      execute: async (editor: Editor) => {
        const current = editor.getContext()['readOnlyExtension.enabled'] as boolean;
        editor.setContext('readOnlyExtension.enabled', !current);
        return true;
      }
    });
  }
}
```

### 3.3 동적 Context 업데이트

Context를 동적으로 업데이트하여 keybinding 활성화 상태를 변경합니다.

```typescript
export class ModeExtension implements Extension {
  name = 'mode';

  onCreate(editor: Editor): void {
    // 초기 context 설정
    editor.setContext('modeExtension.currentMode', 'edit');

    // Edit 모드에서만 활성화되는 keybinding
    editor.keybindings.register({
      key: 'Mod+e',
      command: 'editMode',
      when: 'modeExtension.currentMode == "edit"'
    });

    // Preview 모드에서만 활성화되는 keybinding
    editor.keybindings.register({
      key: 'Mod+p',
      command: 'previewMode',
      when: 'modeExtension.currentMode == "preview"'
    });

    // 모드 전환 Command
    editor.registerCommand({
      name: 'switchMode',
      execute: async (editor: Editor, args?: { mode: 'edit' | 'preview' }) => {
        const mode = args?.mode ?? 'edit';
        editor.setContext('modeExtension.currentMode', mode);
        return true;
      }
    });
  }
}
```

### 3.4 복잡한 조건 조합

여러 context key를 조합하여 복잡한 조건을 만듭니다.

```typescript
// 여러 조건을 AND로 조합
editor.keybindings.register({
  key: 'Mod+Shift+p',
  command: 'preview',
  when: 'editorFocus && !readOnlyExtension.enabled && modeExtension.currentMode == "markdown"'
});

// OR 조건 사용
editor.keybindings.register({
  key: 'Mod+k',
  command: 'showCommandPalette',
  when: 'editorFocus || commandPaletteExtension.isVisible'
});

// NOT 조건 사용
editor.keybindings.register({
  key: 'Delete',
  command: 'deleteSelection',
  when: '!selectionEmpty && selectionType == "range"'
});

// 비교 연산자 사용
editor.keybindings.register({
  key: 'Mod+Shift+e',
  command: 'editNode',
  when: 'nodeTypeExtension.isImage && !multiSelectionExtension.hasMultiple && editorFocus'
});
```

### 3.5 Context 변경 이벤트 구독

Context 변경을 감지하여 UI를 업데이트합니다.

**⚠️ 중요: 초기화 시점 이벤트 누락 문제**

`onCreate`에서 `setContext`를 호출하면 이벤트가 발생하지만, 다른 Extension의 `onCreate`가 아직 실행되지 않았을 수 있습니다. 따라서 초기 설정 시점의 이벤트를 놓칠 수 있습니다.

**해결 방법**:
1. **초기 상태 확인**: 리스너 등록 후 현재 값을 확인
2. **순서 보장**: Extension 등록 순서를 조정
3. **초기화 패턴**: 리스너 등록 후 초기 상태를 수동으로 동기화

```typescript
export class ToolbarExtension implements Extension {
  name = 'toolbar';

  onCreate(editor: Editor): void {
    // 1. 리스너 등록 (다른 Extension의 onCreate보다 먼저 실행되도록 순서 조정)
    editor.onContextChange('readOnlyExtension.enabled', ({ value }) => {
      const isReadOnly = value as boolean;
      this.updateToolbarUI(isReadOnly);
    });

    // 2. 초기 상태 확인 (이미 설정되어 있을 수 있음)
    const currentValue = editor.getContext()['readOnlyExtension.enabled'];
    if (currentValue !== undefined) {
      this.updateToolbarUI(currentValue as boolean);
    }

    // 모든 context 변경 구독
    editor.on('editor:context.change', (event) => {
      console.log('Context changed:', event.key, event.value);
      // 전체 UI 업데이트
    });
  }

  private updateToolbarUI(isReadOnly: boolean): void {
    // Toolbar 버튼 활성화/비활성화
  }
}
```

**권장 패턴**: Extension 간 의존성이 있는 경우, Extension 등록 순서를 명시적으로 관리하거나, 초기 상태를 확인하는 패턴을 사용하세요.

```typescript
export class DependentExtension implements Extension {
  name = 'dependent';
  dependencies = ['providerExtension']; // 의존성 명시

  onCreate(editor: Editor): void {
    // 리스너 등록
    editor.onContextChange('providerExtension.key', ({ value }) => {
      this.handleChange(value);
    });

    // 초기 상태 확인 (providerExtension이 이미 onCreate를 실행했을 수 있음)
    const initialValue = editor.getContext()['providerExtension.key'];
    if (initialValue !== undefined) {
      this.handleChange(initialValue);
    }
  }

  private handleChange(value: unknown): void {
    // 변경 처리
  }
}
```

---

## 4. 사용자 커스터마이징

사용자가 keybinding을 커스터마이징할 수 있도록 합니다.

### 4.1 사용자 Keybinding 등록

사용자가 직접 keybinding을 등록합니다.

```typescript
// 사용자 설정에서 가져온 keybinding
const userKeybindings = [
  {
    key: 'Mod+Shift+b',
    command: 'toggleBold'
  },
  {
    key: 'Mod+Alt+i',
    command: 'toggleItalic'
  }
];

// 사용자 keybinding 등록 (source는 자동으로 'user'로 설정됨)
userKeybindings.forEach(binding => {
  editor.keybindings.register({
    ...binding,
    source: 'user' // 명시적으로 지정 가능 (자동 설정됨)
  });
});
```

### 4.2 Keybinding 덮어쓰기

사용자가 기본 keybinding을 덮어쓸 수 있습니다.

```typescript
// Extension에서 등록된 기본 keybinding
// Mod+b → toggleBold

// 사용자가 같은 키에 다른 커맨드 등록 (우선순위가 높아서 덮어씀)
editor.keybindings.register({
  key: 'Mod+b',
  command: 'myCustomBold',
  source: 'user'
});
```

### 4.3 Keybinding 제거

특정 keybinding을 제거합니다.

```typescript
// Keybinding 제거 (unregister 메서드 사용)
editor.keybindings.unregister({
  key: 'Mod+b',
  command: 'toggleBold'
});
```

### 4.4 설정 파일에서 로드

JSON 설정 파일에서 keybinding을 로드합니다.

```typescript
// keybindings.json
const keybindingsConfig = [
  {
    "key": "Mod+b",
    "command": "toggleBold",
    "when": "editorFocus"
  },
  {
    "key": "Mod+i",
    "command": "toggleItalic",
    "when": "editorFocus && editorEditable"
  }
];

// 설정 파일에서 로드하여 등록
keybindingsConfig.forEach(binding => {
  editor.keybindings.register({
    ...binding,
    source: 'user'
  });
});
```

---

## 5. 복잡한 시나리오

실제 개발에서 자주 마주치는 복잡한 시나리오들을 다룹니다.

### 5.1 모드별 다른 Keybinding

에디터 모드에 따라 다른 keybinding을 활성화합니다.

```typescript
export class MultiModeExtension implements Extension {
  name = 'multiMode';

  onCreate(editor: Editor): void {
    // 현재 모드 context 설정
    editor.setContext('multiModeExtension.currentMode', 'normal');

    // Normal 모드 keybinding
    editor.keybindings.register({
      key: 'i',
      command: 'enterInsertMode',
      when: 'multiModeExtension.currentMode == "normal" && editorFocus'
    });

    // Insert 모드 keybinding
    editor.keybindings.register({
      key: 'Escape',
      command: 'exitInsertMode',
      when: 'multiModeExtension.currentMode == "insert" && editorFocus'
    });

    // Visual 모드 keybinding
    editor.keybindings.register({
      key: 'v',
      command: 'enterVisualMode',
      when: 'multiModeExtension.currentMode == "normal" && editorFocus'
    });
  }
}
```

### 5.2 플러그인 활성화/비활성화

플러그인 활성화 상태에 따라 keybinding을 제어합니다.

```typescript
export class PluginManagerExtension implements Extension {
  name = 'pluginManager';
  private plugins: Map<string, boolean> = new Map();

  onCreate(editor: Editor): void {
    // 플러그인 활성화 상태를 context로 관리
    this.plugins.set('spellCheck', true);
    editor.setContext('pluginManager.spellCheckEnabled', true);

    // Spell check 플러그인이 활성화되어 있을 때만 활성화
    editor.keybindings.register({
      key: 'Mod+Shift+s',
      command: 'toggleSpellCheck',
      when: 'pluginManager.spellCheckEnabled && editorFocus'
    });

    // 플러그인 토글 Command
    editor.registerCommand({
      name: 'togglePlugin',
      execute: async (editor: Editor, args?: { pluginName: string }) => {
        const pluginName = args?.pluginName;
        if (!pluginName) return false;

        const current = this.plugins.get(pluginName) ?? false;
        this.plugins.set(pluginName, !current);
        editor.setContext(`pluginManager.${pluginName}Enabled`, !current);
        return true;
      }
    });
  }
}
```

### 5.3 조건부 Command 실행

Context에 따라 Command 실행 로직을 변경합니다.

```typescript
export class ConditionalCommandExtension implements Extension {
  name = 'conditionalCommand';

  onCreate(editor: Editor): void {
    editor.registerCommand({
      name: 'smartDelete',
      execute: async (editor: Editor) => {
        const context = editor.getContext();
        const selectionType = context['selectionType'] as string;

        // Selection 타입에 따라 다른 동작
        if (selectionType === 'range') {
          return await editor.executeCommand('deleteSelection');
        } else if (selectionType === 'node') {
          return await editor.executeCommand('deleteNode');
        } else {
          return await editor.executeCommand('deleteForward');
        }
      },
      canExecute: (editor: Editor) => {
        const context = editor.getContext();
        return context['editorFocus'] === true && 
               context['editorEditable'] === true;
      }
    });

    editor.keybindings.register({
      key: 'Delete',
      command: 'smartDelete',
      when: 'editorFocus && editorEditable'
    });
  }
}
```

### 5.4 다중 Keybinding 체인

여러 keybinding을 체인으로 연결하여 복잡한 동작을 만듭니다.

```typescript
export class CommandChainExtension implements Extension {
  name = 'commandChain';

  onCreate(editor: Editor): void {
    // 첫 번째 키 입력 상태 관리
    editor.setContext('commandChain.waitingForSecondKey', false);

    // 첫 번째 키 입력
    editor.keybindings.register({
      key: 'Mod+k',
      command: 'startCommandChain',
      when: 'editorFocus && !commandChain.waitingForSecondKey'
    });

    // 두 번째 키 입력 (첫 번째 키 입력 후에만 활성화)
    editor.keybindings.register({
      key: 'b',
      command: 'applyBold',
      when: 'commandChain.waitingForSecondKey && editorFocus'
    });

    editor.keybindings.register({
      key: 'i',
      command: 'applyItalic',
      when: 'commandChain.waitingForSecondKey && editorFocus'
    });

    // Command 등록
    editor.registerCommand({
      name: 'startCommandChain',
      execute: async (editor: Editor) => {
        editor.setContext('commandChain.waitingForSecondKey', true);
        // 일정 시간 후 자동으로 해제
        setTimeout(() => {
          editor.setContext('commandChain.waitingForSecondKey', false);
        }, 1000);
        return true;
      }
    });
  }
}
```

### 5.5 Extension 간 Context 공유

여러 Extension이 context를 공유하여 협력합니다.

```typescript
// Extension A: Context 제공
export class ThemeExtension implements Extension {
  name = 'theme';

  onCreate(editor: Editor): void {
    editor.setContext('themeExtension.currentTheme', 'light');
    
    editor.registerCommand({
      name: 'toggleTheme',
      execute: async (editor: Editor) => {
        const current = editor.getContext()['themeExtension.currentTheme'] as string;
        const next = current === 'light' ? 'dark' : 'light';
        editor.setContext('themeExtension.currentTheme', next);
        return true;
      }
    });
  }
}

// Extension B: Context 사용
export class SyntaxHighlightExtension implements Extension {
  name = 'syntaxHighlight';

  onCreate(editor: Editor): void {
    // Theme Extension의 context를 사용
    editor.keybindings.register({
      key: 'Mod+Shift+t',
      command: 'toggleSyntaxHighlight',
      when: 'themeExtension.currentTheme == "dark" && editorFocus'
    });

    // Context 변경 구독
    editor.onContextChange('themeExtension.currentTheme', (theme) => {
      this.updateSyntaxHighlight(theme as string);
    });
  }

  private updateSyntaxHighlight(theme: string): void {
    // Syntax highlight 업데이트
  }
}
```

---

## 6. Best Practices

### 6.1 Context Key 네이밍

- **Extension 이름 접두사 사용**: `myExtension.keyName` 형식
- **camelCase 사용**: `showMyCommand`, `numberOfItems` 등
- **명확한 이름**: 목적이 명확하게 드러나는 이름 사용

```typescript
// ✅ 좋은 예
editor.setContext('boldExtension.enabled', true);
editor.setContext('themeExtension.currentTheme', 'dark');

// ❌ 나쁜 예
editor.setContext('enabled', true); // Extension 이름 없음
editor.setContext('THEME', 'dark'); // 대문자 사용
```

### 6.2 When Clause 최적화

- **간단한 조건 우선**: 복잡한 조건은 Command의 `canExecute`에서 처리
- **자주 사용되는 조건을 먼저 평가**: 성능 최적화

```typescript
// ✅ 좋은 예: 간단한 조건
editor.keybindings.register({
  key: 'Mod+b',
  command: 'toggleBold',
  when: 'editorFocus && editorEditable'
});

// ❌ 나쁜 예: 너무 복잡한 조건
editor.keybindings.register({
  key: 'Mod+b',
  command: 'toggleBold',
  when: 'editorFocus && editorEditable && !readOnlyExtension.enabled && modeExtension.currentMode == "edit" && !loadingStateExtension.isLoading && selectionType != "cell"'
});
```

### 6.3 Source 우선순위 활용

- **Core**: 기본 기능 (undo, redo 등)
- **Extension**: Extension 기능
- **User**: 사용자 커스터마이징

```typescript
// Core keybinding (가장 낮은 우선순위)
editor.keybindings.register({
  key: 'Mod+z',
  command: 'undo',
  source: 'core'
});

// Extension keybinding (중간 우선순위)
editor.keybindings.register({
  key: 'Mod+z',
  command: 'customUndo',
  source: 'extension'
});

// User keybinding (가장 높은 우선순위, 덮어씀)
editor.keybindings.register({
  key: 'Mod+z',
  command: 'myUndo',
  source: 'user'
});
```

### 6.4 Context 업데이트 타이밍

- **필요할 때만 업데이트**: 불필요한 context 변경은 성능에 영향
- **일괄 업데이트**: 여러 context를 한 번에 업데이트

```typescript
// ✅ 좋은 예: 필요한 경우에만 업데이트
if (oldValue !== newValue) {
  editor.setContext('myExtension.value', newValue);
}

// ✅ 좋은 예: 일괄 업데이트
editor.setContext('myExtension.value1', value1);
editor.setContext('myExtension.value2', value2);
// 두 개의 이벤트가 발생하지만, 필요시 일괄 처리 가능

// ❌ 나쁜 예: 불필요한 업데이트
editor.setContext('myExtension.value', value); // 같은 값인데도 계속 호출
```

### 6.5 Command와 Keybinding 분리

- **Command는 비즈니스 로직**: Keybinding과 독립적으로 동작 가능
- **Keybinding은 단축키 매핑**: 여러 keybinding이 같은 Command를 참조 가능

```typescript
// ✅ 좋은 예: Command와 Keybinding 분리
editor.registerCommand({
  name: 'toggleBold',
  execute: async (editor: Editor) => {
    // Bold 토글 로직
    return true;
  }
});

// 여러 keybinding이 같은 Command 참조
editor.keybindings.register({
  key: 'Mod+b',
  command: 'toggleBold'
});

editor.keybindings.register({
  key: 'Mod+Shift+b',
  command: 'toggleBold',
  when: 'someCondition'
});
```

### 6.6 에러 처리

- **Command 실행 실패 처리**: `execute` 메서드에서 적절한 에러 처리
- **canExecute로 사전 검증**: 실행 불가능한 경우 사전에 차단

```typescript
editor.registerCommand({
  name: 'deleteNode',
  execute: async (editor: Editor) => {
    try {
      // 삭제 로직
      return true;
    } catch (error) {
      console.error('Delete failed:', error);
      return false;
    }
  },
  canExecute: (editor: Editor) => {
    // 실행 가능 여부 사전 검증
    const context = editor.getContext();
    return context['editorFocus'] === true && 
           context['selectionType'] === 'node';
  }
});
```

---

## 참고 자료

- [Keyboard Shortcut Spec](./keyboard-shortcut-spec.md) - Keybinding 시스템 상세 스펙
- [Context Provider Spec](./context-provider-spec.md) - Context 시스템 상세 스펙
- [When Expression Spec](./when-expression-spec.md) - When 절 평가 스펙
- [Keybinding Defaults and Customization](./keybinding-defaults-and-customization.md) - 기본 keybinding 관리 스펙
- [VS Code Keyboard Shortcuts](https://code.visualstudio.com/docs/configure/keybindings) - VS Code 공식 문서

