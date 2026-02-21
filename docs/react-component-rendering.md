# React 컴포넌트 렌더링

## 개요

Barocss Editor는 **블록 노드**와 **인라인 마크** 모두에 React 컴포넌트를 직접 등록할 수 있다.
`external()` 헬퍼를 통해 DSL 레벨에서 React 컴포넌트를 등록하면, `renderer-react`가 `createElement(component, props)` 로 렌더한다.

```ts
import { define, defineMark, external } from '@barocss/dsl';

// 블록 노드
define('my-card', external(MyCard));

// 인라인 마크
defineMark('highlight', external(HighlightMark));
```

---

## 다른 에디터들의 방식

| 에디터 | 방식 | 등록/연결 |
|--------|------|-----------|
| **TipTap** | **NodeView**에 React 컴포넌트 직접 사용 | Extension에서 `addNodeView()` → `ReactNodeViewRenderer(MyComponent)`. `NodeViewWrapper` / `NodeViewContent`로 감싸서 에디터 트리에 삽입. props로 `node`, `updateAttributes` 등 전달. |
| **Lexical** | **DecoratorNode** + React | `DecoratorNode`를 노드로 등록하고, React 컴포넌트를 플러그인에서 연결. `initialConfig.nodes`에 노드 등록. |
| **Slate** | **renderElement / renderLeaf** 콜백 | `Editable`에 `renderElement({ element, children, attributes })` 제공. element/leaf 타입별로 React element를 반환. |

공통점: **노드/마크 타입과 React 컴포넌트를 1:1로 연결**하고, 에디터(또는 렌더 레이어)가 그 컴포넌트를 인스턴스화해 트리에 넣는다.

---

## Barocss 등록 API

### define + external() — 블록 노드

```ts
// 방법 1: React 컴포넌트
define('my-card', external(MyCardComponent));

// 방법 2: 선언적 DSL 템플릿 (React/DOM 양쪽에서 동작)
define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));

// 방법 3: DOM mount/unmount (renderer-dom 전용)
define('legacy-widget', external({ mount, unmount, managesDOM: true }));
```

### defineMark + external() — 인라인 마크

```ts
// 방법 1: React 컴포넌트
defineMark('highlight', external(HighlightMark));

// 방법 2: 선언적 DSL 템플릿
defineMark('bold', element('strong', { className: 'mark-bold' }, [data('text')]));
```

`external(fn)` 은 `{ type: 'external', reactComponent: fn }` 을 반환한다.
`external({ mount, unmount })` 은 `{ type: 'external', mount, unmount }` 을 반환한다.

---

## Props 규약

### BlockComponentProps (블록 노드)

`renderer-react`의 `buildToReact`가 블록 노드의 React 컴포넌트에 전달하는 props:

```ts
import type { BlockComponentProps } from '@barocss/dsl';

interface MyAttrs { level: number; }

function Heading({ sid, stype, attributes, children }: BlockComponentProps<MyAttrs>) {
  const Tag = `h${attributes.level}` as any;
  return <Tag className="heading" data-bc-sid={sid} data-bc-stype={stype}>{children}</Tag>;
}
```

| Prop | 타입 | 설명 |
|------|------|------|
| `sid` | `string` | 노드 고유 ID |
| `stype` | `string` | 노드 타입명 |
| `model` | `Record<string, unknown>` | 전체 모델 객체 |
| `attributes` | `A` (제네릭) | 노드 속성 (level, type, src 등) |
| `text` | `string?` | 텍스트 내용 (inline-text 등) |
| `children` | `ReactNode?` | `model.content`에서 빌드된 자식 React 노드들 |
| `data-bc-sid` | `string` | DOM identity 속성 |
| `data-bc-stype` | `string` | DOM identity 속성 |

### MarkComponentProps (인라인 마크)

`renderer-react`의 `buildMarkRunToReact`가 마크의 React 컴포넌트에 전달하는 props:

```ts
import type { MarkComponentProps } from '@barocss/dsl';

interface HighlightAttrs { color: string; }

function HighlightMark({ children, attributes }: MarkComponentProps<HighlightAttrs>) {
  return (
    <span className="highlight" style={{ backgroundColor: attributes.color }}>
      {children}
    </span>
  );
}
```

| Prop | 타입 | 설명 |
|------|------|------|
| `markType` | `string` | 마크 타입명 |
| `attributes` | `A` (제네릭) | 마크 속성 (color, href, weight 등) |
| `text` | `string` | 현재 텍스트 run의 원본 텍스트 |
| `children` | `ReactNode?` | 내부 텍스트 또는 중첩된 마크 React element |
| `data-mark-type` | `string` | DOM 마크 타입 속성 |

**중첩 순서**: 마크 배열에서 앞에 오는 마크가 바깥(outer), 뒤에 오는 마크가 안쪽(inner).

```ts
// marks: [{ stype: 'bold' }, { stype: 'italic' }]
// 렌더 결과: <BoldMark><ItalicMark>text</ItalicMark></BoldMark>
```

---

## renderer-react 내부 동작

### 블록 노드 (buildToReact)

`def.template`에 `reactComponent`가 있으면:
1. `model.content` 배열의 각 자식에 대해 `buildToReact(child)` 를 재귀 호출
2. block/layer 데코레이터를 before/after로 삽입
3. 결과를 `props.children`으로 전달
4. `createElement(reactComponent, props)` 로 렌더

### 인라인 마크 (buildMarkRunToReact)

`getMarkRenderer(type)`이 `ExternalDescriptor`를 반환하면:
1. 모델의 `marks` 배열에서 해당 마크의 `attrs`를 찾아 `attributes`에 전달
2. `createElement(reactComponent, { markType, attributes, text, children }, inner)` 로 렌더
3. `inner`는 내부 텍스트 또는 안쪽 마크가 이미 감싼 React element

### renderer-dom (DOM 렌더러)

`ExternalDescriptor`로 등록된 마크는 renderer-dom에서 기본 `<span class="mark-{type}">` 폴백으로 처리된다. 크래시 없이 안전.

---

## 패턴 비교

| 패턴 | 용도 | React | DOM |
|------|------|-------|-----|
| `element()` | 단순 HTML 매핑 | `buildToReact`가 `React.createElement`로 변환 | 네이티브 DOM 생성 |
| `external(ReactComponent)` | React 전용 (hooks, 서드파티 라이브러리) | `createElement(component, props)` | 블록: placeholder div / 마크: `<span>` 폴백 |
| `external({ mount, unmount })` | DOM 전용 (직접 DOM 조작) | placeholder div | `mount`/`unmount` 호출 |

### 언제 `external(ReactComponent)` 를 쓰는가?

- `useRef`, `useEffect`, `useState` 등 **React 훅**이 필요할 때
- KaTeX, Chart.js 등 **서드파티 DOM 라이브러리**를 React 생명주기로 관리할 때
- **동적 상태**(토글, 인터랙션)가 컴포넌트 내부에 필요할 때
- React 앱의 **레퍼런스/샘플**로 전체 컴포넌트 패턴을 보여줄 때

### 언제 `element()` 로 충분한가?

- 단순 태그 + 클래스 + 속성 매핑 (예: `<blockquote class="quote">`)
- React/DOM 양쪽에서 동일하게 동작해야 할 때
- 성능이 중요하고 컴포넌트 오버헤드를 줄이고 싶을 때

---

## 예제: editor-react 앱

`apps/editor-react/src/register-renderers.tsx` 참고:

```tsx
// 블록 — 팩토리 헬퍼로 단순 래퍼
const wrap = (Tag: string, cls: string) =>
  ({ sid, stype, children }: BlockComponentProps) => (
    <Tag className={cls} data-bc-sid={sid} data-bc-stype={stype}>{children}</Tag>
  );
define('blockQuote', external(wrap('blockquote', 'block-quote')));

// 블록 — 로직이 필요한 컴포넌트
function Heading({ sid, stype, attributes, children }: BlockComponentProps) {
  const Tag = `h${attributes?.level || 1}` as any;
  return <Tag className="heading" data-bc-sid={sid} data-bc-stype={stype}>{children}</Tag>;
}
define('heading', external(Heading));

// 블록 — 사이드이펙트 (KaTeX)
function MathBlock({ sid, attributes }: BlockComponentProps) {
  const ref = useRef<HTMLDivElement>(null);
  const tex = attributes?.tex ?? '';
  useEffect(() => {
    if (ref.current && tex) katex.render(tex, ref.current, { displayMode: true });
  }, [tex]);
  return <div ref={ref} className="math-block" data-bc-sid={sid} data-bc-stype="mathBlock" />;
}
define('mathBlock', external(MathBlock));

// 마크 — React 컴포넌트
function LinkMark({ children, attributes }: MarkComponentProps) {
  return <a href={attributes?.href ?? '#'} target="_blank" rel="noopener noreferrer">{children}</a>;
}
defineMark('link', external(LinkMark));
```

---

## 테스트

- **renderer-react**: `test/build-to-react-complex.test.ts` → `defineMark with external(reactComponent)` 섹션
  - 단일 마크, 중첩 마크, 범위 마크, 겹치는 마크, element+external 혼용, 전역 마크, attrs 없는 마크, 3중 중첩, 빈 텍스트
- **DSL**: `tests/registry.test.ts` → `defineMark + external()` 섹션
  - ExternalDescriptor 저장, getMarkRenderer 반환, element/external 공존
