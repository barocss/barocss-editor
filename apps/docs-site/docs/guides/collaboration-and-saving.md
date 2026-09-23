---
title: Collaboration and saving
sidebar_label: Collaboration and saving
---

# Collaboration and saving

The collaboration packages provide adapter and presence building blocks. They do
not provide a complete hosted collaboration service or prove that a document was
saved. Before connecting a product editor, choose the behavior you need and check
its support below.

## Start with the right boundary

| Need | Current package behavior | What the host must supply |
| --- | --- | --- |
| Show participants | In-memory presence state and remote-change callbacks | Transport, refresh, user identity, cursor rendering, departure handling |
| Observe local changes | Base adapter listens to DataStore operations | Compatible transport and explicit failure/retry handling |
| Load Yjs node entries | Existing map entries can hydrate a DataStore | Provider synchronization, correct root, access control, production edit-path validation |
| Connect a room bridge | Liveblocks adapter consumes its own room-shaped contract | A verified bridge; an arbitrary SDK Room is not sufficient |
| Save and reopen | No durable storage guarantee in these APIs | Storage implementation, acknowledgement, revision policy, load verification |
| Collaborative undo | Not established by local editor history | A tested provider/product policy |

The examples use public imports and local fixtures. They are not a ready-to-deploy
server setup. No provider account, tenant isolation, network recovery, or SaaS/
on-premises deployment is certified by these examples.

## Try the checked examples

1. Run the [presence example](/packages/collaboration#usage). It initializes a local
   user and receives/removes one in-memory peer.
2. Run the [Yjs snapshot example](/packages/collaboration-yjs#usage). It hydrates
   known node entries from a real local Y.Doc. Read its edit-path limitations
   before enabling collaboration in a UI.
3. Run the [room bridge fixture](/packages/collaboration-liveblocks#required-room-bridge)
   to check the shape expected by the room adapter. The fixture is not an SDK Room.

The README examples are the canonical source. Each page lists installation,
public entry points, cleanup, and known limitations.

## Connect an editor session deliberately

A DataStore can exist without a rendered editor. Hydrating the store does not
mount a view, render remote cursors, select a root for every product, or establish
permission to edit. A host must coordinate the document ID, root ID, schema,
editor lifecycle, provider state, and view attachment.

A practical integration sequence is:

1. Authorize the user and select the intended document/provider outside the adapter.
2. Establish which side owns the initial state. Do not seed an empty room from
   several clients independently.
3. Wait for the provider's actual initial synchronization, where applicable.
4. Connect one adapter to the intended store and validate the product document.
5. Enable editing only after the chosen adapter's full edit path is verified.
6. Observe local failures separately from server acknowledgements.
7. Before leaving, follow the host's save/flush policy, disconnect the adapter,
   then release the provider, awareness, and document resources.

The packages do not enforce this entire sequence. The current Yjs adapter has
known live-editing defects; the current room adapter requires a compatible bridge.
Do not describe either as an enabled Wonffice cloud feature solely because the
package is installed.

## Understand the current limits

### Yjs

The adapter writes plain node objects for create/snapshot operations, but calls
`.set()` on the stored node value for update/move. A plain-object node can
therefore fail to update. Its deep observer also processes only top-level map
events, so nested Y.Map edits are not a general workaround. Text fields are not
backed by Y.Text. See [Yjs limitations](/packages/collaboration-yjs#known-limitations-and-troubleshooting).

### Room bridge

The adapter appends operations through `room.update`, and expects an `operations`
subscription. Its `setDocumentState` snapshot is separate from the operation log
loaded on connection, and its snapshot serializer does not preserve marks. See
[room bridge limitations](/packages/collaboration-liveblocks#known-limitations-and-troubleshooting).

### Shared lifecycle

The base adapter logs automatic send errors. They are not returned as a failed
local edit. Failed connection setup can leave a registered listener while the
adapter still reports disconnected. Do not repeatedly retry on a live document
or claim that disconnect always cleans up failed setup. See
[adapter lifecycle](/packages/collaboration#adapter-lifecycle-and-error-boundaries).

## Tell users what “saved” means

Keep these states separate in the host's user guidance:

- **Changed locally:** the editor accepted the change in memory.
- **Stored locally:** a local persistence implementation completed its write.
- **Sent:** a transport accepted the operation; this alone does not prove storage.
- **Stored remotely:** the storage service acknowledged the intended document and revision.
- **Restored:** reopening loaded the expected content and version successfully.

`isConnected()` and presence cannot establish the last two states. A snapshot
method without a documented server acknowledgement is not a save receipt.
Do not promise device-to-device recovery or offline safety based only on a local
browser test.

For a production failure, keep the local draft where the host supports it, show
which state is known, and provide a recovery/export path that has been tested for
that product. Do not tell users to clear browser data or overwrite the remote
copy as a generic fix.

## Troubleshooting

| Problem | First checks |
| --- | --- |
| Participants appear but edits do not | Presence and document paths are separate. Inspect adapter send errors and peer content. |
| Yjs update fails with a `.set` error | Check the documented plain-object/nested-map limitation; keep local work and report the reproduction. |
| Room connection rejects methods or subscriptions | Compare the supplied bridge with the required interface. Do not infer SDK compatibility from `any`. |
| Reopening loses changes | Establish whether persistence exists and whether it acknowledged the correct revision. |
| A removed participant remains visible | Check departure messages and the awareness expiry window. |
| Reconnecting creates duplicate listeners | Inspect failed setup cleanup before creating another live adapter. |

Do not include access tokens, cookies, or private document content in diagnostics.
Useful evidence includes package versions, the operation kind, document/schema
identity without sensitive content, connection sequence, and observed acknowledgement.

## Support and next steps

These are developer integration contracts. A named Wonffice service release
candidate must separately verify authentication, permissions, durable storage,
conflicts, backup/restore, and deployment behavior. Existing server work is tracked
in [#330](https://github.com/barocss/barocss-editor/issues/330); technical alpha
acceptance remains [#322](https://github.com/barocss/barocss-editor/issues/322).
Server execution foundation PR #333 is merged, but authentication, database
storage, backup/restore, and product provider integration are not established by
that change. The external alpha direction is Yorkie Cloud. Its integration with
Note, Word, Slides, and Site is not yet verified. Local Yorkie deployment is
undecided. Existing Yjs and Liveblocks packages are library adapters, not
confirmed alternatives for that product release.

Do not overwrite collaborative provider state with an ordinary document snapshot.
Switching providers requires a verified export/migration process; it is not just
a configuration change. See the
[release acceptance issue](https://github.com/barocss/barocss-editor/issues/322)
for the current product decision. Plans are separate from the verified package
behavior on this page.

Technical Writer maintains these instructions and known limits. Implementation
owners resolve adapter defects and supply integration evidence. Product Master PM
sets release scope and routes any missing ownership. External publishing and
customer notices follow the approved process.
