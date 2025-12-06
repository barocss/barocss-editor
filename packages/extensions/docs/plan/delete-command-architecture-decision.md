# Delete Command 아키텍처 결정

## 질문

Backspace 키가 눌렸을 때:
1. Core Extension의 Command를 수행
2. Command는 Transaction을 호출
3. Transaction 중에 Operation을 수행하면 Editor의 History까지 저장되고 rollback 가능

**이 시점에 selection 상태를 보고, block 선택인지, inline 선택인지, text 선택인지에 따라 delete를 수행하는 것이 달라질 텐데:**

- **이건 Command 안에 구현하는게 맞아?**
- **Transaction 안에 Operation으로 구현하는게 맞아?**

---

## 아키텍처 원칙

### 레이어 분리

```
┌─────────────────────────────────────────┐
│ View Layer (editor-view-dom)           │
│ - DOM 이벤트 처리                       │
│ - DOM ↔ Model 변환                      │
│ - Command 호출                          │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ Command Layer (extensions)               │
│ - 사용자 의도 해석                       │
│ - Selection 분석                        │
│ - 어떤 동작을 할지 결정                  │
│ - Operations 생성                       │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ Transaction Layer (model)                │
│ - Operations 실행                        │
│ - History 관리                          │
│ - Rollback 지원                         │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ Operation Layer (model)                 │
│ - 순수 데이터 변경                       │
│ - Selection 매핑                        │
│ - 역연산 (inverse) 생성                 │
└─────────────────────────────────────────┘
```

---

## 답변: **Command 안에 구현**

### 이유

1. **Selection 분석은 사용자 의도 해석**
   - "사용자가 무엇을 선택했는가?" → Command의 책임
   - "선택된 것이 block인가, inline인가, text인가?" → Command가 판단

2. **Operation은 순수하게 데이터 변경만**
   - Operation은 "어떻게 변경할지"만 담당
   - "무엇을 변경할지"는 Command가 결정

3. **Transaction은 Operations의 실행 컨테이너**
   - Transaction은 Operations를 순차 실행하고 History 관리
   - Selection 분석 로직은 Transaction에 포함되지 않음

---

## 현재 구조 분석

### 현재 흐름

```
1. InputHandler.handleDelete (View Layer)
   ↓
2. calculateDeleteRange (View Layer) ← 문제: View Layer에 있음
   ↓
3. editor.executeCommand('delete', { range }) (Command Layer)
   ↓
4. DeleteExtension._executeDelete (Command Layer)
   ↓
5. transaction(editor, operations).commit() (Transaction Layer)
   ↓
6. deleteTextRange / delete Operation 실행 (Operation Layer)
```

### 문제점

- `calculateDeleteRange`가 **View Layer**에 있음
- Selection 분석 로직이 **View Layer**에 있음
- Command는 단순히 받은 `range`를 그대로 사용

---

## 권장 구조

### 개선된 흐름

```
1. InputHandler.handleDelete (View Layer)
   - DOM selection을 Model selection으로 변환
   - Command 호출 (selection 정보 전달)
   ↓
2. DeleteExtension._executeDelete (Command Layer)
   - Selection 분석 (block/inline/text 판단)
   - 삭제 범위 계산
   - Operations 생성
   ↓
3. transaction(editor, operations).commit() (Transaction Layer)
   ↓
4. deleteTextRange / delete Operation 실행 (Operation Layer)
```

---

## 구현 방안

### 1. Command에서 Selection 분석

```typescript
// packages/extensions/src/delete.ts

export class DeleteExtension implements Extension {
  // ...

  private async _executeDelete(
    editor: Editor,
    payload: { 
      selection: ModelSelection,  // range 대신 selection 전달
      inputType?: string          // 방향 정보 (backward/forward)
    }
  ): Promise<boolean> {
    const dataStore = (editor as any).dataStore;
    if (!dataStore) {
      return false;
    }

    // 1. Selection 분석
    const selectionType = this._analyzeSelection(payload.selection, dataStore);
    
    // 2. Selection 타입에 따라 삭제 범위 계산
    let deleteRange: DeleteRange | null = null;
    
    switch (selectionType) {
      case 'block':
        deleteRange = this._calculateBlockDelete(payload.selection, dataStore);
        break;
      case 'inline':
        deleteRange = this._calculateInlineDelete(payload.selection, dataStore);
        break;
      case 'text':
        deleteRange = this._calculateTextDelete(
          payload.selection, 
          payload.inputType,
          dataStore
        );
        break;
      case 'collapsed':
        deleteRange = this._calculateCollapsedDelete(
          payload.selection,
          payload.inputType,
          dataStore
        );
        break;
    }

    if (!deleteRange) {
      return false;
    }

    // 3. Operations 생성 및 실행
    const operations = this._buildDeleteOperations(deleteRange);
    const result = await transaction(editor, operations).commit();
    return result.success;
  }

  /**
   * Selection 타입 분석
   */
  private _analyzeSelection(
    selection: ModelSelection,
    dataStore: any
  ): 'block' | 'inline' | 'text' | 'collapsed' {
    // Collapsed selection
    if (selection.collapsed) {
      return 'collapsed';
    }

    // Range selection: block/inline/text 판단
    const startNode = dataStore.getNode(selection.startNodeId);
    const endNode = dataStore.getNode(selection.endNodeId);
    
    // Block selection 판단
    if (this._isBlockSelection(selection, dataStore)) {
      return 'block';
    }

    // Inline node selection 판단
    if (this._isInlineNodeSelection(selection, dataStore)) {
      return 'inline';
    }

    // Text selection (기본)
    return 'text';
  }

  /**
   * Block selection 판단
   */
  private _isBlockSelection(
    selection: ModelSelection,
    dataStore: any
  ): boolean {
    const startNode = dataStore.getNode(selection.startNodeId);
    const endNode = dataStore.getNode(selection.endNodeId);
    
    // 시작 노드가 블록의 첫 번째 자식이고
    // 끝 노드가 블록의 마지막 자식이면 블록 선택
    // TODO: 정확한 로직 구현
    return false;
  }

  /**
   * Inline node selection 판단
   */
  private _isInlineNodeSelection(
    selection: ModelSelection,
    dataStore: any
  ): boolean {
    // 시작과 끝이 같은 노드이고
    // 그 노드가 inline 노드이면 inline 선택
    if (selection.startNodeId === selection.endNodeId) {
      const node = dataStore.getNode(selection.startNodeId);
      const schema = (dataStore as any).schema;
      if (schema) {
        const nodeSpec = schema.getNodeType?.(node.type || node.stype);
        return nodeSpec?.group === 'inline';
      }
    }
    return false;
  }

  /**
   * Block 삭제 범위 계산
   */
  private _calculateBlockDelete(
    selection: ModelSelection,
    dataStore: any
  ): DeleteRange | null {
    // Block 전체 삭제
    const blockId = this._getBlockId(selection, dataStore);
    if (!blockId) return null;
    
    return {
      _deleteNode: true,
      nodeId: blockId
    };
  }

  /**
   * Inline 노드 삭제 범위 계산
   */
  private _calculateInlineDelete(
    selection: ModelSelection,
    dataStore: any
  ): DeleteRange | null {
    // Inline 노드 전체 삭제
    return {
      _deleteNode: true,
      nodeId: selection.startNodeId
    };
  }

  /**
   * Text 삭제 범위 계산
   */
  private _calculateTextDelete(
    selection: ModelSelection,
    inputType: string | undefined,
    dataStore: any
  ): DeleteRange | null {
    // 선택된 텍스트 범위 삭제
    return {
      startNodeId: selection.startNodeId,
      startOffset: selection.startOffset,
      endNodeId: selection.endNodeId,
      endOffset: selection.endOffset
    };
  }

  /**
   * Collapsed 삭제 범위 계산
   */
  private _calculateCollapsedDelete(
    selection: ModelSelection,
    inputType: string | undefined,
    dataStore: any
  ): DeleteRange | null {
    const { startNodeId, startOffset } = selection;
    
    // 방향에 따라 처리
    if (inputType === 'deleteContentBackward') {
      // Backspace: 이전 문자 삭제
      if (startOffset > 0) {
        return {
          startNodeId,
          startOffset: startOffset - 1,
          endNodeId: startNodeId,
          endOffset: startOffset
        };
      }
      // 노드 경계: 이전 노드 처리
      return this._calculateCrossNodeDelete(
        startNodeId,
        'backward',
        dataStore
      );
    } else if (inputType === 'deleteContentForward') {
      // Delete: 다음 문자 삭제
      const node = dataStore.getNode(startNodeId);
      const textLength = node?.text?.length || 0;
      if (startOffset < textLength) {
        return {
          startNodeId,
          startOffset,
          endNodeId: startNodeId,
          endOffset: startOffset + 1
        };
      }
      // 노드 경계: 다음 노드 처리
      return this._calculateCrossNodeDelete(
        startNodeId,
        'forward',
        dataStore
      );
    }
    
    return null;
  }

  /**
   * Cross-node 삭제 범위 계산
   * (기존 calculateCrossNodeDeleteRange 로직 이동)
   */
  private _calculateCrossNodeDelete(
    currentNodeId: string,
    direction: 'backward' | 'forward',
    dataStore: any
  ): DeleteRange | null {
    // 기존 InputHandler.calculateCrossNodeDeleteRange 로직
    // ...
  }
}
```

---

## View Layer 변경

### InputHandler 수정

```typescript
// packages/editor-view-dom/src/event-handlers/input-handler.ts

private async handleDelete(event: InputEvent): Promise<void> {
  const inputType = event.inputType;

  // 1. DOM selection을 Model selection으로 변환
  const domSelection = window.getSelection();
  if (!domSelection || domSelection.rangeCount === 0) {
    return;
  }

  let modelSelection: any = null;
  try {
    modelSelection = (this.editorViewDOM as any).convertDOMSelectionToModel?.(domSelection);
  } catch (error) {
    console.warn('[InputHandler] handleDelete: failed to convert DOM selection to model', { error });
    return;
  }

  if (!modelSelection || modelSelection.type !== 'range') {
    return;
  }

  // 2. Command 호출 (selection과 inputType 전달)
  // Command가 selection을 분석하고 삭제 범위를 계산
  try {
    const success = await this.editor.executeCommand('delete', {
      selection: modelSelection,
      inputType: inputType
    });
    
    if (!success) {
      console.warn('[InputHandler] handleDelete: command failed');
      return;
    }
  } catch (error) {
    console.error('[InputHandler] handleDelete: command execution failed', { error });
    return;
  }

  // 3. Selection 업데이트는 Transaction의 selectionAfter로 처리
  // (Command에서 처리하지 않음)
}
```

---

## Operation은 순수하게 데이터 변경만

### deleteTextRange Operation

```typescript
// packages/model/src/operations/deleteTextRange.ts

defineOperation('deleteTextRange', 
  async (operation: any, context: TransactionContext) => {
    const { nodeId, start, end } = operation.payload;

    // 1. DataStore 업데이트 (순수 데이터 변경)
    const deletedText = context.dataStore.range.deleteText({
      startNodeId: nodeId,
      startOffset: start,
      endNodeId: nodeId,
      endOffset: end
    });
    
    // 2. Selection 매핑 (자동 처리)
    // SelectionManager가 자동으로 selection을 조정
    
    // 3. 역연산 반환
    return { 
      ok: true, 
      data: deletedText, 
      inverse: { 
        type: 'insertText', 
        payload: { nodeId, pos: start, text: deletedText } 
      } 
    };
  }
);
```

**Operation은:**
- ✅ 받은 payload로 데이터 변경만 수행
- ✅ Selection 분석하지 않음
- ✅ 어떤 동작을 할지 결정하지 않음

---

## 정리

### Command의 책임

1. ✅ **Selection 분석** (block/inline/text/collapsed 판단)
2. ✅ **삭제 범위 계산** (어떤 범위를 삭제할지 결정)
3. ✅ **Operations 생성** (어떤 operations를 실행할지 결정)
4. ✅ **Transaction 실행**

### Operation의 책임

1. ✅ **순수 데이터 변경** (받은 payload로 데이터 변경)
2. ✅ **Selection 매핑** (자동으로 selection 조정)
3. ✅ **역연산 생성** (undo를 위한 inverse)

### Transaction의 책임

1. ✅ **Operations 실행** (순차 실행)
2. ✅ **History 관리** (undo/redo)
3. ✅ **Selection 관리** (selectionBefore/selectionAfter)

---

## 결론

**Selection 분석과 삭제 범위 계산은 Command 안에 구현해야 합니다.**

이유:
- Selection 분석은 "사용자 의도 해석" → Command의 책임
- Operation은 "순수 데이터 변경"만 담당
- Transaction은 "Operations 실행 컨테이너"일 뿐

**현재 구조의 문제:**
- `calculateDeleteRange`가 View Layer에 있음
- Command가 단순히 받은 range를 그대로 사용

**개선 방안:**
- `calculateDeleteRange` 로직을 Command로 이동
- View Layer는 DOM selection을 Model selection으로 변환만 수행
- Command에서 Selection 분석 및 삭제 범위 계산

