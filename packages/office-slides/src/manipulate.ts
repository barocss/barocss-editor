/**
 * Dragging a box, as arithmetic — in the **canvas layer**, re-exported here.
 *
 * It was 630 lines in this package and it named a product three times, all three as a parameter:
 * move, resize, rotate, snap, marquee, and hit-testing a turned box are as true of a drawing in a
 * page as of a shape on a slide, and Word's canvas is the first thing to need them again
 * (`docs/SHARED-LAYER.md`). The file stays as a name so a deck's callers go on saying
 * `from './manipulate'` — the same thing `layout-commands` does for the arrangement.
 */
export {
  RESIZE_HANDLES,
  moveBox,
  resizeBox,
  angleOf,
  snapAngle,
  unionOf,
  contains,
  unrotate,
  intersects,
  alignBoxes,
  distributeBoxes,
  intoFrame,
  outOfFrame,
  guidesFor,
  snapBox,
  snapResize,
  type Align,
  type Delta,
  type Guide,
  type Handle,
  type ResizeOptions
} from '@barocss/office-canvas';
