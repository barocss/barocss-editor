/**
 * The devices a width can be **a window onto**.
 *
 * ## Why this is a list and not a free pair of numbers
 *
 * A reader can always type a width and a height, and most will. What they cannot do from two numbers
 * is answer *what does this actually look like on a phone* — 390 × 844 is a phone and 393 × 852 is a
 * different phone, and nobody holds those apart. Asked as *실제 장치 이미지가 외곽선에 있으면 좀 더
 * 실감 날 듯 (장치별로 사이즈가 자동으로 바뀌던가)*, which is both halves of the same request: the
 * picture, and the numbers that go with it.
 *
 * ## A shorthand, not a second source of truth
 *
 * Choosing a device **writes the numbers** onto the width and remembers which device they came from.
 * The document keeps the numbers; the name is kept so preview can draw the right frame around it and
 * so the panel can say which one is chosen. A width whose numbers are then edited by hand keeps its
 * device name and stops matching it — which is honest and is what `deviceMatches` is for: the panel
 * shows *직접 입력* rather than claiming a phone that is 500 wide.
 *
 * ## Why the bezel is a number and not a picture
 *
 * A photograph of a phone is a licensing question, a 200KB asset per device, and a thing that looks
 * wrong the year the phone changes. A rounded rectangle with the right **proportions** and the right
 * corner radius reads as the device at a glance and costs four numbers. Every design tool that draws
 * device frames draws them this way for the same reason.
 */

export interface Device {
  /** What a width stores, and what `deviceNamed` looks up. Durable. */
  name: string;
  /** What a reader reads. */
  label: string;
  /** The page's width in CSS pixels — what the board is drawn at. */
  width: number;
  /** The window's height in CSS pixels — what preview shows. */
  viewport: number;
  /** The picture beside its name, from the suite's own table. */
  icon: string;
  /**
   * How thick the bezel around the screen is, in CSS pixels, and how round the outside is.
   *
   * `0` is a device with no bezel worth drawing — a laptop shown as a plain board, which is what a
   * reader designing for a desktop actually wants to look at.
   */
  bezel: number;
  radius: number;
}

/**
 * The devices, widest first.
 *
 * Short on purpose. A list of forty phones is a list nobody reads and a table that is wrong within a
 * year; these are the shapes a page is actually designed against — a laptop, a large phone, a small
 * one, a tablet each way — and any other size is two numbers a reader types.
 */
export const DEVICES: Device[] = [
  { name: 'laptop', label: '노트북', width: 1280, viewport: 800, icon: 'screen-desktop', bezel: 0, radius: 0 },
  { name: 'tablet', label: '태블릿', width: 834, viewport: 1112, icon: 'screen-tablet', bezel: 14, radius: 22 },
  {
    name: 'tablet-landscape',
    label: '태블릿 가로',
    width: 1112,
    viewport: 834,
    icon: 'screen-tablet',
    bezel: 14,
    radius: 22
  },
  { name: 'phone', label: '휴대폰', width: 390, viewport: 844, icon: 'screen-mobile', bezel: 10, radius: 30 },
  { name: 'phone-small', label: '작은 휴대폰', width: 360, viewport: 780, icon: 'screen-mobile', bezel: 10, radius: 26 }
];

/** The device a name refers to, or nothing — the reference shape, resolved. */
export function deviceNamed(name: unknown): Device | undefined {
  return typeof name === 'string' ? DEVICES.find((one) => one.name === name) : undefined;
}

/**
 * Whether a width's numbers still match the device it names.
 *
 * A reader may choose 휴대폰 and then type 420. Nothing is wrong with that document — but a panel that
 * went on saying 휴대폰 would be claiming a shape the page is not being drawn at, and preview would
 * draw a frame the board does not fill.
 */
export function deviceMatches(
  width: { width: number; viewport: number; device?: string } | undefined
): boolean {
  const device = deviceNamed(width?.device);
  return !!device && device.width === width!.width && device.viewport === width!.viewport;
}

/**
 * The picture a width gets when it has not been given one.
 *
 * A width a reader typed carries no icon, and the panel drew the *word* `name` in its place — the
 * icon table's own fallback for a glyph it does not have, which is exactly right and reads as a bug
 * when the caller asked for a fallback that does not exist.
 *
 * Chosen by size, because that is what the three glyphs mean: a screen, a tablet, a phone. The
 * boundaries are the ones a page actually breaks at rather than any device's exact width — 1024 is
 * where a layout stops being a phone's and 600 is where it stops being a laptop's.
 */
export function iconForWidth(size: number): string {
  if (size >= 1024) return 'screen-desktop';
  if (size >= 600) return 'screen-tablet';
  return 'screen-mobile';
}
