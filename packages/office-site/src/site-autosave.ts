import type { Editor } from '@barocss/editor-core';
import { documentLibrary, type DocumentSessionOptions } from '@barocss/shared';
import { pageCount, readSiteFile, siteFileText, siteTitle } from './site-file';

export const siteDocuments = documentLibrary({ db: 'barocss-site-workspace', store: 'documents' });
export const siteDrafts = documentLibrary({ db: 'barocss-site-recovery', store: 'drafts' });

export function siteSessionOptions(editor: Editor, beforeSnapshot: () => Promise<void>): DocumentSessionOptions {
  return {
    key: 'site', documents: siteDocuments, drafts: siteDrafts, beforeSnapshot,
    snapshot: () => ({ text: siteFileText(editor.exportDocument(), ''),
      title: siteTitle(editor.dataStore as never) || '제목 없는 사이트', count: pageCount(editor.dataStore as never) }),
    replace: text => {
      const parsed = readSiteFile(text);
      if ('error' in parsed) throw new Error(parsed.error);
      editor.loadDocument(parsed.document, 'site');
    },
    subscribe: changed => {
      const listener = (event?: { rootId?: string }) => changed(!!event?.rootId);
      editor.on('editor:content.change', listener);
      return () => { editor.off('editor:content.change', listener); };
    }
  };
}
