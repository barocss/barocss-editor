# Composite editor labels and focus

Issue: [#332](https://github.com/barocss/barocss-editor/issues/332).
Reproduction baseline: `eeb0ab67390b2898e85d8aa1e028ce5b6a993ff2`.
Integration base: `0d97e1f00948aafd27bd6bdf4ac2b9a2f9f51e60` (PR #283).
Owner: Design Engineer. This records a UI fix, not product release readiness.

## Finding

Site RowForm wrapped every field in a native label. A rich-text field contains a
Note editor, table handles, and other buttons. After clicking a table header cell,
the browser selection could be in that cell while focus moved to the table's
selection button. Real typing and editing shortcuts then had the wrong target.

The baseline regression records the active element and the label's control after
a real cell click. Its editing-focus assertion fails. Direct text insertion is
not sufficient evidence here: it can update the selected text without exercising
the keyboard focus path. The final test uses individual keyboard events for all
ASCII cell input and for undo/redo. Korean slash filtering uses text insertion;
OS IME behavior is not tested.

## Contract and change

| Layer | Responsibility |
| --- | --- |
| `office-ui` | Controls own their accessible names. Layout groups must not turn several controls into one implicit label target. |
| `office-editor-ui` / Note UI | Keep the distinction between editing the cell and explicitly selecting the table. No new focus override is added to these layers. |
| Site RowForm | Render rich-text fields as named groups. Connect the visible field name through a unique `aria-labelledby` ID. Keep ordinary fields as native labels. |

The change uses the existing layout and controls. It does not add another field
primitive, change table selection commands, or intercept clicks. The group name
is the field name; the visible type hint remains alongside it.

This follows the existing PropertyRow rule in the shared design system and the
[Wiki's shared UI boundaries](https://github.com/barocss/barocss-editor/wiki/UX-Research).
The [HTML label specification](https://html.spec.whatwg.org/multipage/forms.html#the-label-element)
defines a label's association with a labelable control. A whole composite editor
is not a single such control. The broader customer workflow in
[Discussion #287](https://github.com/barocss/barocss-editor/discussions/287) remains
unconfirmed and does not change this fix's scope.

## Verification and limits

`apps/site/tests/note-table-focus.spec.ts` uses the actual Site row drawer:

- Insert a table with the existing slash keyboard path, then type in its first cell.
- Click another header cell once and type. Undo and redo that input.
- Click a body cell once and type, then wait for automatic saving and reload.
- Reopen the same URL and row, confirm saved cells, and edit another cell.
- Compare the summary and all exported content outside the edited body. Ignore
  only runtime SIDs and load timestamps, which are recreated when loading.
- Keep a different Site document open in another tab, then reload and compare
  its complete content and URL to confirm the input did not reach that document.
- Check the accessible group names, ordinary label focus, and explicit table selection.

Existing `note-close.spec.ts` and `prose-note.spec.ts` cover final input delivery,
checkbox/disclosure controls, and reopening a row. Final pass counts and preflight
results are recorded in the PR. Desktop Chromium, workspace source, and synthetic
sample documents define the validation scope. Mobile, OS IME, screen-reader
usability, other browsers, and published npm artifacts remain unverified.

PR #339 changes empty rich-text creation in the same host file; inspect both
changes when integrating. PR #340 fixes slash pointer access separately. This
regression deliberately uses keyboard insertion and does not depend on either
unmerged PR. PR #283's menu and heading changes were merged during this work;
the final validation includes that main commit. PR #323 remains the separate
recent-library focus work.

Next owner: code reviewer for integration and CI, then QA for the release's
supported browser matrix. Product Master PM keeps overall release status in
[#322](https://github.com/barocss/barocss-editor/issues/322).
