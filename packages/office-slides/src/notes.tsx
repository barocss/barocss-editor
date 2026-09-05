import { useEffect, useMemo, useRef } from 'react';
import type { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { getGlobalRegistry } from '@barocss/dsl';
import { WORD_ENV_KEY } from '@barocss/office-text';
import { Button } from '@barocss/office-ui';
import { useDocumentRevision } from '@barocss/office-editor-ui';
/* 자기 배럴을 거치지 않는다 — 심볼이 사는 모듈에서 곧장. */
import { SLIDES_ENV_KEY } from './render-context';
import { noteFor } from './deck';
import { createDeckEnv } from './layout-format';

/**
 * The note the presenter reads and the audience does not.
 *
 * `surfaceNote` has been in the schema since the deck was described, `noteFor`
 * has resolved it since, and nothing had ever drawn one — the pattern this
 * repository keeps finding in its own schema, met for the sixth time.
 *
 * ## A second editable region over one document
 *
 * This is the thing the engine had not been asked for. A note is *not* on the
 * slide: it lives in `resources`, bound to the surface by id, and it is
 * ordinary flow content that a presenter types paragraphs into. So it cannot be
 * drawn by the stage, and it cannot be a plain textarea either — that would
 * throw away the marks, the paragraphs and the caret behaviour the whole engine
 * exists to get right.
 *
 * What it is instead: a second `EditorViewDOM` over **the same editor and the
 * same data store**, rendering the note's subtree. `render(tree)` takes any node
 * with a sid, which is what makes this possible at all.
 *
 * Two views, one document, and that is the point rather than a compromise:
 *
 * - **One history.** Typing in a note and typing on a slide are the same
 *   editor's transactions, so undo walks back through both in the order they
 *   happened, which is what a reader who did them in that order expects.
 * - **One selection.** A caret is in the note or on the slide, never both, and
 *   the toolbar reads whichever it is. Bold works in a note because it is the
 *   same command reading the same selection.
 * - **No second copy.** The alternative — a textarea synced back on change — is
 *   two representations of one text, and the one nobody is looking at is the one
 *   that goes wrong.
 *
 * ## What it re-renders
 *
 * Its own subtree, not the deck. The view remembers the last tree it was given,
 * so a content change redraws the note here and the slide there, and neither
 * view draws the other's region.
 */
/** What the notes pane is told. */
export interface NotesPaneProps {
  editor: Editor | null;
  slideSid?: string;
  /** Bumped by the app when the deck changes, so the note is re-resolved. */
  revision: number;
}

export function NotesPane({ editor, slideSid, revision }: NotesPaneProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorViewDOM | null>(null);
  /**
   * Only the content, because notes are a document and not a selection: a caret
   * moving changes nothing here, and rebuilding on every keystroke of the *slide*
   * would be work for nothing. `useDocumentRevision` is the suite's name for that
   * narrower question.
   */
  const tick = useDocumentRevision(editor);

  /** Which note this slide has, if it has one. */
  const noteSid = useMemo(() => {
    const store = editor?.dataStore;
    const rootId = editor?.getRootId?.();
    if (!store || !rootId || !slideSid) return undefined;
    return noteFor({ rootId, getNode: (sid: string) => store.getNode(sid) }, slideSid);
  }, [editor, slideSid, tick, revision]);

  /**
   * The second view, made once and pointed at whichever note is current.
   *
   * Made lazily and kept: constructing a view installs listeners and an
   * observer, and doing that per slide would mean tearing down the region the
   * reader might still have a caret in.
   */
  useEffect(() => {
    if (!editor || !host.current) return;

    const store0 = editor.dataStore;
    const node0 = noteSid ? store0?.getNode(noteSid) : undefined;
    // Nothing to draw yet. The view is made when there is, and not before: one
    // created against an empty region drew nothing when a note arrived later,
    // and a view that has never rendered is a state not worth having.
    if (!node0) return;

    if (!view.current) {
      const store = editor.dataStore;
      const doc = {
        getNode: (id: string) => store.getNode(id) as never,
        rootId: editor.getRootId()
      };
      view.current = new EditorViewDOM(editor, {
        container: host.current,
        registry: getGlobalRegistry(),
        env: {
          // The same environment the stage has: a note's paragraphs are Word's
          // paragraphs and resolve their formatting the same way.
          [WORD_ENV_KEY]: createDeckEnv(doc as never),
          // And the one thing this view knows that the stage does not — that it
          // is the region notes are meant to be drawn in. The stage renders the
          // whole document, resources included, so without this every slide's
          // note would also appear under the slide.
          [SLIDES_ENV_KEY]: { showsNotes: true }
        }
      });
    }

    const store = editor.dataStore;
    const node = noteSid ? store?.getNode(noteSid) : undefined;
    if (!node) return;

    /**
     * A *snapshot*, not the store's proxy.
     *
     * `getDocumentProxy` hands back a live view of the store: reading it after
     * an edit gives the edited values, which is what makes it cheap and what
     * makes it useless here. The reconciler compares the tree it was given with
     * the tree it drew last time, and when both are the same live object every
     * comparison says nothing changed — measured, with the model plainly holding
     * "The ABpoint" and the pane still drawing "The point".
     */
    const proxy = editor?.getDocumentProxy(noteSid) ?? node;
    const tree = JSON.parse(JSON.stringify(proxy));
    view.current.render(tree, { sync: true });
  }, [editor, noteSid, tick, revision]);

  useEffect(
    () => () => {
      view.current?.destroy?.();
      view.current = null;
    },
    []
  );

  const missing = !noteSid;

  return (
    <section className="sl-notes" aria-label="발표자 노트">
      <h2 className="sl-notes-title">발표자 노트</h2>
      {missing ? (
        <p className="sl-notes-empty">
          이 슬라이드에는 노트가 없습니다. 아래를 눌러 추가하세요.
          <Button
            onClick={() => void editor?.executeCommand?.('addSlideNote', { slideId: slideSid })}
          >
            노트 추가
          </Button>
        </p>
      ) : null}
      <div ref={host} className="sl-notes-host" hidden={missing} />
    </section>
  );
}
