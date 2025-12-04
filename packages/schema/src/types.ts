export interface AttributeDefinition {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'custom';
  default?: any;
  required?: boolean | ((attrs: Record<string, any>) => boolean);
  validator?: (value: any, attrs?: Record<string, any>) => boolean;
  transform?: (value: any) => any;
  customType?: string;
  // Object schema for detailed object validation
  objectSchema?: Record<string, AttributeDefinition>;
}

// 통합 스키마 정의
export interface SchemaDefinition {
  topNode?: string; // 기본값: 'doc'
  nodes: Record<string, NodeTypeDefinition>;
  marks?: Record<string, MarkDefinition>;
}

// 스키마 확장을 위한 부분 정의
export type SchemaExtensions = Partial<SchemaDefinition>;

// 노드 타입 정의
export interface NodeTypeDefinition {
  name: string;
  group?: 'block' | 'inline' | 'document';
  content?: string;
  attrs?: Record<string, AttributeDefinition>;
  marks?: string[];
  inline?: boolean;
  /**
   * Selectable: 노드가 클릭으로 선택 가능한지 여부
   * - true: 선택 가능 (기본값, document 제외)
   * - false: 선택 불가능
   * - undefined: 기본값 (true, document 제외)
   * 
   * Selectable Node:
   * - Block 노드: paragraph, heading, table 등 (기본적으로 선택 가능)
   * - Inline 노드: inline-image, inline-link 등 (기본적으로 선택 가능)
   * - Editable Node: 텍스트 노드, editable block 등 (기본적으로 선택 가능)
   * - Document 노드: 선택 불가능 (항상 false)
   */
  selectable?: boolean;
  draggable?: boolean;
  /**
   * Droppable: 노드가 다른 노드를 받을 수 있는지 여부 (드롭 타겟)
   * - true: 드롭 가능 (기본값, content가 있으면 true)
   * - false: 드롭 불가능
   * - undefined: 기본값 (content가 있으면 true, 없으면 false)
   * 
   * Droppable Node:
   * - content가 정의된 노드: document, paragraph, heading 등 (기본적으로 드롭 가능)
   * - content가 없는 노드: atom 노드, 텍스트 노드 등 (기본적으로 드롭 불가능)
   * - droppable: false로 명시하면 드롭 불가능
   * 
   * 주의: droppable은 "드롭 타겟"이 될 수 있는지를 의미하며,
   * 실제로 어떤 노드를 받을 수 있는지는 content 정의에 따라 결정됨
   */
  droppable?: boolean;
  atom?: boolean;
  code?: boolean;
  whitespace?: 'pre' | 'normal';
  defining?: boolean;
  isolating?: boolean;
  /**
   * Editable: block 노드이지만 내부 텍스트 편집이 가능한 경우
   * 예: codeBlock, mathBlock 등
   * - true: block 노드이지만 커서로 탐색 가능하고 내부 텍스트 편집 가능
   * - false 또는 undefined: 일반 block 노드 (편집 불가능)
   */
  editable?: boolean;
  /**
   * Indentable: 들여쓰기/내어쓰기(indentation)의 직접 대상이 되는 노드인지 여부
   *
   * - true:
   *   - indent / outdent 명령의 대상이 될 수 있다.
   *   - DataStore / Model 레벨에서 계층 이동(operation) 수행 시 고려 대상이 된다.
   * - false 또는 undefined:
   *   - indent / outdent 명령으로 구조를 변경하지 않는다.
   *
   * 기본 전략:
   * - paragraph, heading, listItem 등: indentable: true
   * - codeBlock, table, atom block 등: indentable: false (또는 undefined)
   */
  indentable?: boolean;

  /**
   * Indent 그룹: 같은 그룹 내 노드끼리만 indent/outdent 대상이 되도록 제한하기 위한 힌트
   *
   * 예시:
   * - paragraph: indentGroup: 'block'
   * - heading:   indentGroup: 'block'
   * - listItem:  indentGroup: 'listItem'
   *
   * 사용 예:
   * - indent 시 "현재 노드"와 "이전 형제 노드"의 indentGroup 이 같을 때만
   *   이전 형제의 자식으로 이동을 허용한다.
   */
  indentGroup?: string;

  /**
   * Indent 시 부모가 될 수 있는 노드 타입 제한
   *
   * - 이 노드가 들여쓰기될 때, 실제 parent 가 될 수 있는 node type(stype) 목록
   * - 예:
   *   - listItem: indentParentTypes: ['bulletList', 'orderedList', 'listItem']
   *   - paragraph: indentParentTypes: ['paragraph', 'blockquote']
   *
   * DataStore / Model 수준에서 indent operation 을 수행할 때,
   * 후보 parent 의 stype 이 이 배열에 포함되지 않으면 구조 변경을 막을 수 있다.
   */
  indentParentTypes?: string[];

  /**
   * 최대 들여쓰기(level) 제한
   *
   * - 현재 노드의 깊이가 maxIndentLevel 에 도달하면 더 이상 indent 를 허용하지 않기 위한 힌트
   * - 실제 "현재 indent level" 계산은 DataStore / Model 쪽에서 담당한다.
   * - 예:
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
   *   'inline-text': 'merge',      // inline-text를 드롭하면 병합
   *   'inline-image': 'copy',      // inline-image를 드롭하면 복사
   *   '*': 'move'                  // 기본값: 이동
   * }
   * 
   * 참고:
   * - 이 규칙은 defineDropBehavior보다 우선순위가 낮음
   * - 스키마는 데이터 모델 정의에 집중, 기본 규칙은 힌트일 뿐
   * - 자세한 아키텍처 논의는 drop-behavior-architecture.md 참고
   */
  dropBehaviorRules?: Record<string, 'move' | 'copy' | 'merge' | 'transform' | 'wrap' | 'replace' | 'insert'>;
}

// 마크 정의
export interface MarkDefinition {
  name: string;
  attrs?: Record<string, AttributeDefinition>;
  excludes?: string[]; // 함께 사용할 수 없는 다른 marks
  group?: string; // mark 그룹
  inclusive?: boolean; // 기본값: true
}

// 마크 인스턴스
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
