# Exact fictional criterion execution — Issue431

This bounded Word feature connects explicit authored native versions and writer self-confirmation to one actual local browser measurement. It is not production approval, a legal/accessibility standard, physical screen measurement, independent human participation, or the complete Wonffice release flow.

## User flow and preserved source

1. In a saved server Word document, use **요구·결정** to select the requirement and decision paragraphs and create their explicit items/relation. A qualitative requirement is not executable.
2. Through normal native editing, retain the original text and explicitly add one sentence such as `Fictional active-button contrast: minimum 4.5:1.` The number belongs only to this fictional criterion; no proposed number is accepted automatically.
3. Choose **현재 요구사항 내용을 새 버전으로 보관**, save, read the exact confirmation context, and self-confirm it. The old full native pins and decision reference remain intact. Undo/redo uses the existing editor history.
4. Read **실행 문맥과 기록 읽기**, select a registered specimen, and choose **표본 실행**. Unread history, GET loading, pending execution, passed, failed, unsupported, error, and historical evidence are distinct states. Reading records does not execute a check.
5. Inspect the exact version/context, requester, executor identity/version, specimen source, evaluator definition, actual computed inputs, times, full immutable output and SHA-256. Terminal records survive source changes; they do not become the current version's approval.
6. If acknowledgement is lost, reopen, read the same context, and choose **같은 실행 재시도**. The frozen active request/key is reused. **새 표본 실행** explicitly allocates another operation only after acknowledged terminal evidence. An acknowledgement marker is local recovery bookkeeping, never execution authority.

## Execution and storage boundaries

The closed registry permits only the versioned `dark`, `low`, and `transparent` HTML specimens. A new isolated Chromium context disables JavaScript and aborts network access. It reads actual button computed foreground/background, opacity, ancestor opacity, background image, visibility, display and enabled state. The versioned evaluator supports opaque solid integer sRGB colors. The low specimen fails; transparency is unsupported; unavailable/failed executors produce durable errors with no invented measurements. No arbitrary URL, source, uploaded output, or client success flag is accepted.

Migration `0014_criterion_verifications` adds immutable records under forced current-writer RLS. The service binds exact native source/revision/hash, criterion/reference content, actor/authority epoch, confirmation, registered specimen/evaluator, and frozen request. A narrow actor/key transaction lock prevents duplicate concurrent execution. A conflicting key fails. Current authority is required for private lookup and replay; previous roles and document metadata do not grant access. The execution holds the document/membership transaction locks, so concurrent source/role changes serialize with it. Later changes make earlier evidence historical.

Context and records are separate reads. The Word host rechecks server context after records and refuses a changed actor/epoch/source/confirmation rather than silently recapturing it. Full native content and private outputs remain unchanged on errors. Failed local recovery persistence refuses the operation instead of dropping its key.

## Reproducible local checks

Use the repository `.nvmrc` Node version and locked pnpm. No browser/package download or external deployment is part of these commands.

```sh
pnpm preflight
pnpm --filter @barocss/office-service build
node apps/office-service/test/criterion-browser-executor.integration.mjs
PG_BIN=/absolute/postgresql/bin node apps/office-service/test/criterion-verification.postgres.integration.mjs
```

The PostgreSQL script creates and removes its own private Unix-socket cluster. It never accepts a shared `DATABASE_URL`. Its store reconstruction check is not an API/PostgreSQL process restart.

The real-auth Playwright scenario is `apps/office/tests/criterion-verification-auth.spec.ts`, using `apps/office/playwright.auth.real.config.ts`. It requires the existing protected synthetic OIDC fixture, local issuer, installed Chromium/PostgreSQL, authorized port5191 and a disposable API port. Set `OFFICE_AUTH_REAL_FILE` to the protected fixture. Create a fresh owned0700 directory outside the repository and an empty0600 `control.json`; set `OFFICE_AUTH_CONTROL_FILE` to it. Set `OFFICE_AUTH_ORIGIN=http://127.0.0.1:5191`, `OFFICE_AUTH_API_PORT` to the reserved test port and `PG_BIN` before running:

```sh
pnpm --filter @barocss/office-app exec playwright test --config playwright.auth.real.config.ts tests/criterion-verification-auth.spec.ts
```

This real scenario authors the measurable sentence into a mixed marked native requirement; checks old/new full pins, undo/redo, save/confirmation and all terminal outcomes; exercises delayed GET without POST, selection/root/account retirement, first and deliberately fresh lost acknowledgements/reopen/exact retries, duplicate/key conflicts, forged inputs, current versus historical requirement/reference versions, ambiguous targets, independent copies, two real users, viewer/revocation/cross-tenant access, role ABA during context reads, and actual API/PostgreSQL process restart on the same database. Evidence names alone are not proof: retain exact source/test/build hashes, process IDs, output digests and command terminals. The protected control channel is test-only and restores live executor mode and fixture roles during cleanup.

## Handoff and limits

QA can reproduce the flow above on the exact recorded local integration commit. Operator must apply the new migration and use the existing authorized Node/Chromium runtime; do not treat this document as external infrastructure or deployment permission. Technical Writer should describe fictional scope, explicit authoring/confirmation, unknown recovery and historical outputs. Documentation availability does not establish receipt or acknowledgement by another role.

Developer feature completion is evaluated separately from product release readiness. Physical Korean IME, independent human research, broader criteria, production approval policy, four-product collaboration/privacy/install/release conditions and the complete owner Goal remain open. Existing #420 preview-only proposals remain unchanged. Development stays in local Git until the authorized release stage.
