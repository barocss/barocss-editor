/**
 * Figma-like schema (reference only).
 *
 * Flat, vector/canvas-oriented node set inspired by Figma Plugin API:
 * DOCUMENT → PAGE (canvas) → FRAME | GROUP | RECTANGLE | ELLIPSE | LINE | VECTOR | TEXT | COMPONENT | INSTANCE.
 *
 * Use for reference when designing canvas/vector editors; not part of the document standard schema.
 * Spec: docs/specs/standard-schema.md §9.1 (multi-domain); Figma Plugin API node types.
 */
import type { SchemaDefinition } from './types';

/** "Scene" group: nodes that can be direct children of page, frame, or group. */
const sceneGroup = 'scene';

/**
 * Returns a SchemaDefinition that mirrors Figma-style hierarchy (document → page → layers).
 * All layer types are in group "scene" so they can nest inside page, frame, and group.
 */
export function getFigmaLikeSchemaDefinition(): SchemaDefinition {
  return {
    topNode: 'document',
    nodes: {
      // Root (Figma DOCUMENT)
      document: {
        name: 'document',
        group: 'document',
        content: 'page+',
      },
      // Page / canvas (Figma PAGE)
      page: {
        name: 'page',
        group: 'block',
        content: 'scene*',
        attrs: {
          name: { type: 'string', required: false },
        },
      },
      // Frame (Figma FRAME) – layout container
      frame: {
        name: 'frame',
        group: sceneGroup,
        content: 'scene*',
        attrs: {
          name: { type: 'string', required: false },
          x: { type: 'number', default: 0 },
          y: { type: 'number', default: 0 },
          width: { type: 'number', required: true },
          height: { type: 'number', required: true },
          rotation: { type: 'number', default: 0 },
          layoutMode: { type: 'string', required: false },
          clipsContent: { type: 'boolean', default: false },
        },
      },
      // Group (Figma GROUP) – logical grouping, no fixed size
      group: {
        name: 'group',
        group: sceneGroup,
        content: 'scene+',
        attrs: {
          name: { type: 'string', required: false },
          x: { type: 'number', default: 0 },
          y: { type: 'number', default: 0 },
        },
      },
      // Rectangle (Figma RECTANGLE)
      rectangle: {
        name: 'rectangle',
        group: sceneGroup,
        atom: true,
        attrs: {
          name: { type: 'string', required: false },
          x: { type: 'number', default: 0 },
          y: { type: 'number', default: 0 },
          width: { type: 'number', required: true },
          height: { type: 'number', required: true },
          rotation: { type: 'number', default: 0 },
          cornerRadius: { type: 'number', default: 0 },
          fills: { type: 'string', required: false },
          strokes: { type: 'string', required: false },
          strokeWeight: { type: 'number', default: 0 },
        },
      },
      // Ellipse (Figma ELLIPSE)
      ellipse: {
        name: 'ellipse',
        group: sceneGroup,
        atom: true,
        attrs: {
          name: { type: 'string', required: false },
          x: { type: 'number', default: 0 },
          y: { type: 'number', default: 0 },
          width: { type: 'number', required: true },
          height: { type: 'number', required: true },
          rotation: { type: 'number', default: 0 },
          fills: { type: 'string', required: false },
          strokes: { type: 'string', required: false },
        },
      },
      // Line (Figma LINE)
      line: {
        name: 'line',
        group: sceneGroup,
        atom: true,
        attrs: {
          name: { type: 'string', required: false },
          x1: { type: 'number', default: 0 },
          y1: { type: 'number', default: 0 },
          x2: { type: 'number', required: true },
          y2: { type: 'number', required: true },
          strokes: { type: 'string', required: false },
          strokeWeight: { type: 'number', default: 1 },
        },
      },
      // Vector path (Figma VECTOR)
      vector: {
        name: 'vector',
        group: sceneGroup,
        atom: true,
        attrs: {
          name: { type: 'string', required: false },
          x: { type: 'number', default: 0 },
          y: { type: 'number', default: 0 },
          width: { type: 'number', required: true },
          height: { type: 'number', required: true },
          rotation: { type: 'number', default: 0 },
          pathData: { type: 'string', required: false },
          fills: { type: 'string', required: false },
          strokes: { type: 'string', required: false },
        },
      },
      // Text (Figma TEXT)
      text: {
        name: 'text',
        group: sceneGroup,
        atom: true,
        attrs: {
          name: { type: 'string', required: false },
          x: { type: 'number', default: 0 },
          y: { type: 'number', default: 0 },
          width: { type: 'number', required: false },
          height: { type: 'number', required: false },
          rotation: { type: 'number', default: 0 },
          characters: { type: 'string', default: '' },
          fontSize: { type: 'number', default: 12 },
          fontName: { type: 'string', required: false },
          fills: { type: 'string', required: false },
        },
      },
      // Component definition (Figma COMPONENT)
      component: {
        name: 'component',
        group: sceneGroup,
        content: 'scene+',
        attrs: {
          name: { type: 'string', required: false },
          key: { type: 'string', required: false },
        },
      },
      // Component instance (Figma INSTANCE)
      instance: {
        name: 'instance',
        group: sceneGroup,
        atom: true,
        attrs: {
          name: { type: 'string', required: false },
          mainComponentId: { type: 'string', required: true },
          x: { type: 'number', default: 0 },
          y: { type: 'number', default: 0 },
          width: { type: 'number', required: false },
          height: { type: 'number', required: false },
          rotation: { type: 'number', default: 0 },
        },
      },
    },
    marks: {},
  };
}
