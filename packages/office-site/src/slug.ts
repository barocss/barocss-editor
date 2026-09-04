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
 * ## Hangul: 만드는 쪽은 로마자, 적는 쪽은 그대로 — **뒤집힌 결정입니다**
 *
 * This said *a reader who names a page 제품 gets `/제품`, not `/jepum`*, on the argument that
 * romanisation reads as neither language and that two people transliterate the same word
 * differently. Half of that still holds and is why the table at the bottom of this file is a **table**
 * — the product does it one way, always.
 *
 * What it did not weigh is the address bar. `/제품` is stored as typed and **shown as
 * `/%EC%A0%9C%ED%92%88`**: in a browser's address bar, in a copied link, in an analytics report, in a
 * `curl` line. A reader who copies the URL of their own page gets 27 characters of hex to paste into
 * a chat. Reported as *페이지에 적는 주소는 기본적으로 영문 slug 를 등록할 수 있도록 하자. 그래야
 * 안헷갈림*, and settled as *영문 slug 가 우선이고 한글은 후자야*.
 *
 * So the priority reverses and both halves are kept:
 *
 * - **생성** — a name turned into an address is Latin. `제품` → `/jepum`. See `latinSlugFor` and
 *   `freeAddressFor`.
 * - **입력** — a reader who types `/제품` gets `/제품`. `slugFor` and `pathFor` are unchanged, and
 *   keep every script.
 *
 * Which is still the position this schema takes about a component's name and a dataset's: the
 * product suggests, the reader decides, and the suggestion is one they can type over.
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

/**
 * ── 한글을 라틴 문자로 ───────────────────────────────────────────
 *
 * **이 파일의 앞부분에 적힌 결정을 뒤집습니다.** 그 결정은 *로마자는 어느 언어로도 읽히지 않는다 —
 * 아무도 타이핑하지 않고, 검색 결과에서 알아보지도 못한다* 였고, 지금도 절반은 맞습니다.
 *
 * What it did not weigh is the address bar. `/제품` is stored as typed and **shown as
 * `/%EC%A0%9C%ED%92%88`** — in a browser's address bar, in a copied link, in an analytics report, in
 * a `curl` line. A reader who copies the URL of their own page gets 27 characters of hex to paste
 * into a chat. That is the confusion the report names: *페이지에 적는 주소는 기본적으로 영문 slug 를
 * 등록할 수 있도록 하자. 그래야 안헷갈림*, answered *영문 slug 가 우선이고 한글은 후자야*.
 *
 * So the priority is reversed and both halves are kept:
 *
 * | | |
 * |---|---|
 * | **만들 때** | 이름에서 주소를 뽑으면 라틴 문자입니다 — `제품` → `/jepum` |
 * | **적을 때** | 읽는 사람이 `/제품`이라고 치면 그대로 갑니다 — `slugFor`는 그대로입니다 |
 *
 * The old objection that *two people transliterate the same word differently* is exactly why this is
 * a table rather than a judgement: the product does it one way, always, and a reader who dislikes the
 * result types over it. That is one field, and it is theirs.
 *
 * ## 표는 국어의 로마자 표기법이고, 자음 동화는 하지 않습니다
 *
 * Revised Romanisation's letter tables, applied syllable by syllable. **음운 변화(자음 동화)는 한 가지
 * 만** — 받침 ㄹ 다음에 초성 ㄹ이 오면 `ll` (`블로그` → `beullogeu`, not `beulrogeu`) — because that
 * one is visible in ordinary words and the rest are not worth the ambiguity they add. A slug is a
 * name, not a pronunciation guide: what it has to be is **the same every time**, which a full
 * assimilation pass with its exceptions would stop being.
 */
const INITIALS = [
  'g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'
];

const MEDIALS = [
  'a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo',
  'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'
];

const FINALS = [
  '', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l',
  'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'
];

/** The first Hangul syllable, and how many syllables share one initial and one medial. */
const FIRST = 0xac00;
const LAST = 0xd7a3;

/**
 * 한글을 라틴 문자로 — 음절 하나씩, 표대로.
 *
 * Anything that is not a Hangul syllable is passed through: a name is usually mixed (`Barocss 소개`),
 * and mangling the half that is already Latin would be the opposite of the point.
 */
export function romanise(value: string): string {
  const said = nfc(String(value ?? ''));
  let out = '';
  let lastFinal = '';

  for (const ch of said) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < FIRST || code > LAST) {
      out += ch;
      lastFinal = '';
      continue;
    }
    const at = code - FIRST;
    const initial = Math.floor(at / 588);
    const medial = Math.floor((at % 588) / 28);
    const final = at % 28;

    /* 받침 ㄹ + 초성 ㄹ → `ll`, which is the one assimilation an ordinary word makes visible. */
    let head = INITIALS[initial];
    if (lastFinal === 'l' && initial === 5) head = 'l';

    out += head + MEDIALS[medial] + FINALS[final];
    lastFinal = FINALS[final];
  }
  return out;
}

/**
 * 이름에서 주소 한 조각을 만든다 — **라틴 문자로**.
 *
 * This is what a *product* produces; `slugFor` is what it does with what a *reader* wrote. The two
 * are different questions and were one function, which is why the address of a new page was Hangul:
 * nothing had ever asked for a generated one separately from a typed one.
 */
export function latinSlugFor(value: string): string {
  return slugFor(romanise(value));
}

/**
 * 이름에서 주소를 만든다, 이미 쓰이고 있는 것은 피해서.
 *
 * A slug that collides is not a smaller problem than a Hangul one: two pages at one address publish
 * two files with one name, every link resolves to whichever the walk found first, and the other page
 * is still in the panel and unreachable — which `pathFaults` reports and this prevents.
 *
 * `-2`, `-3` rather than a hash, because a reader reads it: `/about-2` is a page they can recognise
 * as the second one and rename, and `/about-f3a91c` is a page they cannot.
 */
export function freeAddressFor(name: string, taken: readonly string[]): string {
  const base = latinSlugFor(name) || 'page';
  const used = new Set(taken.map((one) => pathFor(one)));

  if (!used.has(`/${base}`)) return `/${base}`;
  for (let n = 2; n < 1000; n += 1) {
    if (!used.has(`/${base}-${n}`)) return `/${base}-${n}`;
  }
  return `/${base}-${Date.now()}`;
}
