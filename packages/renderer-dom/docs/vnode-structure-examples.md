# VNode Structure Examples Document

This document shows VNode structures that VNodeBuilder generates for various model inputs in JSON format.

## VNode Basic Structure

VNode has the following structure:

```typescript
interface VNode {
  tag?: string;           // HTML tag name (e.g., 'div', 'p', 'span')
  attrs?: Record<string, any>;  // HTML attributes
  style?: Record<string, any>; // Inline styles
  text?: string;          // Text content for text nodes
  children?: (VNode | string)[]; // Child node array
  key?: string;           // Key for efficient child matching during reconciliation
  
  // Component identity information (only for component-generated VNodes)
  // These are set at the top level to indicate where the node originated from
  // They are NOT added to attrs as data-bc-* attributes (those are added by Reconciler)
  sid?: string;           // Schema ID - only set for component-generated VNodes with tag
  stype?: string;         // Schema Type - only set for component-generated VNodes with tag
  props?: Record<string, any>;      // Pure props (excluding stype/sid/type) - only for component-generated VNodes
  model?: Record<string, any>;       // Original model data (including stype/sid) - only for component-generated VNodes (optional, fallback to props)
  decorators?: any[];     // Decorators applied to this node
  isExternal?: boolean; // true: external component, false: contextual component - only for component-generated VNodes
}
```

**Important**: 
- VNode does **not include** DOM marker attributes like `data-bc-sid`, `data-bc-stype`, `data-bc-component` in **attrs**. These attributes are added directly to DOM elements by Reconciler.
- `sid`, `stype`, `props`, `model`, `decorators`, `isExternal` are set as top-level fields of VNode, and only exist for component-generated VNodes (those with tag and stype).
- `props` contains pure props (excluding stype/sid/type), and `model` contains original model data (including stype/sid). `props` is used as fallback if `model` is missing.
- `decorators` is also set as top-level field of VNode, allowing fast access to decorator information.
- `isExternal` indicates whether it's an external component (managesDOM pattern).

**Note**: Decorators are represented as VNodes with `data-decorator-sid` and `data-decorator-category` attributes. These are internal VNode markers for identifying decorators, and differ from DOM markers (`data-bc-*`).

### Mark Syntax

Text marks use the following format:

```javascript
marks: [
  { type: 'bold', range: [start, end] },
  { type: 'italic', range: [start, end] }
]
```

- `type`: Mark type (e.g., 'bold', 'italic', 'underline')
- `range`: Text range in `[start, end]` array format (0-based index)

### Slot Syntax

Child elements are defined using `slot('content')`, and included in `content: []` array in model:

```javascript
// Template definition
define('list', element('ul', { className: 'list' }, [
  slot('content')
]));

// Model
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

## Example 1: Simple Paragraph

### Input Model
```javascript
{
  stype: 'paragraph',
  sid: 'p1',
  text: 'Hello world'
}
```

### Template Definition
```javascript
define('paragraph', element('p', { className: 'para' }, [data('text')]));
```

### Generated VNode Structure
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

**Characteristics**:
- Simple text is stored directly in `text` field.
- `children` array is empty.
- `props` and `model` are set at VNode top level.
- `props` contains pure props (excluding stype/sid), and `model` contains original model data.
- `sid`, `stype` are set at VNode top level (using values provided from model as-is).
- `decorators` array is at top level (empty).

---

## Example 2: Paragraph with Text Marks

### Input Model
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

### Template Definition
```javascript
define('paragraph', element('p', {}, [data('text')]));
define('mark:bold', element('strong', { className: 'mark-bold' }, []));
define('mark:italic', element('em', { className: 'mark-italic' }, []));
```

### Generated VNode Structure
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

**Characteristics**:
- Text with marks is separated into mark tags (`<strong>`, `<em>`) and text nodes in `children` array.
- Mark tags have `tag` and `attrs`, but actual text content is included as separate text node or child.
- Spaces between marks are also represented as separate text nodes.
- `marks` array is set at VNode top level, allowing fast access to mark information from model.
- `sid`, `stype` are set at VNode top level (using values provided from model as-is).

---

## Example 3: Paragraph with Inline Decorator

### Input Model
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

### Template Definition
```javascript
define('paragraph', element('p', {}, [data('text')]));
defineDecorator('highlight', element('span', { className: 'highlight' }, []));
```

### Generated VNode Structure
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

**Characteristics**:
- Inline decorator is represented as VNode with `data-decorator-sid` and `data-decorator-category` attributes.
- `decorators` array is set at VNode top level, allowing fast access to decorator information.
- `sid`, `stype` are set at VNode top level (using values provided from model as-is).
- Text within decorator range is included in decorator VNode's `children`.
- Text outside decorator range is included as separate text node.

---

## Example 4: Text Marks and Decorator Integration

### Input Model
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

**Characteristics**:
- When marks and decorators are applied together, text is split into mark ranges, decorator ranges, and plain text.
- Marks are represented as `<strong>` tags, decorators as tags with `data-decorator-*` attributes.
- Each range is included in `children` array in order.
- `marks` and `decorators` arrays are set at VNode top level, allowing fast access to model information.
- `sid`, `stype` are set at VNode top level (using values provided from model as-is).

---

## Example 5: Paragraph with Block Decorator

### Input Model
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

**Characteristics**:
- **Block decorator is added as separate VNode in `children` array** (sibling relationship).
- Block decorator VNode has `data-decorator-sid` and `data-decorator-category: 'block'` attributes.
- Block decorator doesn't wrap text, but is added as component's child.
- Original text is still included in root VNode's `text` field.
- Also stored as `decorators` array at component VNode top level (metadata).
- **Block decorator only applies to component VNodes** (not applied to mark VNodes).

### Block Decorator Position Determination

Block decorator position is determined by `DecoratorData.position` property:

**Position Values**:
- `before`: Added to front of children array (`vnode.children.unshift()`)
- `after` (default): Added to end of children array (`vnode.children.push()`)
- `inside-start`: Added inside first child element's children (if child is element)
- `inside-end`: Added inside last child element's children (if child is element)
- `overlay` / `absolute`: For Layer decorator, added to end of children array

**Position Information Storage**:
- Position information stored in `DecoratorData.position` field (optional)
- VNodeBuilder stores in VNode as `data-decorator-position` attribute when `buildDecoratorVNode`
- Default value used if `position` missing (block: `after`, layer: `overlay`)

**Example**:
```javascript
{
  sid: 'd1',
  stype: 'comment',
  category: 'block',
  target: { sid: 'p1' },
  position: 'before'  // Add to front of children array
}
```

Generated VNode:
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

**Important**: `data-decorator-*` attributes are not included in VNode's `attrs`. These attributes are added directly to DOM elements by Reconciler. In VNode, stored as top-level fields (`decoratorSid`, `decoratorStype`, `decoratorCategory`, `decoratorPosition`, `decoratorModel`).

---

## Example 6: Complex Document Structure

### Input Model
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

**Characteristics**:
- When using `slot('content')`, VNodeBuilder converts each item in `content` array to separate VNode and includes in `children`.
- Each child VNode has `sid`, `stype`, `props`, `model` set at top level.
- Root document VNode also has `sid`, `stype`, `props`, `model`, `decorators` set at top level.
- Child VNodes with `marks` also include `marks` array at top level.
- **VNode does not include DOM markers like `data-bc-sid` in attrs**. These attributes are added directly to DOM elements by Reconciler.

---

## Example 7: Very Complex Mark and Decorator Combination

### Input Model
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

### Generated VNode Structure Summary

When combining complex marks and decorators, VNodeBuilder processes with the following algorithm:

1. **First split text by marks** (`splitTextByMarks`)
2. **Re-split each mark run by decorators** (`splitTextByDecorators`)
3. **Result structure**: `decorator VNode > mark VNode > text`

**Core Principles**:
- **Decorator splits text**: Text is split according to decorator ranges, and each part becomes separate decorator VNode.
- **Marks nested inside decorator**: Marks within decorator range enter decorator VNode's children.
- **Block decorator enters marks**: If block decorator overlaps with mark range, enters mark VNode's children.

### Actual Generated VNode Structure

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

**Characteristics**:
- **Decorator splits text**: Text split according to decorator ranges `[0-25]` and `[26-34]`, each part becomes separate decorator VNode.
- **Marks nested inside decorator**: 
  - `"bold"` mark is within decorator `[0-25]` range, so nested as `<strong>` tag inside decorator VNode's children.
  - `"and italic"` mark is also within decorator `[0-25]` range, so nested as `<em>` tag inside decorator VNode's children.
  - `"code"` mark is within decorator `[26-34]` range, so nested as `<code>` tag inside decorator VNode's children.
- **Text Part Processing**: Text parts without marks or decorators (`"This is "`, `" "`, `"alic text w"`) are included directly as text nodes inside decorator VNode.
- **Nested Structure**: Final structure is `decorator VNode > mark VNode > text` or `decorator VNode > text` form.

### Processing Algorithm Details

VNodeBuilder processes in the following order in `_buildMarkedRunsWithDecorators` method:

1. **Mark Splitting**: Split text by mark ranges with `splitTextByMarks(text, marks)`
   - Example: `[0-8: "This is "], [8-12: "bold"], [12-13: " "], [13-19: "and italic"], ...`

2. **Decorator Splitting**: Re-split each mark run by decorator ranges with `splitTextByDecorators(markRun.text, decorators)`
   - Example: Mark run `[0-8: "This is "]` is within decorator `[0-25]` range, so wrapped in decorator VNode

3. **Nested Structure Creation**:
   - If decorator exists: `decorator VNode > mark VNode > text`
   - If no decorator: `mark VNode > text` or simple `text`

4. **Block Decorator Processing**: Block decorator processed separately and added to `children` array, or enters mark VNode's children if overlaps with mark range.

### Example 7-1: When Marks and Decorators Partially Overlap

Processing example when marks and decorators partially overlap:

**Input**:
- Text: `"Bold text with highlight"`
- Mark: `bold [0, 9]` (entire "Bold text")
- Decorator: `highlight [5, 25]` ("text with highlight")

**Processing Result**:
1. Split by marks: `[0-5: "Bold "]`, `[5-9: "text"]`, `[9-25: " with highlight"]`
2. Apply decorators:
   - `[0-5: "Bold "]`: Mark only → `<strong>` VNode (outside decorator range)
   - `[5-9: "text"]`: Mark + decorator → `<strong>` VNode nested inside decorator VNode
   - `[9-25: " with highlight"]`: Decorator only → text node inside decorator VNode

**Generated Structure**:
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

**Core**:
- Overlapping part of mark and decorator (`[5-9: "text"]`) has mark VNode nested inside decorator VNode.
- Mark-only part (`[0-5: "Bold "]`) creates only mark VNode without decorator.
- Decorator-only part (`[9-25: " with highlight"]`) contains only text node inside decorator VNode.

---

## Full Document VNode Verification (Based on main.ts)

Results of verifying generated VNode referencing actual document structure in `main.ts`.

### Complex Mark Combination Document

**Model Input:**
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

**Generated VNode Structure:**
- `document` VNode has `sid: 'doc-1'`, `stype: 'document'` at top level
- `paragraph` VNode has `sid: 'p-1'`, `stype: 'paragraph'` at top level
- Each `inline-text` VNode:
  - Has `sid`, `stype`, `props`, `model` at top level
  - Has `marks` array at top level if marks exist
  - Text with marks wrapped in nested mark VNodes
  - Composite marks (bold + italic) processed as nested structure (bold → italic order)

**Key Characteristics:**
1. **Nested Mark Processing**: When `bold` and `italic` applied simultaneously, `italic` VNode nested inside `bold` VNode
2. **Color Marks**: `fontColor` and `bgColor` each include color values in `attrs`
3. **Pure Representation**: All `data-bc-*` attributes not included in VNode (added by Reconciler)
4. **Model Information Preservation**: Each VNode preserves both original model information (`model`) and processed props (`props`)

### Verification Results

✅ **Passing Tests:**
- Complex mark combination document VNode creation
- Nested mark processing (bold + italic)
- Color mark processing (fontColor, bgColor)
- Composite marks and decorator combination

⚠️ **Notes:**
- Inline decorator must use each text node's `sid` as target
- Block decorator processed at paragraph level, inserted into paragraph's children

## Portal Processing

Portal is a mechanism for rendering to different DOM targets.

### Portal Usage Scope

**Portal is mainly used in Decorators:**

1. **Model Renderer (`define`)**: ❌ Rarely used
   - Renders actual document content (paragraph, heading, etc.)
   - Generally no need for Portal

2. **Mark Renderer (`defineMark`)**: ❌ Not used
   - Only applies text styles (bold, italic, color, etc.)
   - No need for Portal

3. **Decorator Renderer (`defineDecorator`)**: ✅ Mainly used
   - Additional UI elements (comment tooltips, popups, modals, etc.)
   - Use Portal when need to render outside editor container

### Portal VNode Structure

```typescript
{
  tag: 'portal',
  attrs: {
    target: HTMLElement  // DOM element where portal will be rendered
  },
  portal: {
    target: HTMLElement,  // Portal target
    template: ElementTemplate,  // Template to render inside portal
    portalId?: string  // Portal identifier (optional)
  },
  children: [VNode]  // Portal content VNode
}
```

### Portal Usage Example (In Decorator)

**Using Portal in Decorator:**
```typescript
// Add tooltip Portal to comment Decorator
defineDecorator('comment', (props, ctx) => {
  ctx.initState('showTooltip', false);
  
  return element('div', {
    className: 'comment-indicator',
    onMouseEnter: () => ctx.setState('showTooltip', true),
    onMouseLeave: () => ctx.setState('showTooltip', false)
  }, [
    text('💬'),
    // Use Portal to render tooltip to document.body
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

**Portal Not Used in Model Renderer:**
```typescript
// ❌ Generally not used
define('paragraph', element('p', {}, [
  portal(portalTarget, ...)  // Not needed
]));

// ✅ Normal usage
define('paragraph', element('p', {}, [
  slot('content')  // Normal content
]));
```

**Generated VNode:**
- Identified by `tag: 'portal'`
- `portal.target`: DOM element where portal will be rendered
- `portal.template`: Template inside portal
- `children`: Portal content VNode

### Portal Target Types

1. **HTMLElement**: Pass DOM element directly
2. **Selector String**: `'#portal-target'`, `'body'`, etc.
3. **Function**: `(data) => HTMLElement` for dynamic target determination

### Portal Verification Results

✅ **Passing Tests:**
- HTMLElement target
- Selector string target
- Body target
- Function target
- Custom portalId
- Portal content building (element template, component template)
- Portal error handling (invalid selector, null target)
- Nested portal structures
- Multiple portals in same container

## DSL Function Support

VNodeBuilder supports the following DSL functions:

### when() - Conditional Rendering

```typescript
define('conditional', element('div', {}, [
  when((d: any) => d.show, element('span', {}, [text('Visible')])),
  when((d: any) => !d.show, element('span', {}, [text('Hidden')]))
]));
```

- Can use function or boolean value as condition
- Supports `elseTemplate`
- Supports nested `when()`

### each() - Iterative Rendering

```typescript
define('list', element('ul', {}, [
  each('items', (item: any, index: number) => 
    element('li', {}, [text(item.name)])
  )
]));
```

- Iterates array data to render each item
- Supports `key` function (for efficient reconciliation)
- Supports nested `each()`
- Each item's `sid` is optionally passed, but since it's a general element, `sid` may not be set if `stype` is missing

### Combined Usage

```typescript
// when() + each() combination
define('conditional-list', element('div', {}, [
  when((d: any) => d.showList, element('ul', {}, [
    each('items', (item: any) => element('li', {}, [text(item.name)]))
  ]))
]));

// Using when() inside each()
define('conditional-items', element('ul', {}, [
  each('items', (item: any) => 
    element('li', {}, [
      when((d: any) => d.visible, element('span', {}, [text(item.name)]))
    ])
  )
]));
```

**Verification Completed:**
- ✅ `when()` conditional rendering (function, boolean, elseTemplate, nested)
- ✅ `each()` iterative rendering (empty array, key function, nested, sid handling)
- ✅ `when()` + `each()` combination

### Function Component Definition

```typescript
define('greeting', (props: any, model: any, ctx: any) => {
  const name = props.name || 'Guest';
  return element('div', { className: 'greeting' }, [
    text(`Hello, ${name}!`)
  ]);
});
```

**Function Signature:**
- `(props: ComponentProps, model: ModelData, context: ComponentContext) => ElementTemplate`
- `props`: Pure props data (excluding stype, sid)
- `model`: Original model data (including stype, sid)
- `context`: Component context object
  - `context.model`: Original model data (same as second argument model)
  - `context.state`: Component state
  - `context.props`: props (same as first argument props)
  - `context.initState(initial)`: Initialize state
  - `context.getState(key)`: Query state
  - `context.setState(newState)`: Update state
  - `context.toggleState(key)`: Toggle state

**Usage Example:**
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

// Model access (using second argument model)
define('model-access', (props: any, model: any, ctx: any) => {
  const sid = model.sid || 'none';
  const stype = model.stype || 'none';
  
  return element('div', {}, [
    text(`SID: ${sid}, Type: ${stype}`)
  ]);
});
```

**Important:**
- `props` and `model` are **clearly separated**
- `props`: Pure passed data (excluding stype, sid)
- `model`: Original model data (including stype, sid)
- `context.model` and second argument `model` are the same object

**Verification Completed:**
- ✅ Function component basic functionality (props, context access)
- ✅ `context.model` access
- ✅ `context.state` management (initState, getState, setState)
- ✅ ElementTemplate return
- ✅ `slot()` usage
- ✅ Props and Model separation
- ✅ `data()` binding
- ✅ Nested function components

## Performance Verification

VNodeBuilder performance verified with various scenarios.

### Performance Test Results

#### 1. Large Document Structure (1000 paragraphs)
- **Result**: ✅ Pass
- **Actual Processing Time**: ~42.7ms
- **Average**: ~0.043ms per paragraph
- **Performance**: Excellent (criterion: < 1000ms)

#### 2. Document with Marks (100 paragraphs with marks)
- **Result**: ✅ Pass
- **Actual Processing Time**: ~4.5ms
- **Average**: ~0.045ms per paragraph (including marks)
- **Performance**: Excellent (criterion: < 500ms)

#### 3. Deep Nested Structure (10 levels)
- **Result**: ✅ Pass
- **Actual Processing Time**: ~0.21ms
- **Characteristics**: Recursive structure processing optimized, very fast processing speed

#### 4. Wide Structure (1000 siblings)
- **Result**: ✅ Pass
- **Actual Processing Time**: ~18.2ms
- **Average**: ~0.018ms per sibling
- **Performance**: Excellent (criterion: < 500ms)

#### 5. Complex Mark Processing (100 overlapping marks)
- **Result**: ✅ Pass
- **Actual Processing Time**: ~2.0ms
- **Characteristics**: Mark splitting and nesting processing optimized, very fast processing speed

#### 6. Memory Efficiency (500 paragraphs)
- **Result**: ✅ Pass
- **Characteristics**: VNode structure correctly created and memory usage efficient

### Performance Criteria

- **Large Document (1000+ nodes)**: Process within 1 second
- **Medium Document (100-500 nodes)**: Process within 500ms
- **Small Document (< 100 nodes)**: Process within 100ms
- **Complex Mark Processing**: Process within 200ms

### Performance Optimization Points

1. **Efficient Mark Splitting**: `splitTextByMarks` algorithm optimized
2. **Decorator Indexing**: Decorator ranges pre-calculated
3. **VNode Reuse**: VNode can be reused for same model
4. **Memory Efficiency**: Minimize unnecessary object creation

## Summary

### Text Processing Methods
1. **Simple Text**: Stored directly in `text` field
2. **Text with Marks**: Split into mark tags and text nodes in `children` array
3. **Text with Decorators**: Split into decorator VNodes and text nodes in `children` array
4. **Marks and Decorators Combined**: Text split according to decorator ranges, each part becomes decorator VNode, and mark VNodes nested inside.

### Decorator Representation
- **Inline decorator**: Represented as VNode wrapping text range, includes `data-decorator-sid` and `data-decorator-category` attributes
- **Block decorator**: Separate VNode added as component's child
- **Decorator and Mark Combination**: Marks within decorator range are nested inside decorator VNode's children.
- **Multiple Decorators Overlapping**: Text split according to each decorator range, each becomes separate decorator VNode.

### Component Information
- All component VNodes include `stype`, `props`, `model` fields at top level.
- `props`: Sanitized props (excluding stype, sid) - only pure props
- `model`: Original model data (including stype, sid) - optional, fallback to props
- `decorators`: Array of applied decorator information

### VNode Top-Level Fields
- `sid`: Schema ID - uses value provided from model as-is (not generated)
- `stype`: Schema Type - component name or from model
- `props`: Pure props (excluding stype/sid/type) - only for component-generated VNodes
- `model`: Original model data (including stype/sid) - only for component-generated VNodes (optional, fallback to props)
- `marks`: Text mark information array (only set when model has marks)
- `decorators`: Decorator information array (from build options or component)
- `isExternal`: Whether external component (managesDOM pattern) - only for component-generated VNodes
- These fields only exist for component-generated VNodes (those with tag and stype).

### Mark Syntax
- Marks are defined in format `{ type: 'markName', range: [start, end] }`.
- `range` is in `[start, end]` array format, representing text start and end indices.
- Multiple marks can overlap, and VNodeBuilder converts to appropriate nested structure.
- When marks and decorators combine, marks within decorator range are nested inside decorator VNode.

### Slot Syntax
- Child elements are defined with `slot('content')` in template.
- Child elements are included in `content: []` array in model.
- VNodeBuilder converts each item in `content` array to separate VNode and includes in `children`.
- Each child VNode includes its own `stype`, `props`, `model` information at top level.

### Mark and Decorator Combination Processing Algorithm

VNodeBuilder processing order when combining complex marks and decorators:

1. **Mark Splitting**: Split text by mark ranges with `splitTextByMarks(text, marks)`
2. **Decorator Splitting**: Re-split each mark run by decorator ranges with `splitTextByDecorators()`
3. **Nested Structure Creation**:
   - Marks within decorator range: `decorator VNode > mark VNode`
   - Marks outside decorator range: `mark VNode` (independent)
   - Decorator-only parts: `decorator VNode > text`
4. **Block decorator**: Block decorator added to `children` array, or enters mark VNode's children if overlaps with mark range.

**Core Principles**:
- Decorator is the entity that splits text (splits according to decorator ranges).
- Marks are only nested within decorator ranges.
- When multiple decorators overlap, separate decorator VNode created for each decorator range.

### Decorator VNode Top-Level Fields
- `decoratorSid`: Decorator Schema ID - only exists in decorator VNode
- `decoratorStype`: Decorator Schema Type - only exists in decorator VNode
- `decoratorCategory`: Decorator category (`'layer' | 'inline' | 'block'`) - only exists in decorator VNode
- `decoratorPosition`: Decorator position (`'before' | 'after' | 'inside-start' | 'inside-end' | 'overlay' | 'absolute'`) - only exists in decorator VNode (optional)
- `decoratorModel`: Original DecoratorData - only exists in decorator VNode (optional, full context)
- These fields only exist in decorator-generated VNodes.

### Difference from DOM Markers
- VNode does not include `data-bc-*` attributes.
- VNode does not include `data-decorator-*` attributes either.
- `data-bc-*` and `data-decorator-*` are added directly to DOM elements by Reconciler.
- In VNode, decorator information is stored as top-level fields (`decoratorSid`, `decoratorStype`, `decoratorCategory`, `decoratorPosition`, `decoratorModel`).

