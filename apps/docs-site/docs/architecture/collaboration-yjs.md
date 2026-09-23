---
title: '@barocss/collaboration-yjs'
sidebar_label: '@barocss/collaboration-yjs'
---

# @barocss/collaboration-yjs

`YjsAdapter` accepts a Y.Doc and optional Y.Map, awareness instance, adapter
config, and conflict settings. The default map name is `barocss-document`.
The adapter can hydrate known node entries from a local Y.Doc. Use the
[checked package example](/packages/collaboration-yjs#usage) and the
[Collaboration and saving guide](/docs/guides/collaboration-and-saving)
instead of an unverified provider setup snippet.

## Known limits

The current write path stores plain node objects for some operations but calls
`.set()` on the stored value for updates and moves. That can reject a later
edit. Nested Y.Map changes do not generally reach DataStore through the current
observer. Text is not represented with Y.Text. A working Y.Doc connection or
initial hydration therefore does not establish safe live editing, access
control, or durable storage. The [package limitations](/packages/collaboration-yjs#known-limitations-and-troubleshooting)
include reproduction details and cleanup requirements.

Wonffice's external alpha direction is Yorkie Cloud, recorded in
[release tracking](https://github.com/barocss/barocss-editor/issues/322).
This Yjs package is existing library code; it is not a Yorkie adapter or a
verified Wonffice product integration.
