# Note durable recovery — bounded #357 milestone

Base: `origin/develop` `016f5da12e316bde43f656f0607982e869391392`.

This milestone preserves authenticated server Note drafts and fixed snapshot save attempts across navigation and reload. It does not close #357 or establish external alpha readiness.

## Behavior

- Recovery records use verified issuer/subject, tenant, workspace, document reference and independent draft IDs. Discovery enumerates record keys instead of maintaining a shared mutable index.
- Two tabs that open before editing keep separate drafts. Recovery shows each identity and requires a deliberate selection. Opening a record alone creates no new record. Editing a recovered unsent source starts a separate draft while keeping that source.
- A save writes its exact request body and idempotency key before transport. Recovery uses the same key for receipt lookup and safe retry, then verifies the same-account GET, codec and hash. Confirmation retains the local record.
- Storage failures name the current input as unprotected and block in-app exit. An older durable record does not make newer input safe. Writes are read back before the UI reports protection.
- Records remain in this browser's localStorage under `wonffice.note.pending.v1:`. Account-scoped UI filtering is not encryption or device-level confidentiality. There is no automatic cleanup or tab-exit success claim.

## Reproduce

Use Node from `.nvmrc` and pnpm from the lockfile. Run from the repository root:

```sh
pnpm exec vitest run apps/note/src/server-documents.test.ts apps/note/src/server-pending.test.ts
pnpm --filter @barocss/office-app test:e2e --config playwright.auth.config.ts
pnpm preflight
```

The synthetic Chromium suite owns loopback port 5191. It covers separate tabs, stale-record quota failure, explicit recovery, repeated lost-response reload, exact request retry, revoked access and existing Office entry behavior.

For real login/API/PostgreSQL checks, set `OFFICE_AUTH_REAL_FILE` to the protected local synthetic-account fixture. Do not put fixture contents in logs or Git. Each account entry can specify a `username` distinct from its logical fixture alias.

```sh
pnpm --filter @barocss/office-app test:e2e --config playwright.auth.real.config.ts
```

The real harness uses the existing local Keycloak realm on 18180, API on 14101, Office on 5191 and its own disposable PostgreSQL cluster. It does not use the shared PostgreSQL service. It stops its API and disposable cluster after the run. Keep Yorkie and Mongo paused.

## Remaining #357 acceptance

The real four-case suite covers login/roles, account entry switching, one writer with a viewer, server save/reopen and durable navigation/logout recovery. It does not prove two writers, full browser/API process restart with the same DB, pre/post-commit response loss, DB write failure, the full IndexedDB migration fault matrix, or complete UI/API/DB structural comparison. These remain on #357. Automatic retention/deletion and external release readiness remain separate decisions.

The subsequent explicit local Note copy UI and its focused evidence are described in [note-local-copy-357.md](note-local-copy-357.md).
