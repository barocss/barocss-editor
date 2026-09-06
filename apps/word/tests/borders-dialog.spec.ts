import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * **테두리 및 음영** — Word 의 첫 대화상자.
 *
 * `border-model.test.ts` 가 산수를 답한다: 어느 변이 켜지는가, 「모두」 다음의 「상자」가 사이 선을
 * 끄는가, 끈 변에서 넷을 다 지우는가. 스물네 개가 밀리초로 돈다.
 *
 * **브라우저만 답할 수 있는 것은 셋이다** — 메뉴가 그것을 열고, 미리보기를 누른 것이 문단에 닿고,
 * 다시 열었을 때 지금 문단이 보이는가. 셋 다 편집기·명령·리액트·CSS 가 한 줄로 이어져야 참이다.
 */

const bar = (page: Page) => page.locator('.w-menubar');

const openWord = async (page: Page) => {
  await page.goto('/');
  await page.waitForSelector('.w-toolbar');
  await page.waitForTimeout(600);
};

/** 서식 › 테두리 및 음영. */
const openDialog = async (page: Page) => {
  await bar(page).locator('[data-menu="format"]').click();
  /*
   * **번호가 아니라 이름으로.** 첫 판은 `format.paragraph.0` 을 눌렀고, 서식 메뉴에 항목이 하나
   * 더 붙자 그 번호가 다른 대화상자를 가리켰다 — 두 파일에서 다섯 개가 한꺼번에 빨개졌다.
   * 메뉴에서 위치는 바뀌라고 있는 것이고, 이름은 바뀌면 알아야 하는 것이다.
   */
  await page.getByRole('menuitem', { name: '테두리 및 음영…' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
};

/**
 * **테두리 없는 문단에서 시작한다** — 새 문서의 것.
 *
 * 두 번 틀렸고 둘 다 기록해 둘 값어치가 있다.
 *
 * 첫 판은 샘플의 첫 문단에 대고 `border-top-style` 이 `solid` 인지 물었고 초록이었다. *없다*를
 * 먼저 확인하는 줄을 넣자 빨개졌다 — 샘플의 첫 문단은 이미 테두리를 입고 있었다. 단추가 아무것도
 * 안 해도 나오는 초록이었던 것이다.
 *
 * 새 문서로 옮겼는데 **여전히 `solid`** 였다. Tailwind 의 preflight 가 `*{ border: 0 solid }` 를
 * 깔기 때문이다: 이 문서의 모든 요소에서 `border-*-style` 은 언제나 `solid` 이고 두께가 `0px` 다.
 * 즉 첫 판의 단언은 문단이 아니라 **리셋 CSS** 를 확인하고 있었다.
 *
 * 그래서 묻는 것은 **두께**다. `createStarterDocument` 는 빈 문단 하나이고 테두리가 없는 것이
 * 설계이므로, 시작점은 `0px` 다.
 */
const caretInEmptyParagraph = async (page: Page) => {
  await bar(page).locator('[data-menu="file"]').click();
  await page.locator('[data-menu-item="file.document.0"]').click();

  const paragraph = page.locator('#editor p').first();
  await paragraph.click();
  // 시작점이 정말 빈 것인지 매번 확인한다 — 시작 문서가 바뀌는 날 이 검사가 먼저 말한다.
  await expect(paragraph).toHaveCSS('border-top-width', '0px');
  return paragraph;
};

test.describe('테두리 및 음영', () => {
  test('서식 메뉴가 그것을 연다 — 메뉴가 없으면 닿을 수 없는 부품이다', async ({ page }) => {
    await openWord(page);
    await caretInEmptyParagraph(page);

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await openDialog(page);
    await expect(page.getByRole('dialog')).toContainText('테두리 및 음영');
  });

  /**
   * 미리보기의 각 변이 **진짜 단추**다. `aria-label` 로 이름을 말하므로 키보드로도 같은 순서로 닿고,
   * 여기서는 그 이름으로 누른다 — 좌표가 아니라.
   */
  test('미리보기를 눌러 켠 변이 문단에 그려진다', async ({ page }) => {
    await openWord(page);
    const paragraph = await caretInEmptyParagraph(page);
    await openDialog(page);

    await page.getByRole('button', { name: '위쪽 테두리' }).click();
    await page.locator('[data-borders-apply]').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await expect(paragraph).not.toHaveCSS('border-top-width', '0px');
    // 켠 변만 — 「위쪽」 하나를 눌렀으므로 나머지 셋은 그대로여야 한다.
    await expect(paragraph).toHaveCSS('border-bottom-width', '0px');
  });

  test('「상자」는 네 변을 한 번에 그린다', async ({ page }) => {
    await openWord(page);
    const paragraph = await caretInEmptyParagraph(page);
    await openDialog(page);

    await page.locator('[data-border-preset="box"]').click();
    await page.locator('[data-borders-apply]').click();

    for (const side of ['top', 'bottom', 'left', 'right']) {
      await expect(paragraph).not.toHaveCSS(`border-${side}-width`, '0px');
    }
  });

  /**
   * **다시 열면 지금 문단을 보여 준다.**
   *
   * 지난번에 만지던 값을 들고 열리면, 다른 문단에 커서를 두고 연 독자가 자기 문단의 테두리를 보고
   * 있다고 믿는다. 덱의 크기 대화상자가 같은 이유로 같은 모양을 쓴다.
   */
  test('다시 열면 지금 문단이 보인다', async ({ page }) => {
    await openWord(page);
    await caretInEmptyParagraph(page);

    await openDialog(page);
    await page.locator('[data-border-preset="box"]').click();
    await page.locator('[data-borders-apply]').click();

    await openDialog(page);
    await expect(page.locator('[data-border-preset="box"]')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  /**
   * 취소는 **아무것도 쓰지 않는다.** 대화상자에서 만진 것은 확인을 누르기 전까지 문서가 아니다 —
   * 그것이 대화상자가 리본과 다른 점이고, 리본이 값을 받기에 나쁜 자리인 이유다.
   */
  test('취소는 문단을 그대로 둔다', async ({ page }) => {
    await openWord(page);
    const paragraph = await caretInEmptyParagraph(page);

    await openDialog(page);
    await page.locator('[data-border-preset="all"]').click();
    await page.getByRole('button', { name: '취소' }).click();

    await expect(paragraph).toHaveCSS('border-top-width', '0px');
  });
});
