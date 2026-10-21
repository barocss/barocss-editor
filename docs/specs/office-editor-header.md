---
artifact_type: architecture_spec
status: implemented_local
owner_role: integration
last_updated: 2026-10-04
---

# One native editor header

This bounded #468 checkpoint joins the original identity, document menu, common native edit controls and supported view controls on one 48px header. Workspace navigation remains outside the native slot. There is no permanent second insertion or zoom strip. The header omits the repeated location subtitle; source/access truth stays in the Workspace tree and document details.

Controls use the existing office-ui/office-icons family, 32px minimum targets, 36px groups, 6px side insets and 2px gaps. Detailed tools remain optional native surfaces. Selection formatting remains owned by the native selection, not a second global editor model. Hidden controls are inert. Error/recovery regions remain conditional and can require additional space.

## Supported command destinations

| Product | Common header | Named native destinations retained |
| --- | --- | --- |
| Word | Original title/rename and document menu; native Undo/Redo; + Insert; Panels; search; existing save/access; native zoom/fit | Complete existing document menus (File/Edit/Insert/Format/Review/View and keyboard entries); 19 existing insertion commands; Panels → Outline, Comments, Requirements/decisions and All tools; owned Ribbon Home/Insert/Layout/References/Review/View and selected table/object tools; original local document actions and server export |
| Slides | Original title/document menu; native history; + Insert; Panels; search; save/access; zoom/fit/present | + Insert exposes every native insertion and slide command from SLIDES_TOOLBAR, including disabled table/connector entries; Panels → Layers/components and Properties; native document menu, library, templates/layout/master/size/audit; native contextual text/object/table, inspector, notes, tray and view modes |
| Site | Original title/document menu; native Undo/Redo; + Insert; Panels; search; save/access; preview/zoom/fit | Existing chooser retains all native blocks/containers and assets; Panels → Pages/structure, Properties and All tools; complete original Ribbon and dialogs retain page/component/data identity and tools; native Admin, Rail, DataTable, assets and property controls remain owned by Site |
| Note | Original title/document menu; page management, search and actual save/access | Existing native file/template/export/find/outline/page settings; native page/block/slash/table/board and contextual text controls; server document actions, save/retry/recovery/leave retain their existing guards. No invented zoom or inspector. |

Word model menus/shortcuts are unchanged. Slides header commands reuse the same captured selection intent and lifetime checks. Site commands reuse the same onMenu/Ribbon dispatcher and current page/root authority. This checkpoint does not implement selected-object history #434.

## Pending field and focus ownership

Opening the Slides/Site Panels menu must not commit an unsubmitted native property field. DocumentMenu reports open state during layout, before the menu moves focus. Only the product-owned side-panel blur capture is paused while that menu owns focus. Removing the menu releases that focus ownership. Normal field blur/Enter and navigation delivery keep their existing commit rules. Closing/reopening the panel retains the draft and unchanged native bytes, selection and history; Escape cancels using the existing field behavior.

Site's optional complete-tools Ribbon retains its owner key and keepMounted drafts. A named Panels trigger uses SecondaryPopup's change callback, so reopen resets the closing guard. The menu portal belongs to the same owner, preventing outside-dismiss/toggle races. The popup uses its actual content width, bounded by the native region, and does not cover the Workspace tree. Nested pickers keep their layered dismissal rules. Slides panel toggles and responsive before-inert focus transfer return to their current connected Panels opener.

## Verification boundary

The owned serial desktop config is apps/office/playwright.header.config.ts (port5495, no server reuse). Fictional local originals at1170/1440 light/dark verify populated one-header geometry, actual center-point hits, original and long-title identity, open panels, actual document-menu keyboard navigation and optional Site tools. Native entry tests await the mounted Workspace tree before checking that its original-loading cover is absent; checking absence before mount can observe a temporary native document. Native sample scenarios compare full original content, selection/history and pending drafts through panel toggles/resize, immediate/nested input, navigation refusal and reopen. Source records and producer results are kept with the local checkpoint evidence.

Local fixture/browser and existing controlled auth checks are not actual OIDC/API/PostgreSQL/two-user alpha acceptance or physical OS IME proof. #468/#432 and product-wide release remain incomplete. No routine push/PR, issue closure or deployment is implied.
