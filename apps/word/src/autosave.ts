import type { Editor } from '@barocss/editor-core';
import type { WordRuntime } from './runtime';
import { deriveBusinessPair, readBusinessPair } from '../../../packages/office-word/src/business-pair';
import { documentLibrary, DocumentSession, type DocumentSessionStatusCode } from '@barocss/shared';
import { readWordFile, wordFileText, wordTitle } from '@barocss/office-word';

export const wordStore = documentLibrary({ db: 'barocss-word', store: 'documents' });
export const wordDrafts = documentLibrary({ db: 'barocss-word-recovery', store: 'drafts' });
export class WordAutosave extends DocumentSession {
  constructor(editor: Editor, notify: (status: DocumentSessionStatusCode) => void, native?: Pick<WordRuntime, 'exportNativeDocument' | 'loadNativeDocument'>) {
    // Only a local "new document" recovery derives identity. Server pending
    // records and retries use their separate unchanged frozen-byte store.
    const recoveryDrafts = { ...wordDrafts, async read(name: string) {
      const snapshot = await wordDrafts.read(name);
      if (!snapshot) return snapshot;
      const parsed = readWordFile(snapshot.text);
      if ('error' in parsed || readBusinessPair(parsed.document).status === 'absent') return snapshot;
      return { ...snapshot, text: wordFileText(deriveBusinessPair(parsed.document), '') };
    } };
    super({
      key: 'word', documents: wordStore, drafts: recoveryDrafts,
      snapshot: () => ({ text: wordFileText(native ? native.exportNativeDocument() : editor.exportDocument(), ''), title: wordTitle(editor.dataStore) || '제목 없는 문서', count: 1 }),
      replace: text => {
        const parsed = readWordFile(text);
        if ('error' in parsed) throw new Error(parsed.error);
        if (native) native.loadNativeDocument(parsed.document);
        else editor.loadDocument(parsed.document, 'word');
      },
      subscribe: changed => {
        const listener = (event?: { rootId?: string }) => changed(!!event?.rootId);
        editor.on('editor:content.change', listener);
        return () => { editor.off('editor:content.change', listener); };
      }
    }, notify);
  }
}
