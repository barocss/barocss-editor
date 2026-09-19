// Types
export type {
  SchemaDefinition,
  NodeTypeDefinition,
  AttributeDefinition,
  MarkDefinition,
  ValidationResult,
  Mark,
  SchemaExtensions,
  ValidationErrorCode
} from './types';

// Validation Constants
export { VALIDATION_ERRORS } from './types';

// Schema
export { Schema, createSchema } from './schema';

// Registry
export { 
  SchemaRegistry, 
  schemaRegistry,
  registerSchema,
  getSchema,
  hasSchema,
  removeSchema,
  getAllSchemas,
  getNodeTypesByGroup,
  getNodeTypesByGroupInSchema,
  clearSchemas
} from './registry';

// Validators
export { Validator } from './validators';

/**
 * Checking a whole document, which nothing did: operations validate what they
 * write and a *loaded* document went in as written.
 */
export { validateTree, describeFindings, type TreeFinding } from './validate-tree';

// Editor Manager
export { 
  EditorSchemaManager,
  createEditorManager,
  editorManager
} from './editor-manager';

// Standard schema presets (spec: docs/specs/standard-schema.md)
export { getMinimalSchemaDefinition, getStandardSchemaDefinition } from './standard-schema';
export { getProseNodeDefinitions } from './prose-schema';

// Figma-like reference schema (spec: docs/specs/standard-schema.md §9.1)
export { getFigmaLikeSchemaDefinition } from './figma-like-schema';

export {
  ContentMatch,
  getContentMatch,
  ContentExpressionError,
  type ContentMatchContext,
  type MatchResult
} from './content-match';

export {
  fitContent,
  type FitNode,
  type FitResult
} from './content-fitting';

export {
  getOfficeSchemaDefinition,
  getCanvasNodeDefinitions,
  getSurfaceNodeDefinitions,
  getMetaNodeDefinitions,
  CANVAS_GEOMETRY_ATTRS,
  CANVAS_STYLE_ATTRS,
  SurfaceKind,
  /**
   * Where a document-level container belongs, from the same list the content model is written in.
   *
   * A command that appends one is a command that works until the document has the container that
   * comes after it — measured, and refused by the validator (see the function).
   */
  DOCUMENT_CHILD_ORDER,
  documentChildSpot,
  type SurfaceKindValue
} from './office-schema';

export * from './dataset-fields';
export * from './database-schema';

export * from './dataset-evaluation';

export * from './dataset-views';

export { datasetLocalDay, validDatasetFilters, normalizeDatasetFilters, repairDatasetFilters, DATASET_FILTER_OPERATORS } from './dataset-query';
export type { DatasetFilterRule, DatasetFilterGroup, DatasetFilterOperator, DatasetSort } from './dataset-query';
