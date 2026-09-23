# Documentation contract and implementation audit

Issue: [#285](https://github.com/barocss/barocss-editor/issues/285).
Initial source review: `558714a818ae8f0dcffc8436d8e7e30a66c93442` (main, 2026-09-20).
Integration review: `895f0cf20582ccfe5aa0d797121740befa825365` (main, 2026-09-20). Extension registration, product factory composition, Note session delivery, and transaction hooks were checked again on this baseline.

## Responsibility

Document implemented behavior and its limits. Runtime fixes belong in their own implementation issues and PRs. Documentation can identify a defect without presenting a pending fix as released behavior.

- Package README: English installation, public entry points, complete examples, lifecycle, customization, limitations.
- Public Docs: cross-package concepts, product integration, runnable examples, and navigation to canonical package guides.
- Specifications: design contracts, evidence, implementation status, and remaining work.
- Package manifests: exports, versions, and dependency requirements.

Generated package pages reuse README content. Do not maintain a second copy. Follow [documentation architecture](../documentation-architecture.md) for generation and deployment.

## Verified source map for this pass

| Claim | Implementation evidence | Existing behavior tests / review scope |
| --- | --- | --- |
| Extension objects, lifecycle, command registration and removal | `packages/editor-core/src/types.ts`, `packages/editor-core/src/editor.ts` (`use`, `unuse`, `registerCommand`, `on`, `off`) | Source review; core example compiles through the package consumer check |
| Transaction interception occurs in the builder | `packages/model/src/transaction-dsl.ts`, `packages/model/src/transaction.ts` | Distinguish builder hooks from direct store access |
| Bold/italic require instances | `packages/extensions/src/bold.ts`, `packages/extensions/src/italic.ts` | README example corrected from constructors to instances |
| Minimal schema includes bold and italic | `packages/schema/src/standard-schema.ts` | Renderers remain a separate requirement |
| Product extensions append; kit replaces | `packages/office-{note,word,slides,site}/src/*-kit.ts` | Word factory assertions in `packages/office-word/test/word-kit.test.ts`; all four factory bodies inspected |
| Note convenience session has narrower options | `packages/office-note/src/session.ts` | `packages/office-note/test/session.test.ts`; source review of delay, flush, close, and callback shape |
| Slides/Site factories install content resolution outside the kit | `packages/office-slides/src/slides-kit.ts`, `packages/office-site/src/site-kit.ts` | Source review; not a new guarantee for arbitrary custom schemas |
| Renderers and browser editing views are distinct | Renderer/view README public examples and exports | No claim of server-side compatibility for all product root imports |

Tests named here are evidence locations, not a claim that this documentation pass reruns every product suite. Record executed validation in the PR.

## Published guidance in this pass

- Core command example: register, transact, inspect result, undo, dispose.
- Core and extensions README lifecycle and collision behavior.
- Four product README customization boundaries.
- Model README transaction entry-point distinction.
- Public extension guide and Office integration navigation.

No runtime code, package versions, release policy, or application behavior changes are part of this documentation change. The integration baseline already includes PR #277 (DOM/React formatting examples), PR #283 (Note menu/heading fixes), and PR #333 (API execution foundation). Their implementation and release evidence remain separate from this guide.

## Remaining documentation work

| Area | Next evidence needed | Completion criterion |
| --- | --- | --- |
| Schema and editing policies | Public definitions, validation, paste/drop planners, supported paths | Valid and rejected examples with current schema; separate policy design from executed behavior |
| Product feature inventories | Commands, UI entry points, native codecs, import/export tests | Per-product supported/limited/planned table with tested workflows |
| Shared Office UI | Public components, state and focus contracts, styling sources | Complete consumer recipes for controls, selection tools and overlays |
| Selection and history | Current model variants, transaction mapping, browser boundary cases | Current API examples and explicit keyboard/IME limits |
| Collaboration and persistence | Adapter behavior, providers, storage contracts | Separate client adapters from backend and authorization responsibilities |
| Legacy deep API pages | Compare each page with public declarations and execution | Remove reference-status notices only after that page is verified |

## Verification rules

Run documentation coverage and static-site link checks. Compile new complete snippets against packed public libraries. Exercise new behavioral examples and inspect new navigation in a desktop browser. Run repository preflight before pushing. Do not claim mobile or OS IME coverage from these checks.

A successful site build is not a deployment. A README change is not an npm release. State the source version, validation, PR status, and deployment state separately.
