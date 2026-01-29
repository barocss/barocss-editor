---
name: package-schema
description: Schema DSL for document structure and validation (nodes, content expressions, marks). Use when defining or changing document schema, node types, or validation rules.
---

# @barocss/schema

## Scope

- **Schema creation**: `createSchema(name, { topNode, nodes, marks? })`; each node has `name`, `group` (e.g. document, block, inline), `content` (e.g. `block+`, `inline*`).
- **Content expressions**: `block+`, `inline*`, `(paragraph | heading)*`, etc.; used for validation and parsing.
- **Marks**: optional mark definitions for text (bold, italic, link, etc.).
- **Validation**: DataStore and model use schema to validate node types and content on create/update/transform.

## Rules

1. **topNode**: root type (e.g. `document`); must be in `nodes`.
2. **Groups**: group names are used in content expressions (e.g. `block+` refers to all nodes in group `block`).
3. **Content**: define allowed children per node; schema is used by `transformNode` and structure validation.
4. **References**: `packages/schema/`; no runtime dependency on datastore/model (they depend on schema).
5. **Docs**: apps/docs-site and packages reference schema in architecture docs.

## Quick reference

- Package: `packages/schema/`
- Consumed by: `@barocss/datastore`, `@barocss/model`, `@barocss/converter`
- API: `createSchema`, schema object with `nodes`, `marks`, `topNode`
