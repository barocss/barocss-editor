# @barocss/conformance

Checks that product schemas, renderers, commands, properties, and icons agree.

## Purpose

Use this development tool to detect a feature that is declared but not drawn, reachable, or editable.

## Install

```sh
npm install @barocss/conformance @barocss/schema @barocss/dsl
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/conformance` | Public JavaScript and TypeScript API |

Import only these public paths. Source paths such as `@barocss/conformance/src/...` are not part of the published API.

## Usage

```ts
import { conformance, describeReport } from '@barocss/conformance';
import { createSchema, getMinimalSchemaDefinition } from '@barocss/schema';
import { RendererRegistry } from '@barocss/dsl';

const registry = new RendererRegistry({ global: false });
const report = conformance({
  schema: createSchema('conformance-example', getMinimalSchemaDefinition()),
  hasRenderer: (type) => registry.get(type) !== undefined,
  only: ['every-node-is-drawn'],
});
console.log(describeReport(report)); // An empty registry intentionally reports missing renderers.
```

## Integration notes

A report only covers the facts supplied by the host. Start with an explicit subset when wiring a new product, then adopt broader checks. assertConforms also rejects stale exemptions and checks that examine nothing; it is not a replacement for interaction tests.

## Documentation

- [Package guide](https://editor.barocss.com/packages/conformance)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/conformance)

## License

MIT. The published archive includes the license in `dist/LICENSE`.
