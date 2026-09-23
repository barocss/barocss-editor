# @barocss/editor-core

Editor sessions, commands, extensions, selection, keybindings, and history.

## Purpose

Use this package for an editor without a prescribed UI. For Note, Word, Slides, or Site, start with that product's editor factory instead.

## Install

```sh
npm install @barocss/editor-core @barocss/schema @barocss/extensions
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/editor-core` | Public JavaScript and TypeScript API |

Import only these public paths. Source paths such as `@barocss/editor-core/src/...` are not part of the published API.

## Usage

```ts
import { Editor } from '@barocss/editor-core';
import { createSchema, getMinimalSchemaDefinition } from '@barocss/schema';
import { createCoreExtensions } from '@barocss/extensions';

const editor = new Editor({
  schema: createSchema('example', getMinimalSchemaDefinition()),
  extensions: createCoreExtensions(),
});
editor.loadDocument({ stype: 'document', content: [
  { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Hello' }] },
]}, 'example-session');
console.log(editor.getRootId());
// Attach your view here. When the session ends:
editor.destroy();
```

## Integration notes

Create one editor per independent editing session. Load a document after construction, attach a view separately, and call destroy when the session ends.

## Extend an editor

An extension is an object or a class instance with a unique `name`. Install it with the constructor's `extensions` array or `editor.use(extension)`. Use `commands` for declarative command registration. `onCreate` and `onDestroy` can attach and remove host subscriptions. Create a fresh extension instance for each editor when it holds mutable state.

This example adds a command that appends a paragraph. It uses the model transaction API so the edit participates in history. Install `@barocss/model` in addition to the packages above.

```ts
import { Editor, type Extension } from '@barocss/editor-core';
import { createSchema, getMinimalSchemaDefinition } from '@barocss/schema';
import { createCoreExtensions } from '@barocss/extensions';
import { addChild, transaction } from '@barocss/model';

export async function demonstrateCommand() {
  const appendParagraph: Extension = {
    name: 'example.append-paragraph',
    commands: [{
      name: 'example.appendParagraph',
      canExecute: (editor) => !!editor.getRootId(),
      execute: async (editor) => {
        const root = editor.getRootId();
        if (!root) return false;
        const result = await transaction(editor, [addChild(root, {
          stype: 'paragraph',
          content: [{ stype: 'inline-text', text: 'Added through a command.' }],
        })]).commit();
        return result.success;
      },
    }],
  };
  const editor = new Editor({
    schema: createSchema('command-example', getMinimalSchemaDefinition()),
    extensions: [...createCoreExtensions(), appendParagraph],
  });
  try {
    editor.loadDocument({ stype: 'document', content: [
      { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Original.' }] },
    ]}, 'command-example');
    const inserted = await editor.executeCommand('example.appendParagraph');
    const undone = await editor.executeCommand('undo');
    return { inserted, undone };
  } finally {
    editor.destroy();
  }
}
```

This command targets the minimal document schema. It does not mount an editing view or add a toolbar button. Adapt the insertion target and schema checks before using it in a product kit.

## Extension boundaries

- `registerCommand` replaces an existing command with the same name. Use namespaced names for host commands.
- `use` ignores an extension whose name is already installed. `unuse` removes commands declared in its `commands` array; it does not restore a previously overwritten command. Do not treat it as a general hot-swap mechanism.
- `editor.on` returns no unsubscribe function. Pair it with `editor.off(event, callback)` using the same callback.
- Transaction before-hooks run through the model transaction builder. Do not assume a hook intercepts direct store writes or every editor API.
- A schema, command, renderer, and UI control are separate registrations. Installing one does not provide all four.

See [extension boundaries and product customization](https://editor.barocss.com/docs/guides/editor-extensibility) for the supported composition paths.

## Documentation

- [Package guide](https://editor.barocss.com/packages/editor-core)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/editor-core)
- [Detailed architecture reference](https://editor.barocss.com/docs/architecture/editor-core) (older deep reference; use the package guide for current entry points).

## License

MIT. The published archive includes the license in `dist/LICENSE`.
