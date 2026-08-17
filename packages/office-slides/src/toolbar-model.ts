import type { MarkState, SelectionSummary } from '@barocss/editor-core';
import { markState } from '@barocss/editor-core';

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

export interface SlidesToolbarControl {
  id: string;
  label: string;
  /** A fallback glyph; the host maps `id` to an icon and falls back to this. */
  icon: string;
  command: string;
  payload?: Record<string, unknown>;
  /** How to read this control's state out of the selection. */
  state?: ((summary: SelectionSummary) => MarkState) & { markType?: string };
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
}

export interface SlidesToolbarGroup {
  id: string;
  controls: SlidesToolbarControl[];
}

/** Reads a mark: on when it covers everything, mixed when it covers some. */
const mark = (type: string) => {
  const read = (summary: SelectionSummary): MarkState => markState(summary, type);
  read.markType = type;
  return read as ((summary: SelectionSummary) => MarkState) & { markType: string };
};

/**
 * Reads a block attribute: on when every block agrees, mixed when they do not.
 *
 * Disagreement has to be visible. An alignment button showing "off" for a
 * selection of a left-aligned and a centred paragraph says neither is centred,
 * which is false.
 */
const attribute =
  (key: string, value: unknown) =>
  (summary: SelectionSummary): MarkState => {
    if (summary.mixedAttributes.includes(key)) return 'mixed';
    return summary.blockAttributes[key] === value ? 'on' : 'off';
  };

export const SLIDES_TOOLBAR: SlidesToolbarGroup[] = [
  {
    id: 'history',
    controls: [
      { id: 'undo', label: '실행 취소', icon: '↶', command: 'historyUndo' },
      { id: 'redo', label: '다시 실행', icon: '↷', command: 'historyRedo' }
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
      { id: 'slide-new', label: '새 슬라이드', icon: '＋', command: 'insertSlide', needsSlide: true },
      { id: 'slide-duplicate', label: '슬라이드 복제', icon: '⧉', command: 'duplicateSlide', needsSlide: true },
      { id: 'slide-up', label: '앞으로 이동', icon: '↑', command: 'moveSlide', needsSlide: true },
      { id: 'slide-down', label: '뒤로 이동', icon: '↓', command: 'moveSlide', needsSlide: true },
      {
        id: 'slide-hide',
        label: '발표에서 숨기기',
        icon: '⦸',
        command: 'toggleSlideHidden',
        needsSlide: true,
        slideFlag: 'hidden'
      },
      { id: 'slide-delete', label: '슬라이드 삭제', icon: '␡', command: 'deleteSlide', needsSlide: true }
    ]
  },

  {
    id: 'character',
    controls: [
      { id: 'bold', label: '굵게', icon: 'B', command: 'toggleBold', state: mark('bold') },
      { id: 'italic', label: '기울임', icon: 'I', command: 'toggleItalic', state: mark('italic') },
      {
        id: 'underline',
        label: '밑줄',
        icon: 'U',
        command: 'toggleUnderline',
        state: mark('underline')
      },
      {
        id: 'strike',
        label: '취소선',
        icon: 'S',
        command: 'toggleStrikeThrough',
        state: mark('strikethrough')
      },
      {
        id: 'highlight',
        label: '형광펜',
        icon: '▨',
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
        icon: '⟸',
        command: 'alignLeft',
        state: attribute('alignment', 'left')
      },
      {
        id: 'align-center',
        label: '가운데 맞춤',
        icon: '⟺',
        command: 'alignCenter',
        state: attribute('alignment', 'center')
      },
      {
        id: 'align-right',
        label: '오른쪽 맞춤',
        icon: '⟹',
        command: 'alignRight',
        state: attribute('alignment', 'right')
      },
      {
        id: 'align-justify',
        label: '양쪽 맞춤',
        icon: '☰',
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
      { id: 'bullet-list', label: '글머리 기호', icon: '•', command: 'toggleBulletList' },
      { id: 'ordered-list', label: '번호 매기기', icon: '1.', command: 'toggleOrderedList' },
      { id: 'outdent', label: '내어쓰기', icon: '⇤', command: 'outdentText' },
      { id: 'indent', label: '들여쓰기', icon: '⇥', command: 'indentText' }
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
      { id: 'insert-textbox', label: '텍스트 상자', icon: 'T', command: 'insertTextBox' },
      { id: 'insert-rectangle', label: '사각형', icon: '▭', command: 'insertRectangle' },
      { id: 'insert-ellipse', label: '타원', icon: '◯', command: 'insertEllipse' },
      { id: 'insert-line', label: '선', icon: '／', command: 'insertLine' },
      { id: 'insert-table', label: '표 삽입', icon: '⊞', command: 'insertTable' },
      { id: 'insert-image', label: '그림 삽입', icon: '🖼', command: 'insertImage' }
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
export function slidesToolbarCommands(
  groups: SlidesToolbarGroup[] = SLIDES_TOOLBAR
): string[] {
  return [...new Set(groups.flatMap((group) => group.controls).map((control) => control.command))];
}

/** Every mark the toolbar reads, so the schema can be asked whether it defines them. */
export function slidesToolbarMarkTypes(
  groups: SlidesToolbarGroup[] = SLIDES_TOOLBAR
): string[] {
  return [
    ...new Set(
      groups
        .flatMap((group) => group.controls)
        .map((control) => control.state?.markType)
        .filter((type): type is string => typeof type === 'string')
    )
  ];
}
