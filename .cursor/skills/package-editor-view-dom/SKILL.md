---
name: package-editor-view-dom
description: DOM view layer (EditorViewDOM, DOM events, MutationObserver, decorators, keymap, selection sync). Use when changing DOM integration, input handling, decorators, or layered rendering.
---

# @barocss/editor-view-dom

## Scope

- **EditorViewDOM**: attaches to Editor and container or `contentEditableElement`; creates 5 layers (content, decorator, selection, context, custom) when using container.
- **Events**: `beforeinput`, `input`, `keydown`, `selectionchange`, composition; keymap dispatches to editor commands; text changes synced via MutationObserver + SmartTextAnalyzer.
- **Decorators**: layer (CSS only, in diff), inline (DOM widget, excluded from diff), block (DOM widget, excluded); `decoratorManager.add`, `decoratorRegistry.registerRenderer`.
- **Selection**: DOM selection ↔ model selection; sync on change both ways.
- **DSL re-export**: re-exports renderer-dom DSL for decorator renderers.

## Rules

1. **Layer 1 (content)**: contentEditable; rendered by renderer-dom; diff included.
2. **Layer 2 (decorator)**: layer decorators (CSS), inline/block (DOM widgets); inline/block use `data-bc-decorator` and are excluded from content diff.
3. **Format commands** (bold, italic, etc.): `preventDefault` and call `editor.executeCommand`; text input: allow DOM change, then sync via MutationObserver + text analyzer.
4. **Text analysis**: use `@barocss/text-analyzer` (LCP/LCS, selection bias) for precise TextChange from DOM mutations.
5. **References**: `packages/editor-view-dom/`; docs: TEXT_INPUT_ALGORITHM.md, TEXT_INPUT_FLOW.md, EDITING_OPERATIONS.md.

## Quick reference

- Package: `packages/editor-view-dom/`
- Deps: `@barocss/editor-core`, `@barocss/renderer-dom`, `@barocss/text-analyzer`, `@barocss/dom-observer`
- Classes: EditorViewDOM, DecoratorManager, DecoratorRegistry, KeymapManager, MutationObserverManager, SmartTextAnalyzer
