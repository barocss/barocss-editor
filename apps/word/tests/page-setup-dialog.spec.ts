import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { changes } from './helpers';

/**
 * **페이지 설정** — Word 의 세 번째 대화상자, 그리고 문단이 아니라 **구역**에 쓰는 첫 번째.
 *
 * `page-setup-model.test.ts` 가 산수 스물넷을 답한다. 여기서 묻는 것은 브라우저만 답할 수 있는
 * 것이다 — 메뉴가 열고, 용지를 바꾼 것이 종이의 **모양**을 바꾸고, 자리가 없는 여백에서 확인이
 * 꺼지는가.
 */

const bar = (page: Page) => page.locator('.w-menubar');

const openWord = async (page: Page) => {
  await page.goto('/');
  await page.waitForSelector('.w-toolbar');
  await page.waitForTimeout(600);
};

/** 새 문서에서 시작한다 — 샘플의 구역은 이미 무엇인가를 입고 있다. */
const newDocument = async (page: Page) => {
  await bar(page).locator('[data-menu="file"]').click();
  await page.locator('[data-menu-item="file.document.0"]').click();
  await page.locator('#editor p').first().click();
};

const openDialog = async (page: Page) => {
  await bar(page).locator('[data-menu="format"]').click();
  // 번호가 아니라 이름으로 — 서식 메뉴에 항목이 늘 때마다 번호가 밀린다.
  await page.getByRole('menuitem', { name: '페이지 설정…' }).click();
  await expect(page.getByRole('dialog')).toContainText('페이지 설정');
};

/** 종이의 모양 — 폭÷높이. 용지와 방향이 정말 닿았는지는 이것으로 보인다. */
const shape = (page: Page) =>
  page.locator('.w-surface').first().evaluate((el) => {
    const box = el.getBoundingClientRect();
    return Math.round((box.width / box.height) * 100) / 100;
  });

test.describe('페이지 설정', () => {
  test('서식 메뉴가 그것을 연다', async ({ page }) => {
    await openWord(page);
    await newDocument(page);

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await openDialog(page);
  });

  /**
   * **방향은 두 변의 관계다.** 저장된 `orientation` 이 아니라 폭과 높이가 그리는 쪽이 보는 것이고,
   * 그래서 여기서 재는 것도 종이의 모양이다.
   */
  test('가로로 바꾸면 종이가 가로가 된다', async ({ page }) => {
    await openWord(page);
    await newDocument(page);

    const { before, after } = await changes(
      () => shape(page),
      async () => {
        await openDialog(page);
        await page.locator('.w-orientation').click();
        await page.getByRole('option', { name: '가로' }).click();
        await page.locator('[data-page-apply]').click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
      },
      '종이의 모양'
    );

    expect(before).toBeLessThan(1);
    expect(after).toBeGreaterThan(1);
  });

  test('용지를 바꾸면 종이의 비율이 바뀐다', async ({ page }) => {
    await openWord(page);
    await newDocument(page);

    await changes(
      () => shape(page),
      async () => {
        await openDialog(page);
        await page.locator('.w-paper').click();
        await page.getByRole('option', { name: 'A4' }).click();
        await page.locator('[data-page-apply]').click();
      },
      'A4 의 비율'
    );
  });

  /**
   * **꺼진 단추는 이유를 말해야 한다.** `layout.ts` 가 `Math.max(1, …)` 로 방어하고 있으므로
   * 이런 문서는 사라지지 않는다 — 한 줄에 한 글자씩 수천 페이지가 된다. 그것은 사라진 문서보다
   * 나쁘고, 그래서 여기서 막는다.
   */
  test('여백이 용지보다 넓으면 확인이 꺼지고 왜 꺼졌는지 말한다', async ({ page }) => {
    await openWord(page);
    await newDocument(page);
    await openDialog(page);

    await expect(page.locator('[data-page-apply]')).toBeEnabled();

    await page.getByLabel('왼쪽 여백').fill('400');
    await page.getByLabel('왼쪽 여백').press('Enter');

    await expect(page.locator('[data-page-apply]')).toBeDisabled();
    await expect(page.locator('[data-page-room]')).toContainText('자리가 없습니다');
  });

  test('다시 열면 지금 구역이 보인다', async ({ page }) => {
    await openWord(page);
    await newDocument(page);

    await openDialog(page);
    await page.getByLabel('위 여백').fill('40');
    await page.getByLabel('위 여백').press('Enter');
    await page.locator('[data-page-apply]').click();

    await openDialog(page);
    await expect(page.getByLabel('위 여백')).toHaveValue('40');
  });
});
