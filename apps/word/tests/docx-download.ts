import { expect, type Page, type TestInfo } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';

// Decode the downloaded container independently of the product converter.
function zipEntries(bytes: Buffer): Record<string, string> {
  const end = bytes.length - 22;
  expect(bytes.readUInt32LE(end), 'ZIP end record').toBe(0x06054b50);
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  const files: Record<string, string> = {};
  for (let index = 0; index < count; index++) {
    expect(bytes.readUInt32LE(offset), 'ZIP central entry').toBe(0x02014b50);
    const method = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const size = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    const local = bytes.readUInt32LE(offset + 42);
    expect(bytes.readUInt32LE(local), 'ZIP local entry').toBe(0x04034b50);
    expect(files[name], 'duplicate ZIP path').toBeUndefined();
    expect([0, 8], 'ZIP compression method').toContain(method);
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const compressed = bytes.subarray(start, start + compressedSize);
    const content = method === 8 ? inflateRawSync(compressed) : compressed;
    expect(content.length, `decoded size of ${name}`).toBe(size);
    files[name] = content.toString('utf8');
    offset += 46 + nameLength + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
  }
  expect(offset).toBe(end);
  return files;
}

export async function verifyDownloadedTable(page: Page, testInfo: TestInfo, body: string, cells: string[]) {
  await page.getByRole('button', { name: '문서 작업', exact: true }).click();
  await page.getByRole('button', { name: 'DOCX 내보내기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'DOCX 내보내기', exact: true });
  const pending = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'DOCX 다운로드', exact: true }).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.docx$/);
  const path = testInfo.outputPath('word-table.docx');
  await download.saveAs(path);
  const bytes = await readFile(path);
  const files = zipEntries(bytes);
  expect(Object.keys(files)).toEqual(expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']));
  const xml = files['word/document.xml'];
  const structure = await page.evaluate(source => {
    const parsed = new DOMParser().parseFromString(source, 'application/xml');
    const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const elements = (local: string) => Array.from(parsed.getElementsByTagNameNS(ns, local));
    return {
      parseErrors: parsed.getElementsByTagName('parsererror').length,
      bodyParagraphs: elements('p').filter(el => el.parentElement?.localName === 'body').map(el =>
        Array.from(el.getElementsByTagNameNS(ns, 't')).map(text => text.textContent ?? '').join('')),
      tables: elements('tbl').length,
      rows: elements('tr').length,
      cells: elements('tc').map(el => Array.from(el.getElementsByTagNameNS(ns, 't')).map(text => text.textContent ?? '').join(''))
    };
  }, xml);
  await testInfo.attach('downloaded-document.xml', { body: xml, contentType: 'application/xml' });
  await testInfo.attach('download-diagnostics', { body: JSON.stringify({
    filename: download.suggestedFilename(), bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), paths: Object.keys(files), ...structure
  }, null, 2), contentType: 'application/json' });
  expect(structure.parseErrors).toBe(0);
  expect(structure.bodyParagraphs.filter(text => text === body)).toHaveLength(1);
  expect(structure.tables).toBe(1);
  expect(structure.rows).toBe(2);
  expect(structure.cells).toEqual(cells);
  await testInfo.attach('downloaded-docx', { path, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
