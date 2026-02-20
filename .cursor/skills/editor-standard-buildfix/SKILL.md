---
name: editor-standard-buildfix
description: "Do focused fix passes for editor build/test failures with smallest safe change."
---

# Editor Standard Build Fix Skill

## Purpose

Apply targeted fixes for build/test issues affecting the editor packages without broad refactors.

## When to Activate

Use when a test or build failure appears and requires safe correction before continuing feature work.

## Workflow

1. Reproduce the failure and isolate the exact package.
2. Inspect error surface and expected contract.
3. Apply minimal patch and run the minimal test command.
4. Verify no unrelated behavior changed.

