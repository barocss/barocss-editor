/**
 * What the site builder's toolbar offers, as data.
 *
 * ## Why the ribbon does not decide this
 *
 * `office-ui` is pure UI — props in, callbacks out — so what a control *is* belongs with the
 * product, and a ribbon that declares its own commands in JSX is a declaration nothing can read. The
 * conformance harness asks a product two questions: what commands do you register, and what can a
 * reader reach? The second one is this file plus `keymap.ts`, and until they existed the answer was
 * "the app knows", which is the same as no answer.
 *
 * The deck's `toolbar-model.ts` is the same file for the same reason, and its own history is the
 * argument: three clipboard commands were registered, working, tested and reachable by nothing at
 * all for a day.
 */

export interface SiteControl {
  /** What the control runs. */
  command: string;
  /** What it is given, when the control is one case of a command. */
  payload?: Record<string, unknown>;
  /** What a reader reads on it. */
  label: string;
  /** What a reader reads *about* it, in a tooltip. */
  title?: string;
  /** The chord it is bound to, drawn beside the name — a toolbar is how a reader finds a key. */
  shortcut?: string;
  /** Which group it sits in, so the ribbon draws separators rather than deciding them. */
  group: 'insert' | 'arrange' | 'link';
  /**
   * What it makes, when a reader is choosing from a list of things to add.
   *
   * The **insert rail** shows what a page is made of, so it needs the word for the thing rather than
   * the word for the act — 제목, not 제목 넣기. Both are here because both are read: a toolbar button
   * says what pressing it does, and a list of blocks says what each one is.
   */
  makes?: string;
  /**
   * Whether it makes a thing that **holds** other things, or a thing that goes *in* one.
   *
   * The rail draws two groups — 담는 것 and 넣는 것 — and it drew them from a list of command names
   * written out in the app: `['insertHeading', 'insertBodyText', 'insertPicture', 'insertBulletList']`.
   * Which is the fault this file's own header names about ribbons, one layer over: a declaration
   * nothing can read. Five new inserts were registered, reachable by no button, and the harness could
   * not see it because a hard-coded array is not a claim about anything.
   *
   * Said here instead, so the next insert appears where it belongs by saying what it is.
   */
  puts?: 'container' | 'block';
  /**
   * The picture beside the name, from the suite's own table.
   *
   * Declared here rather than chosen in the ribbon so that `every-icon-has-a-picture` can ask: a
   * control asking for an icon the suite does not draw falls back to drawing its own name, which
   * looks like a label and is a missing picture.
   */
  icon?: string;
}

/**
 * What a reader can put on a page.
 *
 * One command per shape rather than `insertStack({ layoutMode })`: a toolbar draws one button per
 * shape, and `every-command-can-be-seen` refuses a command that could only answer "it depends".
 */
export const SITE_TOOLBAR: SiteControl[] = [
  { command: 'insertSection', puts: 'container', label: '섹션', title: '세로로 쌓는 섹션', group: 'insert', icon: 'frame-column', makes: '섹션' },
  { command: 'insertRow', puts: 'container', label: '가로', title: '가로로 늘어놓는 스택', group: 'insert', icon: 'frame-row', makes: '가로 스택' },
  { command: 'insertGrid', puts: 'container', label: '그리드', title: '3열 그리드', group: 'insert', icon: 'frame-grid', makes: '그리드' },
  /*
   * And the things that go *in* a stack.
   *
   * They are on the rail rather than the toolbar — a list of what a page is made of, which is where
   * every builder of this kind puts them, because there are more of them than a toolbar has room for
   * and they are chosen by what they are rather than found by what they do.
   *
   * **Each with a picture.** They were a column of unadorned words, which is a menu rather than a
   * palette: a reader picking a *shape* scans for the shape, and 제목 · 본문 · 이미지 · 목록 read as
   * a list of options rather than as things. The three containers each had `add`, which is the same
   * drawing three times for three different arrangements — a stack, a row and a grid are exactly
   * what a picture can tell apart and a word cannot at a glance.
   */
  { command: 'insertHeading', puts: 'block', label: '제목', title: '제목을 넣습니다', group: 'insert', icon: 'heading', makes: '제목' },
  { command: 'insertBodyText', puts: 'block', label: '본문', title: '본문을 넣습니다', group: 'insert', icon: 'paragraph', makes: '본문' },
  { command: 'insertPicture', puts: 'block', label: '이미지', title: '이미지를 넣습니다', group: 'insert', icon: 'insert-image', makes: '이미지' },
  { command: 'insertBulletList', puts: 'block', label: '글머리 목록', title: '글머리 목록을 넣습니다', group: 'insert', icon: 'bullet-list', makes: '목록' },
  { command: 'insertNumberList', puts: 'block', label: '번호 목록', title: '번호 목록을 넣습니다', group: 'insert', icon: 'ordered-list', makes: '번호 목록' },
  { command: 'insertQuote', puts: 'block', label: '인용', title: '인용문을 넣습니다', group: 'insert', icon: 'quote', makes: '인용' },
  { command: 'insertCode', puts: 'block', label: '코드', title: '코드 블록을 넣습니다 — 안에서 Enter는 줄바꿈입니다', group: 'insert', icon: 'code', makes: '코드' },
  { command: 'insertRule', puts: 'block', label: '구분선', title: '가로 구분선을 넣습니다', group: 'insert', icon: 'divider', makes: '구분선' },
  /*
   * And the one that is a **composition** rather than a node: a box, a word, a hit area, a radius
   * and an answer to the pointer. The knowledge is the arrangement, which is why it is a command
   * rather than four rows of a panel a reader would have to know to fill in.
   */
  { command: 'insertButton', puts: 'block', label: '버튼', title: '버튼을 넣습니다', group: 'insert', icon: 'component', makes: '버튼' },
  {
    command: 'duplicateBlocks',
    label: '복제',
    title: '선택한 블록 복제',
    shortcut: 'Mod+D',
    group: 'arrange',
    icon: 'duplicate'
  },
  {
    command: 'removeBlocks',
    label: '삭제',
    title: '선택한 블록 삭제',
    shortcut: 'Delete',
    group: 'arrange',
    icon: 'delete'
  },
  /**
   * *Make this reusable* — the gesture that makes a component library ever get a second entry.
   *
   * On the toolbar rather than in the rail, because it is something a reader does **to what they
   * have selected**, and that is what the arrange group is: the row of things that act on a
   * selection. The rail's component list is where definitions are *used*.
   */
  {
    command: 'createComponentFrom',
    label: '컴포넌트로',
    title: '선택한 블록을 컴포넌트로 만들고, 그 자리에 놓습니다',
    group: 'arrange',
    icon: 'group'
  },
  /**
   * And the way back out, which `createComponentFrom` needs in order to be a door rather than a
   * decision. A reader who cannot undo a component is a reader who stops making them.
   */
  {
    command: 'detachComponent',
    label: '컴포넌트 해제',
    title: '이 인스턴스를 일반 블록으로 되돌립니다 — 다른 곳은 그대로입니다',
    group: 'arrange',
    icon: 'ungroup'
  },

  /**
   * Linking the selected words to **a page of this site**, and unlinking them.
   *
   * Two controls rather than a picker with a *링크 없음* row in it, and the reason is worth writing
   * down because the first version had the row: removing a link is a different gesture from choosing
   * where one goes, and folding it in needs a sentinel value that is not a page id — which is a
   * value that collides the day somebody names a page it. Radix refuses an empty string for exactly
   * this reason, and it was right to.
   *
   * A group of its own, and one control in it, because it is neither of the other two: it makes
   * nothing (insert) and it moves nothing (arrange) — it says where words go. The ribbon draws it as
   * a picker rather than a button, which is why the group is drawn by hand there: the choices are
   * *this document's pages*, so they cannot be declared here without going stale the first time a
   * reader adds one.
   *
   * Declared anyway, because a control the ribbon writes and this file does not know about is a
   * command `every-command-can-be-reached` counts as unreachable — which is exactly the drift this
   * file exists to prevent.
   */
  {
    command: 'removeLink',
    label: '링크 없음',
    title: '선택한 글자의 링크를 없앱니다',
    group: 'link',
    icon: 'delete'
  },
  {
    command: 'linkToPage',
    label: '페이지 링크',
    title: '선택한 글자를 이 사이트의 페이지로 연결합니다',
    group: 'link'
    /*
     * **No icon**, deliberately: a picker's face is the page it is showing, and there is nowhere on
     * one for a picture. `every-icon-has-a-picture` asks about the icons a product *asks for*, so
     * asking for a `link` the suite does not draw would have been a control labelled `link`.
     */
  }
];

/** Every icon the site's controls ask for, for the check that asks whether the suite draws it. */
export function siteToolbarIcons(): string[] {
  return [...new Set(SITE_TOOLBAR.map((one) => one.icon).filter((name): name is string => !!name))];
}

/** Every command the toolbar offers, for the check that asks what a reader can run. */
export function siteToolbarCommands(): string[] {
  return [...new Set(SITE_TOOLBAR.map((one) => one.command))];
}

/** The controls in one group, in the order the ribbon draws them. */
export function siteControlsIn(group: SiteControl['group']): SiteControl[] {
  return SITE_TOOLBAR.filter((one) => one.group === group);
}
