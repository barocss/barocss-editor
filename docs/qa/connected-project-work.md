---
work_id: '290'
artifact_type: implementation-and-qa
status: qa_ready
owner_role: Execute
source_request: 'Connected human and Agent work, 2026-10-02; GitHub #290'
last_updated: '2026-10-03'
---

# Connected project work

The project home links a goal, named results and explicit revision requests to existing originals. The document library remains available on demand. Product type does not determine a mandatory work sequence.

## Supported flow

Create a project, then link an existing original or create a local original. Open a result in its existing editor. Return to the same project after the mounted editor confirms its final input is saved.

Word provides a guarded native comment target for a selection within one text run. The selection is captured before asynchronous storage work. Changed document, selection, root, authority or target ownership refuses the operation. Multi-run targets are not supported. Other products currently support whole-document project feedback; they do not pretend to have native region anchors.

Comment-only stores an opinion and its exact source version. Native Word comment resources and marks are saved on the original; its body text is not rewritten. An explicit revision request links one durable work record to the comment. No product Agent executor is connected. Requests remain **unconnected** or **paused** and never claim generated or applied changes.

The missing product executor, proposed change application and execution provenance remain queued under #439. That follow-up is not required to use or verify this truthful unconnected flow. This implementation does not claim an Agent performed a document edit.

Use **Follow-up result** to connect an existing named result to the same request. Confirm the current source to pin its exact stored bytes and revision. The result and work retain this evidence. Association does not mean the result was automatically edited. Later source edits preserve prior evidence and show that review is needed. Pause and resume preserve the work identity.

Drafts are persisted in the existing project catalog. Closing the feedback panel or navigating away waits for draft storage. New typing during a delayed submission must remain in the composer. Synthetic composition events cover Enter and Escape; physical operating-system Korean IME is a separate verification gap.

## Storage and authority

Local projects use the existing browser catalog with optimistic revision checks. Originals remain in their existing product stores. Backup restore gives live results new original identities but preserves historical source bytes, revisions and native target identities. An absent historical original is reported; evidence is not rebound to a new original by text matching.

Authenticated projects use the existing PostgreSQL/API membership boundary and migration `0011_connected_projects`. The API constructs canonical actors, source pins and work state. Current membership and workspace access are checked on every operation and pin retrieval. Idempotency receipts replay the original operation after a lost acknowledgement. A later human project change is not overwritten by a retry.

Authenticated Site editing is a separate pending dependency (#407). The authenticated project screen uses the existing library to create supported originals. Local Site drafts remain distinct from publication. Saving and linking a result do not publish or transmit it.

## Reproduce the acceptance flow

Use synthetic internal data only:

1. Create **Windows beta release**, with a goal to prepare customer guidance and training.
2. Link **Customer installation guide** (Word) and **Team training** (Slides). Open the guide and switch from reading to direct editing.
3. Enter guide text. Select a single text run and leave: “Explain what to do while the app is running, and reflect this in training.” Save comment-only. Confirm unchanged body text and zero revision work records.
4. Connect the saved comment to a revision request. Confirm one unconnected work, its exact target, author, original version and request.
5. Return to the project. Connect training as a follow-up result on that same work and pin the current guide version. Inspect the retained source bytes.
6. Edit the original guide. Reopen the prior reference: bytes and revision remain unchanged; the changed-source notice is visible.
7. Pause, reload and resume. Confirm the same work identity and no generated document or applied-change claim. Exercise native Undo/Redo separately.
8. Repeat through real OIDC and a disposable local PostgreSQL/API runtime. Check viewer, revoked and cross-tenant access. Interrupt the acknowledgement after a committed comment, make an intervening project change, and retry the exact operation without duplicate opinion/work.

## Verification boundaries

Focused model/client/storage tests, native Word runtime tests, actual desktop tests and the required Node/pnpm preflight are distinct checks. Unit transport mocks do not establish authenticated authority. Local navigation through four editors does not establish all four native region-comment implementations or external alpha readiness.

Source-bound command output, before/after manifests, screenshots, original failures and exact candidate commits are recorded in the Execute evidence directory. A started, skipped, failed or interrupted check is not a pass. The previously failing #432 Slides first-export scenario passed in the final ordered 27-case check after the bounded menu-lifetime repair. Original failed runs remain evidence; its exact original intermittent event is not claimed as proven. The #438 editable introduction raw-export equality finding remains open.

Native feedback capture settles the currently owned DOM range into the native selection model before freezing the target. It does not restore focus or recapture after storage waits. A different selection, content or permission transition during that synchronization refuses the intent, even if it returns to its prior value.

## Handoff

QA can reproduce the above flow using the existing local Office entry or the opt-in actual-OIDC fixture. Operators must apply migrations through the existing service procedure; this change does not authorize production migration or deployment. Technical writers should distinguish local storage, authenticated storage, unconnected execution and Site publication. External installation, purchases, deployment and customer transmission are not part of this work.

## Verified candidate and checks

Implementation base: accepted local integration `811e6dbe8b6b9170e5e0b669d3dd03b71627993e`. Remote main at verification: `c023f894db44e5365f96ee9c426be083982bec76`. The main-base PR also carries accumulated accepted local Office foundations; the #290 delta is identified separately from those ancestors.

Final source binding uses a before/after SHA-256 manifest over 2,898 source, test and configuration files, including owned untracked implementation. The exact committed version is recorded in the PR. Checks on unchanged affected sources:

| Check | Actual result | Boundary |
| --- | --- | --- |
| Project model, local storage, client/session | 17 passed | Controlled unit transports; includes account ABA |
| Native Word comments, capture and mounted runtime | 35 passed | Exact native Undo/Redo, DOM/model synchronization, authority and selection ABA |
| Private PostgreSQL/API project integration | 13 passed, cleanup confirmed | Current ACL/RLS, CAS, immutable receipts/pins, restart persistence |
| Local desktop project and feedback | 9 passed, 40.0 seconds | Four existing local editor entries, drafts/composition, lifecycle, backup and exact historical bytes |
| Ordered Slides UI regression | 27 passed, about 1.2 minutes | Light/dark controls, selection, variable fields, notes, native export/reopen and real menu owner changes |
| Actual OIDC/API/PostgreSQL product scenario | 1 passed, 32.5 seconds | Two independent logged-in browser profiles; viewer, downgrade, revoke, lost acknowledgement and exact canonical storage |

A Beta member querying an Alpha project ID within the accessible Beta namespace receives exact `404/not_found` without project data. An Alpha principal querying the unauthorized Beta namespace receives exact `403/forbidden`. These are distinct privacy cases. No arbitrary accepted status set is used.

Use `.nvmrc` Node 22.22.0 and pnpm 8.15.0. Run `pnpm preflight` before push. It applies the repository's unchanged diagnostic ratchets; a passing result does not mean historical lint/test-type debt or the three acknowledged demo source failures disappeared. The newly checked workspace test budget is zero. No threshold was raised.

The auth scenario is `apps/office/tests/connected-project-auth.spec.ts`, opt-in through `apps/office/playwright.auth.real.config.ts` and the existing private synthetic-user fixture. Its disposable PostgreSQL/API runtime and two temporary browser profiles are cleaned up. Shared Keycloak is retained. Private credentials, bearer tokens and OIDC codes must not enter public evidence.

Original failed runs were preserved. Test protocol repairs wait for confirmed UI save/pause settlement. The activity fallback assertion checks the exact direct label separately from its sibling timestamp. None weakens raw native equality, current authorization, source bytes or revision checks.

Developer verification is distinct from whole-product release readiness. Live product execution (#439), authenticated Site (#407), #438 introduction export, physical OS Korean IME, and external alpha requirements remain incomplete or unverified. No publication or deployment was performed. Automatic opening of the separate local preview was rejected by browser permission review; it was not bypassed. This does not replace the scoped controlled browser checks above.
