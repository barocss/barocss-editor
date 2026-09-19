# Word command surface coverage

Status: 2026-09-13. A visible button is complete only when its input, selection requirements, command, cancel behavior and document result are connected. This inventory covers the current product UI, not MS Word feature parity.

현재 우선순위: **표 확장은 W6b-15에서 보류**한다. W6c-1 서식 복사, W6c-2 문단 스타일 관리, W6c-3 책갈피·상호 참조, W6c-4a DOCX 스타일 교환, W6c-4b 본문 책갈피·REF 필드 교환을 범위별로 완료했다. W6c-5에서 입력·목차·댓글/변경 추적·저장의 데스크톱 Chromium 검증을 마쳤다. 접근성 점검은 사용자 요청으로 보류한다. W6c-6에서 **캡션 삽입·자동 번호**를 추가했다. W6c-7에서 그림 목차와 본문 그림 선택 핸들의 크기 조절을 연결했다. W6c-8에서 캡션 전용 상호 참조를 추가했다. 사용자 결정으로 주력을 Slides로 옮긴다. DOCX SEQ/TOC·캡션 참조 교환은 후속 항목으로 유지하고 Word 입력·저장 회귀는 계속 수정한다. 아래 날짜별 기록의 이전 “다음 작업”보다 이 결정을 우선한다.

| Area | Connected UI | Remaining product work |
| --- | --- | --- |
| Home | Clipboard actions with permission-failure fallback, character/paragraph format painter with repeated application, Undo/redo, font/size, character marks, clear formatting, text/highlight color, lists/indent, alignment, direct line-spacing presets (1/1.15/1.5/2), style previews/levels, paragraph style creation/editing/rename/update from the current paragraph, custom style picker, find and replace | Style deletion, inheritance/next-style editing, character styles |
| Insert | Configurable tables, local picture upload with alt text and zoom-aware resize handles, selected-text links, shapes, frames, math, page breaks, bookmark creation/rename/delete/navigation | Richer image sizing/wrapping, link display-text insertion at a caret |
| Layout | Page size/orientation/margins dialog, column count/gap, paragraph spacing/indent, borders/shading, page/column and next-page section breaks | Direct page presets, continuous/even/odd sections and section merge |
| References | Selected-text footnotes/endnotes, heading-based TOC insertion/settings/removal and automatic updates, bookmark text/position-name and above/below cross-references, body caption insertion with independent Figure/Table/Equation numbering, caption-based tables of figures with automatic updates, live caption references (label/number/full text) | Caption DOCX exchange, citations, page/paragraph-number references, advanced TOC and caret-only note insertion |
| Review | New anchored comments with body input, comment panel, tracking state, revision navigation/accept/reject | Proofing and broader review workflows |
| View | Outline, comments, zoom/fit, print | Ruler/display switches and view modes |
| Table/shape context | Table/picture contextual tabs; dimensions, boundary drag, equal columns, cell margins, picture crop/placement and alt text; shape arrangement | Freeform crop, advanced wrapping and multi-page edge cases |
| Page furniture | Header/footer creation/editing/removal and page-number settings | Linked-section copy/unlink, rich furniture fidelity and automatic numbering continuation |

## Input contracts implemented in this batch

`WORD_AUTHORING_ACTIONS` in office-word declares label, icon, target command and representative payload for availability checks. Menu and ribbon use the same `canAuthor` and `captureAuthoring` functions.

- Link: nonempty text range, saved while its dialog is focused. Reads the current URL, validates supported protocols via office-editor-ui's existing link helper, replaces a URL, or removes the link. Cancel leaves the document unchanged.
- Image: a text insertion location and a valid PNG/JPEG/WebP/GIF file, up to 5MB. Decode errors are reported; the preview and alternative text are available before applying. Data is embedded in the document and survives local save/reload. Attachment storage and larger files remain service work.
- Footnote/endnote: nonempty text range, user-supplied body and unique resource identifier. Reference and resource body use the existing command transaction and page-furniture renderer.
- Comment: nonempty text range and user-supplied body. Applying opens the existing comment pane.
- Find/replace: uses the current document root after document replacement; Replace focuses the replacement field. Existing replacement operations own document/history behavior.

Link/footnote/endnote/comment shortcuts now open the same input forms; Replace opens the existing panel. Native form fields retain their own keys. Basic fields/dialogs are from office-ui; link reading/validation is reused from office-editor-ui.

## Validation and limits

W5f evidence: six authoring workflows across scoped runs and30 existing ribbon/menu/formatting/geometry regressions. Model checks cover registered commands, payload availability, caret versus range behavior, independently captured targets and menu/shortcut declarations.

W5g evidence: Word units574/574; shared input/keys/selection checks70/70. Broad Word browser run61/62; the remaining test assumed formatting controls were on the Review tab, and passed1/1 after correcting the Home-tab entry. Note regression15/15. Word production build passes. Whole-app TypeScript still fails in shared sources, and two cross-host CSS inventory checks remain stale for math-editor/TSX CSS imports. See the execution brief for exact boundaries; this is not full-suite or release certification.

The earlier rapid-selection gap is addressed in W5g: native selection is captured before opening authoring forms; core keyboard formatting synchronizes the command's range into the model before a transaction preserves it; navigation closes the typing undo group. New browser cases use typing → Shift+Home → shortcut without waiting for the model or replacing the selection with a mouse gesture. General and 4x CPU slowdown link workflows, formatting → comment, replacement → selection deletion → undo are covered. This is not real OS IME or all-browser certification.

## Word 1차 마감 범위와 순서

목표는 **보고서·제안서 한 편을 새 문서에서 작성하고, 검토 후 저장·재열기·출력까지 끝내는 것**이다. MS Word 전체 기능 복제와 서비스 출시는 별도 단계다.

| 순서 | 마감 작업 | 사용자가 끝낼 수 있어야 하는 일 | 상태 |
| --- | --- | --- | --- |
| W5g-1 | 입력·선택 안정성 | 빠른 입력 직후 범위 선택, 연속 서식/링크/댓글 적용, 범위 교체·삭제와 단계별 Undo | 이번 수정 및 집중 검증 완료. 실제 OS IME는 별도 |
| W5g-2 | 일상 작성 도구 | 리본에서 줄 간격 조절, 복사/잘라내기/붙여넣기 및 권한 거부 시 대안, 서식 복사 | 줄 간격·클립보드·글자 서식 복사 완료. W6c-1에서 문단 서식 복사·연속 적용 추가 |
| W5g-3 | 문서 구조·페이지 | 구역 나누기, 다단, 머리글/바닥글 만들기·편집, 페이지 번호, 제목 기반 목차 생성/갱신 | 다음 페이지 구역 나누기와 목차 작성·자동 갱신까지 연결. 연속/홀짝 구역·구역 병합은 미지원 |
| W5g-4 | 표·그림 | 행/열·병합 외에도 크기, 정렬, 셀 여백, 그림 가로세로 비율/배치/대체 텍스트를 문서 안에서 조정 | 상황별 크기·배치, 행·열 치수, 열 균등 분배, 비율 기반 그림 자르기 구현. 셀 여백·대체 텍스트 구현. W6 통합 검증 남음 |
| W6 | 검토·출력·내구성 | 댓글/답글/해결과 변경 추적 수락/거부, 긴 문서 탐색·입력, 인쇄, 저장 실패/충돌 복구 | W6a 작성→검토→저장/재열기→긴 표 인쇄 검증. 병합 셀의 페이지 경계·접근성·실제 OS IME 검증 남음 |
| W5 교환 후속 | DOCX 작업 문서 교환 | 최소 텍스트·스타일·목록·표·그림을 다시 열어 편집하고, 미지원 요소의 손실을 미리 알림 | **기본 변환만 구현됨. 이미지·목록 등 핵심 보존도 아직 남음** |

현재 DOCX는 기본 텍스트/서식/표/페이지 설정 범위다. 이미지, 수식, 머리글·바닥글, 각주, 댓글·변경 이력의 원형 보존을 보장하지 않는다. 로컬 Word 1차 마감과 DOCX 기반 업무 교환 준비 완료를 같은 체크박스로 처리하지 않는다. JSON을 원본 보존 경로로 유지한다.

맞춤법/교정, 고급 스타일 관리, 캡션/책갈피/상호 참조/인용, 메일 병합, 매크로, 외부 오피스와 동일한 페이지 배치는 이후 확장이다. 공유 타입 오류, 실제 OS IME, 접근성·성능 기준과 계정/권한/서버 저장/협업은 출시 전 별도 완료 조건이다. 위 마감과 지원 범위 확인 후 Slides → Site로 이동한다.

## W5g-2 clipboard delivery — 2026-09-09

Home and Edit share office-editor-ui clipboard actions and office-icons. Copy/cut require a nonempty text range; paste accepts a caret or range. The native range is captured before execution. Pending clipboard access disables duplicate UI actions. Copy is read-only and adds no document history. A denied write returns failure and cut leaves the source unchanged. Normal cut uses the shared Backspace range operations, so paragraph joins and formatted text restore in one undo. Tracked cut writes the clipboard before recording a move.

The fallback uses office-ui Dialog/TextAreaField. Copy/cut failures provide selectable plain text. Manual copy does not delete the source. Paste failures accept literal text at the saved range; Markdown punctuation is not converted. Cancel leaves the document unchanged. Document changes while this dialog is open reject the stale insertion target. Clipboard permission waits also check the original root and serialized target before cut/paste.

Validation: clipboard browser11/11 (HTML formatting, keyboard commands, undo/redo, save/reload, multi-paragraph restoration, tracked-cut success/denial, fallback/cancel/stale target and1127px ribbon layout); shared clipboard units12/12; Word units574/574; Note daily/paste regression8/8; Word build passes. The broader authoring run was20/21: the stale-target assertion used an incorrect fixture offset; the corrected scenario passes in the11/11 clipboard rerun. Existing shared TypeScript diagnostics remain; no diagnostics name the changed clipboard sources. Clipboard APIs were mocked, not the user's OS clipboard.

Remaining: format painter and style management; keyboard permission-failure feedback beyond the menu/ribbon fallback; complete tracked rich/multi-paragraph paste recording and move pairing; browser/OS clipboard permission coverage and cross-application fidelity. Existing low-level model cut is not a general structural undo contract; product cut now uses the shared reversible range-deletion path.

## W5g-2 character format painter — 2026-09-09

Use Home → 글자 서식 복사, or the Format menu. Capture the first selected character (or the character at the caret); mixed source formatting uses that sample. Drag over target text to apply once. Keyboard users can select the target and activate the same button again. Escape, Cancel, typing, or document reload ends painting. The status line explains the next action.

The product snapshots Word's resolved character style and selected visual marks. Each application stores a character style resource and replaces only visual marks inside the destination range. Text, paragraph semantics, links and review anchors are retained. Plain source styles explicitly reset inherited bold/italic, font size and color. Source capture is read-only; application, style resource insertion and optional formatChange recording form one transaction. Undo restores the entire original mark list and removes the inserted resource; redo and local reload are covered.

The interaction state and selection handling live in office-editor-ui (`useFormatPainter`). Buttons and status styling use office-ui; the brush icon comes from office-icons. Word owns style resolution, mark scope and review data. No Note model or Word UI dependency enters the common hook.

Validation: Word units578/578, then expanded painter units5/5; Chromium painter/clipboard/line-spacing18/18, plus same-instance document reload1/1. The drag fixture initially omitted `surface.kind=flow`, which tested a canvas selection; the corrected flow document passes. A real defect in tracked painting's two undo steps was fixed by recording the revision inside the same transaction. Word build passed. Existing shared TypeScript diagnostics remain; no new diagnostic in the painter sources.

Limits: character formatting only. Paragraph alignment/spacing, continuous/double-click painting, style-resource deduplication and full DOCX round-trip remain open. The command does not promise to copy every extended character mark outside its explicit supported set. Next delivery: W5g-3 header/footer/page-number authoring, then TOC and contextual table/picture tools.


## W5g-3 header/footer/page-number authoring — 2026-09-09

Insert ribbon and Insert menu now open header, footer and page-number dialogs. These use office-ui fields/dialogs and office-icons page-header/page-footer/page-number symbols. Word owns the schema command and section targeting; the app owns the editing mode and body caret restoration.

- Create a default, first-page or even-page header/footer with initial text and alignment, then edit the actual document node. Existing content is never replaced with plain text when opening the dialog.
- First/even variants enable the section switch. Removing a binding affects that section only; shared resources remain available. A removed special variant falls back to the default according to the existing renderer.
- Page numbers support decimal, Roman and alphabetic formats, start values1–9999, placement and alignment. A missing number gets a separate paragraph. Existing number fields update without duplication; authored text, tabs and page-count fields survive.
- Resource creation and section attributes use one transaction. Undo/redo and JSON/local persistence retain the result. Stale document targets are rejected.
- The editing status offers a body-return button. Return/Escape restores the prior body selection; clicking body preserves the clicked position. Loading another document clears the mode.

Evidence: Word units583/583, command conformance/furniture/spec17/17, then expanded furniture5/5. New UI browser5/5 covers typing (including empty headers), body return, save/reload, number formats, first-page creation/removal/undo, cancellation and1127px dialog placement. Existing page/chapter/print plus initial UI run45/46; the remaining test clicked below the viewport after the new status row appeared. Scrolling the paragraph into view fixes the fixture; its rerun passes1/1. Word production build passes. Shared TypeScript errors remain; none name these changed UI/command sources after the new callback type was fixed.

Limits: repeated page furniture still uses the existing flattened text renderer, so full rich typography/images/tables in headers are not a fidelity claim. Shared header/footer content edits affect linked sections; there is no unlink-and-copy UI yet. Editing a shared resource targets its first referencing section. Removal leaves unused resources in the document. Page-number format/start are section-wide; automatic continuation from the prior section and full DOCX preservation remain open. Next: section breaks and TOC authoring/refresh, then table/picture tools and W6 integration.


## W5g-3 section and TOC authoring — 2026-09-09

Layout/Insert offer **구역 나누기 (다음 페이지)** at a collapsed caret in a top-level body paragraph/heading. The shared caret splitter divides text, subsequent blocks move with IDs intact, page attributes and furniture references carry over, and the caret enters the new section. Edge positions retain a writable paragraph. One undo restores the original text and marks. Nested/range selections are rejected.

References → **목차** and Insert → **목차…** open an office-ui dialog. Insert before the current block, or update/remove the first TOC in that section. Configure document/section scope, heading levels1–6, page numbers, links and dot/no leader. Titles and page numbers update automatically. New TOCs use document scope; legacy TOCs retain section scope. Enter/Space on a linked entry focuses the actual heading text. Empty results show an explanation.

Shared fixes: DataStore.deleteNode now reads the overlay parent and writes a fresh child array. Previously it overwrote moved siblings and mutated committed arrays before rollback. EditorViewDOM now refreshes editor-owned root proxies as well as subtree proxies; undo no longer leaves an empty section from an obsolete root child list. Caller-supplied render trees keep their ownership contract.

Validation: Word589/589; datastore830/830; model split/merge46/46; DOM view27/27; structure browser3/3, furniture5/5 and print6/6 across scoped runs. A broader26-case browser run was interrupted after old outline fixtures assumed initially open panes and Home-tab view controls. Updated fixtures explicitly open panes and select View; rerun11 passed,1 skipped because the sample lacks a comment anchor. The initial structure run found real undo/render/navigation defects; all new cases pass after fixes. Build passes; shared TypeScript diagnostics remain, with none naming the new structure/dialog/app sources.

Limits: next-page breaks only. Continuous/even/odd starts, section merge/removal UI, linked-header copy/unlink and automatic numbering continuation remain open. TOC scans direct heading/outline paragraphs; nested discovery, custom filters, Roman/chapter-formatted page labels and DOCX fidelity remain open. No generated fallback snapshot is persisted. Next: W5g-4 contextual table/picture size and placement, then W6.

Follow-up shared-layer verification: Note daily-work/paste-boundaries8/8 passed on isolated documents.


## 2026-09-09 — TOC composition and deletion history

Generated TOC markup now has an explicit noneditable input boundary. `installTocCompositionPreview` updates existing entry labels from the model while composition is active. It does not render or replace the IME paragraph. Original labels are restored before the renderer resumes, including composition cancellation. Entry membership and page numbers settle after composition; an initially empty TOC gains entries on commit. The installer returns a disposer for hosts that unmount it.

Explicit `deleteTextRange` operations no longer coalesce with typing or other deletions. Undo restores each deleted grapheme. Ordinary typing and IME updates retain their existing grouping. The reported whole-heading restoration was reproduced before this change. Erasing all heading text did not remove the TOC node in the isolated reproduction; the tests now cover its empty placeholder and an additional Backspace at that boundary.

Evidence: TOC browser5/5; existing structure/navigation3/3 and composition completion4/4; Note deletion6/6 after changing its old combined-undo expectation. Word589/589 and production build pass. Core full run332 passed/10 skipped with one stale cast-count assertion; lowering its ceiling from357 to356 gave2/2 on the affected file. History regressions11/11 passed. Shared TypeScript diagnostics remain, with none in the changed TOC/history/app files. Browser IME uses Chromium CDP, not physical OS IME certification. Original user documents were not edited by the tests. Next remains W5g-4 table/picture tools.


## 2026-09-09 — W5g-4a: contextual table and picture layout

Selecting a table opens **표 레이아웃**; clicking a picture selects the inline object and opens **그림 서식**. Context controls use office-ui NumberField, ChoiceSelect, ToolbarToggle and RibbonGroup with office-icons. They are held in office-word, not reimplemented in the app.

- Table: width in centimetres, left/centre/right alignment, content fit, body-width fit and fixed width. Changing a fixed width scales existing column proportions. Automatic fit clears the old fixed grid. Alignment clears an explicit left indent.
- Picture: width and height in centimetres; aspect ratio preserved by default, with an independent-size toggle; inline, left/right text wrapping and top/bottom placement. Unsized pictures use their rendered CSS dimensions for the initial ratio. Ratio lock is a per-selection UI preference, not a new document attribute.
- One `setWordObjectLayout` command validates the current document, selected object, object type and finite 0.1–55cm dimensions before one transaction. Data remains in standard Word twips. Invalid, stale and read-only edits do not mutate the document. Current registry:176 commands,164 Word-specific; schema unchanged.

Browser testing found that keyboard dispatch substituted a DOM text range for a held object selection. Shared view dispatch now preserves whole-node/cell/table selections. Shared deletion accepts selected inline leaf objects while block/canvas selections keep their own commands; locked inline objects remain protected. Deletion moves the caret to surrounding text, or creates an empty run when needed, so typing can continue. Undo restores the object.

Remaining W5g-4b: row height and column width controls, equal column distribution, margins inside cells, image crop/reset, accessibility text editing, broader wrapping/print/DOCX fidelity. The current fit uses CSS table layout; it is not a complete MS Word layout engine. No product-completion or launch claim.


Verification: Word595/595; shared deletion20/20; view keyboard/IME dispatch4/4; contextual ribbon4/4, new object layout3/3, table selection6/6 and authoring6/6 across scoped browser runs; Note deletion6/6. Earlier fixture failures (missing bTableBody and page margins) were corrected. The image keyboard deletion failure was a real dispatch/guard defect and passes after the shared fixes. Production build passes. Existing shared TypeScript diagnostics remain; no new diagnostic in the object controls/command or changed dispatch statements. Screenshots: /tmp/word-table-layout.png and /tmp/word-picture-layout.png. Original user documents were not modified by tests.


## 2026-09-09 — W5g-4b: row/column dimensions and picture crop

Delivered row height (automatic/minimum/exact), individual column width and equal column distribution in the contextual table ribbon. Measurements use centimetres in office-ui controls and twips in the document. Shared office-text helpers preserve the total width when rounding equal columns. Existing grids take priority over rendered measurements. Each dimension change uses an undoable command.

Picture format now provides square, 16:9 and 3:4 crop presets, horizontal/vertical crop position and reset. Cropping uses the shared image renderer with object-fit/object-position. It preserves the source image and original frame dimensions, including through local save/reopen. Reset restores the original frame. This is preset cropping; freeform drag handles are not implemented. Inventory remains176 commands (164 Word-specific),108 nodes; five optional image attributes bring the schema to1,040 attribute slots.

Evidence: Word597/597; object-layout Chromium5/5, including save/reopen, undo, column distribution and crop reset; production build passed with the existing chunk-size warning. Whole-package TypeScript still fails in existing shared sources; no diagnostic names the changed dimension/crop files. Crop-position conformance exemptions were removed because the harness already detects their render reads.

Live in-app verification: the user's open Word tab at localhost:5180 displays the updated table ribbon. Selected its existing table, opened the column menu and switched the UI target to2열. New controls fit the1127px view. Document content was not changed. Isolated test screenshots: /tmp/word-table-dimensions.png and /tmp/word-image-crop.png.

Remaining W5g-4: cell padding and picture alternative-text editing. Freeform crop, advanced wrapping and print/DOCX fidelity remain open. Next implement cell padding and alternative text, then W6 integrated editing/save/print, long-document and accessibility checks. Word, W6 and service launch are not complete. Delivery order remains Word → Slides → Site.

Acceptance rule: after each feature, verify the current development code in the visible in-app editor as well as automated tests. Use an isolated document for destructive or content-changing test scenarios.


## 2026-09-09 — Table boundary dragging

Table dimensions now have an in-document pointer path. Hover within6px of a cell's right/bottom boundary, then drag horizontally/vertically. A shared office-text adapter renders a guide and centimetre preview outside the editable DOM. The Word adapter converts unzoomed pixels to twips and uses the existing dimension commands. Release commits once; Escape/pointer cancellation discards the preview. Column dragging adjusts that column and the table total; other column widths stay fixed. Row dragging sets a minimum height, so cell content is not clipped. Ribbon fields remain the precise-input and keyboard-access path.

The adapter accounts for document zoom, suppresses read-only handles, refuses stale document/attribute targets and cleans up on editor destruction. Shared CSS lives in office-text. Vertically merged cells target their last row when that row has an editable cell; rows covered entirely by row spans have no resize target from that merged edge. Full multi-page split-table/row-span geometry is still a W6 verification item.

Verification: Word597/597; focused browser13/13 (dimensions, Escape, undo, persistence,75% zoom, read-only and existing cell selection); build passed. Shared TypeScript baseline remains, with no diagnostics in new resize sources. Initial browser failures were test coordinates sampled before the contextual ribbon had settled; tests now wait for the selected tab. The current in-app Word document contains the new resize layer and updated table tools. In-app automation does not expose pointer drag, so gesture assertions use the isolated Chromium run; do not describe this as a manual drag in the user's document. Screenshot: /tmp/word-table-boundary-drag.png.


## 2026-09-09 — W5g-4c: cell margins and picture accessibility

Delivered **셀 안쪽 여백** in Table Layout and **대체 텍스트** in Picture Format. Both use office-ui dialogs and controls, office-icons, and the existing setWordObjectLayout command. No new command or attribute count:176 commands,164 Word-specific,108 nodes and1,040 attribute slots.

Cell margins support selected cells or every cell of the selected table, four directions in centimetres, partial changes and reset to inherited defaults. Changes remain drafts until Apply; Cancel does not write. Captured cell IDs keep the target stable while the dialog owns focus. Root ancestry, existing cells, scope and read-only state are checked before one transaction. Reset removes direct margins and restores table/style defaults. Blank fields mean inherited or mixed values; editing one side leaves other attributes intact.

Picture descriptions update the existing image alt attribute. A decorative option writes an explicit empty alt. Local save/reopen and undo preserve both forms; source image and dimensions remain unchanged. This is HTML accessibility/local persistence, not certified screen-reader coverage or DOCX preservation.

Browser testing exposed a Word schema mismatch: cells rendered paragraph children, but inherited inline-only content validation rejected cell attribute transactions. Word cell/header-cell content now accepts `(block|inline)*`, preserving legacy direct inline content. The shared schema is unchanged. Updated the older inline-only premise test while retaining frame/drawing insertion regressions. Object-layout units now use the same schema-backed DataStore as the app. An initial overly strict payload-key check also rejected the selection field injected by Editor.run; known conflicting property checks replace it.

Evidence: Word599/599; focused browser15/15 covering new dialogs, save/reopen, reset, undo, existing dimensions/crop/drag/zoom/read-only and cell selection; production build passed. Whole-package TypeScript still fails in existing shared files; no diagnostic names the changed property/dialog/schema files. Screenshots: /tmp/word-cell-margins.png and /tmp/word-image-alt.png.

Visible app: restarted the stopped Word server on5180. The old tab showed a connection-error data page that the browser tool could not inspect, so opened the same document URL in a new visible tab. Opened cell margins, entered0.5cm, confirmed Apply enabled, then cancelled. Original document content was preserved; the new tab remains available.

Next: W6 integrated authoring/review/save/reopen/print checks, with long and multi-page tables and supported DOCX round-trip limits. W5g table/picture core controls are connected; freeform crop, advanced wrapping and full exchange fidelity remain open. Word and service launch are not complete. Continue Word → Slides → Site.


## 2026-09-09 — W6a: 통합 작성과 긴 표 인쇄

변경 추적으로 본문을 편집하고 모두 적용한 뒤, 48행 표의 셀 여백을 바꾸고 저장·재열기·인쇄하는 브라우저 시험을 추가했다. 재열기 후 문서 내용·서식·마크를 비교한다. 인쇄 영역의 ROW-001–048이 한 번씩 순서대로 보이고, PDF 페이지 수가 화면의 4페이지와 같은지 확인한다. 문서 노드 ID는 세션 값이므로 내용 비교에서 제외한다.

발견한 제품 결함 두 가지를 수정했다.

- editor-view-dom: IME 변경을 추가 타이머로 미루면서 조합 종료 렌더가 아직 저장되지 않은 글자를 덮었다. 조합 중 DOM 변경은 MutationObserver의 현재 microtask에서 반영한다. 일반 입력 배치와 중첩 편집기 제외 규칙은 유지한다.
- office-word: 표 높이에서 모든 chrome 요소를 빼면서 colgroup의 높이까지 뺐다. 열 너비가 있는 긴 표를 약 1px로 측정하는 원인이었다. 해당 표의 페이지 간격·반복 머리행 TR만 높이에서 뺀다.

검증 과정에서 기존 IME 시험 3개의 화면 밖 클릭을 먼저 스크롤하도록 수정했다. 통합 시험의 PDF 생성 전에는 명시적 screen 미디어 강제를 해제한다. 인쇄 CSS 변경은 필요하지 않았다. 시험의 잘못된 bTableHead 이름은 실제 스키마의 bTableHeader로 고쳤다.

브라우저의 별도 문서 'Word 통합 검증'에서 한글·연속 공백·Backspace·줄바꿈, 변경 추적과 모두 적용, 40행 표 삽입, 1열 너비 4cm, 페이지 경계, 저장 후 새 탭 재열기를 확인했다. URL: http://localhost:5180/#word=bd9399a1-96cd-4c25-a62f-c50d4db7de5a. 원래 사용자 문서는 테스트 입력 대상으로 쓰지 않았다. 이 UI 입력은 OS 한글 IME 수동 시험을 대신하지 않는다.

다음 W6b: 여러 페이지에 걸친 병합 셀·반복 머리행·드래그 치수, Word 수식 팝업 회귀, 키보드/접근성 검증. 기본 DOCX 시험 통과와 고급 DOCX 보존은 구분한다. 전체 Word 기능, 공동 편집 서비스와 출시 검증은 완료 상태가 아니다. 제품 순서는 Word → Slides → Site를 유지한다.


W6a 최종 검증: Chromium 69/69 통과(작성·저장/재열기·보관함·댓글/답글/해결·변경 추적·목차/한글 조합·구역/페이지 장식·기본 DOCX·인쇄). Word 단위 599/599, 공통 조합 경계 7/7, Word Vite 빌드 통과. 로그: /tmp/word-w6-final.log, /tmp/word-w6-unit.log, /tmp/word-w6-composition-unit.log, /tmp/word-w6-build.log. 인쇄 산출물: /tmp/word-integrated-report.pdf, /tmp/word-integrated-print.png. 공통 모듈 변경에 대한 Note/Site 브라우저 회귀와 실제 OS IME·전체 접근성·성능 예산 검증은 이번 범위에서 완료하지 않았다. 기존 공통 TypeScript 진단도 출시 전 해결 대상이다.


## 2026-09-09 — W6b-1: Word 수식 다이얼로그 공통화

사용자의 수식 입력 요청을 우선했다. Word의 기존 math-editor 다이얼로그를 Note가 쓰는 office-editor-ui의 MathSourceEditor로 연결했다. 시각 편집과 LaTeX 원문을 전환하고, LaTeX를 직접 적용할 수도 있다. 공통 탭·편집 영역·스크롤 레이아웃을 재사용한다. 문서 크기 설정은 이 다이얼로그에 넣지 않는다.

제품 결정: Word는 다이얼로그 초안을 기본으로 유지한다. Note의 본문 내 직접 편집 방식은 자동으로 옮기지 않는다. 다이얼로그에서 math-editor가 입력과 Undo를 처리한다. 적용할 때만 구조를 Word의 OMML 형태 노드로 변환하고 한 트랜잭션으로 반영한다. 기존 수식 재편집, 취소/Escape, 문서 Undo와 저장·재열기를 유지한다. 문서 안 배치는 기존 Word 수식 모델과 명령을 사용한다.

지원하는 구조는 분수·루트·지수·첨자·소괄호·대괄호·절댓값·합·곱·적분·행렬이다. Word에서 보존하지 못하는 구조 도구는 숨긴다. 붙여넣기/LaTeX는 적용 시 다시 검증한다. 잘못된 구문, 여러 줄, 경우 나누기, 정렬식과 미지원 구조는 원본을 변경하지 않고 초안과 오류를 표시한다. 개별 분수의 dfrac/tfrac 표시 스타일도 조용히 버리지 않고 거부한다. 모든 LaTeX나 고급 DOCX 수식 교환을 지원한다는 뜻은 아니다.

검증: Word 단위 600/600 및 Vite 빌드 통과. Word 수식 브라우저 17개 중 기존 16개가 통과했고, 옛 Linear 버튼을 찾던 시험은 현재 삽입 → 수식 표시 경로로 고친 후 별도 재실행에서 통과했다. 신규 3개 시험은 LaTeX/시각 전환, 직접 적용, 재열기, Undo, 미지원 구문과 취소의 원본 보존, 자동완성 ArrowDown/Enter와 모드 전환 시 팝업 닫힘을 검증한다. Note 공통 편집/팝업 배치 브라우저 6/6 통과. 로그: /tmp/word-w6b-word.log, /tmp/word-w6b-linear.log, /tmp/word-w6b-note.log, /tmp/word-w6b-unit.log, /tmp/word-w6b-build.log.

실제 브라우저: Word 통합 검증 문서에서 x/2+y/2=30을 LaTeX로 불러와 시각 편집으로 확인하고 적용했다. 문서의 수식을 다시 열어 분수 구조가 유지됨을 확인했다. 편집 다이얼로그를 열린 상태로 남겼다. http://localhost:5180/#word=bd9399a1-96cd-4c25-a62f-c50d4db7de5a

남은 W6b: 병합 셀의 페이지 경계·반복 머리행·드래그 치수, 키보드 접근성 전체 흐름, 실제 OS IME. 수식은 미지원 구조 변환과 문서 배치 UX를 후속 범위로 유지한다. Word 전체 완료나 Slides 착수를 선언하지 않는다. Word → Slides → Site 순서를 유지한다.


## 2026-09-09 — W6b-2: Word 본문 수식 편집

W6b-1의 다이얼로그 기본 결정을 확장했다. 기존 Word의 oMath/분수/슬롯 모델과 office-text 수식 렌더러를 유지한다. 수식 더블클릭 또는 삽입 → 본문 수식에서 math-editor 초안을 해당 위치에 연다. 빈 본문 커서에서도 같은 도구로 인라인 수식을 삽입한다. 기존 시각 편집/LaTeX 다이얼로그는 유지한다.

office-editor-ui의 MathInlineInput은 초안 입력, 자동완성 키보드, 조합 중 완료 방지와 적용/취소 UI를 맡는다. office-word의 useWordMathInplace는 임시 입력 영역과 Word 타깃을 연결한다. WordMathTarget/bridge/session은 원본 변경 검사, 구조 변환, 한 트랜잭션 적용과 수식 뒤 커서를 맡는다. Note의 tex 원자 모델을 Word에 복사하지 않는다. 입력 중 임시 DOM은 data-editor-input-owner 경계 안에서만 변경하고, 적용/취소 후 경계를 제거한다.

Enter는 자동완성이 열려 있으면 항목을 선택하고, 닫혀 있으면 수식을 적용한다. Esc는 자동완성을 먼저 닫고, 그 다음 초안을 취소한다. 외부 클릭은 초안을 먼저 적용한다. 빈 초안은 취소한다. 적용 후 Word 렌더러로 돌아오고 수식 뒤에서 본문 입력을 계속한다. 초안 입력은 Word 원본과 실행 취소 기록을 변경하지 않는다. Word가 변환하지 못하는 구조는 오류로 알리고 원본을 유지한다. 기존 Word 슬롯 직접 입력과 수식 표시 전환도 유지한다.

검증: Chromium 수식 22/22 통과. 인라인 5개, 다이얼로그 5개, 기존 Word 수식 12개를 함께 실행했다. 입력/Backspace 격리, 자동완성 ArrowDown/Enter, 취소, 한 번의 Undo, 수식 뒤 입력, 저장/재열기, 분수 구조 보존을 포함한다. Word 단위 시험은 599/600 통과 후 CSS 토큰 오류를 수정했고 해당 파일 2/2 재검증을 통과했다. Vite 빌드 통과. 기존 저장소 TypeScript 오류는 남아 있으며 이번 변경 파일의 진단은 해소했다. 로그: /tmp/word-inline-final.log, /tmp/word-inline-unit.log, /tmp/word-inline-chrome.log, /tmp/word-inline-build.log. 스크린샷: /tmp/word-math-inline.png.

남은 범위: 실제 OS IME, 페이지 경계에서 커지는 긴 수식, 모든 고급 Word 수식의 양방향 변환. W6b 표 병합/반복 머리행/접근성 검증은 별도 미완료다. 전체 Word 완료를 의미하지 않는다. 제품 순서는 Word → Slides → Site다.


## 2026-09-09 — W6b-3: 커서 기반 수식 도구 모음

수식 내부에 커서 또는 해당 수식 안의 선택 범위가 있으면 `수식 바로 편집` 도구를 표시한다. Word가 대상 수식을 결정하고 office-ui의 FloatingSurface, Button, Icon이 표면과 위치를 처리한다. 버튼은 대상과 커서를 유지한 채 기존 인라인 math-editor를 연다. 편집 중, 수식 밖 커서, 다른 입력창 포커스에서는 숨긴다. Esc로 닫은 도구는 같은 커서 상태에서 자동으로 다시 열리지 않는다. 수식을 다시 클릭하면 열린다. 적용 후 즉시 도구를 다시 띄우지 않는다.

새 시험에서 수식 뒤 문단 맨 앞의 커서가 Chromium의 getTargetRanges에서 앞 수식 끝으로 정규화되는 입력 결함을 발견했다. 공통 editor-view-dom은 단순 insertText의 접힌 범위에서 화면 커서와 모델 커서가 일치하고, 대상이 다른 부모의 이전 텍스트 끝으로 바뀐 경우에만 화면의 명시적 커서를 유지한다. 교체 범위와 같은 부모의 일반 서식 경계는 기존 동작을 유지한다. 인라인 수식 적용 후 포커스 복귀 시에도 모델 커서를 화면에 적용한다.

검증: Word Chromium 24/24, 공통 입력 단위 63/63, Vite 빌드 통과. Note 수식 회귀는 9/10 통과 후, 구조 선택이 토큰 입력창 대신 편집 표면에 포커스를 두는 현재 동작에 맞게 테스트를 수정했다. 해당 시험 1/1 재실행 통과. 제품 Note 코드는 변경하지 않았다. 기존 저장소 TypeScript 진단은 남아 있고 이번 변경 부분의 진단은 해소했다. 로그: /tmp/word-context-final.log, /tmp/word-context-core.log, /tmp/word-context-note.log, /tmp/word-context-note-target.log, /tmp/word-math-context-build.log.

실제 열려 있는 Word 통합 검증 문서에서 수식 커서 → 도구 모음 → 인라인 편집 → 취소를 확인했다. Word 원본 수식의 렌더링을 유지한다. W6b의 고급 수식 변환, 실제 OS IME와 페이지 경계·표 병합 검증은 계속 남아 있다.


## 2026-09-09 — W6b-4: 표 머리행 반복 개선

여러 줄 머리행의 순서와 병합 구조를 보존한다. 다음 페이지 본문 안에 반복 머리행 높이를 확보하고 원본 셀의 색상·테두리·정렬·여백을 적용한다. 반복 해제 시 장식 행을 제거한다. Chromium 페이지/인쇄 29개 통과 후 서식 추가와 타입 수정의 관련 시험을 재검증했다. Word 단위 602개와 빌드가 통과했다. 실제 앱에서도 긴 표의 파란색 병합 머리행 반복을 확인했다.

다음은 본문 병합 셀의 페이지 경계와 드래그 치수, 접근성 및 실제 OS IME다. 반복 머리행 내부의 그림·수식·복합 인라인 서식과 여러 단에 걸친 긴 표는 미완료다. Word 전체 완료나 Slides 착수를 선언하지 않는다. 상세 근거는 [Word 진행 문서](../../.dev/plans/word-product-foundation/brief.md)의 W6b-4에 있다.


## 2026-09-09 — W6b-5: 세로 병합과 행 높이

본문 세로 병합 셀 중간에서 페이지가 나뉘지 않도록 수정했다. 공간이 부족하면 병합된 행 묶음을 함께 이동한다. 병합 셀 하단 드래그는 마지막 행에 적용하며, 자체 셀이 없는 덮인 행도 조절할 수 있다. 반복 머리행과 실제 문서 행을 구분한다. Undo·저장·재열기·인쇄를 검증했다. Word 단위 607개, 표 관련 Chromium 12개, 페이지 회귀 30개, 인쇄 보강 후 관련 2개 시험과 빌드가 통과했다.

다음은 표/수식 도구의 키보드 흐름과 상황별 리본 상태 점검이다. 한 페이지보다 큰 병합 셀 내부의 분할, 다단 긴 표, 복합 머리행과 실제 OS IME는 남아 있다. [Word 진행 문서](../../.dev/plans/word-product-foundation/brief.md)의 W6b-5에 검증 근거를 기록했다.


## 2026-09-09 — W6b-6: 수식 표시를 KaTeX로 전환

Word 수식은 KaTeX로 표시하고 math-editor로 편집한다. 문장 안 수식과 독립 수식의 표시 모드를 구분한다. 원본 oMath/슬롯 모델과 DOCX 데이터는 유지한다. 공통 office-editor-ui의 렌더링 함수와 office-ui의 선택 도구를 재사용한다. 변환 불가 구조는 기존 렌더러로 표시한다. 표시할 수 있지만 math-editor가 서식을 보존할 수 없는 경우에는 기존 슬롯 편집으로 전환한다.

선택 도구·더블클릭·Enter/F2 편집, 수식 앞뒤 이동, 삭제, 적용/취소, Undo, 저장·재열기와 인쇄를 검증했다. Word 단위 610개, 수식 Chromium 28개, 페이지 27개, 제품 통합·인쇄 1개와 Vite 빌드가 통과했다. 기존 TypeScript 오류는 남아 있다. 실제 브라우저에도 적용했다. 자세한 근거와 남은 범위는 [Word 진행 문서](../../.dev/plans/word-product-foundation/brief.md)의 W6b-6에 있다.

다음은 고급 수식의 편집 호환성, 편집/표시 크기와 긴 수식의 페이지 배치 검증이다. 표의 큰 병합 셀 분할, 다단 긴 표, 복합 반복 머리행, 실제 OS IME와 전체 접근성은 미완료다. 제품 순서는 Word → Slides → Site다.


## 2026-09-09 — W6b-7: 확장 수식 편집

n제곱근, 위·아래 첨자 동시 입력, 중괄호·노름·각괄호를 math-editor와 Word 사이에서 양방향 변환한다. 공통 편집기 도구와 LaTeX 입력, KaTeX 표시를 지원한다. 숨긴 근 지수의 원본 내용을 버리는 변환은 거부한다. Word 단위 615개, 브라우저 10개 및 Vite 빌드가 통과했다. 실제 앱에도 예제를 저장했다. 기존 TypeScript 오류는 남아 있다.

다음은 일반 텍스트·서식 보존과 긴 수식 배치다. Word 전체 완료는 아니며 Word → Slides → Site 순서를 유지한다. 자세한 근거는 [Word 진행 문서](../../.dev/plans/word-product-foundation/brief.md)의 W6b-7에 기록했다.


## 2026-09-09 — W6b-8: 수식 텍스트·글꼴 편집

`\text{조건}`, `\mathrm{sin}`, `\mathbf{AB}`를 Word와 공통 math-editor 사이에서 보존한다. 한글·공백·빈 텍스트와 분수 내부의 서식 있는 텍스트를 지원한다. 굵은 글자 표시가 로만체에 덮이는 KaTeX 변환도 수정했다. 중첩 서식과 분수 전체를 감싼 글꼴은 아직 적용하지 않으며 원본과 초안을 유지한다.

Word 단위 621개, 브라우저 30개와 Vite 빌드가 통과했다. 실제 앱에서 입력·시각 편집·적용·인라인 재편집·저장 화면을 확인했다. 기존 TypeScript 오류는 남아 있다. 자세한 근거는 [Word 진행 문서](../../.dev/plans/word-product-foundation/brief.md)의 W6b-8에 있다.

다음은 긴 수식의 좁은 페이지 배치와 편집/표시 크기 일치다. Word 전체 완료는 아니며 Word → Slides → Site 순서를 유지한다.


## 2026-09-09 — W6b-9: 긴 수식 배치와 편집 기본 크기

인라인 편집의 기본 글자 크기를 KaTeX 표시 크기와 맞췄다. 긴 수식은 문단 안에서 가로로 이동하며 스크롤바를 표시한다. 편집 영역도 문단 너비로 제한한다. 인쇄에서는 너비를 넘는 수식만 축소하며 저장 원본은 유지한다. 자동 수식 줄 나눔과 페이지 높이를 넘는 행렬 분할은 아직 지원하지 않는다.

Word 단위 621개, 수식·페이지 Chromium 59개, 마지막 스크롤바 보정 후 관련 Chromium 13개와 Vite 빌드를 통과했다. 실제 앱에 긴 분수 예제를 저장하고 표시·인라인 편집을 확인했다. 전체 TypeScript 검사는 기존 오류가 남아 있다. 근거는 [Word 진행 문서](../../.dev/plans/word-product-foundation/brief.md)의 W6b-9에 기록했다.

다음은 큰 병합 셀·다단 긴 표·복합 반복 머리행 등 Word의 남은 페이지 구성 항목이다. Word 전체 완료는 아니며 Word → Slides → Site 순서를 유지한다.


## 2026-09-09 — W6b-10: 확대·축소와 편집 상태

확대·축소 버튼·비율 입력·보기 메뉴·휠 조작 중 인라인 수식 초안과 원본을 유지한다. 버튼은 입력 포커스를 유지한다. 활성 수식 입력 위치를 기준으로 확대하여 편집 영역이 화면 밖으로 이동하는 문제를 수정했다. 자동완성 메뉴는 transform과 visualViewport 변경을 따라간다. 도형 선택 테두리의 배율·스크롤 좌표를 수정하고 수식의 불필요한 도형 핸들을 제거했다.

Word 단위 621개, math-editor 단위 548개 통과. Word 브라우저 24개, 도형 3개, React/PureJS 메뉴 6개 통과 후 마지막 확대 기준 보정의 Word 11개와 Slides 3개를 재검증했다. 최종 빌드 통과. 기존 전체 TypeScript 오류는 남아 있다. 실제 앱에서 75%·100%·125%와 수식 포커스를 확인했다. 자세한 근거와 검증 한계는 [Word 진행 문서](../../.dev/plans/word-product-foundation/brief.md)의 W6b-10에 기록했다.

다음은 큰 병합 셀·다단 긴 표·복합 반복 머리행이다. Word 전체 완료는 아니며 Word → Slides → Site 순서를 유지한다.


## 2026-09-09 — W6b-11: 수식별 크기 설정

수식 선택 도구에서 50~300% 크기를 지정하고 기본 크기로 복원할 수 있다. 앱 문서에 크기를 저장하고, KaTeX/기존 Word 표시와 인라인 편집에 적용한다. 내용 편집 후에도 크기를 보존한다. 화면 확대·축소는 별도로 유지하며 버튼과 자동완성 UI는 수식 크기를 따르지 않는다. DOCX 수식 크기 교환은 후속 범위다.

실제 열린 문서에서 200% 표시·선택·인라인 편집을 확인했다. Word 단위 624개(전체 실행 614개와 모듈 해석 실패 후 재실행 10개), 공통 렌더러 4개, 서로 다른 브라우저 시나리오 18개와 최종 빌드가 통과했다. 기존 전체 TypeScript 오류는 남아 있다. 상세 근거는 [Word 진행 문서](../../.dev/plans/word-product-foundation/brief.md)의 W6b-11에 기록했다.

다음은 큰 병합 셀의 페이지 분할, 다단 긴 표와 복합 반복 머리행이다. Word 전체 완료는 아니며 Word → Slides → Site 순서를 유지한다.


## 2026-09-09 — W6b-12: 긴 전체 너비 병합 셀의 페이지 분할

전체 열을 합친 긴 셀을 문단 경계에서 나누어 다음 페이지로 이어 표시한다. 아래의 빈 행을 포함하는 세로 병합도 지원한다. 원본 셀 구조를 유지하고 페이지 사이의 배경·테두리를 가리며 머리행을 반복한다. 단일 단 문서의 직접 문단/제목이 대상이다. 다른 열의 셀이 함께 있는 병합, 한 문단 자체의 분할, 중첩 내용, 다단 문서는 미완료다.

기존 Word 단위 624개, 신규 단위 8개와 표·페이지 Chromium 32개 통과. 최종 조건 보완 후 전용 Chromium 2개와 단위 8개 및 빌드가 통과했다. 실제 앱에서 한국어 54문단·4페이지 예제를 열고 다음 페이지의 입력과 실행 취소를 확인했다. 인쇄·저장·재열기와 확대·축소도 자동 검사했다. 전체 TypeScript의 기존 오류는 남아 있다. 상세 근거는 [Word 진행 문서](../../.dev/plans/word-product-foundation/brief.md)의 W6b-12에 기록했다.

다음은 여러 열의 셀이 함께 있는 병합 그룹과 긴 셀 내부 문단 분할이다. Word 전체 완료는 아니며 Word → Slides → Site 순서를 유지한다.


## 2026-09-09 — W6b-13: 병합 셀의 긴 문단 줄 분할

전체 너비 병합 셀 안의 한 문단이 페이지보다 길면 줄 경계에서 다음 페이지로 이어 표시한다. 원본 문단과 텍스트를 유지하며 기존 본문 줄 측정을 사용한다. 반복 머리행이 커서 오프셋과 HTML 복사에 섞이지 않도록 표시용 장식을 보정했다.

Word 단위 634개, 표·페이지 Chromium 33개 및 빌드 통과. 입력·실행 취소·확대·축소·저장·재열기·복사와 인쇄 글자 전체의 누락·중복을 검사했다. 실제 앱에서도 한국어 80문장 예제를 열고 다음 페이지 입력·실행 취소를 확인했다. 기존 TypeScript 오류와 실제 OS IME 검증은 남아 있다. 근거는 [Word 진행 문서](../../.dev/plans/word-product-foundation/brief.md)의 W6b-13에 기록했다.

다음은 다른 열의 셀이 함께 있는 병합 그룹이다. 다단 표와 중첩 내용은 미완료다. Word 전체 완료는 아니며 Word → Slides → Site 순서를 유지한다.


### 2026-09-09 — 표 크기 조절 동작 보정

열·행 경계 드래그가 셀을 선택하지 않도록 분리했다. 기존 커서·선택을 유지하며 클릭, Esc 취소, 적용과 실행 취소를 지원한다. 공통 경계 어댑터가 셀 선택보다 먼저 동작을 처리한다. 단위 10개, 브라우저 19개와 빌드 통과. 실제 열린 문서에서도 확인했다. 다음 우선순위는 다른 열의 셀이 함께 있는 병합 그룹이다.


## 2026-09-09 — W6b-14: 여러 열의 긴 병합 셀 이어쓰기

같은 행 구간을 병합한 여러 열을 공통 빈 구간에서 나누어 다음 페이지로 이어 표시한다. 열마다 내용 길이가 달라도 먼저 끝난 열을 유지하며, 표 전체 너비의 머리행과 배경은 한 번만 표시한다. 한쪽 셀의 줄바꿈도 검사했다. 대상은 단일 단 문서의 위쪽 정렬된 직접 문단/제목이다. 서로 다른 행에 걸친 병합, 공통 분할 구간이 없는 복합 내용과 다단 표는 남아 있다.

Word 단위 640개, 표·페이지 Chromium 26개와 빌드 통과. 입력·실행 취소·확대·축소·저장·재열기 및 인쇄 문단 88개의 순서·개수를 확인했다. 실제 브라우저에도 2열 예제를 열고 줄바꿈 입력과 복원을 확인했다. 기존 TypeScript 오류는 남아 있다. 상세 근거는 [Word 진행 문서](../../.dev/plans/word-product-foundation/brief.md)의 W6b-14에 기록했다.

다음은 서로 다른 행에 걸친 병합과 열별 독립 분할 계획이다. Word 전체 완료는 아니며 Word → Slides → Site 순서를 유지한다.


## 2026-09-09 — W6b-15: 세로 병합과 옆 일반 행의 이어쓰기

연속 세로 병합 셀과 그 옆의 일반 행들을 공통 빈 구간에서 나누어 다음 페이지로 이어 표시한다. 왼쪽·오른쪽 병합과 일반 셀의 줄바꿈을 검사했다. 행 높이 드래그는 페이지 간격을 제외한 실제 높이만 저장한다. 문서의 최소 행 높이도 페이지 분할 중 유지한다.

Word 단위 648개, 표·페이지 Chromium 29개와 빌드 통과. 입력·실행 취소·확대·축소·저장·재열기, 인쇄 본문 문단 96개의 순서·개수, 이어지는 행의 높이 드래그를 검사했다. 실제 브라우저에서도 입력과 높이 변경 후 복원을 확인했다. 기존 TypeScript 오류는 남아 있다. 상세 근거는 [Word 진행 문서](../../.dev/plans/word-product-foundation/brief.md)의 W6b-15에 기록했다.

여러 병합이 서로 다른 행에서 시작하고 끝나는 교차 병합, 병합 셀의 초과 높이를 여러 행에 나누는 경우, 공통 분할 구간이 없는 내용과 다단 표는 미완료다. 다음은 교차 병합과 열별 독립 분할 계획이다. Word → Slides → Site 순서를 유지한다.


## 2026-09-09 — W6c-1: 문단 서식 복사와 연속 적용

홈 또는 서식 메뉴의 “서식 복사”에서 “문단 서식 포함”과 “연속 적용”을 선택한다. 대상 문단을 클릭하면 정렬·들여쓰기·앞뒤 간격·줄 간격을 적용한다. 텍스트 범위를 선택하면 글자 서식도 적용한다. Esc·취소·입력·문서 교체로 끝낸다. 각 적용은 별도로 실행 취소할 수 있다.

제목 레벨·목록 구조·페이지 나눔 설정은 복사하지 않는다. 변경 추적 중 문단 서식을 거부하면 이전 속성으로 복원한다. 추적 중 빈 문단 적용은 지원하지 않는다. 글자와 문단 변경은 별도 검토 항목이다.

Word 단위 652개, 공통 선택/툴바 7개, Chromium 작성·서식·검토 68개와 Vite 빌드 통과. 실제 앱의 `?sample=format-painter` 예제에서 두 문단의 적용 결과를 확인했다. 전체 TypeScript의 기존 공통 소스 오류는 남아 있다. 세부 근거는 [Word 진행 문서](../../.dev/plans/word-product-foundation/brief.md)의 W6c-1에 있다.

표 확장은 사용자 요청으로 보류한다. 다음은 스타일 관리다. Word → Slides → Site 순서는 유지한다.


### 2026-09-09 — W6c-1 페이지 기본 여백 수정

서식 복사 예제처럼 용지 크기·여백을 생략한 구역에서 본문이 종이 왼쪽 끝에 붙고 눈금자와 종이 너비가 맞지 않았다. 페이지 계산은 기본값을 사용했지만 화면의 flowCss는 명시된 값만 적용한 것이 원인이다. Word 페이지 렌더러가 페이지 계산과 같은 sheetMetrics로 너비·좌우 여백을 정하도록 수정했다. 문서에 지정된 0 여백과 제본 여백도 유지한다. 기존 저장 문서에도 적용되며 문서 내용을 바꾸지 않는다.

검증: 수정 전 누락된 페이지 설정 사례의 너비 검사 실패를 재현했다. 수정 후 페이지 설정·확대/축소·서식 복사 브라우저 23개 통과. 눈금자 정렬 검사를 보강한 전용 4개를 다시 실행해 모두 통과했다(23개 중 같은 4개). 생략/일부 설정·가로 방향·0 여백·제본 여백·저장/재열기·인쇄 사본을 검사했다. Word 단위 652개와 Vite 빌드 통과. 실제 열린 서식 복사 문서에서도 종이·본문 여백·눈금자 정렬을 확인했다. 다음 기능은 스타일 관리이며 표 확장 보류는 유지한다.


## 2026-09-09 — W6c-2: 문단 스타일 관리

서식 → 스타일 관리와 홈 스타일 상세 설정에서 스타일 생성·이름 변경·서식 수정·현재 문단 서식 가져오기를 제공한다. 리본의 목록에도 사용자 스타일을 표시한다. 스타일 정의를 수정하면 이를 사용하는 문단에 함께 반영한다. 문단 직접 서식과 글자별 강조의 우선순위를 구분하며 링크와 제목 레벨을 보존한다. 초안 취소, 중복 이름 검사, 실행 취소·다시 실행과 저장·재열기를 지원한다.

변경 추적 중 스타일 관리와 사용자 스타일 적용은 비활성화한다. 스타일 삭제·상속/다음 스타일 편집·글자 전용 스타일은 남아 있다. Word 단위 655개, Chromium 26개와 빌드 통과. 기존 TypeScript 오류는 남아 있다. 실제 앱에서 두 문단의 글자 크기가 스타일 수정으로 함께 바뀌는 것도 확인했다. 근거는 [Word 진행 문서](../../.dev/plans/word-product-foundation/brief.md)의 W6c-2다.

다음은 책갈피·상호 참조다. 표 확장 보류와 Word → Slides → Site 순서는 유지한다.


## 2026-09-10 — W6c-3: 책갈피·상호 참조

참조 리본과 삽입 메뉴에서 책갈피 추가·이름 변경·삭제·이동과 상호 참조 삽입을 제공한다. 위치 앵커와 여러 텍스트 노드의 범위 표시를 같은 공통 인덱스로 읽는다. 이름 변경은 연결 필드를 갱신하며 원본 입력도 참조 표시에 반영한다. 삭제 후 대상 없음 표시와 Undo 복원을 지원한다. 참조 클릭·Enter/Space는 원본 위치로 이동한다.

Word 단위 658개, 공통 필드 12개와 빌드 통과. 브라우저 최초 59/61, 오래된 화면 가정을 보완한 2개 재검증 2/2 통과. 실제 앱에서도 삽입과 이동을 확인했다. 전체 TypeScript 기존 오류는 남아 있다. 근거는 [Word 진행 문서](../../.dev/plans/word-product-foundation/brief.md)의 W6c-3에 있다.

범위 생성은 한 문단 안, 참조 삽입은 텍스트 커서에서 지원한다. 변경 추적 중 쓰기, 다중 문단 범위, 페이지/문단 번호 참조는 미지원이다. 다음은 DOCX 교환 범위와 작성·검토 마감 검증이다. 표 확장은 보류한다.


## 2026-09-10 - W6c-4a DOCX style exchange

Named paragraph/character styles and basic formatting survive DOCX exchange. Shared paragraph style edits remain effective after reopening. Word unit suite: 663 passed. Related browser scenarios: 8 passed. Production build passed. [Scope, limitations and next milestone](word-docx-exchange.md). Next: bookmark/REF exchange, then writing/review acceptance.


## 2026-09-10 - W6c-4b DOCX reference exchange

One-paragraph text/point bookmarks and REF text/above-below now retain live connections through DOCX. Word units: 671 passed; related browser scenarios: 8 passed; production build passed. Live in-app reference navigation, source editing and undo were checked on the DOCX-converted demo. [Scope and limitations](word-docx-exchange.md). Next: writing/review acceptance; table expansion remains paused.


## 2026-09-10 — W6c-5: 작성·검토 검증

새 댓글·답글·변경 기록의 고정 예제 날짜를 실제 UTC 작성일로 바꿨다. 기존 기록의 날짜는 유지한다. 댓글 수정과 답글 입력에서 한글 조합 중 Enter는 확정·전송 명령으로 처리하지 않는다. 정상 Enter는 브라우저 기본 동작을 막아 선택된 본문과 댓글 연결을 유지한다.

Word 단위 671개, 작성·목차·검토·저장 Chromium 52개와 빌드가 통과했다. 본문 보존, 답글/날짜/변경 기록의 재열기, 댓글 해결, 변경 적용, 저장 충돌 복구와 실패 후 재시도를 검사했다. 실제 앱에도 댓글 수정과 답글을 적용했다. 기존 TypeScript 오류는 남아 있다. OS 자체 IME 검증은 별도이며, 이번 조합 검사는 CDP와 키 이벤트를 사용했다.

다음은 긴 문서 성능·키보드 접근성 점검이다. Word 전체 기능 완료를 뜻하지 않는다. 표 확장 보류와 Word → Slides → Site 순서를 유지한다. 상세 근거는 [Word 진행 문서](../../.dev/plans/word-product-foundation/brief.md)의 W6c-5다.


## 2026-09-10 — W6c-6: 캡션 삽입·자동 번호

참조 탭 또는 삽입 메뉴의 ‘캡션 삽입’에서 종류(그림·표·수식), 현재 블록 위/아래, 설명을 정한다. 번호는 종류별로 문서 순서에 따라 자동 계산한다. 설명은 본문에서 편집한다. 그림 선택과 같은 블록 안의 텍스트 커서를 지원하며, 삽입은 한 번의 실행 취소로 되돌린다. 변경 추적 중 삽입은 비활성화한다.

Word 단위 674개, 공통 필드 12개, 관련 브라우저 12개와 빌드 통과. 실제 앱에서 두 번째 그림에 캡션을 삽입했다. 기존 TypeScript 오류는 남아 있다. 캡션은 독립 문단이므로 객체만 이동·삭제하면 자동으로 따라가지 않는다. 사용자 라벨·장별 번호·캡션 참조·그림 목차·DOCX SEQ 교환은 남아 있다. 로컬 .word.json 저장은 지원한다.

접근성은 사용자 요청으로 보류한다. 다음은 캡션 참조와 그림 목차다. 표 확장 보류 및 Word → Slides → Site 순서를 유지한다.


## 2026-09-10 — W6c-7: 그림 크기 조절·그림 목차

본문 그림을 선택한 뒤 핸들을 끌어 크기를 바꾼다. 모서리는 비율을 유지하며 Shift는 자유 비율이다. 변 핸들은 한 방향만 바꾼다. Esc는 취소하며 놓을 때 한 번 적용한다. 확대율을 반영하고 실행 취소·저장·재열기를 지원한다. 읽기 전용 전환은 공통 선택 UI 구독으로 즉시 반영한다.

참조 → 그림 목차에서 그림·표·수식 중 한 종류를 고른다. 해당 캡션의 번호·설명·페이지를 자동 갱신한다. 제목 목차와 별도로 관리하며 원본 이동·설정 변경·제거를 지원한다. 현재 UI는 구역의 첫 캡션 목차를 관리한다. 같은 구역의 여러 종류별 목록, 캡션 전용 상호 참조와 DOCX SEQ/TOC 교환은 후속 범위다.

Word 단위 676개, 공통 구독 8개, 관련 브라우저 29개와 빌드가 통과했다. 최종 Shift/읽기 전용 재개 검사도 통과했다. 실제 열린 문서에서 첫 그림을 9.79 × 3.15 cm로 키우고 그림 1·2 목차를 넣은 뒤 저장을 확인했다. 전체 TypeScript 기존 오류는 남아 있다. 상세 근거는 [Word 진행 문서](../../.dev/plans/word-product-foundation/brief.md)의 W6c-7에 있다.

다음은 캡션 전용 상호 참조와 DOCX 교환 범위다. 접근성·표 확장은 보류하며 Word → Slides → Site 순서를 유지한다.


## 2026-09-10 — W6c-8: 캡션 상호 참조

참조 → 상호 참조에서 그림·표·수식 캡션을 고른다. 표시는 레이블과 번호, 번호만, 캡션 전체 중에서 정한다. 번호와 설명은 원본을 따라 갱신한다. 참조를 클릭하거나 Enter를 누르면 원본으로 이동한다. 삽입은 한 번의 실행 취소로 되돌리며 로컬 저장·재열기 후에도 연결을 유지한다. 원본 삭제나 중복 식별자는 대상 없음으로 표시한다.

Word 단위 680개, 공통 필드 12개, 관련 브라우저 11개가 통과했다. 최종 조회 최적화 후 관련 단위 13개와 빌드도 통과했다. 실제 앱에 “자세한 결과는 그림 1을 참고하세요.”를 넣고 이동과 저장을 확인했다. 전체 TypeScript의 기존 오류는 남아 있다. 상세 근거는 [Word 진행 문서](../../.dev/plans/word-product-foundation/brief.md)의 W6c-8에 있다.

다음은 DOCX SEQ/TOC·캡션 참조 교환 범위다. 현재 DOCX는 캡션 참조를 지원하지 않으며 경고와 대체 표시를 사용한다. 접근성·표 확장은 보류하며 Word → Slides → Site 순서를 유지한다.
