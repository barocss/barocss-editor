# Note real recovery schedule — #357

Base: local develop `cb3f8cc7e3f0d3994b519535b3328522635b8f1a`.

This schedule uses actual OIDC identities, the product Office/Note UI, the real API and a disposable PostgreSQL database. It checks snapshot persistence and conflict recovery. It does not establish Yorkie convergence or external alpha readiness. The final #357 proof map combines the unchanged recovery evidence with the destination schedules below.

## Protected environment

Use Node from `.nvmrc` and locked pnpm. Keep the existing local Keycloak realm and synthetic accounts unchanged. Provide `OFFICE_AUTH_REAL_FILE` as an absolute protected synthetic fixture path. Never publish its contents or credentials.

Create a fresh empty mode0600 `OFFICE_AUTH_CONTROL_FILE` in an owner-only mode0700 directory outside this repository for each terminally completed run. The harness refuses a nonempty descriptor. A descriptor from an old run is not live evidence. Do not truncate a descriptor while its supervisor is running.

Run serially; the harness owns API14101, Office5191, two isolated Chromium profiles and a private PostgreSQL Unix-socket cluster. It never controls shared PostgreSQL5432, Keycloak18180 or Yorkie. The opt-in control channel is an owner-only Unix socket, with fixed synthetic actors and allowlisted operations; it is not a product HTTP endpoint. Browser credentials remain in private profiles and memory. The supervisor sends API configuration through private IPC.

```sh
OFFICE_AUTH_REAL_FILE=/absolute/private/fixture.json \
OFFICE_AUTH_CONTROL_FILE=/absolute/private/new-run/control.json \
pnpm --filter @barocss/office-app test:e2e --config playwright.auth.real.config.ts --grep 'same database recovery matrix|real Note preserves immediate|one physical profile|cross-tenant direct UI'
```

Without both explicit environment variables the matrix is skipped. A skipped matrix is not a pass. Logs and artifacts can contain synthetic document bodies or authentication callback data; keep them protected and redact before sharing.

## Observable acceptance

1. Deliberately inspect the device-local library and prepare a structured C-copy. The fixture includes a marked paragraph, self-reference, code and table. The exact original IndexedDB row remains unchanged.
2. Attempt creation with the private destination database unavailable, before transport reaches the API, and after actual API commit with response delivery suppressed. Retain the same source and request key/body through repeated re-entry and process restart. Retry confirms exactly one document and receipt, new IDs and transformed self-reference.
3. Update the server copy with before-commit request loss and after-commit acknowledgement loss. Whole browser OS processes and API OS processes stop and restart. The private PG PID/data identity stays the same during API-only restart. Request/receipt reconciliation increments the saved revision once.
4. Stop the private PG process during a save. The real API returns503 and UI retains the fixed pending body without claiming confirmation. Restart PG on the same data identity, retry, then compare actual API and DB head/body/revision/hash. No database reseed occurs.
5. Open the same document with a separate real viewer. UI has no save action; direct write returns403 and changes no document or receipt. Grant only the synthetic viewer editor authority, then save writer-A and attempt stale writer-B. Conflict preserves B's draft. Explicit copy/latest-head recovery followed by B's new edit gives the next revision with both intended edits and no stale overwrite.
6. Revoke only that synthetic membership. Recovery cannot mount the editor and direct read returns403. Restore the fixture membership for cleanup.

At each canonical checkpoint compare full API/DB bytes, native tree/hash and head metadata. Check current paragraph text, self-reference ID, code and table DOM after re-entry. Capture actual old/new browser/API/PG PIDs and DB identity. API/browser restart is not represented by merely creating a new tab or BrowserContext.

The run writes an incomplete record first. It marks the protected `recovery-evidence.json` passed only after assertions and owned browser cleanup complete. Check the Playwright exit code and supervisor teardown as well. A passed file alone is insufficient evidence.

7. Close the full browser process immediately after the input action. Reopen the same protected profile, deliberately recover the exact latest draft and confirm it against the real API/DB. Inject failure only into pending localStorage writes, retain visible input and block in-app exit. Restore storage and use the existing Save action to protect and confirm the current body before exit/reopen; storage restoration alone is not confirmation. A second tab independently retains its own exact draft after immediate close.
8. Keep an old A editor tab alive while another tab in the same physical browser profile performs actual IdP logout/login as B. Deliver an already-committed A response while B is active. Neither A UI nor private latest draft may appear or retry under B; retained raw records remain identical. Return to A and deliberately recover the exact private latest draft.
9. Use B's actual Beta company owner authority to create a Beta Note. Login as A, then test Beta direct GET/PUT/create and guessed UI URL. Expect403, no body exposure and unchanged document/receipt counts in both tenants.

## Destination conflict closure

The destination schedules use base local develop `89eb7bc93f0e029d9c4c56f18c55cca1776fc4e9`. Product Note/API/service logic is unchanged from recovery integration `d30a6be23ca62c62d0f5ee94dec58796166ea15e`; intervening changes are shared visual tokens and gallery/foundation checks. Run the focused cases with the same protected environment and a fresh control descriptor:

```sh
OFFICE_AUTH_REAL_FILE=/absolute/private/fixture.json \
OFFICE_AUTH_CONTROL_FILE=/absolute/private/new-run/control.json \
pnpm --filter @barocss/office-app test:e2e --config playwright.auth.real.config.ts --grep 'existing server page identity|real different-body receipt'
```

10. Create a synthetic server Note through the actual API. Seed a local row with that destination page identity and title. Deliberately prepare and save its C-copy. Assert new document/page identities, transformed self-reference and exact native structure, API/DB/UI agreement, whole original IndexedDB row equality, unchanged existing destination body/head, and exactly one additional document/receipt. Existing identity is not an overwrite target.
11. Prepare the original C-copy through the UI, then consume its fixed create key with a different valid body through the actual API under the same verified account/tenant. Save must reject the real mismatching receipt and remain unconfirmed, with original body/key/source intact and no product create POST. Reload, recover deliberately and retry: retain exact persisted bytes across reload, preserve request/source fields on retry (only the attempt recording timestamp may refresh), create no extra document/receipt and do not rotate the key. Direct original-body POST must give409 `key_reuse`. Compare the occupied destination and receipt unchanged.

12. After the confirmed identity-copy case and the failed/retried occupied-key case, use the same physical browser profile for actual IdP logout/login as B. Directly read `barocss-note` IndexedDB `documents` and compare the full original rows, plus exact raw pending records. Both remain readable under B at the physical origin-storage layer. B's product editor must not automatically open the local A source, offer A recovery, display A copy confirmation or issue a source-copy POST. Under A, assert the visible original location/residue notice before switching. These observations document retained unencrypted bytes; they do not claim physical privacy or implement encryption/cleanup.

Each case writes a protected `destination-*-evidence.json`; require terminal test exit0, no skipped case, browser OS process exit and private supervisor/PG teardown. Failed runs remain evidence of failure, not completion. This is a test-only closure of existing C-copy guards, not a new overwrite feature or product storage change.

## Coverage limits

These real schedules cover selected Note schema structures and snapshot workflows. They do not replace the full original #357 proof map. The late-response schedule uses two tabs in one physical profile; it does not replace the active account inside the same JavaScript realm. Its latest A draft is recovered without automatically submitting a stale base; conflict-save behavior is verified separately by the two-writer matrix. Device-local storage remains unencrypted and retained. A hidden row is not physical storage access control. No source cleanup or publication is authorized by this schedule.

Before local integration run `pnpm preflight` and affected checks. Record the exact candidate/integration commits with protected log hashes, no secrets. Keep #357 open while any required scenario is incomplete. No routine push/PR, deployment or Yorkie resume.
