---
name: Bug fix / behavior change
description: Fix a bug or change behavior in one or more layers. Agent can use this to branch, fix, and open a PR.
title: "[Fix] "
assignees: []
---

## What is wrong or what to change

- **Brief**: One sentence (e.g. "insertParagraph selectionAfter.nodeId must be a text node").
- **Package(s)**: (e.g. model, extensions)

## Steps to reproduce (if bug)

1. (e.g. Focus paragraph, press Enter, type)
2. Expected: (e.g. caret in new paragraph)
3. Actual: (e.g. caret in block node, typing fails)

## Verification (agent runs before opening PR)

1. `pnpm --filter @barocss/<package> test:run` for each touched package
2. Add or adjust tests so the new behavior is asserted
3. `pnpm test:e2e:react` (no new failures; add E2E for the bug if needed)
4. Manual: reproduce the scenario in browser, confirm fix

Ref: `.cursor/AGENTS.md` § Verification by scenario → Bug fix.
