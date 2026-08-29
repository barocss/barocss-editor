import { useEffect, useState } from 'react';
import { watchAnswers, type Editor } from '@barocss/editor-core';
import type { SlashCommandExtension } from '@barocss/extensions';
import { selectionRectIn } from '@barocss/editor-view-dom';
import { FloatingSurface, Icon, useRevision } from '@barocss/office-ui';

/**
 * The `/` menu — **the second floating surface, and it is a list.**
 *
 * That is the whole test of the split made today. The first one cost four layers: a declaration, a
 * command and its state, a themed component, and *where the selection is on screen* — which nothing
 * published, which is why the two floating surfaces this suite had were built inside a **model**
 * package, drawing their own DOM, installed by nobody. With all four in place this is a list of rows
 * and a keydown handler.
 *
 * ## Where the rows come from
 *
 * `siteSlashItems()` — the **toolbar's** insert group, read. Not a second list: an insert added to
 * one and not the other is a thing a reader can find by pressing and not by typing, and the version
 * of that fault already on record here is a menubar printing eleven chords the key handler answered
 * none of.
 *
 * ## Why `/` is watched here and not bound in the key map
 *
 * A key map answers a **chord** — a key with modifiers, in a mode. `/` is a character: it is typed
 * into the document, and the menu opens *because* the document now ends with one. Binding it would
 * mean the reader could never type a slash. So the app watches what was typed, which is the app's
 * business, and everything after that is a command the key map does bind.
 */
export function SlashSurface({ editor, mode }: { editor: Editor; mode: 'select' | 'text' }) {
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

  const [at, setAt] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (mode !== 'text') {
      setAt(null);
      return;
    }
    const measure = () => setAt(menu?.open ? selectionRectIn(document) : null);
    measure();

    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [editor, mode, revision, menu?.open]);

  /**
   * **`/` opens it, and what is typed after narrows it.**
   *
   * Read out of the run the caret is in rather than accumulated here: a reader who backspaces, or
   * clicks away and back, or undoes, would leave a tally of keystrokes disagreeing with the
   * document. The document is the tally.
   */
  useEffect(() => {
    if (mode !== 'text') return;

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
  }, [editor, mode, menu?.open]);

  /** And the opening, watched on the document rather than on a key: `/` is a character. */
  useEffect(() => {
    if (mode !== 'text') return;

    const selection = editor.selection as
      | { type?: string; collapsed?: boolean; startNodeId?: string; startOffset?: number }
      | undefined;
    if (!selection || selection.type !== 'range' || selection.collapsed !== true) return;

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
  }, [editor, mode, revision, menu?.open, menu?.query]);

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
