import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { nativeEditor, nativeFrame } from './helpers/native-editor';
import { openLocalLibrary } from './helpers/local-library';

const workspaceModule = `/@fs${fileURLToPath(new URL('../../../packages/office-workspace/src/index.ts', import.meta.url))}`;
const sharedModule = `/@fs${fileURLToPath(new URL('../../../packages/shared/src/index.ts', import.meta.url))}`;

async function seed(page: Page) {
  await page.goto('/'); await openLocalLibrary(page);
  return page.evaluate(async module => {
    const { OfficeWorkspace, workspaceIdentity } = await import(module) as typeof import('@barocss/office-workspace');
    const workspace = new OfficeWorkspace(workspaceIdentity());
    const id = await workspace.create('note', 'Owned parent validation');
    return { workspace: workspace.id, id, text: (await workspace.require('note', id)).text };
  }, workspaceModule);
}
async function holdFinalParentRead(page: Page, id: string) {
  await page.addInitScript(id => {
    const state = window as typeof window & { __parentReads?: number; __releaseParent?: () => void };
    const get = IDBObjectStore.prototype.get;
    const complete = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete')!;
    IDBObjectStore.prototype.get = function (key) {
      const request = get.call(this, key);
      // Hold the parent's actual fresh original read after the child exists.
      // Child reads and initial route discovery remain real and uninterrupted.
      if (!window.frameElement && document.querySelector('iframe[data-local-native-frame]') &&
          this.transaction.db.name === 'barocss-note' && this.name === 'documents' && key === id) {
        state.__parentReads = (state.__parentReads ?? 0) + 1;
        if (state.__parentReads === 1) {
          const transaction = this.transaction;
          Object.defineProperty(transaction, 'oncomplete', {
            configurable: true, get() { return complete.get!.call(transaction); },
            set(callback) { complete.set!.call(transaction, (event: Event) => { state.__releaseParent = () => callback?.call(transaction, event); }); }
          });
        }
      }
      return request;
    };
  }, id);
}
async function parentHost(page: Page) {
  return page.evaluate(async module => {
    const { productDocumentHost } = await import(module) as typeof import('@barocss/shared');
    const host = productDocumentHost(); return host ? [host.product, host.id()] : null;
  }, sharedModule);
}
async function opened(page: Page, workspace: string, id: string) {
  return page.evaluate(async ({ module, workspace, id }) => {
    const { OfficeWorkspace } = await import(module) as typeof import('@barocss/office-workspace');
    return (await new OfficeWorkspace(workspace).meta(`note:${id}`)).openedAt;
  }, { module: workspaceModule, workspace, id });
}

for (const retire of [false, true]) test(`final parent validation keeps the real native editor inaccessible until ${retire ? 'a retired address is refused' : 'its exact original is accepted'}`, async ({ page }) => {
  const original = await seed(page);
  await holdFinalParentRead(page, original.id);
  const path = `/${original.workspace}/${original.id}`;
  await page.goto(path);
  await expect.poll(() => page.evaluate(() => typeof (window as typeof window & { __releaseParent?: () => void }).__releaseParent)).toBe('function');
  const child = await nativeFrame(page);
  await expect(nativeEditor(page).locator('#root')).toHaveAttribute('hidden', '');
  await expect(nativeEditor(page).getByRole('textbox')).toHaveCount(0);
  expect(await page.locator('iframe[data-local-native-frame="active"]').evaluate(element => (element as HTMLIFrameElement).inert)).toBe(true);
  expect(await parentHost(page)).toBeNull();
  expect(await opened(page, original.workspace, original.id)).toBe(0);
  if (retire) await page.evaluate(path => history.replaceState(history.state, '', path), `/${original.workspace}/retired-parent-intent`);
  await page.evaluate(() => (window as typeof window & { __releaseParent?: () => void }).__releaseParent!());
  if (retire) {
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(nativeEditor(page).locator('#root')).toHaveAttribute('hidden', '');
    await expect(nativeEditor(page).getByRole('textbox')).toHaveCount(0);
    expect(await parentHost(page)).toBeNull();
    expect(await opened(page, original.workspace, original.id)).toBe(0);
    await expect(page).toHaveURL(new URL(`/${original.workspace}/retired-parent-intent`, page.url()).href);
  } else {
    await expect(page.locator('.ow-entry-status')).toHaveCount(0);
    await expect(nativeEditor(page).locator('#root')).toBeVisible();
    expect(await page.locator('iframe[data-local-native-frame="active"]').evaluate(element => (element as HTMLIFrameElement).inert)).toBe(false);
    expect(await parentHost(page)).toEqual(['note', original.id]);
    await expect.poll(() => opened(page, original.workspace, original.id)).toBeGreaterThan(0);
    await child.locator('.on-doc .w-paragraph').last().click();
    await expect(page).toHaveURL(new URL(path, page.url()).href);
  }
  expect(await page.evaluate(async ({ module, workspace, id }) => {
    const { OfficeWorkspace } = await import(module) as typeof import('@barocss/office-workspace');
    return (await new OfficeWorkspace(workspace).require('note', id)).text;
  }, { module: workspaceModule, workspace: original.workspace, id: original.id })).toBe(original.text);
});
