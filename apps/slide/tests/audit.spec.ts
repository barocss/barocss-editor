import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck, currentSlide, visibleBoxes } from './helpers';

/**
 * The deck's own check.
 *
 * What it *finds* is a model, answered from the document with no DOM at all — 25
 * tests in milliseconds, including the two thresholds and the four things it
 * deliberately refuses to guess at (`office-slides/test/audit.test.ts`).
 *
 * What only a browser shows is the one thing the panel is for: **every row is
 * somewhere to go.** A picture with no alt text is a shape on a slide, and the fix
 * is to be standing in front of it — so a row has to take the reader to the slide
 * *and* select the shape.
 */
const panel = (page: Page) => page.locator('.sl-audit');
const rows = (page: Page) => page.locator('.sl-audit-list li');

const openAudit = async (page: Page) => {
  await page.locator('[data-audit]').first().click();
  await expect(panel(page)).toHaveCount(1);
};

test.describe('the deck’s own check', () => {
  test('says what it looked at when it finds nothing', async ({ page }) => {
    await openDeck(page);
    await openAudit(page);

    // A check that reports nothing has to say *what* it checked, or a reader cannot
    // tell "clean" from "not run".
    const empty = page.locator('.sl-audit-empty');
    if ((await empty.count()) > 0) {
      await expect(empty).toContainText('대체 텍스트');
    } else {
      await expect(page.locator('[data-audit-count]')).toContainText('것');
    }
  });

  test('counts the two levels apart', async ({ page }) => {
    await openDeck(page);

    // A picture with no alt text: certainly wrong, and the commonest real finding.
    const box = (await visibleBoxes(page))[0];
    await page.evaluate((sid) => {
      const editor = (window as any).editor;
      const slide = document
        .querySelector('.sl-filmstrip button[data-current="true"]')
        ?.getAttribute('data-slide');
      void editor.executeCommand('insertPicture', {
        slideId: slide,
        src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
        width: 2000,
        height: 2000
      });
      return sid;
    }, box.sid);

    await openAudit(page);
    // "3개" says nothing a reader can decide with: 고칠 것 and 볼 것 are two
    // different afternoons.
    await expect(page.locator('[data-audit-count]')).toContainText('고칠 것');
    await expect(rows(page).filter({ hasText: '고칠 것' })).not.toHaveCount(0);
  });

  /**
   * The one thing only a browser shows.
   *
   * A row is not a sentence about the deck; it is a place. So it changes the slide
   * and selects the shape, which is what makes the list something a reader works
   * through rather than reads.
   */
  test('takes the reader to the slide and the shape', async ({ page }) => {
    await openDeck(page);

    // Put something certainly wrong on a slide that is not the one showing.
    const target = await page.evaluate(() => {
      const editor = (window as any).editor;
      const store = editor.dataStore;
      const root = store.getNode(editor.getRootId());
      const slides = ((root.content ?? []) as string[]).filter(
        (sid) => store.getNode(sid)?.stype === 'surface'
      );
      const away = slides[2];
      void editor.executeCommand('insertPicture', {
        slideId: away,
        src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
        width: 2000,
        height: 2000
      });
      return away;
    });

    const started = await currentSlide(page);
    test.skip(started === target, '샘플 덱의 세 번째 장이 이미 열려 있습니다');

    await openAudit(page);
    const row = rows(page).filter({ hasText: '고칠 것' }).first();
    await expect(row).toHaveCount(1);
    await row.locator('button').click();

    await expect.poll(() => currentSlide(page)).toBe(target);
    // And the shape is selected: the reader is standing in front of the thing.
    await expect
      .poll(() => page.evaluate(() => (window as any).editor.selection?.nodeIds?.length ?? 0))
      .toBeGreaterThan(0);
  });

  test('is not drawn while presenting', async ({ page }) => {
    await openDeck(page);
    await openAudit(page);
    await expect(panel(page)).toHaveCount(1);

    // An audience is looking — the same rule the rulers, the guides, the layer list
    // and the find bar follow.
    await page.locator('[data-present]').click();
    await expect(panel(page)).toBeHidden();
  });
});
