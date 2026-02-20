import { test, expect, type Page } from '@playwright/test';

const editorContentSelector = '[data-bc-layer="content"], [data-testid="editor-content"]';

async function waitForEditorReady(page: Page): Promise<void> {
  await page.goto('/');
  const content = page.locator(editorContentSelector).first();
  await expect(content).toBeVisible();
  await page.waitForTimeout(250);
}

async function focusFirstParagraph(page: Page): Promise<void> {
  const content = page.locator(editorContentSelector).first();
  const firstParagraph = content.locator('[data-bc-stype="paragraph"]').first();
  await firstParagraph.click();
  await page.waitForTimeout(50);
  await page.evaluate(() => {
    const inline = document.querySelector(
      '[data-bc-layer="content"] [data-bc-stype="paragraph"] [data-bc-stype="inline-text"]'
    ) as HTMLElement | null;
    if (!inline) return;
    const textNode = inline.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;

    const range = document.createRange();
    range.setStart(textNode, textNode.textContent?.length ?? 0);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
}

async function dispatchCompositionEvent(page: Page, type: 'compositionstart' | 'compositionend' | 'compositionupdate'): Promise<void> {
  await page.evaluate((eventType: string) => {
    const content = document.querySelector('[data-bc-layer="content"]') as HTMLElement | null;
    if (!content) return;
    const event = new CompositionEvent(eventType, {
      bubbles: true,
      cancelable: true,
      data: 'あ',
    });
    content.dispatchEvent(event);
  }, type);
}

async function dispatchCompositionKeydown229(page: Page): Promise<void> {
  await page.evaluate(() => {
    const content = document.querySelector('[data-bc-layer="content"]') as HTMLElement | null;
    if (!content) return;
    const event = new KeyboardEvent('keydown', {
      key: 'Unidentified',
      code: 'Unidentified',
      keyCode: 229,
      which: 229,
      bubbles: true,
      cancelable: true,
    });
    content.dispatchEvent(event);
  });
}

async function setFirstInlineText(page: Page, text: string): Promise<void> {
  await page.evaluate((value: string) => {
    const inline = document.querySelector(
      '[data-bc-layer="content"] [data-bc-stype="paragraph"] [data-bc-stype="inline-text"]'
    ) as HTMLElement | null;
    if (!inline) return;
    if (!inline.firstChild || inline.firstChild.nodeType !== Node.TEXT_NODE) {
      inline.textContent = value;
      return;
    }
    inline.firstChild.textContent = value;
  }, text);
}

async function getReplaceTextFlowCount(page: Page): Promise<number> {
  const texts = await page.locator('#barocss-devtool .flow-span').allTextContents();
  return texts.filter((text) => text.includes('"command":"replaceText"') || text.includes('replaceText')).length;
}

test.describe('React Editor – IME composition flow (editor-react)', () => {
  test('모델 동기화는 compositionend에서만 replaceText가 1회 발생해야 함', async ({ page }) => {
    await waitForEditorReady(page);
    await focusFirstParagraph(page);

    const baseFlowCount = await getReplaceTextFlowCount(page);
    const markerText = 'IME_COMPOSITION_FLOW_OK';

    await dispatchCompositionEvent(page, 'compositionstart');
    await setFirstInlineText(page, markerText);

    await expect(page.locator(editorContentSelector).first().locator('[data-bc-stype="paragraph"]').first())
      .toContainText(markerText, { timeout: 5000 });

    const whileComposingCount = await getReplaceTextFlowCount(page);
    expect(whileComposingCount).toBe(baseFlowCount);

    await dispatchCompositionEvent(page, 'compositionend');
    await page.waitForTimeout(500);

    const afterCompositionCount = await getReplaceTextFlowCount(page);
    expect(afterCompositionCount).toBeGreaterThan(baseFlowCount);
    await expect(page.locator(editorContentSelector).first().locator('[data-bc-stype="paragraph"]').first())
      .toContainText(markerText);
  });

  test('IME 후보입력 229 윈도우에서 최초 변경은 무시되고 창이 지난 뒤 한 번 동기화되어야 함', async ({ page }) => {
    await waitForEditorReady(page);
    await focusFirstParagraph(page);

    const baseFlowCount = await getReplaceTextFlowCount(page);

    await dispatchCompositionKeydown229(page);
    await setFirstInlineText(page, 'ime-window-first');

    await page.waitForTimeout(100);
    const countDuringWindow = await getReplaceTextFlowCount(page);
    expect(countDuringWindow).toBe(baseFlowCount);

    await page.waitForTimeout(80);
    await setFirstInlineText(page, 'ime-window-second');

    await page.waitForTimeout(300);
    const finalFlowCount = await getReplaceTextFlowCount(page);
    expect(finalFlowCount).toBeGreaterThan(baseFlowCount);

    await expect(page.locator(editorContentSelector).first().locator('[data-bc-stype="paragraph"]').first())
      .toContainText('ime-window-second');
  });
});
