import {
  AlignCenter,
  Baseline,
  IndentDecrease,
  IndentIncrease,
  List,
  ListOrdered,
  CaseSensitive,
  Highlighter,
  Subscript,
  Superscript,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  FilePen,
  X,
  Sigma,
  ArrowUpToLine,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  Rows3,
  Columns3,
  TableCellsMerge,
  TableCellsSplit,
  type LucideIcon
} from 'lucide-react';

/**
 * What each toolbar control looks like.
 *
 * The model says which controls exist and what each one does; how they are drawn
 * is the app's, which is why this mapping is here and not in the product package
 * — a toolbar model that imported an icon set could not be rendered anywhere but
 * React.
 *
 * They were text glyphs before, and two kinds of wrong. The alignment controls
 * used arrows — `⟸ ⟺ ⟹` — but an arrow means *move*, and the one for centre
 * reads as "stretch to both sides", which is nearer to justify than to centre.
 * And the character controls were the plain letters B, I, U, S: the first thing
 * a formatting button should do is look like what it does, and none of them did.
 */
const ICONS: Record<string, LucideIcon> = {
  undo: Undo2,
  redo: Redo2,
  bold: Bold,
  italic: Italic,
  underline: Underline,
  strike: Strikethrough,
  'align-left': AlignLeft,
  'align-center': AlignCenter,
  'align-right': AlignRight,
  'align-justify': AlignJustify,
  superscript: Superscript,
  subscript: Subscript,
  'small-caps': CaseSensitive,
  highlight: Highlighter,
  'font-color': Baseline,
  'bullet-list': List,
  'ordered-list': ListOrdered,
  indent: IndentIncrease,
  outdent: IndentDecrease,
  'track-changes': FilePen,
  'prev-revision': ChevronLeft,
  'next-revision': ChevronRight,
  'accept-revision': Check,
  'reject-revision': X,
  // Accept-all and reject-all are the same acts at a different scale, so they
  // are the same icons doubled rather than two unrelated ones a reader has to
  // learn separately.
  'accept-all-revisions': CheckCheck,
  'reject-all-revisions': X,
  'math-linear': Sigma,
  'row-above': ArrowUpToLine,
  'row-below': ArrowDownToLine,
  'row-delete': Rows3,
  'column-left': ArrowLeftToLine,
  'column-right': ArrowRightToLine,
  'column-delete': Columns3,
  'cells-merge': TableCellsMerge,
  'cell-split': TableCellsSplit
};

/**
 * The icon for a control, or its text as written in the model.
 *
 * A control with no icon here still draws: the model is free to grow a control
 * before this file knows about it, and a missing glyph should be a plain label
 * rather than a blank button.
 */
export function ControlIcon({ id, fallback }: { id: string; fallback: string }) {
  const Icon = ICONS[id];
  // `aria-hidden` because the button already has an accessible name from the
  // model's label — announcing the icon too would say everything twice.
  return Icon ? (
    <Icon size={16} strokeWidth={2} aria-hidden />
  ) : (
    <span aria-hidden>{fallback}</span>
  );
}
