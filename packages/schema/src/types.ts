export interface AttributeDefinition {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'custom';
  default?: any;
  required?: boolean | ((attrs: Record<string, any>) => boolean);
  validator?: (value: any, attrs?: Record<string, any>) => boolean;
  /**
   * The values this attribute may take, when it is one of a fixed set.
   *
   * ## Why this exists rather than a comment
   *
   * The set was already written down — in prose, above the declaration:
   * *"`linear` or `radial`. Anything else is drawn as linear."*, *"`solid`, `dash`,
   * `dot` or `dashDot`."* A comment is not readable by anything, so the same fixed
   * set was written again in every toolbar that offers it and every check that
   * wants to know what a legal value looks like — and a value added to the drawing
   * and not to the prose is invisible.
   *
   * Found by a conformance check: `gradientKind` looked **unread** on six node
   * types. It was read; the check had set it to a value no renderer recognised, so
   * the drawing fell back to linear and the two renders agreed. A check cannot
   * invent a legal value for a set nobody declares.
   *
   * Two things read it today — `Validator.validateAttributes` rejects a value
   * outside the set, and the harness's attribute probe picks one inside it — which
   * is the standard this repository holds itself to: a declaration nothing reads is
   * a promise nothing keeps.
   */
  options?: readonly string[];
  /**
   * The range a number may take, when it has one.
   *
   * The same argument as `options`, for the other kind of attribute whose meaning is
   * narrower than its type. A picture's `cropLeft` is declared `type: 'number'` and is
   * a **fraction of the picture**: `fraction()` clamps anything above 1, so a crop of
   * 4000 is a crop of 1, and four of those crop the picture out of existence.
   *
   * Found the same way `options` was: the attribute probe set all four crops to a
   * number outside the range, the drawing came back uncropped, and the check reported
   * four attributes unread about the file that reads them. Declared here so the
   * validator can reject a value the product would silently clamp, and so a check can
   * pick one the product will actually use.
   */
  min?: number;
  max?: number;
  transform?: (value: any) => any;
  customType?: string;
  // Object schema for detailed object validation
  objectSchema?: Record<string, AttributeDefinition>;
}

// Unified schema definition
export interface SchemaDefinition {
  topNode?: string; // Default: 'doc'
  nodes: Record<string, NodeTypeDefinition>;
  marks?: Record<string, MarkDefinition>;
}

// Partial definition for schema extension
export type SchemaExtensions = Partial<SchemaDefinition>;

// Node type definition
export interface NodeTypeDefinition {
  name: string;
  /**
   * document | block | inline are the flow domain; 'scene' is the canvas domain
   * (positioned art); 'surface' is the page/slide/board that holds either.
   * Group membership is what keeps the domains apart in a single flat schema —
   * see office-schema.ts and docs/specs/standard-schema.md §9.1.
   *
   * A product may name a group of its own. Word's equations are a domain in the
   * same sense as the canvas: `math` is what may sit inside an equation and
   * `mathSlot` is the named hole a construct offers, and neither belongs in the
   * flow — a fraction is not a thing that can appear in a sentence, only inside
   * an equation. The named ones stay listed because they are what the shared
   * schema itself uses, and a typo in one of those should not compile.
   */
  group?:
    | 'block'
    | 'inline'
    | 'document'
    | 'scene'
    | 'surface'
    | 'meta'
    | 'resource'
    | (string & {});
  content?: string;
  attrs?: Record<string, AttributeDefinition>;
  marks?: string[];
  inline?: boolean;
  /**
   * Selectable: Whether node can be selected by clicking
   * - true: Selectable (default, except document)
   * - false: Not selectable
   * - undefined: Default value (true, except document)
   * 
   * Selectable Node:
   * - Block nodes: paragraph, heading, table, etc. (selectable by default)
   * - Inline nodes: inline-image, inline-link, etc. (selectable by default)
   * - Editable nodes: text nodes, editable blocks, etc. (selectable by default)
   * - Document nodes: Not selectable (always false)
   */
  selectable?: boolean;
  draggable?: boolean;
  /**
   * Droppable: Whether node can receive other nodes (drop target)
   * - true: Droppable (default, true if content exists)
   * - false: Not droppable
   * - undefined: Default value (true if content exists, false otherwise)
   * 
   * Droppable Node:
   * - Nodes with content defined: document, paragraph, heading, etc. (droppable by default)
   * - Nodes without content: atom nodes, text nodes, etc. (not droppable by default)
   * - If droppable: false is specified, not droppable
   * 
   * Note: droppable means whether it can be a "drop target",
   * which nodes can actually be received is determined by content definition
   */
  droppable?: boolean;
  atom?: boolean;
  code?: boolean;
  whitespace?: 'pre' | 'normal';
  defining?: boolean;
  isolating?: boolean;
  /**
   * Editable: block node but internal text editing is possible
   * Examples: codeBlock, mathBlock, etc.
   * - true: block node but cursor navigation and internal text editing possible
   * - false or undefined: regular block node (not editable)
   */
  editable?: boolean;
  /**
   * Indentable: Whether node is a direct target of indentation/outdentation
   *
   * - true:
   *   - Can be target of indent / outdent commands.
   *   - Considered during hierarchy movement (operation) at DataStore / Model level.
   * - false or undefined:
   *   - Structure is not changed by indent / outdent commands.
   *
   * Default strategy:
   * - paragraph, heading, listItem, etc.: indentable: true
   * - codeBlock, table, atom block, etc.: indentable: false (or undefined)
   *
   * **No schema in this repository sets it**, and that is a fact about the
   * products here rather than about the capability: Word nests a list by giving
   * a paragraph a numbering *level*, not by putting one node inside another, so
   * `apps/word` indents through `numLevel` and `indentLeft` and never through
   * this. An outliner would want the opposite, which is why it stays.
   *
   * It has been dead in a way worth knowing about. `indentNode` reported
   * success at doing nothing whenever a node was not indentable — which reads
   * as "done, nothing to undo" — so the roster exempted it from the undo check
   * for declaring no inverse, and the check stayed off for the case where it
   * does one. Both are fixed, and the roster's own schema opts in so the
   * operations are exercised for real; but a capability nothing ships is a
   * capability to check before trusting.
   */
  indentable?: boolean;

  /**
   * Indent group: Hint to restrict indent/outdent targets to nodes within the same group
   *
   * Examples:
   * - paragraph: indentGroup: 'block'
   * - heading:   indentGroup: 'block'
   * - listItem:  indentGroup: 'listItem'
   *
   * Usage example:
   * - During indent, only allow moving as child of previous sibling
   *   when "current node" and "previous sibling node" have the same indentGroup.
   */
  indentGroup?: string;

  /**
   * Restriction on node types that can become parent during indent
   *
   * - List of node types (stype) that can become actual parent when this node is indented
   * - Examples:
   *   - listItem: indentParentTypes: ['bulletList', 'orderedList', 'listItem']
   *   - paragraph: indentParentTypes: ['paragraph', 'blockquote']
   *
   * When performing indent operation at DataStore / Model level,
   * structural change can be prevented if candidate parent's stype is not included in this array.
   */
  indentParentTypes?: string[];

  /**
   * Maximum indentation (level) limit
   *
   * - Hint to disallow further indent when current node's depth reaches maxIndentLevel
   * - Actual "current indent level" calculation is handled by DataStore / Model.
   * - Examples:
   *   - paragraph: maxIndentLevel: 3
   *   - listItem:  maxIndentLevel: 5
   */
  maxIndentLevel?: number;
  /**
   * Drop Behavior Rules: 소스 노드 타입별 기본 드롭 행위 (힌트)
   * 
   * 이 규칙은 "기본값"으로 사용되며, defineDropBehavior로 오버라이드 가능
   * 
   * 구조:
   * - 키: 소스 노드 타입 (stype) 또는 와일드카드 ('*')
   * - 값: 드롭 행위 ('move' | 'copy' | 'merge' | 'transform' | 'wrap' | 'replace' | 'insert')
   * 
   * 우선순위:
   * 1. 소스 타입 (stype) 정확히 일치
   * 2. 와일드카드 ('*')
   * 
   * 사용 시나리오:
   * - 스키마 정의 시 "이 노드 타입은 이런 기본 동작을 가진다"는 힌트 제공
   * - 스키마 재사용 시 기본 동작 보장
   * - 특정 에디터 인스턴스에서 다른 규칙이 필요하면 defineDropBehavior로 오버라이드
   * 
   * 예시:
   * dropBehaviorRules: {
   *   'inline-text': 'merge',      // Merge when inline-text is dropped
   *   'inline-image': 'copy',      // Copy when inline-image is dropped
   *   '*': 'move'                  // Default: move
   * }
   * 
   * Notes:
   * - This rule has lower priority than defineDropBehavior
   * - Schema focuses on data model definition, default rules are just hints
   * - See drop-behavior-architecture.md for detailed architecture discussion
   */
  dropBehaviorRules?: Record<string, 'move' | 'copy' | 'merge' | 'transform' | 'wrap' | 'replace' | 'insert'>;
}

// Mark definition
export interface MarkDefinition {
  name: string;
  attrs?: Record<string, AttributeDefinition>;
  excludes?: string[]; // Other marks that cannot be used together
  group?: string; // Mark group
  inclusive?: boolean; // Default: true
  /**
   * That a character can carry only one of these, so applying replaces.
   *
   * A colour, a highlight, a size, a family: each is a single value the reader
   * chose, and a run that carried two of them would be a document nobody can
   * draw — which of them won would be whatever the renderer nested last. It was
   * exactly that: applying a mark appended it, so text that was red and was then
   * made green kept the red, in every product, by every route.
   *
   * Off by default, because the marks that legitimately stack are the ones where
   * getting this wrong destroys something: two comments overlap on the same
   * sentence, and so do an insertion and a colour. Only marks that are one value
   * say so.
   *
   * Not `excludes`, which is about *other* marks and is checked by
   * `validateMarks`: a mark listed as excluding itself would make a text node
   * with a red word and a blue word invalid.
   */
  single?: boolean;
}

// Mark instance
export interface Mark {
  type: string;
  attrs?: Record<string, any>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  errorCodes?: string[];
}

// Validation error codes
export const VALIDATION_ERRORS = {
  // Node structure errors
  NODE_REQUIRED: 'NODE_REQUIRED',
  NODE_ID_REQUIRED: 'NODE_ID_REQUIRED',
  NODE_TYPE_REQUIRED: 'NODE_TYPE_REQUIRED',
  TEXT_CONTENT_REQUIRED: 'TEXT_CONTENT_REQUIRED',
  
  // Document structure errors
  DOCUMENT_REQUIRED: 'DOCUMENT_REQUIRED',
  DOCUMENT_ID_REQUIRED: 'DOCUMENT_ID_REQUIRED',
  DOCUMENT_SCHEMA_REQUIRED: 'DOCUMENT_SCHEMA_REQUIRED',
  DOCUMENT_CONTENT_REQUIRED: 'DOCUMENT_CONTENT_REQUIRED',
  
  // Schema validation errors
  NODE_TYPE_UNKNOWN: 'NODE_TYPE_UNKNOWN',
  CONTENT_REQUIRED_BUT_EMPTY: 'CONTENT_REQUIRED_BUT_EMPTY',
  ATTRIBUTE_INVALID: 'ATTRIBUTE_INVALID',
  ATTRIBUTE_REQUIRED: 'ATTRIBUTE_REQUIRED',
  ATTRIBUTE_TYPE_MISMATCH: 'ATTRIBUTE_TYPE_MISMATCH',
  
  // Schema instance errors
  INVALID_SCHEMA_INSTANCE: 'INVALID_SCHEMA_INSTANCE'
} as const;

export type ValidationErrorCode = typeof VALIDATION_ERRORS[keyof typeof VALIDATION_ERRORS];

export type TNodeType = string;
