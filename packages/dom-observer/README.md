# @barocss/dom-observer

Browser MutationObserver wrapper that reports editor-related text, structure, and attribute changes.

## Purpose

Use this package when integrating a custom DOM editing surface. The standard editor views already manage their own observation.

## Install

```sh
npm install @barocss/dom-observer
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/dom-observer` | Public JavaScript and TypeScript API |

Import only these public paths. Source paths such as `@barocss/dom-observer/src/...` are not part of the published API.

## Usage

```ts
import { MutationObserverManagerImpl } from '@barocss/dom-observer';

export function observeSurface(element: HTMLElement) {
  const observer = new MutationObserverManagerImpl();
  observer.setEventHandlers({ onTextChange: (change) => console.log(change.newText) });
  observer.setup(element);
  return () => observer.disconnect();
}
```

## Integration notes

Do not install a second observer as a substitute for the view's input pipeline. Register event handlers before setup and disconnect when the observed surface is removed.

## Documentation

- [Package guide](https://editor.barocss.com/packages/dom-observer)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/dom-observer)
- [Detailed architecture reference](https://editor.barocss.com/docs/architecture/dom-observer) (older deep reference; use the package guide for current entry points).

## License

MIT. The published archive includes the license in `dist/LICENSE`.
