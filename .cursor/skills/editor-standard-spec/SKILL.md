---
name: editor-standard-spec
description: "Build and validate a rigorous editor specification before implementation."
---

# Editor Standard Spec Skill

## Purpose

Create and enforce a concise, testable specification for editor-core and editor-view behavior.

## When to Activate

Use when starting a new editor feature, changing command semantics, selection policies, or protocol/event contracts.

## Workflow

1. Define scope and invariants (document model, selection, history, command lifecycle).
2. Convert each invariant into acceptance criteria with explicit test cases.
3. Align naming, payload shapes, and remote/local semantics.
4. Add or update test cases before implementation.
5. Summarize expected behavior and open gaps.

## Output

- Invariants list by module (`editor-core`, `editor-view-dom`, `editor-view-react`).
- Event and command contract table.
- Acceptance checklist mapped to test file paths.

