# Basic usage

Start with a working integration before adding commands or layout.

1. Choose a product kit or the lower-level editor foundation. See [installation](installation.md).
2. Define a schema and templates that cover the same node and mark vocabulary.
3. Create an editor, load a document, and mount the selected view.
4. Keep the session stable across UI renders. Route user actions through commands or transactions.
5. Save with the host's storage service. Dispose the view and session when leaving the document.

Use the complete [DOM example](quick-start.md), [React example](guides/react-editor.md), or [Note component](/packages/office-note). Word, Slides, and Site require additional layout/UI assembly; see [Office integration](guides/office-products.md).
