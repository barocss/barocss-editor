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

export { Tip, TipProvider } from './tip';
export { cn } from './cn';
export { onApple } from './platform';
export { FloatingSurface } from './floating';

export {
  SegmentedControl,
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
  ToolbarToggle,
  type ToggleState
} from './toolbar';

export { ChoiceSelect, type ChoiceOption } from './select';

export { ColorPalette, type Swatch } from './palette';

/**
 * The panel's colour control, which can hold what the document can hold.
 *
 * `<input type="color">` is the browser's dialog and cannot express a theme
 * slot — see `color-field.tsx` for why that mattered enough to build one.
 */
export { ColorField, type ThemeSwatch } from './color-field';

/**
 * The picker itself, for the places that open one directly — a gradient's stop,
 * an effect's colour — rather than through a field.
 */
export { ColorPicker, type ColorPickerProps } from './color-picker';

export { Dialog, DialogButton } from './dialog';
export { PropertySheet, type SheetGroup, type SheetRow } from './property-sheet';

export {
  PropertyPanel,
  PropertyGroup,
  PropertyRow,
  PropertyNumber,
  PropertyColor,
  PropertyToggle,
  PropertyChoice,
  PropertyEmpty,
  PropertyLink,
  PropertyTabs
} from './properties';

/**
 * An axis: a span, and where the ticks go along it.
 *
 * Three axes were drawn in this repository with three different answers — see the
 * file. Pure arithmetic, no editor, no DOM.
 */
export { axisTicks, timeStep, type AxisStep, type AxisTick } from './axis';

/**
 * The window's frame: chrome on top, a row of panes, something along the bottom.
 *
 * Layout only — the column, the `flex`es and the two `min-*: 0`s that were written
 * twice. No colours: those are what make each product look like itself.
 */
export { AppShell, AppChrome, AppBody, AppMain } from './shell';

/**
 * Ctrl (or ⌘) with the wheel, zooming about the point under the pointer.
 *
 * Both products had this gesture and neither knew the other did. The deck's copy
 * carried three measured corrections Word's never had — see the file for which,
 * and for what each one cost when it was missing.
 */
export { useWheelZoom, anchorOf, anchorShift, type WheelZoom } from './wheel-zoom';
/*
 * The other answer to the same gesture, for a pane that has no scrollbars — see `viewport.ts` for
 * which one a product wants and why the scrolling one cannot anchor a zoom outward from a fitted
 * view.
 */
export { useViewport, zoomIn, zoomOut, ZOOM_STEP, type Viewport, type ViewportControls } from './viewport';

export {
  LENGTH_UNITS,
  rulerStep,
  toDisplay,
  fromDisplay,
  stepFor,
  unitSuffix,
  type LengthUnit
} from './units';

/**
 * The suite's icons, re-exported rather than owned.
 *
 * They live in `@barocss/office-icons` now — an editor that wants the pictures
 * should not have to take four Radix packages and a token stylesheet to get them.
 * Re-exported here so the chrome's own surface is unchanged for anything that was
 * already importing it from the chrome.
 */
export { Icon } from '@barocss/office-icons';

export { ZoomControl } from './zoom';

/**
 * The controls a product was hand-rolling because this package had none — and
 * the token contract that makes a shared control match its neighbours.
 *
 * `tokens.css` has to be imported by the product's own stylesheet; see the file
 * for why the palette cannot live in the components.
 */
export {
  Button,
  IconButton,
  Choice,
  Field,
  FieldGroup,
  NumberField,
  TextField,
  type ButtonTone
} from './controls';

/**
 * A menu at a point — what a right-click opens. Hand-rolled rather than Radix's,
 * because Radix's owns the *trigger* and what is being right-clicked here is a
 * canvas: the target is hit-tested against the model, not read off an element.
 */
export { Menu, type MenuBlock, type MenuEntry } from './menu';
export { MenuBar, type MenuBarMenu } from './menubar';

/**
 * Choosing a file: the one form control a product cannot style, and the one
 * detail everybody forgets — an input keeps its value, so the same file twice
 * fires once.
 */
export { FilePick } from './file-pick';

/**
 * A stack a reader arranges — fills, effects, layers. One control drawn three
 * times in every design tool, and twice in this repository before it was one.
 */
export { StackList, StackRow, useDismiss, useStackOrder } from './stack';

/**
 * A counter that goes up whenever something says "read again".
 *
 * Knows nothing about what said so — pass it a subscribe function. The half that
 * knows which of a host's events mean "an answer might be different now" is the
 * host's: see `watchAnswers` in `editor-core`.
 */
export { useRevision } from './revision';

/**
 * The shape of a sound, and the part of it that plays.
 *
 * The arithmetic and the strip are separate on purpose: reducing a million samples
 * to a hundred bars is where this goes wrong in ways only a test catches — a mean
 * instead of a peak draws a plausible, quiet, *wrong* picture — and the drawing is
 * fifty lines of SVG.
 *
 * Nothing here knows what a millisecond is: the window is a fraction of the strip
 * both ways, so a caller owns what "to the end" means about its own documents.
 */
export {
  momentAt,
  peaksOf,
  peaksOfAudio,
  trimWindow,
  waveBars,
  type SampledAudio,
  type WaveBar
} from './waveform';
export { Waveform } from './waveform-strip';

/**
 * The peaks of a sound at a URL, decoded once and kept.
 *
 * The decode is the browser's and the cache is the point: a panel that re-decodes a
 * minute of audio on every render is a panel that stutters, and a deck draws the same
 * film's strip every time a reader touches its step.
 */
export { useAudioPeaks, clearPeakCache } from './audio-peaks';
