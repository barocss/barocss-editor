# Slides authenticated snapshot verification (#406)

This milestone connects the existing native Slides editor to the authenticated
Office snapshot API. It does not enable concurrent editing. Initializing and
collaborative documents remain outside this snapshot path.

## Product behavior

Enter Office with a current OIDC account, choose a tenant and workspace, and open
Slides documents. Authority comes from fresh identity, membership, workspace,
product and document responses. A viewer can read and copy, but cannot edit or
save. A revoked account loses the document surface on fresh revalidation.

Select a local Slides document or native file explicitly to prepare a new server
copy. The source stays unchanged. An IndexedDB source is locked until its fixed
create request has a verified receipt and readable server contents. Unknown
results display a retry action, rather than a successful save. A create that has
not been confirmed has no verified document URL: after reload, enter the same
Slides workspace and choose the retained recovery item.

Every edit is captured into an account/workspace/document/tab-scoped durable
draft. Storage failure leaves input visible and blocks exit. An uncertain save
keeps its exact key, body and expected revision. Later input uses a separate
draft. Retry first checks current authority and the existing receipt. Dirty
comparison ignores only the file envelope timestamp and object property order;
array order and native metadata still count as changes. Wire bytes are unchanged.

A revision conflict retains the pending request and local draft. Copy the draft,
then explicitly open the server's latest contents. The protected-switch dialog
appears once. Reconcile the draft manually before another save; there is no blind
overwrite.

## Local checks

Use `.nvmrc` Node and the repository pnpm version. Before local integration run
`pnpm preflight`. Run the focused Slides codec/transport/pending tests and native
runtime lifecycle tests, plus Office `auth-entry.spec.ts` and
`auth-slides.spec.ts` through `playwright.auth.config.ts`. Preserve the standalone
Slides formatting path as a separate desktop regression.

For actual server acceptance, use `playwright.auth.real.config.ts` with
`auth-real-slides.spec.ts`. Supply a private synthetic OIDC fixture using
`OFFICE_AUTH_REAL_FILE`. Create a new mode0700 directory outside Git and a
pre-created **empty** mode0600 `OFFICE_AUTH_CONTROL_FILE` for each supervisor
invocation. Never reuse a populated control file. Keep logs and evidence private;
never publish tokens, credentials, source bodies or profile storage.

The existing supervisor starts a disposable PostgreSQL database and API, while
the existing OIDC fixture remains shared. Run these schedules serially on the
reserved Office/API ports. The Slides inspector extends the existing Note control
allowlist; it does not expose SQL or controls through the product HTTP API.

The two actual schedules check:

- Full shipped native structure, resource IDs and metadata through an explicit
  source-preserving copy, exact UI/API/DB agreement and receipt confirmation.
- Lost create/update acknowledgements, failure before commit, unchanged retry
  bytes and absence of duplicate writes or revisions.
- Last input after closing and relaunching the actual browser profile, and API
  process restart against the same disposable database identity.
- Real PostgreSQL failure returning503 and recovery with the same pending request.
- A reader's blocked UI mutations and API403 with unchanged database contents.
- Two independent authenticated browser profiles, sequential writers, retained409
  conflict, deliberate reconciliation and fresh reopen.
- Membership revocation and a real same-profile A→B→A login sequence. Previous
  account UI is hidden; retained physical local storage is still present under
  the documented shared-device privacy contract (#357).

The supervisor and owned profiles are cleaned up in `finally`; evidence says
`passed` only when assertions and cleanup both complete. A skipped, interrupted
or failed schedule is not a pass. Record the exact candidate and integrated SHAs
and terminal evidence in the existing Issue. Keep #372/#369/#322 open for their
remaining collaboration and release work. No external service setup, deployment
or data migration is included. Operator and Technical Writer can use this
runbook; publication does not prove that a handoff was acknowledged.

## Native file boundary

Use the complete `apps/slide` editor. Preserve native surface order, resource
IDs, layout/master/theme references, groups, tables, components, motion tracks
and jumps, plus source metadata. Runtime reconciliation restores fields that
the engine otherwise normalizes on import; exact source bytes remain the
fixed create attempt. Personal slide selection and presentation position are
not shared snapshot contents.

Attached connector endpoints currently reference transient engine SIDs. The
existing native codec removes those target SIDs and cannot remap attachments
on reopen. The authenticated server path rejects such files before replacing
the current model or making a request. Free connectors remain supported. This
limitation does not change the standalone native codec or claim collaboration
completion.
