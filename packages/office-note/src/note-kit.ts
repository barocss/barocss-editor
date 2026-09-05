import { Editor, type EditorOptions, type Extension, type ProductEditorOptions } from '@barocss/editor-core';
import {
  createBasicExtensions,
  createCoreExtensions,
  EmojiExtension,
  ImageExtension,
  LinkExtension,
  MoveBlockExtension,
  SlashCommandExtension,
  StrikeThroughExtension,
  SubSuperExtension,
  TableExtension,
  TextFormattingExtension,
  UnderlineExtension
} from '@barocss/extensions';
import { createNoteElementCommands } from './element-commands';
import { NOTE_KEYBINDINGS } from './note-keymap';
import { noteControlsIn } from './toolbar-model';

/**
 * **What a writer can do to a note**, and deliberately not what a designer can do to a page.
 *
 * ## The list is the decision
 *
 * The site builder's kit is nineteen extensions and it is right for a site: a page has a font
 * family, a font size, a colour, a reorder, a clipboard that moves blocks between pages, and its own
 * eleven insert commands. **A body has none of those questions.** The colour of a paragraph in a
 * post is the card's answer when it draws it — *칠·여백·크기는 카드의 것* — so a body that could set
 * its own would be a body that stops following the design it is placed in.
 *
 * So this list is short, and every absence is a sentence:
 *
 * - **no `FontColorExtension`, `FontSizeExtension`, `FontFamilyExtension`** — the design's, not the
 *   writing's. This is the whole styling rule, enforced by not registering the command rather than
 *   by hiding a control.
 * - **no `ReorderExtension`** — z-order is a plane's idea; a body is a sequence.
 * - **no clipboard extension of its own** — a note has no pages to move a block between.
 * - **no `insert*` for a frame, a collection, a chart or a form** — `note-schema.ts` argues it: a
 *   body is written, a page is arranged.
 *
 * What is here is the writing: the marks, a link, a picture, an emoji, a table, and the blocks
 * `createBasicExtensions` brings — headings, paragraphs, lists, quotes.
 *
 * ## And its own `/` menu
 *
 * Rows built from `NOTE_BLOCKS`, so the menu a writer types into cannot offer what the schema would
 * refuse. The site's menu reads the site's toolbar for the same reason, and the two lists never meet
 * — which is the point of the package.
 */
export function createNoteExtensions(): Extension[] {
  return [
    ...createCoreExtensions(),

    // Headings, paragraphs, lists, quotes — the blocks a written thing is made of.
    ...createBasicExtensions(),

    /**
     * **블록을 한 칸 위/아래로** — `Alt+↑`/`Alt+↓`.
     *
     * 이 확장을 안 싣고 있었고, 그 동안 노트는 그 기능을 **자기 이름으로** 갖고 있었다
     * (`moveNoteBlockUp`/`Down`, 손잡이 옆의 두 단추). 엔진은 `Alt+↑` 를 `moveBlockUp` 에 묶으므로
     * **키를 먹고 아무 일도 안 했다** — `console.warn('Command moveBlockUp not found')`.
     *
     * 재본 것: 엔진 키가 부르는 명령 서른다섯 중 word·slides·site 는 없는 것이 0이고 노트만 둘이
     * 없었으며, 그 둘이 정확히 이것이다. 셋은 이 확장을 싣고 노트만 안 실었다.
     *
     * 기준은 `docs/specs/keybindings.md` 에 있다 — **기능이 있으면 엔진이 부르는 그 이름으로
     * 등록한다.** 노트의 두 단추는 그대로 두었다: 그건 이름이 다른 것이 아니라 *한 칸* 과
     * *여기로* 라는 다른 몸짓이다.
     */
    new MoveBlockExtension(),

    new UnderlineExtension(),
    new StrikeThroughExtension(),
    new SubSuperExtension(),
    new TextFormattingExtension(),
    /**
     * A **link**, which is half the reason a body is nodes rather than characters: a summary with a
     * link and an emphasised word in it is a summary plain text could not hold. The other half is
     * that a link stores a reference and resolves it where it is drawn.
     */
    new LinkExtension(),
    new ImageExtension(),
    new EmojiExtension(),
    new TableExtension(),
    /**
     * **This package's own inserts** — the ten blocks the bar offers.
     *
     * They were `office-site`'s, which worked for as long as the drawer handed the site's editor in:
     * a body's bar was pressing a page builder's buttons. Found the moment the session became the
     * note's own — 93 commands, and every one of the bar's ten missing. Which is what a store of
     * one's own is for: the borrowed parts stop working *visibly*.
     */
    createNoteElementCommands(),
    new SlashCommandExtension({ items: noteSlashItems() })
  ];
}

/**
 * The `/` menu's rows, **from the toolbar** rather than from a second list.
 *
 * A slash menu and a toolbar answer the same question — *what can I put here* — and the only
 * difference is how the reader asked. Two lists is how they come apart, which the site builder has
 * written down at length about its own. So the toolbar is the declaration and this is a reading of
 * it, and the toolbar's block rows are themselves keyed by `NOTE_BLOCKS`: one list, three surfaces.
 */
export function noteSlashItems(): {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  command: string;
  group?: string;
}[] {
  return noteControlsIn('block').map((one) => ({
    id: one.command,
    label: one.label,
    description: one.title,
    icon: one.icon,
    command: one.command,
    group: 'insert'
  }));
}

/**
 * An editor over **one note**, with a store and a history of its own.
 *
 * The whole of what *독립된 에디팅 상태* means, in one function: a second `Editor` means a second
 * selection, so a caret in a body no longer moves the page builder's ribbon, and a second history,
 * so undo in a post does not walk back through a page's padding.
 *
 * The **store** is the caller's, because who owns a note's storage is the caller's question: a site
 * hands one loaded from a cell's value, and a standalone note hands one loaded from a file. What
 * this decides is the schema and the kit.
 */
export interface NoteEditorOptions extends ProductEditorOptions {
  /**
   * **저장소는 부르는 쪽의 것이다** — 그래서 다른 셋과 달리 필수다.
   *
   * 노트의 저장을 누가 갖는가는 부르는 쪽의 질문이다: 사이트는 칸의 값에서 불러온 것을 건네고,
   * 홀로 선 노트는 파일에서 불러온 것을 건넨다. 그래서 기본이 있을 수 없다.
   */
  dataStore: EditorOptions['dataStore'];
  schema: EditorOptions['schema'];
}

export function createNoteEditor(options: NoteEditorOptions): Editor {
  const { kit, keybindings, extensions = [], ...rest } = options;
  const editor = new Editor({
    ...rest,
    extensions: [...(kit ?? createNoteExtensions()), ...extensions]
  } as never);

  /*
   * **키맵을 얹는다.** 대체가 아니라 층이다 — `word-kit.ts` 에 그 이유가 적혀 있다: 레지스트리가
   * 출처로 충돌을 풀고 **제품 바인딩이 엔진 것을 이긴다.** 그래서 표 밖에서는 기본의
   * `Tab → indentText` 가 그대로 살고, 표 안에서는 `inTable` 이 참이 되어 `nextCell` 이 이긴다.
   *
   * 지우고 다시 넣지 않는 것도 그 파일이 겪은 것이다: 레지스트리를 비우면 Enter·Backspace·화살표까지
   * 사라져서 문서가 브라우저가 하는 대로만 편집된다.
   */
  for (const binding of NOTE_KEYBINDINGS) editor.keybindings.register(binding);

  /* 그리고 부른 쪽의 키가 그 위에 얹힌다 — 대체가 아니라 층인 것은 여기서도 같다. */
  for (const binding of keybindings ?? []) editor.keybindings.register(binding);

  return editor;
}
