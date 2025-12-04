# Extensions

이 패키지는 BaroCSS Editor의 확장 기능(Extension)을 제공합니다. Extension을 통해 에디터에 새로운 커맨드와 기능을 추가할 수 있습니다.

## 목차

- [Extension 정의하기](#extension-정의하기)
- [Command 등록하기](#command-등록하기)
- [Model Operations 사용하기](#model-operations-사용하기)
- [예제](#예제)
- [키바인딩 추가하기](#키바인딩-추가하기)

## Extension 정의하기

Extension은 `Extension` 인터페이스를 구현하는 클래스입니다.

### 기본 구조

```typescript
import { Editor, Extension } from '@barocss/editor-core';

export interface MyExtensionOptions {
  enabled?: boolean;
  // 추가 옵션...
}

export class MyExtension implements Extension {
  name = 'myExtension';
  priority = 100; // 우선순위 (낮을수록 먼저 실행)

  private _options: MyExtensionOptions;

  constructor(options: MyExtensionOptions = {}) {
    this._options = {
      enabled: true,
      ...options
    };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;
    
    // Command 등록, 이벤트 리스너 등록 등
  }

  onDestroy(_editor: Editor): void {
    // 정리 작업 (이벤트 리스너 제거 등)
  }
}
```

### 생명주기 메서드

- **`onCreate(editor: Editor)`**: Extension이 에디터에 등록될 때 호출됩니다.
- **`onDestroy(editor: Editor)`**: Extension이 제거될 때 호출됩니다.

## Command 등록하기

Extension에서 커맨드를 등록하려면 `editor.registerCommand()`를 사용합니다.

### 기본 Command 등록

```typescript
onCreate(editor: Editor): void {
  (editor as any).registerCommand({
    name: 'myCommand',
    execute: async (ed: Editor, payload?: any) => {
      // 커맨드 실행 로직
      return true; // 성공 시 true, 실패 시 false
    },
    canExecute: (_ed: Editor, payload?: any) => {
      // 커맨드 실행 가능 여부 확인
      return true;
    }
  });
}
```

### Command 실행 방법

커맨드는 다음과 같이 실행할 수 있습니다:

```typescript
// 직접 실행
await editor.executeCommand('myCommand', { /* payload */ });

// CommandChain 사용
await editor.commands()
  .myCommand()
  .run();
```

## Model Operations 사용하기

Extension에서 모델을 변경하려면 `@barocss/model`의 operations를 사용합니다.

### Transaction과 Operations

모든 모델 변경은 transaction을 통해 수행됩니다:

```typescript
import { transaction, control, toggleMark, transformNode, moveBlockUp } from '@barocss/model';

// 1. Operations 배열 생성
const ops = [
  ...control(nodeId, [
    toggleMark('bold', [startOffset, endOffset])
  ])
];

// 2. Transaction 실행
const result = await transaction(editor, ops).commit();
return result.success;
```

### 주요 Operations

#### Mark Operations

```typescript
import { toggleMark, applyMark, removeMark } from '@barocss/model';

// Mark 토글
toggleMark('bold', [startOffset, endOffset])

// Mark 적용
applyMark('bold', [startOffset, endOffset])

// Mark 제거
removeMark('bold', [startOffset, endOffset])
```

#### Node Operations

```typescript
import { transformNode, moveBlockUp, moveBlockDown } from '@barocss/model';

// 노드 타입 변환 (예: paragraph → heading)
transformNode('heading', { level: 1 })

// 블록 이동
moveBlockUp()
moveBlockDown()
```

#### Control Helper

`control()` 헬퍼를 사용하면 특정 노드에 대한 operations를 그룹화할 수 있습니다:

```typescript
import { control, toggleMark } from '@barocss/model';

const ops = [
  ...control(nodeId, [
    toggleMark('bold', [0, 5]),
    toggleMark('italic', [2, 7])
  ])
];
```

## 예제

### 예제 1: 간단한 Mark 토글 Extension

```typescript
import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, control, toggleMark } from '@barocss/model';

export class BoldExtension implements Extension {
  name = 'bold';
  priority = 100;

  onCreate(editor: Editor): void {
    (editor as any).registerCommand({
      name: 'toggleBold',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        return await this._executeToggleBold(ed, payload?.selection);
      },
      canExecute: (_ed: Editor, payload?: { selection?: ModelSelection }) => {
        return !!payload?.selection && payload.selection.type === 'range';
      }
    });
  }

  onDestroy(_editor: Editor): void {}

  private async _executeToggleBold(
    editor: Editor,
    selection?: ModelSelection
  ): Promise<boolean> {
    if (!selection || selection.type !== 'range') {
      return false;
    }

    const dataStore = (editor as any).dataStore;
    if (!dataStore) {
      return false;
    }

    // 같은 텍스트 노드 내에서만 처리
    if (selection.startNodeId !== selection.endNodeId) {
      return false;
    }

    const node = dataStore.getNode(selection.startNodeId);
    if (!node || typeof node.text !== 'string') {
      return false;
    }

    const { startOffset, endOffset } = selection;
    const ops = [
      ...control(selection.startNodeId, [
        toggleMark('bold', [startOffset, endOffset])
      ])
    ];

    const result = await transaction(editor, ops).commit();
    return result.success;
  }
}
```

### 예제 2: 블록 타입 변환 Extension

```typescript
import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, control, transformNode } from '@barocss/model';

export class HeadingExtension implements Extension {
  name = 'heading';
  priority = 100;

  onCreate(editor: Editor): void {
    // setHeading1, setHeading2, setHeading3 등록
    [1, 2, 3].forEach(level => {
      (editor as any).registerCommand({
        name: `setHeading${level}`,
        execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
          return await this._executeSetHeading(ed, level, payload?.selection);
        },
        canExecute: (_ed: Editor, payload?: { selection?: ModelSelection }) => {
          return !!payload?.selection;
        }
      });
    });
  }

  onDestroy(_editor: Editor): void {}

  private async _executeSetHeading(
    editor: Editor,
    level: number,
    selection?: ModelSelection
  ): Promise<boolean> {
    if (!selection || selection.type !== 'range') {
      return false;
    }

    const dataStore = (editor as any).dataStore;
    const targetNodeId = this._getTargetBlockNodeId(dataStore, selection);
    if (!targetNodeId) {
      return false;
    }

    const ops = [
      ...control(targetNodeId, [
        transformNode('heading', { level })
      ])
    ];

    const result = await transaction(editor, ops).commit();
    return result.success;
  }

  private _getTargetBlockNodeId(dataStore: any, selection: ModelSelection): string | null {
    // selection에서 블록 노드 찾기 로직
    // ...
  }
}
```

### 예제 3: 간단한 Action Extension (Model 변경 없음)

```typescript
import { Editor, Extension } from '@barocss/editor-core';

export class EscapeExtension implements Extension {
  name = 'escape';
  priority = 100;

  onCreate(editor: Editor): void {
    (editor as any).registerCommand({
      name: 'escape',
      execute: (ed: Editor) => {
        const selection = ed.selection;
        
        // 선택이 있으면 선택 취소
        if (selection && !this._isSelectionEmpty(selection)) {
          ed.clearSelection();
          return true;
        }
        
        // 선택이 없으면 포커스 해제
        ed.emit('editor:blur.request', {});
        return true;
      },
      canExecute: () => true
    });
  }

  onDestroy(_editor: Editor): void {}

  private _isSelectionEmpty(selection: any): boolean {
    if (!selection) return true;
    if (selection.type === 'range') {
      return selection.collapsed || 
             (selection.startNodeId === selection.endNodeId && 
              selection.startOffset === selection.endOffset);
    }
    return false;
  }
}
```

## 키바인딩 추가하기

Extension에서 커맨드를 등록한 후, 키바인딩을 추가하려면 `packages/editor-core/src/keybinding/default-keybindings.ts`에 추가합니다:

```typescript
export const DEFAULT_KEYBINDINGS: Keybinding[] = [
  // ...
  {
    key: 'Mod+b',
    command: 'toggleBold',
    when: 'editorFocus && editorEditable'
  },
  // ...
];
```

### 키바인딩 포맷

- **Modifier**: `Mod` (macOS: Cmd, 그 외: Ctrl), `Alt`, `Shift`
- **키**: `A-Z`, `0-9`, `Enter`, `Escape`, `Backspace`, `Delete`, `Tab`, `ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`, `Home`, `End` 등
- **조합**: `Mod+b`, `Mod+Shift+s`, `Alt+ArrowUp` 등

### When 조건

- `editorFocus`: 에디터에 포커스가 있을 때
- `editorEditable`: 에디터가 편집 가능할 때
- `!selectionEmpty`: 선택이 비어있지 않을 때
- `historyCanUndo`: Undo 가능할 때
- `isMac`: macOS일 때

## Extension 사용하기

Extension을 에디터에 등록하려면:

```typescript
import { Editor } from '@barocss/editor-core';
import { MyExtension } from '@barocss/extensions';

const editor = new Editor({
  extensions: [
    new MyExtension({ enabled: true })
  ]
});
```

또는 편의 함수 사용:

```typescript
import { createMyExtension } from '@barocss/extensions';

const editor = new Editor({
  extensions: [
    createMyExtension({ enabled: true })
  ]
});
```

## 참고 자료

- [Command Architecture Guide](./docs/command-architecture-guide.md)
- [Operation Selection Handling](./docs/operation-selection-handling.md)
- [@barocss/model](../model/README.md) - Model operations 문서

