/**
 * **A site as one file**, because a folder is the only shape a published site has.
 *
 * ## Why this exists now and did not before
 *
 * Publishing wrote loose files: a browser download cannot make a folder, so a five-page site was
 * five downloads into whatever the reader's Downloads folder is, named `제품.html`. Two things ended
 * that on the same day:
 *
 * - **the pictures.** An asset is written to `assets/로고.png`, and there is no way to hand a
 *   browser a folder;
 * - **the links.** A link resolves to a page's address — `/제품` — and the file was `제품.html`, so
 *   every link in a published site was broken on every host that does not quietly try `.html` for
 *   you. `fileFor` writes `제품/index.html` now, which is a **tree**, which needs an archive.
 *
 * ## Why it is here rather than in the app
 *
 * `publish` says what a site *is* and the app says what a file is — a download, a POST, a folder —
 * and that line has not moved. What has moved is where the boundary sits inside it: turning a list of
 * files into **one array of bytes** is arithmetic, with no browser in it, and belongs where it can be
 * tested by asking what the bytes are. The app still does the only part that needs a browser, which
 * is handing them over.
 *
 * ## Stored, not deflated
 *
 * Every entry is written uncompressed. A zip may be, it is what every unarchiver expects, and the
 * alternative is shipping a DEFLATE implementation — a few hundred lines of bit-packing whose bugs
 * are silent and whose gain here is small: a site's bytes are mostly **pictures**, which are already
 * compressed, and the HTML is a few tens of kilobytes that compress again on the wire when the host
 * serves them.
 *
 * The day a site is a hundred pages of prose this is worth revisiting, and the shape does not change
 * — one field per entry says which method it used.
 */

/** One file going into the archive. Words or bytes, and never both — `PublishedFile`'s shape. */
export interface ZipEntry {
  file: string;
  text?: string;
  /** base64, which is how bytes travel through a document — see `assets.ts`. */
  bytes?: string;
}

/**
 * The CRC-32 every zip entry carries.
 *
 * The table is built once on first use rather than written out: 256 constants in a source file are
 * 256 chances to mistype one, and a wrong CRC produces an archive that opens on some unarchivers and
 * is reported corrupt by others — which is the worst way for this to fail.
 */
let TABLE: Uint32Array | undefined;

function crc32(bytes: Uint8Array): number {
  if (!TABLE) {
    TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let value = n;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      TABLE[n] = value >>> 0;
    }
  }

  let crc = 0xffffffff;
  for (const byte of bytes) crc = TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** base64 to bytes, without a browser: `atob` is a browser's and this runs in a test too. */
function fromBase64(value: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = value.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));

  let at = 0;
  let held = 0;
  let bits = 0;
  for (const character of clean) {
    held = (held << 6) | alphabet.indexOf(character);
    bits += 6;
    if (bits < 8) continue;
    bits -= 8;
    out[at++] = (held >> bits) & 0xff;
  }
  return out.subarray(0, at);
}

const utf8 = (value: string): Uint8Array => new TextEncoder().encode(value);

/**
 * The files, as one archive.
 *
 * Names are written as **UTF-8 with the flag bit set** (bit 11), which is the whole of what makes
 * `제품/index.html` survive: a zip's default name encoding is a code page from 1989, and an
 * unarchiver reading a Korean name without the flag produces a folder of mojibake. Every zip written
 * in the last fifteen years sets it, and every one that forgets is found by somebody on Windows.
 */
export function zipOf(entries: readonly ZipEntry[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  let size = 0;

  for (const entry of entries) {
    const name = utf8(entry.file);
    const body =
      typeof entry.bytes === 'string' ? fromBase64(entry.bytes) : utf8(entry.text ?? '');
    const crc = crc32(body);

    const local = new Uint8Array(30 + name.length + body.length);
    const head = new DataView(local.buffer);
    head.setUint32(0, 0x04034b50, true);
    head.setUint16(4, 20, true); // the version that understands a stored entry, and nothing more
    head.setUint16(6, 0x0800, true); // the name is UTF-8 — see above
    head.setUint16(8, 0, true); // stored
    /*
     * A fixed timestamp rather than the clock. Two publishes of an unchanged document should be two
     * identical archives — which is what makes a diff of a deploy readable, and is the same argument
     * `formatDateField` makes about a renderer that reads the clock being untestable.
     */
    head.setUint16(10, 0, true);
    head.setUint16(12, 0x21, true); // 1 January 1980, which is a zip's own zero
    head.setUint32(14, crc, true);
    head.setUint32(18, body.length, true);
    head.setUint32(22, body.length, true);
    head.setUint16(26, name.length, true);
    head.setUint16(28, 0, true);
    local.set(name, 30);
    local.set(body, 30 + name.length);
    locals.push(local);

    const entryHead = new Uint8Array(46 + name.length);
    const view = new DataView(entryHead.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0x0800, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint16(14, 0x21, true);
    view.setUint32(16, crc, true);
    view.setUint32(20, body.length, true);
    view.setUint32(24, body.length, true);
    view.setUint16(28, name.length, true);
    view.setUint32(42, offset, true);
    entryHead.set(name, 46);
    central.push(entryHead);

    offset += local.length;
    size += entryHead.length;
  }

  const end = new Uint8Array(22);
  const tail = new DataView(end.buffer);
  tail.setUint32(0, 0x06054b50, true);
  tail.setUint16(8, entries.length, true);
  tail.setUint16(10, entries.length, true);
  tail.setUint32(12, size, true);
  tail.setUint32(16, offset, true);

  const total = offset + size + end.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of [...locals, ...central, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
