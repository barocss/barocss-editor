import { expect, test, type FrameLocator, type Locator, type Page } from '@playwright/test';
import type { ScenarioSnapshot } from '../../src/scenario-main';

type Surface = Page | FrameLocator;
type Block = { stype: string; text?: string; content?: Block[] };

async function openScenario(page: Page, host: string, fixture: string): Promise<Surface> {
  await page.goto(`/scenarios.html?host=${host}&case=${fixture}`);
  const surface = host === 'embedded' ? page.frameLocator('iframe') : page;
  await expect(surface.locator('.on-doc')).toBeVisible();
  return surface;
}

async function snapshot(surface: Surface): Promise<ScenarioSnapshot> {
  return surface.getByTestId('note-scenario').evaluate(element => {
    const read = element.ownerDocument.defaultView?.readNoteScenario;
    if (!read) throw new Error('Note scenario diagnostics are not ready');
    return read();
  });
}

async function blocks(surface: Surface): Promise<Block[]> {
  const state = await snapshot(surface);
  return (state.document as { content: Block[] }).content;
}

async function expectInsideScroller(item: Locator) {
  await expect.poll(() => item.evaluate(element => {
    const panel = element.closest('[data-floating-surface]');
    if (!panel) throw new Error('Missing menu scroll container');
    const row = element.getBoundingClientRect();
    const menu = panel.getBoundingClientRect();
    return row.top >= menu.top - 1 && row.bottom <= menu.bottom + 1;
  }), { message: 'The keyboard-selected item must be visible inside the menu scroll container' }).toBe(true);
}

for (const host of ['standalone', 'embedded']) {
  test.describe(host, () => {
    test.afterEach(async ({ page }, info) => {
      if (info.status === info.expectedStatus) return;
      const surface = host === 'embedded' ? page.frameLocator('iframe') : page;
      try {
        await info.attach('note-state', {
          body: JSON.stringify(await snapshot(surface), null, 2), contentType: 'application/json',
        });
      } catch (error) {
        await info.attach('diagnostic-error', { body: String(error), contentType: 'text/plain' });
      }
    });

    test('N-001 typing, trailing spaces and Backspace @smoke', async ({ page }) => {
      const surface = await openScenario(page, host, 'empty');
      await surface.locator('.on-doc > p').click();
      await page.keyboard.type('Hello  X');
      await expect(surface.locator('.on-doc > p')).toHaveText('Hello  X', { useInnerText: false });
      await page.keyboard.press('Backspace');
      await expect.poll(() => surface.locator('.on-doc > p').textContent()).toBe('Hello  ');
      await page.keyboard.type('Y');
      await expect.poll(() => surface.locator('.on-doc > p').textContent()).toBe('Hello  Y');
      expect((await blocks(surface)).map(block => block.stype)).toEqual(['paragraph']);
    });

    test('N-002 slash Escape does not reopen on caret movement @smoke', async ({ page }) => {
      const surface = await openScenario(page, host, 'empty');
      await surface.locator('.on-doc > p').click();
      await page.keyboard.type('/');
      await expect(surface.locator('[data-slash-item]').first()).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(surface.locator('[data-slash-item]')).toHaveCount(0);
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowRight');
      await expect(surface.locator('[data-slash-item]')).toHaveCount(0);
      await expect(surface.locator('.on-doc > p')).toHaveText('/');
    });

    test('N-278 slash keyboard selection scrolls into view @regression', async ({ page }) => {
      test.info().annotations.push({ type: 'issue', description: 'https://github.com/barocss/barocss-editor/issues/278' });
      const surface = await openScenario(page, host, 'empty');
      await surface.locator('.on-doc > p').click();
      await page.keyboard.type('/');
      const rows = surface.locator('[data-slash-item]');
      await expect(rows.first()).toBeVisible();
      const caret = (await snapshot(surface)).selection;
      const scroll = await surface.getByTestId('note-scenario').evaluate(el => el.ownerDocument.defaultView!.scrollY);
      const count = await rows.count();
      expect(count).toBeGreaterThan(5);
      expect(await rows.first().evaluate(item => {
        const panel = item.closest('[data-floating-surface]')!;
        return panel.scrollHeight > panel.clientHeight;
      }), 'The fixture must overflow to exercise scrolling').toBe(true);
      for (let index = 1; index < count; index++) await page.keyboard.press('ArrowDown');
      await expect(rows.nth(count - 1)).toHaveAttribute('data-current', 'true');
      await expectInsideScroller(rows.nth(count - 1));
      for (let index = 1; index < count; index++) await page.keyboard.press('ArrowUp');
      await expectInsideScroller(rows.first());
      expect((await snapshot(surface)).selection).toEqual(caret);
      expect(await surface.getByTestId('note-scenario').evaluate(el => el.ownerDocument.defaultView!.scrollY)).toBe(scroll);
      await page.keyboard.insertText('제목');
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toHaveAttribute('data-current', 'true');
      await expectInsideScroller(rows.first());
    });

    test('N-279 pointer can reach the add menu outside the short editor @regression', async ({ page }) => {
      test.info().annotations.push({ type: 'issue', description: 'https://github.com/barocss/barocss-editor/issues/279' });
      const surface = await openScenario(page, host, 'text');
      await surface.locator('.on-doc > p').hover();
      const trigger = surface.getByRole('button', { name: '블록 추가', exact: true });
      await trigger.click();
      const target = surface.locator('[data-note-insert] [data-note-control="insertQuote"]');
      await expect(target).toBeVisible();
      await expectInsideScroller(target);
      const rect = await target.boundingBox();
      const body = await surface.locator('.on-body-hold').boundingBox();
      if (!rect || !body) throw new Error('Missing insertion menu geometry');
      expect(rect.y + rect.height / 2).toBeGreaterThan(body.y + body.height);
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2, { steps: 20 });
      await expect(target).toBeVisible();
      await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
      await expect(surface.locator('.on-doc > blockquote')).toHaveCount(1);
      await expect(surface.locator('[data-note-insert]')).toHaveCount(0);
    });

    for (const insertion of ['plus', 'slash']) {
      test(`N-280a heading insertion via ${insertion} replaces an empty paragraph @regression`, async ({ page }) => {
        test.info().annotations.push({ type: 'issue', description: 'https://github.com/barocss/barocss-editor/issues/280' });
        const surface = await openScenario(page, host, 'empty');
        await surface.locator('.on-doc > p').click();
        if (insertion === 'slash') {
          await page.keyboard.type('/');
          await page.keyboard.insertText('제목');
          await expect(surface.locator('[data-slash-item="insertHeading"]')).toBeVisible();
          await page.keyboard.press('Enter');
        } else {
          await surface.getByRole('button', { name: '블록 추가', exact: true }).click();
          await surface.locator('[data-note-insert] [data-note-control="insertHeading"]').click();
        }
        const heading = surface.locator('.on-doc > h2');
        await expect(heading).toHaveCount(1);
        await expect.poll(async () => (await blocks(surface)).map(block => block.stype)).toEqual(['heading']);
        await page.keyboard.press('ControlOrMeta+z');
        await expect(surface.locator('.on-doc > p')).toHaveCount(1);
        await expect(heading).toHaveCount(0);
        await page.keyboard.press('ControlOrMeta+Shift+z');
        await expect(heading).toHaveCount(1);
        await page.keyboard.type('Title');
        await expect(surface.locator('.on-doc')).toHaveText('Title');
      });
    }

    test('N-280b Backspace at a heading after an empty paragraph removes the gap @regression', async ({ page }) => {
      test.info().annotations.push({ type: 'issue', description: 'https://github.com/barocss/barocss-editor/issues/280' });
      const surface = await openScenario(page, host, 'heading-gap');
      await surface.locator('.on-doc > h1').click();
      await page.keyboard.press('Home');
      await expect.poll(() => surface.locator('.on-doc > h1').evaluate(heading => {
        const selection = heading.ownerDocument.getSelection();
        if (!selection?.anchorNode || !heading.contains(selection.anchorNode) || !selection.isCollapsed) return false;
        const prefix = heading.ownerDocument.createRange();
        prefix.selectNodeContents(heading);
        prefix.setEnd(selection.anchorNode, selection.anchorOffset);
        return prefix.toString().replace(/[\uFEFF\u200B]/g, '').length === 0;
      }), { message: 'Backspace must start at the heading, not at the preceding empty paragraph' }).toBe(true);
      await page.keyboard.press('Backspace');
      await expect.poll(async () => (await blocks(surface)).length).toBe(1);
      await expect(surface.locator('.on-doc')).toHaveText('Title');
      await page.keyboard.press('ControlOrMeta+z');
      await expect.poll(async () => (await blocks(surface)).length).toBe(2);
      await page.keyboard.press('ControlOrMeta+Shift+z');
      await expect.poll(async () => (await blocks(surface)).length).toBe(1);
      await page.keyboard.type('X');
      await expect(surface.locator('.on-doc')).toHaveText('XTitle');
    });

    test('N-281 divider selection, deletion and undo preserve surrounding content @regression', async ({ page }) => {
      test.info().annotations.push({ type: 'issue', description: 'https://github.com/barocss/barocss-editor/issues/281' });
      const surface = await openScenario(page, host, 'divider');
      const divider = surface.locator('.on-doc hr');
      await surface.locator('.on-doc > p').last().click();
      await divider.click();
      await expect(divider).toHaveAttribute('data-note-picked', 'true');
      await expect.poll(async () => (await snapshot(surface)).selection).toMatchObject({ type: 'node' });
      await expect.poll(async () => (await snapshot(surface)).selectedNodeIds).toEqual([await divider.getAttribute('data-bc-sid')]);
      await page.keyboard.press('Delete');
      await expect(divider).toHaveCount(0);
      await expect(surface.locator('.on-doc > p')).toHaveText(['Before', 'After']);
      await page.keyboard.press('ControlOrMeta+z');
      await expect(divider).toHaveCount(1);
      await expect(surface.locator('.on-doc > p')).toHaveText(['Before', 'After']);
    });
  });
}
