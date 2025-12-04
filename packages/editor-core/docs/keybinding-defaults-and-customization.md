# Keybinding Defaults and Customization Spec

## 개요

이 문서는 에디터의 기본 keyboard shortcut 목록 관리와 사용자 커스터마이징 시스템에 대한 스펙을 정의합니다.

VS Code와 같은 IDE들은 기본 keyboard shortcut 목록을 내장하고 있으며, 사용자가 이를 커스터마이징할 수 있습니다. 우리도 동일한 패턴을 따르되, `editor-core`는 에디터 내부 상태에만 집중하고, 외부 설정은 호스트 애플리케이션이 담당합니다.

---

## 1. Keybinding 소스 레벨

### 1.1 소스 우선순위

Keybinding은 다음 3가지 소스 레벨로 구분됩니다:

1. **`core`**: 에디터 코어 기본 바인딩 (내장)
2. **`extension`**: Extension에서 등록하는 바인딩
3. **`user`**: 사용자/호스트 애플리케이션에서 설정하는 커스텀 바인딩

**우선순위**: `user` > `extension` > `core`

### 1.2 소스별 특징

#### Core (`source: 'core'`)
- **목적**: 에디터의 기본 동작을 정의
- **예시**: Enter, Backspace, Delete, Arrow 키 등
- **관리**: `editor-core` 내부에서 관리
- **변경 불가**: 사용자가 직접 변경할 수 없음 (하지만 `user` 레벨에서 override 가능)

#### Extension (`source: 'extension'`)
- **목적**: Extension이 제공하는 기능의 단축키
- **예시**: Bold (`Mod+b`), Italic (`Mod+i`), Heading 등
- **관리**: 각 Extension의 `onCreate`에서 등록
- **변경 가능**: `user` 레벨에서 override 가능

#### User (`source: 'user'`)
- **목적**: 사용자 또는 호스트 애플리케이션이 설정하는 커스텀 바인딩
- **예시**: 사용자가 `Ctrl+d`를 다른 커맨드로 재매핑
- **관리**: 호스트 애플리케이션이 관리 (JSON 파일, 설정 UI 등)
- **최우선**: 다른 모든 소스를 override

---

## 2. 기본 Keybinding 목록 관리

### 2.1 기본 목록 정의 위치

기본 keybinding 목록은 `@barocss/editor-core` 패키지 내부에 정의됩니다.

**제안 구조**:
```
packages/editor-core/
  src/
    keybinding/
      default-keybindings.ts    # 기본 keybinding 목록
      index.ts
```

### 2.2 기본 Keybinding 목록 예시

```typescript
// packages/editor-core/src/keybinding/default-keybindings.ts

import type { Keybinding } from './types';

/**
 * 에디터 코어 기본 keyboard shortcut 목록
 * 
 * 이 목록은 에디터의 기본 동작을 정의하며,
 * 사용자가 user 레벨에서 override할 수 있습니다.
 */
export const DEFAULT_KEYBINDINGS: Keybinding[] = [
  // 기본 편집
  {
    key: 'Enter',
    command: 'insertParagraph',
    when: 'editorFocus && editorEditable',
    source: 'core'
  },
  {
    key: 'Backspace',
    command: 'backspace',
    when: 'editorFocus && editorEditable',
    source: 'core'
  },
  {
    key: 'Delete',
    command: 'deleteForward',
    when: 'editorFocus && editorEditable',
    source: 'core'
  },
  
  // 커서 이동
  {
    key: 'ArrowLeft',
    command: 'moveCursorLeft',
    when: 'editorFocus',
    source: 'core'
  },
  {
    key: 'ArrowRight',
    command: 'moveCursorRight',
    when: 'editorFocus',
    source: 'core'
  },
  
  // 히스토리
  {
    key: 'Mod+z',
    command: 'historyUndo',
    when: 'editorFocus && historyCanUndo',
    source: 'core'
  },
  {
    key: 'Mod+Shift+z',
    command: 'historyRedo',
    when: 'editorFocus && historyCanRedo',
    source: 'core'
  },
  {
    key: 'Mod+y',
    command: 'historyRedo',
    when: 'editorFocus && historyCanRedo',
    source: 'core'
  }
];
```

### 2.3 기본 목록 등록 시점

기본 keybinding 목록은 `Editor` 생성 시 자동으로 등록됩니다:

```typescript
// packages/editor-core/src/editor.ts

import { DEFAULT_KEYBINDINGS } from './keybinding/default-keybindings';

export class Editor {
  constructor(options: EditorOptions = {}) {
    // ... 기존 초기화 코드 ...
    
    // 기본 keybinding 등록
    this._registerDefaultKeybindings();
    
    // Extension 등록 (Extension keybinding은 이후에 등록됨)
    if (options.extensions) {
      options.extensions.forEach(ext => this.use(ext));
    }
    
    // 사용자 keybinding 등록 (호스트 애플리케이션에서 주입)
    if (options.userKeybindings) {
      options.userKeybindings.forEach(binding => {
        this.keybindings.register({
          ...binding,
          source: 'user'
        });
      });
    }
  }
  
  private _registerDefaultKeybindings(): void {
    DEFAULT_KEYBINDINGS.forEach(binding => {
      this.keybindings.register(binding);
    });
  }
}
```

---

## 3. Extension Keybinding 등록

### 3.1 Extension에서 Keybinding 등록

각 Extension은 `onCreate`에서 자신의 keybinding을 등록합니다:

```typescript
// packages/extensions/src/bold.ts

export class BoldExtension implements Extension {
  onCreate(editor: Editor): void {
    // Command 등록
    editor.registerCommand({
      name: 'toggleBold',
      execute: async (editor) => {
        // Bold 토글 로직
        return true;
      }
    });
    
    // Keybinding 등록
    editor.keybindings.register({
      key: 'Mod+b',
      command: 'toggleBold',
      when: 'editorFocus && editorEditable',
      source: 'extension'
    });
  }
}
```

### 3.2 Extension Keybinding 등록 순서

Extension keybinding은 Extension이 등록되는 순서대로 추가됩니다:

1. `Editor` 생성 시 `DEFAULT_KEYBINDINGS` 등록 (`core`)
2. Extension 등록 순서대로 keybinding 등록 (`extension`)
3. 사용자 keybinding 등록 (`user`)

**중요**: 같은 `source` 내에서는 나중에 등록된 것이 우선순위가 높습니다.

---

## 4. 사용자 커스터마이징

### 4.1 사용자 Keybinding 설정 방법

사용자 keybinding은 호스트 애플리케이션이 관리합니다:

#### 방법 1: Editor 생성 시 주입

```typescript
// 호스트 애플리케이션
const editor = new Editor({
  extensions: [...],
  userKeybindings: [
    {
      key: 'Ctrl+d',
      command: 'deleteSelection',
      when: 'editorFocus && !selectionEmpty'
    },
    {
      key: 'Mod+b',
      command: 'myCustomBoldCommand',  // Extension의 Mod+b를 override
      when: 'editorFocus && editorEditable'
    }
  ]
});
```

#### 방법 2: 런타임에 등록

```typescript
// 호스트 애플리케이션
// setCurrentSource를 호출하지 않으면 자동으로 'user'가 기본값
editor.keybindings.register({
  key: 'Ctrl+d',
  command: 'deleteSelection',
  when: 'editorFocus && !selectionEmpty'
  // source는 자동으로 'user' (기본값)
});

// 또는 명시적으로 setCurrentSource 호출 가능
editor.keybindings.setCurrentSource('user');
editor.keybindings.register({
  key: 'Ctrl+k',
  command: 'myCommand'
});
editor.keybindings.setCurrentSource(null);
```

#### 방법 3: JSON 파일에서 로드 (호스트 애플리케이션 책임)

```typescript
// 호스트 애플리케이션
import keybindingsJson from './user-keybindings.json';

// source를 지정하지 않으면 자동으로 'user'가 기본값
keybindingsJson.forEach(binding => {
  editor.keybindings.register(binding);
  // source는 자동으로 'user'
});
```

**JSON 파일 예시** (`user-keybindings.json`):
```json
[
  {
    "key": "Ctrl+d",
    "command": "deleteSelection",
    "when": "editorFocus && !selectionEmpty"
  },
  {
    "key": "Mod+b",
    "command": "myCustomBoldCommand",
    "when": "editorFocus && editorEditable"
  }
]
```

### 4.2 사용자 Keybinding 관리 API

호스트 애플리케이션은 다음 API를 사용하여 사용자 keybinding을 관리할 수 있습니다:

```typescript
// 모든 user keybinding 제거
editor.keybindings.clear('user');

// 특정 user keybinding 제거
editor.keybindings.unregister({
  key: 'Ctrl+d',
  source: 'user'
});

// 새로운 user keybinding 추가
editor.keybindings.register({
  key: 'Ctrl+k',
  command: 'myCommand',
  source: 'user'
});
```

---

## 5. Keybinding 소스 자동 결정 및 충돌 처리

### 5.1 소스 자동 결정 문제

**문제점**: 현재 `register()` 메서드에서 `source`를 임의로 지정할 수 있어, Extension이 `source: 'user'`로 등록하면 우선순위를 부당하게 높일 수 있습니다.

```typescript
// 문제: Extension이 source를 조작할 수 있음
editor.keybindings.register({
  key: 'Mod+b',
  command: 'myBold',
  source: 'user'  // ❌ Extension이 user로 등록하면 다른 Extension보다 우선됨
});
```

### 5.2 해결 방안: 등록 컨텍스트 자동 감지 (VS Code 스타일)

VS Code는 별도 메서드를 제공하지 않고, **등록 컨텍스트에 따라 자동으로 source를 결정**합니다. 우리도 동일한 방식을 따릅니다.

#### 구현 방식

`Editor`와 `KeybindingRegistry`가 협력하여 등록 시점의 컨텍스트를 자동으로 감지합니다:

**규칙**:
1. **Core keybinding 등록 시**: `setCurrentSource('core')` 자동 호출
2. **Extension의 `onCreate` 실행 전**: `setCurrentSource('extension')` 자동 호출
3. **그 외 (명시적으로 `setCurrentSource()` 호출하지 않으면)**: `user`가 기본값

```typescript
// Editor 클래스
export class Editor {
  private _keybindingRegistry: KeybindingRegistry;

  constructor(options: EditorOptions = {}) {
    // ... 기존 초기화 코드 ...
    
    // Core keybinding 등록 (자동으로 source: 'core')
    this._registerDefaultKeybindings();
    
    // Extension 등록 (자동으로 source: 'extension')
    if (options.extensions) {
      options.extensions.forEach(ext => this.use(ext));
    }
  }

  use(extension: Extension): void {
    // Extension 등록 전에 현재 소스를 'extension'으로 설정
    this._keybindingRegistry.setCurrentSource('extension');
    
    extension.onCreate?.(this);
    
    // Extension 등록 후 소스 초기화
    this._keybindingRegistry.setCurrentSource(null);
  }
  
  private _registerDefaultKeybindings(): void {
    // Core keybinding 등록 시 자동으로 'core'로 설정
    this._keybindingRegistry.setCurrentSource('core');
    DEFAULT_KEYBINDINGS.forEach(binding => {
      this.keybindings.register(binding);
    });
    this._keybindingRegistry.setCurrentSource(null);
  }
}

// KeybindingRegistry 클래스
export class KeybindingRegistryImpl {
  private _currentSource: KeybindingSource | null = null;
  
  setCurrentSource(source: KeybindingSource | null): void {
    this._currentSource = source;
  }
  
  register(binding: Keybinding): void {
    // source 결정 우선순위:
    // 1. 현재 컨텍스트 (setCurrentSource로 설정된 값)
    // 2. 명시적으로 지정된 source
    // 3. 기본값: 'user' (명시적으로 setCurrentSource를 호출하지 않은 경우)
    const source = this._currentSource ?? binding.source ?? 'user';
    
    const enriched: InternalBinding = {
      ...binding,
      source,
      id: this._nextId++
    };
    this._bindings.push(enriched);
  }
}
```

#### 사용 예시

```typescript
// Extension에서 (onCreate 내부)
export class BoldExtension implements Extension {
  onCreate(editor: Editor): void {
    // source를 지정하지 않아도 자동으로 'extension'
    // (Editor.use()에서 이미 setCurrentSource('extension') 호출됨)
    editor.keybindings.register({
      key: 'Mod+b',
      command: 'toggleBold',
      when: 'editorFocus && editorEditable'
      // source는 자동으로 'extension'
    });
  }
}

// 호스트 애플리케이션에서 (Editor 생성 후)
const editor = new Editor({ ... });

// User keybinding 등록 시
// setCurrentSource('user')를 호출하지 않으면 자동으로 'user'
editor.keybindings.register({
  key: 'Ctrl+d',
  command: 'deleteSelection',
  when: 'editorFocus && !selectionEmpty'
  // source는 자동으로 'user' (기본값)
});

// 또는 명시적으로 setCurrentSource 호출 가능
editor.keybindings.setCurrentSource('user');
editor.keybindings.register({
  key: 'Ctrl+k',
  command: 'myCommand'
});
editor.keybindings.setCurrentSource(null);
```

#### 보안 고려사항

Extension이 `source: 'user'`를 명시적으로 지정하려고 시도할 수 있습니다:

```typescript
// Extension에서 악의적으로 시도
editor.keybindings.register({
  key: 'Mod+b',
  command: 'myBold',
  source: 'user'  // ❌ 우선순위를 높이려는 시도
});
```

**해결책**: `register()` 메서드에서 현재 컨텍스트가 있을 때는 명시적 `source` 지정을 무시:

```typescript
register(binding: Keybinding): void {
  // 현재 컨텍스트가 있으면 무조건 그것을 사용 (명시적 source 무시)
  // Extension 등록 중이면 무조건 'extension'
  // Core 등록 중이면 무조건 'core'
  const source = this._currentSource ?? binding.source ?? 'user';
  
  // Extension 등록 중인데 source가 'user'로 지정된 경우 경고
  if (this._currentSource === 'extension' && binding.source === 'user') {
    console.warn(`[KeybindingRegistry] Extension은 source를 'user'로 지정할 수 없습니다. 'extension'으로 설정됩니다.`);
  }
  
  const enriched: InternalBinding = {
    ...binding,
    source: this._currentSource ?? 'user',  // 현재 컨텍스트 우선
    id: this._nextId++
  };
  this._bindings.push(enriched);
}
```

### 5.3 Extension 간 Keybinding 충돌

같은 `key`에 대해 여러 Extension이 등록하면 충돌이 발생할 수 있습니다:

```typescript
// Extension A (onCreate 내부)
export class BoldExtension implements Extension {
  onCreate(editor: Editor): void {
    editor.keybindings.register({
      key: 'Mod+b',
      command: 'toggleBold'
      // source는 자동으로 'extension'
    });
  }
}

// Extension B (나중에 등록, onCreate 내부)
export class BoldItalicExtension implements Extension {
  onCreate(editor: Editor): void {
    editor.keybindings.register({
      key: 'Mod+b',
      command: 'toggleBoldItalic'  // Extension A의 Mod+b를 override
      // source는 자동으로 'extension'
    });
  }
}
```

**충돌 처리 규칙**:
1. **같은 소스 내에서는 나중에 등록된 것이 우선** (이미 구현됨)
2. Extension 간 충돌은 **의도적인 override**로 간주
3. 충돌 감지 및 경고는 선택 사항 (호스트 애플리케이션에서 처리 가능)

**충돌 감지 API (선택 사항)**:
```typescript
interface KeybindingRegistry {
  // 충돌 감지
  detectConflicts(key?: string): Array<{
    key: string;
    bindings: Keybinding[];
    conflicts: Array<{ binding1: Keybinding; binding2: Keybinding }>;
  }>;
  
  // 특정 key의 모든 binding 조회
  getKeybindings(key?: string): Keybinding[];
}
```

### 5.4 User Keybinding으로 Extension Override

사용자는 Extension keybinding을 override할 수 있습니다:

```typescript
// Extension이 등록한 keybinding (onCreate 내부)
editor.keybindings.register({
  key: 'Mod+b',
  command: 'toggleBold'
  // source는 자동으로 'extension'
});

// User가 override (호스트 애플리케이션에서)
editor.keybindings.setCurrentSource('user');
editor.keybindings.register({
  key: 'Mod+b',
  command: 'myCustomBold'  // Extension의 Mod+b를 override
  // source는 자동으로 'user'
});
editor.keybindings.setCurrentSource(null);

// resolve('Mod+b') → [{ command: 'myCustomBold', ... }] (user가 우선)
```

---

## 6. Keybinding 해석 우선순위

### 6.1 Resolve 알고리즘

`keybindings.resolve(key)`는 다음 순서로 keybinding을 찾습니다:

1. **key 매칭**: 주어진 `key`와 일치하는 모든 keybinding 후보를 찾습니다.
2. **when 평가**: 각 후보의 `when` 절을 현재 context로 평가합니다.
3. **소스 우선순위 정렬**:
   - `user` > `extension` > `core`
   - 같은 소스 내에서는 나중에 등록된 것이 우선 (id 기준)
4. **결과 반환**: 우선순위 순으로 정렬된 커맨드 배열을 반환합니다.

### 6.2 우선순위 예시

다음과 같은 keybinding이 등록되어 있다고 가정:

```typescript
// 1. Core (가장 먼저 등록)
{ key: 'Mod+b', command: 'coreBold', source: 'core' }

// 2. Extension (두 번째 등록)
{ key: 'Mod+b', command: 'toggleBold', source: 'extension' }

// 3. User (마지막 등록)
{ key: 'Mod+b', command: 'myCustomBold', source: 'user' }
```

`Mod+b` 키를 누르면:
- `resolve('Mod+b')` → `[{ command: 'myCustomBold', ... }]` (user가 최우선)
- `editor-view-dom`은 첫 번째 커맨드(`myCustomBold`)를 실행합니다.

### 6.3 when 절에 따른 필터링

같은 `key`에 대해 여러 keybinding이 있을 때, `when` 절이 `false`인 것은 제외됩니다:

```typescript
// 등록된 keybinding
{ key: 'Mod+z', command: 'undo1', when: 'editorFocus', source: 'core' }
{ key: 'Mod+z', command: 'undo2', when: 'editorFocus && historyCanUndo', source: 'user' }

// Context: { editorFocus: true, historyCanUndo: false }
resolve('Mod+z') → [{ command: 'undo1', ... }]  // undo2는 when이 false이므로 제외

// Context: { editorFocus: true, historyCanUndo: true }
resolve('Mod+z') → [{ command: 'undo2', ... }]  // user가 우선순위가 높음
```

---

## 7. Keybinding Profile (향후 확장)

### 7.1 Profile 개념

VS Code처럼 여러 keybinding profile을 지원할 수 있습니다:

- **Default**: 기본 keybinding
- **Vim**: Vim 스타일 keybinding
- **Emacs**: Emacs 스타일 keybinding
- **Custom**: 사용자 정의 profile

### 7.2 Profile 구현 방향

Profile은 기본 keybinding 목록을 대체하는 방식으로 구현할 수 있습니다:

```typescript
// packages/editor-core/src/keybinding/profiles.ts

export const KEYBINDING_PROFILES = {
  default: DEFAULT_KEYBINDINGS,
  vim: VIM_KEYBINDINGS,
  emacs: EMACS_KEYBINDINGS
};

// Editor 생성 시
const editor = new Editor({
  keybindingProfile: 'vim',  // 또는 'default', 'emacs', 'custom'
  userKeybindings: [...]     // profile 위에 추가로 적용
});
```

**구현 시점**: 현재는 기본 keybinding 목록 관리에 집중하고, profile 기능은 향후 확장으로 고려합니다.

---

## 8. 구현 계획

### 8.1 Phase 1: 등록 컨텍스트 자동 감지 구현

1. `KeybindingRegistry`에 `setCurrentSource()` 메서드 추가
2. `Editor.use()` 메서드에서 Extension 등록 시 `setCurrentSource('extension')` 호출
3. `Editor._registerDefaultKeybindings()`에서 Core 등록 시 `setCurrentSource('core')` 호출
4. `KeybindingRegistry.register()`에서 현재 컨텍스트 우선 사용 (명시적 source 무시 또는 경고)
5. 테스트 코드 업데이트

### 8.2 Phase 2: 기본 Keybinding 목록 정의

1. `packages/editor-core/src/keybinding/default-keybindings.ts` 생성
2. 기본 keybinding 목록 정의 (Enter, Backspace, Delete, Arrow 키 등)
3. `Editor` 생성 시 `setCurrentSource('core')` 후 `register()`로 자동 등록

### 8.3 Phase 3: Extension Keybinding 등록

1. 각 Extension의 `onCreate`에서 `register()` 사용 (source 자동 결정)
2. `ParagraphExtension`, `DeleteExtension`, `MoveSelectionExtension` 등에 keybinding 추가
3. Extension 간 충돌 처리 문서화

### 8.4 Phase 4: 사용자 Keybinding 지원

1. `EditorOptions`에 `userKeybindings` 옵션 추가
2. 호스트 애플리케이션에서 `setCurrentSource('user')` 후 `register()` 사용
3. JSON 파일 로드 기능 (호스트 애플리케이션 책임)

### 8.5 Phase 5: Keybinding 관리 및 충돌 감지 API

1. `keybindings.clear('user')` 등 관리 API 완성
2. Keybinding 조회 API (`getKeybindings(key?: string)` 등)
3. Keybinding 충돌 감지 API (`detectConflicts()` 등, 선택 사항)

---

## 9. 관련 문서

- [Keyboard Shortcut Spec](./keyboard-shortcut-spec.md) - Keybinding 시스템 전체 스펙
- [When Expression Spec](./when-expression-spec.md) - `when` 절 평가 스펙
- [Context Provider Spec](./context-provider-spec.md) - Context 관리 스펙

---

## 10. VS Code와의 비교

### 유사점
- 소스 레벨 구분 (`core`, `extension`, `user`)
- 우선순위 체계 (`user` > `extension` > `core`)
- `when` 절을 통한 조건부 활성화
- **등록 컨텍스트 자동 감지**: VS Code처럼 별도 메서드를 제공하지 않고, 등록 시점의 컨텍스트에 따라 자동으로 source를 결정합니다.

### 차이점
- **JSON 파일 파싱**: VS Code는 `keybindings.json` 파일을 직접 파싱하지만, 우리는 호스트 애플리케이션이 JSON을 파싱하고 `register()`로 등록하는 방식을 사용합니다.
- **Profile**: VS Code는 기본적으로 여러 profile을 제공하지만, 우리는 현재 기본 keybinding 목록에만 집중합니다.
- **설정 UI**: VS Code는 설정 UI를 제공하지만, 우리는 `editor-core`에서 설정 UI를 제공하지 않습니다 (호스트 애플리케이션 책임).
- **API 노출**: VS Code는 Extension API를 통해 keybinding을 등록하지만, 우리는 `setCurrentSource()` + `register()` 방식을 사용합니다.

---

## 11. 예시: 전체 흐름

```typescript
// 1. Editor 생성
const editor = new Editor({
  extensions: [
    new ParagraphExtension(),
    new DeleteExtension(),
    new BoldExtension()
  ]
});

// Editor 내부에서:
// - Core keybinding 등록: setCurrentSource('core') → register(...) → setCurrentSource(null)
// - Extension 등록: use() → setCurrentSource('extension') → onCreate() → register(...) → setCurrentSource(null)

// 2. User keybinding 등록 (호스트 애플리케이션에서)
editor.keybindings.setCurrentSource('user');
editor.keybindings.register({
  key: 'Ctrl+d',
  command: 'deleteSelection',
  when: 'editorFocus && !selectionEmpty'
  // source는 자동으로 'user'
});
editor.keybindings.setCurrentSource(null);

// 3. 등록된 keybinding 순서
// - Core: Enter, Backspace, Delete, ArrowLeft, ArrowRight, Mod+z, ...
// - Extension: Mod+b (BoldExtension), insertParagraph (ParagraphExtension), ...
// - User: Ctrl+d

// 4. 사용자가 Mod+b를 누름
// - resolve('Mod+b') → [{ command: 'toggleBold', ... }] (Extension)
// - executeCommand('toggleBold')

// 5. 사용자가 Ctrl+d를 누름
// - resolve('Ctrl+d') → [{ command: 'deleteSelection', ... }] (User)
// - executeCommand('deleteSelection')

// 6. 사용자가 Mod+b를 override
// setCurrentSource를 호출하지 않으면 자동으로 'user'가 기본값
editor.keybindings.register({
  key: 'Mod+b',
  command: 'myCustomBold'
  // source는 자동으로 'user' (기본값)
});

// 7. 다시 Mod+b를 누름
// - resolve('Mod+b') → [{ command: 'myCustomBold', ... }] (User가 우선)
// - executeCommand('myCustomBold')
```

