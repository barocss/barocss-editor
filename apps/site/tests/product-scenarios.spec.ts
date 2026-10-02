import { expect, test, type Locator, type Page } from '@playwright/test';
import { readSiteArchive, retainDownload } from './scenario-downloads';

const saved = (page: Page) => expect(page.locator('[data-site-save-status]')).toHaveText('저장됨');
const desktop = (page: Page) => page.locator('[data-frame="desktop"]');

async function fileAction(page: Page, name: string) {
  await page.getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}

async function backToAdmin(page: Page) {
  await page.getByRole('button', { name: '모든 도구', exact: true }).click();
  await page.getByRole('button', { name: '관리로', exact: true }).click();
}

async function enterText(page: Page, block: Locator) {
  // The overlay owns pointer input; Meta reaches the target block through its ancestors.
  await block.click({ force: true, modifiers: ['Meta'] });
  await block.dblclick({ force: true });
  await expect(desktop(page).locator('.st-overlay')).toHaveAttribute('data-mode', 'text');
  await page.keyboard.press('End');
}

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const state = await page.evaluate(() => {
    const host = window as unknown as { editor?: { exportDocument(): unknown } };
    return { url: location.href, document: host.editor?.exportDocument(),
      selection: document.getSelection()?.toString(), focused: document.activeElement?.outerHTML.slice(0, 2000),
      desktop: document.querySelector('[data-frame="desktop"]')?.textContent };
  }).catch(error => ({ diagnosticError: String(error) }));
  await info.attach('authored-site-state', { body: JSON.stringify(state, null, 2), contentType: 'application/json' });
});

test('[SITE-AUTHORED-MULTIPAGE-OUTPUT-UI-001] saves final native body input and exports both authored pages at their paths', async ({ page }, info) => {
  await page.goto('/');
  await saved(page);
  await fileAction(page, '새 사이트');
  await saved(page);
  await expect(page.locator('[data-admin-page]')).toHaveCount(1);
  const url = page.url();
  const id = new URL(url).hash.slice(6);
  await page.locator('[data-admin-open="home"]').click();
  const paragraph = desktop(page).locator('.w-paragraph').first();
  await enterText(page, paragraph);
  await page.keyboard.type('SITE HOME FINAL');
  // The last native key and explicit save are adjacent. Do not wait for autosave here.
  await page.keyboard.type('!');
  const siteFileWait = page.waitForEvent('download');
  await page.keyboard.press('ControlOrMeta+s');
  const siteFile = await retainDownload(await siteFileWait, info);
  expect(siteFile.text).toContain('SITE HOME FINAL!');
  await expect(paragraph).toHaveText('SITE HOME FINAL!');

  await backToAdmin(page);
  await page.locator('[data-admin-add="page"]').click();
  await page.getByRole('button', { name: '빈 페이지', exact: true }).click();
  await expect(page.locator('[data-admin-page]')).toHaveCount(2);
  const second = page.locator('[data-admin-page]').nth(1);
  const secondId = await second.getAttribute('data-admin-page');
  await second.getByRole('textbox', { name: '페이지 2 이름', exact: true }).fill('제품');
  await second.getByRole('textbox', { name: '페이지 2 이름', exact: true }).press('Enter');
  await second.getByRole('textbox', { name: '제품 주소', exact: true }).fill('/jepum');
  await second.getByRole('textbox', { name: '제품 주소', exact: true }).press('Enter');
  await second.locator('[data-admin-open]').click();
  const heading = desktop(page).locator('h1');
  await enterText(page, heading);
  await page.keyboard.type(' SITE SECOND FINAL!');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(heading).not.toContainText('SITE SECOND FINAL!');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(heading).toContainText('SITE SECOND FINAL!');
  const secondText = await heading.innerText();
  await saved(page);

  // Reopen through the real recent-document UI, with the original identity, then reload it.
  await fileAction(page, '새 사이트');
  await saved(page);
  expect(page.url()).not.toBe(url);
  await page.getByRole('button', { name: '최근 자료', exact: true }).click();
  await page.locator(`[data-site-document="${id}"]`).getByRole('button').click();
  await saved(page);
  expect(page.url()).toBe(url);
  await page.reload();
  await saved(page);
  expect(page.url()).toBe(url);
  await expect(page.locator('[data-admin-page]')).toHaveCount(2);
  await expect(page.locator(`[data-admin-page="${secondId}"]`).getByRole('textbox', { name: '제품 주소', exact: true })).toHaveValue('/jepum');
  await page.locator('[data-admin-open="home"]').click();
  await expect(desktop(page).locator('.w-paragraph').first()).toHaveText('SITE HOME FINAL!');

  const htmlWait = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
  await page.getByRole('menuitem', { name: '이 페이지 내보내기', exact: true }).click();
  const htmlDownload = await htmlWait;
  expect(htmlDownload.suggestedFilename()).toBe('index.html');
  const html = await retainDownload(htmlDownload, info);
  expect(html.text.match(/SITE HOME FINAL!/g)).toHaveLength(1);
  expect(html.text).not.toContain('SITE SECOND FINAL!');

  await backToAdmin(page);
  await page.locator(`[data-admin-open="${secondId}"]`).click();
  await expect(desktop(page).locator('.st-page')).toHaveAttribute('data-path', '/jepum');
  await expect(desktop(page).locator('h1')).toHaveText(secondText);
  const zipWait = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: '문서 메뉴', exact: true }).click();
  await page.getByRole('menuitem', { name: '사이트 전체 내보내기', exact: true }).click();
  const zipDownload = await zipWait;
  expect(zipDownload.suggestedFilename()).toMatch(/\.zip$/);
  const zip = await retainDownload(zipDownload, info);
  const files = await readSiteArchive(zip.path);
  expect(Object.keys(files).sort()).toEqual(['index.html', 'jepum/index.html']);
  expect(files['index.html'].match(/SITE HOME FINAL!/g)).toHaveLength(1);
  expect(files['index.html']).not.toContain('SITE SECOND FINAL!');
  expect(files['jepum/index.html'].match(/SITE SECOND FINAL!/g)).toHaveLength(1);
  expect(files['jepum/index.html']).toContain(secondText);
  expect(files['jepum/index.html']).not.toContain('SITE HOME FINAL!');
  await info.attach('authored-site-output-paths', { body: JSON.stringify({ id, url, secondId, secondPath: '/jepum',
    home: 'SITE HOME FINAL!', secondText, files: Object.keys(files).sort() }, null, 2), contentType: 'application/json' });
});
