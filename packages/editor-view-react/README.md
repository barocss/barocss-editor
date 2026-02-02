# @barocss/editor-view-react

React view layer for Barocss Editor. Renders the editor document with **renderer-react** and re-renders on `editor:content.change`. editor-view-dom의 React 대응 패키지.

## EditorView (composite)

```tsx
import { Editor } from '@barocss/editor-core';
import { EditorView } from '@barocss/editor-view-react';

<EditorView
  editor={editor}
  options={{
    className: 'editor-view-root',
    layers: {
      content: { className: 'document editor-content', editable: true },
      decorator: { className: 'barocss-editor-decorators' },
      selection: { className: 'barocss-editor-selection' },
      context: { className: 'barocss-editor-context' },
      custom: { className: 'barocss-editor-custom' },
    },
  }}
>
  {/* optional: custom layer content */}
</EditorView>
```

## Layer components (composable)

Layers can be used separately for custom composition (must be inside `EditorView` or `EditorViewContextProvider` so editor comes from context):

- **EditorView.ContentLayer** — Renders document with ReactRenderer in a contenteditable div. Subscribes to `editor:content.change`. Editor from context only.
- **EditorView.Layer** — Overlay layer wrapper (decorator, selection, context, custom). Positioned absolute, `pointer-events: none` by default.

```tsx
import { EditorView } from '@barocss/editor-view-react';

<div style={{ position: 'relative' }}>
  <EditorView.ContentLayer options={{ className: 'content', editable: true }} />
  <EditorView.Layer layer="decorator" className="my-decorators" />
  <EditorView.Layer layer="selection" />
  <EditorView.Layer layer="custom">
    <MyCustomOverlay />
  </EditorView.Layer>
</div>
```
(When using layers outside `<EditorView>`, wrap with `<EditorViewContextProvider editor={editor}>`.)

## API

- **EditorView** — Composite view. Props: `editor`, `options?` (registry, className, layers), `children?` (custom layer content). Supports `ref` for imperative handle (EditorViewHandle).
- **EditorView.ContentLayer** — Props: `options?` (registry, className, editable). Editor is from EditorViewContext (use inside EditorView).
- **EditorView.Layer** — Props: `layer` ('decorator' | 'selection' | 'context' | 'custom'), `className?`, `style?`, `children?`.

**Ref API (EditorViewHandle)** — When using `ref` on EditorView: `addDecorator(Decorator | DecoratorGenerator)`, `removeDecorator`, `updateDecorator`, `getDecorators(options?)`, `getDecorator`, `exportDecorators`, `loadDecorators`, `contentEditableElement`, `convertModelSelectionToDOM`, `convertDOMSelectionToModel`, `convertStaticRangeToModel`, `defineDecoratorType`, and refs to `decoratorManager`, `remoteDecoratorManager`, `patternDecoratorConfigManager`, `decoratorGeneratorManager`. See editor-view-react-spec.md § 3.3.

## Docs

- **editor-view-react-spec.md** — API, context, layers, selection/input flow, tests.
- **layers-spec.md** — Layer roles (content, decorator, selection, context, custom) and `layerTarget` routing; how to use selection/context/custom layers.

## Requirements

- **Editor** from `@barocss/editor-core` (with `getDocumentProxy()`, `on`/`off` for `editor:content.change`).
- **define()** templates (document, paragraph, inline-text, etc.) in the same registry used by the content layer.

## Testing

Unit tests (Vitest, jsdom, @testing-library/react):

```bash
pnpm --filter @barocss/editor-view-react test:run
```

Tests cover: EditorView and EditorViewLayer (root, content layer, overlay layers, children), EditorViewContext (Provider value, useEditorViewContext throw, useOptionalEditorViewContext), ReactSelectionHandler (isSelectionInsideEditableText, setProgrammaticChange), ReactMutationObserverManager (setup/disconnect, batch), dom-sync (findClosestInlineTextNode, reconstructModelTextFromDOM). See `packages/editor-view-react/docs/editor-view-react-spec.md` and `docs/SPEC_VERIFICATION.md`.

To run the React app that uses EditorView:

```bash
pnpm --filter @barocss/editor-react dev
```

## See also

- **packages/editor-view-react/docs/editor-view-react-spec.md** — Full spec: goals, architecture, API, context, layers, selection/input, DOM sync, MutationObserver, test strategy.
- **packages/editor-view-react/docs/SPEC_VERIFICATION.md** — Spec vs implementation verification and checklist.
- **packages/renderer-react** — DSL → ReactNode.
- **packages/editor-view-dom** — DOM view layer (EditorViewDOM).
- **docs/renderer-react-and-editor-react.md** — Design.
