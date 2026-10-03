# Exact Word criterion self-confirmation (#428)

This bounded local prototype lets a currently authenticated document writer explicitly confirm one exact native requirement and its pinned decision context. It is not company approval, a legal signature, release approval, AI extraction, a proposal apply operation, or an independently executed verification result.

## Native content and explicit action

Use the existing Word **요구·결정** panel to author the fictional pair. Save the complete native document through the current server workspace. Choose **서버 확인 기록 읽기**, inspect the displayed requirement and pinned decision files, then choose **이 요구사항 버전을 직접 확인**. Typing, selecting, importing approval labels, viewing proposals, and saving cannot confirm a criterion.

The requirement business UUID/version, bookmark locator, pinned decision UUID/version, current decision version and full rich content remain distinct from document ID, snapshot revision, snapshot hash and receipt ID. A decision v2 may still reference its exact historic v1 pin; the new current context needs a separate explicit action. Changed, deleted, ambiguous or unresolved content cannot be confirmed. The complete current native bytes and historic pins are preserved.

Original content, interpretation/proposal, exact confirmed context and verification state are displayed separately. Verification stays **실행하지 않음**. A browser automation fixture proves software behavior; it does not establish an independently participating human or organization approval. Authored actor, time, approval and imported receipt-like labels are untrusted claims.

## Server boundary and recovery

The current service uses tenant authorization, current writer membership locks, canonical document/snapshot locks and the same #423 native schema/context readers. Its context capture supplies a server-owned current actor and authority epoch. Confirmation compares the exact frozen canonical source, revision/hash, complete criterion context and current authority. The server chooses confirmation UUID, actor and time. Viewer, revoked and cross-tenant principals cannot create or retrieve private confirmation records, including a creator who is later downgraded.

Migration `0013_criterion_confirmations` adds an append-only table under the current service. The app has SELECT/INSERT only, forced tenant/current-writer RLS, and no UPDATE/DELETE rights. Backup SELECT is separate privileged operator access. Existing records do not disappear or migrate when native edits, new versions, copy, restore or membership changes occur. Independently derived business IDs have no confirmation until their own explicit action.

The product freezes a narrowly versioned request and stores its exact bytes/key in a local recovery entry scoped to issuer, subject, tenant, workspace, document, server actor, revision/hash and authority epoch before sending. No token is stored. Connection loss is an unknown result; an explicit retry reuses the same operation. The server serializes concurrent duplicates and rejects conflicting key reuse. Same-database restart/reopen can retrieve the exact old receipt under current authority. A response for a replaced document/account/input target cannot attach to the new editor context. Local recovery storage failure refuses before sending and preserves native content.

## Build, QA and operations

Use `.nvmrc` Node22.22.0 and repository pnpm. The existing office-word `build:criterion` entry bundles the same native validators for Node; office-service/API build invokes it. There is no new package or generic approval platform. Run `pnpm preflight`, focused criterion/native/service/API checks, the disposable PostgreSQL integrity script and the protected real-auth desktop spec `apps/office/tests/criterion-confirmation-auth.spec.ts`. Preserve existing type/lint budgets and whole-native assertions.

The auth spec uses existing protected synthetic OIDC users, isolated local PostgreSQL and two independent browser profiles. Never publish fixture credentials or use customer data. It checks genuine UI authoring, unchanged native content, explicit confirmation, lost acknowledgement/replay, forgery, stale versions/locators, document/account/DOM lifetime retirement, editing/history, same-database restart, copy and current authority. Its controlled digest scheduling gate is a declared test fixture; the real browser digest still runs and no product authorization hook is replaced.

Operator handoff: include the new immutable table and source snapshots in the existing reviewed database backup/restore process; do not import live authority from native exports. There is no deployment or external infrastructure change here. Technical Writer handoff: document writer self-confirmation, historical context, permission refusal and unknown-result retry separately from storage success and verification. Delivery and acknowledgement must be recorded separately in the execution checkpoint.

Exact final commits, source/artifact hashes, raw failures, terminal results and remaining limitations are recorded outside the repository. This document is not completion evidence. Physical OS Korean IME, #431 independent verification, full collaboration alpha, production approval policy and all external release/privacy/operator/account conditions remain unproved or separate work.
