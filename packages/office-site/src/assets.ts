/**
 * **The files a site is made of**, kept in the document and written out once when it is published.
 *
 * ## What was missing
 *
 * A `picture` carried a `src` string and nothing in the product could put a **file** in one. The
 * sample got away with it by drawing its art as SVG data URIs — a thing a product's author can do
 * and a reader cannot. Adding a photograph was not possible at all, which is the second most common
 * thing anybody does on a page after writing on it.
 *
 * ## Two answers to one `src`, and why they differ
 *
 * The **editor** needs the bytes: a board draws from the document and there is no server to ask. So
 * `asset:로고` resolves to a `data:` URI there.
 *
 * The **published page** needs a file. Inlining a logo used on five pages would write its bytes five
 * times, and a 400KB photograph in the middle of the HTML delays the first paint by exactly as long
 * as it takes to download — a browser cannot start drawing a page it has not finished reading.
 * So the export writes `assets/로고.png` once and every page points at it.
 *
 * That is the second thing in this product that is deliberately different between a board and a
 * published page, after a form's `action`. Both are the same shape — `SiteEnv.published` — and both
 * are the drawing being *more* correct on one side rather than being two drawings.
 */

import { nfc, sameName } from './names';

/** How a picture names one. The sixth reference of this shape — see the schema. */
export const ASSET_PREFIX = 'asset:';

export interface Asset {
  sid: string;
  name: string;
  label?: string;
  type: string;
  data: string;
  width?: number;
  height?: number;
  /** The same picture, smaller — narrowest first. See `srcsetFor` and the schema. */
  sizes: { width: number; data: string }[];
}

/**
 * The widths a picture is kept at, beside its own.
 *
 * Three, and they are not arbitrary: 640 is a phone at 2× and a laptop at 1×, 1280 is a laptop at 2×
 * and the widest board this product draws, 1920 is a desktop at 2× and where a photograph stops
 * getting visibly better on any screen anybody has.
 *
 * A file already narrower than one of them does not get it: making a picture *bigger* is a larger
 * download of a blurrier image, which is the one thing worse than sending the original.
 */
export const RENDITIONS = [640, 1280, 1920] as const;

type Access = { rootId: string; getNode: (sid: string) => Record<string, any> | undefined };

/** Whether a `src` names an asset rather than being an address. */
export function isAssetRef(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(ASSET_PREFIX);
}

/** The name in `asset:이름`, or nothing. */
export function assetNameOf(value: unknown): string | undefined {
  return isAssetRef(value) ? value.slice(ASSET_PREFIX.length).trim() || undefined : undefined;
}

/** Every file this document holds, in document order. */
export function assetsOf(doc: Access | undefined): Asset[] {
  const found: Asset[] = [];
  const root = doc ? doc.getNode(doc.rootId) : undefined;
  for (const child of (root?.content ?? []) as unknown[]) {
    if (typeof child !== 'string') continue;
    const box = doc!.getNode(child);
    if (box?.stype !== 'resources') continue;

    for (const each of (box.content ?? []) as unknown[]) {
      if (typeof each !== 'string') continue;
      const node = doc!.getNode(each);
      if (node?.stype !== 'asset') continue;
      const name = node.attributes?.name;
      const data = node.attributes?.data;
      // A file with no name is one nothing can point at; one with no bytes is not a file.
      if (typeof name !== 'string' || !name) continue;
      if (typeof data !== 'string' || !data) continue;
      found.push({
        sid: String(node.sid),
        name,
        label: typeof node.attributes?.label === 'string' ? node.attributes.label : undefined,
        type: typeof node.attributes?.type === 'string' ? node.attributes.type : 'image/png',
        data,
        width: typeof node.attributes?.width === 'number' ? node.attributes.width : undefined,
        height: typeof node.attributes?.height === 'number' ? node.attributes.height : undefined,
        sizes: (Array.isArray(node.attributes?.sizes) ? node.attributes.sizes : [])
          .filter(
            (one: unknown): one is { width: number; data: string } =>
              !!one &&
              typeof one === 'object' &&
              typeof (one as { width?: unknown }).width === 'number' &&
              typeof (one as { data?: unknown }).data === 'string' &&
              !!(one as { data: string }).data
          )
          .sort((a: { width: number }, b: { width: number }) => a.width - b.width)
      });
    }
  }
  return found;
}

/** The file a name points at, or nothing. */
export function assetNamed(doc: Access | undefined, name: unknown): Asset | undefined {
  if (typeof name !== 'string' || !name) return undefined;
  /*
   * Compared **composed**: `로고` typed on a keyboard and `로고` handed over by a macOS file picker
   * are the same word and different strings. See `names.ts`.
   */
  return assetsOf(doc).find((one) => sameName(one.name, name));
}

/**
 * The extensions this product writes, by media type.
 *
 * A short list rather than a parse of the type: `image/svg+xml` is not `.svg+xml`, and deriving an
 * extension by splitting on `/` gets that one wrong in the one format a design tool uses most. A type
 * not on the list is written as `.bin`, which is honest — a file whose name lies about its contents
 * is worse than one that admits it.
 */
const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg'
};

/** What one asset is called in the published folder. */
export function assetFileName(asset: Asset): string {
  /*
   * The **name**, cleaned rather than replaced by an id. A file called `로고.png` in a folder is a
   * thing a reader recognises when they open the zip; `a3f9c1.png` is a thing they will not touch.
   * Only what a path cannot carry is taken out — Korean is fine in a URL and has been for years.
   */
  const safe = nfc(asset.name).replace(/[\\/:*?"<>|#\s]+/g, '-').replace(/^-+|-+$/g, '') || 'asset';
  return `assets/${safe}.${EXTENSIONS[asset.type] ?? 'bin'}`;
}

/** What one rendition is called — the name, its width, and the type's extension. */
export function renditionFileName(asset: Asset, width: number): string {
  return assetFileName(asset).replace(/\.([^.]+)$/, `-${width}.$1`);
}

/**
 * **The list a browser chooses from** — every rendition and the file itself, with its own width.
 *
 * Empty when there is only one size, and that is the point rather than a shortcut: a `srcset` with
 * one entry is a longer attribute that says exactly what `src` already said.
 *
 * The browser chooses, knowing the screen's density and — in some of them — the connection. That is a
 * decision this product cannot make and should not try to: the same argument the export makes about
 * publishing a rule rather than a value.
 */
export function srcsetFor(asset: Asset | undefined): string | undefined {
  if (!asset || asset.sizes.length === 0 || !asset.width) return undefined;
  const parts = [
    ...asset.sizes.map((one) => `${renditionFileName(asset, one.width)} ${one.width}w`),
    `${assetFileName(asset)} ${asset.width}w`
  ];
  return parts.join(', ');
}

/**
 * What a `src` becomes — the bytes on a board, the file's path on a published page.
 *
 * A `src` that is not a reference comes back untouched, which is what keeps every address and every
 * data URI already in a document working exactly as it did.
 *
 * A reference to a file that is **not there** comes back as the reference itself rather than as an
 * empty string: an `<img src="asset:로고">` draws a broken image, which a reader can see and go and
 * fix, where `src=""` re-requests the page it is on and draws nothing at all.
 */
export function assetSrc(doc: Access | undefined, src: unknown, published = false): string {
  const said = typeof src === 'string' ? src : '';
  const name = assetNameOf(said);
  if (!name) return said;

  const asset = assetNamed(doc, name);
  if (!asset) return said;

  return published ? assetFileName(asset) : `data:${asset.type};base64,${asset.data}`;
}

/**
 * How many bytes a base64 string is when it stops being base64.
 *
 * Counted rather than decoded: a document with twenty photographs in it should not be decoded twice
 * per keystroke to answer a question about its size.
 */
export function byteLength(data: string): number {
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((data.length * 3) / 4) - padding);
}

/**
 * How large a document may get before the size is worth saying out loud, in bytes.
 *
 * Not a limit — nothing refuses a file — and the number is not arbitrary: it is roughly where a
 * `.baro` stops opening instantly on a laptop and starts being a thing a reader waits for. The
 * honest thing a product can do about a cost it chose is *report* it at the point it starts to
 * matter, rather than either hiding it or refusing the file that caused it.
 */
export const ASSET_BUDGET = 8 * 1024 * 1024;

/** What is wrong with the files this document holds. */
export function assetFaults(doc: Access | undefined): string[] {
  const assets = assetsOf(doc);
  const faults: string[] = [];

  const seen = new Set<string>();
  let total = 0;
  for (const one of assets) {
    total += byteLength(one.data);
    if (seen.has(nfc(one.name))) faults.push(`'${one.name}' 파일이 두 개입니다 — 하나만 그려집니다`);
    seen.add(nfc(one.name));
  }

  if (total > ASSET_BUDGET) {
    const mb = Math.round((total / (1024 * 1024)) * 10) / 10;
    faults.push(
      `그림이 ${mb}MB입니다 — 문서를 여는 데 시간이 걸립니다. 큰 그림은 줄여서 넣는 편이 낫습니다`
    );
  }
  return faults;
}
