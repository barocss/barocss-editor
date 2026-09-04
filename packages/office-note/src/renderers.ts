import { RendererRegistry, define, element, intoRegistry, slot } from '@barocss/dsl';
import { registerTextRenderers } from '@barocss/office-text';

/**
 * **What draws a note** — which is `office-text`, plus one node.
 *
 * ## Why there is so little here
 *
 * Measured before the package was written: renderers register **globally by stype**, and
 * `office-text` already draws every block a body holds — `paragraph`, `heading`, `list`, `listItem`,
 * `codeBlock`, `blockQuote`, `bTable*`, `horizontalRule`, `inline-image`, `emoji`, `hardBreak`,
 * `inline-text`. So a note was drawable before it existed, and what this adds is the one node that
 * is the package's own: the document itself.
 *
 * That is also the argument for the nodes staying the shared vocabulary: a card in a site draws a
 * body with the site's own renderers because the stypes are the same. A note is a different
 * **document**, not a different vocabulary.
 *
 * ## And the one that was missing
 *
 * A `note` had no renderer, so a session loaded a body into a store of its own and the view drew
 * **nothing** — the blocks were there and the root that holds them was not a thing anything knew how
 * to put on screen. Found by clicking into one.
 *
 * ## **It does not register the text renderers**, and that is the whole of the second lesson
 *
 * It did, and calling it after a product's registration **silently put the product's overrides
 * back**: `office-site` overrides `list`, `codeBlock`, `picture` and more on top of `office-text`'s,
 * and this ran `registerTextRenderers()` again afterwards. Measured — a page's list drew as a `div`
 * instead of a `ul`, four code-block checks failed, and none of it said anything.
 *
 * So this registers **only the note's own nodes**, and a host with no product behind it calls
 * `registerNoteStandalone()` instead, which is the pair.
 *
 * ## And the three that were the products'
 *
 * `picture`, `mediaVideo` and `mediaEmbed` are drawn by the site, the deck and Word — three copies
 * of each, none of them shared. Embedded in a site a note borrowed the site's, which worked and hid
 * the gap; `apps/note` mounted one with no product behind it and the three came out **invisible**:
 * the model gained a block and the screen showed nothing.
 *
 * So a note draws its own, and they are deliberately plain. A site's picture answers to a crop, a
 * hover, a link, a set of widths and a lazy-loading policy — none of which is a body's business. A
 * body's picture is a picture.
 */
/**
 * **한 편의 글은 자기 레지스트리에 그린다** — and this is what replaces the split below.
 *
 * ## What the split was for, and why it stops being needed
 *
 * Renderers used to be able to land in exactly one place: the global registry, last write wins. So a
 * note embedded in a site had two bad options — register the prose vocabulary and **revert five of
 * the site's own renderers**, which happened and was measured, or register only `note` and borrow
 * whatever the host had, which is how `picture`, `mediaVideo` and `mediaEmbed` came to be drawn by a
 * product for weeks without anyone noticing. `registerNoteRenderers` / `registerNoteStandalone` is
 * that dilemma written down as two functions.
 *
 * A registry of its own answers both at once. A note draws with **note's** renderers wherever it is
 * mounted — inside a site, inside Word, on its own — and takes nothing away from the host, because
 * nothing it registers is global any more.
 *
 * ## Built once, shared by every note
 *
 * Renderers are pure declarations keyed by stype; twelve notes on a page want the same 30 of them,
 * not 360. The registry is `{ global: false }`, so anything a note does *not* draw still falls back
 * to whatever the host has registered globally — which is the right answer for a stype this package
 * has no opinion about.
 */
let mine: RendererRegistry | undefined;

export function noteRegistry(): RendererRegistry {
  if (mine) return mine;
  mine = new RendererRegistry({ global: false });
  intoRegistry(mine, () => registerNoteStandalone());
  return mine;
}

export function registerNoteRenderers(): void {
  /*
   * A plain box with its blocks in it. Not `display: none` like the resources a document keeps —
   * this is the one node here whose content is words a person writes, and drawing it is the point.
   */
  define('note', element('div', { className: 'on-doc' }, [slot('content')]));
}

/**
 * **A note with nothing behind it** — the text renderers, this node, and the three a product would
 * otherwise have supplied.
 *
 * The pair of the one above, and the split is a fault rather than a taste: registering is a global
 * write, so a package that registers what it merely *needs* undoes what a host has already decided.
 * A site calls `registerNoteRenderers()` after its own; `apps/note` calls this and nothing else.
 */
export function registerNoteStandalone(): void {
  registerTextRenderers();
  registerNoteRenderers();

  /**
   * A picture, at the width it is given and no more. `alt` is drawn from the node because a body is
   * read by people who cannot see it, and an image in a post with no words for it is the commonest
   * accessibility fault there is.
   */
  define(
    'picture',
    element('img', {
      className: 'on-picture',
      src: (one: Record<string, any>) => String(one.attributes?.src ?? ''),
      alt: (one: Record<string, any>) => String(one.attributes?.alt ?? '')
    })
  );

  /*
   * A video and an embed, as the two elements a browser has had for fifteen years — `<video
   * controls>` and an `<iframe>`. **No library**, which is the same answer the site gives: a body
   * that needed a player to be read would be a body nobody can publish as a file.
   */
  /**
   * **A holder around each, because a player swallows a click.**
   *
   * Measured: a reader who clicked an embedded video did not hold it — the strip went on describing
   * the picture above. An `<iframe>` is a document of its own and a `<video controls>` has its own
   * control bar, so neither ever hands a `mousedown` to the page around it. The renderer drew the
   * one element a reader cannot select, which is the same fault as drawing nothing.
   *
   * So the sid goes on a holder — the outer element is the one the framework marks — and the player
   * inside it is `pointer-events: none` **while being edited**. A published body has no holder rule,
   * so a reader there still presses play. This is the ordinary answer and the reason for it is worth
   * keeping: an editing surface takes the clicks; a page gives them away.
   */
  define(
    'mediaVideo',
    element('div', { className: 'on-video-holder' }, [
      element('video', {
        className: 'on-video',
        src: (one: Record<string, any>) => String(one.attributes?.src ?? '').trim(),
        controls: (one: Record<string, any>) => one.attributes?.controls !== false
      })
    ])
  );

  define(
    'mediaEmbed',
    element('div', { className: 'on-embed-holder' }, [
    element('iframe', {
      className: 'on-embed',
      /*
       * The provider and the id, made into an address here rather than stored as one: an id survives
       * a provider changing its URL shape, which an address does not.
       */
      src: (one: Record<string, any>) => {
        const who = String(one.attributes?.provider ?? '').trim();
        const id = String(one.attributes?.id ?? '').trim();
        if (!id) return '';
        if (who === 'youtube') return `https://www.youtube.com/embed/${id}`;
        if (who === 'vimeo') return `https://player.vimeo.com/video/${id}`;
        return id;
      },
      loading: 'lazy',
      referrerpolicy: 'no-referrer'
    })
    ])
  );
}
