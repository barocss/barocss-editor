---
title: Integrate shared Office UI
---

The shared Office UI has three layers. Choose the layer by its responsibility, not by the product in which a control first appeared.

| Layer | Input | Output |
| --- | --- | --- |
| [office-ui](/packages/office-ui) | Values, callbacks, DOM rectangles | React controls, layout and floating surfaces |
| [office-controls](/packages/office-controls) | Command/property declarations and selection summaries | Identities, state readers, groups and keyboard labels |
| [office-editor-ui](/packages/office-editor-ui) | An Editor, declarations and a host scope | Subscriptions, command bindings and selection-aware UI |

Product packages retain their commands, document structure, geometry and supported control lists. The host owns persistence, services, application navigation and lifecycle.

## Start with working examples

- [Basic values and callbacks](/packages/office-ui#usage): a controlled title field and action.
- [Multiline commit](/packages/office-ui#complete-multiline-commit-example): accepted state, validation failure and retryable draft.
- [Control identity](/packages/office-controls#complete-identity-example): distinct actions for a shared command.
- [Formatting controls](/packages/office-editor-ui#usage): bind a toolbar to an existing Editor.
- [Custom selection state](/packages/office-editor-ui#complete-custom-state-toolbar): render declared state readers explicitly.

These examples live in the package READMEs. The package pages are generated from those files. Install each package imported by your host and follow the [Office styling recipe](office-styling.md): tokens alone do not generate the Tailwind utility styles.

## Connect commands deliberately

A declaration is not a command registration. The product must install the command, accept its payload and define its undo behavior. The adapter can then query whether it is enabled and execute it.

The default control adapter reads `control.mark` for a pressed state. A declaration's `state` function needs an explicit adapter `state` option. A label that says “Bold” does not automatically select either path.

Keep asynchronous failure handling explicit. A toolbar row's `run()` returns no completion promise. For settings drafts and property command queues, use the [editor binding contracts](/packages/office-editor-ui#settings-and-property-edits). For remote storage, the host must report actual completion and failure.

## Connect selection without sharing product geometry

Use [editor selection hooks](/packages/office-editor-ui#selection-tools-and-focus) to connect current document ownership and DOM anchors. Use [UI primitives](/packages/office-ui#color-and-selection-ui) to draw handles and readouts. The product still decides what a drag means and commits its document changes.

Keep context tools inside the correct editor scope. Inner math input, toolbar text fields and document text have different input owners. An active inner editor should not also trigger the outer document's commands. Restoring a selection does not establish that an old node is still attached to the current document.

## Keep visual behavior consistent

Use the shared field commit conventions, component states and popup motion. Avoid adding a competing animation to a positioned surface. Respect the component's reduced-motion behavior. Colors, tokens and handle appearance can be shared while product controls remain different.

The [implementation audit](https://github.com/barocss/barocss-editor/blob/main/docs/specs/shared-ui-documentation-audit.md) records the reviewed source, checks and limits. This guide documents current repository contracts; it is not a claim that all product screens are complete or that every change is already in your installed npm version.
