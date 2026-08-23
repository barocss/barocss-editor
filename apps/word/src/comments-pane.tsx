import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import { commentThreads, type CommentThread } from '@barocss/office-word';
import { Icon } from '@barocss/office-icons';
import { cn } from '@barocss/office-ui';

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
  open,
  onToggle
}: {
  editor: Editor;
  view: EditorViewDOM;
  open: boolean;
  onToggle: () => void;
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
  /** The entry being corrected, and what it will say. */
  const [editing, setEditing] = useState<{ sid: string; text: string } | null>(null);
  /** The reply being written, per thread. */
  const [replies, setReplies] = useState<Record<string, string>>({});

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

  /**
   * Read whether or not the pane is open.
   *
   * It used to skip the walk while closed, which was free and wrong the moment
   * the pane could be closed on purpose: the strip that opens it says how many
   * comments there are, and that is the thing a reader wants *before* deciding
   * to look.
   */
  const threads: CommentThread[] = useMemo(() => commentThreads(doc as never), [doc, revision]);

  /**
   * Mark the commented text, with the selected thread told apart.
   *
   * Drawn whether or not the pane is open, which follows from reading the
   * threads either way — and is what a reader needs: closing the pane should put
   * the discussion away, not hide the fact that there is one.
   */
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

  /**
   * Closed, it is a strip to open it by.
   *
   * It used to hold its whole width whether or not the document had a comment —
   * a fifth of the window given to an empty box, on every document that has none.
   * The count is on the strip because how many there are is the thing a reader
   * wants before they decide to look.
   */
  if (!open) {
    return (
      <button
        type="button"
        className="w-comments-closed"
        onClick={onToggle}
        title={threads.length > 0 ? `댓글 ${threads.length}개 열기` : '댓글 열기'}
        data-comment-count={threads.length}
      >
        {/* The same drawing the ribbon's own comments button uses, because it is
            the same pane — an emoji here and an icon there read as two features. */}
        <Icon name="comments" size={15} />
        {threads.length > 0 ? <span className="w-comments-count">{threads.length}</span> : null}
      </button>
    );
  }

  return (
    <aside
      className="w-comments-pane w-72 shrink-0 overflow-auto border-l border-neutral-200 p-3 dark:border-neutral-800"
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
          type="button"
          className="w-comments-close inline-flex h-7 w-7 items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
          onClick={onToggle}
          title="댓글 닫기"
          aria-label="댓글 닫기"
        >
          {/* Not the `×` character, which is a multiplication sign at whatever
              weight the body face has. The find bar next door already drew this. */}
          <Icon name="close" size={14} />
        </button>
        <button
          aria-label="Add comment"
          title="Comment on the selected text"
          className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-neutral-800"
          disabled={!anchorTo}
          onClick={() => void add()}
        >
          <Icon name="comment-new" size={15} />
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
                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <span>
                    {entry.author} · {entry.date}
                  </span>
                  <button
                    aria-label="Edit comment"
                    className="rounded p-0.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    onClick={(event) => {
                      event.stopPropagation();
                      setEditing({ sid: entry.sid, text: entry.text });
                    }}
                  >
                    <Icon name="edit" size={12} />
                  </button>
                </div>

                {editing?.sid === entry.sid ? (
                  <input
                    autoFocus
                    aria-label="Edit comment text"
                    className="w-comment-edit mt-0.5 w-full rounded border border-neutral-300 px-1 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                    value={editing.text}
                    onChange={(event) => setEditing({ sid: entry.sid, text: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setEditing(null);
                      if (event.key !== 'Enter') return;
                      // The text changes; the author and the date do not. They
                      // record who said it and when, and a comment that quietly
                      // reattributes itself is worse than one nobody can fix.
                      void editor.run('editComment', { entrySid: entry.sid, text: editing.text });
                      setEditing(null);
                    }}
                  />
                ) : (
                  <div className="w-comment-text">{entry.text}</div>
                )}
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

            {/* Anyone can answer, and the answers pile up under the comment
                they answer — which is what a thread is. */}
            <div className="mt-1 flex items-center gap-1">
              <input
                aria-label="Reply"
                placeholder="Reply"
                className="w-comment-reply h-6 flex-1 rounded border border-neutral-300 px-1 text-xs dark:border-neutral-700 dark:bg-neutral-800"
                value={replies[thread.id] ?? ''}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) =>
                  setReplies((all) => ({ ...all, [thread.id]: event.target.value }))
                }
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || !(replies[thread.id] ?? '').trim()) return;
                  void editor.run('replyToComment', { id: thread.id, text: replies[thread.id] });
                  setReplies((all) => ({ ...all, [thread.id]: '' }));
                }}
              />
              <button
                aria-label="Send reply"
                className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-neutral-800"
                disabled={!(replies[thread.id] ?? '').trim()}
                onClick={(event) => {
                  event.stopPropagation();
                  void editor.run('replyToComment', { id: thread.id, text: replies[thread.id] });
                  setReplies((all) => ({ ...all, [thread.id]: '' }));
                }}
              >
                <Icon name="reply" size={14} />
              </button>
            </div>

            <div className="mt-1 flex gap-1">
              <button
                aria-label={thread.resolved ? 'Reopen comment' : 'Resolve comment'}
                className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
                onClick={() =>
                  void editor.run('resolveComment', { id: thread.id, resolved: !thread.resolved })
                }
              >
                <Icon name="resolve" size={14} />
              </button>
              <button
                aria-label="Delete comment"
                className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
                onClick={() => void editor.run('deleteComment', { id: thread.id })}
              >
                <Icon name="delete" size={14} />
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
