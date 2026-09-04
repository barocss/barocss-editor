import { useEffect } from 'react';
import { watchAnswers, type Editor } from '@barocss/editor-core';
import type { SlashCommandExtension } from '@barocss/extensions';
import { useSelectionRect } from './use-selection-rect';
import { FloatingSurface, Icon, useRevision } from '@barocss/office-ui';

/**
 * **`/` 를 치면 뜨는 메뉴** — 네 제품이 같은 것을 두 번 쓰고 있었습니다.
 *
 * ## 무엇이 같았나
 *
 * `apps/site/src/slash-surface.tsx` 와 `packages/office-note/src/note-slash.tsx` 를 주석과 빈 줄을 빼고
 * 대보면 **129줄 중 다른 것이 여덟 줄**이고, 그 여덟이 전부 한 가지입니다: 사이트에만 있는 `mode`
 * 가드 — 포인터가 선택 모드일 때는 `/` 가 메뉴가 아니라 글자여야 한다는 것.
 *
 * 나머지는 전부 같습니다. 캐럿 앞의 글자에서 `/질의` 를 읽어내는 정규식, 열려 있을 때의 Escape ·
 * 화살표 · Enter, 캐럿 위치를 재는 `selectionRectIn`, 스크롤과 리사이즈에 다시 재기, 그리고 목록을
 * 그리는 `FloatingSurface`.
 *
 * ## 왜 여기여야 하나
 *
 * 이것은 **선언을 읽어 표면으로 그리는 것**입니다 — `SlashCommandExtension` 의 `items` 가 그 선언이고,
 * 그 목록은 제품이 자기 툴바 선언에서 뽑습니다(`siteSlashItems()`, `noteSlashItems()`). 그래서 이
 * 패키지의 정의 그대로이고, 리본과 같은 이유로 여기 있습니다.
 *
 * ## `mode` 는 옵션입니다
 *
 * 사이트는 포인터에 모드가 있고 노트는 없습니다 — 본문에서는 언제나 글자를 씁니다. `active` 를 주지
 * 않으면 언제나 열려 있고, 주면 그것이 거짓인 동안은 아무것도 듣지 않습니다. 제품의 답을 인자로 받지
 * 분기로 갖지 않는다는, 이 패키지의 규칙 그대로입니다.
 */
export function SlashMenu({
  editor,
  active = true
}: {
  editor: Editor;
  /**
   * Whether `/` means a menu right now.
   *
   * A page builder's pointer has a **select** mode where typing is not writing, and a `/` there is a
   * character. A body has no such mode. Default `true`, so the product with nothing to say says
   * nothing.
   */
  active?: boolean;
}) {

  /*
   * Two things to listen to and they are different: `watchAnswers` is *the document and the
   * selection moved*, which is what opens the menu; `editor:slashMenu.change` is *the menu itself
   * moved*, which is a highlight travelling down a list and touches nothing else.
   */
  const revision = useRevision(
    (reread) => {
      const off = watchAnswers(editor, reread);
      editor.on('editor:slashMenu.change' as never, reread);
      return () => {
        off();
        editor.off('editor:slashMenu.change', reread);
      };
    },
    [editor]
  );

  const menu = editor.getExtension<SlashCommandExtension>('slashCommand')?.state;

  /*
   * **Where the caret is, kept up to date** — `useSelectionRect`. Fourteen lines here and the same
   * fourteen in the site's bubble toolbar, including the `true` on the scroll listener that is easy
   * to leave out and impossible to notice until a reader scrolls a pane rather than the window.
   */
  const at = useSelectionRect(editor, active && menu?.open === true);

  /**
   * **`/` opens it, and what is typed after narrows it.**
   *
   * Read out of the run the caret is in rather than accumulated here: a reader who backspaces, or
   * clicks away and back, or undoes, would leave a tally of keystrokes disagreeing with the
   * document. The document is the tally.
   */
  useEffect(() => {

    const typed = (event: KeyboardEvent) => {
      const open = menu?.open === true;

      if (open) {
        if (event.key === 'Escape') {
          event.preventDefault();
          return void editor.executeCommand('hideSlashMenu', {});
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          return void editor.executeCommand('moveSlashMenu', { by: event.key === 'ArrowDown' ? 1 : -1 });
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          return void editor.executeCommand('runSlashMenuItem', {});
        }
      }
    };

    document.addEventListener('keydown', typed, true);
    return () => document.removeEventListener('keydown', typed, true);
  }, [editor, active, menu?.open]);

  /** And the opening, watched on the document rather than on a key: `/` is a character. */
  useEffect(() => {
    if (!active) return;

    const selection = editor.selection as
      | {
          type?: string;
          collapsed?: boolean;
          startNodeId?: string;
          startOffset?: number;
          endNodeId?: string;
          endOffset?: number;
        }
      | undefined;
    if (!selection || selection.type !== 'range') return;

    /**
     * **A caret is a range whose ends are the same**, which is what this had to be taught.
     *
     * It asked `collapsed !== true` and returned — and a press that puts a caret does not always set
     * that flag: clicking a paragraph inside the row drawer's body left `collapsed: undefined` with
     * both ends on one node at one offset. So the menu did not open, in the one place a reader has no
     * other way to insert a block, and the failure looked like *the `/` does nothing*.
     *
     * The flag is believed when it is there. When it is not, the ends answer — which is the same
     * question asked of the thing that actually decides it.
     */
    const caret =
      selection.collapsed === true ||
      (selection.collapsed === undefined &&
        selection.startNodeId === selection.endNodeId &&
        selection.startOffset === selection.endOffset);
    if (!caret) return;

    const run = selection.startNodeId
      ? (editor.dataStore?.getNode(selection.startNodeId) as { text?: string } | undefined)
      : undefined;
    const before = typeof run?.text === 'string' ? run.text.slice(0, selection.startOffset ?? 0) : '';

    /*
     * A `/` that starts a word — after nothing, or after a space. Mid-word it is a slash a reader
     * meant, in a path or a date, and opening a menu over one is the fault every editor of this kind
     * makes exactly once.
     */
    const hit = /(?:^|\s)\/([^\s/]*)$/.exec(before);
    if (!hit) {
      if (menu?.open) void editor.executeCommand('hideSlashMenu', {});
      return;
    }

    /*
     * **Only when the query changed**, and the guard is the whole of why this effect is safe.
     *
     * It depends on `revision`, and opening or narrowing the menu *raises* `revision` — so an
     * unconditional call is a loop: filter, tell, re-render, filter. React stops it with "Maximum
     * update depth exceeded", the surface throws and unmounts, and the menu is **built correctly and
     * never drawn**. Everything measures right and nothing is on the page, which is the shape of
     * fault a screenshot finds and a state dump does not.
     */
    if (menu?.open === true && menu.query === hit[1]) return;
    void editor.executeCommand(menu?.open ? 'filterSlashMenu' : 'showSlashMenu', { query: hit[1] });
  }, [editor, active, revision, menu?.open, menu?.query]);

  const rows = menu?.items ?? [];

  return (
    <FloatingSurface open={!!at && rows.length > 0} at={at} className="flex-col items-stretch p-1">
      {rows.map((item, index) => (
        <button
          key={item.id}
          type="button"
          data-slash-item={item.id}
          data-current={index === menu?.currentIndex ? 'true' : undefined}
          onMouseDown={(event) => {
            // The caret is what this acts on; letting the press move it would close the menu first.
            event.preventDefault();
            void editor.executeCommand('runSlashMenuItem', {});
          }}
          className={[
            'flex w-56 items-center gap-2 rounded-[var(--ou-radius)] px-2 py-1 text-left',
            index === menu?.currentIndex ? 'bg-[color:var(--ou-accent-soft)]' : 'hover:bg-[color:var(--ou-ground)]'
          ].join(' ')}
        >
          {item.icon ? <Icon name={item.icon} size={14} /> : null}
          <span className="flex-1 truncate">{item.label}</span>
          {item.description ? (
            <span className="text-[length:var(--ou-text-small)] text-[color:var(--ou-faint)]">
              {item.description}
            </span>
          ) : null}
        </button>
      ))}
    </FloatingSurface>
  );
}
