import { useEffect, useRef } from 'react';
import type { Editor } from '@barocss/editor-core';
import { DOMRenderer } from '@barocss/renderer-dom';
import { getGlobalRegistry } from '@barocss/dsl';
import { WORD_ENV_KEY } from '@barocss/office-text';
import { slideSize, twipToPx,
  createDeckEnv
} from '@barocss/office-slides';

/**
 * One slide, drawn small.
 *
 * A real thumbnail is the slide drawn *again*, which is what the rail said it
 * was waiting for. What it is not is a second editor: a thumbnail is a picture,
 * so it is a plain `DOMRenderer` — no contenteditable, no observer, no input
 * path, no selection. The whole of what it needs is the same registry and the
 * same environment the stage has, because a slide's text is Word's text and
 * resolves its formatting through Word's resolvers.
 *
 * ## Scaled, not re-laid-out
 *
 * `transform: scale` of the slide at its natural size, which is exact: every
 * box on a slide is placed by coordinate, so a tenth-size drawing is the same
 * drawing with every number divided by ten. Laying it out again at a small
 * width would give a *different* deck — text wrapping where the real slide does
 * not — and a rail that lies about what the slide looks like is worse than one
 * with no pictures in it.
 *
 * ## What it costs the rest of the app
 *
 * A thumbnail draws the slide with the slide's own class and the slide's own
 * sid, so **every lookup of `.sl-slide` or of a box by sid has to say where it
 * is looking**. Three places had to be scoped to the stage after this arrived:
 * the overlay's measurement of the slide, the overlay's lookup of an element to
 * nudge while dragging, and the app's reading of the zoom — which read 10%,
 * being 128 pixels over 1280, while the stage drew the deck at 91%.
 *
 * That is the price of the pictures being real rather than fake, and it is
 * worth paying; what is not acceptable is paying it silently, so it is written
 * here where the next unscoped query will be written.
 *
 * ## A snapshot each time
 *
 * `getDocumentProxy` is a live view of the store, so handing it to a renderer
 * twice compares the tree with itself and draws nothing the second time. The
 * notes pane learned this first; it is the same fact here.
 */
export function Thumbnail({
  editor,
  slideSid,
  width,
  /** Bumped when the deck changes, so the picture is redrawn. */
  revision
}: {
  editor: Editor | null;
  slideSid: string;
  width: number;
  revision: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<DOMRenderer | null>(null);
  /**
   * What was drawn last time, as the snapshot's own text.
   *
   * A content change is one event for the whole deck, so every thumbnail is
   * asked to redraw whenever any of them changes — typing on slide one would
   * otherwise reconcile the DOM of all the others for nothing. Comparing the
   * snapshot is a string compare against work the renderer would do anyway,
   * and it turns N reconciliations into N serialisations and one redraw.
   *
   * Not free, and said so: a deck of a hundred slides serialises a hundred
   * slides per keystroke. What that wants is the change telling us *which*
   * slide it touched, which the event does not carry today.
   */
  const drawn = useRef<string | null>(null);

  const store = editor?.dataStore;
  const size = slideSize(store?.getNode(slideSid)?.attributes);
  const natural = { width: twipToPx(size.width), height: twipToPx(size.height) };
  const scale = width / Math.max(1, natural.width);

  useEffect(() => {
    if (!editor || !store || !host.current) return;

    if (!renderer.current) {
      const doc = {
        getNode: (id: string) => store.getNode(id) as never,
        rootId: editor.getRootId()
      };
      renderer.current = new DOMRenderer(getGlobalRegistry(), {
        env: { [WORD_ENV_KEY]: createDeckEnv(doc as never) }
      } as never);
    }

    const proxy = editor?.getDocumentProxy(slideSid);
    if (!proxy) return;

    const snapshot = JSON.stringify(proxy);
    if (snapshot === drawn.current) return;
    drawn.current = snapshot;

    renderer.current.render(host.current, JSON.parse(snapshot));
  }, [editor, store, slideSid, revision]);

  return (
    <span
      className="sl-thumb"
      aria-hidden
      style={{ width, height: Math.round(natural.height * scale) }}
    >
      <span
        ref={host}
        className="sl-thumb-inner"
        style={{
          width: natural.width,
          height: natural.height,
          transform: `scale(${scale})`,
          transformOrigin: 'top left'
        }}
      />
    </span>
  );
}
