# @barocss/converter

HTML, Markdown, and LaTeX conversion helpers plus browser PDF export.

## Purpose

Use format-specific converters and register the rules needed for the target schema.

## Install

```sh
npm install @barocss/converter
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/converter` | Public JavaScript and TypeScript API |

Import only these public paths. Source paths such as `@barocss/converter/src/...` are not part of the published API.

## Usage

```ts
import { MarkdownConverter, registerDefaultMarkdownRules } from '@barocss/converter';

registerDefaultMarkdownRules();
const converter = new MarkdownConverter();
const nodes = converter.parse('# Weekly report\n\nProgress this week.');
console.log(nodes); // Validate these nodes against the receiving document's schema.
```

## Integration notes

Register conversion rules before parsing. Conversion output still needs schema validation before insertion. Browser HTML parsing and PDF output require browser APIs; importing a converter does not establish untrusted-content sanitization policy.

## Documentation

- [Package guide](https://editor.barocss.com/packages/converter)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/converter)
- [Detailed architecture reference](https://editor.barocss.com/docs/architecture/converter) (older deep reference; use the package guide for current entry points).

## License

MIT. The published archive includes the license in `dist/LICENSE`.
