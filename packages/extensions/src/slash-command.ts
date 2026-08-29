import { Editor, Extension } from '@barocss/editor-core';

/**
 * The `/` menu — **what it offers and where the reader is in it**, and nothing drawn.
 *
 * ## Why it had to be taken apart
 *
 * It built its own menu: `document.createElement`, inline styles, a keydown listener, fourteen lines
 * of DOM in a package whose whole job is the model. That is why no product installed it and why it
 * was in no kit — the same shape as `FindReplaceExtension`, which spent months being called a stub
 * for exactly this reason. A shared model package drawing UI is a package a product cannot use, in a
 * repository where `office-ui` draws and the packages below it do not.
 *
 * ## And two smaller things that came with the DOM
 *
 * **The icons were unicode characters** — `¶`, `•`, `☑`, `—`, `⊞`, `ℹ`, `⚠`, `∑`, `💬`. This
 * repository has one rule about that and it is absolute: an icon is a name from `office-icons`, and
 * a character is not an icon. The defaults name no icon at all now, because a product that draws
 * this menu draws it in its own vocabulary — and `office-icons` has none for a heading, a quotation,
 * a code block or a divider yet, so inventing eight for a menu nobody renders would be the same
 * mistake in a different package.
 *
 * **The list named commands a product may not have.** `insertComment` is Word's; `insertCallout` and
 * `insertMathBlock` are ones Word deliberately leaves out, because its kit takes extensions one at a
 * time rather than the rich bundle. A shared default list offering entries that do nothing is the
 * fault `every-command-does-something` is named after, waiting to happen — so the menu now answers
 * with **what this editor actually registers**, and a product cannot show a row that declines.
 */
export interface SlashMenuItem {
  id: string;
  label: string;
  description?: string;
  /**
   * A name from `office-icons`, when the product that draws this menu has one for it.
   *
   * Deliberately unset in the defaults below. It held a unicode character for every entry, and a
   * character is not an icon: it is drawn in whatever font the reader has, at whatever weight, with
   * no relation to the other pictures on the surface.
   */
  icon?: string;
  command: string;
  payload?: Record<string, unknown>;
  group?: string;
}

export interface SlashCommandExtensionOptions {
  enabled?: boolean;
  /** What opens it, for a product that watches the text — `/` unless a product says otherwise. */
  trigger?: string;
  items?: SlashMenuItem[];
}

/**
 * What a `/` menu offers, before a product narrows it.
 *
 * A declaration rather than a drawing — the shape `toolbar-model.ts`, `panel-model.ts` and
 * `keymap.ts` all have, and for the shared reason: a surface that declares nothing is a surface the
 * harness cannot see.
 */
const DEFAULT_ITEMS: SlashMenuItem[] = [
  { id: 'paragraph', label: '본문', description: '보통 글', command: 'setParagraph', group: 'basic' },
  { id: 'heading1', label: '제목 1', description: '가장 큰 제목', command: 'setHeading', payload: { level: 1 }, group: 'basic' },
  { id: 'heading2', label: '제목 2', description: '중간 제목', command: 'setHeading', payload: { level: 2 }, group: 'basic' },
  { id: 'heading3', label: '제목 3', description: '작은 제목', command: 'setHeading', payload: { level: 3 }, group: 'basic' },
  { id: 'bullet-list', label: '글머리 목록', description: '점으로 구분되는 목록', command: 'toggleBulletList', group: 'lists' },
  { id: 'ordered-list', label: '번호 목록', description: '번호가 붙는 목록', command: 'toggleOrderedList', group: 'lists' },
  { id: 'checklist', label: '할 일 목록', description: '체크할 수 있는 목록', command: 'insertChecklist', group: 'lists' },
  { id: 'blockquote', label: '인용', description: '인용한 글', command: 'toggleBlockquote', group: 'blocks' },
  { id: 'code-block', label: '코드', description: '코드 조각', command: 'insertCodeBlock', group: 'blocks' },
  { id: 'horizontal-rule', label: '구분선', description: '가로줄', command: 'insertHorizontalRule', group: 'blocks' },
  { id: 'table', label: '표', description: '표 넣기', command: 'insertTable', payload: { rows: 3, cols: 3 }, group: 'blocks' },
  { id: 'callout-info', label: '알림', description: '눈에 띄는 상자', command: 'insertCallout', payload: { type: 'info' }, group: 'blocks' },
  { id: 'callout-warning', label: '주의', description: '경고 상자', command: 'insertCallout', payload: { type: 'warning' }, group: 'blocks' },
  { id: 'math-block', label: '수식', description: '수식 블록', command: 'insertMathBlock', group: 'advanced' },
  { id: 'comment', label: '메모', description: '댓글 스레드', command: 'insertComment', group: 'advanced' }
];

export interface SlashMenuState {
  /** Whether the menu is open. A product draws it; this says when. */
  open: boolean;
  /** What the reader has typed after the trigger. */
  query: string;
  /** The rows to draw, already narrowed by the query **and** by what this editor can run. */
  items: SlashMenuItem[];
  /** Which row is highlighted, or `-1` when there are none. */
  currentIndex: number;
}

export class SlashCommandExtension implements Extension {
  name = 'slashCommand';
  priority = 50;

  private _options: SlashCommandExtensionOptions;
  private _editor: Editor | null = null;
  private _state: SlashMenuState = { open: false, query: '', items: [], currentIndex: -1 };

  constructor(options: SlashCommandExtensionOptions = {}) {
    this._options = { enabled: true, trigger: '/', ...options };
  }

  /** What a product's menu draws: whether it is open, what it holds, and where the reader is. */
  get state(): Readonly<SlashMenuState> {
    return this._state;
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;
    this._editor = editor;

    const register = (
      name: string,
      execute: (payload?: { query?: string }) => boolean | Promise<boolean>,
      can: () => boolean
    ) =>
      (editor as never as { registerCommand: (spec: unknown) => void }).registerCommand({
        name,
        execute: async (_ed: Editor, payload?: { query?: string }) => await execute(payload),
        canExecute: () => can()
      });

    register(
      'showSlashMenu',
      (payload) => this._open(payload?.query ?? ''),
      () => true
    );
    register('hideSlashMenu', () => this._close(), () => this._state.open);

    /** Narrowing as the reader types — the product sends what it has, this decides what is left. */
    register(
      'filterSlashMenu',
      (payload) => this._open(payload?.query ?? ''),
      () => this._state.open
    );

    /**
     * Running the row the reader is on.
     *
     * Through `executeCommand` rather than by hand, so a row whose command declines declines — and
     * `offered()` has already taken out the rows this editor has no command for, which is the half
     * that stops a shared default list from showing entries that do nothing.
     */
    register(
      'runSlashMenuItem',
      async () => {
        const item = this._state.items[this._state.currentIndex];
        if (!item) return false;
        this._close();
        /*
         * **Awaited**, and its answer is this command's answer.
         *
         * It fired and returned `true` without waiting, so picking a row reported success before the
         * row had done anything — and would have reported it even for a row whose command declined.
         * A command that says it worked before the work happened is the same fault as one that says
         * it can run and then does nothing, a moment earlier.
         */
        return (
          (await (editor as never as {
            executeCommand: (name: string, payload?: unknown) => Promise<unknown>;
          }).executeCommand(item.command, item.payload ?? {})) === true
        );
      },
      () => this._state.currentIndex >= 0
    );
  }

  onDestroy(_editor: Editor): void {
    this._editor = null;
    this._close();
  }

  /** Move the highlight, rounding — a reader at the last row pressing down means the first. */
  moveBy(step: number): void {
    const held = this._state.items;
    if (held.length === 0) return;
    this._state.currentIndex = (this._state.currentIndex + step + held.length) % held.length;
  }

  private _open(query: string): boolean {
    const want = query.toLowerCase();
    const items = this._offered().filter(
      (item) =>
        want.length === 0 ||
        item.label.toLowerCase().includes(want) ||
        item.id.includes(want) ||
        (item.description ?? '').toLowerCase().includes(want)
    );

    this._state = { open: true, query, items, currentIndex: items.length > 0 ? 0 : -1 };
    return true;
  }

  private _close(): boolean {
    this._state = { open: false, query: '', items: [], currentIndex: -1 };
    return true;
  }

  /**
   * The rows **this editor can actually run**.
   *
   * The default list names `insertComment`, which is Word's, and `insertCallout` and
   * `insertMathBlock`, which Word deliberately leaves out — its kit takes extensions one at a time
   * rather than the rich bundle, because that bundle registers inserts for ten node types Word
   * cannot draw. A shared default list offering those would put rows in a reader's menu that light
   * up and do nothing, which is the fault this repository has spent a week finding elsewhere.
   */
  private _offered(): SlashMenuItem[] {
    const items = this._options.items ?? DEFAULT_ITEMS;
    const known = new Set(
      (this._editor as never as { commandNames?: () => string[] })?.commandNames?.() ?? []
    );
    return known.size === 0 ? items : items.filter((item) => known.has(item.command));
  }
}

export function createSlashCommandExtension(
  options?: SlashCommandExtensionOptions
): SlashCommandExtension {
  return new SlashCommandExtension(options);
}
