# Declarative Editor Rendering - DSL

## Scope
This chapter explains the DSL used to define templates that become VNodes for render. It focuses on semantics and patterns, and references the detailed syntax in `renderer-dom-dsl-spec.md`.

## Principles
- Minimal surface: `element`, `text`, `data`, `slot`, `when`, `each`, `component`, `define`
- Predictable normalization of overloads
- Registry-backed resolution of nested templates
- One-to-one mapping: model `type` values map directly to templates; no bespoke render functions per feature

### Components and Reuse
- When `element` alone is insufficient or you need to integrate an external widget, use components.
- Context components: pure functions returning templates; External components: `mount/update/unmount` with optional `managesDOM`.
- See `paper/declarative-editor-rendering-components.md` for detailed patterns and lifecycle.

### Registry
- `define(name, template)` and `defineDecorator(name, template)` register into a global registry.
- `element(name, ...)`, `component(name, ...)`, and `slot(name)` resolve through the registry at build-time, enabling drop-in features without wiring code.
- This makes adding features to an editor a matter of registering templates/decorators, not touching the renderer.

### Semantics
- `data(path|getter, default?)` is late-bound at build time and normalized to text/attrs
- `slot(name)` renders arrays as children; non-arrays become empty
- `when(condition)` yields a stable container keeping children indices stable
- `each(name, render, key?)` iterates array field `name` on current model; optional `key` ensures reuse

## Patterns
- Slots map arrays of model data into component children
- `when` produces a stable container to keep children length consistent
- Keys (`data-bc-sid`) stabilize identity for dynamic lists

### Normalization Examples
```pseudo
element('h1', 'Title') → element('h1', null, [text('Title')])
element('div', child)   → element('div', null, [child])
element('div', attrs, child) → element('div', attrs, [child])

component(MyFn, props, children) → children move to props.content
component('card', { title }, [slot('content')])
```

## Example (Conceptual)
```typescript
define('article', element('div', { className: 'article' }, [
  element('h1', [data('title')]),
  element('section', [slot('blocks')])
]));

const model = {
  type: 'article',
  title: 'Declarative Editor Rendering',
  blocks: [ { type: 'paragraph', text: 'Intro...' }, { type: 'image', src: '/hero.png' } ]
};
```

## Integration
- Build from model → reconcile into DOM
- Keep templates stable; pass changing model data only

References: paper/renderer-dom-dsl-spec.md

## Pseudocode: DSL Normalization Rules
```pseudo
// element overloads
element(tagOrFn, a?, b?) → (attrs, children) where:
  if a is undefined → attrs=null, children=[]
  if a is string|number → attrs=null, children=[text(a)]
  if a is array → attrs=null, children=a
  if a is template node → attrs=null, children=[a]
  else attrs=a, children = b ? (array(b) ? b : [b]) : []

// component discrimination
if tagOrFn is function → inline component (children → props.content)
if tag is registered name → nested template (component template)
if tag is native → element

// slot semantics
if slot(name) and data[name] is array:
  children = data[name].map(item => element(item.type, item))
else children = []
```

## Expressiveness Coverage (What You Can Render)
- Block content: paragraphs, headings, lists (ordered/unordered), quotes, code blocks
- Inline content: strong/emphasis/links/code span/math span/decorated spans
- Embeds/media: images, iframes, videos, custom widgets via external components
- Structured blocks: tables with thead/tbody, rows, cells (colspan/rowspan)
- Annotations: markers rendered later via decorators (not part of DSL output)
- Namespaces: SVG/MathML nodes when needed

## Decorators and Editing (DSL-Level Contract)
- Content templates defined with `define()` describe the editable document structure; they do not include selections, carets, or transient overlays.
- Decorators are defined separately and rendered as independent trees. They are excluded from content reconcile and do not interfere with content node identity.
- Declarative API surface for decorators mirrors the content DSL, but decorators are tagged so the renderer can bypass them during content reconcile.

### How to Define a Decorator
```typescript
// Decorator template (e.g., selection/caret/highlight)
defineDecorator('selection-overlay',
  element('div', { className: 'selection-overlay' }, [
    // purely visual nodes; no content slots
  ])
)

// Mount alongside content by the caller (not inside content templates)
// The rendering engine composes content VNode and decorator VNode trees separately
```

### Boundaries
- Content DSL emits only the document structure; measurements and overlays are applied after reconcile.
- Event/input policy lives above the renderer; decorators must not handle editing commands that mutate the model directly.
- Z-order and hit-testing are decided by the caller (e.g., stacking a separate overlay root), not by the content DSL.

## Mapping Editor Document → DSL Templates
```pseudo
// Model (illustrative)
record Doc { blocks: Block[] }
variant Block = Paragraph | Heading | List | Quote | CodeBlock | Table | Media
record Paragraph { id, children: Inline[] }
record Heading { id, level: 1..6, children: Inline[] }
record List { id, ordered: bool, items: ListItem[] }
record ListItem { id, children: Block[] }
record CodeBlock { id, lang, text }
record Table { id, head: Row[], body: Row[] }
record Row { id, cells: Cell[] }
record Cell { id, colspan?, rowspan?, children: Block[] }
variant Inline = Text | Strong | Emphasis | Link | CodeSpan | MathSpan

// Canonical mapping via type-driven templates (no separate renderBlock)

// Document shell delegates block rendering by type
define('doc', (model: Doc) =>
  element('div', { class: 'doc' }, [
    slot('blocks')
  ])
)

// Block templates (pure template-based definitions)
define('Paragraph',
  element('p', [ slot('children') ])
)

define('Heading', (d) =>
  element('h' + d.level, {}, [ slot('children') ])
)

// Model item → ListItem template produces <li> with its children
define('ListItem',
  element('li', [ slot('children') ])
)

define('List',
  when(d => d.ordered === true,
    element('ol', {}, [ slot('items') ]),
    element('ul', {}, [ slot('items') ])
  )
)

define('Quote',
  element('blockquote', [ slot('children') ])
)

define('CodeBlock',
  element('pre', [ element('code', { 'data-lang': data('lang') }, data('text')) ])
)

// Table family using slots and pure templates
define('TableHeaderCell',
  element('th', [ slot('children') ])
)

define('TableCell',
  element('td', [ slot('children') ])
)

define('TableHeadRow',
  element('tr', [ slot('cells') ])
)

define('TableBodyRow',
  element('tr', [ slot('cells') ])
)

define('Table',
  element('table', [
    when(d => Array.isArray(d.head) && d.head.length > 0,
      element('thead', [ slot('head') ])),
    element('tbody', [ slot('body') ])
  ])
)

function cellAttrs(c): Attrs {
  attrs = {}
  if c.colspan: attrs.colspan = c.colspan
  if c.rowspan: attrs.rowspan = c.rowspan
  return attrs
}

// Inline mapping via type (pure templates)
define('Text',
  text(data('text'))
)

define('Strong',
  element('strong', [ slot('children') ])
)

define('Emphasis',
  element('em', [ slot('children') ])
)

define('Link',
  element('a', { href: data('href'), rel: 'noopener noreferrer' }, [ slot('children') ])
)

define('CodeSpan',
  element('code', data('text'))
)

define('MathSpan',
  component('math-inline', { tex: data('tex') })
)
```

## End-to-End Rendering Pipeline (Normative Flow)
```pseudo
// Input: Doc model
template = define('doc', renderDoc)
vnode = build(template, model)
reconcile(prevVNode, vnode, container, ctx)
// ctx: { excludeDecorators: true, namespace: 'html' }
```

## Constraints & Integration Points
- Selection and decoration are not emitted by DSL; they are layered via decorators
- Measurement is outside the build step; run after reconcile using helpers
- External components represent imperative islands; children DOM under them is not managed by reconcile when managesDOM=true

## Worked Example: Minimal Article
```pseudo
model = {
  blocks: [
    Heading(id:'h1', level:1, children:[Text('Declarative Rendering')]),
    Paragraph(id:'p1', children:[Text('Hello '), Strong([Text('World')]), Text('!')]),
    List(id:'l1', ordered:false, items:[
      { id:'i1', children:[ Paragraph(id:'p2', children:[Text('Item 1')]) ]},
      { id:'i2', children:[ Paragraph(id:'p3', children:[Text('Item 2')]) ]}
    ]),
    CodeBlock(id:'c1', lang:'ts', text:'const x = 1;')
  ]
}

vnode = build(define('doc', renderDoc), model)
// Produces a stable tree with keys on block boundaries; inline spans are unkeyed
```
