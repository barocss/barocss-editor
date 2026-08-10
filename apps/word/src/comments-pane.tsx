import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import { commentThreads, type CommentThread } from '@barocss/office-word';
import { Check, MessageSquarePlus, Trash2 } from 'lucide-react';
import { cn } from './ui/cn';

/**
 * The comments on a document, in a pane beside it.
 *
 * Word puts them in the margin, which is where a reader looks for them. This is
 * a pane rather than a margin because the margin is part of the paper — text can
 * run into it, headers are drawn in it, and printing has to be able to say what
 * is on the page. A note about the page is not on it.
 *
 * The threads are read from the document rather than held here: a comment is
 * part of what was written and survives a reload, unlike a search, which is not
 * and does not.
 */
const ANCHOR_STYPE = 'w-comment-anchor';

export function CommentsPane({
  editor,
  view,
  open
}: {
  editor: Editor;
  view: EditorViewDOM;
  open: boolean;
}) {
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  /**
   * The last stretch of text the reader had selected.
   *
   * Typing the comment moves focus out of the document, which collapses the
   * selection — so by the time the button is pressed there is nothing to anchor
   * to. Remembering it is what lets a reader select a phrase, write what they
   * think about it, and have the comment land on the phrase.
   */
  const [anchorTo, setAnchorTo] = useState<unknown>(null);

  useEffect(() => {
    const bump = () => setRevision((n) => n + 1);
    const remember = () => {
      const selection = editor.selection as { type?: string; collapsed?: boolean } | null;
      if (selection && selection.type === 'range' && !selection.collapsed) setAnchorTo(selection);
    };
    editor.on('editor:content.change', bump);
    editor.on('editor:selection.model', remember);
    remember();
    return () => {
      editor.off('editor:content.change', bump);
      editor.off('editor:selection.model', remember);
    };
  }, [editor]);

  const doc = useMemo(
    () => ({
      getNode: (id: string) =>
        (editor as unknown as { dataStore: { getNode(id: string): unknown } }).dataStore.getNode(id),
      rootId: (editor as unknown as { getRootId(): string }).getRootId()
    }),
    [editor]
  );

  const threads: CommentThread[] = useMemo(
    () => (open ? commentThreads(doc as never) : []),
    [doc, open, revision]
  );

  /** Mark the commented text, with the selected thread told apart. */
  useEffect(() => {
    view.setDecorators(
      ANCHOR_STYPE,
      threads
        .filter((thread) => thread.anchor && !thread.resolved)
        .map((thread) => ({
          sid: `comment-anchor-${thread.id}`,
          stype: ANCHOR_STYPE,
          category: 'inline',
          target: {
            sid: thread.anchor!.sid,
            startOffset: thread.anchor!.start,
            endOffset: thread.anchor!.end
          },
          data: { selected: thread.id === selected }
        })) as never
    );
    return () => view.setDecorators(ANCHOR_STYPE, []);
  }, [view, threads, selected]);

  const add = useCallback(async () => {
    if (!anchorTo) return;
    await editor.run('insertComment', { selection: anchorTo, text: draft || 'Comment' });
    setDraft('');
    setAnchorTo(null);
  }, [editor, draft, anchorTo]);

  if (!open) return null;

  return (
    <aside
      className="w-comments-pane w-72 shrink-0 border-l border-neutral-200 p-3 dark:border-neutral-800"
      aria-label="Comments"
    >
      <div className="flex items-center gap-2">
        <input
          className="w-comment-draft h-7 flex-1 rounded border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          placeholder="New comment"
          aria-label="New comment"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          aria-label="Add comment"
          title="Comment on the selected text"
          className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-neutral-800"
          disabled={!anchorTo}
          onClick={() => void add()}
        >
          <MessageSquarePlus size={15} />
        </button>
      </div>

      <ul className="mt-3 space-y-2">
        {threads.map((thread) => (
          <li
            key={thread.id}
            data-comment={thread.id}
            data-resolved={thread.resolved ? 'true' : 'false'}
            className={cn(
              'w-comment rounded border p-2 text-sm',
              thread.resolved
                ? 'border-neutral-200 opacity-60 dark:border-neutral-800'
                : 'border-neutral-300 dark:border-neutral-700',
              thread.id === selected && 'ring-2 ring-sky-300'
            )}
            onClick={() => setSelected(thread.id)}
          >
            {thread.entries.map((entry) => (
              <div key={entry.sid} className="mb-1">
                <div className="text-xs text-neutral-500">
                  {entry.author} · {entry.date}
                </div>
                <div className="w-comment-text">{entry.text}</div>
              </div>
            ))}

            {/* A thread whose text has been deleted still holds what somebody
                wrote, so it is shown and said to have lost its place rather
                than quietly dropped. */}
            {!thread.anchor ? (
              <div className="w-comment-orphan text-xs italic text-amber-600">
                The text this was about is gone
              </div>
            ) : null}

            <div className="mt-1 flex gap-1">
              <button
                aria-label={thread.resolved ? 'Reopen comment' : 'Resolve comment'}
                className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
                onClick={() =>
                  void editor.run('resolveComment', { id: thread.id, resolved: !thread.resolved })
                }
              >
                <Check size={14} />
              </button>
              <button
                aria-label="Delete comment"
                className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
                onClick={() => void editor.run('deleteComment', { id: thread.id })}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {threads.length === 0 ? (
        <p className="mt-3 text-xs text-neutral-500">
          Select some text and add a comment.
        </p>
      ) : null}
    </aside>
  );
}

export { ANCHOR_STYPE };
