import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';

/**
 * The document's name, where a word processor keeps it.
 *
 * The title and author are a definition — `{ TITLE }` puts the title where the
 * document says it should appear, and that is the only place it belongs on the
 * page. They used to be drawn above the first sheet as well, inside the editing
 * surface, which made them look like a stray heading and let a click put the
 * caret in them: typing changed the document's title while reading as body text.
 *
 * Changing what a document is called is something a reader does *to* it rather
 * than *in* it, so it sits in the application's chrome, above the ribbon, the
 * way every word processor puts the file's name there.
 *
 * Written straight to the store rather than through a command, because there is
 * no editing here to undo as part of the document's history — this is the same
 * kind of change as renaming a file, and the page redraws because any field
 * that quotes the title has to follow.
 */

type Piece = { sid: string; stype: string; text: string };

/** The metadata block, and the text under each of its parts. */
function readMeta(editor: any): { metaSid: string | null; pieces: Piece[] } {
  const store = editor?.dataStore;
  // `rootId` is not a property on the store; it is asked for.
  const rootId = store?.getRootNodeId?.() ?? store?.rootId;
  const root = rootId ? store?.getNode?.(rootId) : null;
  const children: string[] = (root?.content ?? []) as string[];
  const metaSid = children.find((sid) => store.getNode(sid)?.stype === 'docMeta') ?? null;
  if (!metaSid) return { metaSid: null, pieces: [] };

  const textUnder = (sid: string): string => {
    const node = store.getNode(sid);
    if (!node) return '';
    if (typeof node.text === 'string') return node.text;
    return ((node.content ?? []) as string[]).map(textUnder).join('');
  };
  const firstRun = (sid: string): string | null => {
    const node = store.getNode(sid);
    if (!node) return null;
    if (typeof node.text === 'string') return sid;
    for (const child of ((node.content ?? []) as string[])) {
      const found = firstRun(child);
      if (found) return found;
    }
    return null;
  };

  const pieces: Piece[] = [];
  for (const sid of ((store.getNode(metaSid)?.content ?? []) as string[])) {
    const node = store.getNode(sid);
    const runSid = firstRun(sid);
    if (!node || !runSid) continue;
    pieces.push({ sid: runSid, stype: node.stype, text: textUnder(sid) });
  }
  return { metaSid, pieces };
}

const LABELS: Record<string, string> = {
  docTitle: '문서 제목',
  docSubtitle: '부제',
  docAuthor: '작성자'
};

export function DocumentTitle({ editor }: { editor: Editor }) {
  const [pieces, setPieces] = useState<Piece[]>(() => readMeta(editor).pieces);
  const editing = useRef<string | null>(null);

  // Follow the document: a field that quotes the title changes when it does,
  // and so does anything that loads a different document.
  useEffect(() => {
    const refresh = () => {
      if (editing.current) return; // don't overwrite what is being typed
      setPieces(readMeta(editor).pieces);
    };
    (editor as any).on?.('editor:content.change', refresh);
    return () => (editor as any).off?.('editor:content.change', refresh);
  }, [editor]);

  const write = useCallback(
    (sid: string, text: string) => {
      const store = (editor as any).dataStore;
      const node = store?.getNode?.(sid);
      if (!node || node.text === text) return;
      store.updateNode(sid, { text });
      // Fields quoting the title have to follow, and they are drawn from the
      // document — so tell it the document moved.
      (editor as any).emit?.('editor:content.change', { from: 'document-title' });
    },
    [editor]
  );

  if (pieces.length === 0) return null;

  return (
    <div className="doc-title-bar">
      {pieces.map((piece) => (
        <input
          key={piece.sid}
          className={`doc-title-field doc-title-${piece.stype}`}
          value={piece.text}
          aria-label={LABELS[piece.stype] ?? piece.stype}
          placeholder={LABELS[piece.stype] ?? piece.stype}
          spellCheck={false}
          onFocus={() => {
            editing.current = piece.sid;
          }}
          onBlur={() => {
            editing.current = null;
          }}
          onChange={(event) => {
            const text = event.target.value;
            setPieces((previous) =>
              previous.map((one) => (one.sid === piece.sid ? { ...one, text } : one))
            );
            write(piece.sid, text);
          }}
        />
      ))}
    </div>
  );
}
