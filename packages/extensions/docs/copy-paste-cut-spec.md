# Copy/Paste/Cut 기능 구현 스펙

## 개요

복사/붙여넣기/잘라내기 기능을 각 레이어(schema, datastore, model, extensions)에서 구현하기 위해 필요한 기능들을 정리합니다.  
특히, **`@barocss/converter` 패키지를 copy/paste/cut 흐름에서 어떻게 사용할지**를 명확히 정의합니다.

---

## 1. Schema 레이어

### 1.1 필요한 기능

**현재 상태**: Schema는 모델 구조와 검증만 담당합니다.

**결론**: Schema 레이어에서는 추가할 것이 없습니다.
- 변환 규칙은 Converter 패키지에서 정의
- Schema는 모델 구조만 정의 (변환 규칙 없음)

**이유**:
- Schema는 "데이터 모델 구조"와 "검증 규칙"에만 집중해야 함
- 변환 규칙은 "외부 형식 처리"이므로 Converter 패키지의 책임
- Schema가 변환 로직에 의존하지 않도록 순수성 유지
- Converter 패키지가 독립적으로 동작 가능하도록 설계

**참고**: 
- ProseMirror는 `parseDOM`을 Schema에 정의하지만, 우리는 더 명확한 책임 분리를 위해 Converter 패키지로 분리합니다.
- Schema는 모델 구조만 정의하고, Converter는 변환 규칙을 정의합니다.

---

## 2. DataStore 레이어

### 2.1 필요한 기능

#### 2.1.1 노드 트리 직렬화 (Serialization)

**목적**: 선택된 범위의 노드들을 JSON 형식으로 직렬화

**⚠️ 중요**: DataStore는 모델 데이터만 알고 있으므로, **JSON 직렬화만** 담당합니다.
- HTML/Markdown 직렬화는 **Extension 레이어 + `@barocss/converter`** 에서 처리 (JSON → 외부 포맷 변환)
- 텍스트 직렬화는 `RangeOperations.extractText()` 사용 (이미 존재)

**필요한 메서드**:
```typescript
// packages/datastore/src/operations/serialization-operations.ts

class SerializationOperations {
  /**
   * 선택된 범위의 노드들을 JSON 형식으로 직렬화
   * 
   * @param range 선택된 범위 (ModelSelection)
   * @returns 직렬화된 노드 트리 (INode[] 형태, ID는 제거하거나 새로 생성)
   */
  serializeRange(range: ModelSelection): INode[] {
    // 1. range에 포함된 모든 노드 추출
    // 2. 노드 트리 구조 유지 (parent-child 관계)
    // 3. ID를 제거하거나 새로 생성 (붙여넣기 시 충돌 방지)
    // 4. JSON 형태로 반환 (순수 모델 데이터만)
  }
}
```

**DataStore에 노출**:
```typescript
// packages/datastore/src/data-store.ts

class DataStore {
  // ... existing code ...
  
  /**
   * 선택된 범위를 JSON으로 직렬화
   * 
   * 참고: HTML/텍스트 직렬화는 Extension 레이어에서 처리
   */
  serializeRange(range: ModelSelection): INode[] {
    return this.serialization.serializeRange(range);
  }
}
```

**텍스트 추출**:
- `RangeOperations.extractText()` 사용 (이미 존재)
- 또는 `DataStore.range.extractText(range)` 사용

#### 2.1.2 노드 트리 역직렬화 (Deserialization)

**목적**: 직렬화된 JSON 데이터를 파싱하여 노드 트리로 복원

**⚠️ 중요**: DataStore는 모델 데이터만 알고 있으므로, **JSON 역직렬화만** 담당합니다.
- HTML 역직렬화는 Extension 레이어에서 처리 (HTML → 모델 노드(`INode[]`) 변환 후 `deserializeNodes()` 호출)
- 텍스트/Markdown 역직렬화는 Extension 레이어에서 처리 (텍스트/Markdown → 모델 노드(`INode[]`) 변환 후 `deserializeNodes()` 호출)

**필요한 메서드**:
```typescript
// packages/datastore/src/operations/serialization-operations.ts

class SerializationOperations {
  /**
   * JSON 형식의 노드 트리를 파싱하여 노드 생성
   * 
   * @param nodes 직렬화된 노드 배열 (INode[])
   * @param targetParentId 붙여넣기할 부모 노드 ID
   * @param targetPosition 붙여넣기할 위치 (부모의 content 배열 인덱스)
   * @returns 생성된 노드 ID 배열
   */
  deserializeNodes(
    nodes: INode[],
    targetParentId: string,
    targetPosition?: number
  ): string[] {
    // 1. 노드 트리를 재귀적으로 순회
    // 2. 각 노드에 새 ID 부여 (기존 ID는 무시)
    // 3. parentId 관계 재설정
    // 4. targetParentId의 content에 삽입
    // 5. 생성된 노드 ID 배열 반환
  }
}
```

**DataStore에 노출**:
```typescript
// packages/datastore/src/data-store.ts

class DataStore {
  // ... existing code ...
  
  /**
   * JSON 노드 트리를 역직렬화하여 삽입
   * 
   * 참고: HTML/텍스트 역직렬화는 Extension 레이어에서 처리
   */
  deserializeNodes(
    nodes: INode[],
    targetParentId: string,
    targetPosition?: number
  ): string[] {
    return this.serialization.deserializeNodes(nodes, targetParentId, targetPosition);
  }
}
```

#### 2.1.3 선택된 범위 삭제

**현재 상태**: `RangeOperations.deleteText()`가 이미 존재합니다.

**확장 필요성**:
- 텍스트 노드뿐만 아니라 블록 노드 전체 삭제도 지원해야 할 수 있음
- 현재 `deleteText`는 텍스트 범위만 삭제하므로, 노드 전체 삭제는 별도 메서드 필요

**필요한 메서드**:
```typescript
// packages/datastore/src/operations/range-operations.ts

class RangeOperations {
  /**
   * 선택된 범위의 노드들을 삭제
   * - 텍스트 범위: deleteText 사용
   * - 노드 전체: deleteNode 사용
   */
  deleteRange(range: ModelSelection): void {
    // 1. range가 텍스트 범위인지 노드 범위인지 판단
    // 2. 텍스트 범위면 deleteText 호출
    // 3. 노드 범위면 deleteNode 호출 (각 노드별로)
  }
}
```

---

## 3. Model 레이어

### 3.1 필요한 기능

#### 3.1.1 Copy Operation

**목적**: 선택된 범위를 **모델 관점에서** 복사 가능한 데이터(모델 JSON + 텍스트)로 준비  
클립보드 API 호출과 HTML/Markdown 변환은 **Extensions + Converter** 책임입니다.

**필요한 Operation (최종 형태)**:
```typescript
// packages/model/src/operations/copy.ts

export interface CopyResult {
  json: INode[];  // 모델 JSON (DataStore.serializeRange 기반)
  text: string;   // 순수 텍스트 (RangeOperations.extractText 기반)
}

export function copy(context: OperationContext, range: ModelSelection): CopyResult {
  // 1. DataStore.serializeRange() 호출 → json
  // 2. DataStore.range.extractText() 호출 → text
  // 3. html/markdown 등 외부 포맷은 여기서 만들지 않는다.
  return {
    json: context.dataStore.serializeRange(range),
    text: context.dataStore.range.extractText(range)
  };
}
```

**DSL 함수**:
```typescript
// packages/model/src/operations-dsl/copy.ts

export function copy(range: ModelSelection) {
  return {
    type: 'copy',
    range
  };
}
```

#### 3.1.2 Paste Operation

**목적**: 붙여넣기 대상 위치에서 **모델 노드 삽입 + Selection 업데이트**를 담당  
외부 포맷(HTML/Markdown/Text)을 모델 노드(`INode[]`)로 바꾸는 변환은 **Extensions + Converter**에서 처리합니다.

**필요한 Operation (최종 형태)**:
```typescript
// packages/model/src/operations/paste.ts

export interface PasteInput {
  nodes: INode[];             // 이미 Converter를 통해 만들어진 모델 노드
}

export interface PasteResult {
  insertedNodeIds: string[];
  newSelection: ModelSelection;  // 붙여넣기 후 커서 위치
}

export function paste(
  context: OperationContext,
  data: PasteInput,
  targetRange: ModelSelection
): PasteResult {
  // 1. targetRange의 startNodeId/startOffset 기준으로 붙여넣기 위치 결정
  // 2. context.dataStore.deserializeNodes(data.nodes, targetParentId, targetPosition) 호출
  // 3. 생성된 노드 ID들을 기반으로 newSelection 계산
}
```

**DSL 함수**:
```typescript
// packages/model/src/operations-dsl/paste.ts

export function paste(nodes: INode[], targetRange: ModelSelection) {
  return {
    type: 'paste',
    data: { nodes },
    targetRange
  };
}
```

#### 3.1.3 Cut Operation

**목적**: 선택된 범위를 복사하고 삭제  
여기서도 Converter는 사용하지 않고, **모델 JSON + 텍스트**까지만 반환합니다.

**필요한 Operation**:
```typescript
// packages/model/src/operations/cut.ts

export interface CutResult {
  json: INode[];
  text: string;
  deletedRange: ModelSelection;
}

export function cut(context: OperationContext, range: ModelSelection): CutResult {
  // 1. copy() 호출하여 json + text 확보
  const copied = copy(context, range);

  // 2. deleteRange() 호출하여 삭제 (또는 deleteTextRange)
  context.dataStore.range.deleteRange(range);

  // 3. 결과 반환 (클립보드 저장/HTML 변환은 Extension 책임)
  return {
    json: copied.json,
    text: copied.text,
    deletedRange: range
  };
}
```

**DSL 함수**:
```typescript
// packages/model/src/operations-dsl/cut.ts

export function cut(range: ModelSelection) {
  return {
    type: 'cut',
    range
  };
}
```

**Transaction 사용 예시**:
```typescript
// Extension에서 사용
const result = await transaction(editor, (control) => {
  const copyResult = control(range, [copy(range)]);
  const deleteResult = control(range, [deleteTextRange(range)]);
  return { copyResult, deleteResult };
});
```

---

## 4. Extensions 레이어

### 4.1 필요한 기능

#### 4.1.1 Copy Command

**목적**: 클립보드 API와 통합하여 복사 기능 제공

**필요한 Command**:
```typescript
// packages/extensions/src/copy-paste.ts

export class CopyPasteExtension implements Extension {
  name = 'copyPaste';
  priority = 100;
  
  private _converter: HTMLConverter;

  constructor() {
    // Converter 인스턴스 생성
    this._converter = new HTMLConverter();
  }

  onCreate(editor: Editor): void {
    // 1. 기본 변환 규칙 등록
    this._registerDefaultRules();
    
    // 2. Schema 참조 (노드 타입 이름 확인용)
    this._converter.useSchema(editor.dataStore.getActiveSchema());
    
    // 3. copy command 등록
    editor.registerCommand({
      name: 'copy',
      execute: async (editor: Editor, payload?: { selection?: ModelSelection }) => {
        const selection = payload?.selection || editor.selection;
        if (!selection || selection.type !== 'range') {
          return false;
        }

        // 1. DataStore에서 JSON 직렬화
        const json = editor.dataStore.serializeRange(selection);
        
        // 2. 텍스트 추출 (이미 존재하는 메서드 사용)
        const text = editor.dataStore.range.extractText(selection);
        
        // 3. JSON을 HTML로 변환 (Converter 사용)
        const html = this._converter.convert(json, 'html');

        // 4. 클립보드 API로 저장
        await this._writeToClipboard({ json, html, text });
        return true;
      },
      canExecute: (editor: Editor, payload?: any) => {
        const selection = payload?.selection || editor.selection;
        return selection != null && selection.type === 'range';
      }
    });
  }

  /**
   * 기본 변환 규칙 등록
   */
  private _registerDefaultRules(): void {
    // Converter에 기본 변환 규칙 등록
    // 예: paragraph, heading, bold, italic 등
  }

  private async _writeToClipboard(data: { json: INode[]; html: string; text: string }): Promise<void> {
    // 1. Clipboard API 사용 (navigator.clipboard.write)
    // 2. 여러 형식 저장 (text/plain, text/html, application/json)
    // 3. Fallback: document.execCommand('copy') 사용
  }
}
```

#### 4.1.2 Paste Command

**목적**: 클립보드 API에서 데이터를 읽어와 붙여넣기

**필요한 Command**:
```typescript
// packages/extensions/src/copy-paste.ts

export class CopyPasteExtension implements Extension {
  onCreate(editor: Editor): void {
    // ... copy command ...

    // 2. paste command 등록
    editor.registerCommand({
      name: 'paste',
      execute: async (editor: Editor, payload?: { selection?: ModelSelection; clipboardData?: ClipboardData }) => {
        const selection = payload?.selection || editor.selection;
        if (!selection || selection.type !== 'range') {
          return false;
        }

        // 1. 클립보드에서 데이터 읽기
        const clipboardData = payload?.clipboardData || await this._readFromClipboard();

        // 2. 클립보드 데이터를 JSON으로 변환 (Converter 사용)
        const json = await this._clipboardDataToJSON(clipboardData);

        // 3. DataStore.deserializeNodes() 호출하여 노드 생성
        const targetParentId = this._getTargetParentId(selection, editor.dataStore);
        const targetPosition = this._getTargetPosition(selection, editor.dataStore);
        
        const insertedNodeIds = editor.dataStore.deserializeNodes(json, targetParentId, targetPosition);

        // 4. Selection 업데이트
        const newSelection = this._createSelectionAfterPaste(selection, insertedNodeIds);
        editor.updateSelection(newSelection);
        return true;
      },
      canExecute: (editor: Editor, payload?: any) => {
        const selection = payload?.selection || editor.selection;
        return selection != null && selection.type === 'range';
      }
    });
  }

  /**
   * 클립보드 데이터를 JSON 노드 트리로 변환
   * 
   * 우선순위:
   * 1. application/json (우선): 직접 사용
   * 2. text/html: HTML → JSON 변환 (Converter 사용)
   * 3. text/plain: 텍스트 → JSON 변환
   */
  private async _clipboardDataToJSON(
    clipboardData: ClipboardData
  ): Promise<INode[]> {
    // 1. application/json 형식이 있으면 직접 사용
    if (clipboardData.json) {
      return clipboardData.json;
    }

    // 2. text/html 형식이 있으면 HTML → JSON 변환 (Converter 사용)
    if (clipboardData.html) {
      return this._converter.parse(clipboardData.html, 'html');
    }

    // 3. text/plain 형식이 있으면 텍스트 → JSON 변환
    if (clipboardData.text) {
      return this._textToJSON(clipboardData.text);
    }

    return [];
  }

  /**
   * 텍스트를 JSON 노드 트리로 변환
   */
  private _textToJSON(text: string): INode[] {
    // 1. 텍스트를 paragraph + inline-text 노드로 변환
    // 2. 줄바꿈을 paragraph 분리로 처리
    // 3. JSON 노드 트리 생성
  }

  private async _readFromClipboard(): Promise<ClipboardData> {
    // 1. Clipboard API 사용 (navigator.clipboard.read)
    // 2. 여러 형식 읽기 (text/plain, text/html, application/json)
    // 3. Fallback: paste 이벤트의 clipboardData 사용
  }
}
```

#### 4.1.3 Cut Command

**목적**: 복사 + 삭제 조합

**필요한 Command**:
```typescript
// packages/extensions/src/copy-paste.ts

export class CopyPasteExtension implements Extension {
  onCreate(editor: Editor): void {
    // ... copy, paste commands ...

    // 3. cut command 등록
    editor.registerCommand({
      name: 'cut',
      execute: async (editor: Editor, payload?: { selection?: ModelSelection }) => {
        const selection = payload?.selection || editor.selection;
        if (!selection || selection.type !== 'range') {
          return false;
        }

        // Model operation으로 잘라내기 (복사 + 삭제)
        const cutResult = await transaction(editor, (control) => {
          return control(selection, [
            copy(selection),
            deleteTextRange(selection)  // 또는 deleteRange(selection)
          ]);
        });

        // 클립보드 API로 저장
        await this._writeToClipboard(cutResult.copyResult);
        return true;
      },
      canExecute: (editor: Editor, payload?: any) => {
        const selection = payload?.selection || editor.selection;
        return selection != null && selection.type === 'range' && !selection.collapsed;
      }
    });
  }
}
```

#### 4.1.4 키 바인딩 등록

**기본 키 바인딩 (예정)**:
```typescript
// packages/editor-core/src/keybinding/default-keybindings.ts

export const DEFAULT_KEYBINDINGS: Keybinding[] = [
  // ... existing keybindings ...
  
  // 복사/붙여넣기/잘라내기
  {
    key: 'Mod+c',
    command: 'copy',
    when: 'editorFocus && editorEditable && !selectionEmpty'
  },
  {
    key: 'Mod+v',
    command: 'paste',
    when: 'editorFocus && editorEditable'
  },
  {
    key: 'Mod+x',
    command: 'cut',
    when: 'editorFocus && editorEditable && !selectionEmpty'
  }
];
```

**요약 표**:

| 키           | command | when                                               | 설명                                 |
|--------------|---------|----------------------------------------------------|--------------------------------------|
| `Mod+c`      | `copy`  | `editorFocus && editorEditable && !selectionEmpty`| 선택 범위를 클립보드로 복사         |
| `Mod+v`      | `paste` | `editorFocus && editorEditable`                   | 클립보드 내용을 현재 selection에 붙여넣기 |
| `Mod+x`      | `cut`   | `editorFocus && editorEditable && !selectionEmpty`| 선택 범위를 잘라내기(복사 + 삭제)   |

---

### 4.2 붙여넣기 후 Selection 규칙 (Converter 사용을 전제로 한 흐름)

붙여넣기 후 Selection을 어떻게 둘지는 copy/paste UX의 핵심입니다.  
아래는 **range selection + paste** 기준으로, Converter를 통해 생성된 모델 노드를 어디에 어떻게 붙여넣고 Selection을 어떻게 이동시키는지에 대한 규칙입니다.

#### 4.2.1 단일 인라인 텍스트만 붙여넣는 경우

**상황**: 하나의 `inline-text` 조각만 붙여넣기.

```text
Before:
[paragraph]
  [inline-text: "Hello ▮World"]

Clipboard (text/html → Converter → INode[]):
  [inline-text: "Test"]

Operation:
- "Test"를 caret 위치(Hello와 World 사이)에 삽입

After:
[paragraph]
  [inline-text: "Hello Test▮World"]
```

- **규칙**:  
  - 텍스트 범위가 `collapsed`인 경우, 붙여넣은 텍스트의 **끝**에 caret을 둔다.  
  - Selection 타입은 계속 `range`이며, `collapsed: true`.

#### 4.2.2 여러 블록을 붙여넣는 경우

**상황**: 두 개 이상의 block 노드를 붙여넣기.

```text
Before:
[paragraph-1]
  [inline-text: "Hello"]
[paragraph-2]
  [inline-text: "▮World"]

Clipboard (html/markdown → Converter → INode[]):
  [paragraph-A: "AAA"]
  [paragraph-B: "BBB"]

Operation:
- selection.start 기준으로 paragraph-2 앞에 A, B 삽입

After:
[paragraph-1]
  [inline-text: "Hello"]
[paragraph-A]
  [inline-text: "AAA"]
[paragraph-B]
  [inline-text: "BBB▮"]
[paragraph-2]
  [inline-text: "World"]
```

- **규칙**:
  - 붙여넣은 블록들이 하나 이상이면, **마지막으로 삽입된 블록의 끝**에 caret을 둔다.
  - Selection 타입은 `range`, `collapsed: true`.

#### 4.2.3 텍스트 범위가 선택된 상태에서 붙여넣기 (치환)

```text
Before:
[paragraph]
  [inline-text: "He[llo Wo]rld"]   // []: selection range

Clipboard:
  [inline-text: "TEST"]

Operation:
- 선택된 범위를 삭제하고 "TEST" 삽입

After:
[paragraph]
  [inline-text: "HeTEST▮rld"]
```

- **규칙**:
  - range selection이 비어 있지 않은 경우, 먼저 선택된 내용을 삭제 후 붙여넣기.
  - caret은 **붙여넣어진 마지막 인라인 조각의 끝**에 위치.

#### 4.2.4 블록 전체가 선택된 상태에서 붙여넣기 (multi-block range)

```text
Before:
[paragraph-1]
  [inline-text: "[AAA]"]
[paragraph-2]
  [inline-text: "[BBB]"]
// selection: paragraph-1 끝 ~ paragraph-2 끝

Clipboard:
  [paragraph-X: "X"]

Operation:
- paragraph-1, paragraph-2 삭제
- paragraph-X 삽입

After:
[paragraph-X]
  [inline-text: "X▮"]
```

- **규칙**:
  - 선택 범위가 여러 블록을 포함하는 경우, 해당 블록들을 삭제하고 붙여넣은 블록들로 대체.
  - caret은 마지막으로 삽입된 블록의 끝에 위치.

---

## 5. 구현 순서

### Phase 0: Converter 패키지 생성
1. `@barocss/converter` 패키지 생성
2. `HTMLConverter` 클래스 구현
3. 변환 규칙 인터페이스 정의 (`ConverterRule`, `ParseDOMRule`)
4. 기본 변환 규칙 정의 (`DEFAULT_HTML_RULES`)
5. 테스트 코드 작성

### Phase 1: DataStore 레이어
1. `SerializationOperations` 클래스 생성
2. `serializeRange()` 구현 (JSON 직렬화만)
3. `deserializeNodes()` 구현 (JSON 역직렬화만)
4. `DataStore`에 메서드 노출
5. 테스트 코드 작성

### Phase 2: Model 레이어
1. `copy`, `paste`, `cut` operation 정의
2. DSL 함수 정의
3. `register-operations.ts`에 등록
4. 테스트 코드 작성

### Phase 3: Extensions 레이어
1. `CopyPasteExtension` 생성
2. `copy`, `paste`, `cut` command 구현
3. **Converter 패키지를 사용한 HTML 변환 구현**
4. 클립보드 API 통합
5. 키 바인딩 등록
6. 테스트 코드 작성

### Phase 4: 통합 테스트
1. 전체 플로우 테스트
2. 다양한 형식 (JSON, HTML, Text) 테스트
3. Cross-node 범위 테스트
4. Marks 보존 테스트

---

## 6. 고려사항

### 6.1 클립보드 형식 우선순위
1. **JSON 형식** (우선): 모델 구조 완전 보존
2. **HTML 형식**: 외부 애플리케이션과 호환성 (Extension 레이어에서 JSON ↔ HTML 변환)
3. **텍스트 형식**: Fallback (Extension 레이어에서 JSON ↔ 텍스트 변환)

### 6.2 HTML 직렬화/역직렬화 위치
- **DataStore 레이어**: JSON 직렬화/역직렬화만 담당 (모델 데이터만 알고 있음)
- **Converter 패키지**: HTML ↔ JSON 변환 담당
  - 변환 규칙 정의 및 등록
  - HTML 태그 → 노드 타입 매핑
  - HTML 태그 → Marks 매핑
  - Renderer-DOM의 실제 렌더링과는 다름 (의미론적 HTML)
- **Extension 레이어**: Converter 패키지를 사용하여 변환 수행

### 6.3 Converter 패키지 기반 변환

**우리 접근 방식**:
- **Converter 패키지**: 변환 규칙 정의 및 실제 변환 로직 담당
- **Schema**: 모델 구조만 정의 (변환 규칙 없음)
- **느슨한 결합**: Converter가 Schema의 노드 타입 이름만 참조

**장점**:
1. **명확한 책임 분리**: Schema는 모델 구조만, Converter는 변환만
2. **Schema의 순수성**: Schema가 변환 로직에 의존하지 않음
3. **Converter 독립성**: Converter가 Schema 없이도 동작 가능 (기본 규칙 사용)
4. **확장성**: 새로운 변환 형식 추가가 쉬움 (Markdown, RTF 등)
5. **재사용성**: Converter를 다른 프로젝트에서도 사용 가능

**사용 예시**:
```typescript
// Converter 패키지에서 변환 규칙 정의
import { HTMLConverter } from '@barocss/converter';
import { DEFAULT_HTML_RULES } from '@barocss/converter/rules';

const converter = new HTMLConverter();

// 기본 규칙 등록
DEFAULT_HTML_RULES.forEach(rule => {
  converter.registerRule(rule.stype, rule);
});

// Schema 참조 (노드 타입 이름 확인용)
converter.useSchema(schema);

// 변환 사용
const nodes = converter.parse(html, 'html');
const html = converter.convert(nodes, 'html');
```

### 6.4 외부 HTML 붙여넣기 처리

**문제점**:
- 외부 애플리케이션(브라우저, 워드프로세서 등)에서 복사한 HTML은 우리 모델 구조와 다를 수 있음
- 예: `<div><p><strong>Hello</strong> World</p></div>` (외부 HTML)
- 우리 모델: `paragraph` → `inline-text` (marks: bold)

**처리 전략**:

1. **HTML 정리 (Cleaning)**:
   - 불필요한 래퍼 태그 제거 (`<div><p>...</p></div>` → `<p>...</p>`)
   - 인라인 스타일 제거 (`style="..."`)
   - 클래스명 제거 (`class="..."`)
   - `<script>`, `<style>` 태그 제거

2. **태그 매핑**:
   - 기본 HTML 태그 → 노드 타입 매핑 (Extension에서 정의)
   - 알 수 없는 태그 처리:
     - Block 요소 → `paragraph`로 변환
     - Inline 요소 → 텍스트만 추출하여 `inline-text`로 변환

3. **스키마 검증**:
   - 스키마에 있는 노드 타입: 그대로 사용
   - 스키마에 없는 노드 타입: 기본 타입으로 변환
   - 예: `<div>` → `paragraph` (block으로 처리)

4. **Marks 처리**:
   - HTML 태그 → Marks 매핑 (`<strong>` → `bold`)
   - 중첩된 Marks 처리 (`<strong><em>...</em></strong>` → `bold` + `italic`)

5. **커스터마이징**:
   - Extension에서 `_getNodeTypeFromHTMLTag()` 오버라이드 가능
   - Extension에서 `_getMarkFromHTMLTag()` 오버라이드 가능
   - 특정 HTML 구조를 특별히 처리할 수 있음

**예시: 외부 HTML 처리**

```typescript
// 외부에서 복사한 HTML
const externalHTML = `
  <div style="color: red;">
    <p><strong>Hello</strong> <em>World</em></p>
    <h1>Title</h1>
  </div>
`;

// 1. 정리 후
// <p><strong>Hello</strong> <em>World</em></p>
// <h1>Title</h1>

// 2. 변환 후 (JSON)
[
  {
    stype: 'paragraph',
    content: [
      {
        stype: 'inline-text',
        text: 'Hello',
        marks: [{ stype: 'bold', range: [0, 5] }]
      },
      {
        stype: 'inline-text',
        text: ' ',
        marks: []
      },
      {
        stype: 'inline-text',
        text: 'World',
        marks: [{ stype: 'italic', range: [0, 5] }]
      }
    ]
  },
  {
    stype: 'heading',
    attributes: { level: 1 },
    content: [
      {
        stype: 'inline-text',
        text: 'Title',
        marks: []
      }
    ]
  }
]
```

### 6.2 붙여넣기 위치 결정
- `targetRange.startNodeId`와 `targetRange.startOffset`을 기준으로 삽입
- 텍스트 노드 내부: 텍스트 삽입
- 블록 노드 사이: 새 블록 삽입

### 6.3 Marks 보존
- 복사 시: Marks 정보 포함
- 붙여넣기 시: Marks 정보 복원
- HTML 파싱 시: HTML 태그를 Marks로 변환

### 6.4 보안 고려사항
- 클립보드 읽기/쓰기는 사용자 제스처(키 입력 등)에서만 허용
- HTML 파싱 시 XSS 방지

### 6.5 클립보드 API 상세 구현

**ClipboardItem API 사용**:
```typescript
private async _writeToClipboard(data: { json: INode[]; html: string; text: string }): Promise<void> {
  try {
    // ClipboardItem API 사용 (최신 브라우저)
    if (navigator.clipboard && navigator.clipboard.write) {
      const clipboardItems: ClipboardItem[] = [];
      
      // 여러 형식 동시 저장
      if (data.text) {
        clipboardItems.push(new ClipboardItem({
          'text/plain': new Blob([data.text], { type: 'text/plain' })
        }));
      }
      
      if (data.html) {
        clipboardItems.push(new ClipboardItem({
          'text/html': new Blob([data.html], { type: 'text/html' })
        }));
      }
      
      if (data.json) {
        clipboardItems.push(new ClipboardItem({
          'application/json': new Blob([JSON.stringify(data.json)], { type: 'application/json' })
        }));
      }
      
      await navigator.clipboard.write(clipboardItems);
      return;
    }
    
    // Fallback: document.execCommand('copy')
    // textarea를 사용하여 텍스트만 복사
    const textarea = document.createElement('textarea');
    textarea.value = data.text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  } catch (error) {
    console.error('Failed to write to clipboard:', error);
    throw error;
  }
}
```

**클립보드 읽기**:
```typescript
private async _readFromClipboard(): Promise<ClipboardData> {
  try {
    // ClipboardItem API 사용 (최신 브라우저)
    if (navigator.clipboard && navigator.clipboard.read) {
      const clipboardItems = await navigator.clipboard.read();
      const data: ClipboardData = {};
      
      for (const item of clipboardItems) {
        for (const type of item.types) {
          if (type === 'text/plain') {
            data.text = await item.getType('text/plain').then(blob => blob.text());
          } else if (type === 'text/html') {
            data.html = await item.getType('text/html').then(blob => blob.text());
          } else if (type === 'application/json') {
            data.json = await item.getType('application/json')
              .then(blob => blob.text())
              .then(text => JSON.parse(text));
          }
        }
      }
      
      return data;
    }
    
    // Fallback: paste 이벤트의 clipboardData 사용
    // (이벤트 핸들러에서 처리)
    return {};
  } catch (error) {
    console.error('Failed to read from clipboard:', error);
    throw error;
  }
}
```

**보안 제약사항**:
- HTTPS 또는 localhost에서만 Clipboard API 사용 가능
- 사용자 제스처(키 입력, 마우스 클릭 등)에서만 호출 가능
- 권한 요청이 필요할 수 있음 (일부 브라우저)

### 6.6 붙여넣기 후 Selection 위치 결정

**규칙**:
1. **텍스트 노드 내부 붙여넣기**: 삽입된 텍스트의 끝 위치로 커서 이동
2. **블록 노드 사이 붙여넣기**: 마지막 삽입된 블록의 끝으로 커서 이동
3. **여러 노드 붙여넣기**: 마지막 노드의 끝으로 커서 이동

**구현 예시**:
```typescript
private _createSelectionAfterPaste(
  originalSelection: ModelSelection,
  insertedNodeIds: string[]
): ModelSelection {
  if (insertedNodeIds.length === 0) {
    return originalSelection;
  }
  
  // 마지막 삽입된 노드 찾기
  const lastNodeId = insertedNodeIds[insertedNodeIds.length - 1];
  const lastNode = this.editor.dataStore.getNode(lastNodeId);
  
  if (!lastNode) {
    return originalSelection;
  }
  
  // 텍스트 노드인 경우: 텍스트 끝으로 커서 이동
  if (lastNode.text !== undefined) {
    const textLength = lastNode.text.length;
    return {
      type: 'range',
      startNodeId: lastNodeId,
      startOffset: textLength,
      endNodeId: lastNodeId,
      endOffset: textLength,
      collapsed: true
    };
  }
  
  // 블록 노드인 경우: 노드의 끝으로 커서 이동
  // (블록 노드의 마지막 텍스트 노드 찾기)
  const lastTextNode = this._findLastTextNode(lastNodeId);
  if (lastTextNode) {
    const textLength = lastTextNode.text?.length || 0;
    return {
      type: 'range',
      startNodeId: lastTextNode.sid!,
      startOffset: textLength,
      endNodeId: lastTextNode.sid!,
      endOffset: textLength,
      collapsed: true
    };
  }
  
  // Fallback: 원래 selection 유지
  return originalSelection;
}

private _findLastTextNode(nodeId: string): INode | null {
  const node = this.editor.dataStore.getNode(nodeId);
  if (!node) return null;
  
  if (node.text !== undefined) {
    return node;
  }
  
  if (node.content && Array.isArray(node.content)) {
    // content 배열의 마지막 요소부터 역순으로 탐색
    for (let i = node.content.length - 1; i >= 0; i--) {
      const childId = node.content[i];
      if (typeof childId === 'string') {
        const child = this._findLastTextNode(childId);
        if (child) return child;
      }
    }
  }
  
  return null;
}
```

### 6.7 에러 처리 및 예외 상황

**클립보드 접근 실패**:
```typescript
try {
  await this._writeToClipboard(data);
} catch (error) {
  // 사용자에게 알림 (선택사항)
  console.error('Failed to copy to clipboard:', error);
  // Fallback: document.execCommand('copy') 시도
  // 또는 사용자에게 수동 복사 안내
}
```

**변환 실패**:
```typescript
try {
  const json = await this._clipboardDataToJSON(clipboardData);
  if (json.length === 0) {
    // 변환 실패: 텍스트만 추출하여 기본 paragraph로 생성
    return this._textToJSON(clipboardData.text || '');
  }
  return json;
} catch (error) {
  console.error('Failed to convert clipboard data:', error);
  // Fallback: 텍스트만 추출
  return this._textToJSON(clipboardData.text || '');
}
```

**스키마 검증 실패**:
```typescript
try {
  const insertedNodeIds = editor.dataStore.deserializeNodes(json, targetParentId, targetPosition);
  // 성공
} catch (error) {
  // 스키마 검증 실패: 기본 타입으로 변환 후 재시도
  const sanitizedJson = this._sanitizeNodesForSchema(json, editor.dataStore.getActiveSchema());
  const insertedNodeIds = editor.dataStore.deserializeNodes(sanitizedJson, targetParentId, targetPosition);
}
```

### 6.8 성능 최적화

**큰 문서 복사 시**:
- 직렬화 시 깊은 복사 최소화
- JSON.stringify 최적화 (순환 참조 처리)
- 클립보드에 저장할 때만 직렬화 (필요한 시점에만)

**복잡한 HTML 파싱 시**:
- HTML 정리 단계에서 불필요한 태그 조기 제거
- DOM 파싱 결과 캐싱 (동일한 HTML 재사용 시)
- 비동기 파싱 (큰 HTML의 경우)

### 6.9 사용자 피드백

**복사 성공 시**:
- 시각적 피드백 (선택사항): 토스트 메시지, 애니메이션 등
- 접근성: 스크린 리더 알림

**붙여넣기 실패 시**:
- 사용자에게 명확한 오류 메시지
- Fallback 동작 안내

### 6.10 브라우저 호환성

**Clipboard API 지원**:
- Chrome 66+, Edge 79+, Firefox 63+, Safari 13.1+
- Fallback: `document.execCommand('copy')` (구형 브라우저)

**paste 이벤트 Fallback**:
```typescript
// editor-view-dom에서 paste 이벤트 처리
handlePaste(event: ClipboardEvent): void {
  const clipboardData = event.clipboardData;
  if (!clipboardData) return;
  
  // Clipboard API를 사용할 수 없는 경우 paste 이벤트의 clipboardData 사용
  const data: ClipboardData = {
    text: clipboardData.getData('text/plain'),
    html: clipboardData.getData('text/html'),
    json: null // paste 이벤트에서는 JSON 형식 지원 안 함
  };
  
  // paste command 실행
  this.editor.executeCommand('paste', { clipboardData: data });
}
```

---

## 7. 관련 문서
- [Delete Extension Spec](./delete-extension-responsibilities.md)
- [Range Operations Spec](../datastore/docs/range-operations.md)
- [Model Operations Spec](../model/docs/operations.md)

