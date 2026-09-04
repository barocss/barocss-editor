import { type Control, controlsIn } from '@barocss/office-controls';

import { NOTE_BLOCKS, type NoteBlock } from './note-schema';

/**
 * **What a note's own chrome offers** — declared here, because the chrome is this package's.
 *
 * ## Why the model and not the component
 *
 * The same argument `office-site/src/toolbar-model.ts` makes about a page, one layer down: a control
 * written in JSX is a control nothing can read. A conformance check cannot ask which commands a
 * product surfaces; a `/` menu cannot be *derived* from a toolbar; and a second surface that offers
 * the same thing ends up as a second list.
 *
 * ## And why it is here rather than in the site builder
 *
 * Because it was there, and that was the coupling. The bar over a body was assembled in the app from
 * `siteControlsIn('text')` and `siteSlashItems()` — the **page's** declarations — so a body's chrome
 * was the page builder's chrome wearing a smaller size. Reported as *이 툴바가 기존 페이지 빌더
 * 툴바랑 연동되고 있음. 그러면 안돼.*
 *
 * A note is its own thing: its own schema, its own kit, its own toolbar, its own UI. What a site
 * does is **embed** it.
 */
export interface NoteControl extends Control {
  /** The sentence beside it, which is what a `/` row shows and a tooltip says. **Always** here. */
  title: string;
  /** The picture, by `office-icons` name — every control on this bar is a glyph, so **always**. */
  icon: string;
  /**
   * Which group it belongs to — **marks** are what a word looks like, **blocks** are what a body is
   * made of. Two vocabularies, and the bar draws them apart because the eye should not merge them.
   *
   * **Narrowed** from the shared shape's `string`: the words are this product's, and this is what a
   * product's own interface is for.
   */
  group: 'mark' | 'block';
}

/**
 * The marks a writer reaches for mid-sentence.
 *
 * Four, and **not** a colour, a size or a family — which is the styling rule stated as an absence
 * rather than as a hidden control: the look of a paragraph in a post is the card's answer when it
 * draws it, so a body that could set its own would stop following the design it is placed in. See
 * `note-kit.ts`, which does not register those commands at all.
 */
const MARKS: NoteControl[] = [
  { command: 'toggleBold', label: '굵게', title: '굵게', icon: 'bold', group: 'mark', mark: 'bold' },
  { command: 'toggleItalic', label: '기울임', title: '기울임', icon: 'italic', group: 'mark', mark: 'italic' },
  {
    command: 'toggleUnderline',
    label: '밑줄',
    title: '밑줄',
    icon: 'underline',
    group: 'mark',
    mark: 'underline'
  },
  {
    command: 'toggleStrikeThrough',
    label: '취소선',
    title: '취소선',
    icon: 'strike',
    group: 'mark',
    /**
     * **`strikethrough`, not `strikeThrough`** — the command's name and the mark's name are not the
     * same word, and this row had the command's.
     *
     * `toggleStrikeThrough` writes a mark called `strikethrough`, all lower case. `markState` looks
     * the string up in the selection summary, finds nothing, and answers `off` — so 취소선 applied
     * the mark correctly and the button never lit. Reported as *note 툴바에서 취소선만 버튼 상태
     * 업데이트가 안되네*, and *only* is the tell: the other three are one word and cannot disagree
     * with themselves.
     *
     * `office-site`'s row has always said `strikethrough`; this one was written from the command
     * list rather than copied, which is how the two came apart. A check compares them now.
     */
    mark: 'strikethrough'
  }
];

/**
 * And the blocks, **keyed by the schema's own list**.
 *
 * Derived in the direction that cannot drift: the keys are `NOTE_BLOCKS`, so a row for a block a
 * body may not hold cannot be written, and a block with no row is a gap a test can count. The site
 * builder's own insert list is a flat array and has needed a check to keep it honest; this cannot
 * get out of step because there is one list.
 *
 * **A list per block, not a row per block**, and the list is why: 목록 and 번호 목록 are one node
 * type and two doors. Written as one row each first, and a writer had no way to make a numbered
 * list — found by the browser, which counted eleven rows in the site's menu and ten here.
 */
const BLOCKS: Record<NoteBlock, Omit<NoteControl, 'group'>[]> = {
  heading: [{ command: 'insertHeading', label: '제목', title: '제목을 넣습니다', icon: 'heading' }],
  paragraph: [{ command: 'insertBodyText', label: '본문', title: '문단을 넣습니다', icon: 'paragraph' }],
  /*
   * **Two ways into one node.** A list is ordered or it is not, and that is an attribute rather than
   * a node type — but a writer reaches for *목록* or for *번호 목록*, never for a `type`. Which is
   * why the map is a list per block: one node, two doors.
   */
  list: [
    { command: 'insertBulletList', label: '목록', title: '목록을 넣습니다', icon: 'bullet-list' },
    { command: 'insertNumberList', label: '번호 목록', title: '번호 목록을 넣습니다', icon: 'ordered-list' }
  ],
  blockQuote: [{ command: 'insertQuote', label: '인용', title: '인용문을 넣습니다', icon: 'quote' }],
  codeBlock: [{ command: 'insertCode', label: '코드', title: '코드를 넣습니다', icon: 'code' }],
  bTable: [{ command: 'insertTableBlock', label: '표', title: '표를 넣습니다', icon: 'insert-table' }],
  horizontalRule: [{ command: 'insertRule', label: '구분선', title: '구분선을 넣습니다', icon: 'divider' }],
  picture: [{ command: 'insertPicture', label: '이미지', title: '이미지를 넣습니다', icon: 'insert-image' }],
  mediaVideo: [{ command: 'insertVideo', label: '영상', title: '영상을 넣습니다', icon: 'insert-video' }],
  mediaEmbed: [{ command: 'insertEmbed', label: '넣은 것', title: '다른 곳의 것을 넣습니다', icon: 'frame-grid' }]
};

/** Every control a note's chrome has, marks first — which is the order a writer meets them in. */
export const NOTE_TOOLBAR: NoteControl[] = [
  ...MARKS,
  ...NOTE_BLOCKS.flatMap((one) => BLOCKS[one].map((each) => ({ ...each, group: 'block' as const })))
];

/** The controls in one group, in the order the bar draws them. */
export function noteControlsIn(group: NoteControl['group']): NoteControl[] {
  return controlsIn(NOTE_TOOLBAR, group);
}
