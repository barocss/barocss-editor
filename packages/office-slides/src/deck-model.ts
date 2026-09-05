import { useEffect, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
/* 자기 배럴을 거치지 않는다 — 심볼이 사는 모듈에서 곧장. */
import { deckSlides, noteFor, type DeckAccess, type Slide } from './deck';

/**
 * The deck, as the chrome needs it, kept up with the document.
 *
 * The reading itself is in `deck.ts` — what a slide is called,
 * which are hidden, which note belongs to which — because the presenter view
 * and the exporter will want the same answers and none of them should ask the
 * DOM. This is only the part that is React's: subscribing, and re-reading when
 * the document changes.
 */
function accessOf(editor: Editor): DeckAccess | null {
  const store = editor.dataStore;
  const rootId = store?.getRootNodeId?.();
  if (!store || !rootId) return null;
  return { rootId, getNode: (sid: string) => store.getNode(sid) };
}

export function useDeck(editor: Editor | null): Slide[] {
  const [slides, setSlides] = useState<Slide[]>([]);

  useEffect(() => {
    if (!editor) return;

    const read = () => {
      const doc = accessOf(editor);
      setSlides(doc ? deckSlides(doc) : []);
    };
    read();

    editor.on('editor:content.change', read);
    return () => {
      editor?.off('editor:content.change', read);
    };
  }, [editor]);

  return slides;
}

/**
 * How many times the document has changed.
 *
 * A count rather than the change itself: what asks for this is a *picture* of
 * the deck — a thumbnail, an overlay's measurement — and what it needs to know
 * is only that the picture is out of date. Passing the slides would say when a
 * slide was added and stay silent when a word was typed on one, which is the
 * half of the question these callers care about most.
 */
export function useRevision(editor: Editor | null): number {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!editor) return;
    const bump = () => setRevision((n) => n + 1);
    editor.on('editor:content.change', bump);
    return () => {
      editor?.off('editor:content.change', bump);
    };
  }, [editor]);

  return revision;
}

/** The text of the note bound to a slide, for a panel that only shows it. */
export function useNote(editor: Editor | null, surfaceSid: string | undefined): string {
  const [text, setText] = useState('');

  useEffect(() => {
    if (!editor || !surfaceSid) {
      setText('');
      return;
    }

    const read = () => {
      const doc = accessOf(editor);
      const note = doc && noteFor(doc, surfaceSid);
      if (!doc || !note) {
        setText('');
        return;
      }

      /**
       * The note's text, flattened.
       *
       * A note is real editable content — paragraphs, marks, a caret — and
       * flattening it here throws all of that away. That is a limit of the
       * panel and not of the note: showing it properly means a second editable
       * region over the same document, which is the next thing this app needs
       * and is written up rather than faked with a textarea that could not save
       * what was typed in it.
       */
      const textOf = (sid: string, depth = 0): string => {
        if (depth > 8) return '';
        const node: any = doc.getNode(sid);
        if (!node) return '';
        if (typeof node.text === 'string') return node.text;
        const children: string[] = Array.isArray(node.content) ? node.content : [];
        const inner = children.map((child) => textOf(child, depth + 1));
        return node.stype === 'paragraph' ? `${inner.join('')}\n` : inner.join('');
      };

      setText(textOf(note).trim());
    };
    read();

    editor.on('editor:content.change', read);
    return () => {
      editor?.off('editor:content.change', read);
    };
  }, [editor, surfaceSid]);

  return text;
}
