import { describe, expect, it } from 'vitest';
import { createSchema, validateTree } from '@barocss/schema';
import { isNotePageId, noteFileText, readNoteFile, type NoteDocument } from '../src/note-file';
import { getNoteSchemaDefinition } from '../src/note-schema';
const document = (pageId?: string): NoteDocument => ({ stype: 'note', attributes: { title: '출시 계획', ...(pageId === undefined ? {} : { pageId }) }, content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '함께 만드는 문서' }] }] });
const raw = (pageId: unknown) => JSON.stringify({ format: 'barocss-note', version: 1, document: { ...document(), attributes: { title: '출시 계획', pageId } } });

describe('portable Note page identity', () => {
  it.each(['7bd9d8a9-aabc-49ac-80b2-50d9d8c2b6ba', 'page:workspace_2.rev-1', 'a'.repeat(128)])('preserves a valid durable page ID through export and import: %s', pageId => {
    const before = document(pageId);
    const exported = noteFileText(before);
    expect(JSON.parse(exported).document.attributes.pageId).toBe(pageId);
    expect(readNoteFile(exported)).toEqual({ document: before });
    expect(isNotePageId(pageId)).toBe(true);
    expect(validateTree(createSchema('page-id', getNoteSchemaDefinition()), before)).toEqual([]);
  });
  it('keeps legacy files without identity unchanged instead of minting unstable IDs', () => {
    const before = document();
    const loaded = readNoteFile(noteFileText(before));
    expect(loaded).toEqual({ document: before });
    if ('document' in loaded) expect(Object.hasOwn(loaded.document.attributes, 'pageId')).toBe(false);
  });
  it.each(['', ' ', ' a', 'a b', '../page', 'page/id', 'https://example.com', '#target', 'a?b', 'a\n', 'a'.repeat(129), '__proto__', 'constructor', 'prototype', '<script>', null, 12, {}, ['page']])('rejects explicitly invalid identity without returning a modified document: %j', pageId => {
    expect(isNotePageId(pageId)).toBe(false);
    expect(readNoteFile(raw(pageId))).toEqual({ error: '이 파일의 페이지 ID가 올바르지 않습니다.' });
    expect(() => noteFileText({ ...document(), attributes: { title: '출시 계획', pageId } } as NoteDocument)).toThrow('페이지 ID');
  });
  it('strips temporary node identity while keeping the durable document identity', () => {
    const before = { ...document('page-one'), sid: 'session:root', content: [{ stype: 'paragraph', sid: 'session:p', parentId: 'session:root', content: [{ stype: 'inline-text', sid: 'session:text', text: '안녕' }] }] };
    const exported = noteFileText(before);
    expect(exported).not.toContain('session:');
    expect(JSON.parse(exported).document.attributes.pageId).toBe('page-one');
  });
});
