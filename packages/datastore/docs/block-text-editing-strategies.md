# Block 노드 내부 텍스트 편집 전략

## 개요

이 문서는 `codeBlock`, `mathBlock`(수식), `formula` 등 `.text` 필드를 가지고 있지만 `group: 'block'`인 노드의 편집 방식을 다룹니다. 다른 에디터들의 접근 방식을 분석하고, Barocss Editor에서의 해결 방안을 제시합니다.

---

## 1. 문제 상황

### 1.1 특수한 Block 노드들

다음과 같은 노드들은 특수한 편집 요구사항을 가집니다:

- **codeBlock**: 코드 편집 (구문 강조, 자동 완성 등)
- **mathBlock**: 수식 편집 (LaTeX, MathML 등)
- **formula**: 수식 편집 (Excel 스타일)
- **table**: 테이블 편집 (셀 편집)
- **canvas**: 캔버스 편집 (그리기 도구)

**공통 특징:**
- `group: 'block'` (block 노드)
- `.text` 필드 또는 내부 텍스트 포함
- **일반 텍스트 편집과는 다른 편집 방식 필요**

### 1.2 현재 Barocss Editor의 동작

**현재 상태:**
- `_isEditableNode`는 `group: 'block'`이면 `false` 반환
- `getPreviousEditableNode` / `getNextEditableNode`에서 건너뜀
- **커서로 탐색 불가능**

**문제:**
- codeBlock 내부 텍스트를 편집하려면?
- 수식 블록을 편집하려면?
- 다른 편집기를 제공해야 하는가?

---

## 2. 다른 에디터들의 접근 방식

### 2.1 ProseMirror

**방식:**
- **코드 블록 내부 편집 허용**: `contentEditable`을 유지하되, 특수한 입력 핸들러 제공
- **구문 강조**: 별도의 하이라이터와 통합 (CodeMirror 등)
- **수식**: 별도의 수식 에디터 컴포넌트 (KaTeX, MathQuill 등)

**특징:**
- Block 노드 내부에 커서 진입 가능
- 하지만 특수한 입력 처리가 필요
- 플러그인 시스템으로 확장 가능

**예시:**
```typescript
// ProseMirror code block
{
  type: 'code_block',
  content: [
    { type: 'text', text: 'const x = 1;' }
  ]
}
// 내부 텍스트 편집 가능, 하지만 특수한 입력 처리 필요
```

### 2.2 Notion

**방식:**
- **하이브리드 접근**: 
  - 클릭하면 전체 블록 선택 (Node Selection)
  - 더블 클릭 또는 Enter 키로 내부 편집 모드 전환
  - 편집 모드에서는 별도의 에디터 UI 제공

**특징:**
- 코드 블록: CodeMirror 통합
- 수식 블록: LaTeX 에디터 통합
- 테이블: 셀별 편집 모드

**예시:**
```
1. 코드 블록 클릭 → 전체 선택
2. 더블 클릭 또는 Enter → 편집 모드
3. CodeMirror 에디터 표시
4. Esc 또는 블록 외부 클릭 → 편집 모드 종료
```

### 2.3 Google Docs

**방식:**
- **인라인 편집**: 코드 블록 내부에 직접 커서 진입 가능
- **특수 포맷팅**: 코드 블록은 단순히 스타일링된 텍스트
- **수식**: 별도의 수식 에디터 (Equation Editor)

**특징:**
- Block 노드 내부 텍스트를 일반 텍스트처럼 편집
- 특수 기능(구문 강조 등)은 제한적

### 2.4 Slate.js

**방식:**
- **커스텀 에디터 컴포넌트**: Block 노드에 커스텀 렌더러 연결
- **별도 에디터 인스턴스**: CodeMirror, Monaco Editor 등 통합
- **이벤트 위임**: Block 노드 클릭 시 커스텀 에디터 활성화

**특징:**
- Block 노드 자체는 편집 불가능
- 클릭 시 별도 에디터 UI 표시
- 에디터와 모델 동기화 필요

### 2.5 Draft.js

**방식:**
- **커스텀 블록 렌더러**: Block 노드마다 커스텀 컴포넌트
- **별도 에디터**: 코드 블록은 CodeMirror, 수식은 MathQuill
- **상태 관리**: Block 내부 상태를 별도로 관리

**특징:**
- Block 노드는 "원자적"으로 취급
- 내부 편집은 별도 에디터에서 처리
- 모델과 에디터 간 동기화 필요

---

## 3. Barocss Editor 해결 방안

### 3.1 옵션 1: Editable Block 노드 지원 (추천)

**개념:**
- `group: 'block'`이지만 `.text` 필드가 있으면 "Editable Block"으로 분류
- 내부 텍스트 편집 가능하지만, 특수한 입력 처리 필요

**구현:**
```typescript
// _isEditableNode 수정
private _isEditableNode(nodeId: string): boolean {
  const node = this.dataStore.getNode(nodeId);
  if (!node) return false;

  const schema = this.dataStore.getActiveSchema();
  if (schema) {
    const nodeType = schema.getNodeType(node.stype);
    if (nodeType) {
      const group = nodeType.group;
      
      // Editable Block: block이지만 editable=true이면 편집 가능
      if (group === 'block' && nodeType.editable === true) {
        // .text 필드가 있어야 편집 가능
        if (node.text !== undefined && typeof node.text === 'string') {
          return true; // 편집 가능한 block
        }
        return false;
      }
      
      if (group === 'block' || group === 'document') {
        return false; // 일반 block은 편집 불가능
      }
      if (group === 'inline') {
        return true;
      }
    }
  }
  
  // ... 나머지 로직
}
```

**스키마 정의:**
```typescript
{
  'codeBlock': {
    name: 'codeBlock',
    group: 'block',
    editable: true, // 내부 텍스트 편집 가능
    content: 'text*',
    attrs: {
      language: { type: 'string', default: 'text' }
    }
  },
  'mathBlock': {
    name: 'mathBlock',
    group: 'block',
    editable: true,
    attrs: {
      tex: { type: 'string' },
      engine: { type: 'string', default: 'katex' }
    }
  }
}
```

**장점:**
- 커서로 탐색 가능
- 기존 `getPreviousEditableNode` 로직 재사용
- 특수 입력 처리는 별도 Extension에서 처리

**단점:**
- Block 노드 내부 편집 시 특수한 입력 처리 필요
- 구문 강조, 자동 완성 등은 별도 구현 필요

### 3.2 옵션 2: 별도 에디터 컴포넌트 (Notion 스타일)

**개념:**
- Block 노드는 편집 불가능 (현재와 동일)
- 클릭/더블 클릭 시 별도 에디터 UI 표시
- External Component 시스템 활용

**구현:**
```typescript
// codeBlock 렌더러
define('codeBlock', (model) => {
  const isEditing = model.metadata?.isEditing || false;
  
  if (isEditing) {
    // 편집 모드: CodeMirror 에디터 표시
    return element('div', { 
      className: 'code-block-editor',
      'data-bc-component': 'codeMirror',
      'data-bc-props': JSON.stringify({
        value: model.text,
        language: model.attributes.language,
        onChange: (newText) => {
          // 모델 업데이트
          editor.executeCommand('updateNode', {
            nodeId: model.sid,
            updates: { text: newText }
          });
        }
      })
    });
  } else {
    // 표시 모드: 하이라이트된 코드 표시
    return element('pre', { className: 'code-block' }, [
      element('code', { 'data-language': model.attributes.language }, [
        text(model.text)
      ])
    ]);
  }
});
```

**사용자 인터랙션:**
1. 코드 블록 클릭 → 전체 선택 (Node Selection)
2. 더블 클릭 또는 Enter → `isEditing: true` 설정
3. CodeMirror 에디터 표시
4. Esc 또는 외부 클릭 → `isEditing: false` 설정

**장점:**
- 강력한 에디터 기능 (구문 강조, 자동 완성 등)
- 기존 에디터 라이브러리 재사용 가능
- Block 노드 구조 유지

**단점:**
- 모델과 에디터 간 동기화 필요
- 편집 모드 전환 로직 필요
- External Component 시스템 활용 필요

### 3.3 옵션 3: 하이브리드 접근 (추천)

**개념:**
- **일반 편집**: 커서로 탐색 가능 (옵션 1)
- **고급 편집**: 더블 클릭 시 별도 에디터 (옵션 2)
- 사용자가 선택 가능

**구현:**
```typescript
// 스키마 정의
{
  'codeBlock': {
    name: 'codeBlock',
    group: 'block',
    editable: true,        // 기본 편집 가능
    advancedEditor: 'codeMirror', // 고급 에디터 타입
    attrs: {
      language: { type: 'string', default: 'text' }
    }
  }
}

// 편집 모드 전환
editor.registerCommand({
  name: 'toggleBlockEditor',
  execute: (editor, payload: { nodeId: string }) => {
    const node = editor.dataStore.getNode(payload.nodeId);
    if (!node) return false;
    
    const nodeType = editor.schema.getNodeType(node.stype);
    if (nodeType?.advancedEditor) {
      // 고급 에디터 모드로 전환
      editor.setNodeMetadata(payload.nodeId, { 
        isEditing: true,
        editorType: nodeType.advancedEditor
      });
      return true;
    }
    return false;
  }
});
```

**사용자 경험:**
1. **기본 모드**: 커서로 탐색 가능, 일반 텍스트 편집
2. **더블 클릭**: 고급 에디터 모드 전환
3. **고급 모드**: CodeMirror, MathQuill 등 전문 에디터 표시

**장점:**
- 유연성: 사용자가 편집 방식 선택
- 기본 편집은 간단하게
- 고급 기능은 전문 에디터 활용

---

## 4. 구체적인 구현 방안

### 4.1 codeBlock 편집

#### 방안 A: 기본 텍스트 편집 (간단)

```typescript
// _isEditableNode에서 editable 지원
if (group === 'block' && node.text !== undefined && nodeType.editable) {
  return true; // 편집 가능
}

// 편집 시 일반 텍스트 편집과 동일하게 처리
// 구문 강조는 렌더링 시에만 적용 (읽기 전용)
```

**장점:**
- 구현 간단
- 커서 탐색 가능
- 기존 로직 재사용

**단점:**
- 구문 강조는 읽기 전용
- 자동 완성 등 고급 기능 없음

#### 방안 B: CodeMirror 통합 (고급)

```typescript
// External Component로 CodeMirror 통합
registry.registerComponent('codeMirror', {
  mount(container, props) {
    const editor = CodeMirror(container, {
      value: props.value,
      mode: props.language,
      lineNumbers: true
    });
    
    editor.on('change', () => {
      props.onChange(editor.getValue());
    });
    
    return container;
  },
  update(element, prevProps, nextProps) {
    if (prevProps.value !== nextProps.value) {
      const editor = element.querySelector('.CodeMirror')?.CodeMirror;
      if (editor) {
        editor.setValue(nextProps.value);
      }
    }
  },
  managesDOM: true
});
```

**장점:**
- 전문적인 코드 편집 기능
- 구문 강조, 자동 완성 등

**단점:**
- 구현 복잡
- 모델 동기화 필요

### 4.2 mathBlock 편집

#### 방안 A: LaTeX 텍스트 편집

```typescript
// 기본 텍스트 편집 (LaTeX 소스)
{
  stype: 'mathBlock',
  text: 'E=mc^2',
  attributes: { engine: 'katex' }
}

// 렌더링 시 KaTeX로 수식 렌더링
// 편집 시에는 LaTeX 소스 편집
```

**장점:**
- 구현 간단
- LaTeX 소스 직접 편집

**단점:**
- 시각적 수식 편집 불가능
- LaTeX 문법 학습 필요

#### 방안 B: MathQuill 통합 (고급)

```typescript
// MathQuill 에디터 통합
registry.registerComponent('mathQuill', {
  mount(container, props) {
    const mathField = MQ.MathField(container, {
      spaceBehavesLikeTab: true,
      handlers: {
        edit: () => {
          props.onChange(mathField.latex());
        }
      }
    });
    
    mathField.latex(props.value);
    return container;
  },
  managesDOM: true
});
```

**장점:**
- 시각적 수식 편집
- LaTeX 자동 변환

**단점:**
- 구현 복잡
- MathQuill 라이브러리 의존성

### 4.3 formula 편집 (Excel 스타일)

```typescript
// Excel 스타일 수식 편집
{
  stype: 'formula',
  text: '=SUM(A1:A10)',
  attributes: { 
    type: 'excel',
    references: ['A1', 'A10']
  }
}

// 별도 수식 에디터 필요
// 셀 참조 자동 완성, 수식 검증 등
```

---

## 5. 추천 구현 전략

### 5.1 단계별 구현

#### Phase 1: 기본 지원 (현재)
- ✅ Block 노드는 편집 불가능 (건너뜀)
- ✅ 내부 inline 노드만 편집 가능

#### Phase 2: Editable Block 지원
- `editable: true` 속성 추가
- `_isEditableNode`에서 editable 확인
- 기본 텍스트 편집 지원

#### Phase 3: 고급 에디터 통합
- External Component 시스템 활용
- CodeMirror, MathQuill 등 통합
- 편집 모드 전환 로직

### 5.2 스키마 확장

```typescript
interface NodeTypeDefinition {
  name: string;
  group?: 'block' | 'inline' | 'document';
  editable?: boolean;        // block이지만 내부 텍스트 편집 가능
  advancedEditor?: string;        // 고급 에디터 타입 (codeMirror, mathQuill 등)
  content?: string;
  attrs?: Record<string, AttributeDefinition>;
  // ...
}
```

### 5.3 편집 모드 관리

**중요: 편집 상태는 메모리에만 저장**

편집 상태(`isEditing`, `editorType` 등)는 **영구 저장되지 않습니다**. 대신 `ComponentManager`의 `BaseComponentState`에 저장됩니다.

**구조:**
```typescript
// INode.metadata: 영구 저장용 (예: loadedAt, lastEditedBy 등)
interface INode {
  metadata?: {
    loadedAt?: string;           // 영구 저장
    lastEditedBy?: string;        // 영구 저장
    // ...
  };
}

// ComponentManager의 BaseComponentState: 일시적 상태 (메모리만)
ComponentManager
  └── componentInstances: Map<string, ComponentInstance>
        └── key: sid
        └── value: ComponentInstance
              └── __stateInstance: BaseComponentState
                    └── data: {
                          isEditing?: boolean;      // 편집 모드 여부 (메모리만)
                          editorType?: string;      // 사용 중인 에디터 타입 (메모리만)
                          // ...
                        }
```

**편집 상태 접근:**
```typescript
// ComponentManager를 통해 편집 상태 접근
// EditorViewDOM에서 ComponentManager 접근 (내부 메서드)
const componentManager = (editorViewDOM as any)._domRenderer?.getComponentManager();
if (!componentManager) {
  console.warn('ComponentManager not available');
  return;
}

// 특정 노드의 ComponentInstance 가져오기
const instance = componentManager.getComponentInstance(nodeId);
const state = instance?.__stateInstance;

if (state) {
  // 편집 상태 확인
  const isEditing = state.get('isEditing') || false;
  const editorType = state.get('editorType');
  
  // 편집 상태 설정
  state.set({ 
    isEditing: true, 
    editorType: 'codeMirror' 
  });
  
  // 편집 상태 해제
  state.set({ 
    isEditing: false,
    editorType: undefined
  });
}
```

**편집 상태 관리 유틸리티 함수 예시:**
```typescript
// Extension 또는 Command에서 사용
function toggleBlockEditorMode(
  editor: Editor, 
  nodeId: string, 
  editorType?: string
): boolean {
  const editorViewDOM = (editor as any)._viewDOM;
  if (!editorViewDOM) return false;
  
  const componentManager = (editorViewDOM as any)._domRenderer?.getComponentManager();
  if (!componentManager) return false;
  
  const instance = componentManager.getComponentInstance(nodeId);
  const state = instance?.__stateInstance;
  if (!state) return false;
  
  const isEditing = state.get('isEditing') || false;
  
  if (isEditing) {
    // 편집 모드 종료
    state.set({ isEditing: false, editorType: undefined });
  } else {
    // 편집 모드 시작
    state.set({ isEditing: true, editorType: editorType || 'default' });
  }
  
  return true;
}
```

---

## 6. 사용자 경험 시나리오

### 6.1 codeBlock 편집

**시나리오 1: 기본 편집**
```
1. 코드 블록에 커서 이동 (화살표 키)
2. 텍스트 입력/삭제 가능
3. 구문 강조는 렌더링 시에만 적용
```

**시나리오 2: 고급 편집**
```
1. 코드 블록 더블 클릭
2. CodeMirror 에디터 표시
3. 구문 강조, 자동 완성 등 사용 가능
4. Esc 또는 외부 클릭으로 종료
```

### 6.2 mathBlock 편집

**시나리오 1: LaTeX 편집**
```
1. 수식 블록에 커서 이동
2. LaTeX 소스 직접 편집: E=mc^{2}
3. 렌더링 시 수식으로 표시
```

**시나리오 2: 시각적 편집**
```
1. 수식 블록 더블 클릭
2. MathQuill 에디터 표시
3. 시각적으로 수식 편집
4. LaTeX로 자동 변환
```

---

## 7. 구현 체크리스트

### Phase 1: Editable Block 기본 지원
- [ ] 스키마에 `editable` 속성 추가
- [ ] `_isEditableNode`에서 `editable` 확인
- [ ] `getPreviousEditableNode` / `getNextEditableNode`에서 editable 포함
- [ ] 기본 텍스트 편집 테스트

### Phase 2: 편집 모드 전환
- [ ] 노드 메타데이터에 `isEditing` 상태 관리
- [ ] 더블 클릭 이벤트 처리
- [ ] 편집 모드 전환 Command
- [ ] UI 상태 업데이트

### Phase 3: 고급 에디터 통합
- [ ] External Component 시스템 확장
- [ ] CodeMirror 통합
- [ ] MathQuill 통합
- [ ] 모델 동기화 로직

---

## 8. 참고 자료

- ProseMirror Code Block: https://prosemirror.net/docs/guide/#code
- Notion Code Block: 사용자 경험 관찰
- Slate.js Custom Blocks: https://docs.slatejs.org/concepts/10-customizing-editor
- CodeMirror: https://codemirror.net/
- MathQuill: http://mathquill.com/

---

## 9. 결론

**추천 방안: 하이브리드 접근**

1. **기본 편집**: `editable: true`로 커서 탐색 및 기본 텍스트 편집 지원
2. **고급 편집**: 더블 클릭 시 External Component로 전문 에디터 표시
3. **사용자 선택**: 사용자가 편집 방식을 선택할 수 있음

이 방식은:
- ✅ 기본 편집은 간단하게
- ✅ 고급 기능은 전문 에디터 활용
- ✅ 유연한 확장성
- ✅ 기존 시스템과의 호환성

