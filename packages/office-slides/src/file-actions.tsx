import type { Ref } from 'react';
import type { Editor } from '@barocss/editor-core';
import { FileActions as DocumentFiles, type DocumentFileActions, type DocumentFileKind } from '@barocss/office-editor-ui';
import { deckFileName, deckFileText, deckTitle, readDeckFile } from './deck-file';
import { createStarterDeck } from './starter-deck';

// Preserve the Slides public API while sharing file execution and feedback.
export type DeckFileActions = DocumentFileActions;
export interface FileActionsProps {
  editor: Editor | null;
  onOpened?: () => void;
  beforeReplace?: () => Promise<boolean>;
  ref?: Ref<DeckFileActions>;
}

const deckKind: DocumentFileKind = {
  session: 'slides',
  text: deckFileText,
  read: readDeckFile,
  fileName: editor => {
    const rootId = editor.getRootId();
    const title = rootId ? deckTitle({ rootId, getNode: sid => editor.dataStore.getNode(sid) }) : undefined;
    return deckFileName(title);
  },
  starter: createStarterDeck,
  accept: '.json,application/json',
  ariaLabel: '슬라이드 파일',
  prefix: 'sl',
};

export function FileActions({ editor, onOpened, beforeReplace, ref }: FileActionsProps) {
  return <DocumentFiles ref={ref} editor={editor} kind={deckKind} onOpened={onOpened} beforeReplace={beforeReplace}
    // Slides confirms before its persistence hook, including in a hosted workspace.
    confirmReplace={() => !editor?.canUndo() || window.confirm('저장하지 않은 변경이 사라집니다. 계속할까요?')} />;
}
