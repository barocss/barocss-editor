/**
 * Whether the reader is on a Mac — the one thing `keyLabel` needs and cannot ask.
 *
 * `office-controls`' `keys.ts` says why it takes `apple` as an argument instead of sniffing: "a pure
 * function of the platform is testable and `navigator` is not — and the caller knows anyway." That is
 * right, and it leaves the sniff itself homeless, so each caller wrote it again. The site builder had
 * two copies of these four lines before this file, one in the ribbon and one about to be in the
 * panel, which is how a product ends up printing `⌘D` in a toolbar and `Ctrl+D` in a menu.
 *
 * Here rather than there because this package is the browser one: `office-ui` already assumes a DOM
 * and `office-controls` deliberately does not.
 *
 * `userAgentData.platform` first — `navigator.platform` is deprecated and frozen to `MacIntel` on
 * Apple silicon, which happens to still be right, but only by accident.
 */
export function onApple(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const name = nav.userAgentData?.platform ?? nav.platform ?? '';
  return /mac|iphone|ipad/i.test(name);
}
