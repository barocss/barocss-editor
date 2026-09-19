import type { Editor } from '@barocss/editor-core';
import { documentLibrary, DocumentSession, type DocumentSessionStatus } from '@barocss/shared';
import { deckFileText, deckTitle, readDeckFile } from './deck-file';
import { deckSlides } from './deck';
import { documentTitle } from '@barocss/office-text';

export const slideDocuments = documentLibrary({ db: 'barocss-slides-workspace', store: 'documents' });
export const slideDrafts = documentLibrary({ db: 'barocss-slides-recovery', store: 'drafts' });
export type SlideSaveStatus = DocumentSessionStatus;

/** Slides supplies its codec and metadata; lifecycle and conditional writes are shared. */
export class DeckAutosave extends DocumentSession {
  constructor(editor: Editor, notify: (status: SlideSaveStatus) => void) {
    super({
      key: 'slides', documents: slideDocuments, drafts: slideDrafts,
      snapshot: () => {
        const doc = { rootId: editor.getRootId()!, getNode: (sid: string) => editor.dataStore.getNode(sid) };
        return { text: deckFileText(editor.exportDocument(), ''), title: documentTitle(doc) || deckTitle(doc) || '제목 없는 발표 자료', count: deckSlides(doc).length };
      },
      replace: text => {
        const parsed = readDeckFile(text);
        if ('error' in parsed) throw new Error(parsed.error);
        editor.loadDocument(parsed.document, 'slides');
      },
      subscribe: changed => {
        const listener = (event?: { rootId?: string }) => changed(!!event?.rootId);
        editor.on('editor:content.change', listener);
        return () => { editor.off('editor:content.change', listener); };
      }
    }, notify);
  }
}
