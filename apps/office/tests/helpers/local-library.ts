import { expect, type Page } from '@playwright/test';

/** Reach the existing local document library through the project-first entry. */
export async function openLocalLibrary(page: Page) {
  const home = page.locator('.ow-project-home');
  const heading = page.getByRole('heading', { name: '전체 자료', exact: true });
  await expect.poll(async () => await home.isVisible() || await heading.isVisible()).toBe(true);
  if (await home.isVisible()) await page.getByRole('button', { name: '자료함', exact: true }).click();
  await expect(heading).toBeVisible();
}
