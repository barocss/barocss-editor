import { test, expect } from '@playwright/test';
import { settled, clickText } from './helpers';

/**
 * The lab has to be trustworthy before anything it records is worth reading.
 *
 * Two ways a recording tool lies. It can move the caret when the reader reaches
 * for a button, so the recording is of somewhere else — which is why every
 * control here refuses focus, and why that is asserted rather than assumed. And
 * it can find nothing because it was looking at nothing: a verdict of "이상 없음"
 * means the same as a broken recorder unless the timeline underneath it has the
 * keystrokes in it.
 */
test.describe('the input lab', () => {
  test('records a burst without taking the caret, and judges it', async ({ page }) => {
    await page.goto('/?lab');
    await settled(page);

    await expect(page.locator('.lab')).toBeVisible();

    await clickText(page, '.w-paragraph', { nth: 1, at: 'middle' });
    const before = await page.evaluate(() => {
      const selection = (window as any).editor.selection;
      return { sid: selection.startNodeId as string, offset: selection.startOffset as number };
    });

    // Reaching for the button must not disturb what the reader selected.
    await page.locator('.lab-card', { hasText: '빠르게 열 글자 연타' }).getByRole('button', { name: '시작' }).click();
    const during = await page.evaluate(() => {
      const selection = (window as any).editor.selection;
      return { sid: selection.startNodeId as string, offset: selection.startOffset as number };
    });
    expect(during, 'pressing 시작 moved the caret').toEqual(before);

    await page.keyboard.type('abcdefghij', { delay: 0 });
    await page.waitForTimeout(600);

    const card = page.locator('.lab-card', { hasText: '빠르게 열 글자 연타' });
    await card.getByRole('button', { name: '완료' }).click();

    // A verdict appeared, and it was reached from a timeline with the typing in
    // it rather than from an empty one.
    await expect(card.locator('.lab-verdict')).toBeVisible();
    await expect(card.locator('.lab-saved')).toContainText('기록 저장');

    const report = await page.evaluate(() => (window as any).__lastLabReport);
    expect(report.announced, 'the recorder did not see what was typed').toBe('abcdefghij');
    expect(report.counts['beforeinput'], 'no keystrokes in the timeline').toBeGreaterThanOrEqual(10);
    expect(report.counts['transaction'], 'no transactions in the timeline').toBeGreaterThan(0);
    expect(report.text.after.slice(before.offset, before.offset + 10)).toBe('abcdefghij');
  });

  test('stays out of the way unless it is asked for', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await expect(page.locator('.lab')).toHaveCount(0);
    await expect(page.locator('.lab-reopen')).toHaveCount(0);
  });
});
