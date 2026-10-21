// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { productFeedbackHost } from '@barocss/shared';
import { readNoteV1SnapshotFile as readNoteSnapshotFile, serializeNoteFile, type NoteDocument } from '@barocss/office-note/file';
import { ServerNoteWorkspace } from './server-workspace';
import { ServerNoteError, type NoteSaveAttempt } from './server-documents';

// Deterministic transport fixture. The actual Note session/view/command target,
// proposal transaction, lifetime and history run; no OIDC/API/PG proof is claimed.
const f = vi.hoisted(() => ({ client: undefined as unknown as {
  list: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn>;
  receipt: ReturnType<typeof vi.fn>; confirm: ReturnType<typeof vi.fn>;
} }));
vi.mock('./server-documents', async original => ({ ...await original<typeof import('./server-documents')>(),
  createServerNoteClient: () => ({ ...f.client }) }));
const tenantId = '11111111-1111-4111-8111-111111111111', workspaceId = '22222222-2222-4222-8222-222222222222';
const documentId = '33333333-3333-4333-8333-333333333333';
const originalNote: NoteDocument = { stype: 'note', attributes: { title: 'Actual Note host', pageId: documentId }, content: [
  { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Original host paragraph' }] },
  { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Unrelated host content', marks: [{ stype: 'bold', range: [0, 9] }] }] }
] };
const opened = (text = serializeNoteFile(originalNote), revision = 1) => {
  const read = readNoteSnapshotFile(text); if ('error' in read) throw new Error(read.error);
  return { mode: 'snapshot', document: { documentId, tenantId, workspaceId, product: 'note', title: 'Actual Note host',
    metadataRevision: 1, mode: 'snapshot', pageId: documentId, documentKey: 'actual-note-host',
    fileFormat: 'barocss-note', fileVersion: 1, revision, snapshotHash: 'a'.repeat(64) }, snapshotText: text, note: read.document };
};
let root: Root, host: HTMLDivElement;
let role: 'editor' | 'viewer', subject: string;
const transport = vi.fn() as unknown as typeof fetch;
const render = () => root.render(createElement(ServerNoteWorkspace, { tenantId, workspaceId, issuer: 'https://fixture.invalid',
  subject, role, initialDocumentId: documentId, authorizedFetch: transport }));
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect() });
  localStorage.clear(); role = 'editor'; subject = 'owner-a';
  f.client = { list: vi.fn(async () => [opened().document]), open: vi.fn(async () => opened()),
    save: vi.fn(async (attempt: NoteSaveAttempt) => attempt), receipt: vi.fn(async () => { throw new ServerNoteError(404, 'missing'); }),
    confirm: vi.fn(async (attempt: NoteSaveAttempt) => opened(attempt.snapshotText, 2)) };
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => { render(); });
  await vi.waitFor(() => expect(host.querySelector('.on-doc p')).not.toBeNull());
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  delete (Range.prototype as unknown as Record<string, unknown>).getClientRects;
  delete (Range.prototype as unknown as Record<string, unknown>).getBoundingClientRect;
  vi.unstubAllGlobals(); localStorage.clear();
});
async function actualCapture() {
  const paragraph = host.querySelector('.on-doc p')!, text = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT).nextNode()!;
  let field = paragraph.parentElement!;
  while (field.parentElement && field.contentEditable !== 'true') field = field.parentElement;
  field.tabIndex = -1; field.focus();
  const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, text.textContent!.length);
  const selected = window.getSelection()!; selected.removeAllRanges(); selected.addRange(range);
  const feedback = productFeedbackHost()!;
  let target!: ReturnType<typeof feedback.capture>;
  await act(async () => { target = feedback.capture(); });
  expect(target).not.toBeNull(); expect(target?.kind).toBe('note-paragraph');
  return { feedback, target: target! };
}
function proposal(id: string) {
  const expected = structuredClone(originalNote);
  (expected.content[0] as { content: { text: string }[] }).content[0].text = 'Reviewed host paragraph';
  return { targetId: id, snapshotText: serializeNoteFile(originalNote), expectedSnapshotText: serializeNoteFile(expected), replacement: 'Reviewed host paragraph' };
}
it('binds actual DOM capture to the same native host and applies only a local draft without transport Save', async () => {
  const { feedback, target } = await actualCapture();
  expect(feedback.ownsCapture!(target)).toBe(true);
  const preview = feedback.previewRevision!(proposal(target.id)); expect(preview).not.toBeNull();
  await act(async () => { expect(await preview!.apply()).toBe(true); });
  expect(host.querySelector('.on-doc p')?.textContent).toBe('Reviewed host paragraph');
  expect(host.querySelectorAll('.on-doc p')[1]?.textContent).toBe('Unrelated host content');
  expect(f.client.save).not.toHaveBeenCalled(); expect(f.client.confirm).not.toHaveBeenCalled();
  expect(feedback.ownsCapture!(target)).toBe(false); preview!.dispose();
});
it.each(['account-ABA', 'role-ABA', 'unmount'] as const)('retires actual capture through %s without native Apply or Save', async change => {
  const { feedback, target } = await actualCapture();
  const preview = feedback.previewRevision!(proposal(target.id)); expect(preview).not.toBeNull();
  if (change === 'account-ABA') {
    subject = 'owner-b'; await act(async () => { render(); });
    subject = 'owner-a'; await act(async () => { render(); });
  }
  if (change === 'role-ABA') {
    role = 'viewer'; await act(async () => { render(); });
    role = 'editor'; await act(async () => { render(); });
  }
  if (change === 'unmount') await act(async () => { root.render(null); });
  expect(feedback.ownsCapture!(target)).toBe(false);
  await act(async () => { expect(await preview!.apply()).toBe(false); });
  expect(f.client.save).not.toHaveBeenCalled(); expect(f.client.confirm).not.toHaveBeenCalled(); preview!.dispose();
});

it('explicit Note Save confirms only the applied fixed snapshot and never creates another revision on replay', async () => {
  const { feedback, target } = await actualCapture(), one = proposal(target.id);
  const preview = feedback.previewRevision!(one); expect(preview).not.toBeNull();
  await act(async () => { expect(await preview!.apply()).toBe(true); });
  expect(f.client.save).not.toHaveBeenCalled();
  await act(async () => { expect(await feedback.saveRevision!(one, 1)).toBe(true); });
  expect(f.client.save).toHaveBeenCalledTimes(1); expect(f.client.confirm).toHaveBeenCalledTimes(1);
  const fixed = f.client.save.mock.calls[0][0] as NoteSaveAttempt;
  expect(fixed).toMatchObject({ operation: 'update', documentId, expectedRevision: 1, snapshotText: one.expectedSnapshotText });
  expect(JSON.parse(fixed.snapshotText).document).toEqual(JSON.parse(one.expectedSnapshotText).document);
  await act(async () => { expect(await feedback.saveRevision!(one, 1)).toBe(true); });
  expect(f.client.save).toHaveBeenCalledTimes(1); preview!.dispose();
});
it('explicit Save refuses a different proposal snapshot or base without sending the local draft', async () => {
  const { feedback, target } = await actualCapture(), one = proposal(target.id);
  const preview = feedback.previewRevision!(one)!;
  await act(async () => { expect(await preview.apply()).toBe(true); });
  await act(async () => {
    expect(await feedback.saveRevision!({ ...one, expectedSnapshotText: one.expectedSnapshotText.replace('Reviewed host paragraph', 'Other draft') }, 1)).toBe(false);
    expect(await feedback.saveRevision!(one, 2)).toBe(false);
  });
  expect(f.client.save).not.toHaveBeenCalled(); expect(f.client.confirm).not.toHaveBeenCalled();
  expect(host.querySelector('.on-doc p')?.textContent).toBe('Reviewed host paragraph'); preview.dispose();
});
it('lost Save response keeps its immutable attempt and explicit receipt recovery never reapplies the proposal', async () => {
  const { feedback, target } = await actualCapture(), one = proposal(target.id), preview = feedback.previewRevision!(one)!;
  await act(async () => { expect(await preview.apply()).toBe(true); });
  f.client.save.mockImplementationOnce(async () => { throw new Error('fixture lost Save response'); });
  await act(async () => { expect(await feedback.saveRevision!(one, 1)).toBe(false); });
  const fixed = f.client.save.mock.calls[0][0] as NoteSaveAttempt;
  f.client.receipt.mockImplementationOnce(async () => fixed);
  await act(async () => { expect(await feedback.saveRevision!(one, 1)).toBe(true); });
  expect(f.client.save).toHaveBeenCalledTimes(1); expect(f.client.receipt).toHaveBeenCalledTimes(1);
  expect(f.client.receipt).toHaveBeenCalledWith('update', fixed.idempotencyKey);
  expect(f.client.confirm.mock.calls[0][0]).toEqual(fixed);
  expect(host.querySelector('.on-doc p')?.textContent).toBe('Reviewed host paragraph');
  expect(await preview.apply()).toBe(false); preview.dispose();
});
it('refuses corrupt durable retry storage without throwing, resending or changing the native draft', async () => {
  const { feedback, target } = await actualCapture(), one = proposal(target.id), preview = feedback.previewRevision!(one)!;
  await act(async () => { expect(await preview.apply()).toBe(true); });
  f.client.save.mockImplementationOnce(async () => { throw new Error('fixture lost Save response'); });
  await act(async () => { expect(await feedback.saveRevision!(one, 1)).toBe(false); });
  const key = Object.keys(localStorage).find(value => value.startsWith('wonffice.note.pending.v1:'))!;
  expect(key).toBeDefined(); const fixed = JSON.parse(localStorage.getItem(key)!);
  expect(fixed.attempt.snapshotText).toBe(one.expectedSnapshotText); localStorage.setItem(key, '{');
  await act(async () => { expect(await feedback.saveRevision!(one, 1)).toBe(false); });
  expect(f.client.save).toHaveBeenCalledTimes(1); expect(f.client.receipt).not.toHaveBeenCalled();
  expect(f.client.confirm).not.toHaveBeenCalled(); expect(localStorage.getItem(key)).toBe('{');
  expect(host.querySelector('.on-doc p')?.textContent).toBe('Reviewed host paragraph'); preview.dispose();
});
