---
title: '@barocss/collaboration-liveblocks'
sidebar_label: '@barocss/collaboration-liveblocks'
---

# @barocss/collaboration-liveblocks

`LiveblocksAdapter` accepts a room-shaped bridge, adapter config, and optional
conflict settings. Its operation path calls `room.update` and subscribes to
`operations`. Passing an arbitrary Liveblocks SDK Room has not been verified as
compatible. Use the [checked bridge fixture](/packages/collaboration-liveblocks#required-room-bridge)
and [Collaboration and saving](/docs/guides/collaboration-and-saving)
to inspect the current contract.

## Known limits

The snapshot written by `setDocumentState` is separate from the operation log
loaded on connection. The snapshot serializer does not preserve marks.
Connection, presence, or a successful local update does not prove that the
intended document was stored and can be reopened. The
[package limitations](/packages/collaboration-liveblocks#known-limitations-and-troubleshooting)
cover cleanup and recovery boundaries.

This package is not a confirmed product provider for Wonffice's external alpha.
[Release tracking](https://github.com/barocss/barocss-editor/issues/322)
records the Yorkie Cloud direction and the still-unverified integration.
