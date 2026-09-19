import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { changes } from './helpers';

/**
 * **문단 간격** — Word 의 두 번째 대화상자.
 *
 * `spacing-model.test.ts` 가 산수 열여덟 개를 답한다: 규칙을 바꿀 때 숫자를 옮기는 것, 24pt 글에서
 * 1.5줄이 720트윕인 것, 혼합을 쓰지 않는 것.
 *
 * 여기서 묻는 것은 브라우저만 답할 수 있는 것이다 — 메뉴가 열고, 적용한 값이 문단에 닿고, 취소가
 * 아무것도 남기지 않는가.
 */

const bar = (page: Page) => page.locator('.w-menubar');

const openWord = async (page: Page) => {
  await page.goto('/?sample');
  await page.waitForSelector('.w-toolbar');
  await page.waitForTimeout(600);
};

/**
 * 새 문서의 **두 번째** 문단에서 시작한다.
 *
 * 두 가지를 피한다.
 *
 * 하나는 테두리 검사가 값을 치르고 배운 것 — 샘플의 첫 문단은 이미 서식을 입고 있어서, 거기서
 * 시작하면 단추가 아무것도 안 해도 초록이 나온다. 그래서 새 문서다.
 *
 * 다른 하나는 새 문서에서도 걸린 것이다. 새 문서의 첫 문단은 `margin-top: 96px` 을 갖고 있었고,
 * 그것은 서식이 아니라 **페이지네이션**이다: `block-style.ts:169` 가 *페이지를 여는 블록*을 시트에
 * 닿도록 밀어 내리면서 `marginTop` 을 덮어쓴다(`getBlockPush`). 그래서 페이지 맨 위 문단에서는
 * 문단 앞 간격이 화면에 나타나지 않는다 — Word 도 페이지 맨 위에서는 앞 간격을 죽이므로 결과는
 * 같지만, **여기서 그것을 재면 대화상자가 아니라 페이지네이션을 재게 된다.**
 *
 * 그래서 Enter 를 한 번 눌러 페이지를 열지 않는 문단을 만든다.
 */
const caretInEmptyParagraph = async (page: Page) => {
  await bar(page).locator('[data-menu="file"]').click();
  await page.locator('[data-menu-item="file.document.0"]').click();

  const first = page.locator('#editor p').first();
  await first.click();
  // 빈 문단에서의 Enter 는 나누는 것이 아니다 — 나눌 글자가 있어야 두 번째 문단이 생긴다.
  await page.keyboard.type('가');
  await page.keyboard.press('Enter');
  await page.keyboard.type('나');

  const paragraph = page.locator('#editor p').nth(1);
  await expect(paragraph).toHaveText('나');
  await expect(paragraph).toHaveCSS('margin-top', '0px');
  return paragraph;
};

const openDialog = async (page: Page) => {
  await bar(page).locator('[data-menu="format"]').click();
  /*
   * **번호가 아니라 이름으로.** 첫 판은 `format.paragraph.0` 을 눌렀고, 서식 메뉴에 항목이 하나
   * 더 붙자 그 번호가 다른 대화상자를 가리켰다 — 두 파일에서 다섯 개가 한꺼번에 빨개졌다.
   * 메뉴에서 위치는 바뀌라고 있는 것이고, 이름은 바뀌면 알아야 하는 것이다.
   */
  await page.getByRole('menuitem', { name: '문단 간격…' }).click();
  await expect(page.getByRole('dialog')).toContainText('문단 간격');
};

test.describe('문단 간격', () => {
  test('서식 메뉴가 그것을 연다', async ({ page }) => {
    await openWord(page);
    await caretInEmptyParagraph(page);

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await openDialog(page);
  });

  test('문단 앞뒤 간격이 문단에 닿는다', async ({ page }) => {
    await openWord(page);
    const paragraph = await caretInEmptyParagraph(page);
    await openDialog(page);

    await page.getByLabel('문단 앞 간격').fill('12');
    await page.getByLabel('문단 앞 간격').press('Enter');
    await page.locator('[data-spacing-apply]').click();

    // 12pt = 240트윕 = 16px (96dpi 에서 1pt = 4/3px).
    await expect(paragraph).toHaveCSS('margin-top', '16px');
  });

  /**
   * **규칙과 값은 함께 쓰인다.** 하나만 쓰면 남은 하나가 옛 단위로 읽혀 문단이 열두 배가 된다 —
   * 모델이 막고 있는 것이고, 여기서는 그 결과가 화면에 맞게 나오는지 본다.
   */
  test('2줄을 고르면 줄 높이가 커진다', async ({ page }) => {
    await openWord(page);
    const paragraph = await caretInEmptyParagraph(page);
    const lineHeight = () => paragraph.evaluate((el) => getComputedStyle(el).lineHeight);

    /*
     * `changes` 가 **바뀌었는지**를 세운다 — 손으로 쓰는 대신. 대화상자 둘을 만드는 동안 다섯 번
     * 헛돌았고 넷은 초록으로 지나갔다. `helpers.ts` 에 그 다섯이 적혀 있다.
     */
    const { before, after } = await changes(lineHeight, async () => {
      await openDialog(page);
      /*
       * 트리거를 누르고 항목을 누른다 — `ChoiceSelect` 는 Radix 의 select 이지 네이티브가 아니라서
       * `selectOption` 이 고를 것을 못 찾는다. 덱의 `layout-arrange.spec.ts` 가 같은 길을 간다.
       */
      await page.locator('.w-line-preset').click();
      /*
       * **1.5줄이 아니라 2줄.** 처음엔 1.5줄로 물었고 값이 안 변했다 — 이 문단의 줄 높이가 이미
       * 24px, 즉 글꼴 크기의 1.5배였다.
       */
      await page.getByRole('option', { name: '2줄' }).click();
      await page.locator('[data-spacing-apply]').click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }, '줄 높이');

    expect(parseFloat(after)).toBeGreaterThan(parseFloat(before));
  });

  test('취소는 문단을 그대로 둔다', async ({ page }) => {
    await openWord(page);
    const paragraph = await caretInEmptyParagraph(page);
    await openDialog(page);

    await page.getByLabel('문단 앞 간격').fill('24');
    await page.getByLabel('문단 앞 간격').press('Enter');
    await page.getByRole('button', { name: '취소' }).click();

    await expect(paragraph).toHaveCSS('margin-top', '0px');
  });

  test('다시 열면 지금 문단이 보인다', async ({ page }) => {
    await openWord(page);
    await caretInEmptyParagraph(page);

    await openDialog(page);
    await page.getByLabel('문단 뒤 간격').fill('18');
    await page.getByLabel('문단 뒤 간격').press('Enter');
    await page.locator('[data-spacing-apply]').click();

    await openDialog(page);
    await expect(page.getByLabel('문단 뒤 간격')).toHaveValue('18');
  });
});
