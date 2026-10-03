# Native Word requirement and decision pair (#423)

This bounded feature stores one manually authored fictional requirement and decision in a native Word document. It does not extract items, run a model, approve a decision, or apply a proposed edit. Authored actor, time, or approval fields cannot confer authority.

## Authoring and reading

Open **요구·결정**, place the caret in each paragraph, and choose its requirement or decision locator. Then choose **항목과 관계 작성**. Existing point-bookmark commands and metadata transactions write the pair. The click captures native input, root, selection, and current permission before an awaited flush. A changed selection, input, root, or authority refuses the operation. DOM selection is checked before the editor's delayed model selection can hide a change.

Each item has an opaque UUID, positive contiguous item versions, and a unique paragraph point locator. The directed `supported_by` relation names exact requirement and decision versions. Container IDs, runtime SIDs, storage revisions, and save receipts are separate identities.

Each version holds a complete native Word file, including rich text, marks, resources, and referenced content. The existing file codec removes session identifiers. Only the pair's own payload is excluded to prevent recursively embedding previous pins. No original authored field is discarded. Historic pin bytes remain unchanged after creation. The panel displays readable paragraph text; **전체 원본과 서식 데이터** exposes the complete rich source. The text preview is not a rich-layout renderer and does not fetch external media.

## Changes and independent identity

An ordinary paragraph or resource change requires re-review. Existing Word numbering, reference, style, table, spacing, and border readers also detect changed effective native context. Deleted or ambiguous locators and unresolved references are unavailable. Shared legitimate bookmark range fragments remain supported; duplicate external point anchors and point/range collisions cannot silently select a reference. Missing payload, unsupported payload version, and malformed payload are distinct states. Refusal preserves the original payload and native source.

**현재 결정 내용을 새 버전으로 보관** adds a decision version through the existing transaction/history path. It retains the exact v1 relationship and historic rich files. It does not approve the new decision. Undo/Redo restores the whole native document, including optional metadata.

Local independent copy, Word library **보관함에 사본 저장**, local draft **새 문서로 복구**, and backup restore allocate fresh business UUIDs, record each origin UUID/current version, and remap the pair's internal relation. Existing authenticated file/IndexedDB **새 서버 사본 준비** paths use the same derivation before freezing the pending save bytes. Retry reuses those bytes and IDs. Viewing or moving an existing item does not derive its identity. Files without pair metadata keep the existing path. Invalid or unsupported pair payloads cannot be silently repaired during copy.

## QA and handoff

Use Node 22.22.0 and the repository pnpm version. Run `pnpm preflight`, the focused `business-pair*.test.ts` native suites, the affected datastore/model history suites, and the existing workspace copy/restore tests. Browser specs are `apps/office/tests/business-pair-local.spec.ts` and `business-pair-auth.spec.ts`.

The local spec requires `BUSINESS_PAIR_WORKSPACE_ROOT` to identify the actually served candidate. It authors a rich pair through the UI, then checks independent copy/new-ID restore, original preservation, manual library copies, new-document draft recovery, move, reopen, invalid refusal, and legacy compatibility. Draft recovery uses a controlled draft derived from the genuinely UI-authored pair; it does not prove authoring from seeded metadata. The real-auth spec uses the existing protected synthetic OIDC fixture and disposable PostgreSQL supervisor on its allowed loopback candidate; it checks native history/version pins, exact API/database persistence, database restart, independent browser authority, viewer/revoked/cross-tenant refusal, and independent server copies. Never publish fixture credentials or run against customer data.

No configuration, external service, purchase, publication, or deployment change is introduced. Operator/Technical Writer can use these local preparation conditions; delivery and acknowledgement must be recorded separately. Physical OS Korean IME, full alpha collaboration convergence, and external infrastructure/release readiness are separate, unproved conditions. Development and integration remain local Git until an authorized release. Exact commits, source/artifact hashes, completed check results, retained failed attempts, and remaining limits belong in the local execution checkpoint; this document alone is not completion evidence.
