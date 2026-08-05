/**
 * The unified Office schema.
 *
 * Word, Slide, PageBuilder and FigJam all read and write **one** document model,
 * the way Figma's design, FigJam and Slides files share a single node graph. A
 * product is not a different schema — it is a different set of behaviours over
 * the same vocabulary. That is what makes an extension written for one product
 * meaningful in another, and what makes cross-product copy/paste a data move
 * rather than a conversion.
 *
 * The structure follows `docs/specs/standard-schema.md` §9.1: one flat schema
 * containing every node type, with **content expressions** deciding where each
 * type may appear. There is no runtime concept of nested schemas.
 *
 *     document
 *       └── surface+                     a page / canvas / slide / web page
 *             ├── block+                 flow content   (Word, PageBuilder)
 *             └── scene+                 positioned art (Slide, FigJam)
 *
 * `surface` is the seam. A flow surface holds blocks; a canvas surface holds
 * scene nodes. Both live in the same file, so a Word document can embed a canvas
 * and a slide can embed a rich-text frame without either product learning a
 * second model.
 *
 * Domain isolation comes from group membership, not from separate schemas:
 * scene-only types are in group `scene` and are therefore unreachable from
 * `block+`, and vice versa. Content expressions are checked by ContentMatch, so
 * these constraints are actually enforced at commit time.
 */
import type { NodeTypeDefinition, SchemaDefinition } from './types';
import { getStandardSchemaDefinition } from './standard-schema';

/** Nodes that can sit directly on a canvas surface, in a frame, or in a group. */
const SCENE = 'scene';

/** Geometry shared by everything positioned on a canvas. */
const geometry = {
  x: { type: 'number' as const, default: 0 },
  y: { type: 'number' as const, default: 0 },
  width: { type: 'number' as const, required: true },
  height: { type: 'number' as const, required: true },
  rotation: { type: 'number' as const, default: 0 },
  opacity: { type: 'number' as const, default: 1 },
  locked: { type: 'boolean' as const, default: false },
  visible: { type: 'boolean' as const, default: true }
};

const style = {
  fill: { type: 'string' as const, required: false },
  stroke: { type: 'string' as const, required: false },
  strokeWidth: { type: 'number' as const, default: 1 }
};

/**
 * Canvas half of the model: surfaces, containers and shapes.
 *
 * Exported separately so a product can merge just this into a document schema
 * (see `docs/specs/standard-schema.md` §9.1) without taking the whole Office
 * vocabulary.
 */
export function getCanvasNodeDefinitions(): Record<string, NodeTypeDefinition> {
  return {
    // ── Containers ───────────────────────────────────────────────────────────
    frame: {
      name: 'frame',
      group: SCENE,
      content: 'scene*',
      attrs: {
        name: { type: 'string', required: false },
        clipsContent: { type: 'boolean', default: true },
        layoutMode: { type: 'string', required: false },
        ...geometry,
        ...style
      }
    },
    group: {
      name: 'group',
      group: SCENE,
      // A group with nothing in it is not a group.
      content: 'scene+',
      attrs: { name: { type: 'string', required: false }, ...geometry }
    },

    // ── Shapes ───────────────────────────────────────────────────────────────
    rectangle: {
      name: 'rectangle',
      group: SCENE,
      atom: true,
      attrs: { cornerRadius: { type: 'number', default: 0 }, ...geometry, ...style }
    },
    ellipse: { name: 'ellipse', group: SCENE, atom: true, attrs: { ...geometry, ...style } },
    line: { name: 'line', group: SCENE, atom: true, attrs: { ...geometry, ...style } },
    connector: {
      name: 'connector',
      group: SCENE,
      atom: true,
      // FigJam's arrows: endpoints reference other scene nodes by sid.
      attrs: {
        startNodeId: { type: 'string', required: false },
        endNodeId: { type: 'string', required: false },
        ...geometry,
        ...style
      }
    },
    path: {
      name: 'path',
      group: SCENE,
      atom: true,
      // Freehand ink and vector paths alike; `d` is SVG path data.
      attrs: { d: { type: 'string', required: true }, ...geometry, ...style }
    },
    sticky: {
      name: 'sticky',
      group: SCENE,
      // A sticky note holds flow content, which is how canvas and document meet.
      content: 'block+',
      attrs: { ...geometry, ...style }
    },
    /**
     * Rich text placed on a canvas. Its children are ordinary blocks, so every
     * text command written for Word works inside a slide or a FigJam frame.
     */
    textFrame: {
      name: 'textFrame',
      group: SCENE,
      content: 'block+',
      attrs: { verticalAlign: { type: 'string', default: 'top' }, ...geometry, ...style }
    },
    /** Reusable definition and its placements (Figma component / instance). */
    component: {
      name: 'component',
      group: SCENE,
      content: 'scene*',
      attrs: { name: { type: 'string', required: true }, ...geometry }
    },
    instance: {
      name: 'instance',
      group: SCENE,
      atom: true,
      attrs: { componentId: { type: 'string', required: true }, ...geometry }
    },

    /** A canvas embedded inside flow content — a diagram in the middle of a Word document. */
    canvasBlock: {
      name: 'canvasBlock',
      group: 'block',
      content: 'scene*',
      attrs: { width: { type: 'number', required: false }, height: { type: 'number', required: false } }
    }
  };
}

/** Document-level content that is not laid out in the flow. */
const META = 'meta';  // group name for docTitle/docSubtitle/docAuthor

/** A definition referenced from the flow by id, placed by the product. */
const RESOURCE = 'resource';

/**
 * Document-level content and referenced definitions.
 *
 * Three kinds of thing are NOT flow content but still belong to the document:
 *
 *   document.attrs   scalars that are never rich and never separately edited
 *                    (locale, revision, pageSize)
 *   meta             document-level CONTENT — a title carries marks, takes a
 *                    collaborative cursor, and lives in history like any node
 *   resources        definitions referenced by id from the flow — footnote and
 *                    endnote bodies, comment threads, speaker notes, headers
 *
 * `resources` exists because the render position of these is a *layout*
 * decision, not an authoring one: a footnote sits at the foot of a printed page,
 * in a popover on the web, and in a side panel in review mode. Keeping them out
 * of `surface` means the authoring model does not encode one product's layout,
 * while keeping them in the document means they are still saved, undone,
 * collaboratively edited and addressable by sid — which attributes could never
 * give them.
 *
 * The reference direction already exists in the mark vocabulary: the flow holds
 * `footnoteRef` (a mark carrying `id`), the body lives here. Several references
 * may point at one definition.
 */
export function getMetaNodeDefinitions(): Record<string, NodeTypeDefinition> {
  return {
    docMeta: { name: 'docMeta', group: 'document', content: 'docTitle? docSubtitle? docAuthor*' },
    docTitle: { name: 'docTitle', group: META, content: 'inline*' },
    docSubtitle: { name: 'docSubtitle', group: META, content: 'inline*' },
    docAuthor: { name: 'docAuthor', group: META, content: 'inline*' },

    resources: { name: 'resources', group: 'document', content: 'resource*' },

    // Bodies referenced from the flow by `footnoteRef` / `endnoteRef` marks.
    footnoteDef: {
      name: 'footnoteDef',
      group: RESOURCE,
      content: 'block+',
      attrs: { id: { type: 'string', required: true } }
    },
    endnoteDef: {
      name: 'endnoteDef',
      group: RESOURCE,
      content: 'block+',
      attrs: { id: { type: 'string', required: true } }
    },
    /**
     * A discussion anchored to something in the document. `targetId` is the sid
     * it is about, so the same mechanism serves a Word comment, a FigJam sticky
     * reply and a review note on a slide.
     */
    commentThread: {
      name: 'commentThread',
      group: RESOURCE,
      content: 'block+',
      attrs: {
        id: { type: 'string', required: true },
        targetId: { type: 'string', required: false },
        resolved: { type: 'boolean', default: false }
      }
    },
    /** Slide speaker notes — bound to one surface rather than the document. */
    speakerNote: {
      name: 'speakerNote',
      group: RESOURCE,
      content: 'block+',
      attrs: { surfaceId: { type: 'string', required: true } }
    },
    /**
     * Repeating page furniture. Document-wide when `surfaceId` is absent, an
     * override for one surface when present — the same binding rule as every
     * other resource, rather than a second mechanism.
     */
    docHeader: {
      name: 'docHeader',
      group: RESOURCE,
      content: 'block+',
      attrs: {
        /**
         * Referenced by id as well as bound by surface, because one section can
         * need several: a first-page header, an even-page header and the rest.
         * `surfaceId` alone cannot say which of the three a given header is.
         */
        id: { type: 'string', required: false },
        surfaceId: { type: 'string', required: false }
      }
    },
    docFooter: {
      name: 'docFooter',
      group: RESOURCE,
      content: 'block+',
      attrs: {
        id: { type: 'string', required: false },
        surfaceId: { type: 'string', required: false }
      }
    },
    bibliography: { name: 'bibliography', group: RESOURCE, content: 'block*' },
    indexBlock: { name: 'indexBlock', group: RESOURCE, content: 'block*' }
  };
}

/**
 * Surfaces: the per-product page. All four products use the same node type and
 * differ only in `kind` and which content they hold.
 */
export function getSurfaceNodeDefinitions(): Record<string, NodeTypeDefinition> {
  return {
    /**
     * `meta? surface+ resources?` — metadata and referenced definitions are
     * siblings of the pages, not children of them. See getMetaNodeDefinitions.
     */
    document: { name: 'document', group: 'document', content: 'docMeta? surface+ resources?' },
    /**
     * One page / slide / canvas / web page.
     *
     * `block+ | scene*` is the whole product split: a Word page and a
     * PageBuilder page hold blocks, a slide and a FigJam board hold scene nodes.
     * `kind` records which, so a product can filter surfaces it understands
     * while still round-tripping the ones it does not.
     */
    surface: {
      name: 'surface',
      group: 'surface',
      content: 'block+ | scene*',
      attrs: {
        kind: { type: 'string', default: 'flow' },
        name: { type: 'string', required: false },
        width: { type: 'number', required: false },
        height: { type: 'number', required: false }
      }
    }
  };
}

/**
 * The whole Office vocabulary: standard document nodes + canvas nodes, under a
 * document → surface root.
 *
 * Products install different kits over this one schema rather than defining
 * their own.
 */
export function getOfficeSchemaDefinition(): SchemaDefinition {
  const standard = getStandardSchemaDefinition();

  // The standard schema roots at `document → block+`. Office roots at
  // `document → surface+` so a file can hold several pages/slides/boards, so the
  // standard `document` definition is replaced rather than merged.
  const { document: _standardDocument, ...standardNodes } = standard.nodes;

  return {
    topNode: 'document',
    nodes: {
      ...standardNodes,
      ...getSurfaceNodeDefinitions(),
      // Deliberately after the standard nodes: the standard schema declares
      // footnoteDef, commentThread, bibliography, indexBlock, docHeader and
      // docFooter as `group: 'block'`, which lets a footnote body sit between two
      // paragraphs in the flow. Office re-declares them as resources so they are
      // reachable only through `resources`, and placed by the product.
      ...getMetaNodeDefinitions(),
      ...getCanvasNodeDefinitions()
    },
    marks: standard.marks
  };
}

/** Surface kinds the built-in products use. Not exhaustive — `kind` is a free string. */
export const SurfaceKind = {
  /** Word, PageBuilder: flow content, paginated or responsive at the product layer. */
  Flow: 'flow',
  /** Slide: fixed-size canvas. */
  Slide: 'slide',
  /** FigJam: unbounded canvas. */
  Board: 'board'
} as const;

export type SurfaceKindValue = (typeof SurfaceKind)[keyof typeof SurfaceKind];
