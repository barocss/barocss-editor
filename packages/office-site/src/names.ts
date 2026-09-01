/**
 * **One spelling for a name a document stores.**
 *
 * ## The same word, two byte sequences
 *
 * `제품` can be written two ways in Unicode and both are correct:
 *
 * ```
 * NFC   eca09c ed9288                    6 bytes, one code point per syllable
 * NFD   e1848c e185a6 e18491 e185ae …    9 bytes, spelled out ㅈ ㅔ ㅍ ㅜ ㅁ
 * ```
 *
 * They look identical on every screen and are **different strings**. `'제품' === '제품'` is `false`
 * when one is each, which is not a thing anybody expects of a name they can read.
 *
 * ## Where this product would have got it wrong
 *
 * Not in what a reader types — a keyboard produces NFC. In what a **file picker** hands over: macOS
 * has given filenames in NFD for twenty years, and an asset is named after the file that arrived. So:
 *
 * - two pictures both showing `로고` would be two different names, the duplicate check would pass,
 *   and one of them would be permanently unreachable — which is exactly the fault that check exists
 *   to prevent;
 * - a reader who typed `로고` into a panel would not find the one they had just added.
 *
 * And the same shape one step further out: a browser requests `/제품` as NFC, so a file stored as NFD
 * on a host is a 404 that nobody can see by looking at either.
 *
 * ## NFC, because that is what everything else already does
 *
 * Not a choice between two equal forms. NFC is what a keyboard produces, what a browser sends, what a
 * URL bar shows, and what every Korean text on the web already is. NFD is a filesystem's private
 * habit leaking out through one API.
 *
 * Applied on the way **in** — a name is stored composed — and again when names are **compared**, so a
 * document that arrived from somewhere else still resolves rather than half-working.
 */

/** A name as this product stores and compares it. See the header for why NFC and not the other. */
export function nfc(value: string): string {
  return value.normalize('NFC');
}

/** Whether two names are the same name, whatever they are spelled with. */
export function sameName(left: unknown, right: unknown): boolean {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  return nfc(left) === nfc(right);
}
