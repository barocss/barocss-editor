/**
 * **에디터를 아는 UI** — 제품의 선언을 읽어, 사람이 조작할 표면으로 그립니다.
 *
 * ## 이름이 곧 경계입니다
 *
 * `office-ui` 는 에디터를 **모릅니다** — props 로 받고 callback 으로 내보내는 것이 그 패키지의 규칙이고,
 * 그래서 어느 제품에나 붙습니다. 이 패키지는 에디터를 **압니다**: 구독하고, 선택에 상태를 묻고, 명령을
 * 실행합니다. 두 패키지를 가르는 사실이 그 하나뿐이라 이름이 그것을 말합니다.
 *
 * `office-chrome` 이었습니다. *Chrome* 은 UI 용어이긴 하지만 브라우저와 겹쳐서, 문서를 읽지 않은 사람에게
 * 는 브라우저 지원 패키지로 읽힙니다 — 이름이 설명을 필요로 하면 이름이 진 것입니다. `surface` 와
 * `panel` 은 이미 스키마의 낱말이라(11회, 12회) 쓰면 한 낱말이 두 뜻이 됩니다.
 *
 * ## 이 패키지가 채우는 빈 칸
 *
 * The suite had two horizontal layers and a gap between them:
 *
 * | | 무엇 | 있었나 |
 * |---|---|---|
 * | `office-controls` | 선언의 모양 — `Control`, `MenuModel`, `PanelRow` | 있음 |
 * | `office-ui` | 원시 부품, 에디터를 **모름** | 있음, 10,530줄 |
 * | **여기** | 선언을 읽어 표면으로, 에디터를 **알고** | **비어 있었음** |
 *
 * With nothing in the middle, every app wrote its own: three ribbons (634 + 366 + 454 lines) doing
 * the same five things — subscribe to the editor, read a declaration, ask about each control, draw
 * with `office-ui`, run the command on press. Four of the five are product-neutral; the one that is
 * not is *which list*.
 *
 * ## 무엇이 여기 들어오고, 무엇이 안 들어오나
 *
 * **들어옴** — a surface whose whole job is drawing a declaration. A control strip, a menubar, a
 * property sheet's wiring, a slash menu.
 *
 * **안 들어옴** — anything that knows a product's vocabulary. There is no `if (product === 'site')`
 * here, and there cannot be: this package does not depend on a single product, which is what makes
 * it possible for a product to depend on it.
 *
 * **선택의 위치는 연결합니다.** An editor's selection rectangle and ownership belong here;
 * `office-ui` places and draws the floating surface. Product-specific canvas geometry and
 * manipulation handles remain with the product rather than becoming toolbar behavior.
 *
 * ## 일시적인 UI 상태와 제품 상태를 구분합니다
 *
 * Selection measurements, saved ranges and open toolbar inputs are temporary UI state owned by
 * this connection. Product state — pointer mode, the width being edited, the current slide —
 * arrives as props. Document changes always go through editor commands.
 */
export { ControlRows } from './control-rows';
export { useDocumentRevision, useEditorRevision } from './revision';
export { useSelectionRect } from './use-selection-rect';
export { Controls, type ControlsProps } from './controls';
export { ContextToolbar, useEditorTextSelection, ownsEditorSelection } from './context-toolbar';
export { captureTextSelection } from './capture-text-selection';
export { CLIPBOARD_ACTIONS, clipboardAction, canUseClipboard, useClipboardActions, type ClipboardAction } from './clipboard-actions';
export { useNodeRect, useNodeAnchor } from './use-node-rect';
export { SelectionLinkControl, selectedLink, usableHref } from './selection-link';
export { SelectionColorControl } from './selection-color';
export { SlashMenu } from './slash-menu';
export { controlRows, useControls, type ControlRow, type UseControlsOptions } from './use-controls';

// 문서를 파일로 여닫는 세 몸짓 — 제품은 자기 넷만 댄다.
export * from './file-actions';

export { LatexEditor, latexPreview } from './latex-editor';
export { MathSourceEditor } from './math-source-editor';
export { MathInlineInput } from './math-inline-input';
export { ColumnsEditor } from './columns-editor';

export { useFormatPainter } from './format-painter';
export { LocalDocuments, useLocalDocuments } from './local-documents';
export { DocumentSaveStatus } from './document-save-status';
export { usePropertyCommand } from './use-property-command';

export { useEditorSettings } from './use-editor-settings';
export { useEditorContextVisibility } from './editor-context';
