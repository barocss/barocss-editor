# React 컴포넌트 렌더링 (에디터 비교 및 Barocss 방향)

## 질문

- editor-view-react / renderer-react에서 **커스텀 React 컴포넌트**를 노드/데코레이터로 렌더할 수 있는가?
- DSL은 현재 그렇게 되어 있지 않고, external component 형태로 등록해야 한다.
- TipTap·Lexical 등 React 기반 에디터는 React 컴포넌트를 어떻게 쓰는가?

---

## 다른 에디터들의 방식

| 에디터 | 방식 | 등록/연결 |
|--------|------|-----------|
| **TipTap** | **NodeView**에 React 컴포넌트 직접 사용 | Extension에서 `addNodeView()` → `ReactNodeViewRenderer(MyComponent)`. `NodeViewWrapper` / `NodeViewContent`로 감싸서 에디터 트리에 삽입. props로 `node`, `updateAttributes` 등 전달. |
| **Lexical** | **DecoratorNode** + React | `DecoratorNode`(또는 `DecoratorBlockNode`)를 노드로 등록하고, 해당 노드를 렌더하는 React 컴포넌트를 플러그인/설정에서 연결. `initialConfig.nodes`에 노드 등록, React 플러그인에서 `useLexicalComposerContext()` 등으로 에디터 접근. |
| **Slate** | **renderElement** 콜백 | `Editable`에 `renderElement({ element, children, attributes })` 제공. element 타입별로 **React element를 반환**. 즉 "노드 타입 → React 컴포넌트" 매핑을 한 곳에서 처리. |

공통점: **노드/엘리먼트 타입과 React 컴포넌트를 1:1로 연결**하고, 에디터(또는 렌더 레이어)가 그 컴포넌트를 인스턴스화해 트리에 넣는다.

---

## Barocss 현재 상태

### DSL / Registry

- **ExternalComponent** (타입): `mount(props, container: HTMLElement) => HTMLElement`, `unmount(instance)`, `update?`, `managesDOM?`, `template?`.
  - **DOM 기준**: 컨테이너에 직접 마운트하는 형태로 설계되어 있어, renderer-dom의 ComponentManager와 잘 맞음.
  - React 컴포넌트(함수/클래스)를 그대로 받는 필드는 없음.
- **등록**: `renderer(nodeType, externalComponent)` 또는 `registry.registerComponent(name, component)`로 ExternalComponent를 등록.

### renderer-dom

- ExternalComponent는 `mount`/`unmount`로 DOM에 그리며, getComponent로 조회해 사용. React와 무관.
- **React 전용 external** (`external(ReactComponent)` 형태, `mount` 없음): renderer-dom에서는 **선언적으로 사용할 수 없음**. 해당 노드 타입은 placeholder `div`(identity attrs만)만 그려지고, 계층/슬롯을 DSL처럼 채우지 않음. React 컴포넌트로 실제 UI를 그리는 것은 renderer-react 전용.

### renderer-react

- `buildToReact`에서 `templateOrComponent?.managesDOM === true`이면 **placeholder만** 렌더함 (`<div data-bc-sid ... className="react-renderer-external-placeholder">Component</div>`).
- 즉, **React 컴포넌트로 교체하는 경로는 아직 없음.** ExternalComponent가 React를 인식하지 않음.

### 결론 (가능 여부)

- **지금 구조만으로는** “스키마 노드/데코 타입 → 커스텀 React 컴포넌트”를 직접 렌더하지는 않는다.
- **가능하게 하려면** “external component를 React 쪽에서도 쓰는” 확장이 필요하다 (아래 방향 참고).

---

## DSL 패턴: define + external()

**같은 define() 안에** 선언적 템플릿과 외부 컴포넌트를 나란히 쓸 수 있도록 `external()` 헬퍼를 둔다.

```ts
define('paragraph', element('p', {}, [data('text')]));
define('my-card', external(MyCardComponent));           // React
define('legacy-widget', external({ mount, unmount }));  // DOM (mount/unmount)
```

- `define(name, element(...))` — 기존처럼 DSL 템플릿으로 노드 타입 정의.
- `define(name, external(ReactComponent))` — 해당 타입을 **React 컴포넌트**로 렌더 (renderer-react에서 사용).
- `define(name, external({ mount, unmount, managesDOM }))` — 기존처럼 **DOM** external (renderer-dom에서 mount/unmount).

`external()` 반환값은 `{ type: 'external', reactComponent? }` 또는 `{ type: 'external', mount, unmount, ... }` 이고, registry가 `type === 'external'` 또는 `managesDOM` 이 있으면 컴포넌트로 등록한다. renderer-react는 나중에 `reactComponent`가 있으면 `createElement(reactComponent, props)` 로 그리면 된다.

## React 컴포넌트를 쓰기 위한 방향 (제안)

목표: **노드/데코 타입에 “React 컴포넌트”를 등록하고, renderer-react가 해당 타입일 때 그 컴포넌트를 렌더.**

### 1) 등록 API (DSL) — external() 추가됨

- **external(ReactComponent)** → `{ type: 'external', reactComponent }` 로 등록. `define('xxx', external(MyReactNode))` 로 사용.
- **external({ mount, unmount })** → 기존 DOM external과 동일. `define('xxx', external({ mount, unmount, managesDOM: true }))`.
- registry는 `type === 'external'` 또는 `managesDOM` 이면 `registerComponent()` 로 저장.

### 2) renderer-react 쪽 (구현됨)

- **buildToReact**: template에 `reactComponent`(함수)가 있으면 `createElement(reactComponent, props)` 로 렌더. `props`에는 `model`, `sid`, `stype`, `...model`, `key`, `data-bc-sid`, `data-bc-stype` 이 들어가고, **스키마 계층**을 위해 `model.content`가 배열일 때 각 자식에 대해 `buildToReact(registry, child.stype, childModel)`를 호출한 결과를 `props.children`으로 넘긴다. 자식 노드에 대한 block/layer 데코레이터도 동일하게 before/after로 넣는다. `managesDOM`만 있으면 기존처럼 placeholder div.
- **buildDecoratorToReact**: decorator용 정의에 `reactComponent`가 있으면 `createElement(reactComponent, { decorator, model, sid, stype, category, data, data-decorator-* })` 로 렌더.

### 3) DSL과의 관계

- `define('xxx', element(...))` 와 `define('xxx', external(...))` 를 같은 레벨로 두면, “선언적 템플릿”과 “외부(React/DOM) 컴포넌트”를 같은 진입점으로 쓸 수 있다. DSL을 크게 바꾸지 않고 패턴만 추가한 형태다.

---

## 요약

| 항목 | 내용 |
|------|------|
| **다른 에디터** | TipTap은 NodeView에 React 컴포넌트 직접 등록, Lexical은 DecoratorNode + React 플러그인, Slate는 renderElement로 element → React element. 공통적으로 “타입 ↔ React 컴포넌트” 등록 후 에디터가 렌더. |
| **Barocss 현재** | ExternalComponent는 DOM mount/unmount 중심; renderer-react는 external일 때 placeholder만 그림. React 컴포넌트를 “external component”로 그리는 경로는 없음. |
| **가능 여부** | 가능. “타입 → React 컴포넌트” 등록 API를 두고, renderer-react에서 해당 타입이면 `createElement(Component, props)` 하면 됨. |
| **구현 방향** | (1) Registry에 React 컴포넌트 등록 수단 추가 (ExternalComponent 확장 또는 registerReactComponent), (2) renderer-react에서 해당 경로일 때 React로 렌더, (3) DOM-only external은 기존처럼 placeholder 유지. |

---

## 스키마 계층과 React 컴포넌트

스키마는 document > block+ > ... 처럼 content 계층을 가지며, element 템플릿은 `slot('content')`로 그 자식을 채운다. React 컴포넌트도 같은 계층을 가질 수 있다.

### renderer-react에서 계층 제어 방식

- **element + slot**: `processChildren`에서 `slot('content')`를 만나면 `model.content` 배열을 순회하며 각 자식에 대해 `buildToReact(registry, child.stype, childModel)`를 호출해 React 노드 배열을 만들고, 그걸 부모 element의 자식으로 넣는다.
- **external(ReactComponent)**: `reactComponent` 분기에서도 `model.content`가 배열이면 동일하게 각 자식에 대해 `buildToReact`를 호출하고, block/layer 데코레이터를 반영한 뒤 그 결과를 **`props.children`**으로 넘긴다. 따라서 컴포넌트는 `props.children`으로 이미 빌드된 자식 React 노드들을 받고, 레이아웃만 담당하면 된다.

### 예제로 확인하는 방법

- **테스트**: `packages/renderer-react/test/build-to-react-complex.test.ts`의 `external(ReactComponent) with model.content receives props.children (schema hierarchy)` 에서 `card-block`을 `external(CardWithChildren)`으로 정의하고, `model.content`에 paragraph 두 개를 넣어 빌드한 뒤 `node.props.children`이 2개의 paragraph React element인지, 그리고 하위 텍스트('A', 'B')가 트리에 있는지 검증한다.
- **앱에서**: editor-react 또는 docs-site에서 해당 노드 타입을 스키마에 넣고, `define('my-block', external(MyBlock))`로 등록한 뒤 `MyBlock`에서 `props.children`을 렌더하는지 확인하면 된다. 예: `function MyBlock({ children, model }) { return <article><h2>{model.title}</h2>{children}</article>; }`
