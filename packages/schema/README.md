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

## Documentation

- [Package guide](https://editor.barocss.com/packages/schema)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/schema)
- [Detailed architecture reference](https://editor.barocss.com/docs/architecture/schema) (older deep reference; use the package guide for current entry points).

## License

MIT. The published archive includes the license in `dist/LICENSE`.
