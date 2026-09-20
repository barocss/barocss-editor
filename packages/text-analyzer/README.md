# @barocss/text-analyzer

Text-difference analysis for browser input and composition handling.

## Purpose

Compare text before and after a DOM input update and obtain insert, delete, or replace changes.

## Install

```sh
npm install @barocss/text-analyzer
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/text-analyzer` | Public JavaScript and TypeScript API |

Import only these public paths. Source paths such as `@barocss/text-analyzer/src/...` are not part of the published API.

## Usage

```ts
import { analyzeTextChanges } from '@barocss/text-analyzer';

const changes = analyzeTextChanges({
  oldText: 'Hello', newText: 'Hello world', selectionOffset: 5, selectionLength: 0,
});
for (const change of changes) {
  console.log(change.type, change.start, change.end, change.text);
}
```

## Integration notes

Provide the old selection offset with the text snapshots. The result describes edits; it does not apply a transaction or synchronize browser selection.

## Documentation

- [Package guide](https://editor.barocss.com/packages/text-analyzer)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/text-analyzer)
- [Detailed architecture reference](https://editor.barocss.com/docs/architecture/text-analyzer) (older deep reference; use the package guide for current entry points).

## License

MIT. The published archive includes the license in `dist/LICENSE`.
