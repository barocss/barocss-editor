import type { Editor, ModelSelection } from '@barocss/editor-core';

/** UI payload requirements belong beside the command, so menus and ribbon agree. */
export const WORD_AUTHORING_ACTIONS = {
  link: { label: '링크 편집', icon: 'type-url', command: 'toggleLink', probe: { href: 'https://example.com' } },
  image: { label: '그림 삽입', icon: 'insert-image', command: 'insertImage', probe: { src: 'image' } },
  footnote: { label: '각주 삽입', icon: 'note-footnote', command: 'insertFootnote', probe: { id: 'probe' } },
  endnote: { label: '미주 삽입', icon: 'note-endnote', command: 'insertEndnote', probe: { id: 'probe' } },
  comment: { label: '새 댓글', icon: 'comment-new', command: 'insertComment', probe: {} }
} as const;
export type WordAuthoringKind = keyof typeof WORD_AUTHORING_ACTIONS;
export interface WordAuthoringSession { kind: WordAuthoringKind; selection: ModelSelection; rootId: string; }
export function authoringKind(view: string): WordAuthoringKind | undefined {
  const kind = view.replace(/^authoring\./, '');
  return view.startsWith('authoring.') && Object.hasOwn(WORD_AUTHORING_ACTIONS, kind) ? kind as WordAuthoringKind : undefined;
}
export function canAuthor(editor: Editor, kind: WordAuthoringKind): boolean {
  const action = WORD_AUTHORING_ACTIONS[kind];
  const selection = editor.selection;
  if (!selection || selection.type !== 'range') return false;
  if (kind !== 'image' && selection.startNodeId === selection.endNodeId && selection.startOffset === selection.endOffset) return false;
  return editor.canRun(action.command, action.probe);
}
export function captureAuthoring(editor: Editor, kind: WordAuthoringKind): WordAuthoringSession | undefined {
  const rootId = editor.getRootId();
  return rootId && editor.selection && canAuthor(editor, kind)
    ? { kind, rootId, selection: structuredClone(editor.selection) } : undefined;
}
