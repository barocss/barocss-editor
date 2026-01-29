---
name: package-dsl
description: Declarative DSL for templates (element, data, slot, define, defineMark). Use when adding or changing node/mark templates, renderer definitions, or registry lookups.
---

# @barocss/dsl

## Scope

- **Templates**: `element(tag, attributes?, children?)`, `data(key, defaultValue?)`, `slot(name?)`, `when(condition, children)`, `each(key, template)`, `component(name, props?, children?, key?)`.
- **Registry**: `define(name, template)` registers by stype/name; `getGlobalRegistry()`, `registry.get(name)`.
- **Marks**: `defineMark(name, template)`; template is element wrapping content (e.g. `element('strong', {}, [slot('content')])`).
- **Decorators**: `defineDecorator(name, template)` for decorator layer templates.
- **Independence**: DSL defines structure only; no rendering logic (that lives in renderer-dom).

## Rules

1. **Node templates** are keyed by schema type (e.g. `paragraph`, `inline-text`); use `define(stype, template)`.
2. **Data binding**: `data('text', '')` binds to `node.text`; `data('attributes.level', 1)` to nested attrs.
3. **Slots**: `slot('content')` for child nodes; renderer-dom resolves content array to slot.
4. **Native HTML**: constants in `constants/native-html-tags.ts`; use for valid HTML tag names.
5. **References**: `packages/dsl/`; `registry.ts`, `template-builders.ts`, `types.ts`; consumed by `@barocss/renderer-dom`.

## Quick reference

- Package: `packages/dsl/`
- Deps: none (standalone)
- Exports: `define`, `element`, `data`, `slot`, `when`, `each`, `component`, `defineMark`, `defineDecorator`, `getGlobalRegistry`
