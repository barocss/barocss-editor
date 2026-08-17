import { SurfaceKind, getOfficeSchemaDefinition } from '@barocss/schema';
import type { SchemaDefinition } from '@barocss/schema';

/**
 * What a deck is — which is a question the schema had already answered.
 *
 * Nothing here is new. `office-schema` declares a `surface` whose content is
 * `block+ | scene*` and whose `kind` records which, with a comment saying "a
 * Word page and a PageBuilder page hold blocks, a slide and a FigJam board hold
 * scene nodes". It declares `SurfaceKind.Slide`. It declares the whole scene
 * node set — `frame`, `rectangle`, `ellipse`, `line`, `connector`, `path`,
 * `sticky`, `textFrame`, `component`, `instance` — with shared `geometry` and
 * `style` groups. And `textFrame` carries the sentence this product is built on:
 *
 *   "Rich text placed on a canvas. Its children are ordinary blocks, so every
 *    text command written for Word works inside a slide or a FigJam frame."
 *
 * Word used one half of that surface and left the other half unread. This is the
 * fifth time in this repository that the schema declared something no code read,
 * and the largest: an entire second document shape, waiting.
 *
 * So the slides schema is the office schema. What this file adds is only what a
 * *deck* needs that a document does not — which turns out to be two attributes
 * and a set of names for what a placed thing is *for*.
 */

/** 16:9 in twips, the unit every length in this engine is in — 13.33in × 7.5in. */
export const SLIDE_WIDTH = 19200;
export const SLIDE_HEIGHT = 10800;

/** 4:3, for a deck that wants it. */
export const SLIDE_WIDTH_4_3 = 14400;
export const SLIDE_HEIGHT_4_3 = 10800;

/**
 * What a placed box is *for*, which a layout uses to style it.
 *
 * Not a node type: a title and a body are both `textFrame`, and the difference
 * is which of the layout's slots they fill. Making them separate types would
 * mean a command that changes one into the other has to replace the node, and
 * every text command would need to know about both.
 */
export const PLACEHOLDER_ROLES = ['title', 'subtitle', 'body', 'caption', 'notes'] as const;
export type PlaceholderRole = (typeof PLACEHOLDER_ROLES)[number];

export function getSlidesSchemaDefinition(): SchemaDefinition {
  const office = getOfficeSchemaDefinition();

  return {
    ...office,
    nodes: {
      ...office.nodes,

      /**
       * A surface that is a slide.
       *
       * The same node Word uses, with two attributes added: which layout it
       * follows, and whether it is skipped while presenting. Both are the deck's
       * business and neither means anything to a page.
       *
       * Left as `block+ | scene*` rather than narrowed to `scene*`: a slide
       * holding a single flow of blocks is what a Word document looks like, and
       * a deck imported from one should round-trip rather than be refused.
       */
      surface: {
        ...office.nodes.surface,
        attrs: {
          ...office.nodes.surface.attrs,
          /** The layout this slide takes its placeholder formatting from. */
          layoutId: { type: 'string', required: false },
          /** Kept in the deck, skipped while presenting. */
          hidden: { type: 'boolean', default: false },
          /**
           * What the presenter says lives in a `speakerNote`, which finds its
           * slide by `surfaceId` — so a slide needs no attribute for it.
           */
        }
      },

      /**
       * Rich text placed on a slide.
       *
       * Word's `textFrame`, with the one thing a deck adds: which slot of the
       * layout it fills. A title is a `textFrame` with `role: 'title'`, so every
       * command that works on a paragraph works on a title, which is the whole
       * reason this product is cheap.
       */
      textFrame: {
        ...office.nodes.textFrame,
        attrs: {
          ...office.nodes.textFrame.attrs,
          role: { type: 'string', required: false }
        }
      },

      // Speaker notes are `speakerNote`, which the office schema already
      // declares — a resource bound to one surface by `surfaceId`. I wrote a
      // `slideNotes` before reading for one, which is the mistake this whole
      // product keeps finding in other people's code and is why the check
      // belongs in the build rather than in somebody's memory.

      /**
       * A layout: the placeholders a slide of this kind starts with, and how
       * they are formatted.
       *
       * A definition, like a style — it is referenced by `layoutId` and never
       * drawn. Its children are the placeholder boxes at the positions the
       * layout puts them.
       */
      slideLayout: {
        name: 'slideLayout',
        group: 'resource',
        content: 'scene*',
        attrs: {
          id: { type: 'string', required: true },
          name: { type: 'string', required: false }
        }
      }
    }
  };
}

/** The kind a slide surface carries, so a product can tell one from a page. */
export const SLIDE_KIND = SurfaceKind.Slide;
