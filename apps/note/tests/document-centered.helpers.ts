import { expect, type Page } from '@playwright/test';
export const documentTitle = 'Synthetic document review';
export const sentence = 'Review this fictional draft and keep the document stable.';
const text = (value: string) => ({ stype: 'inline-text', text: value });
const paragraph = (value: string) => ({ stype: 'paragraph', content: [text(value)] });
export const representativeDocument = () => ({ stype: 'note', attributes: { title: documentTitle, pageId: 'a5b7ea5b-6410-4c15-a352-b4e7cfb0a424' }, content: [
  { stype: 'heading', attributes: { level: 1 }, content: [text('Fictional release review')] },
  paragraph(sentence),
  { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Open the synthetic reference.', marks: [{ stype: 'link', attrs: { href: 'https://example.com/reference' }, range: [0, 29] }] }] },
  { stype: 'callout', attributes: { type: 'note', title: 'Keep source context' }, content: [paragraph('Nested fictional context remains editable.')] },
  { stype: 'bTable', content: [
    { stype: 'bTableHeader', content: ['Item', 'Result'].map(value => ({ stype: 'bTableHeaderCell', content: [text(value)] })) },
    { stype: 'bTableBody', content: [{ stype: 'bTableRow', content: ['Synthetic item', 'Pending review'].map(value => ({ stype: 'bTableCell', content: [text(value)] })) }] }
  ] },
  { stype: 'codeBlock', attributes: { language: 'javascript' }, content: [text('const synthetic = true;')] },
  { stype: 'paragraph', content: [text('Equation '), { stype: 'mathInline', attributes: { tex: 'x+1' } }, text(' belongs to the sentence.')] },
  { stype: 'paragraph', content: [text('Native reference '), { stype: 'pageReference', attributes: { pageId: 'a5b7ea5b-6410-4c15-a352-b4e7cfb0a424', title: 'Synthetic self reference' } }] },
  ...Array.from({ length: 16 }, (_, index) => paragraph(`Fictional appendix ${index + 1}: scroll and selection remain in this document.`)),
  paragraph('Final synthetic paragraph.')
] });
export async function openRepresentative(page: Page) {
  await page.goto('/'); await expect(page.getByLabel('노트 제목', { exact: true })).toBeVisible();
  await page.getByLabel('노트 파일', { exact: true }).setInputFiles({ name: 'document-centered.note.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ format: 'barocss-note', version: 1, document: representativeDocument() })) });
  await expect(page.getByLabel('노트 제목', { exact: true })).toHaveValue(documentTitle);
  await expect(page.locator('.on-doc').getByText(sentence, { exact: true })).toBeVisible();
  await expect(page.locator('[data-save-status]')).toHaveText('저장됨');
}
export async function selectSentence(page: Page) {
  const paragraph = page.locator('.on-doc > p').filter({ hasText: sentence }).first();
  await paragraph.click({ position: { x: 8, y: 10 } });
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowLeft' : 'Home');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+ArrowRight' : 'Shift+End');
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe(sentence);
  await expect(page.locator('[data-note-formatting]')).toBeVisible();
}
export async function persistedDocument(page: Page) {
  return page.evaluate(title => new Promise<unknown>((resolve, reject) => {
    const request = indexedDB.open('barocss-note', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { const db = request.result, tx = db.transaction('documents'), rows = tx.objectStore('documents').getAll();
      tx.oncomplete = () => { db.close(); const row = rows.result.find((row: { title: string }) => row.title === title); resolve(row ? JSON.parse(row.text).document : null); };
      tx.onabort = () => reject(tx.error); };
  }), documentTitle);
}
export async function viewState(page: Page) {
  return page.evaluate(() => {
    const body = document.querySelector('.on-doc')!, scroll = body.closest('.nw-main') as HTMLElement | null;
    const selection = getSelection();
    const sid = (node: Node | null | undefined) => (node?.nodeType === Node.ELEMENT_NODE ? node as Element : node?.parentElement)?.closest('[data-bc-sid]')?.getAttribute('data-bc-sid') ?? null;
    return { ids: [...body.querySelectorAll('[data-bc-sid]')].map(node => node.getAttribute('data-bc-sid')), scrollTop: scroll?.scrollTop ?? 0,
      anchor: sid(selection?.anchorNode), anchorOffset: selection?.anchorOffset ?? 0, focus: sid(selection?.focusNode), focusOffset: selection?.focusOffset ?? 0,
      selectedText: selection?.toString() ?? '', text: body.textContent };
  });
}
