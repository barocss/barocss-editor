// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { openNoteTree, noteTreeOf, type NoteSession } from '@barocss/office-note';
import { serializeNoteFile, type NoteDocument } from '@barocss/office-note/file';
import { matchesConfirmedNoteNative } from './confirmed-native';

type TestNode = { stype: string; attributes: Record<string, unknown>; content: TestNode[]; text?: string; marks?: Array<{ stype: string; range: number[] }>; custom?: unknown; resources?: { retained: Array<{ stype: string; payload: { content: Array<{ custom: boolean }> } }> } };
type TestFile = { format: string; version: number; document: TestNode };

const pageId = '11111111-1111-4111-8111-111111111111';
const confirmed: NoteDocument = { stype: 'note', attributes: { title: 'Rich comparison fixture', pageId }, content: [
  { stype: 'paragraph', content: [
    { stype: 'inline-text', text: 'Rich body', marks: [{ stype: 'bold', range: [0, 4] }] },
    { stype: 'pageReference', attributes: { pageId, title: 'Same page' }, text: 'Same page' }
  ] },
  { stype: 'codeBlock', attributes: { language: 'typescript' }, content: [{ stype: 'inline-text', text: 'const value = true;' }] },
  { stype: 'bTable', content: [{ stype: 'bTableBody', content: [{ stype: 'bTableRow', content: [
    { stype: 'bTableCell', content: [{ stype: 'inline-text', text: 'Table value' }] }
  ] }] }] }
] };
const confirmedText = serializeNoteFile(confirmed);
let session: NoteSession | undefined;
afterEach(() => { session?.close(); session = undefined; });
function nativeText(): string {
  session ??= openNoteTree(confirmed);
  const tree = noteTreeOf(session.editor.dataStore, session.rootId);
  if (!tree) throw new Error('Missing native fixture root');
  return serializeNoteFile({ ...confirmed, content: tree.content as unknown[] });
}
function altered(change: (file: TestFile) => void): string {
  const file = JSON.parse(nativeText()) as TestFile; change(file); return JSON.stringify(file);
}

it('accepts a real rich native roundtrip while strict original bytes differ', () => {
  const native = nativeText();
  expect(native === confirmedText).toBe(false);
  expect(matchesConfirmedNoteNative(native, confirmedText)).toBe(true);
  expect(serializeNoteFile(confirmed) === confirmedText).toBe(true);
});

it('refuses a genuine native command mutation', async () => {
  nativeText();
  const root = session!.editor.dataStore.getNode(session!.rootId);
  const paragraphId = root?.content?.[0];
  if (typeof paragraphId !== 'string') throw new Error('Missing native paragraph');
  const runId = session!.editor.dataStore.getNode(paragraphId)?.content?.[0];
  if (typeof runId !== 'string') throw new Error('Missing native text');
  expect(await session!.editor.executeCommand('replaceText', { range: { type: 'range', startNodeId: runId,
    endNodeId: runId, startOffset: 0, endOffset: 4, collapsed: false }, text: 'Edited' })).toBe(true);
  expect(matchesConfirmedNoteNative(nativeText(), confirmedText)).toBe(false);
});

it.each([
  ['nonempty extra attributes', (file: TestFile) => { file.document.content[0].attributes = { ...file.document.content[0].attributes, extra: true }; }],
  ['nonempty extra content', (file: TestFile) => { const run = file.document.content[0].content[0]; run.content = [...(run.content ?? []), { stype: 'inline-text', attributes: {}, content: [], text: 'Extra' }]; }],
  ['missing existing marks', (file: TestFile) => { delete file.document.content[0].content[0].marks; }],
  ['reordered children', (file: TestFile) => { file.document.content.reverse(); }],
  ['changed mark range', (file: TestFile) => { file.document.content[0].content[0].marks![0]!.range[1] = 3; }],
  ['changed reference', (file: TestFile) => { file.document.content[0].content[1].attributes.pageId = '22222222-2222-4222-8222-222222222222'; }],
  ['changed code', (file: TestFile) => { file.document.content[1].content[0].text = 'Changed code'; }],
  ['changed table cell', (file: TestFile) => { file.document.content[2].content[0].content[0].content[0].content[0].text = 'Changed cell'; }],
  ['changed nonempty attributes', (file: TestFile) => { file.document.content[1].attributes.language = 'plain'; }],
] as const)('refuses %s', (_name, change) => {
  expect(matchesConfirmedNoteNative(altered(change), confirmedText)).toBe(false);
});

it('retains all unknown fields and resources, and ignores only object key ordering', () => {
  const server = JSON.parse(confirmedText) as TestFile, native = JSON.parse(nativeText()) as TestFile;
  const resources = { retained: [{ stype: 'unknown', payload: { content: [{ custom: true }] } }] };
  server.document.resources = structuredClone(resources); native.document.resources = structuredClone(resources);
  server.document.content[0].custom = { content: [{ attributes: { explicit: true } }] };
  native.document.content[0].custom = server.document.content[0].custom;
  const reordered = { document: native.document, version: native.version, format: native.format };
  expect(matchesConfirmedNoteNative(JSON.stringify(reordered), JSON.stringify(server))).toBe(true);
  native.document.resources!.retained[0]!.payload.content[0]!.custom = false;
  expect(matchesConfirmedNoteNative(JSON.stringify(native), JSON.stringify(server))).toBe(false);
});

it.each(['invalid', '{}', '{"format":"barocss-note","version":1,"document":{"stype":"note","content":[null]}}'])(
  'refuses malformed confirmed input', text => { expect(matchesConfirmedNoteNative(nativeText(), text)).toBe(false); });


it('accepts the untouched complete readonly native file and preserves omitted fields and resources', () => {
  const source: NoteDocument = structuredClone(confirmed);
  Object.assign(source, { metadata: { loadedAt: 'authored readonly stamp', explicitEmpty: {} },
    resources: { retained: [{ stype: 'opaque-resource', payload: { content: [{ custom: true }] } }] } });
  const original = serializeNoteFile(source);
  session = openNoteTree(source); session.editor.setEditable(false);
  const tree = noteTreeOf(session.editor.dataStore, session.rootId);
  if (!tree) throw new Error('Missing actual readonly native root');
  const native = serializeNoteFile({ ...source, content: tree.content as unknown[] });
  const nativeFile = JSON.parse(native) as TestFile, originalFile = JSON.parse(original) as TestFile;
  expect(session.editor.isEditable).toBe(false); expect(nativeFile).toEqual(originalFile);
  expect(Object.hasOwn(nativeFile.document.content[0], 'attributes')).toBe(false);
  expect(Object.hasOwn(nativeFile.document.content[0].content[1], 'marks')).toBe(false);
  expect(nativeFile.document.resources).toEqual(originalFile.document.resources);
  expect(matchesConfirmedNoteNative(native, original)).toBe(true);
  expect(serializeNoteFile(source)).toBe(original);
});

it.each([
  { stype: 'paragraph', content: [null] },
  { stype: 'paragraph', content: [{}] },
  { stype: 'paragraph', content: {} },
])('refuses an identical malformed native and confirmed child', child => {
  const text = JSON.stringify({ format: 'barocss-note', version: 1,
    document: { stype: 'note', content: [child] } });
  expect(matchesConfirmedNoteNative(text, text)).toBe(false);
});

it('refuses identical native and confirmed trees past the existing depth limit', () => {
  let child: unknown = { stype: 'inline-text', text: 'Deep source' };
  for (let depth = 0; depth < 102; depth++) child = { stype: 'paragraph', content: [child] };
  const text = JSON.stringify({ format: 'barocss-note', version: 1,
    document: { stype: 'note', content: [child] } });
  expect(matchesConfirmedNoteNative(text, text)).toBe(false);
});
