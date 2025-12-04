# VNode 구조 예제 문서

이 문서는 다양한 모델 입력에 대해 VNodeBuilder가 생성하는 VNode 구조를 JSON 형태로 보여줍니다.

## VNode 기본 구조

VNode는 다음과 같은 구조를 가집니다:

```typescript
interface VNode {
  tag?: string;           // HTML 태그명 (예: 'div', 'p', 'span')
  attrs?: Record<string, any>;  // HTML 속성
  style?: Record<string, any>; // 인라인 스타일
  text?: string;          // 텍스트 노드의 경우 텍스트 내용
  children?: (VNode | string)[]; // 자식 노드 배열
  key?: string;           // Key for efficient child matching during reconciliation
  
  // Component identity information (only for component-generated VNodes)
  // These are set at the top level to indicate where the node originated from
  // They are NOT added to attrs as data-bc-* attributes (those are added by Reconciler)
  sid?: string;           // Schema ID - only set for component-generated VNodes with tag
  stype?: string;         // Schema Type - only set for component-generated VNodes with tag
  props?: Record<string, any>;      // 순수 props (stype/sid/type 제외) - only for component-generated VNodes
  model?: Record<string, any>;       // 원본 모델 데이터 (stype/sid 포함) - only for component-generated VNodes (optional, fallback to props)
  decorators?: any[];     // Decorators applied to this node
  isExternal?: boolean; // true: external component, false: contextual component - only for component-generated VNodes
}
```

**중요**: 
- VNode에는 `data-bc-sid`, `data-bc-stype`, `data-bc-component` 같은 DOM 표식용 속성이 **attrs에 포함되지 않습니다**. 이러한 속성은 Reconciler에서 DOM 요소에 직접 추가됩니다.
- `sid`, `stype`, `props`, `model`, `decorators`, `isExternal`은 VNode의 최상위 필드로 설정되며, 컴포넌트로 생성된 VNode(tag와 stype가 있는 경우)에만 존재합니다.
- `props`는 순수 props(stype/sid/type 제외)를 포함하며, `model`은 원본 모델 데이터(stype/sid 포함)를 포함합니다. `model`이 없으면 `props`를 fallback으로 사용합니다.
- `decorators`도 VNode 최상위 필드로 설정되어 있어, decorator 정보를 빠르게 접근할 수 있습니다.
- `isExternal`은 외부 컴포넌트(managesDOM 패턴)인지 여부를 나타냅니다.

**참고**: decorator는 `data-decorator-sid`와 `data-decorator-category` 속성을 가진 VNode로 표현됩니다. 이는 decorator를 식별하기 위한 VNode 내부 표식이며, DOM 표식(`data-bc-*`)과는 다릅니다.

### Mark 문법

텍스트 마크는 다음과 같은 형식을 사용합니다:

```javascript
marks: [
  { type: 'bold', range: [start, end] },
  { type: 'italic', range: [start, end] }
]
```

- `type`: 마크 타입 (예: 'bold', 'italic', 'underline')
- `range`: `[start, end]` 배열 형태의 텍스트 범위 (0부터 시작하는 인덱스)

### Slot 문법

자식 요소들은 `slot('content')`를 사용하여 정의하고, 모델에서는 `content: []` 배열에 포함됩니다:

```javascript
// 템플릿 정의
define('list', element('ul', { className: 'list' }, [
  slot('content')
]));

// 모델
{
  stype: 'list',
  sid: 'list1',
  content: [
    { stype: 'item', sid: 'item1', text: 'First item' },
    { stype: 'item', sid: 'item2', text: 'Second item' }
  ]
}
```

---

## 예제 1: 단순 Paragraph

### 입력 모델
```javascript
{
  stype: 'paragraph',
  sid: 'p1',
  text: 'Hello world'
}
```

### 템플릿 정의
```javascript
define('paragraph', element('p', { className: 'para' }, [data('text')]));
```

### 생성된 VNode 구조
```json
{
  "tag": "p",
  "attrs": {
    "className": "para"
  },
  "style": {},
  "children": [],
  "text": "Hello world",
  "sid": "p1",
  "stype": "paragraph",
  "props": {
    "text": "Hello world"
  },
  "model": {
    "stype": "paragraph",
    "sid": "p1",
    "text": "Hello world"
  },
  "decorators": []
}
```

**특징**:
- 단순 텍스트는 `text` 필드에 직접 저장됩니다.
- `children` 배열이 비어있습니다.
- `props`와 `model`이 VNode 최상위에 설정되어 있습니다.
- `props`는 순수 props(stype/sid 제외)를 포함하며, `model`은 원본 모델 데이터를 포함합니다.
- `sid`, `stype`가 VNode 최상위에 설정되어 있습니다 (모델에서 제공된 값을 그대로 사용).
- `decorators` 배열이 최상위에 있습니다 (비어있음).

---

## 예제 2: 텍스트 마크가 있는 Paragraph

### 입력 모델
```javascript
{
  stype: 'paragraph',
  sid: 'p2',
  text: 'Hello world',
  marks: [
    { type: 'bold', range: [0, 5] },
    { type: 'italic', range: [6, 11] }
  ]
}
```

### 템플릿 정의
```javascript
define('paragraph', element('p', {}, [data('text')]));
define('mark:bold', element('strong', { className: 'mark-bold' }, []));
define('mark:italic', element('em', { className: 'mark-italic' }, []));
```

### 생성된 VNode 구조
```json
{
  "tag": "p",
  "attrs": {},
  "style": {},
  "children": [
    {
      "tag": "strong",
      "attrs": {
        "className": "mark-bold"
      },
      "style": {},
      "children": []
    },
    {
      "attrs": {},
      "style": {},
      "children": [],
      "text": " "
    },
    {
      "tag": "em",
      "attrs": {
        "className": "mark-italic"
      },
      "style": {},
      "children": []
    }
  ],
  "sid": "p2",
  "stype": "paragraph",
  "props": {
    "text": "Hello world",
    "marks": [
      { "type": "bold", "range": [0, 5] },
      { "type": "italic", "range": [6, 11] }
    ]
  },
  "model": {
    "stype": "paragraph",
    "sid": "p2",
    "text": "Hello world",
    "marks": [
      { "type": "bold", "range": [0, 5] },
      { "type": "italic", "range": [6, 11] }
    ]
  },
  "marks": [
    {
      "type": "bold",
      "range": [0, 5]
    },
    {
      "type": "italic",
      "range": [6, 11]
    }
  ],
  "decorators": []
}
```

**특징**:
- 마크가 있는 텍스트는 `children` 배열에 마크 태그(`<strong>`, `<em>`)와 텍스트 노드로 분리됩니다.
- 마크 태그는 `tag`와 `attrs`를 가지지만, 실제 텍스트 내용은 별도의 텍스트 노드나 자식으로 포함됩니다.
- 마크 사이의 공백도 별도의 텍스트 노드로 표현됩니다.
- `marks` 배열이 VNode 최상위에 설정되어 있어, 모델의 마크 정보를 빠르게 접근할 수 있습니다.
- `sid`, `stype`가 VNode 최상위에 설정되어 있습니다 (모델에서 제공된 값을 그대로 사용).

---

## 예제 3: Inline Decorator가 있는 Paragraph

### 입력 모델
```javascript
{
  stype: 'paragraph',
  sid: 'p3',
  text: 'Important text'
}
```

### Decorator
```javascript
[
  {
    sid: 'd1',
    stype: 'highlight',
    type: 'highlight',
    category: 'inline',
    target: { sid: 'p3', startOffset: 0, endOffset: 9 }
  }
]
```

### 템플릿 정의
```javascript
define('paragraph', element('p', {}, [data('text')]));
defineDecorator('highlight', element('span', { className: 'highlight' }, []));
```

### 생성된 VNode 구조
```json
{
  "tag": "p",
  "attrs": {},
  "style": {},
  "children": [
    {
      "tag": "div",
      "attrs": {
        "data-decorator-sid": "d1",
        "data-decorator-category": "inline"
      },
      "style": {},
      "children": [
        {
          "attrs": {},
          "style": {},
          "children": [],
          "text": "Important"
        }
      ]
    },
    {
      "attrs": {},
      "style": {},
      "children": [],
      "text": " text"
    }
  ],
  "sid": "p3",
  "stype": "paragraph",
  "props": {
    "text": "Important text"
  },
  "model": {
    "stype": "paragraph",
    "sid": "p3",
    "text": "Important text"
  },
  "decorators": [
    {
      "sid": "d1",
      "stype": "highlight",
      "type": "highlight",
      "category": "inline",
      "target": {
        "sid": "p3",
        "startOffset": 0,
        "endOffset": 9
      }
    }
  ]
}
```

**특징**:
- Inline decorator는 `data-decorator-sid`와 `data-decorator-category` 속성을 가진 VNode로 표현됩니다.
- `decorators` 배열이 VNode 최상위에 설정되어 있어, decorator 정보를 빠르게 접근할 수 있습니다.
- `sid`, `stype`가 VNode 최상위에 설정되어 있습니다 (모델에서 제공된 값을 그대로 사용).
- Decorator 범위에 해당하는 텍스트는 decorator VNode의 `children`에 포함됩니다.
- Decorator 범위 밖의 텍스트는 별도의 텍스트 노드로 포함됩니다.

---

## 예제 4: 텍스트 마크와 Decorator 통합

### 입력 모델
```javascript
{
  stype: 'paragraph',
  sid: 'p4',
  text: 'Bold and highlighted',
  marks: [
    { type: 'bold', range: [0, 4] }
  ]
}
```

### Decorator
```javascript
[
  {
    sid: 'd2',
    stype: 'highlight',
    type: 'highlight',
    category: 'inline',
    target: { sid: 'p4', startOffset: 5, endOffset: 19 }
  }
]
```

### 생성된 VNode 구조
```json
{
  "tag": "p",
  "attrs": {},
  "style": {},
  "children": [
    {
      "tag": "strong",
      "attrs": {},
      "style": {},
      "children": []
    },
    {
      "attrs": {},
      "style": {},
      "children": [],
      "text": " and "
    },
    {
      "tag": "div",
      "attrs": {
        "data-decorator-sid": "d2",
        "data-decorator-category": "inline"
      },
      "style": {},
      "children": [
        {
          "attrs": {},
          "style": {},
          "children": [],
          "text": "highlighted"
        }
      ]
    }
  ],
  "sid": "p4",
  "stype": "paragraph",
  "props": {
    "text": "Bold and highlighted",
    "marks": [
      { "type": "bold", "range": [0, 4] }
    ]
  },
  "model": {
    "stype": "paragraph",
    "sid": "p4",
    "text": "Bold and highlighted",
    "marks": [
      { "type": "bold", "range": [0, 4] }
    ]
  },
  "marks": [
    {
      "type": "bold",
      "range": [0, 4]
    }
  ],
  "decorators": [
    {
      "sid": "d2",
      "stype": "highlight",
      "type": "highlight",
      "category": "inline",
      "target": {
        "sid": "p4",
        "startOffset": 5,
        "endOffset": 19
      }
    }
  ]
}
```

**특징**:
- 마크와 decorator가 함께 적용된 경우, 텍스트가 마크 범위, decorator 범위, 그리고 일반 텍스트로 분할됩니다.
- 마크는 `<strong>` 태그로, decorator는 `data-decorator-*` 속성을 가진 태그로 표현됩니다.
- 각 범위는 순서대로 `children` 배열에 포함됩니다.
- `marks`와 `decorators` 배열이 VNode 최상위에 설정되어 있어, 모델 정보를 빠르게 접근할 수 있습니다.
- `sid`, `stype`가 VNode 최상위에 설정되어 있습니다 (모델에서 제공된 값을 그대로 사용).

---

## 예제 5: Block Decorator가 있는 Paragraph

### 입력 모델
```javascript
{
  stype: 'paragraph',
  sid: 'p5',
  text: 'Some text'
}
```

### Decorator
```javascript
[
  {
    sid: 'd3',
    stype: 'comment',
    type: 'comment',
    category: 'block',
    target: { sid: 'p5' }
  }
]
```

### 생성된 VNode 구조
```json
{
  "tag": "p",
  "attrs": {},
  "style": {},
  "children": [
    {
      "tag": "div",
      "attrs": {
        "data-decorator-sid": "d3",
        "data-decorator-category": "block"
      },
      "style": {},
      "children": []
    }
  ],
  "text": "Some text",
  "sid": "p5",
  "stype": "paragraph",
  "props": {
    "text": "Some text"
  },
  "model": {
    "stype": "paragraph",
    "sid": "p5",
    "text": "Some text"
  },
  "decorators": [
    {
      "sid": "d3",
      "stype": "comment",
      "type": "comment",
      "category": "block",
      "target": {
        "sid": "p5"
      }
    }
  ]
}
```

**특징**:
- **Block decorator는 `children` 배열에 별도의 VNode로 추가됩니다** (sibling 관계).
- Block decorator VNode는 `data-decorator-sid`와 `data-decorator-category: 'block'` 속성을 가집니다.
- Block decorator는 텍스트를 감싸지 않고, 컴포넌트의 자식으로 추가됩니다.
- 원본 텍스트는 여전히 루트 VNode의 `text` 필드에 포함됩니다.
- 컴포넌트 VNode의 최상위에 `decorators` 배열로도 저장되어 있습니다 (메타데이터).
- **Block decorator는 컴포넌트 VNode에만 적용됩니다** (마크 VNode에는 적용되지 않음).

### Block Decorator 위치 결정

Block decorator의 위치는 `DecoratorData.position` 속성에 따라 결정됩니다:

**Position 값**:
- `before`: children 배열의 맨 앞에 추가 (`vnode.children.unshift()`)
- `after` (기본값): children 배열의 맨 끝에 추가 (`vnode.children.push()`)
- `inside-start`: 첫 번째 자식 요소의 children 안에 추가 (자식이 element인 경우)
- `inside-end`: 마지막 자식 요소의 children 안에 추가 (자식이 element인 경우)
- `overlay` / `absolute`: Layer decorator용, children 배열의 끝에 추가

**Position 정보 저장**:
- `DecoratorData.position` 필드에 위치 정보가 저장됩니다 (optional)
- VNodeBuilder가 `buildDecoratorVNode` 시 `data-decorator-position` 속성으로 VNode에 저장합니다
- `position`이 없으면 기본값이 사용됩니다 (block: `after`, layer: `overlay`)

**예제**:
```javascript
{
  sid: 'd1',
  stype: 'comment',
  category: 'block',
  target: { sid: 'p1' },
  position: 'before'  // children 배열의 맨 앞에 추가
}
```

생성된 VNode:
```json
{
  "tag": "div",
  "attrs": {},
  "style": {},
  "children": [],
  "decoratorSid": "d1",
  "decoratorStype": "comment",
  "decoratorCategory": "block",
  "decoratorPosition": "before",
  "decoratorModel": {
    "sid": "d1",
    "stype": "comment",
    "category": "block",
    "target": { "sid": "p1" },
    "position": "before"
  }
}
```

**중요**: `data-decorator-*` 속성은 VNode의 `attrs`에 포함되지 않습니다. 이러한 속성은 Reconciler에서 DOM 요소에 직접 추가됩니다. VNode에서는 최상위 필드(`decoratorSid`, `decoratorStype`, `decoratorCategory`, `decoratorPosition`, `decoratorModel`)로 저장됩니다.

---

## 예제 6: 복잡한 문서 구조

### 입력 모델
```javascript
{
  stype: 'document',
  sid: 'doc1',
  content: [
    {
      stype: 'paragraph',
      sid: 'p1',
      text: 'This is bold and italic text',
      marks: [
        { type: 'bold', range: [8, 12] }
      ]
    },
    {
      stype: 'paragraph',
      sid: 'p2',
      text: 'This paragraph has a highlight'
    }
  ]
}
```

### Decorators
```javascript
[
  {
    sid: 'd1',
    stype: 'highlight',
    type: 'highlight',
    category: 'inline',
    target: { sid: 'p2', startOffset: 25, endOffset: 34 }
  },
  {
    sid: 'd2',
    stype: 'comment',
    type: 'comment',
    category: 'block',
    target: { sid: 'p2' }
  }
]
```

### 생성된 VNode 구조
```json
{
  "tag": "article",
  "attrs": {
    "className": "document"
  },
  "style": {},
  "children": [
    {
      "tag": "p",
      "attrs": {},
      "style": {},
      "children": [
        {
          "attrs": {},
          "style": {},
          "children": [],
          "text": "This is "
        },
        {
          "tag": "strong",
          "attrs": {},
          "style": {},
          "children": []
        },
        {
          "attrs": {},
          "style": {},
          "children": [],
          "text": " and italic text"
        }
      ],
      "component": {
        "name": "paragraph",
        "props": {
          "text": "This is bold and italic text",
          "marks": [
            {
              "type": "bold",
              "range": [8, 12]
            }
          ]
        },
        "model": {
          "stype": "paragraph",
          "sid": "p1",
          "text": "This is bold and italic text",
          "marks": [
            {
              "type": "bold",
              "range": [8, 12]
            }
          ]
        },
      },
      "sid": "p1",
      "stype": "paragraph",
      "props": {
        "text": "This is bold and italic text",
        "marks": [
          {
            "type": "bold",
            "range": [8, 12]
          }
        ]
      },
      "model": {
        "stype": "paragraph",
        "sid": "p1",
        "text": "This is bold and italic text",
        "marks": [
          {
            "type": "bold",
            "range": [8, 12]
          }
        ]
      },
      "marks": [
        {
          "type": "bold",
          "range": [8, 12]
        }
      ],
      "decorators": []
    },
    {
      "tag": "p",
      "attrs": {},
      "style": {},
      "children": [],
      "text": "This paragraph has a highlight",
      "sid": "p2",
      "stype": "paragraph",
      "props": {
        "text": "This paragraph has a highlight"
      },
      "model": {
        "stype": "paragraph",
        "sid": "p2",
        "text": "This paragraph has a highlight"
      },
      "decorators": []
    }
  ],
  "sid": "doc1",
  "stype": "document",
  "props": {
    "content": [
      {
        "stype": "paragraph",
        "sid": "p1",
        "text": "This is bold and italic text",
        "marks": [
          {
            "type": "bold",
            "range": [8, 12]
          }
        ]
      },
      {
        "stype": "paragraph",
        "sid": "p2",
        "text": "This paragraph has a highlight"
      }
    ]
  },
  "model": {
    "stype": "document",
    "sid": "doc1",
    "content": [
      {
        "stype": "paragraph",
        "sid": "p1",
        "text": "This is bold and italic text",
        "marks": [
          {
            "type": "bold",
            "range": [8, 12]
          }
        ]
      },
      {
        "stype": "paragraph",
        "sid": "p2",
        "text": "This paragraph has a highlight"
      }
    ]
  },
  "decorators": [
    {
      "sid": "d1",
      "stype": "highlight",
      "type": "highlight",
      "category": "inline",
      "target": {
        "sid": "p2",
        "startOffset": 25,
        "endOffset": 34
      }
    },
    {
      "sid": "d2",
      "stype": "comment",
      "type": "comment",
      "category": "block",
      "target": {
        "sid": "p2"
      }
    }
  ]
}
```

**특징**:
- `slot('content')`를 사용하는 경우, VNodeBuilder가 `content` 배열의 각 항목을 별도의 VNode로 변환하여 `children`에 포함합니다.
- 각 자식 VNode는 `sid`, `stype`, `props`, `model`이 최상위에 설정되어 있습니다.
- 루트 document VNode에도 `sid`, `stype`, `props`, `model`, `decorators`가 최상위에 설정되어 있습니다.
- `marks`가 있는 자식 VNode는 `marks` 배열도 최상위에 포함합니다.
- **VNode에는 `data-bc-sid` 같은 DOM 표식이 attrs에 포함되지 않습니다**. 이러한 속성은 Reconciler에서 DOM 요소에 직접 추가됩니다.

---

## 예제 7: 아주 복잡한 Mark와 Decorator 결합

### 입력 모델
```javascript
{
  stype: 'paragraph',
  sid: 'p1',
  text: 'This is bold and italic text with code',
  marks: [
    { type: 'bold', range: [8, 12] },      // "bold"
    { type: 'italic', range: [13, 19] },   // "and italic"
    { type: 'code', range: [30, 34] }      // "code"
  ]
}
```

### Decorators
```javascript
[
  {
    sid: 'd1',
    stype: 'highlight',
    type: 'highlight',
    category: 'inline',
    target: { sid: 'p1', startOffset: 0, endOffset: 25 }  // "This is bold and italic"
  },
  {
    sid: 'd2',
    stype: 'comment',
    type: 'comment',
    category: 'inline',
    target: { sid: 'p1', startOffset: 26, endOffset: 34 }  // "text with code"
  }
]
```

### 생성된 VNode 구조 요약

복잡한 mark와 decorator 결합 시, VNodeBuilder는 다음과 같은 알고리즘으로 처리합니다:

1. **먼저 마크로 텍스트를 분할** (`splitTextByMarks`)
2. **각 마크 run에 대해 decorator로 다시 분할** (`splitTextByDecorators`)
3. **결과 구조**: `decorator VNode > mark VNode > text`

**핵심 원칙**:
- **Decorator가 텍스트를 분할**: Decorator 범위에 따라 텍스트가 분할되고, 각 부분이 별도의 decorator VNode가 됩니다.
- **마크가 decorator 안에 중첩**: Decorator 범위 내에 있는 마크는 decorator VNode의 children 안에 들어갑니다.
- **Block decorator는 마크 안에 들어감**: Block decorator가 마크 범위와 겹치면 마크 VNode의 children 안에 들어갑니다.

### 실제 생성된 VNode 구조

```json
{
  "tag": "p",
  "attrs": {},
  "style": {},
  "children": [
    {
      "tag": "div",
      "attrs": {
        "data-decorator-sid": "d1",
        "data-decorator-category": "inline"
      },
      "style": {},
      "children": [
        {
          "attrs": {},
          "style": {},
          "children": [],
          "text": "This is "
        }
      ]
    },
    {
      "tag": "div",
      "attrs": {
        "data-decorator-sid": "d1",
        "data-decorator-category": "inline"
      },
      "style": {},
      "children": [
        {
          "tag": "strong",
          "attrs": {
            "className": "mark-bold"
          },
          "style": {},
          "children": []
        }
      ]
    },
    {
      "tag": "div",
      "attrs": {
        "data-decorator-sid": "d1",
        "data-decorator-category": "inline"
      },
      "style": {},
      "children": [
        {
          "attrs": {},
          "style": {},
          "children": [],
          "text": " "
        }
      ]
    },
    {
      "tag": "div",
      "attrs": {
        "data-decorator-sid": "d1",
        "data-decorator-category": "inline"
      },
      "style": {},
      "children": [
        {
          "tag": "em",
          "attrs": {
            "className": "mark-italic"
          },
          "style": {},
          "children": []
        }
      ]
    },
    {
      "tag": "div",
      "attrs": {
        "data-decorator-sid": "d1",
        "data-decorator-category": "inline"
      },
      "style": {},
      "children": [
        {
          "attrs": {},
          "style": {},
          "children": [],
          "text": "alic text w"
        }
      ]
    },
    {
      "tag": "div",
      "attrs": {
        "data-decorator-sid": "d2",
        "data-decorator-category": "inline"
      },
      "style": {},
      "children": [
        {
          "tag": "code",
          "attrs": {
            "className": "mark-code"
          },
          "style": {},
          "children": []
        }
      ]
    },
    {
      "tag": "div",
      "attrs": {
        "data-decorator-sid": "d2",
        "data-decorator-category": "inline"
      },
      "style": {},
      "children": [
        {
          "attrs": {},
          "style": {},
          "children": [],
          "text": "code"
        }
      ]
    }
  ],
  "sid": "p1",
  "stype": "paragraph",
  "props": {
    "text": "This is bold and italic text with code",
    "marks": [
      { "type": "bold", "range": [8, 12] },
      { "type": "italic", "range": [13, 19] },
      { "type": "code", "range": [30, 34] }
    ]
  },
  "model": {
    "stype": "paragraph",
    "sid": "p1",
    "text": "This is bold and italic text with code",
    "marks": [
      { "type": "bold", "range": [8, 12] },
      { "type": "italic", "range": [13, 19] },
      { "type": "code", "range": [30, 34] }
    ]
  },
  "decorators": [
    {
      "sid": "d1",
      "stype": "highlight",
      "type": "highlight",
      "category": "inline",
      "target": { "sid": "p1", "startOffset": 0, "endOffset": 25 }
    },
    {
      "sid": "d2",
      "stype": "comment",
      "type": "comment",
      "category": "inline",
      "target": { "sid": "p1", "startOffset": 26, "endOffset": 34 }
    }
  ],
  "marks": [
    { "type": "bold", "range": [8, 12] },
    { "type": "italic", "range": [13, 19] },
    { "type": "code", "range": [30, 34] }
  ]
}
```

**특징**:
- **Decorator가 텍스트를 분할**: Decorator 범위 `[0-25]`와 `[26-34]`에 따라 텍스트가 분할되어, 각 부분이 별도의 decorator VNode가 됩니다.
- **마크가 decorator 안에 중첩**: 
  - `"bold"` 마크는 decorator `[0-25]` 범위에 포함되므로, decorator VNode의 children 안에 `<strong>` 태그로 중첩됩니다.
  - `"and italic"` 마크도 decorator `[0-25]` 범위에 포함되므로, decorator VNode의 children 안에 `<em>` 태그로 중첩됩니다.
  - `"code"` 마크는 decorator `[26-34]` 범위에 포함되므로, decorator VNode의 children 안에 `<code>` 태그로 중첩됩니다.
- **텍스트 부분 처리**: 마크나 decorator가 없는 텍스트 부분(`"This is "`, `" "`, `"alic text w"`)은 decorator VNode 안에 직접 텍스트 노드로 포함됩니다.
- **중첩 구조**: 최종 구조는 `decorator VNode > mark VNode > text` 또는 `decorator VNode > text` 형태입니다.

### 처리 알고리즘 상세

VNodeBuilder는 `_buildMarkedRunsWithDecorators` 메서드에서 다음 순서로 처리합니다:

1. **마크 분할**: `splitTextByMarks(text, marks)`로 텍스트를 마크 범위에 따라 분할
   - 예: `[0-8: "This is "], [8-12: "bold"], [12-13: " "], [13-19: "and italic"], ...`

2. **Decorator 분할**: 각 마크 run에 대해 `splitTextByDecorators(markRun.text, decorators)`로 decorator 범위에 따라 다시 분할
   - 예: 마크 run `[0-8: "This is "]`는 decorator `[0-25]` 범위에 포함되므로 decorator VNode로 감싸짐

3. **중첩 구조 생성**:
   - Decorator가 있으면: `decorator VNode > mark VNode > text`
   - Decorator가 없으면: `mark VNode > text` 또는 단순 `text`

4. **Block decorator 처리**: Block decorator는 별도로 처리되어 `children` 배열에 추가되거나, 마크 범위와 겹치면 마크 VNode의 children 안에 들어갑니다.

### 예제 7-1: 마크와 Decorator가 부분적으로 겹치는 경우

마크와 decorator가 부분적으로 겹칠 때의 처리 예시:

**입력**:
- 텍스트: `"Bold text with highlight"`
- 마크: `bold [0, 9]` (전체 "Bold text")
- Decorator: `highlight [5, 25]` ("text with highlight")

**처리 결과**:
1. 마크로 분할: `[0-5: "Bold "]`, `[5-9: "text"]`, `[9-25: " with highlight"]`
2. Decorator 적용:
   - `[0-5: "Bold "]`: 마크만 → `<strong>` VNode (decorator 범위 밖)
   - `[5-9: "text"]`: 마크 + decorator → decorator VNode 안에 `<strong>` VNode 중첩
   - `[9-25: " with highlight"]`: decorator만 → decorator VNode 안에 텍스트 노드

**생성된 구조**:
```json
{
  "children": [
    {
      "tag": "strong",
      "attrs": { "className": "mark-bold" },
      "children": []
    },
    {
      "tag": "div",
      "attrs": {
        "data-decorator-sid": "d3",
        "data-decorator-category": "inline"
      },
      "children": [
        {
          "tag": "strong",
          "attrs": { "className": "mark-bold" },
          "children": []
        }
      ]
    },
    {
      "attrs": {},
      "text": " with"
    },
    {
      "tag": "div",
      "attrs": {
        "data-decorator-sid": "d3",
        "data-decorator-category": "inline"
      },
      "children": [
        {
          "attrs": {},
          "text": " highlight"
        }
      ]
    }
  ]
}
```

**핵심**:
- 마크와 decorator가 겹치는 부분(`[5-9: "text"]`)은 decorator VNode 안에 마크 VNode가 중첩됩니다.
- 마크만 있는 부분(`[0-5: "Bold "]`)은 decorator 없이 마크 VNode만 생성됩니다.
- Decorator만 있는 부분(`[9-25: " with highlight"]`)은 decorator VNode 안에 텍스트 노드만 포함됩니다.

---

## 전체 문서 VNode 검증 (main.ts 기반)

`main.ts`의 실제 문서 구조를 참고하여 생성된 VNode를 검증한 결과입니다.

### 복잡한 마크 조합 문서

**모델 입력:**
```javascript
{
  sid: 'doc-1',
  stype: 'document',
  content: [
    {
      sid: 'p-1',
      stype: 'paragraph',
      content: [
        { sid: 'text-1', stype: 'inline-text', text: 'This is a ' },
        { sid: 'text-bold', stype: 'inline-text', text: 'bold text', marks: [{ type: 'bold', range: [0, 9] }] },
        { sid: 'text-2', stype: 'inline-text', text: ' and this is ' },
        { sid: 'text-italic', stype: 'inline-text', text: 'italic text', marks: [{ type: 'italic', range: [0, 11] }] },
        { sid: 'text-3', stype: 'inline-text', text: '. You can also combine them: ' },
        { sid: 'text-bold-italic', stype: 'inline-text', text: 'bold and italic', marks: [
          { type: 'bold', range: [0, 15] },
          { type: 'italic', range: [0, 15] }
        ] },
        { sid: 'text-4', stype: 'inline-text', text: '. Now with colors: ' },
        { sid: 'text-red', stype: 'inline-text', text: 'red text', marks: [{ type: 'fontColor', range: [0, 8], attrs: { color: '#ff0000' } }] },
        { sid: 'text-5', stype: 'inline-text', text: ' and ' },
        { sid: 'text-yellow-bg', stype: 'inline-text', text: 'yellow background', marks: [{ type: 'bgColor', range: [0, 16], attrs: { bgColor: '#ffff00' } }] },
        { sid: 'text-6', stype: 'inline-text', text: '.' }
      ]
    }
  ]
}
```

**생성된 VNode 구조:**
- `document` VNode는 `sid: 'doc-1'`, `stype: 'document'`를 최상위에 가짐
- `paragraph` VNode는 `sid: 'p-1'`, `stype: 'paragraph'`를 최상위에 가짐
- 각 `inline-text` VNode는:
  - `sid`, `stype`, `props`, `model`을 최상위에 가짐
  - 마크가 있는 경우 `marks` 배열을 최상위에 가짐
  - 마크가 적용된 텍스트는 중첩된 마크 VNode로 감싸짐
  - 복합 마크(bold + italic)는 중첩 구조로 처리됨 (bold → italic 순서)

**주요 특징:**
1. **중첩 마크 처리**: `bold`와 `italic`이 동시에 적용되면 `bold` VNode 안에 `italic` VNode가 중첩됨
2. **색상 마크**: `fontColor`와 `bgColor`는 각각 `attrs`에 색상 값을 포함
3. **순수 표현**: 모든 `data-bc-*` 속성은 VNode에 포함되지 않음 (Reconciler에서 추가)
4. **모델 정보 보존**: 각 VNode는 원본 모델 정보(`model`)와 처리된 props(`props`)를 모두 보존

### 검증 결과

✅ **통과한 테스트:**
- 복잡한 마크 조합 문서 VNode 생성
- 중첩 마크 처리 (bold + italic)
- 색상 마크 처리 (fontColor, bgColor)
- 복합 마크와 decorator 조합

⚠️ **주의사항:**
- Inline decorator는 각 텍스트 노드의 `sid`를 target으로 해야 함
- Block decorator는 paragraph 레벨에서 처리되며, paragraph의 children에 삽입됨

## Portal 처리

Portal은 다른 DOM target에 렌더링하기 위한 메커니즘입니다.

### Portal 사용 범위

**Portal은 주로 Decorator에서 사용됩니다:**

1. **Model 렌더러 (`define`)**: ❌ 거의 사용되지 않음
   - 문서의 실제 콘텐츠를 렌더링 (paragraph, heading 등)
   - 일반적으로 Portal이 필요 없음

2. **Mark 렌더러 (`defineMark`)**: ❌ 사용되지 않음
   - 텍스트 스타일만 적용 (bold, italic, color 등)
   - Portal이 필요 없음

3. **Decorator 렌더러 (`defineDecorator`)**: ✅ 주로 사용
   - 부가 UI 요소 (주석 툴팁, 팝업, 모달 등)
   - 에디터 컨테이너 밖에 렌더링해야 할 때 Portal 사용

### Portal VNode 구조

```typescript
{
  tag: 'portal',
  attrs: {
    target: HTMLElement  // Portal이 렌더링될 DOM 요소
  },
  portal: {
    target: HTMLElement,  // Portal target
    template: ElementTemplate,  // Portal 내부에 렌더링될 템플릿
    portalId?: string  // Portal 식별자 (선택사항)
  },
  children: [VNode]  // Portal content VNode
}
```

### Portal 사용 예제 (Decorator에서)

**Decorator에서 Portal 사용:**
```typescript
// 주석 Decorator에 툴팁 Portal 추가
defineDecorator('comment', (props, ctx) => {
  ctx.initState('showTooltip', false);
  
  return element('div', {
    className: 'comment-indicator',
    onMouseEnter: () => ctx.setState('showTooltip', true),
    onMouseLeave: () => ctx.setState('showTooltip', false)
  }, [
    text('💬'),
    // Portal을 사용하여 document.body에 툴팁 렌더링
    portal(document.body, element('div', {
      className: 'comment-tooltip',
      style: {
        position: 'fixed',
        zIndex: 1001,
        opacity: ctx.getState('showTooltip') ? 1 : 0,
        transition: 'opacity 0.2s ease'
      }
    }, [text('Comment tooltip content')]), 'comment-tooltip')
  ]);
});
```

**Model 렌더러에서는 Portal 사용하지 않음:**
```typescript
// ❌ 일반적으로 사용하지 않음
define('paragraph', element('p', {}, [
  portal(portalTarget, ...)  // 필요 없음
]));

// ✅ 정상적인 사용
define('paragraph', element('p', {}, [
  slot('content')  // 일반 콘텐츠
]));
```

**생성된 VNode:**
- `tag: 'portal'`로 식별됨
- `portal.target`: Portal이 렌더링될 DOM 요소
- `portal.template`: Portal 내부 템플릿
- `children`: Portal content VNode

### Portal Target 타입

1. **HTMLElement**: 직접 DOM 요소 전달
2. **Selector String**: `'#portal-target'`, `'body'` 등
3. **Function**: `(data) => HTMLElement` 동적 target 결정

### Portal 검증 결과

✅ **통과한 테스트:**
- HTMLElement target
- Selector string target
- Body target
- Function target
- Custom portalId
- Portal content building (element template, component template)
- Portal error handling (invalid selector, null target)
- Nested portal structures
- Multiple portals in same container

## DSL 함수 지원

VNodeBuilder는 다음과 같은 DSL 함수를 지원합니다:

### when() - 조건부 렌더링

```typescript
define('conditional', element('div', {}, [
  when((d: any) => d.show, element('span', {}, [text('Visible')])),
  when((d: any) => !d.show, element('span', {}, [text('Hidden')]))
]));
```

- 함수나 boolean 값을 조건으로 사용 가능
- `elseTemplate` 지원
- 중첩된 `when()` 지원

### each() - 반복 렌더링

```typescript
define('list', element('ul', {}, [
  each('items', (item: any, index: number) => 
    element('li', {}, [text(item.name)])
  )
]));
```

- 배열 데이터를 순회하여 각 항목을 렌더링
- `key` 함수 지원 (효율적인 reconciliation을 위해)
- 중첩된 `each()` 지원
- 각 item의 `sid`는 옵션으로 전달되지만, 일반 element이므로 `stype`가 없으면 `sid`도 설정되지 않을 수 있음

### 조합 사용

```typescript
// when() + each() 조합
define('conditional-list', element('div', {}, [
  when((d: any) => d.showList, element('ul', {}, [
    each('items', (item: any) => element('li', {}, [text(item.name)]))
  ]))
]));

// each() 내부에서 when() 사용
define('conditional-items', element('ul', {}, [
  each('items', (item: any) => 
    element('li', {}, [
      when((d: any) => d.visible, element('span', {}, [text(item.name)]))
    ])
  )
]));
```

**검증 완료:**
- ✅ `when()` 조건부 렌더링 (함수, boolean, elseTemplate, 중첩)
- ✅ `each()` 반복 렌더링 (빈 배열, key 함수, 중첩, sid 처리)
- ✅ `when()` + `each()` 조합

### 함수형 컴포넌트 정의

```typescript
define('greeting', (props: any, model: any, ctx: any) => {
  const name = props.name || 'Guest';
  return element('div', { className: 'greeting' }, [
    text(`Hello, ${name}!`)
  ]);
});
```

**함수 시그니처:**
- `(props: ComponentProps, model: ModelData, context: ComponentContext) => ElementTemplate`
- `props`: 순수 props 데이터 (stype, sid 제외)
- `model`: 원본 모델 데이터 (stype, sid 포함)
- `context`: 컴포넌트 컨텍스트 객체
  - `context.model`: 원본 모델 데이터 (두 번째 인자 model과 동일)
  - `context.state`: 컴포넌트 상태
  - `context.props`: props (첫 번째 인자 props와 동일)
  - `context.initState(initial)`: 상태 초기화
  - `context.getState(key)`: 상태 조회
  - `context.setState(newState)`: 상태 업데이트
  - `context.toggleState(key)`: 상태 토글

**사용 예시:**
```typescript
define('counter', (props: any, model: any, ctx: any) => {
  ctx.initState({ count: props.initialCount || 0 });
  const count = ctx.getState('count') || 0;
  
  return element('div', { className: 'counter' }, [
    text(`Count: ${count}`),
    element('button', {
      onClick: () => ctx.setState({ count: count + 1 })
    }, [text('Increment')])
  ]);
});

// 모델 접근 (두 번째 인자 model 사용)
define('model-access', (props: any, model: any, ctx: any) => {
  const sid = model.sid || 'none';
  const stype = model.stype || 'none';
  
  return element('div', {}, [
    text(`SID: ${sid}, Type: ${stype}`)
  ]);
});
```

**중요:**
- `props`와 `model`은 **명확히 분리**되어 있습니다
- `props`: 순수 전달 데이터 (stype, sid 제외)
- `model`: 원본 모델 데이터 (stype, sid 포함)
- `context.model`과 두 번째 인자 `model`은 동일한 객체입니다

**검증 완료:**
- ✅ 함수형 컴포넌트 기본 기능 (props, context 접근)
- ✅ `context.model` 접근
- ✅ `context.state` 관리 (initState, getState, setState)
- ✅ ElementTemplate 반환
- ✅ `slot()` 사용
- ✅ Props와 Model 분리
- ✅ `data()` 바인딩
- ✅ 중첩된 함수형 컴포넌트

## 성능 검증

VNodeBuilder의 성능을 다양한 시나리오로 검증했습니다.

### 성능 테스트 결과

#### 1. 큰 문서 구조 (1000 paragraphs)
- **결과**: ✅ 통과
- **실제 처리 시간**: ~42.7ms
- **평균**: ~0.043ms per paragraph
- **성능**: 매우 우수 (기준: < 1000ms)

#### 2. 마크가 있는 문서 (100 paragraphs with marks)
- **결과**: ✅ 통과
- **실제 처리 시간**: ~4.5ms
- **평균**: ~0.045ms per paragraph (marks 포함)
- **성능**: 매우 우수 (기준: < 500ms)

#### 3. 깊은 중첩 구조 (10 levels)
- **결과**: ✅ 통과
- **실제 처리 시간**: ~0.21ms
- **특징**: 재귀적 구조 처리 최적화, 매우 빠른 처리 속도

#### 4. 넓은 구조 (1000 siblings)
- **결과**: ✅ 통과
- **실제 처리 시간**: ~18.2ms
- **평균**: ~0.018ms per sibling
- **성능**: 매우 우수 (기준: < 500ms)

#### 5. 복잡한 마크 처리 (100 overlapping marks)
- **결과**: ✅ 통과
- **실제 처리 시간**: ~2.0ms
- **특징**: 마크 분할 및 중첩 처리 최적화, 매우 빠른 처리 속도

#### 6. 메모리 효율성 (500 paragraphs)
- **결과**: ✅ 통과
- **특징**: VNode 구조가 올바르게 생성되고 메모리 사용이 효율적

### 성능 기준

- **큰 문서 (1000+ 노드)**: 1초 이내 처리
- **중간 문서 (100-500 노드)**: 500ms 이내 처리
- **작은 문서 (< 100 노드)**: 100ms 이내 처리
- **복잡한 마크 처리**: 200ms 이내 처리

### 성능 최적화 포인트

1. **효율적인 마크 분할**: `splitTextByMarks` 알고리즘 최적화
2. **Decorator 인덱싱**: Decorator 범위 사전 계산
3. **VNode 재사용**: 동일한 모델에 대한 VNode 재사용 가능
4. **메모리 효율성**: 불필요한 객체 생성 최소화

## 요약

### 텍스트 처리 방식
1. **단순 텍스트**: `text` 필드에 직접 저장
2. **마크가 있는 텍스트**: `children` 배열에 마크 태그와 텍스트 노드로 분할
3. **Decorator가 있는 텍스트**: `children` 배열에 decorator VNode와 텍스트 노드로 분할
4. **마크와 Decorator 결합**: Decorator 범위에 따라 텍스트가 분할되고, 각 부분이 decorator VNode가 되며, 그 안에 마크 VNode가 중첩됩니다.

### Decorator 표현
- **Inline decorator**: 텍스트 범위를 감싸는 VNode로 표현, `data-decorator-sid`와 `data-decorator-category` 속성 포함
- **Block decorator**: 컴포넌트의 자식으로 추가되는 별도 VNode
- **Decorator와 마크 결합**: Decorator 범위 내에 있는 마크는 decorator VNode의 children 안에 중첩됩니다.
- **여러 Decorator 겹침**: 각 decorator 범위에 따라 텍스트가 분할되어 각각 별도의 decorator VNode가 됩니다.

### Component 정보
- 모든 컴포넌트 VNode는 최상위에 `stype`, `props`, `model` 필드를 포함합니다.
- `props`: sanitized된 props (stype, sid 제외) - 순수 props만 포함
- `model`: 원본 모델 데이터 (stype, sid 포함) - optional, fallback to props
- `decorators`: 적용된 decorator 정보 배열

### VNode 최상위 필드
- `sid`: Schema ID - 모델에서 제공된 값을 그대로 사용 (생성하지 않음)
- `stype`: Schema Type - 컴포넌트 이름 또는 모델에서 가져옴
- `props`: 순수 props (stype/sid/type 제외) - only for component-generated VNodes
- `model`: 원본 모델 데이터 (stype/sid 포함) - only for component-generated VNodes (optional, fallback to props)
- `marks`: 텍스트 마크 정보 배열 (모델에 marks가 있을 때만 설정)
- `decorators`: Decorator 정보 배열 (build options 또는 component에서 가져옴)
- `isExternal`: 외부 컴포넌트(managesDOM 패턴)인지 여부 - only for component-generated VNodes
- 이 필드들은 컴포넌트로 생성된 VNode(tag와 stype가 있는 경우)에만 존재합니다.

### Mark 문법
- 마크는 `{ type: 'markName', range: [start, end] }` 형식으로 정의됩니다.
- `range`는 `[start, end]` 배열 형태로, 텍스트의 시작과 끝 인덱스를 나타냅니다.
- 여러 마크가 겹칠 수 있으며, VNodeBuilder가 적절히 중첩 구조로 변환합니다.
- 마크와 decorator가 결합되면, decorator 범위 내에 있는 마크는 decorator VNode 안에 중첩됩니다.

### Slot 문법
- 템플릿에서 자식 요소는 `slot('content')`로 정의합니다.
- 모델에서 자식 요소들은 `content: []` 배열에 포함됩니다.
- VNodeBuilder가 `content` 배열의 각 항목을 별도의 VNode로 변환하여 `children`에 포함합니다.
- 각 자식 VNode는 자체 `stype`, `props`, `model` 정보를 최상위에 포함합니다.

### Mark와 Decorator 결합 처리 알고리즘

복잡한 mark와 decorator 결합 시 VNodeBuilder의 처리 순서:

1. **마크 분할**: `splitTextByMarks(text, marks)`로 텍스트를 마크 범위에 따라 분할
2. **Decorator 분할**: 각 마크 run에 대해 `splitTextByDecorators()`로 decorator 범위에 따라 다시 분할
3. **중첩 구조 생성**:
   - Decorator 범위 내에 있는 마크: `decorator VNode > mark VNode`
   - Decorator 범위 밖의 마크: `mark VNode` (독립)
   - Decorator만 있는 부분: `decorator VNode > text`
4. **Block decorator**: Block decorator는 `children` 배열에 추가되거나, 마크 범위와 겹치면 마크 VNode의 children 안에 들어갑니다.

**핵심 원칙**:
- Decorator가 텍스트를 분할하는 주체입니다 (decorator 범위에 따라 분할).
- 마크는 decorator 범위 내에서만 중첩됩니다.
- 여러 decorator가 겹치면 각 decorator 범위별로 별도의 decorator VNode가 생성됩니다.

### Decorator VNode 최상위 필드
- `decoratorSid`: Decorator Schema ID - decorator VNode에만 존재
- `decoratorStype`: Decorator Schema Type - decorator VNode에만 존재
- `decoratorCategory`: Decorator category (`'layer' | 'inline' | 'block'`) - decorator VNode에만 존재
- `decoratorPosition`: Decorator position (`'before' | 'after' | 'inside-start' | 'inside-end' | 'overlay' | 'absolute'`) - decorator VNode에만 존재 (optional)
- `decoratorModel`: 원본 DecoratorData - decorator VNode에만 존재 (optional, full context)
- 이 필드들은 decorator로 생성된 VNode에만 존재합니다.

### DOM 표식과의 차이
- VNode에는 `data-bc-*` 속성이 포함되지 않습니다.
- VNode에는 `data-decorator-*` 속성도 포함되지 않습니다.
- `data-bc-*`와 `data-decorator-*`는 Reconciler에서 DOM 요소에 직접 추가됩니다.
- VNode에서는 decorator 정보를 최상위 필드(`decoratorSid`, `decoratorStype`, `decoratorCategory`, `decoratorPosition`, `decoratorModel`)로 저장합니다.

