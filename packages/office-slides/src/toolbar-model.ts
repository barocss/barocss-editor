import { WORD_TEXT_COLOR, WORD_TEXT_HIGHLIGHT } from '@barocss/office-controls';
import {
  commandsIn,
  iconsIn,
  markTypesIn,
  stateOfAttribute,
  stateOfMark,
  type Control,
  type ControlGroup
} from '@barocss/office-controls';

/**
 * What a deck's toolbar consists of — not how it is drawn.
 *
 * The same division Word made and for the same reason: no DOM here, so a host
 * draws these with whatever it likes, and the components that do the drawing
 * (`@barocss/office-ui`) know nothing about slides. The two products look alike
 * because they draw with the same components, **not** because they share a
 * list — Word's toolbar has fonts and tracked changes, this one has slides and
 * boxes, and a shared list would have to be filtered by product at every use.
 *
 * Every control answers a question about the selection and runs a command,
 * holding no state of its own. State it held could disagree with the document,
 * and a bold button that remembers being pressed is a button that lies after an
 * undo.
 *
 * The answers are three-valued for the same reason Word's are: a selection
 * across text that is partly bold is *indeterminate* rather than off, and
 * drawing that as definite invites a click that silently reformats everything.
 */

/**
 * A control in a deck's toolbar: the suite's `Control` plus what only a deck's
 * controls need.
 *
 * `id`, `label`, `icon`, `command`, `payload` and `state` mean the same thing in
 * every product, so they are declared once in `@barocss/office-controls`. They
 * were restated here — this interface was Word's with three fields added — which
 * meant the shared half existed twice and the two copies could drift.
 */
export interface SlidesToolbarControl extends Control {
  /**
   * That this control acts on the current *slide* rather than on the selection.
   *
   * A deck's own commands take a `slideId`, and which slide that is is a fact
   * about the reader rather than about the document — so the control says it
   * needs one and the host supplies it. Without this the model would have to
   * know what the app is looking at, which is the thing it must not know.
   */
  needsSlide?: boolean;
  /**
   * That this control's state is the current slide's, not the selection's.
   *
   * `hidden` is the only one today. Same reasoning as `needsSlide`: the model
   * says which question is being asked and the host, which knows which slide is
   * on screen, answers it.
   */
  slideFlag?: 'hidden';
  /**
   * That this control needs a file before its command can run.
   *
   * A picture is the only one. Every other command here has what it needs the
   * moment the button is pressed; this one needs something only the reader can
   * choose, so the host opens a picker and calls the command with what comes
   * back. The model says *that* a file is needed without knowing what a file
   * picker is — the same division as `needsSlide`.
   */
  needsFile?: boolean;
}

/** A run of a deck's controls. The shape is the suite's. */
export type SlidesToolbarGroup = ControlGroup<SlidesToolbarControl>;

/**
 * Reading a mark and reading a block attribute — the suite's, under local names.
 *
 * Both were written here with the same bodies as Word's copies, which is two
 * products disagreeing waiting to happen. Aliased because `mark('bold')` reads
 * better than the longer name in a two-hundred-line declaration.
 */
const mark = stateOfMark;
const attribute = stateOfAttribute;

export const SLIDES_TOOLBAR: SlidesToolbarGroup[] = [
  {
    id: 'history',
    controls: [
      { id: 'undo', label: '실행 취소', icon: 'undo', command: 'historyUndo' },
      { id: 'redo', label: '다시 실행', icon: 'redo', command: 'historyRedo' }
    ]
  },

  /**
   * The group a document has no counterpart for.
   *
   * A page is a consequence of how much text there is; a slide is a thing the
   * author makes, moves, hides and throws away. This is the whole of what makes
   * a deck's toolbar not a word processor's.
   */
  {
    id: 'slide',
    controls: [
      { id: 'slide-new', label: '새 슬라이드', icon: 'add', command: 'insertSlide', needsSlide: true },
      { id: 'slide-duplicate', label: '슬라이드 복제', icon: 'duplicate', command: 'duplicateSlide', needsSlide: true },
      { id: 'slide-up', label: '앞으로 이동', icon: 'move-up', command: 'moveSlide', needsSlide: true },
      { id: 'slide-down', label: '뒤로 이동', icon: 'move-down', command: 'moveSlide', needsSlide: true },
      {
        id: 'slide-hide',
        label: '발표에서 숨기기',
        icon: 'hide',
        command: 'toggleSlideHidden',
        needsSlide: true,
        slideFlag: 'hidden'
      },
      { id: 'slide-delete', label: '슬라이드 삭제', icon: 'delete', command: 'deleteSlide', needsSlide: true }
    ]
  },

  {
    id: 'character',
    controls: [
      { id: 'bold', label: '굵게', icon: 'bold', command: 'toggleBold', state: mark('bold') },
      { id: 'italic', label: '기울임', icon: 'italic', command: 'toggleItalic', state: mark('italic') },
      {
        id: 'underline',
        label: '밑줄',
        icon: 'underline',
        command: 'toggleUnderline',
        state: mark('underline')
      },
      {
        id: 'strike',
        label: '취소선',
        icon: 'strike',
        command: 'toggleStrikeThrough',
        state: mark('strikethrough')
      },
      {
        id: 'highlight',
        label: '형광펜',
        icon: 'highlight',
        command: 'toggleHighlight',
        state: mark('highlight')
      }
    ]
  },

  {
    id: 'paragraph',
    controls: [
      {
        id: 'align-left',
        label: '왼쪽 맞춤',
        icon: 'align-left',
        command: 'alignLeft',
        state: attribute('alignment', 'left')
      },
      {
        id: 'align-center',
        label: '가운데 맞춤',
        icon: 'align-center',
        command: 'alignCenter',
        state: attribute('alignment', 'center')
      },
      {
        id: 'align-right',
        label: '오른쪽 맞춤',
        icon: 'align-right',
        command: 'alignRight',
        state: attribute('alignment', 'right')
      },
      {
        id: 'align-justify',
        label: '양쪽 맞춤',
        icon: 'align-justify',
        command: 'alignJustify',
        state: attribute('alignment', 'justify')
      }
    ]
  },

  /**
   * A deck's bullets are `list` nodes holding `listItem`s — the shared kit's
   * commands, which Word replaces with numbering on paragraphs. The first place
   * the two products genuinely disagree about a node rather than about a pixel.
   */
  {
    id: 'list',
    controls: [
      { id: 'bullet-list', label: '글머리 기호', icon: 'bullet-list', command: 'toggleBulletList' },
      { id: 'ordered-list', label: '번호 매기기', icon: 'ordered-list', command: 'toggleOrderedList' },
      { id: 'outdent', label: '내어쓰기', icon: 'outdent', command: 'outdentText' },
      { id: 'indent', label: '들여쓰기', icon: 'indent', command: 'indentText' }
    ]
  },

  /**
   * Putting something on the slide.
   *
   * The group that makes this a presentation editor. A text box first, because
   * it is what a deck is mostly made of, then the shapes — and each is its own
   * command rather than one `insertShape` with a kind, so the conformance check
   * can be told what each produces.
   */
  {
    id: 'insert',
    controls: [
      { id: 'insert-textbox', label: '텍스트 상자', icon: 'insert-textbox', command: 'insertTextBox' },
      { id: 'insert-rectangle', label: '사각형', icon: 'insert-rectangle', command: 'insertRectangle' },
      { id: 'insert-ellipse', label: '타원', icon: 'insert-ellipse', command: 'insertEllipse' },
      { id: 'insert-line', label: '선', icon: 'insert-line', command: 'insertLine' },
      { id: 'insert-table', label: '표 삽입', icon: 'insert-table', command: 'insertTable' },
      /**
       * A frame: a box that holds other boxes and can arrange them.
       *
       * Beside the shapes rather than with them, because it is not one — a
       * shape is a thing you see and a frame is a thing you put things in. It
       * has been drawable and arrangeable since auto-layout was written, and
       * until now there was no way to make one.
       */
      { id: 'insert-frame', label: '프레임', icon: 'insert-frame', command: 'insertFrame' },
      /**
       * Joining two shapes with a line that remembers the pair.
       *
       * Needs *two* shapes, in the order they were picked — a connector has a
       * direction, and the arrowhead is on the end. So it is the one insert here whose
       * `canExecute` is about the selection rather than about the slide, and the button
       * is grey until a reader has chosen the two things to join.
       */
      {
        id: 'insert-connector',
        label: '연결선',
        icon: 'connect',
        command: 'insertConnector'
      },
      /**
       * The one control that cannot run from a click alone.
       *
       * Every other command here has everything it needs the moment it is
       * pressed. A picture needs a *file*, which only the reader can choose, so
       * the app opens a picker and calls the command with what comes back —
       * `needsFile` is how the model says so without knowing what a file picker
       * is. Left as a plain control it drew a button that was permanently
       * disabled, because `insertPicture` quite correctly refuses a payload with
       * no `src` in it.
       */
      { id: 'insert-image', label: '그림 삽입', icon: 'insert-image', command: 'insertPicture', needsFile: true },
      /**
       * A film and a sound, which need a file for the same reason a picture does
       * — and one command each, because a command that puts a node in the
       * document has to say which node it makes.
       */
      { id: 'insert-video', label: '동영상 삽입', icon: 'insert-video', command: 'insertVideo', needsFile: true },
      { id: 'insert-audio', label: '오디오 삽입', icon: 'insert-audio', command: 'insertAudio', needsFile: true }
    ]
  },

  /**
   * What is in front, what lines up with what, and what travels together.
   *
   * Three groups rather than one, because a toolbar's separators are the only
   * thing telling a reader that twenty icons are three questions. Drawn as one
   * run they read as a wall — measured by looking at it — and a reader hunting
   * for "align left" has no idea which third of it to search.
   *
   * Every control here acts on the *selection* rather than on a named box, so
   * none of them carries `needsSlide`: the host runs them and the command reads
   * the selection, which is the only place that knows what three shapes the
   * reader shift-clicked.
   */
  {
    id: 'order',
    /*
     * Four z-order controls, and a deck with nothing selected has no z to order. Measured with one box chosen: 0 of 4 disabled; with nothing: 4 of 4.
     */
    when: 'shape',
    controls: [
      { id: 'bring-front', label: '맨 앞으로', icon: 'bring-front', command: 'bringToFront' },
      // One step, which is the one a reader reaches for when two shapes overlap
      // and only one of them is in the way. Both commands existed and only the
      // all-the-way pair was on the toolbar.
      { id: 'bring-forward', label: '앞으로 가져오기', icon: 'bring-forward', command: 'bringForward' },
      { id: 'send-backward', label: '뒤로 보내기', icon: 'send-backward', command: 'sendBackward' },
      { id: 'send-back', label: '맨 뒤로', icon: 'send-back', command: 'sendToBack' }
    ]
  },

  {
    id: 'align',
    /*
     * Twelve, and ten of them want a **set** — aligning one thing against itself has no meaning. Measured with one box: 10 of 12 disabled; with nothing: 12 of 12.
     */
    when: 'shape',
    controls: [
      { id: 'align-boxes-left', label: '왼쪽 정렬', icon: 'align-boxes-left', command: 'alignBoxesLeft' },
      { id: 'align-boxes-centre', label: '가운데 정렬', icon: 'align-boxes-centre', command: 'alignBoxesCentre' },
      { id: 'align-boxes-right', label: '오른쪽 정렬', icon: 'align-boxes-right', command: 'alignBoxesRight' },
      { id: 'align-boxes-top', label: '위쪽 정렬', icon: 'align-boxes-top', command: 'alignBoxesTop' },
      { id: 'align-boxes-middle', label: '중간 정렬', icon: 'align-boxes-middle', command: 'alignBoxesMiddle' },
      { id: 'align-boxes-bottom', label: '아래쪽 정렬', icon: 'align-boxes-bottom', command: 'alignBoxesBottom' },
      {
        id: 'distribute-h',
        label: '가로 간격 맞춤',
        icon: 'distribute-h',
        command: 'distributeBoxesHorizontally'
      },
      {
        id: 'distribute-v',
        label: '세로 간격 맞춤',
        icon: 'distribute-v',
        command: 'distributeBoxesVertically'
      },
      /**
       * Mirroring, beside the aligning.
       *
       * Here rather than in the properties panel — which is where Figma keeps it —
       * because this is where *arranging* already lives in this product, and a
       * reader looking for "do something to where this shape is" should find one
       * place rather than two. See `flip.ts` for why it is a toggle.
       */
      { id: 'flip-h', label: '좌우 뒤집기', icon: 'flip-h', command: 'flipBoxes', payload: { axis: 'x' } },
      { id: 'flip-v', label: '위아래 뒤집기', icon: 'flip-v', command: 'flipBoxes', payload: { axis: 'y' } },
      /**
       * Tidying a diagram, which is arranging by what the shapes are *joined* to
       * rather than by where they are — so it belongs beside the aligning rather
       * than in a menu of its own.
       *
       * Two directions and no more. A flow chart runs down and a process runs
       * across; the rest of what a layout engine can be asked (rank separation,
       * a chosen root, orthogonal edges) is a dialog, and a dialog is what stops
       * a reader pressing the button to see what it does.
       */
      {
        id: 'tidy-graph-down',
        label: '아래로 정리',
        icon: 'tidy-down',
        command: 'arrangeGraph',
        payload: { direction: 'down' }
      },
      {
        id: 'tidy-graph-right',
        label: '오른쪽으로 정리',
        icon: 'tidy-right',
        command: 'arrangeGraph',
        payload: { direction: 'right' }
      }
    ]
  },

  /**
   * A table on a slide, which the deck could make and could not edit.
   *
   * `insertTable` has been on this toolbar since the deck had one, and the eight
   * commands that change a table's shape were registered and reachable by
   * nothing — no button, no key. Found when the deck's conformance stopped
   * measuring its own commands from a list written in the test and started
   * reading the kit it actually ships.
   *
   * They are structure only, which is what a deck's table needs: rows, columns,
   * merging, and taking the whole thing away. A table's *style* is Word's
   * apparatus — a gallery and a row-height field — and the deck declines those
   * commands rather than registering ones it cannot reach; see
   * `createSlidesOwnExtensions`.
   *
   * Every one is unavailable outside a table, which is the command's own answer
   * rather than this model's: `canExecute` asks where the caret is.
   */
  {
    id: 'table',
    /*
     * Nine that ask the table around the caret, and a deck is mostly not about tables. Measured in every state but one: 9 of 9 disabled.
     */
    when: 'table',
    controls: [
      { id: 'row-above', label: '위에 행 삽입', icon: 'row-above', command: 'insertRowAbove' },
      { id: 'row-below', label: '아래에 행 삽입', icon: 'row-below', command: 'insertRowBelow' },
      { id: 'row-delete', label: '행 삭제', icon: 'row-delete', command: 'deleteRow' },
      { id: 'column-left', label: '왼쪽에 열 삽입', icon: 'column-left', command: 'insertColumnLeft' },
      { id: 'column-right', label: '오른쪽에 열 삽입', icon: 'column-right', command: 'insertColumnRight' },
      { id: 'column-delete', label: '열 삭제', icon: 'column-delete', command: 'deleteColumn' },
      { id: 'cells-merge', label: '셀 병합', icon: 'merge-cells', command: 'mergeCells' },
      { id: 'cell-split', label: '셀 분할', icon: 'split-cell', command: 'splitCell' },
      { id: 'table-delete', label: '표 삭제', icon: 'table-delete', command: 'deleteTable' }
    ]
  },

  {
    id: 'group',
    /*
     * Grouping needs things to group. Measured with one box: 2 of 4; with nothing: 4 of 4.
     */
    when: 'shape',
    controls: [
      { id: 'group-boxes', label: '그룹', icon: 'group', command: 'groupBoxes' },
      { id: 'ungroup-boxes', label: '그룹 해제', icon: 'ungroup', command: 'ungroupBoxes' },
      { id: 'duplicate-boxes', label: '복제', icon: 'duplicate', command: 'duplicateBoxes' },
      { id: 'delete-boxes', label: '삭제', icon: 'delete', command: 'deleteBoxes' }
    ]
  }
];

/**
 * Every command the toolbar runs, so an editor can be asked whether it has them.
 *
 * The point of it being a function over the model rather than a written list:
 * a control added without a command behind it is a button that does nothing,
 * and that is a fault nobody notices, because a button that does nothing looks
 * exactly like a button whose effect you did not see.
 */
/**
 * The commands a deck's toolbar runs, and the marks it reads — its own inventory,
 * over the suite's counting.
 *
 * The palettes go in as a second argument, which is the part a hand-written copy
 * of this forgets: a colour is not one of a list, so a palette is invisible to a
 * check that only walks the groups — and what a check cannot see, it reports as
 * fine. Word's list had exactly this hole and it was filled the same way, twice,
 * which is why the counting is shared now and only the *inventory* is here.
 *
 * Word's palettes rather than a second pair, for the same reason the deck's
 * ribbon draws Word's font and size boxes: two products disagreeing about what a
 * text-colour button does would be one of them wrong. Which package that shared
 * *content* should live in is a separate question — see `office-text` in the
 * backlog; what has moved here is the shared *vocabulary*.
 */
export function slidesToolbarCommands(groups: SlidesToolbarGroup[] = SLIDES_TOOLBAR): string[] {
  return commandsIn(groups, [WORD_TEXT_COLOR, WORD_TEXT_HIGHLIGHT]);
}

/**
 * The icons the deck's controls ask for, so `every-icon-has-a-picture` can ask the
 * table whether it draws each. The palettes go in for the same reason the commands'
 * do: a palette has an icon and is not a `Control`.
 */
export function slidesToolbarIcons(groups: SlidesToolbarGroup[] = SLIDES_TOOLBAR): string[] {
  return iconsIn(groups, [WORD_TEXT_COLOR, WORD_TEXT_HIGHLIGHT]);
}

export function slidesToolbarMarkTypes(groups: SlidesToolbarGroup[] = SLIDES_TOOLBAR): string[] {
  // De-duplicated, unlike Word's: a deck names `fontSize` on more than one
  // control. `markTypesIn` reports every naming and this asks a set question.
  return [...new Set(markTypesIn(groups))];
}
