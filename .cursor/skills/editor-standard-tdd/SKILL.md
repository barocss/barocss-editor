---
name: editor-standard-tdd
description: "Enforce test-first workflow for editor standards and regression coverage."
---

# Editor Standard TDD Skill

## Purpose

Keep editor changes safe by writing a failing test first and only then implementing minimal code.

## When to Activate

Use whenever adding or changing command, history, selection, or conversion behavior.

## Workflow

1. Write the smallest failing test for the exact behavior.
2. Run tests and capture the failing assertion.
3. Implement only what is required to pass.
4. Re-run the relevant suite and keep the regression set green.
5. Add one follow-up test if behavior could regress across view implementations.

## Test Priority

- `packages/editor-core/test/*.test.ts`
- `packages/editor-view-dom/test/**/*.test.ts`
- `packages/editor-view-react/test/**/*.test.ts`

