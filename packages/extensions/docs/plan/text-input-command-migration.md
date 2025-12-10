# Text Input Command Migration Plan

## Overview

Migrate text input handling to commands instead of relying on `beforeinput` + DOM manipulation. This document outlines the target commands, what to remove from the old flow, and how to wire the view layer.

---

## Goals

1) Make text insertion/deletion fully command-driven (model-first).
2) Remove legacy DOM mutation during `beforeinput`/`input` events.
3) Preserve compatibility with composition events (IME) and clipboard flows.

---

## Current (legacy) flow (to be removed)

- `beforeinput` handler mutates the DOM directly on `insertText`/`insertFromPaste`/`deleteContent`.
- After DOM change, mutation observers reconcile back to the model.
- This causes double work, timing issues, and inconsistent selection states.

---

## Target command set

### TextExtension
- `insertText`
  - Input: `{ selection, text }`
  - Behavior: insert text at selection (range or collapsed)
- `deleteText`
  - Input: `{ range }`
  - Behavior: delete text within a single node
- `deleteSelection`
  - Input: `{ selection }`
  - Behavior: delete current selection range (single or cross-node)
- `backspace`
  - Input: `{ selection }`
  - Behavior: backward delete (delegates to deleteSelection/deleteText/deleteCrossNode)
- `delete` (forward delete)
  - Input: `{ selection }`
  - Behavior: forward delete (delegates similarly)

### DeleteExtension
- `deleteNode`
  - Input: `{ nodeId }`
  - Behavior: delete an entire node
- `deleteCrossNode`
  - Input: `{ range }`
  - Behavior: delete text across nodes

### ParagraphExtension
- `insertParagraph`
  - Input: `{ selection }`
  - Behavior: split/insert paragraph (replaces legacy Enter handling)

---

## View layer changes (editor-view-dom)

### Key idea
- Do NOT mutate DOM in `beforeinput`.
- Convert DOM selection → model selection.
- Call commands; let transactions mutate the model; let render sync DOM.

### InputHandler changes
- For `beforeinput`/`input` types involving text/paragraph/deletion:
  - Compute model selection from DOM selection.
  - Dispatch the appropriate command (`insertText`, `delete`, `backspace`, `insertParagraph`).
  - Prevent default to avoid DOM-side edits.
- For composition events:
  - Let composition text flow through, then convert to model operations at compositionend (phase 2 plan).

---

## Event → Command mapping (phase 1)

| DOM `inputType`                  | Command                     | Notes |
|---------------------------------|-----------------------------|-------|
| `insertText`                    | `insertText`                | Use `event.data`; if null (e.g., emoji), treat as empty string or skip |
| `insertFromPaste`               | `insertText` (temp)         | Later, route to paste pipeline; for now, plain text paste via insertText |
| `insertParagraph` / `insertLineBreak` | `insertParagraph`      | Map Enter/Shift+Enter appropriately |
| `deleteContentBackward`         | `backspace`                 | Backward delete; command decides range/node |
| `deleteContentForward`          | `delete`                    | Forward delete |
| `deleteWordBackward/Forward`    | `backspace`/`delete`        | Later: add word-boundary logic; for now, treat as single-char |
| `deleteHardLineBackward/Forward`| `backspace`/`delete`        | Same as above |

---

## Removing legacy DOM mutation

- Remove direct DOM edits inside `beforeinput` and `input` handlers.
- Ensure mutation observers are not used to drive model updates for text insertion/deletion.
- Keep mutation observers for non-text structural changes detection only (if needed), or remove entirely once command flow is stable.

---

## Selection handling

- Always convert DOM Selection → ModelSelection before dispatching commands.
- After command/transaction, use `selectionAfter` to update DOM selection (via SelectionHandler).
- Ensure collapsed vs range is preserved.

---

## Composition (IME) considerations (phase 2)

- Phase 1: keep existing composition handling; avoid DOM mutations for non-composition inputs.
- Phase 2: add model-first composition pipeline:
  - Track composition text in model or a transient buffer.
  - Apply at compositionend as operations.
  - Avoid double-insertion.

---

## Migration steps

1) Add/ensure commands exist (`insertText`, `deleteText`, `deleteSelection`, `backspace`, `delete`, `insertParagraph`, `deleteNode`, `deleteCrossNode`).
2) Update InputHandler to prevent default for text/paragraph/delete inputTypes and dispatch commands with model selection.
3) Remove DOM mutation in `beforeinput`/`input`; rely on transactions to update the model and render.
4) Verify selection sync via `selectionAfter`.
5) Tests: add unit tests for commands; integration tests for InputHandler event → command → transaction → render.

---

## Open questions / later work

- Paste handling: route `insertFromPaste` to paste pipeline instead of `insertText`.
- Word-wise delete (`deleteWordBackward/Forward`): add word-boundary logic.
- Hard-line delete: map to paragraph or block-merge logic as needed.
- Composition model-first rewrite (phase 2).
