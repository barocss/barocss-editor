import { test, expect } from '@playwright/test';
import { openDeck } from './helpers';

/**
 * A group's box follows what is in it.
 *
 * A group is not a shape a reader drew — it is the fact that these things move
 * together — so its rectangle has one honest value: the bounds of its children.
 * Nothing kept it there. Moving a child out of a group is legitimate in the
 * model, and it left the group describing an area its contents had left:
 * measured in this deck, a child nudged 6000 twips to the right stuck that far
 * outside a group whose width never changed, and the handles, the marquee, the
 * hit test and aligning were all reading a rectangle that had stopped meaning
 * anything.
 *
 * The arithmetic is unit-tested in `office-slides/test/group-bounds.test.ts`.
 * What only a browser shows is that *anything* which moves a child sets it off —
 * a reaction rather than a step inside each command, because a drag, a nudge, an
 * align, a paste and an undo all move children and the seventh command would
 * forget to call it.
 */
const groupState = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const store = (window as any).editor.dataStore;
    const root = store.getNode((window as any).editor.getRootId());

    let group: any = null;
    const walk = (sid: string, depth: number) => {
      const node = store.getNode(sid);
      if (!node || depth > 30) return;
      if (node.stype === 'group' && !group) group = node;
      for (const child of node.content ?? []) if (typeof child === 'string') walk(child, depth + 1);
    };
    for (const sid of root.content ?? []) walk(sid, 0);
    if (!group) return null;

    const box = (node: any) => ({
      x: node.attributes?.x ?? 0,
      y: node.attributes?.y ?? 0,
      width: node.attributes?.width ?? 0,
      height: node.attributes?.height ?? 0
    });
    const fresh = store.getNode(group.sid);
    const children = (fresh.content ?? []).map((sid: string) => store.getNode(sid));
    return { sid: group.sid, box: box(fresh), children: children.map(box), first: children[0].sid };
  });

test('a group grows to hold a child that moves out of it', async ({ page }) => {
  await openDeck(page);

  const before = await groupState(page);
  expect(before, '덱에 그룹이 없습니다').not.toBeNull();

  await page.evaluate(
    async (sid) => {
      const editor = (window as any).editor;
      const child = editor.dataStore.getNode(sid);
      await editor
        .transaction([
          {
            type: 'setAttrs',
            payload: { nodeId: sid, attrs: { x: (child.attributes?.x ?? 0) + 6000 } }
          }
        ])
        .commit();
    },
    before!.first
  );

  // The reaction runs on the content change that follows the edit.
  await expect
    .poll(async () => (await groupState(page))!.box.width)
    .toBeGreaterThan(before!.box.width);

  const after = await groupState(page);

  // Every child is inside the group's rectangle, which is the whole claim.
  for (const child of after!.children) {
    expect(child.x).toBeGreaterThanOrEqual(0);
    expect(child.y).toBeGreaterThanOrEqual(0);
    expect(child.x + child.width, '자식이 그룹 밖으로 나가 있습니다').toBeLessThanOrEqual(
      after!.box.width + 1
    );
    expect(child.y + child.height).toBeLessThanOrEqual(after!.box.height + 1);
  }

  /**
   * And nothing else jumped, which is what makes the rebasing invisible.
   *
   * The group's origin moves to meet its children and every child shifts the
   * other way by the same amount, so a child nobody touched is in exactly the
   * same place on the slide as before. Asserted on the *second* child, because
   * the first is the one that was moved — measuring the group's left edge
   * instead would fail honestly here: the child that moved was the leftmost, so
   * the contents' left edge really did move.
   */
  const absolute = (state: { box: { x: number; y: number }; children: { x: number; y: number }[] }, at: number) => ({
    x: state.box.x + state.children[at].x,
    y: state.box.y + state.children[at].y
  });
  expect(absolute(after!, 1), '건드리지 않은 자식이 움직였습니다').toEqual(absolute(before!, 1));
});
