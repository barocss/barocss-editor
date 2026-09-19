import { afterEach, describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipOf } from '../src/zip';

// Independent readers check ZIP encoding, paths, bytes, and checksums.
// Python 3 is required on Linux CI. Keep macOS Finder's reader as an additional check.
describe('a site as one file', () => {
  const temporaryDirectories: string[] = [];
  afterEach(() => {
    for (const dir of temporaryDirectories.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  const readers = process.platform === 'darwin' ? ['python3', 'ditto'] as const : ['python3'] as const;
  const unpack = (bytes: Uint8Array, reader: 'python3' | 'ditto'): { dir: string; files: string[] } => {
    const dir = mkdtempSync(join(tmpdir(), 'baro-zip-'));
    temporaryDirectories.push(dir);
    const at = join(dir, 'site.zip');
    const out = join(dir, 'out');
    writeFileSync(at, bytes);
    // A non-zero exit throws, which is the assertion that matters.
    if (reader === 'ditto') {
      execFileSync('ditto', ['-x', '-k', at, out], { stdio: 'pipe' });
    } else {
      // zipfile validates each entry's CRC while extracting. Arguments are not shell text.
      execFileSync('python3', ['-c',
        'import sys, zipfile\nwith zipfile.ZipFile(sys.argv[1]) as archive:\n    archive.extractall(sys.argv[2])',
        at, out], { stdio: 'pipe' });
    }

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

  it.each(readers)('opens folders and Korean names with %s', (reader) => {
    const bytes = zipOf([
      { file: 'index.html', text: '<!doctype html><p>홈</p>' },
      { file: '제품/index.html', text: '<!doctype html><p>제품</p>' },
      { file: 'sitemap.xml', text: '<urlset/>' }
    ]);

    const { dir, files } = unpack(bytes, reader);
    /*
     * The folder is the point: `제품/index.html` is what makes a link to `/제품` resolve, and a
     * browser download cannot produce one at all. The Korean name surviving is the flag bit — a zip's
     * default name encoding is a code page from 1989, and without it this is a folder of mojibake.
     */
    expect(files).toEqual(['index.html', 'sitemap.xml', '제품/index.html']);
    expect(readFileSync(join(dir, '제품', 'index.html'), 'utf8')).toContain('제품');
  });

  it.each(readers)('carries bytes through as bytes with %s', (reader) => {
    // A one-pixel PNG. base64 is how it travels through a document and is not what a folder holds.
    const DOT =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const { dir, files } = unpack(zipOf([{ file: 'assets/로고.png', bytes: DOT }]), reader);

    expect(files).toEqual(['assets/로고.png']);
    const written = readFileSync(join(dir, 'assets', '로고.png'));
    expect(written).toEqual(Buffer.from(DOT, 'base64'));
    // The PNG signature, which is the one check that says this is a picture rather than a string.
    expect([...written.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('rejects damaged file content through the portable reader', () => {
    const bytes = zipOf([{ file: 'index.html', text: 'original' }]);
    const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const dataStart = 30 + header.getUint16(26, true) + header.getUint16(28, true);
    bytes[dataStart] ^= 1;
    expect(() => unpack(bytes, 'python3')).toThrow(/Bad CRC-32/);
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
