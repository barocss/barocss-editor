/**
 * Measuring the tabs on a page.
 *
 * The arithmetic is in tabs.ts and knows nothing about a browser. This is the
 * half that has to look: where a tab sits, and how wide the text after it is,
 * are facts about a rendered line and nothing else can supply them.
 *
 * Every tab in a paragraph is resolved in one go rather than a round each. A
 * later tab starts where the earlier ones left off, so its position depends on
 * their widths — but the *text* between them does not, and that is what can be
 * measured directly. Measure the segments once, then walk them, and the whole
 * line comes out in a single pass.
 */
import { twipToPx } from './css';
import { DEFAULT_TAB_INTERVAL, resolveTab, tabStopsOf, type TabLeader } from './tabs';
import type { StyleResolver } from './style-resolver';
import type { DocumentAccess } from './document-access';

const SID_ATTR = 'data-bc-sid';

export interface MeasuredTab {
  width: number;
  leader: TabLeader;
}

/** The width of everything before a node, within its parent. */
function widthBefore(node: Node, parent: Element): number {
  const range = parent.ownerDocument.createRange();
  range.setStart(parent, 0);
  range.setEndBefore(node);
  return range.getBoundingClientRect().width;
}

/**
 * The width of everything between two nodes, as it is drawn.
 *
 * The bounding rectangle rather than the sum of the client rectangles: a run of
 * text is wrapped in nested spans — one for the run, one for each mark over it —
 * and a range across them reports a rectangle for each, covering the same
 * pixels. Adding those up counts the text as many times as it is nested, which
 * made a centred stop behave like a right one.
 */
function widthBetween(from: Node, to: Node | null, parent: Element): number {
  const range = parent.ownerDocument.createRange();
  range.setStartAfter(from);
  if (to) range.setEndBefore(to);
  else range.setEnd(parent, parent.childNodes.length);
  return range.getBoundingClientRect().width;
}

/**
 * Resolve every tab in the container against the paragraph it is in.
 *
 * A paragraph's tabs are treated as being on one line, which is what a tab is
 * nearly always for — a header with a name and a title, a contents line, a form
 * with columns. A paragraph that wraps *and* tabs would want its stops reset on
 * each line, and that is not done here.
 */
export function measureTabs(
  container: HTMLElement,
  doc: DocumentAccess,
  styles: StyleResolver | undefined
): Map<string, MeasuredTab> {
  const measured = new Map<string, MeasuredTab>();
  const tabs = Array.from(container.querySelectorAll('.w-tab')) as HTMLElement[];
  if (tabs.length === 0) return measured;

  // Grouped by the block they belong to, because the stops are the block's and
  // a later tab's position depends on the earlier ones in the same block.
  const byBlock = new Map<Element, HTMLElement[]>();
  for (const tab of tabs) {
    const block = tab.closest('.w-paragraph, .w-heading, .w-list-item, .w-quote');
    if (!block) continue;
    const group = byBlock.get(block);
    if (group) group.push(tab);
    else byBlock.set(block, [tab]);
  }

  for (const [block, group] of byBlock) {
    // The real node, not one made up from the element. A paragraph's stops are
    // an attribute of the document, and a stand-in built from a tag name has
    // none — which silently drops every stop the document named and leaves the
    // default interval doing all the work.
    const sid = block.getAttribute(SID_ATTR);
    const node = sid ? doc.getNode(sid) : undefined;
    const format = node && styles ? styles.resolveNode(node, 'paragraph') : undefined;
    const stops = tabStopsOf(format as never).map((stop) => ({ ...stop, pos: twipToPx(stop.pos) }));

    // The line runs across the block's content box: its own padding and the
    // indents the style resolved are already in these numbers, which is why the
    // stops are measured from here and not from the page margin.
    const box = block.getBoundingClientRect();
    const style = block.ownerDocument.defaultView?.getComputedStyle(block);
    const left = box.left + Number.parseFloat(style?.paddingLeft ?? '0');
    const limit = box.right - Number.parseFloat(style?.paddingRight ?? '0') - left;

    const interval = twipToPx(DEFAULT_TAB_INTERVAL);
    const parent = group[0].parentElement ?? block;

    // Walked rather than measured. A tab's position depends on the widths of
    // the tabs before it, and those are what is being computed — reading each
    // tab's position off the page instead reads the answer from the round
    // before, so the numbers chase each other and the layout never settles.
    // Every keystroke then costs a full set of relayouts.
    //
    // The text between the tabs does not depend on any of it, so that is what
    // is measured, and the positions are accumulated from it.
    let x = widthBefore(group[0], parent);

    for (const [index, tab] of group.entries()) {
      const tabSid = tab.getAttribute(SID_ATTR);
      const following = widthBetween(tab, group[index + 1] ?? null, parent);
      const resolved = resolveTab(x, following, stops, { interval, limit });

      if (tabSid) measured.set(tabSid, { width: resolved.width, leader: resolved.leader });
      x += resolved.width + following;
    }
  }

  return measured;
}

/** What has to be the same for the tabs to count as unchanged. */
export function tabSignature(tabs: Map<string, MeasuredTab>): string {
  return [...tabs]
    .map(([sid, tab]) => `${sid}:${Math.round(tab.width)}:${tab.leader}`)
    .sort()
    .join(',');
}
