# renderer-react 및 editor-react 설계

## 목표

- **renderer-react**: DSL(define/element/slot/data 등)로 정의한 템플릿을 **React만** 사용해 렌더링. 입력은 renderer-dom과 동일하게 `RendererRegistry` + `ModelData`.
- **editor-react**: renderer-react로 에디터 컨텐츠를 렌더링하고, 편집 동작은 renderer-dom과 비슷한 형태로 동작하도록 할 앱(테스트/검증용).

## 아키텍처

- **renderer-dom**: DOM 기반. VNode는 “DOM 위에 React처럼 쓰기 위한” 중간 표현. `DSL → VNodeBuilder → VNode → Reconciler → DOM`.
- **renderer-react**: React 기반. React가 이미 가상 트리를 갖고 있으므로 VNode를 둘 필요 없음. **DSL → ReactBuilder → ReactNode** 로 직접 연결.

```
DSL (define, element, slot, data, ...)
        ↓
RendererRegistry (nodeType → RendererDefinition)
        ↓
renderer-dom:  ModelData → VNodeBuilder → VNode → Reconciler → DOM
renderer-react: ModelData → buildToReact(registry, stype, model) → ReactNode  (VNode 없음)
```

- **renderer-react**: `@barocss/renderer-dom`에 의존하지 않음. `@barocss/dsl`만 사용. 레지스트리에서 템플릿을 가져와 element/slot/data를 해석하고 `React.createElement`로 React 트리를 직접 만듦.
- **편집**: editor-view-dom과 유사하게 contenteditable + selection/input 처리. editor-react 앱에서는 먼저 **읽기 전용** 또는 **단순 contenteditable 래퍼**로 검증 후, 필요 시 editor-view-react(또는 editor-view-dom과 동일한 입력 레이어 재사용)로 확장.

## 패키지 역할

| 패키지 | 역할 |
|--------|------|
| **packages/renderer-react** | `ReactRenderer(registry).build(model)` → `ReactNode`. DSL 템플릿을 해석해 React 트리만 생성 (VNode/renderer-dom 미사용). **react/react-dom은 번들에 포함하지 않음** (peerDependencies, build 시 external). |
| **packages/editor-view-react** | (필요 시) editor-view-dom의 React 대응. React 트리 + contenteditable/selection/input을 React 친화적으로 묶는 뷰 레이어. |
| **apps/editor-react** | Vite+React 앱. 동일한 schema/define/initialTree로 ReactRenderer로 문서를 그리며, renderer-react 동작을 테스트. |

## renderer-react API

```ts
import { ReactRenderer } from '@barocss/renderer-react';
import { define, element, slot, data, getGlobalRegistry } from '@barocss/dsl';

const registry = getGlobalRegistry();
define('document', element('div', { className: 'document' }, [slot('content')]));
define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
define('inline-text', element('span', {}, [data('text')]));

const renderer = new ReactRenderer(registry);
const reactNode = renderer.build(model); // ModelData → ReactNode
```

- `ReactRenderer` 옵션: `name?` (디버깅용). decorator/context는 추후 확장.
- 내부: `buildToReact(registry, model.stype, model)` — element/slot/data/attr 해석 후 `React.createElement` 호출.

## 파일 구조

```
packages/renderer-react/
  package.json
  tsconfig.json
  src/
    index.ts
    react-renderer.ts   # ReactRenderer class
    build-to-react.ts   # DSL → ReactNode (element/slot/data 해석)

apps/editor-react/
  package.json
  index.html
  vite.config.ts
  tsconfig.json
  src/
    main.tsx
    App.tsx             # registry + initialTree + ReactRenderer.build
```

## editor-view-react (필요 시)

- **editor-view-dom**: DOM 레이어. DOMRenderer + contenteditable + selection/input 이벤트.
- **editor-view-react**: 필요하면 editor-view-dom과 비슷한 형태로, React 쪽 대응 패키지를 둘 수 있음.
  - 역할: React 트리(renderer-react) + contenteditable/selection/input을 React 컴포넌트/훅으로 제공.
  - 의존: `@barocss/editor-core`, `@barocss/renderer-react`, `react`, `react-dom` 등. editor-view-dom과 동일한 Editor/DataStore/Registry 모델을 공유.
  - 구현 시점: editor-react 앱에서 읽기 전용이 아닌 편집이 필요해지거나, React 앱에서 에디터를 컴포넌트로 써야 할 때.

## 편집과의 관계

- renderer-dom: contenteditable DOM 위에 Reconciler가 패치. selection/input은 editor-view-dom에서 DOM 이벤트로 처리.
- renderer-react: React가 트리를 그리므로, 편집 시에는 (1) React 트리를 contenteditable 컨테이너 안에 두고 DOM selection/input을 그대로 쓰거나, (2) **editor-view-react**에서 React 친화적인 입력 레이어를 두는 방식이 가능. 1차는 (1)로 동일한 입력 모델을 재사용하는 방향을 전제로 함.
