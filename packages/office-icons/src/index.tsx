/**
  * The suite's icons.
  *
  * ## Why this is a package and not a file in the chrome
  *
  * It was `office-ui/src/icons.tsx`, which was right while there was one product
  * drawing a toolbar. The roadmap has each of these shipping as its own program,
  * and an editor that wants the suite's *pictures* should not have to take the
  * suite's *chrome* to get them: `office-ui` brings four Radix packages, a colour
  * picker, Tailwind's arbitrary values and a token stylesheet. None of that is
  * needed to draw a plus sign.
  *
  * It also puts the icon **library** behind one boundary. `lucide-react` was
  * imported in six files across three packages; here it is imported in one, so
  * swapping it — or drawing these by hand — is one file's work rather than a
  * migration.
  *
  * ## Keyed by the act
  *
  * `add`, `duplicate`, `delete`, `bold`, `merge-cells`. Not by the control that
  * performs it, which is what this was keyed by and what made the shared chrome
  * know Slides' `slide-new` and Word's `look-banded-rows`. A product's toolbar
  * model says which act each of its controls is (`icon: 'duplicate'`), and a third
  * editor names acts it shares without adding its vocabulary here.
  */
import type { ReactElement } from 'react';
import {
  AlignCenter,
  Network,
  Baseline,
  Film,
  Music,
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
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  RotateCw,
  Plus,
  Copy,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  EyeOff,
  Trash2,
  Table,
  Image,
  Type,
  Square,
  Circle,
  Monitor,
  Smartphone,
  Tablet,
  Minus,
  Workflow,
  BringToFront,
  SendToBack,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  FlipHorizontal,
  FlipVertical,
  Group,
  Ungroup,
  PanelLeft,
  MessageSquareText,
  Columns2,
  Rows2,
  LayoutGrid,
  Frame,
  Heading,
  Pilcrow,
  Component,
  PaintBucket,
  Table2,
  Rows4,
  Columns3 as ColumnsBanded,
  MoveUp,
  MoveDown,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Maximize2,
  MessageSquarePlus,
  Pencil,
  Reply,
  Eye,
  Lock,
  LockOpen,
  Quote,
  Code,
  SeparatorHorizontal,
  TriangleAlert,
  CircleCheck,
  type LucideIcon
} from 'lucide-react';

/**
  * What each picture means, for every product in the suite.
  *
  * A model says which controls exist and what each one does; how they are drawn
  * is the suite's, which is why this mapping is here and not in a product package
  * — a toolbar model that imported an icon set could not be rendered anywhere but
  * React.
  *
  * ## Keyed by the act, not by the control that performs it
  *
  * It was keyed by control id — `slide-new`, `slide-delete`, `duplicate-boxes` —
  * which meant this file, the shared chrome, knew Slides' and Word's own
  * vocabularies, and a third editor would have added a third one. An icon is not
  * about a control; it is about what pressing it does, so the key is `add`,
  * `delete`, `duplicate`, and a *product's* toolbar model says which act each of
  * its controls is (`icon: 'duplicate'`).
  *
  * Which merged three entries the ids had kept apart: a slide and a shape are
  * duplicated and deleted by the same act, and the highlighter's colour is the
  * highlighter. And it split one the ids had conflated — `first-column` and
  * `frame-row` happen to share a shape and are not the same idea, so they are two
  * names pointing at one component rather than one name meaning two things.
  *
  * Two names on one component is therefore fine and deliberate; one name on two
  * components is the thing this table exists to prevent.
  *
  * ## Not only acts
  *
  * The bottom of the table is the chrome's own furniture — a disclosure chevron,
  * a tick beside the chosen item, the cross that shuts a dialog. They are not in
  * any toolbar model and nobody presses them for what they *do*; they are still
  * pictures that mean something, and the reason they are here is the same reason
  * the acts are: they were imported straight from `lucide-react` in five files,
  * so the library was five files' worth of a decision instead of one.
  *
  * ## Why drawings at all
  *
  * They were text glyphs before, and two kinds of wrong. The alignment controls
  * used arrows — `⟸ ⟺ ⟹` — but an arrow means *move*, and the one for centre
  * reads as "stretch to both sides", which is nearer to justify than to centre.
  * And the character controls were the plain letters B, I, U, S: the first thing
  * a formatting button should do is look like what it does, and none of them did.
  */
/**
 * **Drawn here**, because no library has them and a word is not a picture.
 *
 * A corner and a side of a box are the two things every design tool draws and this suite spelled:
 * 상좌 상우 하우 하좌 over four number fields, and 상 우 하 좌 over four more. Honest, and eight
 * words where a reader expects eight pictures — which is also how the *previous* version got away
 * with `↖ ↗ ↘ ↙`, four arrows standing in for four drawings, until the rule about not making icons
 * out of characters caught them.
 *
 * `lucide` has nothing that means *this corner of this box*: its `RadiusCorner` is one shape at one
 * corner and there is no set of four, and its padding icons are a box with an inset box, which says
 * *padding* and not *which side*. So these are the first pictures in this package that are not a
 * library's, and they are deliberately the same drawing eight times over with one part filled in —
 * a reader picking a field out of eight is matching a shape, not reading a diagram.
 *
 * The same 16×16 box and the same 2px stroke every lucide icon here uses, so a row of them sits with
 * the rest of a toolbar rather than beside it.
 */
type Drawn = (props: { size?: number }) => ReactElement;

/** The box every one of these is a part of: inset by 2 so a 2px stroke sits inside the 16. */
const BOX = { x: 2.5, y: 2.5, size: 11 };

const outline = (children: ReactElement, size: number): ReactElement => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {children}
  </svg>
);

/**
 * A corner, drawn as **the box faint and that one corner solid** — which is what a reader is picking
 * between when four of these sit in a row.
 *
 * The rounded quarter is a quarter-circle arc with the two straight runs that reach it, so the
 * *shape* says which corner rather than a label saying it in words.
 */
const corner = (path: string): Drawn =>
  function CornerIcon({ size = 16 }: { size?: number }) {
    return outline(
      <>
        <rect
          x={BOX.x}
          y={BOX.y}
          width={BOX.size}
          height={BOX.size}
          rx={1}
          opacity={0.3}
          strokeWidth={1.5}
        />
        <path d={path} />
      </>,
      size
    );
  };

/**
 * A side, drawn as **the box faint and that one edge solid**, with the inset the padding would leave
 * shown as a second faint line. Four of them differ in which edge is drawn, which is the whole of
 * what a reader is choosing.
 */
const side = (path: string): Drawn =>
  function SideIcon({ size = 16 }: { size?: number }) {
    return outline(
      <>
        <rect
          x={BOX.x}
          y={BOX.y}
          width={BOX.size}
          height={BOX.size}
          rx={1}
          opacity={0.3}
          strokeWidth={1.5}
        />
        <path d={path} />
      </>,
      size
    );
  };

/** The eight, keyed the way a panel row names them. */
/**
 * A picture made of two runs: the **structure** at full weight and the **detail** inside it lighter.
 *
 * The shape every one of these three needs — an accordion is rows with a row open, a tab strip is a
 * panel with one tab raised, a form is a box with lines in it — and drawing them one at a time would
 * have been three functions that differ by a string.
 */
const rows = (structure: string, detail: string): Drawn =>
  function RowsIcon({ size = 16 }: { size?: number }) {
    return outline(
      <>
        <path d={structure} strokeWidth={1.6} />
        <path d={detail} opacity={0.55} strokeWidth={1.4} />
      </>,
      size
    );
  };

const DRAWN: Record<string, Drawn> = {
  // A quarter turn at one corner, and the two runs that reach it.
  'corner-top-left': corner('M13.5 2.5H8a5.5 5.5 0 0 0-5.5 5.5v5.5'),
  'corner-top-right': corner('M2.5 2.5H8a5.5 5.5 0 0 1 5.5 5.5v5.5'),
  'corner-bottom-right': corner('M13.5 2.5v5.5A5.5 5.5 0 0 1 8 13.5H2.5'),
  'corner-bottom-left': corner('M2.5 2.5v5.5A5.5 5.5 0 0 0 8 13.5h5.5'),

  // One edge of the box, solid, and the line the padding would hold the content back to.
  'padding-top': side('M2.5 2.5h11M4.5 6h7'),
  'padding-right': side('M13.5 2.5v11M10 4.5v7'),
  'padding-bottom': side('M2.5 13.5h11M4.5 10h7'),
  'padding-left': side('M2.5 2.5v11M6 4.5v7'),

  /**
   * **The three a site builder puts on its rail and this table did not draw.**
   *
   * 아코디언, 탭 and 폼 named `accordion`, `tabs` and `form`, none of which was here — so all three
   * came out as **their own names in Latin letters**, on a Korean rail, in a 240px column. The check
   * that exists to catch exactly that was green, because an exemption written about the favicon
   * attribute happens to be keyed `icon` and the finding's family is `icon` too.
   *
   * Drawn rather than borrowed, because none of the three is a shape a general icon set has: they
   * are compositions this product made up, and the picture has to say *what a reader gets* — rows
   * with one of them open, tabs with one of them chosen, a box with two lines and a button.
   */
  accordion: rows('M2.5 3.5h11M2.5 8.5h11M2.5 12.5h11', 'M4.5 6h7'),
  tabs: rows('M2.5 5.5h11v8h-11z', 'M2.5 5.5V3.5h4.5v2'),
  form: rows('M2.5 2.5h11v11h-11z', 'M5 6h6M5 9h6M5 12h3')
};

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
  /*
   * The three blocks a *page* has that a document reaches for through a style menu.
   *
   * A quotation, code kept as it was typed, and a rule between two things — all three are ordinary
   * blocks in this schema and none of them had a picture, because no product had offered them until
   * a site builder put them on its rail. `every-icon-has-a-picture` is what said so.
   */
  quote: Quote,
  code: Code,
  divider: SeparatorHorizontal,
  indent: IndentIncrease,
  outdent: IndentDecrease,
  'track-changes': FilePen,
  /**
   * Walking a document: the change before this one, the match after it.
   *
   * Down and up, not left and right, which is what these were. Two reasons, and
   * the second is why they changed: a document is scrolled vertically, so "the
   * next one" moves the view down; and the find bar wants this exact pair, which
   * would otherwise have been a second drawing of the one act — the whole thing
   * this table is for. A chevron rather than an arrow because nothing *moves* —
   * the view goes to something that was already there.
   */
  previous: ChevronUp,
  next: ChevronDown,
  /**
   * A **disclosure** — a container in a layer list that can be opened or closed.
   *
   * Sideways and downward rather than `next`/`previous`' up and down pair, and the distinction is
   * the same one `move-up` makes against them: those two walk a list, and these two say whether what
   * is *inside* something is showing. A reader who saw the same chevron for both would be shown one
   * picture for two ideas.
   */
  collapsed: ChevronRight,
  disclosed: ChevronDown,
  accept: Check,
  reject: X,
  // Accept-all and reject-all are the same acts at a different scale, so they
  // are the same icons doubled rather than two unrelated ones a reader has to
  // learn separately.
  'accept-all': CheckCheck,
  'reject-all': X,
  math: Sigma,
  'row-above': ArrowUpToLine,
  'row-below': ArrowDownToLine,
  'row-delete': Rows3,
  'column-left': ArrowLeftToLine,
  'column-right': ArrowRightToLine,
  'column-delete': Columns3,
  'merge-cells': TableCellsMerge,
  'split-cell': TableCellsSplit,
  'align-cell-top': AlignVerticalJustifyStart,
  'align-cell-middle': AlignVerticalJustifyCenter,
  'align-cell-bottom': AlignVerticalJustifyEnd,
  // A turn rather than an arrow: the button turns the text where it is, and an
  // arrow would read as moving the cell somewhere.
  'text-direction': RotateCw,
  // Which regions a table asks its style for. Named for the *region*, because
  // that is what the switch is about — not for what the style will do to it.
  'header-row': Rows2,
  'first-column': Columns2,
  'banded-rows': ColumnsBanded,
  // A bucket, which is what every drawing tool has meant by "fill this" for
  // thirty years. The palette draws it with the colour underneath.
  shading: PaintBucket,
  'table-delete': Table2,

  // A frame in the flow, by the arrangement it makes rather than by the word
  // "frame": a reader choosing between them is choosing a shape on the page.
  'frame-row': Columns2,
  'frame-column': Rows4,
  'frame-grid': LayoutGrid,

  // Slides. A deck's own group — the one a document has no counterpart for.
  add: Plus,
  duplicate: Copy,
  /**
   * Reordering a thing in a list — a slide up one place in the filmstrip.
   *
   * An arrow, because the *thing* moves; `previous`/`next` are chevrons because
   * only the view moves. They were chevrons too, which made them the same drawing
   * as walking a document, and a reader who cannot tell "go to the one above"
   * from "put this one above" is being shown one picture for two ideas. Short
   * arrows rather than `MoveUp`'s full-height one, which is the whole way and is
   * already spoken for by the z-order pair below.
   */
  'move-up': ArrowUp,
  'move-down': ArrowDown,
  /**
   * **Out of here, back to where I came from** — a site's ← 페이지로, a deck's way out of a layout.
   *
   * A full arrow rather than `previous`' chevron, and the distinction is the one three lines up:
   * a chevron moves the *view* one step along a list, and this leaves a place. It was a typed `←`
   * in the site builder, which is a character drawn by whatever font resolves it — the same fault
   * `stack.tsx` records about `␡`, in the same chrome, a year apart.
   */
  back: ArrowLeft,
  /**
   * The three widths a site builder draws at once.
   *
   * The panel said which one it was writing to with **the first syllable of its name** — 데 / 태 / 모
   * — which is not an abbreviation, it is an unreadable label. A one-syllable Korean truncation
   * carries no meaning at all, and the three are exactly what a picture says instantly.
   */
  'screen-desktop': Monitor,
  'screen-tablet': Tablet,
  'screen-mobile': Smartphone,
  // Not an eye: the button *hides*, and an open eye on a visible slide reads as
  // "this is visible" rather than as what pressing it will do.
  hide: EyeOff,
  delete: Trash2,
  'insert-table': Table,
  'insert-image': Image,
  // A film and a sound. `Film` rather than a play triangle, which every product
  // uses for *starting* something — a button that inserts is not a button that
  // plays, and a reader who presses one expecting the other loses their place.
  'insert-video': Film,
  'insert-audio': Music,
  'insert-textbox': Type,
  'insert-rectangle': Square,
  'insert-ellipse': Circle,
  'insert-line': Minus,
  /**
   * Joining two shapes with a line that follows them.
   *
   * A flowchart glyph rather than an arrow: an arrow is a *shape* a reader draws and
   * this is a *relationship* between two of them, which is the whole difference the
   * feature is about.
   */
  connect: Workflow,
  // The one that is a container rather than a shape, which is why it is the
  // outline of a box and not a filled one.
  'insert-frame': Frame,

  /*
   * A **layer's** kind, for the list a reader scans rather than reads.
   *
   * The site builder's layer list said 세로 스택 · 제목 3 · 가로 스택 · 세로 스택 down a 240px column,
   * and finding the picture you just placed meant reading every line. Every tool of this kind puts
   * the shape at the head of the row, because a shape is recognised before a word is read.
   */
  heading: Heading,
  paragraph: Pilcrow,
  component: Component,
  'data-list': Rows3,

  // Arranging what is on a slide. The align icons are named for the axis the
  // *line-up* runs along, which is the opposite of the axis the boxes move on —
  // "align left" stacks them against a vertical line.
  'bring-front': BringToFront,
  'send-back': SendToBack,
  // One step, not all the way — a plain move rather than the stacking icons, so
  // the pair reads as "a bit" beside "the whole way".
  'bring-forward': MoveUp,
  'send-backward': MoveDown,
  'align-boxes-left': AlignStartVertical,
  'align-boxes-centre': AlignCenterVertical,
  'align-boxes-right': AlignEndVertical,
  'align-boxes-top': AlignStartHorizontal,
  'align-boxes-middle': AlignCenterHorizontal,
  'align-boxes-bottom': AlignEndHorizontal,
  'distribute-h': AlignHorizontalSpaceAround,
  'distribute-v': AlignVerticalSpaceAround,
  // Mirroring, beside the aligning it sits with on the ribbon.
  'flip-h': FlipHorizontal,
  'flip-v': FlipVertical,
  group: Group,
  ungroup: Ungroup,
  /**
   * Tidying a diagram, one key per direction.
   *
   * A hierarchy and a chain, because that is what the two answers *look* like — a reader
   * choosing between them is choosing a shape, and a pair of arrows would make them read
   * the labels to find out which.
   */
  'tidy-down': Network,
  // The same picture `connect` uses, and deliberately: joining shapes and tidying what
  // they make are the two halves of drawing a diagram, and a chain is what both look
  // like. A second near-identical glyph would be a distinction without a difference.
  'tidy-right': Workflow,

  /**
   * The host's own chrome, which is not in any toolbar model.
   *
   * Which panes are open is the app's state and not the document's, so these
  * controls are written in the ribbon rather than declared — and they were the
   * last two drawing an emoji beside twenty icons. Keyed here all the same:
   * where a control is declared is a different question from how it is drawn.
   */
  outline: PanelLeft,
  comments: MessageSquareText,

  /**
   * The furniture: what a control looks like when it is part of a widget rather
   * than part of a document.
   *
   * These are the ones the chrome used to import straight from `lucide-react` —
   * a cross in the dialog, a chevron in the select, a tick beside the chosen
   * item, three buttons in the zoom box. Small pictures, and exactly the ones a
   * second editor would import again, differently.
   */
  close: X,
  /** The tick beside the item a select has landed on. `accept`'s drawing, and a
   * different idea: one says "I agree", this one says "this is the one". */
  chosen: Check,
  /** A disclosure — the thing under this opens. `next`'s drawing, because a menu
   * opens downward for the same reason a document scrolls that way. */
  open: ChevronDown,

  // The zoom box. Plus and minus are `add`'s drawing and a step of magnification
  // is not an addition, but a reader has never read them as anything else.
  'zoom-in': Plus,
  'zoom-out': Minus,
  // Fit, which is the only one of the three that needs its own picture: it is not
  // a step in either direction but "as large as the window allows".
  'zoom-fit': Maximize2,

  // Comments. A thread is started, replied to, edited, resolved and thrown away,
  // and only the first of those is about comments specifically.
  'comment-new': MessageSquarePlus,
  edit: Pencil,
  reply: Reply,
  /** Settled, so `accept`'s drawing again — a resolved thread is an agreement. */
  resolve: Check,

  /**
   * A layer list's two toggles, and why each is drawn as the *state* rather than
   * as the act.
   *
   * `hide` above is `EyeOff`, and it is named for what pressing it does — a toolbar
   * button. These two are different: in a list they sit beside a row and say what
   * that row *is*, so a visible layer shows an open eye and a locked one a closed
   * lock. Drawing the act instead would put a crossed-out eye on every visible row,
   * which reads as "twelve hidden layers".
   */
  shown: Eye,
  locked: Lock,
  unlocked: LockOpen,

  /**
   * What is wrong with the document, and what it looks like when nothing is.
   *
   * A **triangle**, which is the one shape in this table that has to be that shape: a warning
   * triangle is the same picture on a road sign, and it is read before it is looked at. A circle
   * would be an announcement and a cross would be an error, and a broken link is neither.
   *
   * `all-clear` is the other half and it is not decoration. A list that draws nothing when there is
   * nothing wrong reads exactly like a list that never ran — which is the failure this repository has
   * written down about itself three times. The tick says the question was asked.
   */
  problem: TriangleAlert,
  'all-clear': CircleCheck
};

/**
  * The icon for an act.
  *
  * A name this file does not know still draws *something* — the name itself, in
  * text — because a model is free to grow a control before the chrome has an icon
  * for it, and a blank button says nothing at all. Both products' ribbons have a
  * test that nothing falls back, which is what keeps that door from being used.
  */
export function Icon({
  name,
  size = 16
}: {
  name: string;
  /**
   * 16 is a toolbar's, and the default because that is where most of these are
   * drawn. Smaller only where the picture sits inside something else — a chip, a
   * line of running text, a button that is mostly its label — because an icon
   * scaled to a widget it is not in reads as a misprint. A number rather than a
   * named scale: there are four call sites, and naming a scale for four is a
   * decision made without a caller.
   */
  size?: number;
}) {
  /*
   * The hand-drawn ones first, because they are the answer where a library has none — see `DRAWN`.
   * They take the same `size` and draw at the same stroke, so a row mixing the two reads as one set.
   */
  const Made = DRAWN[name];
  if (Made) return <Made size={size} />;

  const Glyph = ICONS[name];
  // `aria-hidden` because the button already has an accessible name from the
  // model's label — announcing the icon too would say everything twice.
  return Glyph ? (
    <Glyph size={size} strokeWidth={2} aria-hidden />
  ) : (
    <span aria-hidden data-icon-missing={name}>
      {name}
    </span>
  );
}

/**
  * Every name this file draws, for a test that asks whether a model's icons exist.
  *
  * Exported as a list rather than the table itself, so nothing outside can reach
  * past `Icon` to a component and pin the library in place again.
  */
export const iconNames = (): string[] => [...Object.keys(ICONS), ...Object.keys(DRAWN)];
