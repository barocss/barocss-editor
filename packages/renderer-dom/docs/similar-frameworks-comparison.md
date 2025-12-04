# 유사한 구조를 가진 UI 라이브러리 비교

## 우리 시스템의 특수성

### 우리가 가진 3가지 데이터 소스

```typescript
interface ComponentContext {
  props: ComponentProps;      // 외부에서 전달되는 데이터 (stype/sid 제외)
  model: ModelData;           // 원본 모델 데이터 (stype/sid 포함)
  state: ComponentState;      // 컴포넌트 내부 상태
}
```

**특징:**
- ✅ **Props**: 부모에서 전달되는 순수 데이터
- ✅ **Model**: 원본 문서 모델 (에디터 데이터와 직접 연결)
- ✅ **State**: 컴포넌트 내부 상태 (UI 상태)

**문제점:**
- 이 세 가지를 동시에 다루는 시스템이 드뭄
- 특히 **에디터/문서 시스템**과 결합된 경우

---

## 유사한 구조를 가진 라이브러리

### 1. ProseMirror ⭐ **가장 유사**

**구조:**
```typescript
// ProseMirror의 NodeView
class MyNodeView {
  constructor(node: Node, view: EditorView, getPos: () => number) {
    this.node = node;        // Model (문서 모델)
    this.view = view;        // Context (에디터 컨텍스트)
    this.state = {};         // State (컴포넌트 내부 상태)
  }
  
  update(node: Node) {
    // node는 model 역할
    // view는 context 역할
    // this.state는 내부 상태
  }
}
```

**비교:**
- ✅ **Model**: `node` (문서 모델, 우리의 `model`과 유사)
- ✅ **Context**: `view` (에디터 컨텍스트, 우리의 `context`와 유사)
- ⚠️ **Props**: 명시적 props 개념 없음 (node 속성으로 처리)
- ✅ **State**: 내부 상태 관리

**차이점:**
- ProseMirror는 **에디터 중심** (문서 모델이 핵심)
- 우리는 **컴포넌트 중심** (props/model/state 분리)

---

### 2. Slate.js

**구조:**
```typescript
// Slate의 Element 컴포넌트
const MyElement = ({ attributes, children, element }) => {
  const [state, setState] = useState({});
  
  // element는 model 역할
  // attributes는 props 역할
  // state는 내부 상태
}
```

**비교:**
- ✅ **Model**: `element` (문서 노드, 우리의 `model`과 유사)
- ✅ **Props**: `attributes` (속성, 우리의 `props`와 유사)
- ✅ **State**: `useState` (내부 상태)
- ⚠️ **Context**: React Context 사용 (명시적 context 없음)

**차이점:**
- Slate는 **React 기반** (React 패턴 따름)
- 우리는 **독립적인 컴포넌트 시스템**

---

### 3. Vue.js (일부 유사)

**구조:**
```typescript
// Vue 컴포넌트
export default {
  props: ['title'],           // Props
  data() {
    return { count: 0 };      // State
  },
  computed: {
    fullTitle() {
      return this.title + ' - ' + this.count;  // Props + State
    }
  }
}
```

**비교:**
- ✅ **Props**: 명시적 props
- ✅ **State**: `data()` (내부 상태)
- ⚠️ **Model**: 없음 (외부 데이터는 props로만 전달)
- ⚠️ **Context**: `provide/inject` (제한적)

**차이점:**
- Vue는 **일반적인 UI 프레임워크** (에디터 특화 아님)
- 우리는 **에디터와 직접 연결** (model이 문서 모델)

---

### 4. Angular (일부 유사)

**구조:**
```typescript
// Angular 컴포넌트
@Component({...})
export class MyComponent {
  @Input() title: string;     // Props
  @Input() model: any;        // Model (명시적)
  
  state = { count: 0 };       // State
  
  constructor(private service: DataService) {
    // Service는 Context 역할
  }
}
```

**비교:**
- ✅ **Props**: `@Input()` (명시적)
- ✅ **Model**: `@Input() model` (명시적, 우리와 유사)
- ✅ **State**: 클래스 속성 (내부 상태)
- ✅ **Context**: Service/DI (의존성 주입)

**차이점:**
- Angular는 **엔터프라이즈 프레임워크** (복잡한 구조)
- 우리는 **에디터 특화** (단순한 구조)

---

### 5. Svelte (일부 유사)

**구조:**
```typescript
// Svelte 컴포넌트
<script>
  export let title;           // Props
  let count = 0;              // State
  
  // Model은 props로 전달
  export let model = {};
</script>
```

**비교:**
- ✅ **Props**: `export let` (명시적)
- ✅ **State**: 일반 변수 (내부 상태)
- ⚠️ **Model**: props로 전달 (명시적 model 개념 없음)
- ⚠️ **Context**: `setContext/getContext` (제한적)

**차이점:**
- Svelte는 **컴파일 타임 최적화** 중심
- 우리는 **런타임 동적 빌드**

---

## 에디터 특화 시스템 비교

### ProseMirror vs 우리 시스템

| 항목 | ProseMirror | 우리 시스템 |
|------|-------------|------------|
| **Model** | ✅ Node (문서 모델) | ✅ ModelData (문서 모델) |
| **Props** | ⚠️ Node 속성으로 처리 | ✅ 명시적 Props |
| **State** | ✅ NodeView 내부 상태 | ✅ ComponentState |
| **Context** | ✅ EditorView | ✅ ComponentContext |
| **렌더링** | ⚠️ 수동 DOM 조작 | ✅ VNode + Reconciler |
| **업데이트** | ⚠️ 수동 업데이트 | ✅ 자동 재렌더링 |

**ProseMirror의 특징:**
- 에디터 중심 아키텍처
- NodeView가 DOM을 직접 관리
- 업데이트는 수동으로 처리

**우리 시스템의 특징:**
- 컴포넌트 중심 아키텍처
- VNode + Reconciler로 자동 관리
- Props/Model/State 명시적 분리

---

### Slate.js vs 우리 시스템

| 항목 | Slate.js | 우리 시스템 |
|------|----------|------------|
| **Model** | ✅ Element (문서 노드) | ✅ ModelData (문서 모델) |
| **Props** | ✅ Attributes | ✅ 명시적 Props |
| **State** | ✅ React useState | ✅ ComponentState |
| **Context** | ⚠️ React Context | ✅ ComponentContext |
| **렌더링** | ✅ React 렌더링 | ✅ VNode + Reconciler |
| **업데이트** | ✅ React 재렌더링 | ✅ 자동 재렌더링 |

**Slate.js의 특징:**
- React 기반 (React 패턴 따름)
- Element가 문서 모델 역할
- React의 props/state 패턴 사용

**우리 시스템의 특징:**
- 독립적인 컴포넌트 시스템
- Props/Model/State 명시적 분리
- 에디터와 직접 연결

---

## 우리 시스템의 독특한 점

### 1. Props/Model/State 명시적 분리

**다른 시스템:**
- Props와 Model이 혼합되어 있음
- 또는 Model이 Props로 전달됨

**우리 시스템:**
```typescript
component(props: ComponentProps, model: ModelData, context: ComponentContext)
```
- ✅ **Props**: 순수 전달 데이터 (stype/sid 제외)
- ✅ **Model**: 원본 문서 모델 (stype/sid 포함)
- ✅ **State**: 컴포넌트 내부 상태

### 2. 에디터와 직접 연결

**다른 시스템:**
- 일반적인 UI 프레임워크 (에디터 특화 아님)
- 또는 에디터 중심 (컴포넌트 시스템 약함)

**우리 시스템:**
- ✅ 에디터 모델과 직접 연결
- ✅ 컴포넌트 시스템 완비
- ✅ Props/Model/State 명시적 분리

### 3. 자동 재렌더링

**다른 시스템:**
- ProseMirror: 수동 업데이트
- Slate.js: React 재렌더링 (React 의존)

**우리 시스템:**
- ✅ 독립적인 재렌더링 시스템
- ✅ VNode + Fiber Reconciler
- ✅ Props/Model/State 변경 자동 감지

---

## 결론

### 유사한 시스템

1. **ProseMirror** ⭐ **가장 유사**
   - 에디터 중심
   - Model/Context/State 개념
   - 하지만 Props 개념 없음

2. **Slate.js**
   - React 기반
   - Element/Attributes/State
   - 하지만 Model이 명시적이지 않음

3. **Angular**
   - Props/Model/State 분리 가능
   - 하지만 에디터 특화 아님

### 우리 시스템의 독특함

**우리가 가진 것:**
- ✅ Props/Model/State **명시적 분리**
- ✅ 에디터와 **직접 연결**
- ✅ **독립적인** 컴포넌트 시스템
- ✅ **자동 재렌더링**

**비슷한 시스템이 있나?**
- ⚠️ **완전히 동일한 구조는 없음**
- ✅ **ProseMirror가 가장 유사** (에디터 중심)
- ✅ **Slate.js가 두 번째로 유사** (React 기반)

**우리 시스템의 가치:**
- Props/Model/State 명시적 분리로 **명확한 데이터 흐름**
- 에디터와 직접 연결로 **일관성 보장**
- 독립적인 시스템으로 **유연성 확보**

---

---

## 상용 에디터 시스템 비교

### 6. Draft.js (Facebook/Meta)

**구조:**
```typescript
// Draft.js의 Custom Block Component
const MyBlock = ({ block, contentState, blockProps }) => {
  const [state, setState] = useState({});
  
  // block은 model 역할
  // blockProps는 props 역할
  // state는 내부 상태
}
```

**비교:**
- ✅ **Model**: `block`, `contentState` (문서 모델)
- ✅ **Props**: `blockProps` (속성)
- ✅ **State**: `useState` (내부 상태)
- ⚠️ **Context**: React Context (제한적)

**특징:**
- React 기반 (Facebook 개발)
- Immutable.js 사용
- 복잡한 상태 관리

**차이점:**
- Draft.js는 **Immutable 기반** (복잡한 상태 관리)
- 우리는 **단순한 객체 기반**

---

### 7. Quill

**구조:**
```typescript
// Quill의 Custom Blot
class MyBlot extends Block {
  static create(value: any) {
    // value는 model 역할
    const node = super.create();
    return node;
  }
  
  constructor(domNode: HTMLElement, value: any) {
    super(domNode);
    this.value = value;  // Model
    this.state = {};     // State
  }
}
```

**비교:**
- ✅ **Model**: `value` (델타 기반 문서 모델)
- ⚠️ **Props**: 없음 (델타로 처리)
- ✅ **State**: 인스턴스 속성 (내부 상태)
- ⚠️ **Context**: Quill 인스턴스 (제한적)

**특징:**
- 델타(Delta) 포맷 사용
- 경량화된 설계
- 플러그인 시스템

**차이점:**
- Quill은 **델타 기반** (변경 사항 추적)
- 우리는 **VNode 기반** (전체 구조 관리)

---

### 8. CKEditor 5

**구조:**
```typescript
// CKEditor 5의 Widget
class MyWidget extends Widget {
  constructor(attributes: any, writer: Writer) {
    super(attributes);
    this.attributes = attributes;  // Props
    this.model = writer;          // Model (문서 모델)
    this.state = {};              // State
  }
  
  upcastElement(element: Element, data: any) {
    // data는 model 역할
  }
}
```

**비교:**
- ✅ **Model**: `writer`, 문서 모델 (에디터 모델)
- ✅ **Props**: `attributes` (속성)
- ✅ **State**: 인스턴스 속성 (내부 상태)
- ⚠️ **Context**: Editor 인스턴스 (제한적)

**특징:**
- 플러그인 기반 아키텍처
- 모듈화된 구조
- 협업 기능 내장

**차이점:**
- CKEditor는 **플러그인 중심** (복잡한 구조)
- 우리는 **컴포넌트 중심** (단순한 구조)

---

### 9. TinyMCE

**구조:**
```typescript
// TinyMCE의 Custom Plugin
tinymce.PluginManager.add('myplugin', (editor, url) => {
  const state = {};  // State
  
  editor.on('init', () => {
    // editor는 context 역할
    // editor.getContent()는 model 역할
  });
  
  return {
    getMetadata: () => ({
      // props 역할
    })
  };
});
```

**비교:**
- ✅ **Model**: `editor.getContent()` (문서 모델)
- ⚠️ **Props**: 플러그인 설정 (명시적 props 없음)
- ✅ **State**: 플러그인 내부 상태
- ✅ **Context**: `editor` (에디터 컨텍스트)

**특징:**
- 플러그인 시스템
- API 중심 설계
- 다양한 기본 플러그인

**차이점:**
- TinyMCE는 **플러그인 중심** (API 기반)
- 우리는 **컴포넌트 중심** (템플릿 기반)

---

### 10. Monaco Editor (VS Code)

**구조:**
```typescript
// Monaco Editor의 Custom Language
monaco.languages.register({
  id: 'mylang',
  extensions: ['.mylang']
});

// Model은 Monaco의 ITextModel
const model = monaco.editor.createModel(content, 'mylang');
// model은 문서 모델 역할
```

**비교:**
- ✅ **Model**: `ITextModel` (문서 모델)
- ⚠️ **Props**: 에디터 옵션 (명시적 props 없음)
- ⚠️ **State**: 에디터 인스턴스 상태 (제한적)
- ⚠️ **Context**: Editor 인스턴스 (제한적)

**특징:**
- 코드 에디터 특화
- VS Code와 동일한 엔진
- 언어 서버 프로토콜 지원

**차이점:**
- Monaco는 **코드 에디터 특화** (텍스트 편집 중심)
- 우리는 **리치 텍스트 에디터** (구조화된 문서)

---

### 11. CodeMirror 6

**구조:**
```typescript
// CodeMirror 6의 Extension
const myExtension = StateField.define({
  create(state: EditorState) {
    // state는 model 역할
    return {};
  },
  
  update(value, tr: Transaction) {
    // tr은 변경 사항
    return value;
  }
});
```

**비교:**
- ✅ **Model**: `EditorState` (문서 모델)
- ⚠️ **Props**: Extension 설정 (명시적 props 없음)
- ✅ **State**: StateField (내부 상태)
- ⚠️ **Context**: EditorView (제한적)

**특징:**
- Extension 기반 아키텍처
- 상태 관리 시스템
- 트랜잭션 기반 업데이트

**차이점:**
- CodeMirror는 **Extension 중심** (상태 필드 기반)
- 우리는 **컴포넌트 중심** (템플릿 기반)

---

### 12. Lexical (Meta/Facebook)

**구조:**
```typescript
// Lexical의 Custom Node
class MyNode extends DecoratorNode {
  constructor(key: string, data: any) {
    super(key);
    this.data = data;  // Model
    this.state = {};   // State
  }
  
  static importJSON(serializedNode: any) {
    // serializedNode는 model 역할
    return new MyNode(serializedNode.key, serializedNode.data);
  }
  
  createDOM(config: EditorConfig): HTMLElement {
    // config는 context 역할
  }
}
```

**비교:**
- ✅ **Model**: `data` (문서 모델)
- ⚠️ **Props**: Node 속성 (명시적 props 없음)
- ✅ **State**: 인스턴스 속성 (내부 상태)
- ✅ **Context**: `EditorConfig` (에디터 컨텍스트)

**특징:**
- React 기반 (Meta 개발)
- 확장 가능한 아키텍처
- 성능 최적화

**차이점:**
- Lexical은 **React 기반** (React 의존)
- 우리는 **독립적인 시스템**

---

### 13. Tiptap (ProseMirror 기반)

**구조:**
```typescript
// Tiptap의 Custom Extension
const MyExtension = Extension.create({
  name: 'myExtension',
  
  addAttributes() {
    return {
      // Props 역할
      title: { default: null }
    };
  },
  
  addNodeView() {
    return ({ node, HTMLAttributes, getPos }) => {
      // node는 model 역할
      // HTMLAttributes는 props 역할
      const [state, setState] = useState({});
      
      return React.createElement('div', {
        // ...
      });
    };
  }
});
```

**비교:**
- ✅ **Model**: `node` (ProseMirror Node)
- ✅ **Props**: `HTMLAttributes` (명시적 props)
- ✅ **State**: `useState` (내부 상태)
- ⚠️ **Context**: Extension 컨텍스트 (제한적)

**특징:**
- ProseMirror 기반
- React 통합
- 확장 가능한 구조

**차이점:**
- Tiptap은 **ProseMirror + React** (두 시스템 결합)
- 우리는 **통합된 단일 시스템**

---

## 종합 비교표

### 에디터 시스템별 Props/Model/State 지원

| 에디터 | Model | Props | State | Context | 특징 |
|--------|-------|-------|-------|---------|------|
| **우리 시스템** | ✅ 명시적 | ✅ 명시적 | ✅ 명시적 | ✅ 명시적 | **완전한 분리** |
| ProseMirror | ✅ Node | ⚠️ Node 속성 | ✅ 내부 상태 | ✅ EditorView | 에디터 중심 |
| Slate.js | ✅ Element | ✅ Attributes | ✅ useState | ⚠️ React Context | React 기반 |
| Draft.js | ✅ ContentState | ✅ BlockProps | ✅ useState | ⚠️ React Context | Immutable 기반 |
| Quill | ✅ Delta | ⚠️ 없음 | ✅ 인스턴스 | ⚠️ Quill 인스턴스 | 델타 기반 |
| CKEditor 5 | ✅ 문서 모델 | ✅ Attributes | ✅ 인스턴스 | ⚠️ Editor | 플러그인 중심 |
| TinyMCE | ✅ Content | ⚠️ 설정 | ✅ 플러그인 | ✅ Editor | API 중심 |
| Monaco | ✅ ITextModel | ⚠️ 옵션 | ⚠️ 제한적 | ⚠️ Editor | 코드 에디터 |
| CodeMirror 6 | ✅ EditorState | ⚠️ Extension 설정 | ✅ StateField | ⚠️ EditorView | Extension 중심 |
| Lexical | ✅ Node Data | ⚠️ Node 속성 | ✅ 인스턴스 | ✅ EditorConfig | React 기반 |
| Tiptap | ✅ Node | ✅ HTMLAttributes | ✅ useState | ⚠️ Extension | ProseMirror + React |

### 핵심 차이점

**1. Props/Model/State 명시적 분리**
- ✅ **우리 시스템**: 완전한 분리
- ⚠️ **대부분의 에디터**: 혼합되어 있거나 명시적이지 않음

**2. 에디터와의 연결**
- ✅ **우리 시스템**: 직접 연결 (Model이 문서 모델)
- ⚠️ **일부 에디터**: 간접 연결 (API를 통한 접근)

**3. 컴포넌트 시스템**
- ✅ **우리 시스템**: 완전한 컴포넌트 시스템
- ⚠️ **대부분의 에디터**: 플러그인/Extension 기반 (컴포넌트 개념 약함)

**4. 자동 재렌더링**
- ✅ **우리 시스템**: 자동 재렌더링 (VNode + Reconciler)
- ⚠️ **대부분의 에디터**: 수동 업데이트 또는 React 의존

---

## 결론

### 우리 시스템의 독특함

**완전히 동일한 구조를 가진 시스템:**
- ⚠️ **없음**

**가장 유사한 시스템:**
1. **ProseMirror** ⭐ (에디터 중심, Model/Context/State)
2. **Slate.js** (React 기반, Element/Attributes/State)
3. **Tiptap** (ProseMirror + React, Node/HTMLAttributes/State)

**우리 시스템의 가치:**
- ✅ **Props/Model/State 완전한 분리** (유일)
- ✅ **에디터와 직접 연결** (일부만 지원)
- ✅ **독립적인 컴포넌트 시스템** (대부분 플러그인 기반)
- ✅ **자동 재렌더링** (대부분 수동 또는 React 의존)

**우리 시스템의 차별점:**
- Props/Model/State를 **명시적으로 분리**한 유일한 에디터 시스템
- 에디터 모델과 **직접 연결**하면서도 **완전한 컴포넌트 시스템** 제공
- **독립적인 재렌더링 시스템** (프레임워크 의존 없음)

---

## 참고 자료

### 오픈소스 에디터
- [ProseMirror NodeView](https://prosemirror.net/docs/guide/#nodeviews)
- [Slate.js Elements](https://docs.slatejs.org/concepts/03-elements)
- [Draft.js Custom Blocks](https://draftjs.org/docs/advanced-topics-custom-block-render-map)
- [Quill Blots](https://quilljs.com/guides/how-to-customize-quill/#blots)
- [CodeMirror 6 Extensions](https://codemirror.net/docs/guide/#extensions)
- [Lexical Nodes](https://lexical.dev/docs/concepts/nodes)
- [Tiptap Extensions](https://tiptap.dev/guide/custom-extensions)

### 상용 에디터
- [CKEditor 5 Widgets](https://ckeditor.com/docs/ckeditor5/latest/framework/guides/deep-dive/widget.html)
- [TinyMCE Plugins](https://www.tiny.cloud/docs/tinymce/6/plugins/)
- [Monaco Editor API](https://microsoft.github.io/monaco-editor/api/index.html)

### UI 프레임워크
- [Vue.js Props & Data](https://vuejs.org/guide/components/props.html)
- [Angular Input & Services](https://angular.io/guide/inputs-outputs)

