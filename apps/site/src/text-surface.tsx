import type { Editor } from '@barocss/editor-core';
import type { Control } from '@barocss/office-controls';
import { ContextToolbar } from '@barocss/office-editor-ui';

/** Site chooses the actions; the shared toolbar owns selection, focus and appearance. */
const TEXT_CONTROLS: readonly Control[] = [
  { command: 'toggleBold', icon: 'bold', label: '굵게', mark: 'bold' },
  { command: 'toggleItalic', icon: 'italic', label: '기울임', mark: 'italic' }
];

export function TextSurface({ editor, mode }: {
  editor: Editor;
  /** In select mode the inspector owns the selected blocks. */
  mode: 'select' | 'text';
}) {
  return <ContextToolbar editor={editor} controls={TEXT_CONTROLS} active={mode === 'text'} />;
}
