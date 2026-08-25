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
  group: 'insert' | 'arrange';
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
  { command: 'insertSection', label: '섹션', title: '세로로 쌓는 섹션', group: 'insert', icon: 'add' },
  { command: 'insertRow', label: '가로', title: '가로로 늘어놓는 스택', group: 'insert', icon: 'add' },
  { command: 'insertGrid', label: '그리드', title: '3열 그리드', group: 'insert', icon: 'add' },
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
