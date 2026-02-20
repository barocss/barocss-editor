---
name: editor-standard-uiux
description: "Validate editor UI/UX behavior for interaction consistency across DOM and React views."
---

# Editor Standard UI/UX Skill

## Purpose

Ensure parity of interaction behavior between DOM and React editor views.

## When to Activate

Use when adjusting handlers, key interactions, drag/drop, selection UX, or keyboard behaviors.

## Workflow

1. Compare behavioral expectation across `editor-view-dom` and `editor-view-react`.
2. Verify event sequence and timing assumptions.
3. Check accessibility basics (focus, blur, keyboard navigability).
4. Add parity/regression tests where one view diverges.

