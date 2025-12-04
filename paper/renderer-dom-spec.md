## Renderer DOM Specification (Conceptual)

### Purpose and Scope

`@barocss/renderer-dom` transforms model data into a DOM tree via VNodes. It provides:
- A small, composable rendering core (single-path reconcile)
- A template/registry system for reusable views
- Clear boundaries: pure rendering here; editing/input policies live in upper layers (`editor-view-dom`).

This document explains the core concepts and responsibilities. For DSL syntax and examples, see [Renderer DOM DSL Specification](./renderer-dom-dsl-spec.md). For component system details, see [Renderer Component Specification](./renderer-component-spec.md).

### Mental Model

- Model → Template (via DSL) → VNode → DOM
- Templates are defined once and reused; data flows in as plain objects.
- Rendering is incremental: only the minimal necessary DOM changes are applied.
- `when` conditions are evaluated at build-time and expanded into regular VNode children.

### Core Architecture (Updated)

- WIP-based reconcile pipeline
  - Build Work-In-Progress (WIP) tree from `prevVNode`/`nextVNode`
  - Detect changes (tag/text/attrs/style/children/component/portal) and assign render priority
  - Process WIPs by priority; enqueue render results; finalize DOM updates in batch
  - Dedicated processors per type: text/element/component/portal

- Dispatcher for children
  - If any child has `key` → use KeyBasedReconciler (reuse/move via `insertBefore`)
  - Otherwise → index-based reconciliation in `DOMProcessor`
  - Mixed lists: keyed nodes are moved first, unkeyed matched by index afterwards

- Build-time expansion
  - `when` is still evaluated during VNode build; reconcile layer stays runtime-agnostic

- VNode structure (conceptual)
  - tag, attrs, style, text, children
  - Optional component descriptor: `{ name, props }`
  - Optional special markers for rendering policies (e.g., exclude/decorator)

- Keyed updates
  - Keys (VNode `key` property) stabilize identity across renders (sibling scope)
  - With keys, nodes are moved/reused rather than re-created
  - Special attributes like `data-bc-sid` are not used for matching in reconcile

- Text container identification
  - Nodes with a `text` field in the model are automatically marked with `data-text-container="true"` attribute.
  - This attribute enables efficient text container identification for selection handling and editing operations.
  - The identification is schema-independent and based on the actual model data structure.

- Build-time expansion
  - `when` conditions are evaluated during VNode building, not at reconcile time.
  - The chosen branch template is immediately built into VNode children.
  - No runtime conditional logic in the reconcile layer.

- Portal rendering
  - Portals allow rendering content to DOM containers outside the normal component tree.
  - Portal targets can be static HTMLElements or dynamic data templates.
  - Portal content is rendered to independent containers within the target, preserving existing DOM content.
  - Portal templates support all standard template types including conditionals and data binding.
  - Multiple portals can share the same target without interference via stable `portalId`
  - Portal updates use reconcile algorithm to preserve DOM state (focus, scroll position, etc.)
  - When a portal is removed, its container is also removed (no orphan containers)
  - When a portal target changes, content is moved to new target and old target is cleaned

- Decorator inclusion
  - Decorators are fully included in the VNode tree during build phase
  - All decorators (inline, block, layer) are processed during VNode building and become part of normal VNode children
  - Decorator VNodes are identified by `attrs['data-decorator-sid']` but are reconciled like any other VNode
  - No special filtering or exclusion is needed during reconciliation - all children are processed uniformly

- Namespace awareness
  - `svg`/`math` subtrees are created in the correct namespace (`createElementNS`/`setAttributeNS`)
  - Switching happens at subtree roots; SVG inside MathML and MathML inside SVG are supported

- VNodeBuilder architecture
  - Converts templates into VNodes through a structured build process
  - Handles function children and attributes for dynamic content generation
  - Processes mixed content (text and elements) with proper ordering
  - Manages ID uniqueness and component lifecycle
  - Supports mark rendering for text formatting

### Responsibilities and Boundaries

- In scope (renderer-dom)
  - Build and reconcile VNodes to DOM (HTML/SVG/MathML aware)
  - Key-based reuse and minimal DOM mutation
  - Error isolation (best-effort continue on failures)
  - Optional selection preservation (call-site controlled)

- Out of scope (upper layers)
  - Event gating, IME/input policy, selection semantics
  - Editing commands, pointer gestures, hotkeys
  - Document/model transaction system

Upper layers (e.g., `editor-view-dom`) decide policies and when to render.

### Templates and Registry

- **Unified Registration**: All component types are registered using `define(name, template)`
- **Global Registry**: Templates are automatically stored in the global registry
- **Template Resolution**: The registry resolves component names at build time
- **Nested Reuse**: Templates can reference other templates by name

#### Registry API

The registry provides methods for component registration and event handling. For detailed API reference, see [Renderer Component Specification](./renderer-component-spec.md).

### Text Marks Rendering (Inline Styling)

- Scope
  - Marks are text-only, range-based annotations: each mark has `type` and `range: [start, end)`; optional `attrs` may be present on each mark object in the model.
  - The model remains unsplit; rendering performs "virtual splitting" only in the DOM.

- Data path
  - Marks rendering is applied exclusively on the `data('text')` path in templates. Any node template that outputs text via `data('text')` gains mark-aware rendering automatically when `model.marks` exists.

- Virtual splitting
  - Implementation: `splitTextByMarks(text, marks)` computes contiguous runs; each run contains: `text`, `start`, `end`, `types` (active mark types), and `classes` (e.g., `mark-bold`).
  - Each run is rendered as an inline leaf under the current text element.

- Rendering precedence
  1. Custom mark renderer via `defineMark(type, template)` if registered for any `type` in the current run.
     - The first matching type in `run.types` wins. This provides deterministic precedence for overlapping marks.
  2. Default rule when no custom mark renderer matched:
     - If `run.types` contains `code`, render `<code>{run.text}</code>`.
     - Otherwise render `<span class="{run.classes.join(' ')}">{run.text}</span>`.

- defineMark API
  - Signature: `defineMark(type: string, template: ElementTemplate | ComponentTemplate)`.
  - Registration: stored in the renderer registry and looked up at build time per run.
  - Template props provided to mark templates:
    - `text: string` — the run text.
    - `attrs?: Record<string, any>` — the `attrs` of the active mark for this `type` if present in the model; `undefined` otherwise.
    - `run: { start: number; end: number; types?: string[]; classes: string[] }` — run metadata.
    - `model: any` — the original node model being rendered (contains `id`, `type`, `text`, `marks`, etc.).

- Style and attribute binding in templates
  - Attribute values in templates can be:
    - primitive, function `(props) => any`, `attr('path')`, or `data('path')`.
  - Style object values support the same forms per key. Values are resolved at build time before reconcile.

- Examples
  - Bold via native element:
    - `defineMark('bold', element('strong', [data('text')]))`
  - Link with attributes from mark attrs:
    - `defineMark('link', element('a', { href: (p) => p?.attrs?.href, title: (p) => p?.attrs?.title }, [data('text')]))`
  - Highlight with dynamic styles:
    - `defineMark('highlight', element('span', { className: 'highlight', style: { backgroundColor: (p) => p?.attrs?.bg, color: (p) => p?.attrs?.fg } }, [data('text')]))`

- Limitations and guidelines
  - Marks affect only `data('text')` output. For non-text nodes (images, blocks), prefer decorators or node attributes.
  - Overlapping marks with multiple custom templates use the first `type` present in `run.types` per run; refine precedence by controlling type order or introducing a priority system if needed.
  - `attrs` is optional per mark; templates should guard for `undefined`.

### Text Run Index (Selection Support)

- Purpose
  - Maps DOM Text nodes to their absolute offsets within an `inline-text` container for selection handling.
  - Enables efficient DOM Selection ↔ Model selection conversion.

- Data structure
  ```typescript
  interface TextRun {
    domTextNode: Text;
    start: number;
    end: number; // [start, end)
  }
  
  interface TextRunIndex {
    runs: TextRun[];
    total: number;
    byNode?: Map<Text, { start: number; end: number }>; // O(1) reverse lookup
  }
  ```

- Construction rules
  - Traverse descendant Text nodes in DOM pre-order.
  - Assign cumulative ranges; exclude decorator/external component subtrees.
  - Store optional `byNode` map for O(1) reverse lookup.
  - Invalidate and rebuild on reconcile when a container's subtree changes.

- Usage
  - Built automatically during reconcile for each element marked with `data-text-container="true"`.
  - Exposed via reconcile hooks or getter methods.
  - Used by `SelectionHandler` for DOM ↔ Model selection conversion.
  - Text container identification is schema-independent and based on model data structure.

- Performance characteristics
  - O(1) lookup via `byNode` map when available.
  - Fallback to TreeWalker for missing nodes.
  - Lazy rebuilding on container changes.

### VNodeBuilder Architecture

The VNodeBuilder is responsible for converting DSL templates into VNodes through a structured build process.

#### Core Methods

- **`build(nodeType, data)`**: Main entry point for building VNodes from model data
- **`_buildElement(template, data, options?)`**: Builds element VNodes with support for function children and attributes
- **`_processChild(child, data, vnode, ...)`**: Processes individual child elements (functions, templates, primitives)
- **`_buildMarkedRuns(text, marks, data)`**: Handles text mark rendering for formatted text

#### Function Children and Attributes

- **Function Children**: `(d) => ...` functions are executed with data context and can return:
  - Strings/numbers (rendered as text)
  - Template objects (processed recursively)
  - Arrays of templates (each item processed individually)
- **Function Attributes**: `className: (d) => ...` functions are executed to compute dynamic attribute values

#### Mixed Content Handling

- **Ordered Children Array**: All children (elements and text) are stored in a single ordered array
- **Text Flushing**: Text parts are accumulated and flushed as VNodes when element children are encountered
- **Performance Optimization**: Single text VNodes are stored directly in `vnode.text` for efficiency

#### ID Management

- **Unique ID Handling**: `ensureUniqueId()` warns on duplicate IDs but assumes model provides unique IDs
- **Key-based Reconciliation**: Use VNode `key` for identity (not `data-bc-sid`)

#### Component Lifecycle

- **Component Instances**: Manages component instance lifecycle with mount/unmount tracking
- **State Management**: Handles component state updates and re-rendering
- **External Components**: Supports external component integration with custom mount/update/unmount methods

### Portal System

- Purpose
  - Renders content in a different DOM container than the parent component tree.
  - Enables tooltips, modals, overlays, and other UI elements that need to escape their parent's DOM hierarchy.
  - Supports multiple portals sharing the same target without interference.

- Portal Template Structure
  ```typescript
  interface PortalTemplate {
    type: 'portal';
    target: HTMLElement;
    template: RenderTemplate;
    portalId?: string; // Unique portal identifier
  }
  ```

- Portal Container Management
  - Each portal creates an independent container with unique `data-portal` ID
  - Portal containers preserve existing DOM content in the target
  - Multiple portals can coexist in the same target without conflicts
  - Portal containers are identified by `data-portal-container="true"` attribute

- Rendering Process
  - Portal templates are processed during VNode building with dynamic template re-evaluation
  - Portal content is rendered into independent containers within the target
  - Portal content is reconciled using the standard reconcile algorithm
  - Portal visibility and positioning are controlled via CSS styles in the template
  - Portal templates support conditional rendering and data binding within portal content

- Integration with Reconcile
  - Portal containers receive special handling in the reconcile algorithm
  - Portal content updates preserve existing DOM state (focus, scroll position, etc.)
  - Portal containers are managed independently to avoid conflicts with main component tree
  - Portal updates use reconcile to minimize DOM mutations and preserve UI state
  - Portal content templates are re-evaluated with current data on each update

- Component Integration
  - Portal content can contain nested components that are properly recognized and built
  - Component props are correctly passed through `template.attributes` to `template.props`
  - Portal content supports both registered renderers and registered components
  - Component VNodes are properly identified with `component` property for reconciliation

- Performance Optimizations
  - Portal containers are reused based on stable portal IDs
  - Portal updates use reconcile algorithm instead of full re-rendering
  - Existing DOM state is preserved during portal updates
  - Old targets are cleaned when retargeting; removed portals remove their containers

- State Management Integration
  - Portals can access component state through the context system
  - Portal visibility can be controlled via state management (initState, setState, getState)
  - Portal content can be dynamically updated based on state changes
  - Portal templates support conditional rendering with `when` conditions
  - Portal content supports data binding with `data()` templates

- Performance Considerations
  - Portal content is reconciled separately, reducing main tree complexity
  - Portal containers are reused when possible to minimize DOM operations
  - Portal content updates are batched with main component updates
  - Portal templates are re-evaluated efficiently with current data context

- Use Cases
  - Tooltips and popovers that need to escape overflow constraints
  - Modals and dialogs that overlay the entire application
  - Context menus and dropdowns that need precise positioning
  - Notifications and alerts that appear above all other content

- Best Practices
  - Use portals for UI elements that need to escape their parent's DOM hierarchy
  - Control portal visibility through state management rather than DOM manipulation
  - Position portals using CSS styles in the template for consistency
  - Keep portal content simple to maintain performance


### Components

The renderer supports three types of components:

- **Pure Templates**: Simple element templates without state
- **Context Components**: Components with state management via context
- **External Components**: Components that integrate with external libraries

#### Component Lifecycle

- **Mount**: On first render, components are mounted to the DOM
- **Update**: When props or state change, components re-render
- **Unmount**: When removed, components are cleaned up

#### Component Placeholder

- Temporary DOM element created during reconciliation for components
- Contains `data-bc-sid` and `data-bc-stype` attributes for identity tracking
- The component mounts its actual DOM into this placeholder
- Internal DOM structure does not inherit placeholder attributes

#### Component Attribute Management

- `data-bc-sid`: Set from `child.sid` or `child.attributes['data-bc-sid']` (explicit attributes take priority)
- `data-bc-stype`: Set from `child.type` (model's actual type, not hardcoded values)
- Internal component DOM: Does not inherit `data-bc-*` attributes from placeholder

For detailed component definitions, state management, and lifecycle details, see [Renderer Component Specification](./renderer-component-spec.md).

### Scheduling and Batching

- Rendering can be called as often as needed; coalescing is recommended when updates are frequent.
- Use a lightweight scheduler (e.g., microtask or rAF) to batch multiple requests into a single reconcile pass.
- The scheduler policy is caller-controlled.

### Measurement (Read-only)

- When overlays/portals need coordinates, use read-only measurement helpers.
- Keep measurements side-effect free and cache at the caller if needed.

### Performance Characteristics

- Key-based reuse: efficient reorder and partial updates.
- Minimal DOM mutation: apply only what changed (attrs/style/text/children).
- Namespace-aware creation: correctness for HTML/SVG/MathML trees.
- Error isolation: failures in one node do not halt the entire update.
- Portal container reuse: portals with unique IDs reuse existing containers.
- Portal state preservation: portal updates preserve DOM state (focus, scroll, etc.).
- Independent portal management: multiple portals can share targets without interference.
- Duplicate-insert guards: `__barocss_inserted` marker and parent containment checks in finalize step

### Error Handling

- Errors are reported via a handler and logged; reconcile continues where possible.
- Callers can collect errors for diagnostics.

### Integration Pattern

- Define templates (DSL) → build VNodes from model → reconcile into a container.
- Keep templates stable; pass changing model data to minimize template churn.
- Provide keys for lists and stateful sections.

### SSR and Hydration

- Server-side rendering
  - API: `renderToString(model, registry)`
  - The `model.type` is used to look up a template from the registry. The server evaluates `when` conditions at build-time and resolves `data` bindings into primitive values before serializing.
  - Unselected conditional branches emit no HTML (no empty text placeholders). Text and attributes are escaped for `&`, `<`, `>`, and `"`.
  - Context components and external components are not executed on the server. For external components with `managesDOM: false`, a placeholder element is emitted: `<div data-bc-component="name"></div>`.

- Hydration
  - API: `hydrate(model, container, registry)`
  - Uses the same `model.type` to fetch the template, builds the VNode, and performs the initial reconcile into `container`.
  - The server HTML must be structurally compatible with the client template. Because the server already evaluated `when` conditions at build-time, client-side reconcile should attach without DOM mismatches.
  - If the model has no `type` or the registry has no matching template, hydration is a no-op.

- Model-based policy
  - Templates live in the registry and are referenced by `model.type`. Runtime rendering derives strictly from the model input; the low-level reconcile remains model-agnostic.
  - Call sites should register all templates with the global or provided registry prior to SSR/hydration.

### Public Surface (SSR/Hydration)

- `renderToString(model, registry)` → `string`
  - Returns pure HTML; no placeholder text nodes for missing branches.
- `hydrate(model, container, registry)` → `void`
  - Attaches client behavior using reconcile; no separate hydration path is required.

### Public Surface (Pointers)

- DSL/template builders (see DSL spec): define, element, data, slot, when, each, component, text.
- Reconcile/render: one entry-point to update DOM from prev/next VNodes.
- Optional utilities: simple scheduler for batching; read-only measurement.

### Best Practices (Conceptual)

- Separate concerns: rendering vs. editing.
- Prefer keys for dynamic lists and stateful nodes.
- Model-first templates: keep data flow explicit and unidirectional.
- Exclude overlays/decoration from model reconcile to simplify mental model.
- Use `when` for build-time conditional rendering; no runtime conditional logic in reconcile.
- Use unique portal IDs to enable multiple portals sharing the same target.
- Leverage portal container independence to avoid conflicts between different portal instances.
- Preserve existing DOM content when using portals to maintain application state.

### Component System Notes (Updated)
- ComponentManager keeps weak references to component instances (WeakRef when available)
- External components with `managesDOM === true` may return their root; attributes like `data-component-sid/name` are set for bookkeeping
- Unmount path removes component DOM and unregisters the instance

### References

- [Renderer DOM DSL Specification](./renderer-dom-dsl-spec.md) - Syntax and examples
- [Renderer Component Specification](./renderer-component-spec.md) - Component system concepts
- [Portal System Specification](../docs/portal-system-spec.md) - Portal system details
