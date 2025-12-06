/**
 * Default Context Key definitions
 * 
 * Defines types and initial values for default context keys that Editor automatically manages.
 * These values are automatically set when Editor is created and already exist before Extension initialization.
 * 
 * Designed with reference to VS Code's when clause contexts.
 * Reference: https://code.visualstudio.com/api/references/when-clause-contexts
 */

/**
 * Default Context Key type definition
 */
export interface DefaultContext {
  // Editor state
  editorFocus: boolean;
  editorEditable: boolean;
  // Platform state
  isMac: boolean;
  isLinux: boolean;
  isWindows: boolean;
  
  // Selection state
  selectionEmpty: boolean;
  selectionType: 'range' | 'node' | 'multi-node' | 'cell' | 'table' | null;
  selectionDirection: 'forward' | 'backward' | null;
  canIndent: boolean;  // Whether the selected node is indentable (structural indentation)
  canIndentText: boolean;  // Whether the selected range can be text-indented
  
  // History state
  historyCanUndo: boolean;
  historyCanRedo: boolean;
}

/**
 * Default Context Key initial values
 * 
 * These values are used for initialization when Editor is created.
 * Since they are already set before Extension's onCreate is executed,
 * Extensions can assume these values always exist.
 */
export const DEFAULT_CONTEXT_INITIAL_VALUES: DefaultContext = {
  // Editor state
  editorFocus: false,
  editorEditable: true,
  // Platform state (overwritten at runtime with IS_MAC/IS_LINUX/IS_WINDOWS)
  isMac: false,
  isLinux: false,
  isWindows: false,
  
  // Selection state
  selectionEmpty: true,
  selectionType: null,
  selectionDirection: null,
  canIndent: false,
  canIndentText: false,
  
  // History state
  historyCanUndo: false,
  historyCanRedo: false
};

/**
 * Default Context Key list (for documentation)
 * 
 * This list specifies the default context keys available for Extension developers.
 */
export const DEFAULT_CONTEXT_KEYS = {
  // Editor state
  EDITOR_FOCUS: 'editorFocus',
  EDITOR_EDITABLE: 'editorEditable',
  // Platform state
  IS_MAC: 'isMac',
  IS_LINUX: 'isLinux',
  IS_WINDOWS: 'isWindows',
  
  // Selection state
  SELECTION_EMPTY: 'selectionEmpty',
  SELECTION_TYPE: 'selectionType',
  SELECTION_DIRECTION: 'selectionDirection',
  CAN_INDENT: 'canIndent',
  CAN_INDENT_TEXT: 'canIndentText',
  
  // History state
  HISTORY_CAN_UNDO: 'historyCanUndo',
  HISTORY_CAN_REDO: 'historyCanRedo'
} as const;

/**
 * Default Context Key descriptions (for documentation)
 */
export const DEFAULT_CONTEXT_DESCRIPTIONS: Record<keyof DefaultContext, string> = {
  editorFocus: 'Whether the Editor has focus',
  editorEditable: 'Whether the Editor is in an editable state',
  isMac: 'Whether the current runtime environment is macOS',
  isLinux: 'Whether the current runtime environment is Linux',
  isWindows: 'Whether the current runtime environment is Windows',
  selectionEmpty: 'Whether the Selection is empty (collapsed)',
  selectionType: 'Selection type (range, node, multi-node, cell, table, null)',
  selectionDirection: 'Selection direction (forward, backward, null)',
  canIndent: 'Whether the selected node is indentable (based on schema indentable property, structural indentation)',
  canIndentText: 'Whether the selected range can be text-indented (when range selection and text node)',
  historyCanUndo: 'Whether Undo is possible',
  historyCanRedo: 'Whether Redo is possible'
};

