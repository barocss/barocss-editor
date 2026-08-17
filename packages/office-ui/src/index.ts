/**
 * The suite's chrome.
 *
 * Office products look alike, and that is the feature: a reader who has used
 * one knows where the toolbar is, what a dialog's buttons do, and that the
 * panel on the right holds the properties of whatever is selected. A suite
 * whose products each invented their own is a suite in name only.
 *
 * ## What belongs here, and what does not
 *
 * This holds **how a control is drawn** and nothing about what any control does.
 * The division already existed inside Word and it was the right one:
 * `office-word/toolbar-model.ts` says which controls exist, what each reads out
 * of the selection and what it runs, with no DOM anywhere in it; the drawing
 * lived in the app. That drawing is what moved here.
 *
 * So a product still declares its own toolbar — Word's has fonts and tracked
 * changes, Slides' has boxes and slide order — and the two draw identically
 * because they draw with the same components, not because they share a list.
 *
 * ## The rule that put it here
 *
 * `docs/SHARED-LAYER.md`: **share what two implementations disagreeing about
 * would be a bug.** Two products disagreeing about which node draws a rectangle
 * is a legitimate difference. Two products disagreeing about where a dialog's
 * confirm button sits is one of them being wrong.
 *
 * React, and only this package is. The engine renders through a DOM or a React
 * renderer and neither is assumed anywhere below this line — which is exactly
 * why the toolbar *model* stays in the product package and the components stay
 * here.
 */

export { cn } from './cn';

export { Toolbar, ToolbarGroup, ToolbarSeparator, ToolbarToggle } from './toolbar';

export { ChoiceSelect, type ChoiceOption } from './select';

export { Dialog, DialogButton } from './dialog';

export {
  PropertyPanel,
  PropertyGroup,
  PropertyRow,
  PropertyNumber,
  PropertyColor,
  PropertyEmpty
} from './properties';

export { ControlIcon } from './icons';

export { ZoomControl } from './zoom';
