/**
 * **An address that is actually an address.**
 *
 * ## What a page's `path` was
 *
 * A free string. Measured, and every one of these was stored exactly as typed and published:
 *
 * | typed | what a browser does with it |
 * |---|---|
 * | `My Page` | no leading slash, so it is **relative** — from `/가격` the link means `/가격/My%20Page` |
 * | `/제품?a=1` | `?` starts a query; the file `제품?a=1/index.html` can never be requested |
 * | `/제품#x` | `#` is a fragment and is **not sent to the server at all** |
 * | `//x` | protocol-relative: a link to the host `x`, off the site entirely |
 * | `/A/` | a trailing slash, which is a second address for one page |
 *
 * None of them is a Korean problem. They are the ordinary ways a free string stops being a URL, and
 * the product had no opinion about any of them.
 *
 * ## And two pages at one address
 *
 * The worst of them, because it is invisible: two pages both at `/소개` publish two files with one
 * name and every link to either lands on whichever the walk found first. The other page is still in
 * the panel, still editable, and unreachable by anybody.
 *
 * ## Why Hangul is **not** romanised
 *
 * A reader who names a page 제품 gets `/제품`, not `/jepum`. Romanisation reads as neither language:
 * nobody types it, nobody recognises it in a search result, and Revised Romanisation has enough
 * irregularity that two people transliterate the same word differently. Every builder that does this
 * automatically is one whose Korean users turn it off first.
 *
 * A reader who wants an English address types one. That is one keystroke, and it is theirs to decide
 * rather than the product's to guess — the same position this schema takes about a component's name
 * and a dataset's.
 *
 * ## What it does do
 *
 * Lowercases ASCII, because a host that is case-sensitive turns `/Products` and `/products` into two
 * pages and a host that is not turns them into one — and only one of those two behaviours is worth
 * relying on. Everything else is removing what cannot be in a path and joining what is left.
 */
import { nfc } from './names';

/**
 * One segment of an address, from words a reader wrote.
 *
 * Hangul, Latin letters, digits, `-` and `_` survive. Spaces become `-`, and everything a URL gives
 * its own meaning to — `? # % & = + : @ ...` — is dropped rather than encoded: a segment that has to
 * be percent-encoded to be legal is one a reader cannot read back, which is the whole point of a slug.
 */
export function slugFor(value: string): string {
  return nfc(String(value ?? ''))
    .toLowerCase()
    .replace(/\s+/g, '-')
    // What is left: letters and digits in any script, plus the two joiners a path is written with.
    .replace(/[^\p{Letter}\p{Number}\-_]+/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');
}

/**
 * A whole address, from whatever a reader typed into the field.
 *
 * Each segment is slugged and they are rejoined, so `/제품/새 소식` stays two segments and `//x`
 * stops being a link to somebody else's host. The root is `/` and nothing else is; a trailing slash
 * is removed, because a page answering at both `/제품` and `/제품/` is one page with two addresses
 * and search engines count that as duplicated content.
 */
export function pathFor(value: string): string {
  // A fragment and a query are not part of an address a page *is* at: the first is never sent to a
  // server and the second is a question asked of one.
  const said = nfc(String(value ?? '')).split(/[?#]/)[0];
  const parts = said.split('/').map(slugFor).filter(Boolean);
  return parts.length > 0 ? `/${parts.join('/')}` : '/';
}

/** Whether a stored address is already what `pathFor` would make of it. */
export function isCleanPath(value: unknown): boolean {
  return typeof value === 'string' && value === pathFor(value);
}

/**
 * What is wrong with the addresses of a site, which is one thing and it is invisible.
 *
 * **Two pages at one address.** Both publish a file with the same name — so one overwrites the other
 * in the archive — and every link to either resolves to whichever the walk finds first. The lost page
 * is still in the panel and still editable, which is what makes this worth reporting rather than
 * leaving to be discovered.
 */
export function pathFaults(
  pages: readonly { sid: string; name: string; path: string }[]
): { sid: string; said: string }[] {
  const seen = new Map<string, string>();
  const faults: { sid: string; said: string }[] = [];

  for (const page of pages) {
    const at = pathFor(page.path);
    const first = seen.get(at);
    if (first) {
      faults.push({
        sid: page.sid,
        said: `'${first}'과(와) 주소가 같습니다 — 한쪽에는 아무도 닿을 수 없습니다`
      });
      continue;
    }
    seen.set(at, page.name || at);
  }
  return faults;
}
