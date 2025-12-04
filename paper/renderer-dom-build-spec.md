# Renderer DOM Build Function Specification

## 개요

`DOMRenderer.build()` 함수는 Model 데이터와 Decorator 데이터를 받아서 VNode(Virtual Node)를 생성하는 핵심 함수입니다. 이 문서는 어떤 입력(Model, Decorators)을 어떻게 빌드하면 어떤 출력(VNode)이 나오는지 명확하게 설명합니다.

## 빌드 함수 시그니처

```typescript
build(model: ModelData, decorators: DecoratorData[] = []): VNode
```

### 입력

#### 1. Model (ModelData)

Model은 다음 필수 속성을 가져야 합니다:

- **`stype`** (string, 필수): 사용할 템플릿의 타입. `define()` 함수로 등록된 템플릿 이름과 일치해야 합니다.
- **`sid`** (string, 선택): 노드의 고유 식별자. Decorator 매칭과 reconciliation에 사용됩니다.
- **기타 속성**: 템플릿에서 사용할 데이터 (예: `text`, `title`, `content`, `attributes`, `marks` 등)

**예제:**
```typescript
const model = {
  stype: 'paragraph',
  sid: 'p1',
  text: 'Hello World',
  attributes: { className: 'intro' }
};
```

#### 2. Decorators (DecoratorData[])

Decorator 배열은 텍스트나 노드에 추가적인 스타일링이나 기능을 적용하는 메타데이터입니다.

```typescript
interface DecoratorData {
  sid: string;              // Decorator 고유 ID
  stype: string;            // Decorator 타입 (highlight, comment 등)
  category: 'inline' | 'block' | 'layer';
  target: {
    sid: string;            // 대상 노드의 sid
    startOffset?: number;   // inline decorator의 시작 오프셋
    endOffset?: number;     // inline decorator의 끝 오프셋
  };
}
```

**예제:**
```typescript
const decorators = [
  {
    sid: 'd1',
    stype: 'highlight',
    category: 'inline',
    target: {
      sid: 'p1',
      startOffset: 0,
      endOffset: 5
    }
  }
];
```

### 출력

#### VNode (Virtual Node)

빌드 함수는 완성된 VNode 객체를 반환합니다.

```typescript
interface VNode {
  tag?: string;              // HTML 태그명 (예: 'div', 'p', 'span')
  attrs?: Record<string, any>; // HTML 속성들
  style?: Record<string, any>;  // 인라인 스타일
  text?: string;              // 텍스트 노드의 내용
  children?: VNode[];          // 자식 VNode 배열
  component?: {                // 컴포넌트 정보 (컴포넌트인 경우)
    name: string;
    props: Record<string, any>;
    isExternal?: boolean;
  };
  portal?: {                   // Portal 정보 (Portal인 경우)
    target: HTMLElement;
    template: RenderTemplate;
    portalId: string;
  };
}
```

## 빌드 프로세스

빌드 함수는 다음 단계를 거쳐 VNode를 생성합니다:

1. **템플릿 조회**: `model.stype`으로 등록된 템플릿을 Registry에서 찾습니다.
2. **데이터 바인딩**: 템플릿의 `data()`, `attr()` 등의 함수가 model 데이터를 참조합니다.
3. **Mark 처리**: `model.marks`가 있으면 텍스트를 mark 범위에 따라 분할하고 mark VNode를 생성합니다.
4. **Decorator 적용**: Decorator를 텍스트나 노드에 적용합니다.
5. **Component 처리**: Contextual Component나 External Component를 처리합니다.
6. **Slot 처리**: `slot()` 함수로 지정된 자식 콘텐츠를 렌더링합니다.
7. **재귀적 빌드**: 중첩된 템플릿이나 자식 요소들을 재귀적으로 빌드합니다.

## 스펙별 빌드 결과

### 1. 기본 Element 빌드

**입력:**
```typescript
// 템플릿 등록
define('paragraph', element('p', [data('text')]));

const model = {
  stype: 'paragraph',
  sid: 'p1',
  text: 'Hello World'
};

const decorators = [];
```

**출력:**
```typescript
{
  tag: 'p',
  attrs: {
    'data-bc-sid': 'p1',
    'data-bc-stype': 'paragraph'
  },
  text: 'Hello World'
}
```

### 2. Nested Elements 빌드

**입력:**
```typescript
define('container', element('div', [
  element('h1', [data('title')]),
  element('p', [data('content')])
]));

const model = {
  stype: 'container',
  sid: 'c1',
  title: 'Title',
  content: 'Content'
};
```

**출력:**
```typescript
{
  tag: 'div',
  attrs: { 'data-bc-sid': 'c1', 'data-bc-stype': 'container' },
  children: [
    { tag: 'h1', text: 'Title' },
    { tag: 'p', text: 'Content' }
  ]
}
```

### 3. Decorator 적용 빌드

**입력:**
```typescript
define('paragraph', element('p', [data('text')]));
define('highlight', element('span', { className: 'highlight' }, [slot('content')]));

const model = {
  stype: 'paragraph',
  sid: 'p1',
  text: 'Hello World'
};

const decorators = [
  {
    sid: 'd1',
    stype: 'highlight',
    category: 'inline',
    target: { sid: 'p1', startOffset: 0, endOffset: 5 }
  }
];
```

**출력:**
```typescript
{
  tag: 'p',
  attrs: { 'data-bc-sid': 'p1', 'data-bc-stype': 'paragraph' },
  children: [
    {
      tag: 'span',
      attrs: {
        className: 'highlight',
        'data-decorator-sid': 'd1',
        'data-decorator-category': 'inline'
      },
      children: [{ text: 'Hello' }]
    },
    { text: ' World' }
  ]
}
```

### 4. Mark 처리 빌드

**입력:**
```typescript
define('text-with-mark', element('p', [data('text')]));
defineMark('bold', element('strong', [data('text')]));

const model = {
  stype: 'text-with-mark',
  sid: 'm1',
  text: 'Hello World',
  marks: [
    { type: 'bold', range: [0, 5] }  // "Hello"
  ]
};
```

**출력:**
```typescript
{
  tag: 'p',
  attrs: { 'data-bc-sid': 'm1', 'data-bc-stype': 'text-with-mark' },
  children: [
    { tag: 'strong', text: 'Hello' },
    { text: ' World' }
  ]
}
```

### 5. Mark + Decorator 조합 빌드

**입력:**
```typescript
define('text-mark-decorator', element('p', [data('text')]));
defineMark('bold', element('strong', [data('text')]));
define('highlight', element('span', { className: 'highlight' }, [slot('content')]));

const model = {
  stype: 'text-mark-decorator',
  sid: 'm1',
  text: 'Hello World',
  marks: [
    { type: 'bold', range: [0, 5] }
  ]
};

const decorators = [
  {
    sid: 'd1',
    stype: 'highlight',
    category: 'inline',
    target: { sid: 'm1', startOffset: 0, endOffset: 5 }
  }
];
```

**출력:**
```typescript
{
  tag: 'p',
  attrs: { 'data-bc-sid': 'm1', 'data-bc-stype': 'text-mark-decorator' },
  children: [
    {
      tag: 'span',
      attrs: {
        className: 'highlight',
        'data-decorator-sid': 'd1',
        'data-decorator-category': 'inline'
      },
      children: [
        { tag: 'strong', text: 'Hello' }  // Mark가 Decorator 안에 중첩됨
      ]
    },
    { text: ' World' }
  ]
}
```

**중첩 순서:** Decorator → Mark → Text

### 6. Component 빌드 (Contextual)

**입력:**
```typescript
registerContextComponent('button', (props, context) => {
  return element('button', { className: 'btn' }, [data('text')]);
});

const model = {
  stype: 'button',
  sid: 'btn1',
  text: 'Click me'
};
```

**출력:**
```typescript
{
  tag: 'button',
  attrs: {
    className: 'btn',
    'data-bc-sid': 'btn1',
    'data-bc-stype': 'button'
  },
  text: 'Click me',
  component: {
    name: 'button',
    props: { text: 'Click me' },
    isExternal: false
  }
}
```

### 7. External Component 빌드

**입력:**
```typescript
define('chart', {
  mount: (props, container) => {
    const div = document.createElement('div');
    div.className = 'chart-container';
    container.appendChild(div);
    return div;
  },
  unmount: (instance) => {
    instance.element?.remove();
  }
});

const model = {
  stype: 'chart',
  sid: 'chart1',
  data: [1, 2, 3]
};
```

**출력:**
```typescript
{
  tag: 'div',
  attrs: {
    'data-bc-sid': 'chart1',
    'data-bc-stype': 'component',
    'data-bc-component': 'chart'
  },
  component: {
    name: 'chart',
    props: { stype: 'chart', sid: 'chart1', data: [1, 2, 3] },
    isExternal: true
  }
}
```

### 8. Slot 처리 빌드

**입력:**
```typescript
define('container', element('div', { className: 'container' }, [slot('content')]));
define('item', element('span', { className: 'item' }, [data('text')]));

const model = {
  stype: 'container',
  sid: 'c1',
  content: [
    { stype: 'item', sid: 'i1', text: 'Item 1' },
    { stype: 'item', sid: 'i2', text: 'Item 2' }
  ]
};
```

**출력:**
```typescript
{
  tag: 'div',
  attrs: {
    className: 'container',
    'data-bc-sid': 'c1',
    'data-bc-stype': 'container'
  },
  children: [
    {
      tag: 'span',
      attrs: { className: 'item', 'data-bc-sid': 'i1', 'data-bc-stype': 'item' },
      text: 'Item 1'
    },
    {
      tag: 'span',
      attrs: { className: 'item', 'data-bc-sid': 'i2', 'data-bc-stype': 'item' },
      text: 'Item 2'
    }
  ]
}
```

### 9. Conditional Rendering (`when()`) 빌드

**입력:**
```typescript
define('conditional-component', element('div', [
  when((d: any) => d.show, element('span', { className: 'shown' }, [data('text')])),
  when((d: any) => !d.show, element('span', { className: 'hidden' }, [text('Hidden')]))
]));

const model = {
  stype: 'conditional-component',
  sid: 'c1',
  show: true,
  text: 'Visible content'
};
```

**출력:**
```typescript
{
  tag: 'div',
  attrs: { 'data-bc-sid': 'c1', 'data-bc-stype': 'conditional-component' },
  children: [
    { tag: 'span', attrs: { className: 'shown' }, text: 'Visible content' }
    // hidden span은 조건이 false이므로 포함되지 않음
  ]
}
```

### 10. Array Iteration (`each()`) 빌드

**입력:**
```typescript
const eachTemplate: EachTemplate = {
  type: 'each',
  name: 'items',
  render: (item: any) => element('li', { className: 'item' }, [data('name')])
};

define('list', element('ul', [eachTemplate]));

const model = {
  stype: 'list',
  sid: 'l1',
  items: [
    { stype: 'item', sid: 'i1', name: 'Item 1' },
    { stype: 'item', sid: 'i2', name: 'Item 2' }
  ]
};
```

**출력:**
```typescript
{
  tag: 'ul',
  attrs: { 'data-bc-sid': 'l1', 'data-bc-stype': 'list' },
  children: [
    { tag: 'li', attrs: { className: 'item' }, text: 'Item 1' },
    { tag: 'li', attrs: { className: 'item' }, text: 'Item 2' }
  ]
}
```

### 11. Mixed Content (Text + Elements) 빌드

**입력:**
```typescript
define('mixed-content', element('div', [
  text('Hello '),
  element('strong', [text('World')]),
  text('!')
]));

const model = {
  stype: 'mixed-content',
  sid: 'm1'
};
```

**출력:**
```typescript
{
  tag: 'div',
  attrs: { 'data-bc-sid': 'm1', 'data-bc-stype': 'mixed-content' },
  children: [
    { text: 'Hello ' },
    { tag: 'strong', text: 'World' },
    { text: '!' }
  ]
}
```

### 12. Dynamic Attributes 빌드

**입력:**
```typescript
define('dynamic-attr', element('div', {
  className: attr('attributes.className'),
  id: attr('attributes.id'),
  'data-value': attr('attributes.value')
}, [data('text')]));

const model = {
  stype: 'dynamic-attr',
  sid: 'd1',
  attributes: {
    className: 'custom-class',
    id: 'my-id',
    value: '123'
  },
  text: 'Content'
};
```

**출력:**
```typescript
{
  tag: 'div',
  attrs: {
    className: 'custom-class',
    id: 'my-id',
    'data-value': '123',
    'data-bc-sid': 'd1',
    'data-bc-stype': 'dynamic-attr'
  },
  text: 'Content'
}
```

### 13. Component Props 전달 빌드

**입력:**
```typescript
registerContextComponent('profile', (props, context) => {
  return element('div', [
    element('h1', [data('user.name')]),
    element('p', [data('user.email')])
  ]);
});

const model = {
  stype: 'profile',
  sid: 'p1',
  user: {
    name: 'John Doe',
    email: 'john@example.com'
  }
};
```

**출력:**
```typescript
{
  tag: 'div',
  attrs: { 'data-bc-sid': 'p1', 'data-bc-stype': 'profile' },
  children: [
    { tag: 'h1', text: 'John Doe' },
    { tag: 'p', text: 'john@example.com' }
  ],
  component: {
    name: 'profile',
    props: { user: { name: 'John Doe', email: 'john@example.com' } },
    isExternal: false
  }
}
```

## 중첩 및 조합 규칙

### 1. Mark와 Decorator 중첩 순서

Mark와 Decorator가 동시에 적용될 때의 중첩 순서는 다음과 같습니다:

```
Decorator (외부) → Mark → Text (내부)
```

이유:
- Decorator는 스타일링이나 기능적 래퍼입니다.
- Mark는 텍스트의 의미적 강조입니다.
- 따라서 Decorator가 외부, Mark가 내부에 위치합니다.

### 2. 여러 Mark 중첩

여러 Mark가 겹칠 때는 `run.types` 배열의 역순으로 중첩됩니다:

```typescript
// marks: [bold, italic] → types: ['bold', 'italic']
// 결과: <em><strong>text</strong></em>
```

### 3. 여러 Decorator 처리

여러 Decorator가 같은 텍스트에 적용될 때는 각각 별도의 VNode로 생성되거나, 범위에 따라 분할됩니다.

## 특수 속성 및 메타데이터

### data-bc-sid

모든 VNode에 `data-bc-sid` 속성이 추가되어 노드를 식별합니다. 이는 reconciliation과 decorator 매칭에 사용됩니다.

### data-bc-stype

`data-bc-stype` 속성은 원본 model의 `stype`을 보존합니다. 컴포넌트의 경우 `'component'`로 설정될 수 있습니다.

### data-bc-component

External Component나 Contextual Component인 경우 `data-bc-component` 속성에 컴포넌트 이름이 설정됩니다.

### data-decorator-sid / data-decorator-category

Decorator가 적용된 VNode에는 `data-decorator-sid`와 `data-decorator-category` 속성이 추가됩니다.

## 에러 처리

### 1. stype이 없는 경우

```typescript
build({ sid: 'p1', text: 'Hello' }, []);
// Error: model must have stype property
```

### 2. 등록되지 않은 템플릿 사용

```typescript
build({ stype: 'unknown-template', sid: 'p1' }, []);
// Error: Renderer for node type 'unknown-template' not found
```

### 3. null/undefined 데이터

```typescript
build(null, []);
// Error: Data cannot be null or undefined
```

## 성능 고려사항

1. **ID 재사용**: 같은 빌드 사이클 내에서 동일한 `sid`를 여러 번 사용하면 unique ID가 생성됩니다 (중복 방지).
2. **재귀적 빌드**: 깊게 중첩된 구조는 재귀적으로 처리되므로 깊이가 깊을수록 성능에 영향을 줄 수 있습니다.
3. **Decorator 처리**: 많은 Decorator가 있을 경우 텍스트 분할과 매칭 과정이 시간이 걸릴 수 있습니다.

## 예제: 복잡한 빌드 시나리오

```typescript
// 템플릿 정의
define('article', element('article', [slot('content')]));
define('paragraph', element('p', [data('text')]));
defineMark('bold', element('strong', [data('text')]));
defineMark('italic', element('em', [data('text')]));
define('highlight', element('span', { className: 'highlight' }, [slot('content')]));

// Model & Decorators
const model = {
  stype: 'article',
  sid: 'article1',
  content: [
    {
      stype: 'paragraph',
      sid: 'p1',
      text: 'Hello Beautiful World',
      marks: [
        { type: 'bold', range: [0, 5] },
        { type: 'italic', range: [6, 15] }
      ]
    }
  ]
};

const decorators = [
  {
    sid: 'd1',
    stype: 'highlight',
    category: 'inline',
    target: { sid: 'p1', startOffset: 0, endOffset: 15 }
  }
];

// 빌드
const vnode = renderer.build(model, decorators);

// 결과 VNode 구조:
// article
//   └─ p (data-bc-sid: 'p1')
//       └─ span.highlight (data-decorator-sid: 'd1')
//           ├─ strong ('Hello')
//           └─ em ('Beautiful')
//       └─ ' World'
```

## 참고 사항

- 빌드 함수는 DOM을 직접 생성하지 않습니다. VNode만 생성합니다.
- 실제 DOM 렌더링은 `renderer.render(container, vnode)`를 호출해야 합니다.
- Component의 내부 상태는 `ComponentManager`를 통해 관리되며, 빌드 시점에 반영됩니다.
- `lastModel`과 `lastDecorators`가 저장되어 자동 재빌드를 지원합니다.

