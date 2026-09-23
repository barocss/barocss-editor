---
title: '@barocss/collaboration'
sidebar_label: '@barocss/collaboration'
---

# @barocss/collaboration

This package exports adapter interfaces, `BaseAdapter`, presence state, and a
conflict resolver. It is a library building block. It does not provide a hosted
collaboration service, remote storage, or a product-wide undo policy.

## Adapter contract

`CollaborationAdapter` connects to a `DataStore`, disconnects, reports connection
state, sends and receives atomic operations, and gets or sets a document root.
`BaseAdapter` implements that public lifecycle and delegates provider work to
protected hooks. Its constructor takes `AdapterConfig`; `connect(dataStore)`
attaches the store. See the [package guide](/packages/collaboration#usage) for a
checked public-import example and [Collaboration and saving](/docs/guides/collaboration-and-saving)
for host responsibilities.

`AdapterConfig` accepts a client ID, user metadata, a debug flag, and an optional
operation transformer. Presence state is in memory until a host supplies transport
and user identity. The conflict resolver compares atomic operations; it does not
make arbitrary product edits converge.

## Lifecycle limits

The base adapter registers a local operation listener before its provider
connection finishes. A failed connection can leave that listener registered.
Automatic send failures are logged, not returned to the original edit. A host
must verify the adapter's full edit path and storage acknowledgement before
showing a remote save as complete. See the [adapter lifecycle notes](/packages/collaboration#adapter-lifecycle-and-error-boundaries).

The separate [Yjs](/docs/architecture/collaboration-yjs) and
[room adapter](/docs/architecture/collaboration-liveblocks) references describe
existing packages. Neither proves that Wonffice product collaboration is ready.
