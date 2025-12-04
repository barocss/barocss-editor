import type { Keybinding } from '../keybinding';

/**
 * 에디터 코어 기본 keyboard shortcut 목록
 * 
 * 이 목록은 에디터의 기본 동작을 정의하며,
 * 사용자가 user 레벨에서 override할 수 있습니다.
 */
export const DEFAULT_KEYBINDINGS: Keybinding[] = [
  // 기본 편집
  {
    key: 'Enter',
    command: 'insertParagraph',
    when: 'editorFocus && editorEditable'
    // source는 _registerDefaultKeybindings()에서 setCurrentSource('core')로 자동 설정됨
  },
  {
    key: 'Backspace',
    command: 'backspace',
    when: 'editorFocus && editorEditable'
  },
  {
    key: 'Delete',
    command: 'deleteForward',
    when: 'editorFocus && editorEditable'
  },
  
  // 커서 이동
  {
    key: 'ArrowLeft',
    command: 'moveCursorLeft',
    when: 'editorFocus'
  },
  {
    key: 'ArrowRight',
    command: 'moveCursorRight',
    when: 'editorFocus'
  },
  {
    key: 'Shift+ArrowLeft',
    command: 'extendSelectionLeft',
    when: 'editorFocus',
    args: {}
  },
  {
    key: 'Shift+ArrowRight',
    command: 'extendSelectionRight',
    when: 'editorFocus',
    args: {}
  },
  // 단어 단위 커서 이동 (OS별)
  // macOS: Alt+ArrowLeft/Right, 그 외(Ctrl+ArrowLeft/Right)
  {
    key: 'Alt+ArrowLeft',
    command: 'moveCursorWordLeft',
    when: 'editorFocus && isMac'
  },
  {
    key: 'Alt+ArrowRight',
    command: 'moveCursorWordRight',
    when: 'editorFocus && isMac'
  },
  {
    key: 'Ctrl+ArrowLeft',
    command: 'moveCursorWordLeft',
    when: 'editorFocus && !isMac'
  },
  {
    key: 'Ctrl+ArrowRight',
    command: 'moveCursorWordRight',
    when: 'editorFocus && !isMac'
  },
  // 단어 단위 범위 확장 (OS별)
  {
    key: 'Alt+Shift+ArrowLeft',
    command: 'extendSelectionWordLeft',
    when: 'editorFocus && isMac'
  },
  {
    key: 'Alt+Shift+ArrowRight',
    command: 'extendSelectionWordRight',
    when: 'editorFocus && isMac'
  },
  {
    key: 'Ctrl+Shift+ArrowLeft',
    command: 'extendSelectionWordLeft',
    when: 'editorFocus && !isMac'
  },
  {
    key: 'Ctrl+Shift+ArrowRight',
    command: 'extendSelectionWordRight',
    when: 'editorFocus && !isMac'
  },
  
  // 전체 선택
  {
    key: 'Mod+a',
    command: 'selectAll',
    when: 'editorFocus'
  },
  // 복사/붙여넣기/잘라내기 (CopyPasteExtension 연동)
  {
    key: 'Mod+c',
    command: 'copy',
    when: 'editorFocus && editorEditable && !selectionEmpty'
  },
  {
    key: 'Mod+v',
    command: 'paste',
    when: 'editorFocus && editorEditable'
  },
  {
    key: 'Mod+x',
    command: 'cut',
    when: 'editorFocus && editorEditable && !selectionEmpty'
  },
  
  // 들여쓰기/내어쓰기
  // 텍스트 들여쓰기 (코드 블록 등 텍스트 노드에서 사용)
  {
    key: 'Tab',
    command: 'indentText',
    when: 'editorFocus && editorEditable && canIndentText'
  },
  {
    key: 'Shift+Tab',
    command: 'outdentText',
    when: 'editorFocus && editorEditable && canIndentText'
  },
  // 구조적 들여쓰기 (블록 노드 구조 변경)
  {
    key: 'Tab',
    command: 'indentNode',
    when: 'editorFocus && editorEditable && canIndent'
  },
  {
    key: 'Shift+Tab',
    command: 'outdentNode',
    when: 'editorFocus && editorEditable && canIndent'
  },
  
  // 히스토리
  {
    key: 'Mod+z',
    command: 'historyUndo',
    when: 'editorFocus && historyCanUndo'
  },
  {
    key: 'Mod+Shift+z',
    command: 'historyRedo',
    when: 'editorFocus && historyCanRedo'
  },
  {
    key: 'Mod+y',
    command: 'historyRedo',
    when: 'editorFocus && historyCanRedo'
  }
];

