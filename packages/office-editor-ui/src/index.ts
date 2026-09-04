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
 * **안 들어옴** — anything that reads coordinates. An overlay draws handles where a block is on a
 * canvas, at a scale, in a view; that is not a declaration and it does not belong to this layer
 * until something has said what the shared shape of *a thing with a position* is.
 *
 * ## React 를 쓰지만 상태는 갖지 않습니다
 *
 * Everything here takes an `Editor` and a declaration and draws. What a reader is *in* — which mode
 * the pointer is in, which width is being edited, which slide is on screen — is the assembling
 * layer's, and it arrives as props. That is the same rule `office-ui` follows one layer down, one
 * step further up: props in, commands out.
 */
export { ControlRows } from './control-rows';
export { useDocumentRevision, useEditorRevision } from './revision';
export { useSelectionRect } from './use-selection-rect';
export { Controls, type ControlsProps } from './controls';
export { SlashMenu } from './slash-menu';
export { controlRows, useControls, type ControlRow, type UseControlsOptions } from './use-controls';
