# @barocss/shared

Shared selection, units, keyboard, document-file, local-storage, and lifecycle utilities.

## Purpose

Use the focused helper needed by your integration rather than duplicating editor conventions.

## Install

```sh
npm install @barocss/shared
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/shared` | Public JavaScript and TypeScript API |

Import only these public paths. Source paths such as `@barocss/shared/src/...` are not part of the published API.

## Usage

```ts
import { pxToTwip, twipToPx, formatCounter } from '@barocss/shared';

const modelWidth = pxToTwip(96);
console.log(twipToPx(modelWidth)); // 96
console.log(formatCounter(3, 'decimal'));
```

## Integration notes

Some helpers are pure and others require browser storage or DOM APIs. Document-library helpers provide local storage, not cloud synchronization. Keep runtime node identities separate from durable file identities.

## Documentation

- [Package guide](https://editor.barocss.com/packages/shared)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/shared)
- [Detailed architecture reference](https://editor.barocss.com/docs/architecture/shared) (older deep reference; use the package guide for current entry points).

## License

MIT. The published archive includes the license in `dist/LICENSE`.
