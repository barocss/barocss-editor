efin# 텍스트 입력 Command → Transaction → Operation 구조로 전환

## 문제점

현재 텍스트 입력은 **직접 `dataStore.range.replaceText()` 호출**하고 있어서:
- ❌ History 관리가 안 됨
- ❌ Selection 매핑이 명시적이지 않음
- ❌ 지우기와 일관성 없음
- ❌ Undo/Redo 지원 안 됨

## 현재 구조

```
MutationObserver 감지
    ↓
handleC1/handleC2
    ↓
dataStore.range.replaceText() 직접 호출  ← 문제!
    ↓
editor:content.change (skipRender: true)
```

## 목표 구조

```
MutationObserver 감지
    ↓
handleC1/handleC2
    ↓
editor.executeCommand('replaceText', { range, text })
    ↓
TextExtension._executeReplaceText()
    ↓
transaction(editor, operations).commit()
    ↓
insertText/deleteTextRange operation 실행
    ↓
Transaction의 selectionAfter 사용
    ↓
editor:content.change (skipRender: true)
```

---

## 구현 계획

### 1. TextExtension에 `replaceText` Command 추가

**중요**: Command에서 operations를 조합하는 것이 맞습니다. (다른 에디터들도 동일한 패턴 사용)

```typescript
// packages/extensions/src/text.ts

export class TextExtension implements Extension {
  onCreate(editor: Editor): void {
    // replaceText 명령어 추가
    editor.registerCommand({
      name: 'replaceText',
      execute: async (editor: Editor, payload: { 
        range: ContentRange,
        text: string 
      }) => {
        return await this._executeReplaceText(editor, payload.range, payload.text);
      },
      canExecute: (editor: Editor, payload?: any) => {
        return payload?.range != null && payload?.text != null;
      }
    });
  }

  /**
   * 텍스트 교체 실행
   * 
   * Command의 책임:
   * 1. 사용자 의도 해석 (어떤 범위를 어떤 텍스트로 교체할지)
   * 2. Operations 조합 (어떤 operations를 실행할지 결정)
   * 3. Transaction 실행
   */
  private async _executeReplaceText(
    editor: Editor,
    range: ContentRange,
    text: string
  ): Promise<boolean> {
    const dataStore = (editor as any).dataStore;
    if (!dataStore) {
      console.error('[TextExtension] dataStore not found');
      return false;
    }

    // 비즈니스 로직: 삽입만 있는지, 교체가 있는지 판단
    // 삽입만 있는 경우 (start === end)
    if (range.startOffset === range.endOffset) {
      const operations = this._buildInsertTextOperations(range, text);
      const result = await transaction(editor, operations).commit();
      return result.success;
    }

    // 교체 또는 삭제가 있는 경우
    // 여러 operations를 조합하여 하나의 transaction으로 실행
    const operations = [
      ...this._buildDeleteTextOperations(range),
      ...this._buildInsertTextOperations(
        { ...range, endOffset: range.startOffset },
        text
      )
    ];
    
    const result = await transaction(editor, operations).commit();
    return result.success;
  }

  /**
   * 삽입 operations 생성
   * 
   * Command의 책임: 어떤 operations를 조합할지 결정
   */
  private _buildInsertTextOperations(
    range: ContentRange,
    text: string
  ): any[] {
    return [
      ...control(range.startNodeId, [
        {
          type: 'insertText',
          payload: {
            pos: range.startOffset,
            text: text
          }
        }
      ])
    ];
  }

  /**
   * 삭제 operations 생성
   * 
   * Command의 책임: 어떤 operations를 조합할지 결정
   */
  private _buildDeleteTextOperations(range: ContentRange): any[] {
    return [
      ...control(range.startNodeId, [
        {
          type: 'deleteTextRange',
          payload: {
            start: range.startOffset,
            end: range.endOffset
          }
        }
      ])
    ];
  }
}
```

**참고**: Command에서 operations를 조합하는 것이 올바른 패턴입니다.
- ProseMirror: Command가 Transaction을 조작하고 operations 추가
- Slate: Command가 Transform을 조작하고 operations 추가
- Tiptap: Command가 Transaction을 조작하고 operations 추가

---

### 2. InputHandler에서 Command 호출

```typescript
// packages/editor-view-dom/src/event-handlers/input-handler.ts

private handleC1(classified: ClassifiedChange): void {
  // ... 기존 로직 (textChanges 분석) ...

  const change = textChanges[0];
  
  // contentRange 결정
  let contentRange;
  if (classified.contentRange && classified.metadata?.usedInputHint) {
    contentRange = classified.contentRange;
  } else {
    contentRange = {
      startNodeId: classified.nodeId,
      startOffset: change.start,
      endNodeId: classified.nodeId,
      endOffset: change.end
    };
  }

  try {
    // Command 호출로 변경
    if (change.type === 'delete') {
      // 삭제는 이미 beforeinput에서 처리되지만, 
      // IME 조합 중 fallback으로 여기서도 처리 가능
      await this.editor.executeCommand('delete', { range: contentRange });
    } else if (change.type === 'insert' || change.type === 'replace') {
      // 텍스트 삽입/교체: replaceText command 호출
      const success = await this.editor.executeCommand('replaceText', {
        range: contentRange,
        text: change.text
      });
      
      if (!success) {
        console.warn('[InputHandler] handleC1: replaceText command failed');
        return;
      }
    }

    // Transaction의 selectionAfter 사용
    // (TransactionResult에서 가져오거나, 별도로 읽어야 함)
    // TODO: TransactionResult를 반환받아서 selectionAfter 사용

    // editor:content.change 이벤트는 Command 내부에서 발생하거나
    // 여기서 발생시켜야 함
    this.editor.emit('editor:content.change', {
      skipRender: true,
      from: 'mutation-observer'
    });

  } catch (error) {
    console.error('[InputHandler] handleC1: command execution failed', { error });
  }
}
```

---

### 3. TransactionResult에서 selectionAfter 사용

```typescript
// packages/editor-view-dom/src/event-handlers/input-handler.ts

private async handleC1(classified: ClassifiedChange): Promise<void> {
  // ... 기존 로직 ...

  try {
    // Command 실행 및 TransactionResult 받기
    const result = await this.editor.executeCommand('replaceText', {
      range: contentRange,
      text: change.text
    });
    
    if (!result || !result.success) {
      console.warn('[InputHandler] handleC1: replaceText command failed');
      return;
    }

    // Transaction의 selectionAfter 사용
    if (result.selectionAfter) {
      this.editor.emit('editor:selection.change', {
        selection: result.selectionAfter,
        oldSelection: result.selectionBefore || null
      });
    }

    // editor:content.change 이벤트
    this.editor.emit('editor:content.change', {
      skipRender: true,
      from: 'mutation-observer'
    });

  } catch (error) {
    console.error('[InputHandler] handleC1: command execution failed', { error });
  }
}
```

**문제**: `editor.executeCommand()`가 `TransactionResult`를 반환하지 않음

**해결**: `Editor.executeCommand()`를 수정하여 `TransactionResult` 반환

---

### 4. Editor.executeCommand() 수정

```typescript
// packages/editor-core/src/editor.ts

async executeCommand(
  name: string,
  payload?: any
): Promise<TransactionResult | boolean> {
  const command = this._commands.get(name);
  if (!command) {
    console.warn(`[Editor] Command not found: ${name}`);
    return false;
  }

  if (!command.canExecute(this, payload)) {
    console.warn(`[Editor] Command cannot execute: ${name}`);
    return false;
  }

  try {
    const result = await command.execute(this, payload);
    
    // result가 TransactionResult인 경우 그대로 반환
    if (result && typeof result === 'object' && 'success' in result) {
      return result as TransactionResult;
    }
    
    // boolean인 경우 TransactionResult로 변환
    return result ? { success: true } : { success: false };
  } catch (error) {
    console.error(`[Editor] Command execution failed: ${name}`, error);
    return { success: false, errors: [error instanceof Error ? error.message : 'Unknown error'] };
  }
}
```

---

## 장점

### 1. 일관성
- ✅ 모든 편집 작업이 Command → Transaction → Operation 구조
- ✅ 지우기와 동일한 패턴

### 2. History 자동 관리
- ✅ TransactionManager가 자동으로 History에 추가
- ✅ Undo/Redo 지원

### 3. Selection 매핑 명확
- ✅ Transaction의 selectionAfter 사용
- ✅ 각 operation이 context.selection.current 갱신

### 4. 테스트 용이성
- ✅ Command 단위로 테스트 가능
- ✅ Transaction 단위로 테스트 가능

---

## 구현 단계

### Phase 1: TextExtension에 replaceText Command 추가
- [ ] `replaceText` command 등록
- [ ] `_executeReplaceText` 구현
- [ ] `_buildInsertTextOperations` 구현
- [ ] `_buildDeleteTextOperations` 구현

### Phase 2: InputHandler에서 Command 호출
- [ ] `handleC1`에서 `replaceText` command 호출
- [ ] `handleC2`에서 `replaceText` command 호출
- [ ] TransactionResult에서 selectionAfter 사용

### Phase 3: Editor.executeCommand() 수정
- [ ] `executeCommand`가 `TransactionResult` 반환하도록 수정
- [ ] 기존 boolean 반환과 호환성 유지

### Phase 4: 테스트 및 검증
- [ ] 텍스트 입력 테스트
- [ ] IME 입력 테스트
- [ ] Selection 매핑 테스트
- [ ] History 테스트

---

## 주의사항

### 1. IME 조합 중 처리
- IME 조합 중에는 브라우저가 여러 번 DOM 변경
- 각 변경마다 Command 호출하면 비효율적
- 디바운싱 또는 배치 처리 필요

### 2. skipRender: true
- 텍스트 입력은 DOM이 이미 변경되었으므로 `skipRender: true`
- Command 내부에서 `editor:content.change` 발생 시 `skipRender` 전달 필요

### 3. 성능
- Command → Transaction → Operation 구조는 약간의 오버헤드
- 하지만 History 관리와 일관성의 이점이 더 큼

---

## 참고

- `packages/extensions/src/delete.ts`: DeleteExtension의 Command 구조 참고
- `packages/model/src/operations/insertText.ts`: insertText operation 참고
- `packages/model/src/operations/deleteTextRange.ts`: deleteTextRange operation 참고

