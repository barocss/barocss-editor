# Connected revision execution

This boundary extends existing project feedback. It does not replace the original
editor, document store, authentication, comment receipts, or collaboration engine.
A recorded opinion never starts inference. A user must link a revision request and
then explicitly request a proposal. Model interpretation is not a confirmed business
criterion. Proposal acceptance is separate from native application and confirmed save.

## Supported original

The initial target is one complete plain inline-text run in a Word paragraph with
one native commentRef mark and a unique existing comment thread. The paragraph has
one child. Protected ancestors, incomplete ranges, ambiguous/deleted comments,
unknown marks, stale source versions and unsupported products are refused.
The stable target is the native comment identity; it is never reattached by quote.

The server derives the declared output from complete captured native bytes. Only
the run text and its commentRef end change. The product independently checks that
declaration before calling its existing FragmentEditor transaction. Native content,
resources, attributes, omitted fields and unrelated runs remain exact. The native
transaction owns history; there is no second document or synthetic undo stack.

Approval first completes pending input/save preparation. Composition, unfinished
math, changed input, selection, document or account generations retire the preview.
The frozen intent is checked under the existing transaction lock and after awaited
guards. The guard permits only the captured original or its exact declared candidate.
After application, existing authenticated save/recovery owns persistence. The server
acknowledges only the declared next canonical revision and exact snapshot hash.

## Durable lineage and recovery

One attempt is reserved per tenant/project/work before dispatch. Its one-use private
completion claim retains bounded outcome even if the caller loses permission while
the provider is running. The claim is not an HTTP credential and cannot write a
native document. Normal reads and all human operations require current membership.
Captured authority, request/result context and exact source versions guard acceptance.
Only the same work's pause/resume state and presentation activity/drafts are excluded
from its frozen context fingerprint. A paused work cannot accept or acknowledge.
After resume, unchanged source and context can explicitly continue the same proposal
without inference. Other requests, goals, comments, result links and input pins remain
frozen; a changed source or authority still refuses the proposal.

The phases are proposal, blocked, failed, accepted, applied, rejected, unsupported,
and unknown. A dispatched attempt with a lost/unfinished outcome remains unknown.
Opening a project, reading status, replaying execution or restarting the API never
reinvokes the provider. There is no scheduler or automatic retry. A rejected proposal
preserves the original. An accepted attempt cannot be labeled rejected.

After lost acceptance/save acknowledgements, explicit recovery checks canonical
bytes. Exact declared output is acknowledged. Exact unchanged input can resume the
same accepted proposal under fresh authority. Any other content is retained and
reported for review. Recovery never dispatches another inference or blindly reapplies
a delta. Historical work inputs remain retrievable subject to current authorization.

## Local adapter

Production execution is opt-in with `OFFICE_LOCAL_AGENT_ENABLED=true`. With no
configured adapter, the request remains unconnected. The current adapter uses only
the installed loopback Ollama service, fixed model `qwen3.6:27b-coding`, and recorded
model digest. It does not download a model, enable tools, follow redirects, fetch
external URLs or call a paid provider.

Instructions, output schema, the free request, complete native original and pinned
inputs form one literal `raw` prompt. The full prompt must fit 24,576 UTF-8 bytes
before transport. Explicit context is 32,768 tokens and output limit is 4,096 tokens;
installed metadata must support that context. This conservative bound prevents
silent source truncation. Provider token counts and exact hashes are evidence of
submission and response, not proof of semantic understanding. Hidden reasoning and
credentials are not stored in public execution records.

The adapter requests `think: false` only when installed `/api/show` metadata supports
that value. It keeps the complete declared output and refuses unfinished or length-limited
responses. See [Ollama generate](https://docs.ollama.com/api/generate).

Generation uses a fixed loopback Node HTTP request with a hard 600-second deadline
for headers and the complete bounded body. It does not rely on the default Node fetch
header timeout. Only the exact authenticated execution
POST has a 610-second browser transport wait. Ordinary reads, writes and approval
retain their existing 10-second wait and login generation checks.

## Follow-up limits

A deliberately linked training result shows the exact guide input version and an
explicit pending/unsupported reason. This version does not update when the guide
changes. A source change signals review. Slides training editing is not implemented
by this boundary; neither an accepted guide revision nor a stored pin claims it is.
This bounded implementation does not establish external alpha/release readiness,
physical OS Korean IME behavior, Site publication, or complete multi-product Agent
execution. Deterministic contract tests, real database checks and live model/browser
checks must be reported separately against the exact candidate and integration SHA.

## Unfinished local checkpoint — 2026-10-03

Developer status: incomplete. Product release readiness: unconfirmed.
This candidate preserves the implementation and evidence; it is not an integrated
or release-ready version. Accepted local develop remains
`dfb03a03ce48b419a2fee1860098370abb53b3a9`. No push, PR change, Issue closure,
model retry, publication or deployment is part of this checkpoint.

The previously frozen `5309ade6` plus owned changes passed Node 22.22.0
`pnpm preflight` and 59 service/API, 17 native and 13 client focused tests.
Before/after manifests matched all 3,330 source paths. Lint and type-check results
retain the existing repository diagnostic baseline; no budget was relaxed.
Isolated PostgreSQL execution checks passed 15 groups with an injected adapter;
the existing project PostgreSQL checks passed 13 groups. These are distinct
from actual model acceptance.

The actual authenticated desktop suite passed the existing project scenario and
failed the new live-model scenario at its 960-second deadline. Its recorded
request had no observed response or native application. A 949-second thermal
sleep interval overlapped the request; the provider outcome remains unconfirmed.
The original earlier unknown outcome, cold-route failure, duplicate-title picker
failure and all raw diagnostics remain preserved. They are not passing evidence.

A later test-only diagnostic change, from helper commit `900cbfc6`, persists
evidence before long waits and records each cleanup outcome. It retains the
existing own-PID guards and acceptance timeout. Unconfirmed profiles are preserved,
and incomplete cleanup cannot produce a passed status. The copied final test
passed its scoped lint and Office test type check; its browser behavior and a
new final source-bound preflight still require verification.

Remaining gate: confirm a normally awake physical runtime, then verify the
actual model proposal, human acceptance, exact native Undo/Redo, canonical save,
same-attempt pause/resume, pinned training follow-up, browser/API restart and
current authorization against this exact candidate. Retain all seven #439
criteria and all thirteen Goal requirements. Training automatic editing remains
unsupported and explicitly pending. Full Goal and alpha readiness are not claimed.
