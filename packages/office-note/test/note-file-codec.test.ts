import { describe, expect, it } from 'vitest';
import { NOTE_FILE_FORMAT, NOTE_FILE_VERSION, copyNoteSnapshotFile, readNoteFile, readNoteSnapshotFile, serializeNoteFile, type NoteDocument } from '../src/note-file-codec';
import { noteFileText } from '../src/note-file';

const document = (): NoteDocument => ({
  stype: 'note',
  attributes: { title: '계획', pageId: 'original' },
  content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '본문' }] }]
});

describe('Note snapshot file codec', () => {
  it('produces identical bytes without a clock and preserves savedAt absence', () => {
    const before = document();
    const first = serializeNoteFile(before);
    expect(serializeNoteFile(before)).toBe(first);
    expect(JSON.parse(first)).toMatchObject({ format: NOTE_FILE_FORMAT, version: NOTE_FILE_VERSION });
    expect(Object.hasOwn(JSON.parse(first), 'savedAt')).toBe(false);
    expect(readNoteSnapshotFile(first)).toEqual({ document: before });
  });

  it('preserves an explicit savedAt string and strips session IDs', () => {
    const before = { ...document(), sid: 'session:root' };
    const savedAt = '2026-09-23T10:00:00+09:00';
    const text = serializeNoteFile(before, { savedAt });
    expect(text).not.toContain('session:root');
    expect(JSON.parse(text).savedAt).toBe(savedAt);
    expect(readNoteSnapshotFile(text)).toEqual({ document: document(), savedAt });
    expect(serializeNoteFile(document(), { savedAt })).toBe(text);
  });

  it('rejects invalid savedAt for server migration while the local reader remains compatible', () => {
    const base = JSON.parse(serializeNoteFile(document()));
    for (const savedAt of ['', 0, null, false, {}]) {
      const text = JSON.stringify({ ...base, savedAt });
      expect(readNoteFile(text)).toEqual({ document: document() });
      expect(readNoteSnapshotFile(text)).toEqual({ error: '이 파일의 저장 시각이 올바르지 않습니다.' });
      expect(() => serializeNoteFile(document(), { savedAt } as { savedAt: string })).toThrow('저장 시각');
    }
  });

  it('keeps the existing download writer timestamped', () => {
    expect(typeof JSON.parse(noteFileText(document())).savedAt).toBe('string');
  });

  it('copies a page with a new ID and remaps only its own references, including resources', () => {
    const ref = (pageId: string) => ({ stype: 'pageReference', attributes: { pageId, title: pageId } });
    const before: NoteDocument = { ...document(), content: [
      { stype: 'paragraph', content: [ref('original'), ref('external')] },
      { stype: 'resources', content: [
        { stype: 'richText', attributes: { id: 'body' }, content: [{ stype: 'paragraph', content: [ref('original')] }] }
      ] }
    ] };
    const sourceText = serializeNoteFile(before, { savedAt: '2026-09-23T01:00:00Z' });
    const result = copyNoteSnapshotFile(sourceText, 'copy-1');
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result).toMatchObject({ pageId: 'copy-1' });
    expect(copyNoteSnapshotFile(sourceText, 'copy-1')).toEqual(result);
    const stored = JSON.parse(result.snapshotText);
    expect(stored.savedAt).toBe('2026-09-23T01:00:00Z');
    expect(stored.document.attributes.pageId).toBe('copy-1');
    expect(stored.document.content[0].content.map((node: { attributes: { pageId: string } }) => node.attributes.pageId)).toEqual(['copy-1', 'external']);
    expect(stored.document.content[1].content[0].content[0].content[0].attributes.pageId).toBe('copy-1');
    expect(readNoteFile(result.snapshotText)).toHaveProperty('document');
    expect(JSON.parse(sourceText).document.attributes.pageId).toBe('original');
  });

  it('assigns a new ID to legacy files and leaves invalid migration inputs untouched', () => {
    const legacy = { ...document(), attributes: { title: '계획' } };
    const copied = copyNoteSnapshotFile(serializeNoteFile(legacy), 'copy-2');
    expect(copied).toMatchObject({ pageId: 'copy-2' });
    if ('error' in copied) return;
    expect(Object.hasOwn(JSON.parse(copied.snapshotText), 'savedAt')).toBe(false);
    expect(JSON.parse(copied.snapshotText).document.attributes.pageId).toBe('copy-2');

    const malformed = JSON.stringify({ ...JSON.parse(serializeNoteFile(document())), savedAt: '' });
    expect(copyNoteSnapshotFile(malformed, 'copy-3')).toHaveProperty('error');
    expect(() => copyNoteSnapshotFile(serializeNoteFile(document()), 'original')).toThrow('달라야');
    expect(() => copyNoteSnapshotFile(serializeNoteFile(document()), '../invalid')).toThrow('페이지 ID');
  });
});
