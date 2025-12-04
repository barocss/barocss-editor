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

// Editor Manager
export { 
  EditorSchemaManager,
  createEditorManager,
  editorManager
} from './editor-manager';
