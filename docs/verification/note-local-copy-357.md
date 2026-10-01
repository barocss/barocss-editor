# Note local-to-server C-copy — #357

Base: local develop `2a7f9de6976987c28a11a9d8dd29ed2f19b9d4e9`.

## User procedure

1. Sign in to Office, select the authorized company/workspace and enter Note.
2. Choose **로컬 노트 사본 가져오기**. Read the notice: device-local records can belong to an earlier user of this browser. Only select a record you are permitted to use.
3. Choose **이 기기의 로컬 노트 목록 확인**, then **서버 사본 준비** for the intended Note. No listing occurs on mount or automatic account change. Preparation rereads the full stored file and checks its codec.
4. Check the selected body and local source identity. The fixed source bytes, source reference, destination account/workspace and create key are durably recorded together. The original remains unchanged in IndexedDB `barocss-note/documents`. Preparation alone does not send the create request.
5. Choose **저장 확인·재시도**. Until receipt plus same-account GET/codec/hash and copy ID/self-reference checks pass, the copy remains unconfirmed. The fixed body is read-only during this step.
6. After uncertain response or restart, deliberately choose the original recovery record and retry. The same key/body is used. A found receipt confirms the original effect rather than creating another copy.
7. On confirmation, the server uses its new document/page IDs. The UI shows the server mapping and residual locations. The local original and confirmed source request remain. Other-page references are not rewritten. Later edits belong to the server copy, not to the IndexedDB source.

## Focused verification

Use `.nvmrc` Node and locked pnpm. Targeted commands:

```sh
pnpm exec vitest run apps/note/src/server-pending.test.ts apps/note/src/server-documents.test.ts
pnpm --filter @barocss/office-app test:e2e --config playwright.auth.config.ts --grep 'local Note C-copy'
pnpm --filter @barocss/office-app test:e2e --config playwright.auth.real.config.ts --grep 'real PostgreSQL C-copy'
pnpm preflight
```

The real command requires the protected `OFFICE_AUTH_REAL_FILE` fixture and existing local Keycloak. It owns disposable PostgreSQL/API14101/Office5191, as described in the durable recovery runbook. Do not run real and mocked suites concurrently on these ports.

The mocked scenarios compare whole original IndexedDB records, full structured source request, retained source mapping, same-key retry before commit and receipt reconciliation after commit. The real scenario checks a structured source copy against an independently constructed tree, original bytes/metadata, actual new IDs/revision and UI reopening. These focused results do not prove the complete same-DB process restart/outage/two-writer/privacy matrix. #357 and overall release remain incomplete until the original acceptance passes on one integrated candidate. Physical browser storage is not encrypted and has no automatic retention/deletion policy.
