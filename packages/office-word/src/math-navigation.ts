/**
 * Moving between the slots of an equation.
 *
 * Tab is how an equation is written. You make a fraction, type the numerator,
 * press Tab, type the denominator — the structure is built by filling holes in
 * order, and without that the slots are places you can only reach with the
 * mouse, which is not how anybody writes mathematics.
 *
 * Document order, which is reading order: OMML stores a fraction's numerator
 * before its denominator and a pre-script's scripts before what they belong to,
 * so walking the tree gives the order Word moves in without a table of
 * exceptions.
 *
 * Pure. What it needs from the document is the tree; where the caret then goes
 * is the caller's business.
 */
import { childrenOf, type DocumentAccess, type DocumentNode } from '@barocss/office-text';

/** The node types that are slots — the holes a construct offers. */
export const MATH_SLOTS = new Set([
  'mathNum',
  'mathDen',
  'mathElement',
  'mathSup',
  'mathSub',
  'mathDeg',
  'mathFuncName',
  'mathLim'
]);

/** The equation containing this node, or undefined if it is not in one. */
export function enclosingMath(doc: DocumentAccess, sid: string | undefined): DocumentNode | undefined {
  let node = sid ? doc.getNode(sid) : undefined;
  let depth = 0;

  while (node && depth++ < 64) {
    if (node.stype === 'oMath') return node;
    node = node.parentId ? doc.getNode(node.parentId) : undefined;
  }
  return undefined;
}

/** Every slot of an equation, in the order a reader meets them. */
export function slotsOf(doc: DocumentAccess, math: DocumentNode | undefined): DocumentNode[] {
  const out: DocumentNode[] = [];

  const visit = (node: DocumentNode | undefined, depth: number, insideHidden: boolean): void => {
    if (!node || depth > 64) return;
    if (node.sid && MATH_SLOTS.has(String(node.stype)) && !insideHidden) out.push(node);
    /**
     * **숨은 칸은 캐럿이 가는 자리가 아닙니다.**
     *
     * A radical with `m:degHide` is written `√` and its degree slot is not drawn — Word's own
     * behaviour, and this product draws it that way since `hideDegree` started being read. Tab went
     * on stopping there anyway, so a reader pressed Tab, typed **3**, and the character went into a
     * slot with `display: none`. Two checks caught the two halves and neither could be right alone:
     * one asked for the slot to be visible, the other typed into it and found nothing.
     *
     * The honest reading is the second one's own words — *a slot the caret can enter and the author
     * cannot see is a place to lose text in*. So it stops being a place the caret can enter.
     */
    const hidden =
      String(node.stype) === 'mathRadical' && (node as { attributes?: { hideDegree?: unknown } }).attributes?.hideDegree !== false;
    for (const child of childrenOf(doc, node)) {
      visit(child, depth + 1, insideHidden || (hidden && String(child.stype) === 'mathDeg'));
    }
  };

  visit(math, 0, false);
  return out;
}

/** The slot this node is in — the nearest one above it. */
export function slotOf(doc: DocumentAccess, sid: string | undefined): DocumentNode | undefined {
  let node = sid ? doc.getNode(sid) : undefined;
  let depth = 0;

  while (node && depth++ < 64) {
    if (node.sid && MATH_SLOTS.has(String(node.stype))) return node;
    if (node.stype === 'oMath') return undefined;
    node = node.parentId ? doc.getNode(node.parentId) : undefined;
  }
  return undefined;
}

/**
 * Where Tab goes from here.
 *
 * `null` means there is nowhere left in this equation — the last slot going
 * forwards, the first going back. The caller is expected to leave the equation
 * rather than wrap: an author who has filled the last slot is done with it, and
 * a Tab that put them back at the numerator would be a trap they could only
 * escape with the mouse.
 */
export function nextSlot(
  doc: DocumentAccess,
  caretSid: string | undefined,
  step: 1 | -1 = 1
): DocumentNode | null {
  const math = enclosingMath(doc, caretSid);
  if (!math) return null;

  const slots = slotsOf(doc, math);
  if (slots.length === 0) return null;

  const here = slotOf(doc, caretSid);
  if (!here) {
    // In the equation but not in any slot — between two runs at the top level.
    // Forwards goes to the first slot, backwards to the last.
    return step === 1 ? slots[0] : slots[slots.length - 1];
  }

  const at = slots.findIndex((each) => each.sid === here.sid);
  const to = at + step;
  return to >= 0 && to < slots.length ? slots[to] : null;
}

/**
 * The run inside a slot that the caret should land in.
 *
 * A slot with nothing in it has no text node, and a caret needs one — so the
 * caller has to make one. Returning undefined is how this says so.
 */
export function caretRunOf(doc: DocumentAccess, slot: DocumentNode | undefined): DocumentNode | undefined {
  if (!slot) return undefined;

  const find = (node: DocumentNode | undefined, depth: number): DocumentNode | undefined => {
    if (!node || depth > 32) return undefined;
    if (typeof node.text === 'string') return node;
    for (const child of childrenOf(doc, node)) {
      const hit = find(child, depth + 1);
      if (hit) return hit;
    }
    return undefined;
  };

  return find(slot, 0);
}
