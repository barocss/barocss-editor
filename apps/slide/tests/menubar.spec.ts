import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openDeck } from './helpers';

/**
 * The **menubar** — and this is the product that had already grown one without having one.
 *
 * Twelve application-level commands as equal-weight text buttons along the title bar, because there
 * was nowhere else for them: 새로 만들기 · 저장 · 열기 · 라이브러리 · 템플릿 · 크기 · 레이아웃 ·
 * 검사 · 지도 · 발표 · 스크롤 상영 · 전체 보기. A row of twelve groups nothing, prioritises nothing,
 * and does not scale — the thirteenth has to displace something.
 *
 * The buttons are still here; their retirement is its own move, because 78 checks name them. What
 * this holds is that both surfaces exist and the menu entries do what they say.
 */
const bar = (page: Page) => page.locator('.sl-menubar');

test.describe('the menubar', () => {
  test('stands beside the toolbar rather than instead of it', async ({ page }) => {
    await openDeck(page);

    await expect(bar(page).getByRole('menuitem', { name: '파일' })).toBeVisible();
    await expect(bar(page).getByRole('menuitem', { name: '슬라이드' })).toBeVisible();
    // And the toolbar, which holds what acts on the selection.
    await expect(page.locator('[data-control="bold"]')).toBeVisible();
  });

  test('teaches the shortcuts, which had only a tooltip', async ({ page }) => {
    await openDeck(page);
    await bar(page).locator('[data-menu="edit"]').click();

    await expect(page.locator('[data-menu-item="edit.history.0"]')).toContainText('⌘Z');
    await expect(page.locator('[data-menu-item="edit.slides.0"]')).toContainText('⌘M');
  });

  test('opens the deck’s own dialogs, which were three of the twelve buttons', async ({ page }) => {
    await openDeck(page);
    await bar(page).locator('[data-menu="slide"]').click();
    await page.locator('[data-menu-item="slide.setup.0"]').click();
    await page.waitForTimeout(400);

    await expect(page.locator('[role="dialog"]')).toBeVisible();
  });

  test('shows a pane, which is a view rather than a command', async ({ page }) => {
    await openDeck(page);
    await bar(page).locator('[data-menu="view"]').click();
    await page.locator('[data-menu-item="view.panes.0"]').click();
    await page.waitForTimeout(400);

    /*
     * Whether the audit pane is up is not a fact about the deck, so it is not a command — an entry
     * that declared one would be telling the harness something exists that does not.
     */
    await expect(page.locator('.sl-audit')).toHaveCount(1);
  });

  test('makes a slide, which is a command and greys when it cannot', async ({ page }) => {
    await openDeck(page);
    const before = await page.locator('.sl-filmstrip button').count();

    await bar(page).locator('[data-menu="edit"]').click();
    await expect(page.locator('[data-menu-item="edit.slides.0"]')).toBeEnabled();
    await page.locator('[data-menu-item="edit.slides.0"]').click();
    await page.waitForTimeout(600);

    expect(await page.locator('.sl-filmstrip button').count()).toBe(before + 1);
  });

  test('acts on the slide the reader is looking at', async ({ page }) => {
    await openDeck(page);
    /*
     * `needs: 'slide'` is the model asking for something only the app knows — the document has no
     * notion of a current slide. Without it 슬라이드 복제 answers `canExecute` against nothing and
     * is greyed forever, which is the shape of dead menu entry the site builder found first.
     */
    await page.locator('.sl-filmstrip button').nth(2).click();
    await page.waitForTimeout(400);
    const before = await page.locator('.sl-filmstrip button').count();

    await bar(page).locator('[data-menu="edit"]').click();
    await expect(page.locator('[data-menu-item="edit.slides.1"]')).toBeEnabled();
    await page.locator('[data-menu-item="edit.slides.1"]').click();
    await page.waitForTimeout(600);

    expect(await page.locator('.sl-filmstrip button').count()).toBe(before + 1);
  });
});

/**
 * **Naming a slide** — the one thing the sample writes and the product could not.
 *
 * `sample-deck.ts` gives every slide a `name` in TypeScript — *Title*, *Shapes*, *Table* — and
 * `nameOf` falls back to the title placeholder for a slide with none. Between them the filmstrip
 * always said *something*, which is exactly why nobody noticed that a reader could not write one.
 * The same finding this backlog has had about a site's pages and a component's name: the thing
 * exists because a sample file said so.
 *
 * It matters because four surfaces list slides by name — the filmstrip, the map, the audit and the
 * 누르면 → 이 슬라이드로 picker — so a slide whose only content is a picture is nameless in all four,
 * and the reader looking at the map to find where a button goes is shown a blank.
 */
test.describe('naming a slide', () => {
  test('renames it where the names are read', async ({ page }) => {
    await openDeck(page);

    const row = page.locator('.sl-filmstrip li').nth(1);
    const sid = await row.locator('[data-slide]').getAttribute('data-slide');
    await row.locator('[data-slide]').dblclick();
    await page.waitForTimeout(300);

    const field = page.locator('.sl-filmstrip input').first();
    await expect(field).toHaveCount(1);
    await field.fill('예산 이야기');
    await field.press('Enter');
    await page.waitForTimeout(600);

    await expect(row).toContainText('예산 이야기');
    expect(
      await page.evaluate((one) => (window as any).editor.dataStore.getNode(one)?.attributes?.name, sid)
    ).toBe('예산 이야기');
  });

  test('an emptied name goes back to the title, rather than becoming a blank row', async ({ page }) => {
    await openDeck(page);

    const row = page.locator('.sl-filmstrip li').nth(1);
    const sid = await row.locator('[data-slide]').getAttribute('data-slide');
    await row.locator('[data-slide]').dblclick();
    const field = page.locator('.sl-filmstrip input').first();
    await field.fill('');
    await field.press('Enter');
    await page.waitForTimeout(600);

    /*
     * Empty is **removal**, not an empty name: a slide called "" would sit in the filmstrip as a
     * blank row that the title fallback can no longer fill, which is worse than the fallback.
     */
    expect(
      await page.evaluate((one) => (window as any).editor.dataStore.getNode(one)?.attributes?.name, sid)
    ).toBeUndefined();
    await expect(row).not.toHaveText('');
  });
});
