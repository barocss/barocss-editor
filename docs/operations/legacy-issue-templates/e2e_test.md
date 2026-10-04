---
name: E2E test only
description: Add or update E2E tests only (no new model/extension code). Agent can use this to branch, add spec, and open a PR.
title: "[E2E] "
assignees: []
---

## What to cover

- **Feature or flow**: (e.g. toggleBold, insertParagraph at end of heading)
- **App**: editor-react (port 5175) / editor-test (port 5173)

## Verification (agent runs before opening PR)

1. `pnpm test:e2e:react` or `pnpm test:e2e`
2. If app initial content or DOM changed, update spec selectors/assertions to match

Ref: `.cursor/AGENTS.md` § Verification by scenario → E2E-only.
