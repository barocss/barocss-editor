/**
 * 기본 Context Key 정의
 * 
 * Editor가 자동으로 관리하는 기본 context key들의 타입과 초기값을 정의합니다.
 * 이 값들은 Editor 생성 시 자동으로 설정되며, Extension 초기화 전에 이미 존재합니다.
 * 
 * VS Code의 when clause contexts를 참고하여 설계되었습니다.
 * 참고: https://code.visualstudio.com/api/references/when-clause-contexts
 */

/**
 * 기본 Context Key 타입 정의
 */
export interface DefaultContext {
  // 에디터 상태
  editorFocus: boolean;
  editorEditable: boolean;
  // 플랫폼 상태
  isMac: boolean;
  isLinux: boolean;
  isWindows: boolean;
  
  // 선택 상태
  selectionEmpty: boolean;
  selectionType: 'range' | 'node' | 'multi-node' | 'cell' | 'table' | null;
  selectionDirection: 'forward' | 'backward' | null;
  canIndent: boolean;  // 선택된 노드가 indentable한지 여부 (구조적 들여쓰기)
  canIndentText: boolean;  // 선택된 범위가 텍스트 들여쓰기 가능한지 여부
  
  // 히스토리 상태
  historyCanUndo: boolean;
  historyCanRedo: boolean;
}

/**
 * 기본 Context Key 초기값
 * 
 * Editor 생성 시 이 값들로 초기화됩니다.
 * Extension의 onCreate가 실행되기 전에 이미 설정되어 있으므로,
 * Extension은 이 값들이 항상 존재한다고 가정할 수 있습니다.
 */
export const DEFAULT_CONTEXT_INITIAL_VALUES: DefaultContext = {
  // 에디터 상태
  editorFocus: false,
  editorEditable: true,
  // 플랫폼 상태 (런타임에서 IS_MAC/IS_LINUX/IS_WINDOWS로 덮어쓴다)
  isMac: false,
  isLinux: false,
  isWindows: false,
  
  // 선택 상태
  selectionEmpty: true,
  selectionType: null,
  selectionDirection: null,
  canIndent: false,
  canIndentText: false,
  
  // 히스토리 상태
  historyCanUndo: false,
  historyCanRedo: false
};

/**
 * 기본 Context Key 목록 (문서화용)
 * 
 * 이 목록은 Extension 개발자가 사용할 수 있는 기본 context key를 명시합니다.
 */
export const DEFAULT_CONTEXT_KEYS = {
  // 에디터 상태
  EDITOR_FOCUS: 'editorFocus',
  EDITOR_EDITABLE: 'editorEditable',
  // 플랫폼 상태
  IS_MAC: 'isMac',
  IS_LINUX: 'isLinux',
  IS_WINDOWS: 'isWindows',
  
  // 선택 상태
  SELECTION_EMPTY: 'selectionEmpty',
  SELECTION_TYPE: 'selectionType',
  SELECTION_DIRECTION: 'selectionDirection',
  CAN_INDENT: 'canIndent',
  CAN_INDENT_TEXT: 'canIndentText',
  
  // 히스토리 상태
  HISTORY_CAN_UNDO: 'historyCanUndo',
  HISTORY_CAN_REDO: 'historyCanRedo'
} as const;

/**
 * 기본 Context Key 설명 (문서화용)
 */
export const DEFAULT_CONTEXT_DESCRIPTIONS: Record<keyof DefaultContext, string> = {
  editorFocus: 'Editor가 포커스를 가지고 있는지 여부',
  editorEditable: 'Editor가 편집 가능한 상태인지 여부',
  isMac: '현재 실행 환경이 macOS 인지 여부',
  isLinux: '현재 실행 환경이 Linux 인지 여부',
  isWindows: '현재 실행 환경이 Windows 인지 여부',
  selectionEmpty: 'Selection이 비어있는지 여부 (collapsed)',
  selectionType: 'Selection 타입 (range, node, multi-node, cell, table, null)',
  selectionDirection: 'Selection 방향 (forward, backward, null)',
  canIndent: '선택된 노드가 indentable한지 여부 (schema의 indentable 속성 기반, 구조적 들여쓰기)',
  canIndentText: '선택된 범위가 텍스트 들여쓰기 가능한지 여부 (range selection이고 텍스트 노드인 경우)',
  historyCanUndo: 'Undo가 가능한지 여부',
  historyCanRedo: 'Redo가 가능한지 여부'
};

