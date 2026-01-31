# Barocss Architecture Documentation

A collection of documents for understanding Barocss architecture.

## 📚 Core Documents

### Getting Started
1. **[architecture-summary.md](./architecture-summary.md)** - Quick reference summary
2. **[architecture-design-principles.md](./architecture-design-principles.md)** - Core design principles ⭐
3. **[architecture-practical-examples.md](./architecture-practical-examples.md)** - Practical examples

### Detailed Explanations
4. **[architecture-reconcile-algorithm.md](./architecture-reconcile-algorithm.md)** - Reconcile algorithm details ⭐
5. **[architecture-reconcile-overview.md](./architecture-reconcile-overview.md)** - Overall architecture overview
6. **[architecture-flow-diagram.md](./architecture-flow-diagram.md)** - Flow diagram
7. **[architecture-mathematical-model.md](./architecture-mathematical-model.md)** - Mathematical model

## 🎯 Quick Start

Barocss operates with the following structure:

```
DSL → VNode → Reconcile → DOM
```

### Core Concepts
- **DSL**: Functional template definition (`element`, `data`, `when`, `component`)
- **VNodeBuilder**: Template → VNode conversion (pure function)
- **DOMReconcile**: VNode diff → DOM changes (minimal DOM manipulation)
- **VNode is not dynamically determined in reconcile** ⭐ (core design principle)

### Example
```typescript
import { define, element, data } from '@barocss/dsl';
import { DOMRenderer } from '@barocss/renderer-dom';

// Define template
define('paragraph', element('p', {}, [data('text')]));

// Render
const renderer = new DOMRenderer();
const model = { stype: 'paragraph', text: 'Hello' };
renderer.render(container, model);
```

## 📖 Document Guide

### For Newcomers
1. Understand overall concepts with `architecture-summary.md`
2. Learn practical usage with `architecture-practical-examples.md`
3. Understand core principles with `architecture-design-principles.md`

### For Deep Understanding
1. `architecture-reconcile-overview.md` - Overall structure
2. `architecture-flow-diagram.md` - Data flow
3. `architecture-mathematical-model.md` - Mathematical model

### Specific Topics
- **Design Principles**: `architecture-design-principles.md`
- **Practical Examples**: `architecture-practical-examples.md`
- **Reconcile Behavior**: `architecture-reconcile-overview.md`
- **Functional Expression**: `architecture-mathematical-model.md`

## 🔗 Related Documents

### specs/ Folder
- **`specs/README.md`** - How specs are organized (editor-wide vs package-level), when to update, how agents use them
- **`specs/editor.md`** - Editor-wide spec: document model, selection semantics, operation semantics
- Package specs: **`packages/<name>/SPEC.md`** (e.g. `packages/model/SPEC.md`) - per-package contract and invariants

### dom/ Folder
- `portal-system-spec.md` - Portal system specification
- `portal-use-cases.md` - Portal use cases
- `decorator-implementation-guide.md` - Decorator implementation guide

### Docs-site integration (agent flow)
- **`docs-site-integration.md`** - How apps/docs-site fits into the full loop: spec → implementation → documentation → test → verify. When to update docs-site, where to add api/architecture/guides/examples, build/verify.

### Others
- `api-reference.md` - API reference

## 🎓 Learning Path

### Beginner
1. `architecture-summary.md` - Basic concepts
2. `architecture-practical-examples.md` - Simple examples

### Intermediate
3. `architecture-design-principles.md` - Core principles
4. `architecture-reconcile-overview.md` - Overall flow

### Advanced
5. `architecture-flow-diagram.md` - Detailed data flow
6. `architecture-mathematical-model.md` - Mathematical basis

## 💡 Core Content Summary

### Design Principles
- **VNode is not dynamically determined in reconcile**
- Complete separation of Build Phase and Reconcile Phase
- Pure functions first (VNodeBuilder)
- Clear responsibility

### Data Flow
```
DSL (element, data, when) 
  → VNodeBuilder (pure function)
  → VNode Tree (completed)
  → DOMReconcile (diff calculation)
  → DOM (minimal changes)
```

### Layer Structure
```
1. DSL Layer (packages/dsl)
   - Template builder (pure function)
   
2. VNode Layer (packages/renderer-dom)
   - Template → VNode conversion
   
3. Renderer Layer (packages/renderer-dom)
   - VNode → DOM update
```

## 🔍 Troubleshooting

### VNode Related
- Refer to "VNode vs Reconcile Separation Principle" in `architecture-design-principles.md`
- VNode is only created in Build Phase

### Reconcile Related
- Refer to "Children Reconcile" section in `architecture-reconcile-overview.md`
- Refer to "Mathematical Expression" in `architecture-design-principles.md`

### Practical Usage
- Refer to examples in `architecture-practical-examples.md`

## 📝 Document Update History

- 2024: Core architecture documents created
- 2024: DSL package added, design principles documented
- 2024: Duplicate documents cleaned up, structure improved

