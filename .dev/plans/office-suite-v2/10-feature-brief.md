---
work_id: office-suite-v2
artifact_type: feature_brief
status: draft
owner_role: Planner
source_request: "Replan the Office suite with an in-house Sheet engine and collaboration from the start."
last_updated: 2026-10-21
source_commit: 034a42c36924bc9a9808847d065e542cb5390c4c
---

# Office suite v2 brief

## Problem and users

People need to author, calculate, review and share documents in one Office workspace. Current prose and scene libraries provide useful foundations. They do not provide a workbook engine, complete collaborative editing or broad Office file compatibility. Extending Note database snapshots into a spreadsheet would retain the wrong mutation and calculation granularity.

## Product direction

Build Note, Word, Slides and **our own Sheet engine** under one workspace and document lifecycle. Our code owns workbook/cell/range models, formula/reference/calculation behavior, grid interaction and collaboration binding. Retain existing Site functionality as a shared-component consumer. Evaluate low-level dependencies separately; do not adopt a third-party spreadsheet product engine.

The canonical technical contract and complete reuse/rework/new matrix are in [Office suite v2 architecture](../../../docs/specs/office-suite-v2.md). The canonical sequence is at the top of [the roadmap](../../../docs/ROADMAP.md). This brief does not duplicate their live task status.

Published tracking: [suite #520](https://github.com/barocss/barocss-editor/issues/520), [M0 #521](https://github.com/barocss/barocss-editor/issues/521), and [M0 milestone](https://github.com/barocss/barocss-editor/milestone/19). The document files remain local and uncommitted.

## Scope

- Shared identity, current permissions, assets, versioned document host, durable collaboration state and recovery.
- Separate prose, page-layout, scene and workbook semantics with one mutation protocol per document.
- Selective current-session undo and stable positions that preserve other sessions' edits.
- Our sparse workbook, reference-aware commands, safe formula engine, Canvas2D viewport and DOM input/accessibility layer.
- Native persistence and bounded DOCX/XLSX/PPTX compatibility, with original preservation and explicit loss/refusal behavior.
- A measured path from small two-client risk probes to actual Office two-account workflows and suite verification.

## Exclusions from the initial profile

Full Microsoft Office parity, VBA/Power Query, unbounded external data, automatic bulk migration, suite-wide distributed transactions, production deployment, licence purchases and resumed historical Work schedules are not bundled into this design task. Existing originals and prior work are preserved. New product scope follows the current human request rather than historical roadmap readiness labels.

## Acceptance for this planning deliverable

- The structure identifies one editable authority per document and separates pending/synchronized/durably saved states.
- Every relevant existing module has a reuse, adapt, legacy-only or replacement boundary.
- The new Sheet model, operations, references, formula calculation, rendering, persistence and collaboration responsibilities are explicit.
- M0 proves prose and Sheet together before later milestones rely on their interfaces.
- Each milestone names dependencies and observable completion evidence. Only bounded M0 execution is eligible for later assignment.
- Engine-native files, interoperability limits, migration safety, access, undo and recovery have explicit contracts.

## Open decisions and handoff

M0 owns the remaining primitive/mapping, structure/reference/conflict, formula semantics, performance budget and file profile decisions. The in-house Sheet choice is final. No implementation is started by writing this brief. Planner scopes actual Issues and owners before dispatch; Integration controls shared roots/configuration and serial runtime checks.
