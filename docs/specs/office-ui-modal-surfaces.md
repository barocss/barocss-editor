# Shared UI research: editor surfaces inside modals

Issue: [#331](https://github.com/barocss/barocss-editor/issues/331).
Baseline: `eeb0ab67390b2898e85d8aa1e028ce5b6a993ff2`.

## Observed problem

The Site row drawer embeds Note editors for its summary and body. Typing `/표`
opens the body editor's slash menu. Before this change, the menu was visible but
its central point did not hit the command. The default `FloatingSurface` portal
put it in `document.body`, outside the modal's input boundary. Increasing its
z-index would not repair that ownership boundary.

The desktop regression uses the sample Site, opens its first blog row, types at
the end of the body, and reads `elementFromPoint` before clicking. It does not
force focus, change model selection, override pointer CSS, or dispatch a
synthetic click. On this baseline, filtering by `표` includes the table and
database commands. The earlier issue's single-result observation is not assumed.

## Shared contract

| Layer | Responsibility |
| --- | --- |
| `office-ui` | `FloatingSurface` placement and appearance; explicit `portalRoot` and dismissal ownership. Dialog/Drawer keep their modal input boundary. |
| `office-editor-ui` | `SlashMenu.scope` measures the owned selection and supplies the portal host and owned element to the shared floating layer. It also supplies the editor's hide command for dismissal. |
| `office-note` | Supplies its existing non-editable body wrapper. That wrapper remains inside the row drawer and outside the contenteditable document. |
| Product host | Owns the row, document data, persistence, and available block commands. |

The optional scope follows the existing ContextToolbar convention. A caller
without a scope keeps the body portal. Modal hosts must supply a host inside the
modal, outside the editable region. This is not a global portal search or a new
modal system. `ownedElements` defines dismissal; it does not grant pointer or
focus access to an out-of-modal portal.

The surface retains the editing caret during pointer insertion. Escape hides the
menu first through the existing floating-layer delegation. Tab remains inside
the modal. No global `pointer-events` override or z-index increase is required.

## Evidence and references

- [Wiki UI scope](https://github.com/barocss/barocss-editor/wiki/UX-Research)
  separates shared interaction contracts from product editing logic.
- [Wiki decisions](https://github.com/barocss/barocss-editor/wiki/UX-Decisions)
  prioritize interrupted input and recoverable work before new product UI.
- [Discussion #287](https://github.com/barocss/barocss-editor/discussions/287)
  has no confirmed new customer workflow that would justify expanding this fix.
- [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog)
  documents modal focus containment and the default body portal.
- [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
  describes contained tab navigation and inert background content. These are
  interaction criteria here, not a claim of a complete accessibility audit.

## Validation

Site: `apps/site/tests/note-slash-modal.spec.ts` checks actual hit testing and
coordinate insertion after keyboard scrolling through an overflowing menu,
immediate table input, unchanged summary/body text,
filtered keyboard insertion, menu Escape, modal Tab containment, and background
hit blocking. `note-close.spec.ts` checks existing close/delivery behavior.

Note: `apps/note/tests/slash-scope.spec.ts` checks ordinary pointer insertion and
continued input after Escape. `dollar-slash.spec.ts` checks the existing slash
opening and dismissal lifecycle. Tests run on desktop Chromium with independent
servers, no retries, and failure screenshots/traces. The Site test also saves
menu and result screenshots. Final run results are recorded in the PR.

Integration baseline: `0d97e1f00948aafd27bd6bdf4ac2b9a2f9f51e60`.
The merge retains PR #283's current-item menu scrolling and keyboard behavior
alongside scoped portal ownership and dismissal.

This does not fix table-cell label focus (#332), residual slash table query
text (#343), or the UI documentation audit (#336). Tests use workspace sources;
mobile, OS IME, screen-reader usability, nested modal combinations, transformed
portal hosts, and published npm artifacts are outside this run.

## Next research

Recheck latest main and open PRs before choosing another change. Inspect actual
modal consumers of contextual tools for the same ownership contract. Keep
product-specific field label issues separate. Add a shared abstraction only if
multiple real consumers need the same new behavior; do not duplicate the active
documentation work in #336.
