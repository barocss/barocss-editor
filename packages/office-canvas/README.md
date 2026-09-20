# @barocss/office-canvas

Shared shape geometry, movement, resizing, snapping, connectors, layout, components, and variables.

## Purpose

Use this layer for model-space canvas behavior shared by Slides and other products.

## Install

```sh
npm install @barocss/office-canvas
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/office-canvas` | Public JavaScript and TypeScript API |

Import only these public paths. Source paths such as `@barocss/office-canvas/src/...` are not part of the published API.

## Usage

```ts
import { moveBox, resizeBox } from '@barocss/office-canvas';

const original = { x: 0, y: 0, width: 1440, height: 720 };
const moved = moveBox(original, { dx: 120, dy: 60 });
const resized = resizeBox(moved, 'se', { dx: 240, dy: 120 }, { keepAspect: true });
console.log(resized); // Commit through the product's command/transaction layer.
```

## Integration notes

Geometry functions calculate model values; the host commits those values through commands. Convert viewport pixels to model units before calling manipulation helpers. The library does not mount a canvas or manage pointer capture.

## Documentation

- [Package guide](https://editor.barocss.com/packages/office-canvas)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/office-canvas)

## License

MIT. The published archive includes the license in `dist/LICENSE`.
