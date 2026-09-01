import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipOf } from '../src/zip';

/**
 * **An archive that a real unarchiver opens.**
 *
 * The whole point of writing a zip by hand is that it is a *format*, and a format is either right or
 * silently not: a wrong CRC or a missing flag bit produces a file that opens on the machine that made
 * it and is reported corrupt on somebody else's. So the test does not read the bytes back with the
 * code that wrote them — it hands the file to **the operating system's own `unzip`** and looks at
 * what comes out.
 */
describe('a site as one file', () => {
  /**
   * Unpacked by **somebody else's implementation**, which is the whole point of the test.
   *
   * `ditto` is macOS's own unarchiver — the one the Finder uses — so a file it opens is a file a
   * reader can open. It also checks every CRC on the way, which is the failure mode a hand-written
   * zip actually has: a wrong checksum makes an archive that some tools accept and others call
   * corrupt.
   *
   * **Not `unzip`**, and that is worth the sentence rather than a silent choice: Info-ZIP's `unzip`
   * on macOS refuses to *create* a directory whose name is UTF-8 — `Illegal byte sequence` — whatever
   * the locale is set to. The archive is fine (Python's `zipfile` lists the names and validates the
   * CRCs; `ditto` extracts them; the Finder opens it); a 2003 command-line tool is not. Measured,
   * because the first version of this test failed and the bug was in the reader.
   */
  const unpack = (bytes: Uint8Array): { dir: string; files: string[] } => {
    const dir = mkdtempSync(join(tmpdir(), 'baro-zip-'));
    const at = join(dir, 'site.zip');
    const out = join(dir, 'out');
    writeFileSync(at, bytes);
    // A non-zero exit throws, which is the assertion that matters.
    execFileSync('ditto', ['-x', '-k', at, out]);

    const found: string[] = [];
    const walk = (path: string, prefix = '') => {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(join(path, entry.name), `${prefix}${entry.name}/`);
        else found.push(`${prefix}${entry.name}`);
      }
    };
    walk(out);
    return { dir: out, files: found.sort() };
  };

  it('is opened by the operating system, folders and Korean names and all', () => {
    const bytes = zipOf([
      { file: 'index.html', text: '<!doctype html><p>홈</p>' },
      { file: '제품/index.html', text: '<!doctype html><p>제품</p>' },
      { file: 'sitemap.xml', text: '<urlset/>' }
    ]);

    const { dir, files } = unpack(bytes);
    /*
     * The folder is the point: `제품/index.html` is what makes a link to `/제품` resolve, and a
     * browser download cannot produce one at all. The Korean name surviving is the flag bit — a zip's
     * default name encoding is a code page from 1989, and without it this is a folder of mojibake.
     */
    expect(files).toEqual(['index.html', 'sitemap.xml', '제품/index.html']);
    expect(readFileSync(join(dir, '제품', 'index.html'), 'utf8')).toContain('제품');
  });

  it('carries bytes through as bytes', () => {
    // A one-pixel PNG. base64 is how it travels through a document and is not what a folder holds.
    const DOT =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const { dir, files } = unpack(zipOf([{ file: 'assets/로고.png', bytes: DOT }]));

    expect(files).toEqual(['assets/로고.png']);
    const written = readFileSync(join(dir, 'assets', '로고.png'));
    expect(written).toEqual(Buffer.from(DOT, 'base64'));
    // The PNG signature, which is the one check that says this is a picture rather than a string.
    expect([...written.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('writes the same archive twice for the same site', () => {
    /*
     * A fixed timestamp rather than the clock, so two publishes of an unchanged document are two
     * identical files — which is what makes a diff of a deploy readable, and the same argument
     * `formatDateField` makes about a renderer that reads the clock being untestable.
     */
    const one = zipOf([{ file: 'index.html', text: '홈' }]);
    const two = zipOf([{ file: 'index.html', text: '홈' }]);
    expect(Buffer.from(one)).toEqual(Buffer.from(two));
  });

  it('is an empty archive rather than nothing, for a site with no pages', () => {
    /*
     * 22 bytes: the end-of-central-directory record on its own, which is a **valid** empty zip and
     * not a zero-length file. Not unpacked here — an unarchiver handed an empty archive says so and
     * exits non-zero, which is it being right rather than the file being wrong.
     */
    expect(zipOf([]).length).toBe(22);
  });
});
