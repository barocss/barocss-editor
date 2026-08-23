import { shortcutOf } from './keymap';

/**
 * What a right-click offers, as a table.
 *
 * ## Why this is a model and not a component
 *
 * The same reason the toolbar is: *what* a reader can do to a selection is a fact
 * about the document, and *how* it is drawn is a fact about the chrome. A menu
 * assembled inside a React component would be a second answer to a question
 * `toolbar-model.ts` already answers in another shape — and the two would drift
 * the first time a command was added to one of them.
 *
 * It also makes the interesting half testable in milliseconds: which items appear
 * for one shape, for six, for a group, for a right-click on the slide itself.
 *
 * ## What decides the items
 *
 * The selection, and nothing else. Not whether each command *can* run — that is
 * the command's own guard, asked by the chrome through `canExecuteCommand`, and
 * asking it twice is how a menu ends up offering something that then does
 * nothing. An item that is here but disabled is a reader learning what exists;
 * an item that is missing is a reader concluding it does not.
 *
 * ## Why the chords come from the keymap
 *
 * Because a menu that says `⌘D` beside 복제 is teaching, and a menu that says the
 * wrong chord is worse than one that says none. `shortcutOf` reads the one table
 * that binds them, so a rebinding cannot leave a stale label behind — the same
 * rule the toolbar's tooltips follow.
 */

export interface SlideMenuItem {
  id: string;
  label: string;
  command: string;
  /** Fixed arguments, because the item's own label says which case it is. */
  payload?: Record<string, unknown>;
  /** The chord this command is bound to, as the keymap writes it. */
  key?: string;
}

/** A run of items with a rule between it and the next — every menu has these. */
export interface SlideMenuSection {
  id: string;
  items: SlideMenuItem[];
}

/** What the pointer found, which is all this needs to know. */
export interface MenuTarget {
  /** How many boxes are selected. Zero means the click was on the slide itself. */
  boxes: number;
  /** Whether any of them is a group, which is the only thing ungrouping needs. */
  group?: boolean;
  /**
   * Whether the reader is *inside* a container, which changes what "paste" and
   * "새 슬라이드" would even mean — so the slide's own items are left out.
   */
  inside?: boolean;
}

const item = (
  id: string,
  label: string,
  command: string,
  payload?: Record<string, unknown>
): SlideMenuItem => ({
  id,
  label,
  command,
  ...(payload ? { payload } : {}),
  ...(shortcutOf(command) ? { key: shortcutOf(command) } : {})
});

/**
 * The menu for what the pointer found.
 *
 * Ordered the way every tool orders it, which is not arbitrary: the two things a
 * reader reaches for most (cut/copy/paste and delete) are at the top and bottom
 * — the two easiest places to hit — and the ones that need aim are in the middle.
 */
export function slideMenu(target: MenuTarget): SlideMenuSection[] {
  if (target.boxes === 0) {
    // Nothing under the pointer: the slide's own menu, and only what a slide can
    // actually do. Inside a container there is no "new slide" to mean.
    return [
      { id: 'clipboard', items: [item('paste', '붙여넣기', 'pasteBoxes')] },
      ...(target.inside
        ? []
        : [
            /**
             * The guides, where a reader looks for them.
             *
             * They belong to the **slide**, so they are in the slide's own group and left
             * out inside a container for the same reason 새 슬라이드 is: what a reader means
             * in there is the container. The chords are shown beside the items, because a
             * menu is how a reader finds a chord.
             */
            {
              id: 'guides',
              items: [
                item('guide-x', '세로 안내선', 'addSlideGuide', { axis: 'x' }),
                item('guide-y', '가로 안내선', 'addSlideGuide', { axis: 'y' }),
                item('guides-clear', '안내선 지우기', 'clearSlideGuides')
              ]
            },
            {
              id: 'slide',
              items: [
                item('slide-new', '새 슬라이드', 'insertSlide'),
                item('slide-duplicate', '슬라이드 복제', 'duplicateSlide')
              ]
            }
          ])
    ];
  }

  const many = target.boxes > 1;

  return [
    {
      id: 'clipboard',
      items: [
        item('cut', '잘라내기', 'cutBoxes'),
        item('copy', '복사', 'copyBoxes'),
        item('paste', '붙여넣기', 'pasteBoxes'),
        item('duplicate', '복제', 'duplicateBoxes')
      ]
    },
    {
      id: 'order',
      items: [
        item('front', '맨 앞으로', 'bringToFront'),
        item('forward', '앞으로', 'bringForward'),
        item('backward', '뒤로', 'sendBackward'),
        item('back', '맨 뒤로', 'sendToBack')
      ]
    },
    {
      id: 'group',
      items: [
        // Grouping one shape is a group of one, which is a thing nobody means.
        ...(many ? [item('group', '그룹', 'groupBoxes')] : []),
        ...(target.group ? [item('ungroup', '그룹 해제', 'ungroupBoxes')] : [])
      ]
    },
    {
      id: 'shape',
      items: [
        item('flip-h', '좌우 뒤집기', 'flipBoxes', { axis: 'x' }),
        item('flip-v', '상하 뒤집기', 'flipBoxes', { axis: 'y' })
      ]
    },
    { id: 'delete', items: [item('delete', '삭제', 'deleteBoxes')] }
  ].filter((section) => section.items.length > 0);
}
