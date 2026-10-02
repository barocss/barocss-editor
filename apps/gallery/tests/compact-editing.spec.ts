import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const specimen = (page: Page) => page.locator('#compact-editing [data-compact-specimens]');
const primary = (page: Page) => specimen(page).locator('[data-compact-primary]');

async function readableChoice(control: Locator, value: string) {
  await expect(control.locator('.office-choice-label')).toHaveText(value);
  const label = await control.locator('.office-choice-label').evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element);
    const text = range.getBoundingClientRect(), box = element.getBoundingClientRect();
    return { textWidth: text.width, availableWidth: box.width, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
  });
  expect(label.textWidth, `Fully readable ${value}`).toBeLessThanOrEqual(label.availableWidth);
  expect(label.scrollWidth, `No clipped ${value}`).toBeLessThanOrEqual(label.clientWidth);
  return label;
}

async function quietChoice(page: Page, control: Locator, info: TestInfo) {
  const label = (await control.getAttribute('aria-label'))!;
  // Radix hides the opening trigger from the accessibility tree while its listbox owns focus.
  // Keep observing that same connected DOM trigger, including its actual open-state paint.
  control = page.locator(`button.office-choice[aria-label=${JSON.stringify(await control.getAttribute('aria-label'))}]`);
  const states: Array<{
    state: string; border: string; background: string; shadow: string; outline: string;
    focusVisible: boolean; hovered: boolean; connected: boolean;
  }> = [];
  const capture = async (state: string) => {
    await settle(control);
    states.push({ state, ...await control.evaluate(element => {
      const css = getComputedStyle(element);
      return { border: css.borderColor, background: css.backgroundColor, shadow: css.boxShadow, outline: css.outline,
        focusVisible: element.matches(':focus-visible'), hovered: element.matches(':hover'), connected: element.isConnected };
    }) });
    await page.screenshot({ path: info.outputPath(`${label}-${state}.png`), animations: 'disabled' });
  };
  await expect(control).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
  await expect(control).toHaveCSS('box-shadow', 'none');
  await expect(control).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await capture('normal');
  await control.hover();
  await expect(control).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await settle(control);
  const hover = await control.evaluate(element => getComputedStyle(element).backgroundColor);
  await capture('hover');
  await control.click();
  await expect(control).toHaveAttribute('data-state', 'open');
  await expect(control).toHaveCSS('background-color', hover);
  await expect(page.getByRole('listbox')).toBeVisible();
  await capture('open');
  await page.keyboard.press('Escape');
  await expect(control).toHaveAttribute('data-state', 'closed');
  await expect(control).toBeFocused();
  await control.press('Tab'); await page.keyboard.press('Shift+Tab');
  await expect(control).toBeFocused();
  expect(await control.evaluate(element => element.matches(':focus-visible'))).toBe(true);
  await expect(control).toHaveCSS('outline-width', '2px');
  await expect(control).toHaveCSS('outline-style', 'solid');
  await expect(control).not.toHaveCSS('outline-color', 'rgba(0, 0, 0, 0)');
  await capture('keyboard-focus');
  await control.press('Enter'); await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(control).toBeFocused();
  await info.attach(`${label}-paint-states.json`, { body: JSON.stringify(states), contentType: 'application/json' });
}

test('short document title keeps its menu in the left identity group', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#compact-editing');
  const header = specimen(page).locator('.office-editor-header');
  const textRight = await header.locator('[data-document-identity]').evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element);
    return range.getBoundingClientRect().right;
  });
  const menu = (await header.locator('[data-menu="document"]').boundingBox())!;
  expect(menu.x - textRight).toBeGreaterThanOrEqual(0);
  expect(menu.x - textRight).toBeLessThanOrEqual(12);
});

test('selection tools float above their visible target without moving document content', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#compact-editing');
  const sample = specimen(page);
  const document = sample.locator('[data-compact-document]');
  const before = await document.boundingBox();
  const article = sample.getByRole('article', { name: '공통 편집 문서 예시', exact: true });
  const contentBefore = await article.boundingBox();
  await choose(page, '편집 대상 예시', '글 선택');
  const floating = sample.locator('[data-compact-floating]');
  await expect(floating).toHaveCSS('position', 'fixed');
  await expect(floating).toHaveAttribute('data-floating-ready', 'true');
  expect(await document.boundingBox()).toEqual(before);
  expect(await article.boundingBox()).toEqual(contentBefore);
  const target = sample.locator('[data-compact-target="text"]');
  await expect(target).toHaveAttribute('data-selected', 'true');
  const selected = (await target.boundingBox())!, tools = (await floating.boundingBox())!;
  expect(tools.y + tools.height).toBeCloseTo(selected.y - 8, 0);
  expect(tools.x).toBeCloseTo(selected.x, 0);
  expect(await floating.evaluate(node => getComputedStyle(node).boxShadow)).not.toBe('none');
  await primary(page).getByRole('button', { name: '추가 서식 예시', exact: true }).click();
  await expect(page.getByLabel('추가 서식 입력 예시', { exact: true })).toBeVisible();
  expect(await article.boundingBox()).toEqual(contentBefore);
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('추가 서식 입력 예시', { exact: true })).toBeHidden();
  expect(await article.boundingBox()).toEqual(contentBefore);
  await sample.screenshot({ path: info.outputPath('floating-text.png') });
});

test('pointer and keyboard targets own tools through resize, scroll and dismissal', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#compact-editing');
  const sample = specimen(page), canvas = sample.locator('[data-compact-document]');
  const text = sample.getByRole('button', { name: '예시 글 선택', exact: true });
  await text.click();
  const floating = sample.locator('[data-compact-floating]');
  const assertAnchored = async () => {
    await expect(floating).toBeVisible();
    await settle(floating);
    const target = (await text.boundingBox())!, surface = (await floating.boundingBox())!;
    expect(surface.y + surface.height).toBeCloseTo(target.y - 8, 0);
    expect(surface.x).toBeCloseTo(target.x, 0);
  };
  await assertAnchored();
  const origin = await canvas.boundingBox();
  await canvas.hover(); await page.mouse.wheel(0, 40);
  await expect.poll(() => canvas.evaluate(element => element.scrollTop)).toBe(40);
  await expect.poll(async () => {
    const target = (await text.boundingBox())!, surface = (await floating.boundingBox())!;
    return Math.abs(surface.y + surface.height + 8 - target.y);
  }).toBeLessThan(1);
  expect(await canvas.boundingBox()).toEqual(origin);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect.poll(async () => Math.abs((await floating.boundingBox())!.x - (await text.boundingBox())!.x)).toBeLessThan(1);
  await assertAnchored();
  const outerScroll = await page.evaluate(() => window.scrollY);
  await page.mouse.move(1250, 350); await page.mouse.wheel(0, 60);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(outerScroll);
  await expect.poll(async () => {
    const target = (await text.boundingBox())!, surface = (await floating.boundingBox())!;
    return Math.abs(surface.y + surface.height + 8 - target.y);
  }).toBeLessThan(1);
  await canvas.hover(); await page.mouse.wheel(0, 500);
  await expect(primary(page)).toHaveCount(0);
  await canvas.hover(); await page.mouse.wheel(0, -500);
  await expect.poll(() => canvas.evaluate(element => element.scrollTop)).toBe(0);
  await expect(primary(page)).toHaveCount(0);
  await text.press('Enter'); await assertAnchored();
  await text.press('Escape'); await expect(primary(page)).toHaveCount(0);
  await expect(text).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(primary(page)).toHaveCount(0);
  const cell = sample.getByRole('button', { name: '예시 표 셀 선택', exact: true });
  await cell.press('Enter');
  await expect(primary(page)).toHaveAttribute('data-compact-subject', 'table');
  await expect(cell).toHaveAttribute('data-selected', 'true');
  await sample.getByRole('button', { name: '예시 객체 선택', exact: true }).click();
  await expect(primary(page)).toHaveAttribute('data-compact-subject', 'object');
  await expect(cell).not.toHaveAttribute('data-selected', 'true');
  await expect(sample.locator('.compact-example-handle')).toHaveCount(4);
  await expect(primary(page).getByRole('spinbutton')).toHaveValue('160');
  await sample.screenshot({ path: info.outputPath('pointer-object.png') });
});

test('detaching a selected target retires its tool and unfinished popup', async ({ page }) => {
  await page.goto('/#compact-editing');
  const sample = specimen(page), text = sample.locator('[data-compact-target="text"]');
  await text.click();
  await primary(page).getByRole('button', { name: '추가 서식 예시', exact: true }).click();
  const panel = page.getByLabel('추가 서식 입력 예시', { exact: true });
  await panel.getByRole('textbox', { name: '미적용 링크 초안', exact: true }).fill('https://example.com/retired-target');
  // A host may replace/remove the content node while this surface is open.
  await text.evaluate(element => element.remove());
  await expect(primary(page)).toHaveCount(0);
  await expect(panel).toHaveCount(0);
  await expect(sample.getByRole('combobox', { name: '편집 대상 예시', exact: true })).toContainText('선택 없음');
});

test('primary style picker retains the selected target for pointer and keyboard choices', async ({ page }) => {
  await page.goto('/#compact-editing');
  const sample = specimen(page);
  await sample.getByRole('button', { name: '예시 글 선택', exact: true }).click();
  await primary(page).getByRole('combobox', { name: '스타일 예시', exact: true }).click();
  await page.getByRole('option', { name: '제목', exact: true }).click();
  await expect(primary(page)).toBeVisible();
  await expect(primary(page).getByRole('combobox', { name: '스타일 예시', exact: true })).toContainText('제목');
  await expect(sample.locator('[data-compact-target="text"]')).toHaveAttribute('data-selected', 'true');
  await primary(page).getByRole('combobox', { name: '스타일 예시', exact: true }).press('Enter');
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect(page.getByRole('option', { name: '제목', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByRole('option', { name: '본문', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(primary(page).getByRole('combobox', { name: '스타일 예시', exact: true })).toContainText('본문');
  await expect(primary(page)).toBeVisible();
});

test('near-header selection flips below without covering the header or selected phrase', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#compact-editing');
  const sample = specimen(page), canvas = sample.locator('[data-compact-document]');
  const target = sample.locator('[data-compact-target="text"]');
  await target.click();
  const header = sample.locator('.office-editor-header'), surface = sample.locator('[data-compact-floating]');
  const initial = (await target.boundingBox())!, region = (await canvas.boundingBox())!;
  const delta = Math.round(initial.y - region.y - 10);
  await canvas.hover(); await page.mouse.wheel(0, delta);
  await expect.poll(() => canvas.evaluate(element => element.scrollTop)).toBeCloseTo(delta, 0);
  await expect.poll(async () => {
    const selected = (await target.boundingBox())!, floating = (await surface.boundingBox())!;
    return floating.y - selected.y - selected.height;
  }).toBeCloseTo(8, 0);
  const selected = (await target.boundingBox())!, floating = (await surface.boundingBox())!, chrome = (await header.boundingBox())!;
  expect(floating.y).toBeGreaterThanOrEqual(chrome.y + chrome.height);
  await writeFile(info.outputPath('near-header-geometry.json'), JSON.stringify({ header: chrome, canvas: region, target: selected, surface: floating }, null, 2));
  await sample.screenshot({ path: info.outputPath('near-header.png') });
});

async function choose(page: Page, name: string, option: string) {
  await page.getByRole('combobox', { name, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function settle(surface: Locator) {
  await surface.evaluate(async element => {
    await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished));
  });
}

async function bounds(surface: Locator) {
  await settle(surface);
  return surface.evaluate(element => {
    const box = (node: Element) => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      box: box(element),
      controls: [...element.querySelectorAll('button,input,select')]
        .filter(node => !node.closest('[hidden],[inert]') && node.getBoundingClientRect().width > 0)
        .map(node => {
          const rect = box(node);
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return { label: node.getAttribute('aria-label') ?? node.textContent, box: rect, reachable: !!hit && node.contains(hit) };
        })
    };
  });
}

async function contrast(surface: Locator) {
  return surface.evaluate(element => {
    const luminance = (color: string) => {
      const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(value => {
        const channel = Number(value) / (color.startsWith('color(srgb') ? 1 : 255);
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    return [...element.querySelectorAll('button,input,select,label,span,[data-document-identity],[data-compact-status]')]
      .filter(node => !node.closest('[hidden],[inert],:disabled') && node.getBoundingClientRect().width > 0 &&
        (node.matches('button,input,select') || !!node.textContent?.trim())).map(node => {
      let background: Element | null = node;
      while (background && ['transparent', 'rgba(0, 0, 0, 0)'].includes(getComputedStyle(background).backgroundColor)) background = background.parentElement;
      const foreground = getComputedStyle(node).color;
      const fill = getComputedStyle(background ?? element).backgroundColor;
      const a = luminance(foreground), b = luminance(fill);
      return { label: node.getAttribute('aria-label') ?? node.textContent, foreground, background: fill,
        ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
    });
  });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`compact gallery geometry and command routes ${viewport.width} ${theme}`, async ({ page }, info) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await page.getByRole('navigation', { name: '디자인 기준' }).getByRole('link', { name: '공통 소형 편집 UI', exact: true }).click();
      await expect(page).toHaveURL(/#compact-editing$/);
      await choose(page, '시스템 테마', theme === 'dark' ? '어두운 테마' : '밝은 테마');
      const sample = specimen(page);
      await expect(sample).toBeVisible();
      const header = sample.locator('.office-editor-header');
      await header.scrollIntoViewIfNeeded();
      await expect(primary(page)).toHaveCount(0);
      const idle = await bounds(header);
      const headerContrast = await contrast(header);
      for (const color of headerContrast) expect(color.ratio, String(color.label)).toBeGreaterThanOrEqual(4.5);
      expect(idle.box.height).toBe(48);
      for (const control of idle.controls) {
        expect(control.box.width, String(control.label)).toBeGreaterThanOrEqual(32);
        expect(control.box.height, String(control.label)).toBeGreaterThanOrEqual(32);
        expect(control.reachable, String(control.label)).toBe(true);
      }
      const identity = header.locator('[data-document-identity]');
      await sample.getByRole('button', { name: '긴 제목 예시', exact: true }).click();
      expect(await identity.getAttribute('title')).toBe(await identity.textContent());
      expect(await identity.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
      await sample.screenshot({ path: info.outputPath('long-title.png') });
      await sample.getByRole('button', { name: '긴 제목 예시', exact: true }).click();
      await sample.screenshot({ path: info.outputPath('idle.png') });

      await header.locator('[data-menu="document"]').click();
      const menu = page.getByRole('menu', { name: '예시 문서 메뉴', exact: true });
      await expect(menu).toBeVisible();
      await expect(menu.locator('.office-menu-heading')).toHaveText(['파일', '편집', '삽입', '서식', '검토']);
      await expect(menu).toContainText('⌘F');
      await menu.getByRole('menuitem', { name: '찾기 예시 ⌘F', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(menu).toHaveCount(0);
      await expect(sample.locator('[data-compact-last-command]')).toContainText('find');

      const measurements = [];
      const documentOrigin = await sample.locator('[data-compact-document]').boundingBox();
      for (const subject of ['글 선택', '표 선택', '객체 선택']) {
        await choose(page, '편집 대상 예시', subject);
        const row = primary(page);
        if (subject === '글 선택') {
          await quietChoice(page, row.getByRole('combobox', { name: '스타일 예시', exact: true }), info);
          await sample.getByRole('button', { name: '예시 글 선택', exact: true }).click();
        }
        await row.scrollIntoViewIfNeeded();
        const measured = await bounds(row);
        const outer = await bounds(sample.locator('[data-compact-floating]'));
        const target = (await sample.locator(`[data-compact-target="${await row.getAttribute('data-compact-subject')}"]`).boundingBox())!;
        const headerBox = (await header.boundingBox())!;
        const beforeTarget = outer.box.y + outer.box.height <= target.y;
        const afterTarget = outer.box.y >= target.y + target.height;
        expect(beforeTarget || afterTarget).toBe(true);
        expect(outer.box.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
        expect(outer.box.height).toBeLessThanOrEqual(48);
        expect(outer.box.height).toBeGreaterThanOrEqual(40);
        expect(outer.box.height).toBeLessThanOrEqual(44);
        await expect(sample.locator('[data-compact-floating]')).toHaveCSS('border-top-left-radius', '20px');
        for (const control of await row.locator('button').all()) await expect(control).toHaveCSS('border-top-left-radius', '10px');
        expect(outer.box.width).toBeLessThanOrEqual(480);
        expect(await sample.locator('[data-compact-document]').boundingBox()).toEqual(documentOrigin);
        const rowContrast = await contrast(row);
        for (const color of rowContrast) expect(color.ratio, String(color.label)).toBeGreaterThanOrEqual(4.5);
        expect(measured.box.height).toBeLessThanOrEqual(48);
        expect(measured.box.width).toBeLessThanOrEqual(480);
        expect(measured.controls.length).toBeGreaterThanOrEqual(3);
        expect(Math.min(...measured.controls.map(control => control.box.x)) - outer.box.x).toBeGreaterThanOrEqual(12);
        expect(outer.box.x + outer.box.width - Math.max(...measured.controls.map(control => control.box.x + control.box.width))).toBeGreaterThanOrEqual(12);
        for (const control of measured.controls) {
          expect(control.box.width, String(control.label)).toBeGreaterThanOrEqual(32);
          expect(control.box.height, String(control.label)).toBeGreaterThanOrEqual(32);
          expect(control.box.x).toBeGreaterThanOrEqual(measured.box.x);
          expect(control.box.y).toBeGreaterThanOrEqual(measured.box.y);
          expect(control.box.x + control.box.width).toBeLessThanOrEqual(measured.box.x + measured.box.width);
          expect(control.box.y + control.box.height).toBeLessThanOrEqual(measured.box.y + measured.box.height);
          expect(control.reachable, String(control.label)).toBe(true);
        }
        measurements.push({ subject, ...measured, outer, target, header: headerBox, canvas: documentOrigin, contrast: rowContrast });
        await sample.screenshot({ path: info.outputPath(`${subject}.png`) });
      }
      const documentPosition = await sample.locator('[data-compact-document]').boundingBox();
      await header.getByRole('button', { name: '상세 도구 예시', exact: true }).click();
      const detail = page.getByLabel('상세 도구 입력 예시', { exact: true });
      await expect(detail).toBeVisible();
      await expect(page.getByRole('spinbutton', { name: '상세 간격 예시', exact: true })).toBeFocused();
      expect(await sample.locator('[data-compact-document]').boundingBox()).toEqual(documentPosition);
      await settle(detail);
      const detailContrast = await contrast(detail);
      for (const color of detailContrast) expect(color.ratio, String(color.label)).toBeGreaterThanOrEqual(4.5);
      await detail.screenshot({ path: info.outputPath('detail.png') });
      const geometryPath = info.outputPath('geometry.json');
      await writeFile(geometryPath, JSON.stringify({ viewport, theme, idle, headerContrast, measurements, detailContrast }, null, 2));
      await info.attach('geometry.json', { path: geometryPath, contentType: 'application/json' });
      await page.keyboard.press('Escape');
      await expect(detail).toBeHidden();
      await expect(header.getByRole('button', { name: '상세 도구 예시', exact: true })).toBeFocused();

      await choose(page, '현재 권한·상태 예시', '읽기 전용');
      await expect(primary(page)).toHaveCount(0);
      await expect(sample.locator('[data-compact-status]')).toContainText('읽기 전용');
      await header.locator('[data-menu="document"]').click();
      await expect(page.getByRole('menuitem', { name: '새 예시', exact: true })).toBeDisabled();
      await page.keyboard.press('Escape');
      await sample.screenshot({ path: info.outputPath('viewer.png') });
      await choose(page, '현재 권한·상태 예시', '처리 중');
      await expect(primary(page)).toHaveCount(0);
      await expect(sample.locator('[data-compact-status]')).toContainText('처리 중');
      await choose(page, '현재 권한·상태 예시', '복구 필요');
      await expect(sample.getByRole('alert')).toContainText('저장 실패');
      await sample.screenshot({ path: info.outputPath('recovery.png') });
      await sample.getByRole('button', { name: '재시도 예시', exact: true }).click();
      await expect(sample.locator('[data-compact-status]')).toContainText('서버에 저장하지 않는');
    });
  }
}

test('shared secondary fields retain drafts and dismiss the owned child first', async ({ page }) => {
  await page.goto('/#compact-editing');
  await choose(page, '편집 대상 예시', '글 선택');
  const row = primary(page);
  const more = row.getByRole('button', { name: '추가 서식 예시', exact: true });
  await more.focus(); await page.keyboard.press('Enter');
  const panel = page.getByLabel('추가 서식 입력 예시', { exact: true });
  const draft = panel.getByRole('textbox', { name: '미적용 링크 초안', exact: true });
  await expect(draft).toBeFocused();
  await draft.fill('https://example.com/retained-fictional-draft');
  const font = panel.getByRole('combobox', { name: '추가 글꼴 예시', exact: true });
  await expect(font).not.toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
  await expect(font).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await font.click(); await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(panel).toBeVisible(); await expect(font).toBeFocused();
  await expect(draft).toHaveValue('https://example.com/retained-fictional-draft');
  const color = panel.getByRole('button', { name: '추가 색 예시', exact: true });
  await color.click();
  const palette = panel.locator('[data-palette="secondary-colour"]');
  await expect(palette).toBeVisible();
  await palette.getByRole('button', { name: '파랑', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(palette).toHaveCount(0);
  await expect(panel).toBeVisible(); await expect(color).toBeFocused();
  await expect(draft).toHaveValue('https://example.com/retained-fictional-draft');
  await draft.focus(); await page.keyboard.press('Escape');
  await expect(panel).toBeHidden(); await expect(panel).toHaveAttribute('inert', '');
  await expect(more).toBeFocused();
  await page.keyboard.press('Enter'); await expect(draft).toBeFocused();
  await expect(draft).toHaveValue('https://example.com/retained-fictional-draft');
  const previousPanel = await panel.elementHandle();
  await choose(page, '편집 대상 예시', '객체 선택');
  await expect.poll(() => previousPanel!.evaluate(element => element.isConnected)).toBe(false);
  // The new subject has not opened its lazily mounted popup.
  await expect(panel).toHaveCount(0);
  await primary(page).getByRole('button', { name: '추가 서식 예시', exact: true }).click();
  await expect(page.getByLabel('추가 서식 입력 예시', { exact: true }).getByRole('spinbutton', { name: '객체 높이 예시', exact: true })).toHaveValue('96');
  await expect(panel.getByRole('textbox', { name: '미적용 링크 초안', exact: true })).toHaveCount(0);
  await choose(page, '편집 대상 예시', '글 선택');
  await primary(page).getByRole('button', { name: '추가 서식 예시', exact: true }).click();
  await expect(panel.getByRole('textbox', { name: '미적용 링크 초안', exact: true })).toHaveValue('https://example.com/unaccepted');
});

test('link and secondary formatting share one unfinished draft for the current text target', async ({ page }) => {
  await page.goto('/#compact-editing');
  await choose(page, '편집 대상 예시', '글 선택');
  await primary(page).getByRole('button', { name: '링크 예시', exact: true }).click();
  const link = page.getByLabel('링크 입력 예시', { exact: true });
  await link.getByRole('textbox', { name: '미적용 링크 초안', exact: true }).fill('https://example.com/same-owned-draft');
  await page.keyboard.press('Escape'); await expect(link).toBeHidden();
  await primary(page).getByRole('button', { name: '추가 서식 예시', exact: true }).click();
  const more = page.getByLabel('추가 서식 입력 예시', { exact: true });
  await expect(more.getByRole('textbox', { name: '미적용 링크 초안', exact: true })).toHaveValue('https://example.com/same-owned-draft');
  await page.keyboard.press('Escape'); await expect(more).toBeHidden();
  await primary(page).getByRole('button', { name: '링크 예시', exact: true }).click();
  await expect(link.getByRole('textbox', { name: '미적용 링크 초안', exact: true })).toHaveValue('https://example.com/same-owned-draft');
});

test('tooltip closes before its secondary panel and returns to the trigger', async ({ page }) => {
  await page.goto('/#compact-editing');
  await choose(page, '편집 대상 예시', '글 선택');
  const more = primary(page).getByRole('button', { name: '추가 서식 예시', exact: true });
  await more.click();
  const panel = page.getByLabel('추가 서식 입력 예시', { exact: true });
  await expect(panel).toBeVisible();
  await primary(page).getByRole('button', { name: '굵게 예시', exact: true }).hover();
  const tooltip = page.locator('[data-office-tooltip]').filter({ hasText: '굵게 예시' });
  await expect(tooltip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0); await expect(panel).toBeVisible();
  await panel.getByRole('textbox', { name: '미적용 링크 초안', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden(); await expect(more).toBeFocused();
});

test('shared action menu and text toggles execute once by keyboard', async ({ page }) => {
  await page.goto('/#compact-editing');
  await choose(page, '편집 대상 예시', '글 선택');
  const sample = specimen(page), row = primary(page);
  const bold = row.getByRole('button', { name: '굵게 예시', exact: true });
  await bold.focus(); await page.keyboard.press('Enter');
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  await expect(sample.locator('[data-compact-text]')).toHaveCSS('font-weight', '700');
  await bold.press('Enter'); await expect(bold).toHaveAttribute('aria-pressed', 'false');
  await row.getByRole('button', { name: '글 색 예시', exact: true }).click();
  await row.locator('[data-palette="compact-text-color"]').getByRole('button', { name: '파랑', exact: true }).click();
  await expect(sample.locator('[data-compact-text]')).toHaveCSS('color', 'rgb(20, 86, 204)');
  await row.getByRole('button', { name: '추가 서식 예시', exact: true }).click();
  await page.getByLabel('추가 서식 입력 예시', { exact: true }).getByRole('button', { name: '추가 작업 예시', exact: true }).click();
  const menu = page.getByRole('menu', { name: '추가 작업 메뉴 예시', exact: true });
  await expect(menu.getByRole('menuitem', { name: '선택 복사 예시', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: '선택 제거 예시', exact: true })).toBeFocused();
  await page.keyboard.press('Enter'); await expect(menu).toBeHidden();
  await expect(sample.locator('[data-compact-last-command]')).toContainText('선택 제거 예시');
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`rounded slide clusters and folded/expanded navigation ${viewport.width} ${theme}`, async ({ page }, info) => {
      await page.setViewportSize(viewport); await page.goto('/#compact-editing');
      await choose(page, '시스템 테마', theme === 'dark' ? '어두운 테마' : '밝은 테마');
      await choose(page, '작업 화면 예시', '슬라이드 화면');
      const sample = specimen(page), slides = sample.locator('[data-compact-slide-specimen]');
      await expect(sample.getByRole('combobox', { name: '작업 화면 예시', exact: true })).not.toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
      await slides.scrollIntoViewIfNeeded();
      const stage = slides.locator('[data-slide-example-stage]'), paper = slides.locator('[data-slide-example-page]');
      const stageBefore = await stage.boundingBox(), paperBefore = await paper.boundingBox();
      await expect(slides.locator('.office-editor-header')).toHaveCSS('height', '48px');
      await expect(slides.locator('.office-document-bar')).toHaveCSS('border-bottom-width', '0px');
      await expect(slides.locator('[data-slide-example-filmstrip]')).toHaveCount(0);
      const zoomControl = slides.getByRole('combobox', { name: '슬라이드 확대 비율 예시', exact: true });
      const zoomLabels = [await readableChoice(zoomControl, '100%')];
      await quietChoice(page, zoomControl, info);
      await slides.locator('.compact-slide-caption').click();
      await quietChoice(page, slides.getByRole('combobox', { name: '슬라이드 페이지 선택 예시', exact: true }), info);
      await slides.locator('.compact-slide-caption').click();
      const groups = [];
      for (const selector of ['[data-slide-example-insert]', '[data-slide-example-utilities]', '[data-slide-example-navigation]']) {
        const row = slides.locator(`${selector} .office-toolbar`), measured = await bounds(row);
        expect(measured.box.height).toBeGreaterThanOrEqual(40); expect(measured.box.height).toBeLessThanOrEqual(44);
        expect(measured.box.width).toBeLessThanOrEqual(480);
        await expect(row).toHaveCSS('border-top-left-radius', selector.includes('navigation') ? '999px' : '20px');
        for (const control of await row.locator('button').all()) await expect(control).toHaveCSS('border-top-left-radius', '10px');
        expect(await row.evaluate(element => getComputedStyle(element).boxShadow)).not.toBe('none');
        for (const control of measured.controls) {
          expect(control.box.width, String(control.label)).toBeGreaterThanOrEqual(32);
          expect(control.box.height, String(control.label)).toBeGreaterThanOrEqual(32);
          expect(control.box.x).toBeGreaterThanOrEqual(measured.box.x);
          expect(control.box.x + control.box.width).toBeLessThanOrEqual(measured.box.x + measured.box.width);
          expect(control.box.y).toBeGreaterThanOrEqual(measured.box.y);
          expect(control.box.y + control.box.height).toBeLessThanOrEqual(measured.box.y + measured.box.height);
          expect(control.reachable, String(control.label)).toBe(true);
        }
        expect(Math.min(...measured.controls.map(control => control.box.x)) - measured.box.x).toBeGreaterThanOrEqual(12);
        expect(measured.box.x + measured.box.width - Math.max(...measured.controls.map(control => control.box.x + control.box.width))).toBeGreaterThanOrEqual(12);
        for (const color of await contrast(row)) expect(color.ratio, String(color.label)).toBeGreaterThanOrEqual(4.5);
        groups.push({ selector, ...measured });
      }
      expect(groups[0].box.x + groups[0].box.width).toBeLessThan(groups[1].box.x);
      expect(groups[0].box.y).toBe(groups[1].box.y);
      expect(groups[2].box.x + groups[2].box.width / 2).toBeCloseTo(stageBefore!.x + stageBefore!.width / 2, 0);
      await slides.screenshot({ path: info.outputPath('folded-slides.png') });
      await slides.getByRole('button', { name: '텍스트 상자 삽입 예시', exact: true }).click();
      await expect(paper).toContainText('삽입된 텍스트 예시');
      await expect(sample.locator('[data-compact-last-command]')).toContainText('slide:insert-textbox');
      expect(await stage.boundingBox()).toEqual(stageBefore); expect(await paper.boundingBox()).toEqual(paperBefore);
      await slides.getByRole('button', { name: '내보내기 예시', exact: true }).click();
      await expect(sample.locator('[data-compact-last-command]')).toContainText('slide:export');
      await slides.getByRole('button', { name: '프레젠테이션 예시', exact: true }).click();
      await expect(page.getByRole('dialog', { name: '프레젠테이션 UI 예시', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '편집 UI 예시로 돌아가기', exact: true }).click();
      await expect(page.getByRole('dialog', { name: '프레젠테이션 UI 예시', exact: true })).toHaveCount(0);
      await slides.getByRole('button', { name: '슬라이드 추가 보기 예시', exact: true }).click();
      await expect(page.getByLabel('슬라이드 보기 설정 예시', { exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(slides.getByRole('button', { name: '슬라이드 추가 보기 예시', exact: true })).toBeFocused();
      await slides.getByRole('button', { name: '다음 슬라이드 예시', exact: true }).press('Enter');
      await expect(slides.getByRole('article', { name: '2번 슬라이드 예시', exact: true })).toBeVisible();
      const stripTrigger = slides.getByRole('button', { name: '슬라이드 필름스트립 예시', exact: true });
      await stripTrigger.click();
      const strip = slides.getByRole('group', { name: '슬라이드 필름스트립 예시', exact: true });
      await expect(strip).toBeVisible();
      await expect(strip.getByRole('button', { name: '2번 슬라이드 선택 예시', exact: true })).toBeFocused();
      expect(await stage.boundingBox()).toEqual(stageBefore); expect(await paper.boundingBox()).toEqual(paperBefore);
      const stripBox = (await strip.boundingBox())!, navigationBox = groups[2].box;
      expect(paperBefore!.y + paperBefore!.height + 8).toBeLessThanOrEqual(stripBox.y);
      expect(stripBox.y + stripBox.height + 8).toBeLessThanOrEqual(navigationBox.y);
      expect(stripBox.x).toBeGreaterThanOrEqual(stageBefore!.x);
      expect(stripBox.x + stripBox.width).toBeLessThanOrEqual(stageBefore!.x + stageBefore!.width);
      expect((await bounds(slides.locator('[data-slide-example-insert] .office-toolbar'))).box).toEqual(groups[0].box);
      expect((await bounds(slides.locator('[data-slide-example-utilities] .office-toolbar'))).box).toEqual(groups[1].box);
      await strip.getByRole('button', { name: '3번 슬라이드 선택 예시', exact: true }).click();
      await expect(strip.getByRole('button', { name: '3번 슬라이드 선택 예시', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(slides.getByRole('article', { name: '3번 슬라이드 예시', exact: true })).toBeVisible();
      await slides.screenshot({ path: info.outputPath('expanded-slides.png') });
      await strip.getByRole('button', { name: '3번 슬라이드 선택 예시', exact: true }).press('Escape');
      await expect(strip).toHaveCount(0); await expect(stripTrigger).toBeFocused();
      await choose(page, '슬라이드 페이지 선택 예시', '1 / 3');
      await expect(slides.getByRole('article', { name: '1번 슬라이드 예시', exact: true })).toBeVisible();
      await choose(page, '슬라이드 확대 비율 예시', '75%');
      zoomLabels.push(await readableChoice(zoomControl, '75%'));
      expect(await stage.boundingBox()).toEqual(stageBefore);
      expect((await paper.boundingBox())!.width).toBeCloseTo(paperBefore!.width * .75, 0);
      await choose(page, '슬라이드 확대 비율 예시', '125%');
      zoomLabels.push(await readableChoice(zoomControl, '125%'));
      await stripTrigger.click();
      const zoomPaper = (await paper.boundingBox())!, zoomStrip = (await strip.boundingBox())!;
      expect(zoomPaper.y + zoomPaper.height + 8).toBeLessThanOrEqual(zoomStrip.y);
      expect(zoomPaper.y).toBeGreaterThan(groups[0].box.y + groups[0].box.height);
      await strip.getByRole('button', { name: '1번 슬라이드 선택 예시', exact: true }).press('Escape');
      await expect(strip).toHaveCount(0); await expect(stripTrigger).toBeFocused();
      await choose(page, '현재 권한·상태 예시', '읽기 전용');
      await expect(slides.getByRole('button', { name: '텍스트 상자 삽입 예시', exact: true })).toBeDisabled();
      await slides.getByRole('button', { name: '다음 슬라이드 예시', exact: true }).click();
      await expect(slides.getByRole('article', { name: '2번 슬라이드 예시', exact: true })).toBeVisible();
      await expect(slides.locator('[data-slide-example-status]')).toContainText('읽기 전용');
      await info.attach('rounded-groups.json', { body: JSON.stringify({ stage: stageBefore, paper: paperBefore, strip: stripBox, navigation: navigationBox, zoomPaper, zoomStrip, zoomLabels, groups }), contentType: 'application/json' });
      await expect(slides.locator('[data-icon-missing]')).toHaveCount(0);
    });
  }
}
