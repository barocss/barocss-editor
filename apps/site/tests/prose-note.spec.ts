import { expect, test } from '@playwright/test';
import { checkTrailingSpaceEditing } from '../../../test-support/prose-input';

test('embedded prose controls and last input survive closing and reopening a Site row', async ({ page }) => {
  // Make close responsible for delivery instead of accidentally waiting for the idle flush.
  await page.addInitScript(() => {
    const schedule = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) =>
      schedule(handler, delay === 350 ? 60_000 : delay, ...args)) as typeof window.setTimeout;
  });
  await page.goto('/');
  await expect(page.locator('[data-admin-page]').first()).toBeVisible();

  const prepared = await page.evaluate(async () => {
    const editor = (window as unknown as { editor: any }).editor;
    const store = editor.dataStore;
    const root = store.getNode(editor.getRootId());
    const resources = (root.content as string[]).map(sid => store.getNode(sid))
      .find(node => node?.stype === 'resources');
    const body = (resources?.content as string[] ?? []).map(sid => store.getNode(sid))
      .find(node => node?.stype === 'richText' && node.attributes?.id === '본문-스택');
    if (!body) throw new Error('The first sample row must have a named rich-text body');
    return editor.executeCommand('setRichText', {
      nodeId: body.sid,
      blocks: [
        { stype: 'taskItem', attributes: { checked: false }, content: [{ stype: 'inline-text', text: '검토 마무리' }] },
        { stype: 'bDetails', attributes: { open: true }, content: [
          { stype: 'bSummary', content: [{ stype: 'inline-text', text: '회의 결정' }] },
          { stype: 'callout', attributes: { type: 'warning', title: '확인 사항' }, content: [
            { stype: 'paragraph', content: [{ stype: 'inline-text', text: '최종 입력을 보존한다' }] }
          ] }
        ] }
      ]
    });
  });
  expect(prepared).toBe(true);
  await page.locator('[data-admin-tab="data"]').click();
  await page.locator('[data-admin-open]').last().click();
  await page.locator('[data-row-open]').first().click();

  const body = page.locator('[data-row-form] [data-field="본문"] [data-note-body]');
  const summaryField = page.locator('[data-row-form] [data-field="요약"] [data-note-body]');
  const unchangedSummary = await summaryField.innerText();
  const checkbox = body.locator('[data-checklist-toggle]');
  const details = body.locator('details.w-details');
  await expect(checkbox).toHaveAttribute('aria-checked', 'false');
  await expect(details).toHaveAttribute('open', 'true');
  await expect(body.locator('.w-callout-title')).toHaveText('확인 사항');
  await checkTrailingSpaceEditing(page, body.locator('.w-callout p'), '최종 입력을 보존한다');

  const marker = ' 그리고 바로 닫는다';
  await body.locator('.w-callout p').click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(marker);
  await expect(body.locator('.w-callout')).toContainText(marker);
  await checkbox.click();
  await expect(checkbox).toHaveAttribute('aria-checked', 'true');
  // Native toggle notifications are queued; closing a row may unmount its listener first.
  // The disclosure click must persist without depending on that later notification.
  await page.evaluate(() => document.addEventListener('toggle', event => {
    if (event.target instanceof HTMLDetailsElement) event.stopImmediatePropagation();
  }, true));
  // Press the native disclosure marker, leaving summary text available for normal editing.
  await body.locator('summary.w-summary').click({ position: { x: 5, y: 10 } });
  await expect(details).not.toHaveAttribute('open');

  const hostState = () => page.evaluate(() => {
    const editor = (window as unknown as { editor: any }).editor;
    const find = (node: any): any => {
      if (node?.stype === 'richText' && node.attributes?.id === '본문-스택') return node;
      for (const child of node?.content ?? []) {
        const result = find(child);
        if (result) return result;
      }
    };
    const richText = find(editor.exportDocument());
    return {
      checked: richText?.content?.[0]?.attributes?.checked,
      open: richText?.content?.[1]?.attributes?.open,
      serialized: JSON.stringify(richText)
    };
  });
  expect(await hostState()).toMatchObject({ checked: false, open: true });
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-row-form]')).toHaveCount(0);
  await expect.poll(hostState).toMatchObject({ checked: true, open: false });
  expect((await hostState()).serialized).toContain(marker);

  await page.locator('[data-row-open]').first().click();
  await expect(checkbox).toHaveAttribute('aria-checked', 'true');
  await expect(details).not.toHaveAttribute('open');
  await expect(summaryField).toHaveText(unchangedSummary);
  await body.locator('summary.w-summary').click({ position: { x: 5, y: 10 } });
  await expect(details).toHaveAttribute('open');
  await expect(body.locator('.w-callout')).toHaveAttribute('data-callout-type', 'warning');
  await expect(body.locator('.w-callout-title')).toHaveText('확인 사항');
  await expect(body.locator('.w-callout p')).toContainText(marker);

  // Focused disclosure keys must commit the same state before the page is closed.
  await body.locator('summary.w-summary').focus();
  await expect(body.locator('summary.w-summary')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(details).not.toHaveAttribute('open');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-row-form]')).toHaveCount(0);
  await expect.poll(hostState).toMatchObject({ checked: true, open: false });
  await page.locator('[data-row-open]').first().click();
  await body.locator('summary.w-summary').focus();
  await page.keyboard.press('Enter');
  await expect(details).toHaveAttribute('open');
  await page.keyboard.press('Escape');
  await expect.poll(hostState).toMatchObject({ checked: true, open: true });
});
