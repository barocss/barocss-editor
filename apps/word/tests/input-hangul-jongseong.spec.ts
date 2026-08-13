import { test, expect } from '@playwright/test';
import { settled } from './helpers';

/**
 * The one thing Korean does that no other composition does.
 *
 * Every composition measured here so far grew: jamo were added, a syllable was
 * assembled, it was committed, and the next one started from nothing. Korean
 * does not only do that. A final consonant belongs to the syllable it was typed
 * into until a vowel arrives, and then it leaves — it becomes the *first*
 * consonant of the next syllable, and the syllable it left gets shorter.
 *
 * Typing ㅇ ㅣ ㅆ gives 있. Typing a ㅓ after it does not give 있 followed by
 * anything: it gives 이 써. The text already committed is replaced by something
 * shorter, and a new composition starts in the space that opened up. That is a
 * commit that *shrinks* what is on the page, and nothing in this suite has ever
 * asked the editor to survive one.
 *
 * The two words below differ by one keystroke and are the whole test:
 *
 *   ㅇ ㅣ ㅆ ㅇ ㅓ  →  있어   (the ㅆ stays; a new syllable starts beside it)
 *   ㅇ ㅣ ㅆ ㅓ    →  이써   (the ㅆ migrates; 있 becomes 이)
 *
 * Get the second one wrong by dropping the shortening commit and 이써 comes back
 * as 있써 — a consonant written twice. Get it wrong by dropping the new
 * composition and it comes back as 이.
 */

const caret = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const editor = (window as any).editor;
    const sid = editor.selection?.startNodeId;
    const el = document.querySelector(`[data-bc-sid="${CSS.escape(sid)}"]`);
    return {
      offset: editor.selection?.startOffset as number,
      model: (editor.dataStore.getNode(sid)?.text ?? '') as string,
      dom: (el?.textContent ?? '').replace(/﻿/g, '')
    };
  });

const clickIntoParagraph = async (page: import('@playwright/test').Page) => {
  const point = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.w-paragraph')][1];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const node = walker.nextNode()!;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = [...range.getClientRects()][0];
    return { x: rect.left + rect.width * 0.35, y: rect.top + rect.height / 2 };
  });
  await page.mouse.click(point.x, point.y);
  await expect
    .poll(() => page.evaluate(() => (window as any).editor?.selection?.startNodeId ?? null))
    .not.toBeNull();
};

/**
 * One step of a Korean IME: either the composing text changed, or the composing
 * text was committed — and a commit may be shorter than what was being composed,
 * which is the case this file exists for.
 */
type Step = { compose: string } | { commit: string };

const run = async (cdp: any, steps: Step[], settle = 45) => {
  for (const step of steps) {
    if ('compose' in step) {
      await cdp.send('Input.imeSetComposition', {
        text: step.compose,
        selectionStart: step.compose.length,
        selectionEnd: step.compose.length
      });
    } else {
      await cdp.send('Input.insertText', { text: step.commit });
    }
    await new Promise((resolve) => setTimeout(resolve, settle));
  }
  await new Promise((resolve) => setTimeout(resolve, 350));
};

test.describe('a final consonant that moves to the next syllable', () => {
  test('ㅇㅣㅆㅇㅓ stays as 있어', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);
    const cdp = await page.context().newCDPSession(page);
    const at = (await caret(page)).offset;

    await run(cdp, [
      { compose: 'ㅇ' },
      { compose: '이' },
      { compose: '있' },
      { commit: '있' },
      { compose: 'ㅇ' },
      { compose: '어' },
      { commit: '어' }
    ]);

    await expect.poll(async () => (await caret(page)).model.slice(at, at + 2), { timeout: 8000 }).toBe('있어');
    const after = await caret(page);
    expect(after.dom, '화면과 문서가 다릅니다').toBe(after.model);
  });

  test('ㅇㅣㅆㅓ becomes 이써, and 있 does not survive beside it', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);
    const cdp = await page.context().newCDPSession(page);
    const at = (await caret(page)).offset;

    // The ㅆ is typed into 이, making 있 — and then the ㅓ takes it away again.
    // The commit here is one character where the composition was one character,
    // but it is a *different* character: 있 becomes 이.
    await run(cdp, [
      { compose: 'ㅇ' },
      { compose: '이' },
      { compose: '있' },
      { commit: '이' },
      { compose: 'ㅆ' },
      { compose: '써' },
      { commit: '써' }
    ]);

    await expect.poll(async () => (await caret(page)).model.slice(at, at + 2), { timeout: 8000 }).toBe('이써');
    const after = await caret(page);
    expect(after.model.slice(at, at + 3), '받침이 옮겨간 뒤에도 있이 남았습니다').not.toContain('있');
    expect(after.dom, '화면과 문서가 다릅니다').toBe(after.model);
  });

  test('a whole word carries its consonants across every boundary', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await clickIntoParagraph(page);
    const cdp = await page.context().newCDPSession(page);
    const at = (await caret(page)).offset;

    // 문제가 — three syllables, two of which end in a consonant that has to stay
    // put while the next syllable starts, which is the same decision made three
    // times in a row and the shape a sentence is made of.
    await run(cdp, [
      { compose: 'ㅁ' },
      { compose: '무' },
      { compose: '문' },
      { commit: '문' },
      { compose: 'ㅈ' },
      { compose: '제' },
      { commit: '제' },
      { compose: 'ㄱ' },
      { compose: '가' },
      { commit: '가' }
    ]);

    await expect.poll(async () => (await caret(page)).model.slice(at, at + 3), { timeout: 8000 }).toBe('문제가');
    const after = await caret(page);
    expect(after.dom, '화면과 문서가 다릅니다').toBe(after.model);
  });
});
