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
| `@barocss/schema/registry-contract` | Pure bounded declarative registry JSON and canonical digest input |

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

## Declarative registry contract

The Node-ready `@barocss/schema/registry-contract` entry is separate from the trusted engine registry.
`parseRegistryDefinition(definitionText)` validates bounded `wonffice.note-fields.v1` JSON and returns
an immutable definition and canonical digest input. `parseRegistryJson` rejects duplicate decoded
members, unsafe numbers and malformed Unicode. No submitted validator, transform, renderer,
operation, approval or actor can execute or install an engine schema.

The first registry dialect supports existing Note text, number, boolean and single-choice fields.
Unknown kinds, defaults, null values and other unsupported declarations are explicit refusals.
Definition limits are 64 KiB, depth 32, 128 fields and 16 direct dependencies. Server closure and
response limits are 32 definitions and 256 KiB; native snapshot limits remain unchanged.
The digest algorithm `wonffice.canonical-json.sha256.v1` hashes UTF-8 recursively sorted object
keys while preserving arrays, code points, explicit null and member presence. It does not normalize
Unicode or native data. The registry separately preserves original definitionText and fixed request
bytes. Registration is not document adoption, human criterion confirmation or renderer support.
