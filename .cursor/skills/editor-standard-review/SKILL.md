---
name: editor-standard-review
description: "Run a focused review for editor API, selection, history, and extension behavior against the standard."
---

# Editor Standard Review Skill

## Purpose

Validate correctness and consistency in editor code paths with an emphasis on edge cases that typically break editors.

## When to Activate

Use after implementing feature changes or before merge for model/selection/history related files.

## Workflow

1. Read changed files and list assumptions made by each change.
2. Check event ordering, source flags, and side effects.
3. Verify null/invalid selection and remote mutation guards.
4. Cross-check selection, content, and history behavior in tests.
5. Report severity-ordered findings and minimal fixes.

## Focus Areas

- `selection.model` payload shape and filtering
- `model`/`view` boundary consistency
- history restoration and selection restoration
- extension lifecycle and hook interactions

