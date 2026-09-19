import { test, expect } from '@playwright/test';
import { placeCaret } from './helpers';

for (const width of [1280, 820]) {
  test(`Word icons stay aligned across tabs at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await placeCaret(page, '.w-paragraph');
    const tabs = page.getByRole('tablist', { name: '도구 모음 선택' });
    for (const name of ['홈', '삽입', '레이아웃', '참조', '검토', '보기']) {
      await tabs.getByRole('tab', { name, exact: true }).click();
      const toolbar = page.getByRole('toolbar', { name: '문서 편집 도구' });
      const misplaced = await toolbar.locator('[data-control] > svg').evaluateAll(icons => icons.flatMap(icon => {
        const rect = icon.getBoundingClientRect(), button = icon.parentElement!.getBoundingClientRect();
        const labeled = icon.parentElement!.classList.contains('office-ribbon-action') && getComputedStyle(icon.parentElement!).flexDirection === 'column';
        const size = labeled ? 22 : 16;
        // A horizontal icon + label is centered as a group, not as an icon alone.
        const contents = [...icon.parentElement!.childNodes].flatMap(node => {
          if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) return [];
          const range = document.createRange(); range.selectNode(node);
          return [...range.getClientRects()].filter(r => r.width && r.height);
        });
        const centerX = !labeled && contents.length
          ? (Math.min(...contents.map(r => r.left)) + Math.max(...contents.map(r => r.right))) / 2
          : rect.x + rect.width / 2;
        const dx = Math.abs(centerX - button.x - button.width / 2);
        const dy = Math.abs(rect.y + rect.height / 2 - button.y - button.height / 2);
        return dx > 1 || (!labeled && dy > 1) || rect.width !== size || rect.height !== size ? [{ label: icon.parentElement!.getAttribute('aria-label'), dx, dy, width: rect.width }] : [];
      }));
      expect(misplaced).toEqual([]);
      const outside = await toolbar.locator('button').evaluateAll(buttons => buttons.filter(button => {
        const r = button.getBoundingClientRect(); return r.width && (r.x < 0 || r.right > innerWidth);
      }).map(button => button.getAttribute('aria-label')));
      expect(outside).toEqual([]);
      const splitGroups = await toolbar.locator('[data-group]').evaluateAll(groups => groups.filter(group => {
        const items = [...group.querySelectorAll('button, [role=separator]')].map(el => el.getBoundingClientRect());
        // Compact ribbons deliberately stack the history group vertically.
        const vertical = getComputedStyle(group).flexDirection === 'column';
        const center = (r: DOMRect) => vertical ? r.x + r.width / 2 : r.y + r.height / 2;
        return items.some(r => Math.abs(center(r) - center(items[0])) > 1);
      }).map(group => group.getAttribute('data-group')));
      expect(splitGroups).toEqual([]);
      await page.screenshot({ animations: 'disabled', path: info.outputPath(`word-${name}-${width}.png`) });
    }
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      const left = page.getByRole('button', { name: '개요 열기', exact: true });
      const right = page.getByRole('button', { name: '댓글 열기', exact: true });
      const a = (await left.boundingBox())!, b = (await right.boundingBox())!;
      expect(a.y).toBe(b.y);
      expect([a.width, a.height, b.width, b.height]).toEqual([30, 30, 30, 30]);
      for (const button of [left, right]) {
        const icon = (await button.locator('svg').boundingBox())!;
        const box = (await button.boundingBox())!;
        expect(Math.abs(icon.x + icon.width / 2 - box.x - box.width / 2)).toBeLessThanOrEqual(1);
        expect(Math.abs(icon.y + icon.height / 2 - box.y - box.height / 2)).toBeLessThanOrEqual(1);
        await button.hover();
        await expect(page.locator('[data-office-tooltip]')).toBeVisible();
        const tip = (await page.locator('[data-office-tooltip]').boundingBox())!;
        expect(tip.x).toBeGreaterThanOrEqual(0);
        expect(tip.x + tip.width).toBeLessThanOrEqual(width);
        // Move through the tooltip grace area, as a physical pointer does.
        await page.mouse.move(width / 2, 700, { steps: 10 });
        await expect(page.locator('[data-office-tooltip]')).not.toBeVisible();
      }
    }
    await page.getByRole('button', { name: '개요 열기', exact: true }).click();
    await expect(page.getByRole('navigation', { name: '문서 개요' })).toBeVisible();
    await page.getByRole('button', { name: '개요 닫기', exact: true }).click();
    await page.getByRole('button', { name: '댓글 열기', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Comments', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '댓글 닫기', exact: true }).click();
    await tabs.getByRole('tab', { name: '홈', exact: true }).click();
    await page.evaluate(() => document.documentElement.dataset.theme = 'light');
    await expect(page.locator('.w-toolbar')).toHaveCSS('color', 'rgb(23, 23, 23)');
    await page.screenshot({ animations: 'disabled', path: info.outputPath(`word-final-${width}.png`) });
  });
}
