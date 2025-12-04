# Copy/Paste/Cut 구현 준비 상태

## 현재 상태 점검

### ✅ 이미 구현된 기능

1. **RangeIterator**: 범위 내 노드 순회 가능  
   - `dataStore.createRangeIterator(startNodeId, endNodeId, options)`  
   - `extractText()`에서 이미 사용 중

2. **extractText()**: 텍스트 추출 가능  
   - `RangeOperations.extractText(range)` - 텍스트만 추출

3. **createNodeWithChildren()**: 중첩 노드 구조 생성 가능  
   - `CoreOperations.createNodeWithChildren(node)` - `deserializeNodes` 구현에 활용 가능

4. **getNodeWithChildren()**: 노드 트리 구조 가져오기 가능  
   - `QueryOperations.getNodeWithChildren(nodeId)` - `serializeRange` 구현에 활용 가능

5. **processNodeInModelSelection()**: 부분 노드 선택 처리 가능  
   - `RangeOperations`의 private 메서드 - 부분 텍스트 추출에 활용 가능

6. **copyNode()**: 단일 노드 복사 가능  
   - `ContentOperations.copyNode(nodeId, newParentId?)` - 단일 노드 복사

7. **SerializationOperations**: 구현 완료  
   - `SerializationOperations.serializeRange(range: ModelSelection): INode[]`  
   - `SerializationOperations.deserializeNodes(nodes: INode[], targetParentId: string, targetPosition?: number): string[]`  
   - `DataStore.serializeRange(...)`, `DataStore.deserializeNodes(...)` 로 노출됨

8. **@barocss/converter 패키지**: 구현 및 테스트 완료  
   - 핵심 API: `defineParser`, `defineConverter`, `defineASTConverter`, `defineDocumentParser`  
   - 변환기 클래스:
     - `HTMLConverter` (HTML ↔ Model)  
     - `MarkdownConverter` (Markdown/markdown-gfm ↔ Model)  
     - `LatexConverter` (LaTeX ↔ Model)  
   - 기본 규칙:
     - `registerDefaultHTMLRules`, `registerDefaultMarkdownRules`, `registerDefaultLatexRules`  
     - 리스트/테이블/이미지/링크, GFM task list, `data-*` 속성 보존 등
   - 플랫폼별 HTML 정리 및 룰:
     - `OfficeHTMLCleaner`, `registerOfficeHTMLRules`  
     - `GoogleDocsHTMLCleaner`, `registerGoogleDocsHTMLRules`  
     - `NotionHTMLCleaner`, `registerNotionHTMLRules`
   - 테스트:
     - `html-converter.test.ts`, `markdown-converter.test.ts`, `latex-converter.test.ts`  
     - `office-html-converter.test.ts`, `google-docs-html-converter.test.ts`, `notion-html-converter.test.ts`

### ❌ 아직 구현되지 않은 기능

1. **Model Operations**: copy, paste, cut operation 미구현  
   - `copy()` operation (JSON + text 반환, Converter는 사용하지 않음)  
   - `paste()` operation (`INode[]`를 받아 DataStore.deserializeNodes 호출)  
   - `cut()` operation (copy + deleteRange 조합)  
   - 대응되는 DSL 함수들

2. **CopyPasteExtension**: 존재하지 않음  
   - 클립보드 API 통합  
   - copy, paste, cut command 구현  
   - Converter 사용 위치 정리 (아래 3장/4장에서 상세)

---

## 구현 전 추가 연구가 필요한 부분

### 1. serializeRange 구현 전략

**문제점**:
- RangeIterator는 nodeId만 반환하므로, 각 노드를 `getNodeWithChildren()`으로 가져와야 함
- 부분적으로 선택된 노드(예: 텍스트 노드의 일부만 선택)를 어떻게 처리할지
- Cross-node 범위에서 노드 트리 구조를 어떻게 유지할지

**고려사항**:
```typescript
// 예시: 부분 선택된 텍스트 노드
Before:
[paragraph-1]
  [text-1: "Hello World"]
           ↑---선택---↑ (offset 5-11)

serializeRange 후:
[
  {
    stype: 'paragraph',
    content: [
      {
        stype: 'inline-text',
        text: ' Wor'  // 부분 텍스트만 추출
      }
    ]
  }
]
```

**해결 방안**:
1. **부분 노드 처리**: `processNodeInModelSelection()` 활용하여 부분 텍스트만 추출
2. **트리 구조 유지**: 최상위 공통 부모를 찾아서 트리 구조 재구성
3. **노드 분할**: 부분 선택된 노드는 새 노드로 분할하여 직렬화

### 2. deserializeNodes 구현 전략

**문제점**:
- `createNodeWithChildren()`을 사용할 수 있지만, 기존 노드에 삽입하는 로직 필요
- `targetParentId`와 `targetPosition`을 어떻게 계산할지
- 삽입 후 기존 노드와의 관계를 어떻게 설정할지

**고려사항**:
```typescript
// 예시: 텍스트 노드 내부에 붙여넣기
Before:
[text-1: "Hello"]
           ↑ 커서 (offset 5)

붙여넣기: " World"

After:
[text-1: "Hello World"]
                    ↑ 커서 (offset 11)
```

**해결 방안**:
1. **targetParentId 계산**: `selection.startNodeId`의 부모 노드 찾기
2. **targetPosition 계산**: 부모의 `content` 배열에서 `startNodeId`의 위치 찾기
3. **노드 삽입**: `ContentOperations.addChild()` 또는 `createNodeWithChildren()` 활용

### 3. Converter 패키지 API 정리 (copy/paste 관점)

**구현된 시그니처 (copy/paste에서 사용할 부분만 요약)**:

- **HTML → Model**
  ```typescript
  const converter = new HTMLConverter();
  const nodes: INode[] = converter.parse(html, 'html'); // format은 현재 'html'만 허용
  ```

- **Model → HTML**
  ```typescript
  const converter = new HTMLConverter();
  const html: string = converter.convert(nodes, 'html'); // format은 현재 'html'만 허용
  ```

- **Markdown / GFM → Model**
  ```typescript
  const mdConverter = new MarkdownConverter();
  const nodes: INode[] = mdConverter.parse(markdown, 'markdown');     // 기본 markdown
  const gfmNodes: INode[] = mdConverter.parse(markdown, 'markdown-gfm'); // GFM
  ```

- **Model → Markdown**
  ```typescript
  const mdConverter = new MarkdownConverter();
  const markdown: string = mdConverter.convert(nodes, 'markdown');
  ```

- **LaTeX → Model / Model → LaTeX** (필요 시 paste 확장에 활용 가능)
  ```typescript
  const latexConverter = new LatexConverter();
  const nodes: INode[] = latexConverter.parse(latex, 'latex');
  const latexOut: string = latexConverter.convert(nodes, 'latex');
  ```

copy/paste 기본 흐름에서는:

- **copy**: `DataStore.serializeRange` + `DataStore.range.extractText` + `HTMLConverter.convert`  
- **paste**: 클립보드에서 HTML/텍스트/Markdown을 읽고,  
  `HTMLConverter.parse` / `MarkdownConverter.parse` 로 `INode[]`를 만든 뒤 `DataStore.deserializeNodes` 에 전달하는 구조를 사용합니다.

### 4. 붙여넣기 위치 결정 로직

**명확히 해야 할 사항**:
- `_getTargetParentId()`: 어떻게 구현할지
- `_getTargetPosition()`: 어떻게 구현할지
- 텍스트 노드 내부 붙여넣기 vs 블록 노드 사이 붙여넣기

**고려사항**:
```typescript
// 케이스 1: 텍스트 노드 내부
selection: { startNodeId: 'text-1', startOffset: 5 }
→ targetParentId: 'text-1'의 부모 (예: 'paragraph-1')
→ targetPosition: 'paragraph-1.content'에서 'text-1'의 인덱스
→ 하지만 실제로는 텍스트 노드 내부에 삽입해야 함

// 케이스 2: 블록 노드 사이
selection: { startNodeId: 'paragraph-1', startOffset: 0 }
→ targetParentId: 'paragraph-1'의 부모 (예: 'document')
→ targetPosition: 'document.content'에서 'paragraph-1'의 인덱스
→ 'paragraph-1' 앞에 새 블록 삽입
```

### 5. Cross-node 범위 처리

**문제점**:
- 여러 노드가 선택되었을 때, 최상위 공통 부모를 찾아서 트리 구조를 재구성해야 함
- 부분적으로 선택된 노드들을 어떻게 처리할지

**예시**:
```
Before:
[paragraph-1]
  [text-1: "Hello"]
[paragraph-2]
  [text-2: "World"]
         ↑---선택---↑ (text-1의 끝부터 text-2의 offset 3까지)

serializeRange 후:
[
  {
    stype: 'paragraph',
    content: [
      { stype: 'inline-text', text: 'o' }  // text-1의 끝 부분
    ]
  },
  {
    stype: 'paragraph',
    content: [
      { stype: 'inline-text', text: 'Wor' }  // text-2의 시작 부분
    ]
  }
]
```

---

## 구현 준비도 평가

### ✅ 준비 완료
- 기본 인프라: RangeIterator, extractText, createNodeWithChildren 등
- 문서화: 스펙 문서가 상세하게 작성됨
- 아키텍처 결정: Converter 패키지 독립, 순수 객체 방식 등

### ⚠️ 추가 연구 필요
1. **serializeRange 세부 전략**: 부분 노드 처리, 트리 구조 유지 방법 (기본 구현 위에 edge case 보완)  
2. **deserializeNodes 세부 전략**: 다양한 selection 종류에 대한 삽입 위치 계산, 노드 관계 설정  
3. **붙여넣기 위치 결정**: `_getTargetParentId`, `_getTargetPosition` 구체 구현 및 테스트  
4. **copy/paste Model operations**: `copy`/`paste`/`cut` operation과 DSL 정의, Delete/Enter와의 조합 패턴 정리  
5. **CopyPasteExtension 설계**: Converter/클립보드/Model operation 연결 시나리오 테스트 (복합 selection, table/list 등)

---

## 권장 구현 순서

### Phase 0: Converter 패키지 (완료)

**상태**:
- `@barocss/converter` 패키지 생성 및 기본 API/규칙/테스트 구현 완료
- HTML/Markdown/LaTeX + Office/GoogleDocs/Notion HTML 지원 기본 라인 정리

**다음 단계에서 할 일 (copy/paste 관점)**:
- CopyPasteExtension에서 사용할 최소한의 규칙/클리너 조합을 확정
- 필요 시 Schema에 맞는 추가 변환 규칙을 개별 프로젝트에서 정의

### Phase 1: DataStore 레이어 (대부분 완료)
**이유**: 
- Model 레이어에서 사용
- 상대적으로 단순 (기존 인프라 활용 가능)

**작업 (완료)**:
1. `SerializationOperations` 클래스 생성  
2. `serializeRange()` 구현
   - RangeIterator 활용
   - 부분 노드 처리 로직
   - 트리 구조 유지
3. `deserializeNodes()` 구현
   - `createNodeWithChildren()` 활용
   - 삽입 위치 계산
4. 테스트 코드 작성

**추가 보완 필요**:
- 복잡한 cross-node selection, table/list 구조에 대한 serialize/deserialize regression 테스트 보강

### Phase 2: Model 레이어
**이유**: 
- Extensions 레이어에서 사용
- DataStore 기능을 래핑

**작업 (예정)**:
1. `copy`, `paste`, `cut` operation 정의 (Converter에 의존하지 않고 DataStore만 사용)  
2. DSL 함수 정의  
3. `register-operations.ts`에 등록  
4. 테스트 코드 작성 (Delete/Enter/Selection 확장과 동일한 transaction 패턴 사용)

### Phase 3: Extensions 레이어
**이유**: 
- 최종 사용자 인터페이스
- 모든 하위 레이어가 준비된 후 구현

**작업 (예정)**:
1. `CopyPasteExtension` 생성  
2. 클립보드 API 통합  
3. copy, paste, cut command 구현  
   - copy: `transaction` + `copy` operation → `CopyResult(json, text)` → `HTMLConverter.convert` 로 HTML 생성 후 클립보드에 `text/plain`, `text/html`, `application/json` 저장  
   - paste: 클립보드에서 `application/json` / `text/html` / `text/markdown` / `text/plain` 순으로 읽고, Converter로 `INode[]` 생성 후 `paste` operation에 전달  
   - cut: `transaction` + `cut` operation → `CutResult(json, text)` → copy와 동일하게 클립보드 저장  
4. 키 바인딩 등록  
5. 테스트 코드 작성 (브라우저 Clipboard API mock + converter round-trip 검증)

---

## 결론

### ✅ 구현 시작 가능
- 기본 인프라가 준비되어 있음
- 스펙 문서가 상세하게 작성됨
- 구현 전략이 명확함

### ⚠️ 주의사항
1. **Converter 패키지를 먼저 구현**해야 함 (다른 Phase에서 의존)
2. **serializeRange 구현 시 부분 노드 처리**를 신중하게 설계해야 함
3. **deserializeNodes 구현 시 삽입 위치 계산**을 정확히 해야 함

### 📋 다음 단계
1. Converter 패키지 생성 및 기본 구현
2. SerializationOperations 구현
3. Model operations 구현
4. CopyPasteExtension 구현

---

## 참고 문서
- [Copy/Paste/Cut 스펙](./copy-paste-cut-spec.md)
- [Converter 아키텍처](./converter-architecture-options.md)
- [LaTeX Converter 샘플](./converter-latex-sample.md)

