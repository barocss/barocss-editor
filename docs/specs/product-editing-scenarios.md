# Product editing scenarios

Issue #303 connects selected desktop journeys to native Playwright JSON/HTML and CI artifacts. The selection is in `scripts/product-scenarios/manifest.json`; IDs refer to user outcomes, not declaration counts. The baseline is protected develop `45cf09729ed6a70ec89ac0f10346afe0a45837c4`. This baseline is historical comparison evidence; each run also records its actual Git commit/tree, source fingerprint, selected test hashes and GitHub SHA.

## Running the selected journeys

Use `.nvmrc` Node 22.22.0, pnpm 8.15.0 and `pnpm install --frozen-lockfile`. Install Chromium with `pnpm exec playwright install --with-deps chromium` on Linux. Run one product at a time locally:

```sh
pnpm test:e2e:word:scenarios
pnpm test:e2e:slide:scenarios
pnpm test:e2e:site:scenarios
pnpm test:e2e:office:scenarios
```

The runner owns ports 5410 (Word), 5411 (Slides), 5412 (Site) and 5413 (Office). It refuses existing servers, uses fresh browser contexts, one worker and zero retries. Stop only a server you own; a port collision is a failed run, not permission to terminate another user's process. Default case budgets remain 30 seconds for Word/Slides/Site and 45 seconds for Office. The four existing new-slide cases retain their existing 60-second override; this is not an increased failure budget. Server startup remains 60 seconds. CI gives each product its own VM and preserves the existing jobs, required aggregate checks, triggers and protections.

Every scenario's manifest entry contains its exact test file/title, interaction/preparation, expected outcome, reproduction steps and connected Issues. New contexts contain only synthetic documents and sample content. Word uses real file/new confirmation, native selection/format/table/comment gestures, same-ID reload and independent downloaded DOCX XML assertions. Slides uses native new-slide input, previous-slide preservation, undo/redo, reload, presentation and downloaded deck comparison. Site uses native body input and new-page/path authoring, save/reopen and actual HTML/ZIP content/path verification. Office uses all four identities, native final input before navigation, trash restoration and an independently edited backup copy. Existing Note/Word navigation fault controls are included only for the workspace flush boundary; the Note scenario job itself is unchanged.

## Selected outcomes

| Product | Stable scenario ID | User result |
|---|---|---|
| Word | `WORD-FORMAT-REVIEW-UI-001` | exact selected text bold/font-weight700; exact comment anchor and body persist after save-status and same-ID reload |
| Word | `WORD-TABLE-DOCX-UI-001` | new ID; body plus 2 edited cells retained at same ID after reload; DOCX XML includes exact body/cell text and 1 table, 2 rows, 8 cells |
| Slides | `SLIDES-NEW-SAMPLE-0000` | new active slide holds STABLECASE once; all previous complete slides unchanged; undo/redo and persisted reload preserve ordered content and formatting; actual downloaded deck equals the complete persisted document including resources and has the marker exactly once |
| Slides | `SLIDES-NEW-SAMPLE-9000` | new active slide holds STABLECASE once; all previous complete slides unchanged; undo/redo and persisted reload preserve ordered content and formatting; actual downloaded deck equals the complete persisted document including resources and has the marker exactly once |
| Slides | `SLIDES-NEW-BLANK-0000` | new active slide holds STABLECASE once; all previous complete slides unchanged; undo/redo and persisted reload preserve ordered content and formatting; actual downloaded deck equals the complete persisted document including resources and has the marker exactly once |
| Slides | `SLIDES-NEW-BLANK-9000` | new active slide holds STABLECASE once; all previous complete slides unchanged; undo/redo and persisted reload preserve ordered content and formatting; actual downloaded deck equals the complete persisted document including resources and has the marker exactly once |
| Slides | `SLIDES-PRESENT-TRANSITION-001` | actual incoming-slide opacity below1 during transition then full opacity with transition inline style removed |
| Slides | `SLIDES-DECK-DOWNLOAD-001` | filename, format/version and session-id-free actual file JSON |
| Site | `SITE-BODY-EMPTY-UI-001` | Exact body and distinct summary survive autosave/reload; other records/resources unchanged |
| Site | `SITE-BODY-NEW-ROW-UI-001` | New row/title/body/summary survive autosave/reload; original rows/resources unchanged |
| Site | `SITE-BODY-META-SAVE-UI-001` | Final authored body in actual saved file; focus/selection preserved; local undo and reopen preserve body |
| Site | `SITE-BODY-CONTROL-SAVE-UI-001` | Same final save-file/reopen result for Control+s |
| Site | `SITE-HTML-DOWNLOAD-UI-001` | Actual index.html includes expected current-page content |
| Site | `SITE-ZIP-PATHS-UI-001` | CRC-checked ZIP contains expected home/product HTML plus sitemap/robots at correct paths |
| Site | `SITE-AUTHORED-MULTIPAGE-OUTPUT-UI-001` | Final key input survives explicit save and same-ID reopen/reload, actual HTML plus ZIP have authored home/second page content only at index.html and jepum/index.html |
| Office | `OFFICE-IDENTITY-FOUR-001` | All four product documents reopen at their original distinct URLs/IDs |
| Office | `OFFICE-WORD-NAV-LAST-001` | Final native input survives navigation into another product and reopening the exact original URL; injected storage failure blocks navigation and preserves pending Word input where selected |
| Office | `OFFICE-NOTE-NAV-LAST-001` | Final native input survives navigation into another product and reopening the exact original URL; injected storage failure blocks navigation and preserves pending Word input where selected |
| Office | `OFFICE-BACKUP-INDEPENDENT-001` | Downloaded backup contains original ID/content; restored copy has a distinct ID, opens with original text, and can be edited independently while original remains unchanged after reload |
| Office | `OFFICE-SLIDES-TRASH-EXCLUSION-001` | Trashed document excluded from ordinary library |
| Office | `OFFICE-SLIDES-TRASH-RESTORE-001` | Stale trash target is rejected; B unchanged; backup A available; restoring A reopens its exact original identity |
| Office | `OFFICE-WORD-TRASH-EXCLUSION-001` | Trashed document excluded from ordinary library |
| Office | `OFFICE-WORD-TRASH-RESTORE-001` | Stale trash target is rejected; B unchanged; backup A available; restoring A reopens its exact original identity |
| Office | `OFFICE-SITE-TRASH-EXCLUSION-001` | Trashed document excluded from ordinary library |
| Office | `OFFICE-SITE-TRASH-RESTORE-001` | Stale trash target is rejected; B unchanged; backup A available; restoring A reopens its exact original identity |
| Office | `OFFICE-SLIDES-NAV-LAST-001` | Final native input survives navigation into another product and reopening the exact original URL; injected storage failure blocks navigation and preserves pending Word input where selected |
| Office | `OFFICE-SITE-NAV-LAST-001` | Final native input survives navigation into another product and reopening the exact original URL; injected storage failure blocks navigation and preserves pending Word input where selected |

## Report and acceptance contract

Each product writes these fixed generated paths; the runner removes only its previous generated reports before a fresh run:

- `apps/<product>/test-results/scenarios/results.json`: native Playwright report, matching the Note job's reporting format.
- `apps/<product>/test-results/scenarios/scenarios.json`: stable IDs, baseline/current source identities, environment/command, expected/actual verdicts, attempts and diagnostic attachment locations.
- `apps/<product>/playwright-report/scenarios/index.html`: native human-readable report, with attachment data.
- `apps/<product>/test-results/scenarios/artifacts/`: selected download/identity diagnostics and failure trace, screenshot and video.

`<product>` is `word`, `slide`, `site` or `office`. Native failure errors stay in `results.json`; `scenarios.json` also records any report-integrity failure. A successful run requires each selected file/title exactly once on desktop Chromium, one passed attempt, retry zero, no skipped/expected-failure/flaky/unselected results, a successful browser process, a native HTML report and unchanged source/Git state during execution. A missing or partial report fails. Listing/filter/retry CLI flags are refused by the acceptance runner. Report tests cover omission, misidentification and non-accepting statuses; a test listing is not a browser pass.

CI uploads `<product>-scenario-results-<github.sha>` after success or failure, unless cancelled. Missing artifact files fail upload. For Issue closure, inspect each completed CI job's executed command and download the artifacts. Read native JSON totals and all per-case outcomes; open HTML and check bounded final/download diagnostics. Compare GitHub SHA, candidate source fingerprint and stable IDs across the four products. Local execution, empty reports or skipped jobs do not satisfy the remote artifact criterion. No branch-protection check is added by this task.

## Limits and retained failures

These journeys verify local IndexedDB and native ASCII desktop Chromium behavior. Site Meta/Control save tests deliberately hold timers; Office Note flush holds delivery/autosave timers; Office Word storage failure injects IndexedDB errors. Sample initial models and read-only model comparisons are described in the manifest and do not count as native authoring. Site ZIP inspection uses Python's standard-library parser. Word uses an independent ZIP decoder and the browser's namespace-aware XML parser for DOCX. No private debugger state or production model mutation is introduced.

The baseline evidence remains separate from candidate results. Word's initial zero-test command selection error and the first missing new-document confirmation are retained; Office's first external-config startup failure is retained. Their subsequent source-justified harness corrections are not product fixes. Baseline runs cover 24 cases; three newly required Office/Site journeys bring the final selection to 27 cases. Declaration inventories are factual counts, not run results.

Remote completion remains unconfirmed until protected checkpoint execution and downloaded artifact inspection. This coverage does not establish PostgreSQL/API persistence, two-account Yorkie convergence/authorization, real OS IME, external Word compatibility, other browsers, long-duration load, mobile or overall alpha readiness. #322 retains those separate acceptance gates. QA receives the manifest reproduction steps and exact candidate reports; no operational configuration or product documentation behavior changes are required. No deployment or maintainer approval is implied.
