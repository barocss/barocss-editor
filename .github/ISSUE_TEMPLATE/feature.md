---
name: Feature (model / extension / E2E)
description: Add a new feature (operation, command, E2E). Agent can use this to branch, implement, and open a PR.
title: "[Feature] "
assignees: []
---

## What to add

- **Name**: (e.g. `insertList`, `wrapInBlockquote`)
- **Scope**: model only / model + extension / model + extension + E2E
- **Brief**: One sentence describing the behavior.

## Layers to touch (agent checklist)

- [ ] datastore (if needed)
- [ ] model: operation + DSL + exec test
- [ ] extension: command (+ keybinding if needed)
- [ ] E2E: `apps/editor-react/tests/<feature>.spec.ts` (or editor-test)

## Verification (agent runs before opening PR)

1. `pnpm --filter @barocss/model test -- test/operations/<name>.exec.test.ts`
2. `pnpm --filter @barocss/model test:run`
3. `pnpm --filter @barocss/extensions test:run` (if extension added)
4. `pnpm test:e2e:react` (if E2E added)

Ref: `.cursor/AGENTS.md` § Verification by scenario → New feature.
