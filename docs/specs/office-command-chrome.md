# Office menu and toolbar design

Word, Slides, Site and Note share the command UI in `office-ui`. The document canvas and the commands offered remain product decisions.

## Ownership

- `office-ui`: menu/toolbar surfaces, light and dark tokens, button geometry, icon size, hover/pressed/focus/disabled states, popup and tooltip primitives.
- `office-controls`: command and choice declarations.
- `office-editor-ui`: selection retention and contextual control composition.
- Product packages: which tools appear and when; document-specific commands.

## Geometry and appearance

| Element | Shared value |
| --- | --- |
| Toolbar button | 30px high |
| Menu item trigger | 28px high, 32px menu row |
| Command label | 13px, system UI font |
| Control corner | 5px |
| Direct button icon | 16px |
| Ribbon | At least 44px, 6px vertical / 12px horizontal padding |
| Floating toolbar | 6px surface corner |
| Pressed control | Accent wash with accent ink; a stronger wash on hover |

Tokens `--ou-command-height`, `--ou-command-text`, `--ou-command-inset` and `--ou-command-radius` live in `office-ui/tokens.css`. `office-command-surface` is the shared class for a product's document-action header. Do not redeclare `--ou-*` at an app root to give one product's controls another palette. Product canvas tokens such as `--sl-*` may remain separate.

`Toolbar` defaults to the wrapping ribbon surface. `variant="inline"` removes outer ribbon spacing/border for Site's short tool row while retaining the same controls. MenuBar, menu/select popups and FloatingSurface inherit the command geometry. Note retains contextual text tools and uses MenuBar for File/Edit/View page actions.

```tsx
import { MenuBar, Toolbar, ToolbarGroup } from '@barocss/office-ui';

<MenuBar label="Document menus" menus={menus} onPick={runMenu} />
<Toolbar label="Formatting">
  <ToolbarGroup id="text">{textControls}</ToolbarGroup>
  <ToolbarGroup id="paragraph" separated>{paragraphControls}</ToolbarGroup>
</Toolbar>
```

`ToolbarGroup separated` keeps a leading divider inside the group so it cannot wrap away from its controls. Word keeps style, font, history and paragraph controls in these groups. Its collapsed navigation and comments rails use the same shared IconButton: a 30px target, a centered 16px icon, and an 8px top inset.

Use the shared selection-preserving event handlers. A visual adjustment must not move focus away from the document before applying formatting. Do not add a fixed formatting ribbon to Note just to match the other products.

## Verification

Run `pnpm exec playwright test --config test-support/office-chrome/playwright.config.ts` from the repository root. It starts or reuses all four development servers, compares actual computed geometry/palette, checks menu dismissal, checks Note's selected-hover state, captures all four editors in light/dark themes, and checks tool reachability at 820px.

This is a chrome integration check, not full product or release certification. Product suites continue to cover editing and document behavior.

Word icon placement: run `pnpm --dir apps/word exec playwright test tests/chrome-alignment.spec.ts`. It checks all four tabs at 1280px/820px, centered icons, grouped dividers, light/dark pane targets, tooltip bounds and pane open/close behavior.

## Word grouped ribbon

`RibbonTabs`, `RibbonGroup` and `RibbonAction` are exported by `office-ui`. Tabs use the tablist/tab/tabpanel relationship and arrow/Home/End navigation. A group has a 64px command area and a 24px caption/launcher area; a labeled action has a 22px icon in a 60px target. Compact commands retain 16px icons and 30px targets. Word supplies Home/Insert/Layout/Review/View and its command bindings. Other products can adopt these primitives without copying Word CSS or its commands.

Word Home combines font/size and character controls in two rows, paragraph controls, live Body/Heading1/Heading2 preview buttons, and a full style selector. Layout and paragraph launchers call host-owned settings dialogs. Insert opens a configurable table dialog (1–20 columns, 1–50 rows). Table mutation and persistence remain Word's responsibility. The optional `onViewAction` Ribbon callback connects host dialogs/find/print; host actions are disabled when absent.

`ToolbarToggle` preserves selection on pointer down and also handles keyboard/assistive clicks, with one command per activation. Word review controls read the document's tracking state instead of assuming every action is off.

Run `pnpm --dir apps/word exec playwright test tests/ribbon-workflows.spec.ts` for style previews, keyboard invocation, tab navigation, settings launch, table dimensions/save/reload, and tracking/menu state.

## Initial visual pass · 2026-09-13

Historical record. The structural pass below replaces the header arrangement and height in this section.

- `DocumentBar` and `ProductLabel` now supply all four app headers. Note's header spans the workspace rather than starting inside the writing column. Word's document menus share the title row.
- The document bar is at least 44px high. Command controls use 30px targets, 13px type, 16px icons and 5px corners. Forms retain the separate base type scale.
- `PropertyPanel` defaults to the 280px inspector. Dense instruments can still request `compact`. Inspector fields have a neutral background and a visible focus edge.
- Slides chrome aliases the common palette. Word, Slides and Site use the neutral studio background. Selection uses a cobalt wash over the whole target, with a stronger hover state.
- `office-editor-ui/Controls` uses the shared `IconButton` for both host and contextual tools. It retains selection and exposes mixed state. `office-controls` remains the React-free declaration layer; it must not acquire palette or spacing rules.
- Product renderers, paper sizes, content typography and command availability do not change with chrome styling.

Review artifacts are generated in `.dev/artifacts/office-ui/`. Open `index.html` for a four-product view or before/after comparison. Run `pnpm exec playwright test tests/ui-consistency.spec.ts` from `apps/office` to update current screenshots. Use `OFFICE_UI_CAPTURE=before` before changing UI to record the baseline. The capture uses isolated browser storage, 1440×960 and 1024×768 views, plus the system dark theme. No existing user document is replaced.

### Verification for the integrated product pass

- Browser: integrated four-product capture/navigation 1 passed; shared chrome light/dark/820px 2 passed; Note selection formatting 2 passed; Word six ribbon tabs, icon placement and panels at 1280px/820px 2 passed.
- `office-ui` TypeScript and the five-entry Office production build passed. The build still reports large chunks.
- Unit suites: `office-ui` 115/117, `office-editor-ui` 20/21, `office-controls` 66/70. Remaining failures assert old package/dependency inventories or fixed command counts: style-door inventory/import audit (2), editor UI dependency inventory (1), Note mark/Word and Site keybinding counts (4). Those definitions were not changed by this visual pass. They remain open audit maintenance, not a full-suite pass.
- Word geometry checks now measure horizontal icon-plus-label content as one group, and verify vertical history groups on the x axis. Secondary math actions use their computed row layout. Bounds, icon size, tooltip bounds and panel interactions remain checked.

Further work: migrate product-specific bespoke panel rows and complex dialogs as their workflows are reviewed. This pass unifies shared chrome; it does not declare every advanced product screen complete.


## Shared editor structure · 2026-09-13

All four app hosts now compose `office-ui/EditorHeader`. Product code supplies `title`, `menus`, `actions`, and optional `view` slots. The shared component owns the layout:

- Document row: 48px minimum; product at the left, document title in the flexible middle, save state and document actions at the right.
- Menu row: 36px minimum; document menus at the left, optional view tools at the right. Menus do not wrap on desktop; the row can wrap below 760px.
- Title: a 30px slot with 13px semibold text. Word keeps its editable title input. Note, Slides and Site display the current model title.
- `PanelHeader`: a 40px navigation/property/comment heading with actions at the right. Word's expanded outline is 240px, matching Slides and Site navigation. Word comments and the default property inspector use 280px.
- Site and Slides use the same `RibbonTabs` panel variant. Site preserves its `data-rail`, `data-panel` and `data-current` hooks. Labels stay on one line. Arrow keys, Home and End change the active panel and focus together.
- Note navigation uses the same panel surface. Its page filters keep their existing button semantics. No fixed formatting ribbon is added.

The Word ribbon, Slides/Site object tools, and Note contextual tools remain product-specific. Their commands and document renderers remain in their existing packages. `office-controls` still owns command declarations, `office-editor-ui` connects editor selection and commands, and `office-ui` owns these visual primitives.

The comparison page uses `before-structure/` and `after/` captures from real editors. `before/` retains the earlier visual baseline. Captures cover 1440×960, 1024×768 and the system dark theme. The current comparison uses isolated new documents so it does not modify user content.

### Structural verification

- Integrated browser checks: 12 passed (four-product header geometry, title/model identity, actions at 1024px, menus, and 11 workspace persistence/navigation scenarios).
- The updated visual check also verifies Site tab label bounds and ArrowRight/Home/End panel navigation.
- Word: 4 passed for six ribbon tabs, icons and panel controls at 1280px/820px; comment/reply persistence; composition-safe comment submission.
- Site: 2 passed for control targets, labels, contrast and keyboard focus. The selected panel-tab text was strengthened after this check exposed insufficient contrast.
- `office-ui` TypeScript and the Office production build pass. Large-chunk build warnings remain. This does not replace the known inventory-audit limitations above or certify every advanced dialog.

Remaining UI work: migrate bespoke property rows and complex dialogs during their workflow reviews. The common header and panel structure is now implemented; individual advanced screens still need review.


## Workflow density refinement · 2026-09-13

A second visual review found that matching header geometry did not remove unnecessary controls from the writing surface. Note still exposed export-format and page-management forms at all times. Slides had unrelated commands in one long icon strip. Inspector labels were small and frequently truncated.

- Note keeps one-click blank-page creation in the panel header. Template creation, export options and page management now use the shared Dialog. Page-management commands are no longer rendered above the document title. The existing export, hierarchy, favorites and trash handlers remain connected.
- `ToolbarGroup` accepts an optional visible `label`. Captioned groups own their divider. Slides uses these groups in a compact two-row ribbon; insertion and formatting categories stay in one band at 1440px. Context-specific groups still follow the editor selection.
- The common inspector uses 12px field/label text and a 76px label column. Long text labels can wrap at word boundaries; icon labels keep their compact width.
- The comparison page includes a large single-product view. `before-refinement/` contains the immediately preceding UI. The existing user comparison tab was explicitly reloaded; it had retained the earlier 44px-header page.

Verification: Note workflow/exchange/reference scenarios pass after updating the export dialog interaction (18 distinct tests, including a corrected reference-export rerun). Additional Note document-navigation, database, meeting and backup tests: 17 passed. Slides contextual toolbar: 3 passed. Site chrome checks: 2 passed. Four-product visual/geometry check: 1 passed. Office production build passes, with the existing large-chunk warning. These are scoped checks, not full release certification.


## Single application header · 2026-09-13 (current)

This replaces the earlier three-band layout. The integrated workspace no longer prepends a separate navigation root. `EditorHeader` renders one document bar with the current-product workspace menu, document title, product document menus, document actions, and optional view controls. The desktop band is 52px high. Formatting ribbons and contextual tools remain below it.

`registerEditorNavigation(ProductNavigation)` is the host entry point in `office-ui`. It registers a React component before the product mounts; the header passes its product name through `EditorNavigationProps` and renders that component inside the product's React tree. The subscription also supports a changed host and guards against stale cleanup. Standalone product apps leave this slot empty and do not depend on `office-workspace`. Workspace navigation still calls the existing flush contract before leaving an editor.

The workspace menu uses the current app name: Note, Word, Slides or Site. It replaces both the Wonffice trigger and the duplicate product label. It contains 자료함 and 연결한 자료. Product switching remains available through the shared library. File/Edit/Insert/View menus keep each product's existing command handlers. The MenuBar trigger also supports keyboard activation. No placeholder account or sharing actions are added.

At 1440px and 1024px, the header remains one band. At narrower widths, view controls can wrap within their slot; below 700px the header can reflow so commands remain reachable. The visual check also verifies command bounds at 820px.

Verification: workspace persistence/navigation 11 passed; integrated four-product geometry, menu keyboard activation and 820px/1024px bounds 1 passed; host registration/replacement/cleanup unit check 1 passed; `office-ui` TypeScript and Office production build passed. Existing large-chunk warnings remain. The actual Note tab was checked with the Wonffice menu open. Comparison images now use `before-unified-menu/` and `after/`.

Product-name refinement: the integrated header shows the current app name once, as the workspace menu trigger. Standalone editors retain their product label. Four-product browser coverage and workspace navigation: 12 passed; office-ui TypeScript passed. Comparison captures were refreshed.


## Shared ribbon groups · 2026-09-13

Word, Slides and Site use `office-ui`'s `RibbonToolbar` and `RibbonGroup`. Group layout is an explicit `row`, `columns` or `stack` choice. The shared rules own a 64px minimum command body, 24px caption, 8px group side padding, separators and wrapping. Slides no longer has a product CSS copy of the two-row grid. Site uses named editing, arrangement, text, link, current-page and view groups. Word keeps its command tabs; Slides and Site show their smaller command sets directly. Note keeps contextual editing tools and does not gain a permanent ribbon.

The product command models and selection subscriptions remain in `office-controls` and `office-editor-ui` and their product adapters. The ribbon refactor changes layout, not command execution or save behavior. Word style previews fit the common two-row body. Site's page and view controls share the same group captions instead of floating beside its command strip.

Verification: four-product browser geometry and 820px header/ribbon bounds (1); Word ribbon workflows (3); Slides contextual groups (3); Site responsive chrome (3) and insertion picker (2): 12 passed. `office-ui` TypeScript and the integrated Office build passed. The repository-wide TypeScript run still reports errors outside this change, including `packages/devtool/src/auto-tracer/anomaly-detector.ts`; it is not a passing repository-wide gate. Comparison captures use `before-ribbon/` and `after/` at 1440px, 1024px and in dark mode.


## Compact tools by default · 2026-09-14 (current)

This supersedes the always-expanded ribbon above. The suite keeps its 52px app header and uses a 44px single-line command bar in Word, Slides and Site. `RibbonToolbar compact` owns the compact geometry and hides group captions. Menus use the shared MenuBar/Menu with keyboard activation, Escape dismissal and portalled placement. If selection-specific controls exceed the available width, the bar scrolls horizontally instead of growing into a large ribbon.

- Word shows undo/redo, paragraph style, font/size, bold/italic/underline, text colors and alignment. `상세 도구` opens the existing tabbed ribbon; `간단히 보기` returns to the compact bar. Both presentations use the same controls, selection summary and command handlers. The expanded view retains all advanced commands.
- Slides keeps history and insertion commands visible. Slide management and contextual formatting/arrangement/table commands use named dropdowns. Font controls appear only with a text selection summary. The existing right inspector remains available for object properties.
- Site keeps selection mode, insertion and page/view controls visible. Arrangement commands use the 배치 menu. Selected text still exposes text/link controls.
- Note keeps contextual editing and has no fixed formatting ribbon.

Verification: 15 distinct browser checks passed: integrated four-product compact geometry and viewport bounds (1), Word detailed workflows and compact style/undo continuity (4), Slides contextual groups and dropdown insertion (4), Site responsive chrome/insertion (5) and dropdown duplication (1). The Site menu test was corrected to match the short command label separately from its shortcut. `office-ui` TypeScript and the integrated Office app build passed. A repository-wide package build remains blocked by the separate math-editor-prosemirror build expecting a missing math-editor-integrations/dist/shared.d.ts; this is not a full repository build certification. Comparison images use `before-compact/` and `after/`.


## Design-system reference · 2026-09-14

The existing `apps/gallery` now defaults to an interactive system reference. `/design-system/index.html` is also built into the integrated Office host, and `?catalogue` retains the original component inventory. The system contract lives in `packages/office-ui/DESIGN_SYSTEM.md`.

The reference reads CSS token values, displays true selected/mixed/disabled/error states, and includes isolated Word formatting and Slides inspector examples. Their controls use office-ui directly; they are sample-state compositions, not product editor renderers. Theme is set on the document root so portalled menus and dialogs match. TextField now accepts `invalid` and `describedBy`, with a shared danger token and an error border; validation remains the caller's responsibility.

Shared tokens now name header height (52px), compact toolbar height (44px), inspector field height (28px), and spacing steps. Existing product geometry is preserved. Browser verification: gallery states, sample interactions, themes/portals and responsive bounds (3), actual four-product chrome (1), all passed. Gallery TypeScript and the integrated Office production build passed; large-chunk warnings remain. Captures are in `.dev/artifacts/design-system/`. Loading, recovery and complex editor property states remain follow-up work.


### Shared field and menu states · 2026-09-14

PropertyToggle uses a 16px mark inside a 24px native checkbox target. Its paint is separate from field paint. The inspector styles `office-field` rather than every input. Selected, hover, focus and disabled states are checked in light and dark themes. ChoiceSelect and Menu reserve a check column and use 30px minimum rows. The gallery and the four-product browser check cover these changes; the latter also toggles an actual Slides object's lock. Narrow viewports with many selected-object commands remain a separate scroll/reachability review.


### Button family · 2026-09-14

Button, IconButton, ToolbarToggle and dialog close controls share office-button paint. FIELD_CONTROL marks editable fields; generic CONTROL must not classify actions as fields. Accent ink is preserved on hover and press across neutral surfaces, inspectors and dialogs. Small icon targets are 24px with 14px icons. Normal icons are 16px. DialogButton forwards native attributes and events through Button. The button gallery covers these states and native form submission. Nine scoped browser tests passed, including the four-product comparison.
