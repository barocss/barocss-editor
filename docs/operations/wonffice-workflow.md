# Wonffice operating contract

Effective: 2026-10-08, direct human approval recorded in [#496](https://github.com/barocss/barocss-editor/issues/496). This contract supersedes the single product Execute restriction. The current `wonffice-work:v1` record at the top of each Issue holds its owner, scope, priority, readiness and acceptance. Milestones group product goals and research questions; they do not grant a write lease or promise a release. Exact Git commits and check receipts are evidence. Older comments and automation prompts remain historical records.

## Roles and decisions

| Role | Responsibility and output | Boundary |
| --- | --- | --- |
| Execute Editor | Native model/editor/input/selection/history/serialization and Note/Word/Slides/Site consumers; exact scoped implementation, tests, local commits and technical documentation. Default families: model/datastore/extensions/editor-core/editor-view/renderer and office-note/word/slides/site plus app consumers. | Family names are not blanket file leases. Does not write shared integration, locks, registration, configuration, budgets or operating policy. |
| Execute Workspace | Office shell/file tree/Project/My, authentication/current permissions, API/PostgreSQL storage/recovery and schema-server transport; exact scoped implementation, tests, local commits and technical documentation. Default families: apps/office, office-api, office-service, schema-server and office-workspace. | Cross-domain app, pending, schema and shared files require one named owner and an agreed interface before editing. Does not integrate or edit shared configuration. |
| Execute Integration | Sole serial local `develop`, shared-root/lock/package-registration/configuration/budget/operating-policy writer. Reconciles exact immutable parent-to-child deltas once, verifies integration, and owns serial shared browser/API/private PostgreSQL verification. | Semantic changes return to the responsible author. No arbitrary reset/stash/switch of shared WIP; no product push/PR/deploy under this transition. |
| Planner | Product direction, approved scope/priority, missing-candidate and duplicate checks, cross-role dependencies/conflicts, whole-Issue/Goal acceptance and release decisions. | Does not approve each in-scope technical step, relay routine collaboration or edit product checkout. |
| Research | Existing registered categories; bounded questions, sources, counterexamples and adoption/validation/hold proposals in existing Issues. | No automatic implementation or release commitment. Preserve paused, one-question lifecycle and [category registry](research-categories.md). |

Exactly two author chats, Editor and Workspace, join the existing Execute chat as Integration. Stable role IDs: Editor `01a11ad2-3ae3-71f0-ab7d-c0c5848664de`, Workspace `01a11ad2-3e4e-7560-842a-bf51d1e5c0b3`, Integration `01a0be0f-71b8-7570-b423-98b01a66631e`, Planner `01a0be9d-0a28-7741-8ce7-b500e1f41aaf`. The published [Wiki operating model](https://github.com/barocss/barocss-editor/wiki/Wonffice-Operating-Model) is the durable role contract; #496 records its exact publication receipt. Role onboarding ACKs prove receipt only; they do not grant a product lease. Do not create a permanent Review role, additional permanent author roles or new schedules. Authors may use bounded helpers under one owned Issue with disjoint files and isolated worktrees. The issue's actual owner remains responsible. No helper may write the integration branch or borrow a shared runtime without its lease. This role transition does not change saved model or reasoning-effort settings, supervisors or schedules. Keep applicable latest human model instructions; do not change those settings as an incidental part of the transition.

There is no permanent Review approval gate. Required checks, original acceptance, security, environment approval, remote branch protection and release gates remain. Product development stays local; ordinary push, PR and deployment are not completion conditions or newly authorized actions.

## Issues: current task records

Each author can deduplicate, create, claim and maintain necessary ready work within its approved responsibility. Use the GitHub Issue template when available. Until templates reach the remote default branch, write the same required fields manually; do not publish product commits to activate templates. Preserve original requirements and comments and keep one current record at the top. Integration adds exact integrated checks. Planner manages global scope, priority, whole-goal acceptance and release records. Avoid duplicate live status tables in comments, Wiki or repository documents.

```markdown
<!-- wonffice-work:v1 -->
## Current work record
- Type: implementation | research | coordination | defect
- Category: docs/operations/research-categories.md ID or product/operations
- Priority: P0 | P1 | P2 | unranked
- Readiness: needs-triage | backlog | ready | running | verifying | waiting | paused | human-hold | accepted | superseded | cancelled
- Release commitment: none | candidate | committed (milestone and decision basis)
- Owner: role, existing chat/thread, assignment/scope ID and version, or unassigned
- Exact scope: base SHA/branch, files, interfaces, dependencies and original acceptance
- Last observation: UTC timestamp and actual evidence
- Next safe action: one sentence
- Block/resume conditions: none, or exact unmet prerequisite
- Progress/evidence: first failures, actual commands/results, source/native/candidate/integration SHAs
- Original request/scope/acceptance: preserved in body; additions are explicit
<!-- /wonffice-work:v1 -->
```

Open/closed is the GitHub lifecycle, not readiness. Unknown backlog remains `unranked / needs-triage / release commitment none`. A milestone does not imply `committed`. `running` requires an actual turn/worktree observation and timestamp. Elapsed lease time or a stale chat label is not proof that an owner stopped. A human hold stays `human-hold`; a paused project stays paused. `superseded` names the replacement and preserved output; `cancelled` names the human stop decision and preservation scope.

An author can complete its bounded scope without claiming the whole Issue. Close an Issue only when every original acceptance criterion has passed on applicable integrated evidence. Partial foundations, controlled-only rows and missing genuine runtime remain open. Whole-Issue/Goal acceptance and release decisions remain Planner responsibilities; no automatic closure or Goal completion follows a commit, merge, role ACK or courier receipt.

## Wiki: durable contracts

Planner owns Operating Model, role ownership, Issue contract and roadmap pages. Editor and Workspace own their manuals, APIs, limits and examples. Agree one writer per page; cross-role changes require a named page owner. Link current Issues, exact source versions and receipts; do not duplicate live task tables. Editor and Workspace may publish their own Wiki manuals and contracts within approved responsibility. Check the current remote base and page conflicts, keep one page writer, and verify easylogic <cyberuls@gmail.com> as both author and committer. Planner owns operating, roadmap and cross-role pages. This scoped documentation authority needs no routine Planner relay or technical approval. Product commits remain local.

Keep original/source/native, controlled/genuine runtime, implementation/verification/integration/acceptance/release distinct. Inter-task messages and public work records use English; user responses use the user's language and short, clear ASD-STE100 sentences. A delivery receipt is not recipient acceptance.

## Autonomous work selection and collaboration

Authors choose ready work within approved responsibilities and global `P0 → P1 → P2` priorities after checking current Issues/PRs, active owners, original acceptance, dependencies, exact base and available verification. Record the exact Issue/files/interface lease before editing. No ready owned scope means IDLE; an open Issue, research proposal or unknown backlog is not an assignment. Do not self-activate the frozen #495 authenticated bridge proposal merely because the role changed.

Authors communicate directly for in-scope contracts, questions, evidence, defects and verification. Include Issue/version, exact requested result, prerequisites, file owner and reply destination. Escalate scope/priority/schedule changes, conflicting owners, missing acceptance prerequisites or release blockers to Planner. Do not turn ordinary technical choices into repeated Planner approvals or message relays. Research proposals are connected to existing implementation Issues without duplicate creation or automatic release gates.

| Incoming request | Action |
| --- | --- |
| Emergency stop | Preserve active writes/checks and stop after the nearest safe checkpoint when authority or data is at immediate risk. |
| Switch at safe point | Finish the current atomic save/check/integration boundary, record a checkpoint, then apply the named priority/scope change. |
| Reference information | Preserve current ownership; Planner considers new hypotheses or broader product feedback in direction and planning. |

If classification is unclear, compare the actual human request and current execution state. A courier cannot silently replace an owned scope. Record the human text/time, previous/new scope, order and effective checkpoint when direction changes.

## Scope record, ACK, checkpoint and result

An author records the following before work; Planner supplies it when assigning a cross-role or whole-goal slice. Use an Issue-based versioned ID (for example `wonffice-496/role-operating-policy-v1`). Scope changes name a successor and preserve the predecessor; routine implementation decisions within exact scope need no new approval.

```text
SCOPE id/version | Issue | original human goal/authorization | priority | release commitment
scope | non-goals | dependency | exact base SHA/branch | file/page owner and helper limits
acceptance-to-check mapping | required checks | safe checkpoint | preemption class | record location
ACK id/version | actual worktree/branch/HEAD | dirty/untracked | active producer/duplicate owner
conflicts/blocks | current file/runtime lease | first safe action
```

Use isolated managed `codex/<issue>-<short-name>` worktrees from the exact accepted local integration commit or a separately verified successor. Preserve the human checkout and existing branches. Different worktrees do not isolate ports, DBs, providers, package caches or operator resources. Check actual ownership before sharing them. Base mismatches must be reconciled with Integration before edits; direction conflicts go to Planner.

A checkpoint records Issue/scope, base/candidate/integration SHAs, worktree, dirty/untracked files, active command/PID/PPID/PGID/CWD, criterion PASS/FAIL/NOT RUN, preserved first failures, authority/data risks, next one action and resume conditions. Observe the actual turn/process/branch before transfer or expiry; time alone never grants a replacement lease.

Resume: latest human instructions and Issues/PRs → actual owner/producer observation → worktree diff and exact base → preserved criteria/failures → scope and ownership check → action. If GitHub reads fail, preserve local work and do not invent remote status or create duplicates.

```text
RESULT id/version | change | criterion PASS/FAIL/NOT RUN, command/environment/log
native/source/candidate SHA and tree | first failure and repair | remaining scope/risk
integrated SHA/checks or integration wait | next owner/action | acceptance request
```

`implemented` means code exists; `verified` means named criteria passed on fixed source; `integrated` means exact local integration with checks; `accepted` means the applicable whole scope was accepted; `released` means actual release/operation gates passed. Never promote one into another automatically. Report Developer readiness and whole-product release readiness separately as ready/incomplete/unverified/not applicable. Do not report an unconfirmed handoff or recipient as complete.

## Serial integration and minimum sufficient verification

Authors hand Integration immutable parent-to-child diffs, exact file ownership, candidate SHA/tree, acceptance mapping, first failures and actual check evidence. Integration checks current clean `develop`, fresh Issue/PR ownership and source bindings, then reconciles each delta once. Integrate one candidate at a time. Serialize overlapping files, dependencies and shared browser/API/private PostgreSQL resources. Return semantic conflicts and defects to their file owner; Integration must not silently invent a new product scope.

Before local integration and final release push, run actual `.nvmrc` Node 22.22.0 / pnpm 8.15 `pnpm preflight`: lint, source types, test types and its existing check/documentation stages. Preserve budgets and exclusions; never waive a guard, loosen an oracle, use casts/suppression or raise a budget to pass. Record existing debt and unavailable checks separately. Verify easylogic <cyberuls@gmail.com> as author and committer, no coauthor, and inspect actual commit metadata. Remote writes require authenticated easylogic; do not change global Git settings.

Choose targeted unit/integration/native/browser/recovery checks for actual changed behavior and its adjacent risks. Reuse unaffected fixed evidence only with exact source/environment bindings and named coverage. Do not replay the whole product runtime or immutable caches for monitoring, role ACKs or document-only edits. Started, interrupted, skipped or unrun required checks are not PASS. Preserve a first failure before repair, run the affected checks after changes, and bind final results to the final candidate/integration version.

Relevant product work still requires actual native/auth/current-ACL/PostgreSQL/browser/recovery verification. Static source, compiled source-map binding, controlled fixtures and genuine current login/provider/API/private PostgreSQL/product UI are separate evidence. Native identity, full body/pins/definitions, current authority, fixed retry, late draft, last input/history and zero hidden publish must be checked when affected. A schema server is an independently runnable service, not only a registry library or adapter document.

## Original acceptance and release boundaries

Preserve original Issue acceptance and the Research category registry. Note-first controlled foundations do not accept Note's genuine flow, four products, original #495 eight criteria, Goal13 or external alpha. Alpha still requires actual local PostgreSQL/API/product UI saving and live collaboration on the same candidate: two distinct logged-in users and independent browsers, convergence, reopen/reconnect/browser and server restart persistence, connection/save recovery, per-user undo/redo and structure changes, unauthorized access/permission revocation and exclusion of snapshot overwrite in a shared session. CRUD, browser storage, snapshot conflict handling or adapter documentation alone are insufficient.

#434 remains on human hold; #420 Apply stays unavailable; Yorkie stays paused; mobile QA is off until a new direct request. Physical OS IME is separate from synthetic browser input. Privacy/encryption/backup/installation/operator/release conditions remain incomplete where unverified. Do not activate held product or research work, purchase infrastructure or deploy under this transition. Use existing technical release tracker #322. Planner combines role evidence for whole-product/release decisions.

Until final release, use local commits and serial local `develop` integration. No ordinary product push/PR, direct `develop`/`main` push, force push, automatic merge/deploy or review-policy bypass. At an authorized final release, retain protected `develop` PR and `develop`→`main` release PR procedures, mandatory CI, existing approval/security/environment gates and existing deployment authority. This operating change grants no new publication, deployment or purchase authority.

## First-cycle and weekly outcome

The first-cycle record distinguishes owned-scope wait, duplicate verification, integration/shared-runtime wait, defects, exact candidates/integration checks and complete/incomplete acceptance. Measure actual results before claiming faster delivery. No measured speedup follows this role change alone.

Planner sets one narrow weekly outcome and its check scope. Do not make every Goal or Research Issue a weekly gate. Report accepted scope, exact SHAs/checks, remaining scope and next one action; reuse unaffected fixed evidence where valid.

## Historical protected work

The 2026-10-04 transition recorded #468 active and #479 linked waiting, #407's original Site acceptance/WIP preserved, #434 human-held, #450 local/GitHub acceptance mismatch and #470 foundation versus remaining product i18n. These are historical observations, not current write leases. Read current Issue records and actual Git state before action. The completed #495 readonly proposal and all original frozen evidence remain immutable; qualify adoption separately and do not rewrite them under #496.
