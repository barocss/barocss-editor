## Keyboard Shortcut / Keybinding Spec (`@barocss/editor-core`)

### 1. 목적

- **키 입력 → 커맨드 실행**을 `editor-core`에서 일관되게 처리하기 위한 스펙.
- 플랫폼/호스트(UI, 프레임워크)에 의존하지 않고, **문자열 기반 키바인딩**과 **조건식(`when` clause)**으로 동작을 정의한다.
- `editor-view-dom` 등의 뷰 레이어는 **키 이벤트를 정규화해서 core로 넘기고**, core는 **현재 컨텍스트에 맞는 커맨드를 찾아 실행**한다.
- 설계는 VS Code 키바인딩 시스템을 참고하되 [`key`, `command`, `when`, `args`]의 최소 집합에 집중한다.  
  참고: [VS Code Keyboard Shortcuts 문서](https://code.visualstudio.com/docs/configure/keybindings)

---

### 2. 용어 정의

- **Keybinding**: 특정 키 조합과 조건에서 실행할 커맨드 정의 1건.
- **Keybinding Rule**: `key`, `command`, `when`, `args`, `source` 등을 포함하는 내부 표현.
- **Context Key**: 현재 에디터/선택/포커스 상태를 나타내는 불리언 또는 문자열 값. `when` 식에서 참/거짓 평가에 사용된다.

---

### 3. Keybinding 포맷

#### 3.1 문자열 포맷

- **Modifier**: `Ctrl`, `Cmd`, `Alt`, `Shift`
- **키 이름**:  
  - 알파벳/숫자: `A`–`Z`, `0`–`9` (`Ctrl+b`, `Cmd+Z` 등)  
  - 특수키: `Enter`, `Escape`, `Backspace`, `Delete`, `Tab`, `Space`, `ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`, `Home`, `End`, `PageUp`, `PageDown` 등
- **조합 규칙**:
  - `Ctrl+b`, `Cmd+Shift+z`, `Alt+ArrowLeft`, `Shift+Enter` 와 같이 **`+`로 결합**된 하나의 문자열.
  - **주의**: `-`가 아닌 `+`를 사용합니다 (VS Code와 동일한 포맷).
  - 플랫폼 중립적으로 **논리적 수정자(Mod)**만 사용 (`Mod` 자체는 문자열로 사용하지 않고, 실제 등록 시 `Ctrl`/`Cmd`로 구분).
- **대소문자 처리**:
  - **대소문자 구분하지 않음**: 등록 시와 resolve 시 모두 자동으로 정규화됩니다.
  - **Modifier**: 첫 글자만 대문자로 정규화 (`Ctrl`, `Cmd`, `Alt`, `Shift`, `Mod`)
    - 예: `ctrl+b`, `CTRL+B`, `Ctrl+b` → 모두 `Ctrl+b`로 정규화
  - **키 이름**: 알파벳 키는 소문자로 정규화, 특수 키는 그대로 유지
    - 예: `Ctrl+B`, `Ctrl+b` → 모두 `Ctrl+b`로 정규화
    - 예: `Enter`, `Escape` → 그대로 유지
  - **등록 시**: `register()` 호출 시 자동으로 정규화되어 저장됩니다.
  - **resolve 시**: 입력 키 문자열도 자동으로 정규화되어 매칭됩니다.

#### 3.2 Keybinding 구조

```ts
interface Keybinding {
  key: string;              // 예: "Mod+b", "Ctrl+Shift+z", "Enter"
  command: string;          // 예: "toggleBold", "insertParagraph"
  args?: unknown;           // 커맨드 payload (선택)
  when?: string;            // 컨텍스트 조건식 (선택)
  source?: 'core' | 'extension' | 'user'; // 우선순위 구분용 태그
}
```

- **`key`**: 정규화된 키 문자열.  
- **`command`**: `editor.executeCommand(name)`에 사용되는 커맨드 이름과 정확히 일치해야 한다.
- **`when`**:
  - 빈 값이면 항상 활성.
  - 문자열 표현식으로 context key를 조합:
    - 연산자: `==`, `!=`, `&&`, `||`, `!`, `=~` (정규식 매칭)
    - 예: `"editorFocus && selectionType == 'range'"`, `"isEditable && !readOnly"`

---

### 4. Context / `when` clause 시스템

> **참고**: ContextProvider에 대한 자세한 내용은 [Context Provider 스펙](./context-provider-spec.md) 문서를 참고하세요.

#### 4.1 Context Key 예시 (초기 셋)

`editor-core`는 selection, 상태 등을 기반으로 다음과 같은 context key를 제공한다.

- **에디터 상태**
  - `editorFocus: boolean`
  - `editorEditable: boolean`
  - `historyCanUndo: boolean`
  - `historyCanRedo: boolean`
- **선택 상태**
  - `selectionEmpty: boolean`
  - `selectionType: 'range' | 'node' | 'multi-node' | 'cell' | 'table'`
  - `selectionDirection: 'forward' | 'backward'`
- **문서 구조**
  - `cursorInText: boolean` (현재 selection이 텍스트 노드 내부인지)
  - `cursorInEditableBlock: boolean`
  - `cursorBeforeBlockBoundary: boolean`
  - `cursorAfterBlockBoundary: boolean`

위 key들은 `Editor` 내부에서 자동으로 관리되며, 상태 변경 시 자동으로 업데이트됩니다.

#### 4.2 Context 관리 시스템

`Editor`는 VS Code 스타일의 context 관리 시스템을 제공합니다:

```typescript
// Context 설정 방법 1: 직접 메서드 호출
editor.setContext('myExtension.showMyCommand', true);

// Context 설정 방법 2: Command 사용 (VS Code 스타일)
await editor.executeCommand('setContext', { key: 'myExtension.showMyCommand', value: true });

// Context 조회
const context = editor.getContext();
// { editorFocus: true, editorEditable: true, selectionEmpty: false, ... }
```

**자동 관리되는 Context Key**:
- `editorFocus`: Editor 포커스 상태 (자동 업데이트)
- `editorEditable`: Editor 편집 가능 여부 (자동 업데이트)
- `selectionEmpty`: Selection이 비어있는지 (자동 업데이트)
- `selectionType`: Selection 타입 (자동 업데이트)
- `selectionDirection`: Selection 방향 (자동 업데이트)
- `historyCanUndo`: Undo 가능 여부 (자동 업데이트)
- `historyCanRedo`: Redo 가능 여부 (자동 업데이트)

**커스텀 Context Key**:
Extension이나 호스트 애플리케이션에서 `editor.setContext(key, value)` 또는 `editor.executeCommand('setContext', { key, value })`로 추가할 수 있습니다.

**Context 변경 이벤트**:
Context가 변경되면 두 가지 방식으로 이벤트가 발생합니다:

1. **모든 context 변경 구독**:
```typescript
editor.on('editor:context.change', ({ key, value, oldValue }) => {
  // 모든 context 변경을 구독
  console.log(`Context ${key} changed:`, value);
});
```

2. **특정 key만 구독** (권장):
```typescript
// 방법 1: 특정 key 이벤트 직접 구독
editor.on('editor:context.change:myExtension.showMyCommand', ({ value, oldValue }) => {
  // myExtension.showMyCommand만 구독
  console.log('showMyCommand changed:', value);
});

// 방법 2: 편의 메서드 사용 (권장)
const unsubscribe = editor.onContextChange('myExtension.showMyCommand', ({ value, oldValue }) => {
  console.log('showMyCommand changed:', value);
});

// 필요시 구독 해제
unsubscribe();
```

특정 key만 구독하면 불필요한 이벤트 처리를 줄일 수 있어 성능상 이점이 있습니다.

#### 4.3 `when` 평가

- `when`은 문자열 식으로, context key를 이용해 불리언으로 평가됩니다.
- 평가 규칙:
  - 정의되지 않은 key는 `false` 또는 빈 문자열로 간주.
  - `"editorFocus && editorEditable"` 처럼 단순 논리식 위주로 사용.
- `when`이 `undefined` 또는 빈 문자열이면 항상 `true`로 간주.
- Context는 `Editor` 내부에서 자동으로 관리되므로, `resolve` 호출 시 context를 수동으로 전달할 필요가 없습니다.

---

### 5. 아키텍처: `editor-core` 기준

#### 5.1 Keybinding Registry (제안)

`@barocss/editor-core`에 중앙 레지스트리 컴포넌트를 둔다.

```ts
interface KeybindingRegistry {
  register(binding: Keybinding): void;
  unregister(binding: Keybinding): void;
  clear(source?: 'core' | 'extension' | 'user'): void;

  // 주어진 키 입력에 대해 실행할 커맨드 목록을 찾는다.
  // context는 optional이며, 제공되지 않으면 Editor의 context를 자동으로 사용한다.
  resolve(
    key: string,
    context?: Record<string, unknown>
  ): Array<{ command: string; args?: unknown }>;
  
  // Context provider 설정 (Editor가 자동으로 설정함)
  setContextProvider(provider: ContextProvider | null): void;
}
```

- **등록 레벨**
  - `source: 'core'`  : 에디터 코어 기본 바인딩 (예: Enter, Backspace, Delete, Arrow 키 등).
  - `source: 'extension'`: 개별 확장(예: Bold, Italic, Paragraph 등)에서 등록.
  - `source: 'user'` : 호스트 애플리케이션에서 주입하는 사용자 설정(IDE, 앱 레벨).

#### 5.2 우선순위 규칙

1. **key + when 이 동시에 일치하는 모든 룰** 후보를 찾는다.
   - 키 문자열은 **대소문자 구분 없이** 매칭됩니다.
   - 등록 시와 resolve 시 모두 자동으로 정규화되어 비교됩니다.
   - 예: `Mod+b`로 등록 → `Ctrl+B`, `CMD+b`, `mod+B` 등으로 resolve해도 매칭됩니다.
2. `source` 우선순위:
   - `user` > `extension` > `core`
3. 같은 `source` 내에서는 **나중에 등록된 룰이 앞선다** (override).
4. `resolve` 결과는 우선순위 순으로 정렬된 커맨드 배열이다.
   - 단일 실행 모델을 유지하려면, 첫 번째 1건만 사용한다.

---

### 6. `Editor`와의 통합

#### 6.1 Editor API 확장 (실제 구현)

```ts
interface Editor {
  readonly keybindings: KeybindingRegistry;
}
```

- `Editor` 인스턴스가 `keybindings` 프로퍼티를 제공한다.
- 확장(Extension)과 호스트는 `editor.keybindings.register(...)`로 shortcut을 선언한다.

#### 6.2 실행 흐름

1. 뷰 레이어(예: `editor-view-dom`)가 브라우저 `KeyboardEvent`를 받는다.
2. 키+수정자를 문자열로 정규화:
   - 예: `Cmd+b`, `Ctrl+Shift+z`, `Enter`, `Backspace`, `ArrowLeft`
3. `editor.keybindings.resolve(normalizedKey)` 호출.
   - Context는 `Editor` 내부에서 자동으로 관리되므로 수동으로 전달할 필요가 없습니다.
   - 필요시 `resolve(normalizedKey, customContext)`로 커스텀 context를 override할 수 있습니다.
4. 반환된 첫 번째 커맨드를 기준으로 `editor.executeCommand(command, args)` 실행.

뷰 레이어는 **키 조합 정규화 + 기본 브라우저 동작 취소 여부 결정**만 담당하고, 어떤 커맨드가 실행될지는 전적으로 `editor-core`의 키바인딩 해석에 위임합니다.

---

### 7. Core / Extension / User 레벨 예시

#### 7.1 Core 기본 바인딩 예시

```ts
// core-internal default keybindings
const coreDefaults: Keybinding[] = [
  { key: 'Enter', command: 'insertParagraph', when: 'editorFocus && editorEditable' },
  { key: 'Backspace', command: 'backspace', when: 'editorFocus && editorEditable' },
  { key: 'Delete', command: 'deleteForward', when: 'editorFocus && editorEditable' },
  { key: 'ArrowLeft', command: 'moveCursorLeft', when: 'editorFocus' },
  { key: 'ArrowRight', command: 'moveCursorRight', when: 'editorFocus' }
];
```

#### 7.2 Extension 레벨 바인딩 예시

```ts
// BoldExtension 내부 onCreate
editor.keybindings.register({
  key: 'Mod+b',
  command: 'toggleBold',
  when: 'editorFocus && editorEditable',
  source: 'extension'
});

// Extension에서 커스텀 context 설정
editor.setContext('myExtension.showMyCommand', true);

// 커스텀 context를 사용한 keybinding
editor.keybindings.register({
  key: 'Ctrl+Shift+m',
  command: 'myCustomCommand',
  when: 'myExtension.showMyCommand && editorFocus',
  source: 'extension'
});
```

#### 7.3 User 레벨 바인딩 예시

```ts
// 호스트 앱에서 사용자 설정 반영
editor.keybindings.register({
  key: 'Ctrl+d',
  command: 'deleteSelection',
  when: 'editorFocus && !selectionEmpty',
  source: 'user'
});
```

---

### 8. VS Code 스타일과의 차이 정리

- VS Code와 유사한 점:
  - `key` / `command` / `when` 구조.
  - `when`에 context key와 논리식을 사용하는 방식.
  - 사용자/기본/확장 레벨의 override 개념.
- 차이점:
  - `editor-core`는 **에디터 내부 상태**에만 집중하며, UI나 파일 타입 같은 외부 컨텍스트(예: `editorLangId`)는 기본에 포함하지 않는다.
  - keybinding 정의는 **JS 객체 기반**이며, JSON 파일 파싱은 호스트 애플리케이션 책임이다.

---

### 9. 다음 단계 (구현 계획 개요)

1. `@barocss/editor-core`에 `KeybindingRegistry` 인터페이스와 기본 구현 추가.
2. `Editor`에 `keymap` API를 노출하고, core 기본 바인딩을 초기화하는 진입점을 정의.
3. 기존 `editor-view-dom`의 `KeymapManagerImpl`는
   - 브라우저 이벤트 → 정규화된 key 문자열 변환
   - `editor.keymap.resolve` 호출 및 `executeCommand` 위임
   역할만 남기도록 단계적으로 마이그레이션.
4. 단위 테스트:
   - 같은 key에 대해 `source` / `when` / 등록 순서에 따른 우선순위 검증.
   - selection / editable 상태 변화에 따른 keybinding 매칭 결과 검증.

이 문서는 **키바인딩 시스템을 `editor-core` 기준으로 단일화하는 상위 스펙**이며, 이후 `editor-view-dom` 및 각 Extension에서 이 스펙에 맞춰 shortcut 등록 방식을 점진적으로 교체한다.

---

## 10. 키 문자열 정규화 상세

### 10.1 정규화 규칙

키 문자열은 **등록 시와 resolve 시 모두 자동으로 정규화**됩니다. 대소문자를 구분하지 않습니다.

1. **Modifier 정규화**:
   - 첫 글자만 대문자로 변환: `Ctrl`, `Cmd`, `Alt`, `Shift`, `Mod`
   - 예: `ctrl`, `CTRL`, `Ctrl` → 모두 `Ctrl`
   - 예: `mod+shift+z` → `Mod+Shift+z`

2. **키 이름 정규화**:
   - 알파벳 키: 소문자로 변환 (`A`–`Z` → `a`–`z`)
   - 특수 키: 그대로 유지 (`Enter`, `Escape`, `F1` 등)
   - 예: `Ctrl+B` → `Ctrl+b`
   - 예: `Enter` → `Enter` (변화 없음)

3. **등록 시 정규화**:
   ```ts
   // 등록 시 자동 정규화
   registry.register({ key: 'CTRL+B', command: 'toggleBold' });
   // 내부적으로 'Ctrl+b'로 저장됨
   ```

4. **resolve 시 정규화**:
   ```ts
   // resolve 시 입력 키도 자동 정규화
   registry.resolve('ctrl+b', {});
   // 'Ctrl+b'로 정규화되어 매칭됨
   ```

### 10.2 KeyboardEvent 처리

`getKeyString()` 함수 (`@barocss/shared`)는 `KeyboardEvent`를 정규화된 키 문자열로 변환합니다:

- **표준**: `event.key` 사용 (VS Code, ProseMirror, Slate 등과 동일)
- **Fallback**: `event.key`가 없을 때만 `event.code` 사용 (매우 드문 경우, 구형 브라우저)
- **Deprecated**: `event.keyCode`는 사용하지 않음 (deprecated)

```ts
import { getKeyString } from '@barocss/shared';

document.addEventListener('keydown', (event) => {
  const key = getKeyString(event);
  // Mac에서 Cmd+b → 'Cmd+b'
  // Windows에서 Ctrl+b → 'Ctrl+b'
  // Enter → 'Enter'
  // Shift+Enter → 'Shift+Enter'
});
```

### 10.3 대소문자 무시 매칭 예시

```ts
// 등록 (대소문자 무관)
registry.register({ key: 'mod+b', command: 'toggleBold' });
registry.register({ key: 'CTRL+SHIFT+Z', command: 'redo' });

// resolve (대소문자 무관)
registry.resolve('Mod+B', {});        // ✅ 매칭됨
registry.resolve('CMD+b', {});        // ✅ 매칭됨 (Mac에서)
registry.resolve('Ctrl+Shift+z', {});  // ✅ 매칭됨
```

### 10.4 resolve 동작

`resolve()` 메서드는 다음과 같이 동작합니다:

1. **입력 키 정규화**: `_normalizeKeyString()`으로 입력 키를 정규화
2. **Mod 키 확장**: `Mod+b` → `[Mod+b, Ctrl+b, Cmd+b]` 등으로 확장
3. **매칭**: 등록된 keybinding (이미 정규화됨)과 비교
4. **when 절 평가**: 매칭된 keybinding의 `when` 절을 평가
5. **우선순위 정렬**: `source` 우선순위와 등록 순서로 정렬

**중요**: 등록된 keybinding은 `register()` 시점에 이미 정규화되어 저장되므로, `resolve()`에서는 입력 키만 정규화하면 됩니다.

---

## 11. 관련 문서

- [Keybinding & Context 사용 예시 가이드](./keybinding-and-context-examples.md) - **실제 사용 예시 및 샘플 코드 모음** ⭐
- [Keybinding Defaults and Customization](./keybinding-defaults-and-customization.md) - 기본 keybinding 목록 관리 및 사용자 커스터마이징 스펙
- [When Expression Spec](./when-expression-spec.md) - `when` 절 평가 스펙
- [Context Provider Spec](./context-provider-spec.md) - Context 관리 스펙
- [VS Code Keyboard Shortcuts](https://code.visualstudio.com/docs/configure/keybindings) - VS Code 공식 문서


