# Wonffice developer documentation

Wonffice is a family of editors built from shared `@barocss/*` libraries. Start at the layer you need: a product kit, shared Office UI, or the editor foundations.

| Goal | Start here |
| --- | --- |
| Embed a note or rich-text field | [Note package guide](/packages/office-note) |
| Build a word processor, presentation editor, or site builder | [Office integration guide](guides/office-products.md) |
| Reuse buttons, panels, contextual controls, and icons | [Shared package boundaries](guides/package-boundaries.md) |
| Build a custom JavaScript editor | [DOM quick start](quick-start.md) |
| Mount an editor in React | [React guide](guides/react-editor.md) |
| Find an import path or stylesheet | [Complete package catalogue](/packages) |

## What is shared

The schema describes valid content. The datastore holds nodes. The model and editor coordinate operations, selection, commands, and history. The DSL and renderers draw content. Product packages choose the vocabulary and behavior for Note, Word, Slides, and Site.

Shared Office packages own text behavior, canvas geometry, controls, icons, and UI. A product should not depend on another product merely to reuse a button or a table operation.

## Libraries and the service are different

The published packages let you assemble an editor. They do not automatically provision accounts, tenant isolation, cloud storage, authorization, hosted collaboration, or public share URLs. The local workspace is a browser-local catalogue. Your host supplies service behavior.

## How to read these docs

The package catalogue is generated from package manifests and their English README files. Its import paths and examples are checked in CI. The current DOM/React onboarding guides are checked against built package declarations.

Older concept, API, and architecture pages remain available at their existing URLs. They are labeled as deep references that predate the current package split; use the package guides for current installation and entry points. A type-checked example is not a claim that every product interaction or hosted provider has been tested.
