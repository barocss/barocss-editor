# Collaboration documentation audit

## Scope and version

- Issue: [#348](https://github.com/barocss/barocss-editor/issues/348).
- Source baseline: `0d97e1f00948aafd27bd6bdf4ac2b9a2f9f51e60`.
- Packages: `@barocss/collaboration`, `@barocss/collaboration-yjs`, and `@barocss/collaboration-liveblocks`, each `0.1.3` in this checkout.
- Actual Yjs dependency in the packed consumer: `13.6.32`.
- Documentation: the three package READMEs, one integration guide, and notices linking older references to the checked support boundary.
- No runtime feature change, provider selection, new server implementation, merge, deployment, or mobile test.

## Support status

| Scope | Status | Evidence or remaining limit | Next owner |
| --- | --- | --- | --- |
| Local presence example | Ready | Set local user/cursor, apply/remove a peer, notifications, cleanup | Technical Writer |
| Yjs initial snapshot hydration | Ready for the stated local example | Real Y.Doc with known IDs; connection loads fields and returns the local root | Technical Writer |
| Yjs sustained editing | Incomplete | Real update rejection and ignored nested-map event reproduced below | Implementation owner; PM routes priority |
| Room bridge fixture | Ready for the stated fixture | Explicit send/receive, no echo, unsubscribe | Technical Writer |
| Actual Liveblocks SDK/hosted room | Unverified | Fixture is a compatible local object, not an SDK Room | Implementation owner |
| Provider auth, permissions, reconnect, durable storage, backup/restore | Unverified by these package checks | No external credentials or service used | Backend Master / QA / Operator |
| External documentation publication | Incomplete | Requires approved merge and deployment verification | Approved publishing owner |
| Whole-product release readiness | Unverified by this task | Documentation work does not replace #322 | Product Master PM |

## Source evidence

- `packages/collaboration/src/base-adapter.ts`: operation subscription, connection flag, send errors, remote application, cleanup.
- `packages/collaboration/src/awareness-manager.ts`: local/remote state, callbacks, 30-second stale threshold and 10-second cleanup interval.
- `packages/collaboration/src/conflict-resolver.ts`: timestamp policies and shallow field merge.
- `packages/collaboration-yjs/src/yjs-adapter.ts`: plain-object snapshot writes, map update path, top-level event filter, initial hydration, awareness bridge.
- `packages/collaboration-liveblocks/src/liveblocks-adapter.ts`: room bridge methods, operation-log loading, separate snapshot writing, serializer and presence limits.
- Existing tests: `packages/collaboration/test/base-adapter.test.ts`, `packages/collaboration-yjs/test/yjs-adapter.test.ts`, `packages/collaboration-liveblocks/test/liveblocks-adapter.test.ts`.

The existing adapter suites contain seven tests in total. The Yjs and Liveblocks
suites each check construction/configuration with stub objects. Their passing
status is not evidence of sustained network editing, provider SDK compatibility,
concurrent text convergence, or durable storage.

## Reproduced Yjs limits

The following public-import setup reproduces the plain-object update rejection
with the local packed package and Yjs 13.6.32. It is a diagnostic, not a supported
editing recipe:

```ts
import * as Y from 'yjs';
import { DataStore } from '@barocss/datastore';
import { YjsAdapter } from '@barocss/collaboration-yjs';

const ydoc = new Y.Doc();
const nodes = ydoc.getMap('barocss-document');
nodes.set('text', { sid: 'text', stype: 'inline-text', text: 'before' });
const store = new DataStore('text');
const adapter = new YjsAdapter({ ydoc });
try {
  await adapter.connect(store);
  await adapter.sendOperation({
    type: 'update', nodeId: 'text', data: { text: 'after' }, timestamp: Date.now(),
  });
} finally {
  await adapter.disconnect();
  adapter.awareness.destroy();
  ydoc.destroy();
}
```

Observed in the browser: `TypeError: t.set is not a function`. The source identifier
is `nodeMap`; the bundled identifier can differ. The create/snapshot path stores
plain objects while update/move expects a `.set` method.

A separate browser check used an integrated nested `Y.Map` with `sid`, `stype`,
and `text` fields. Initial hydration loaded `text: 'before'`. Calling
`textMap.set('text', 'after')` changed the Yjs value, but the DataStore stayed at
`before`. The observer filters for `event.target === this.ymap`, so nested-map
events were ignored. Replacing plain objects with nested maps alone is not a
complete fix.

Both observations are documented limitations, not bugs repaired in this PR.
The browser fixture treats each expected failure as a limitation confirmation,
not as a successful end-to-end edit.

## Other limits found by source inspection

These are not separately certified through a hosted integration:

- Failed `BaseAdapter.doConnect()` can leave its operation listener registered.
  `disconnect()` returns early while `connected` is false.
- Automatic local send failures are logged after the local operation, without a
  durable retry queue or server acknowledgement contract.
- `getDocumentState()` in both adapters returns the local root, not a recursive
  server snapshot.
- The room adapter writes `root.document` for snapshots but reads `operations`
  on connection. Its snapshot serializer omits marks.
- Its presence callback updates listed peers but does not immediately remove
  peers missing from the next list; the awareness timer handles expiry.
- Its incoming operation path does not invoke the exposed conflict resolver.
  The Yjs observer also bypasses its `doReceiveOperation` conflict-resolution path.

## Backend review and plan boundary

Backend Master reviewed the documentation direction against merged server PR #333
at `895f0cf20582ccfe5aa0d797121740befa825365`. The planned product provider choices
are Yjs, Automerge, and Yorkie. All three product integrations remain incomplete.
The existing Liveblocks package is not an additional confirmed product provider.

The guide links the pinned
[provider specification](https://github.com/barocss/barocss-editor/blob/895f0cf20582ccfe5aa0d797121740befa825365/docs/specs/wonffice-collaboration-providers.md)
and distinguishes it from the tested package baseline. It states that ordinary
snapshots must not overwrite active collaborative provider state and that provider
migration needs verified export/import and recovery, not only a setting change.
The server's authentication, database, backup, and restore work remains separate.

## Validation and remaining work

- `.nvmrc` Node 22.22.0.
- Existing collaboration tests: 3 files, 7 tests passed.
- Packed consumer: 35 complete README/guide examples compiled against 31 local
  package archives; Office styling fixture built.
- Desktop browser: three canonical README examples passed. The two Yjs limitations
  above were reproduced with real Yjs, without a hosted provider.
- `pnpm preflight`: passed under existing lint/source/test-type baselines; 41 source projects checked, 3 known-broken. No baseline increased.
- `pnpm docs:check`: passed, 4 tests and all 31 public packages plus the private release marker.
- `pnpm build:docs`: passed with existing bundle-size/Browserslist/update-check notices.
- Browser navigation: guide → each of the three package example anchors → guide, six steps passed.
- Existing baselines must not be interpreted as zero technical debt.

Technical Writer maintains the guidance and asks implementation owners to verify
changes before strengthening support claims. Runtime correction and priority are
outside this PR. Existing release tracker [#322](https://github.com/barocss/barocss-editor/issues/322)
remains the product acceptance source; these findings do not silently add release gates.
