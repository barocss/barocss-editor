# Note editing scenarios

Tracking: [#282](https://github.com/barocss/barocss-editor/issues/282).

## Purpose and scope

Test the editing contract through real browser input: initial document, user action,
expected document, and expected selection or visible UI. Command-level tests remain
useful, but they cannot replace pointer, keyboard, focus, and scrolling checks.

This first suite covers basic input and the reports in #278–#281. It is not a claim
that every Note feature or the whole existing Note browser suite passes.

## Hosts

`apps/note/scenarios.html` mounts the public `openNoteTree` and `NoteEditor` APIs.
It does not use workspace storage, existing notes, or editor command injection.
Each test receives a new browser context and in-memory document.

- `standalone`: a wide desktop host with 600px minimum outer height.
- `embedded`: a real 520px-high iframe with a content-sized editor and outer padding,
  similar to the documentation preview. The editor itself is not forced taller.

Both hosts load the same package styles and source packages. These are controlled
integration fixtures, not tests of the complete Note workspace or the deployed
Docusaurus page. Published npm artifacts and documentation builds need a separate
consumer check. Viewport is desktop-only (1280 × 900).

## Scenario catalogue

| ID | Initial state and action | Expected result | Issue |
| --- | --- | --- | --- |
| N-001 | Empty paragraph; type two trailing spaces, delete a character, type again | Spaces and text persist; one paragraph remains | Baseline |
| N-002 | Type `/`; Escape; move caret away and back | Menu stays closed; slash remains text | Baseline |
| N-278 | Type `/`; move down and up through every menu item | Active item stays inside the menu's scroll area | #278 |
| N-279 | One paragraph; open `+`; move pointer outside the short editor onto a menu item; click | Menu remains reachable and inserts the chosen block | #279 |
| N-280a | Empty paragraph; choose heading through `+`; type a title | One heading, no extra empty paragraph | #280 |
| N-280b | Empty paragraph followed by heading; Home then Backspace | Gap removed; next input lands at the heading text start | #280 |
| N-281 | Paragraph, divider, paragraph; select divider; Delete; Undo | Node selection; only divider removed; Undo restores it | #281 |

Tests use actual keyboard and mouse actions. A read-only fixture diagnostic returns
`exportDocument()` and the current model selection. It cannot be used to edit.
Menu checks compare the selected item's bounds with its scroll container, not only
with the browser viewport. Each regression links to its issue in the report.

## Run locally

Use the Node version in `.nvmrc`, then install from the lockfile:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test:e2e:note:scenarios
```

Run one scenario or the baseline set:

```sh
pnpm --filter @barocss/app-note test:e2e:scenarios --grep N-278
pnpm --filter @barocss/app-note test:e2e:scenarios --grep @smoke
pnpm --filter @barocss/app-note exec playwright show-report playwright-report/scenarios
```

The runner starts its own server on `127.0.0.1:5293`. It fails if the port is busy;
it never silently reuses a developer's server. It has one worker and no retries,
so a failed initial attempt cannot become a green result through retry.

For manual inspection, start Vite on an unused port and open
`/scenarios.html?host=embedded&case=empty` or
`/scenarios.html?host=standalone&case=divider`.
Available initial cases: `empty`, `text`, `heading-gap`, `divider`.

## CI and evidence

The `E2E (Note editing scenarios)` CI job runs all scenarios on every pull request
and main push. It uses the lockfile and `.nvmrc`. It uploads an HTML report and JSON
results, plus document/selection snapshots, screenshots, video, and traces for failed tests, for seven days.
A job check does not automatically create a branch-protection requirement; repository
rules must be configured separately when the suite is ready to gate merges.

Known regressions are normal failing assertions, not skipped tests or expected
failures. The initial PR remains draft while these failures are unresolved. Do not
add `continue-on-error`, loosen assertions, or mark the suite ready to hide product
bugs. Fix the linked product issues, rerun the suite, and then promote the PR.

## Initial local result — 2026-09-20

Desktop Chromium on macOS, based on main `3b839784`: **8 passed, 6 failed**.
No tests were skipped or retried.

| Scenario | Standalone | Embedded |
| --- | --- | --- |
| N-001, N-002 | Passed | Passed |
| N-278 | Failed: active row remains outside menu scroll bounds | Same failure |
| N-279 | Passed for pointer movement to the visible quote item | Passed for the same path |
| N-280a | Failed: document contains paragraph + heading | Same failure |
| N-280b | Failed: two blocks remain after Backspace at verified heading start | Same failure |
| N-281 | Passed for a divider between two paragraphs, Delete and Undo | Passed for the same path |

The N-279 and N-281 results do not close those issues. Menu paths at other scroll
positions and native caret rendering at first/last/only dividers still need exact
reproduction. The six failures are product assertions, not fixture startup errors.
The CI Linux result is a separate run and must not be inferred from this result.

## Expansion and limits

Next coverage groups: first/last/only atomic block, arrow navigation, Backspace and
Redo, slash-based heading insertion, existing-text preservation, range deletion,
paste boundaries, formatting, tables, math, and save/reload in the workspace.
Add those as explicit scenarios with initial states and observable outcomes.

Actual OS-level Korean IME behavior still requires real input checks. Synthetic
composition events and inserting completed Korean text are not equivalent to a
user composing text with an IME. Browser-engine and platform expansion should be
recorded separately. Mobile layout testing is out of scope.
