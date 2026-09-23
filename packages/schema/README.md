# @barocss/schema

Document schemas, content expressions, validation, and shared Office node definitions.

## Purpose

Use this package to describe which nodes, attributes, marks, and children a document accepts. Product packages provide their own schema presets.

## Install

```sh
npm install @barocss/schema
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/schema` | Public JavaScript and TypeScript API |

Import only these public paths. Source paths such as `@barocss/schema/src/...` are not part of the published API.

## Usage

```ts
import { createSchema, getMinimalSchemaDefinition } from '@barocss/schema';

const schema = createSchema('my-document', getMinimalSchemaDefinition());
console.log(schema.definition.topNode); // document
console.log(schema.definition.nodes.paragraph.content); // inline*
```

## Integration notes

Schema definitions describe a document contract. They do not render a document or install editing commands.

## Choose the validation level

| API | Result | Scope |
| --- | --- | --- |
| `schema.validateAttributes(type, attributes)` | `{ valid, errors }` | Attributes for one node type |
| `validateEditingContent(schema, type, children)` | `{ valid, errors }` | Immediate child sequence for a container; not a recursive mark check |
| `validateEditingFragment(schema, nodes, openStart, openEnd)` | `{ valid, errors }` | Nested editing nodes, attributes, marks, ranges, and explicit open boundaries |
| `validateTree(schema, root)` | `TreeFinding[]` | Recursive tree structure and attribute findings with paths; not full editing-fragment mark validation |

These functions do not mutate the input or render a document. A successful fragment check does not prove that the fragment fits a particular destination. The model planner checks that separately. A fragment also need not be a complete document root.

## Validate a custom structure

This example requires a caption followed by one or more body blocks. The type names are custom; groups and content expressions define their roles.

```ts
import { createSchema, validateEditingFragment, type EditingNode } from '@barocss/schema';

export function validateArticleExamples() {
  const schema = createSchema('article', {
    topNode: 'article',
    nodes: {
      article: { name: 'article', content: 'caption body+' },
      caption: { name: 'caption', group: 'block', content: 'inline*' },
      body: { name: 'body', group: 'block', content: 'inline*', marks: ['strong'] },
      glyph: { name: 'glyph', group: 'inline' },
    },
    marks: { strong: { name: 'strong' } },
  });
  const body: EditingNode = {
    stype: 'body', content: [{ stype: 'glyph', text: 'Text' }],
  };
  const complete: EditingNode = {
    stype: 'article', content: [{ stype: 'caption', content: [] }, body],
  };
  const missingCaption: EditingNode = { stype: 'article', content: [body] };
  const invalidMark: EditingNode = {
    stype: 'body', content: [{
      stype: 'glyph', text: 'Text',
      marks: [{ stype: 'strong', range: [0, 5] }],
    }],
  };
  return {
    complete: validateEditingFragment(schema, [complete]).valid, // true
    missingCaption: validateEditingFragment(schema, [missingCaption]).valid, // false
    invalidMark: validateEditingFragment(schema, [invalidMark]).valid, // false
    openFragment: validateEditingFragment(schema, [missingCaption], 2, 2).valid, // true
  };
}
```

The final check describes a cut fragment with open article/body boundaries. It does not make a stored article without a caption valid. Open depths count containers at each edge, not text characters or text leaves. Keep the complete document check separate from fragment validation.

## Definitions and limits

Content expressions support sequence, alternatives, optional/repeated groups, and counted repetition. For example, `caption body+` imposes order; `(paragraph|heading)+` allows either declared type. A group reference does not create node definitions.

Editing marks use `stype`, optional `attrs`, and optional `[from, to]` ranges. Model nodes use `attributes`. The editing validator checks known marks, required mark attributes, allowed marks on the node and parent, range bounds, and overlapping excluded marks.

Validation does not sanitize HTML, authorize a user, migrate saved data, create renderer templates, or guarantee that every legacy editing path uses the same checks. Use the [schema and model concept guide](https://editor.barocss.com/docs/concepts/schema-and-model) and [fragment editing guide](https://editor.barocss.com/docs/guides/schema-editing) for the separate contracts.

## Documentation

- [Package guide](https://editor.barocss.com/packages/schema)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/schema)
- [Detailed architecture reference](https://editor.barocss.com/docs/architecture/schema) (older deep reference; use the package guide for current entry points).

## License

MIT. The published archive includes the license in `dist/LICENSE`.
