import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const workspaceModule = `/@fs${fileURLToPath(new URL('../../../packages/office-workspace/src/index.ts', import.meta.url))}`;
const sharedModule = `/@fs${fileURLToPath(new URL('../../../packages/shared/src/index.ts', import.meta.url))}`;
const kinds = ['note', 'word', 'slides', 'site'] as const;
async function seed(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '전체 자료', exact: true })).toBeVisible();
  return page.evaluate(async module => {
    const { OfficeWorkspace, workspaceIdentity } = await import(module) as typeof import('@barocss/office-workspace');
    const workspace = new OfficeWorkspace(workspaceIdentity());
    const documents = await Promise.all((['note', 'word', 'slides', 'site'] as const).map(async product => {
      const id = await workspace.create(product, `Route ${product}`);
      return { product, id, text: (await workspace.require(product, id)).text };
    }));
    const project = await workspace.createProject('Routing project', 'Fictional route verification');
    return { workspace: workspace.id, documents, project: project.record.id };
  }, workspaceModule);
}
async function expectOriginal(page: Page, product: typeof kinds[number], id: string) {
  await expect(page.locator(`.ow-file-navigation [data-original="${product}:${id}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.ow-native-slot > #root')).toBeVisible();
  await expect(page.locator('.ow-entry-status')).toHaveCount(0);
  await expect.poll(() => page.evaluate(async module => {
    const { productDocumentHost } = await import(module) as typeof import('@barocss/shared');
    const host = productDocumentHost(); return host ? [host.product, host.id()] : null;
  }, sharedModule)).toEqual([product, id]);
}

test('all four compact direct addresses and reloads retain the exact originals and stored native bytes', async ({ page }) => {
  const fixture = await seed(page);
  for (const document of fixture.documents) {
    const path = `/${fixture.workspace}/${document.id}`;
    await page.goto(path); await expectOriginal(page, document.product, document.id);
    await expect(page).toHaveURL(new URL(path, page.url()).href);
    expect(new URL(page.url()).hash).toBe('');
    await page.reload(); await expectOriginal(page, document.product, document.id);
    const text = await page.evaluate(async ({ module, workspace, product, id }) => {
      const { OfficeWorkspace } = await import(module) as typeof import('@barocss/office-workspace');
      return (await new OfficeWorkspace(workspace).require(product, id)).text;
    }, { module: workspaceModule, workspace: fixture.workspace, product: document.product, id: document.id });
    expect(text).toBe(document.text);
  }
});

test('legacy product links normalize only to the verified compact original', async ({ page }) => {
  const fixture = await seed(page);
  for (const document of fixture.documents) {
    await page.goto(`/products/${document.product}/index.html?workspace=${fixture.workspace}#${document.product === 'note' ? '' : `${document.product}=`}${document.id}`);
    await expectOriginal(page, document.product, document.id);
    await expect(page).toHaveURL(new URL(`/${fixture.workspace}/${document.id}`, page.url()).href);
  }
});

test('a compact project direct link opens its existing project and keeps the Workspace context', async ({ page }) => {
  const fixture = await seed(page);
  await page.goto(`/${fixture.workspace}/${fixture.project}`);
  await expect(page.getByRole('heading', { name: 'Routing project', exact: true })).toBeVisible();
  await expect(page.locator('.ow-native-slot > #root')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Routing project', exact: true })).toBeVisible();
});

test('colliding product identities refuse both compact and legacy links without creating a sample', async ({ page }) => {
  const fixture = await seed(page), original = fixture.documents[0];
  await page.evaluate(async ({ module, id, text }) => {
    const { productStore } = await import(module) as typeof import('@barocss/office-workspace');
    await productStore('word').keep({ name: id, title: 'Collision control' }, text, { expectedRevision: null });
  }, { module: workspaceModule, id: original.id, text: fixture.documents[1].text });
  for (const path of [`/${fixture.workspace}/${original.id}`, `/products/note/index.html?workspace=${fixture.workspace}#${original.id}`]) {
    await page.goto(path);
    await expect(page.getByRole('alert')).toContainText('ambiguous');
    await expect(page.locator('.ow-native-slot > #root')).toHaveCount(0);
  }
  expect(await page.evaluate(async module => {
    const { productKeys, productStore } = await import(module) as typeof import('@barocss/office-workspace');
    return (await Promise.all(productKeys.map(product => productStore(product).rows()))).flat().length;
  }, workspaceModule)).toBe(5);
});

test('missing, foreign Workspace and malformed addresses do not mount another native document', async ({ page }) => {
  const fixture = await seed(page);
  for (const path of [`/${fixture.workspace}/missing`, `/foreign/${fixture.documents[0].id}`, `/${fixture.workspace}/invalid%2Fid`]) {
    await page.goto(path); await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.locator('.ow-native-slot > #root')).toHaveCount(0);
  }
});

test('a delayed native module keeps a styled loading surface before the editor appears', async ({ page }) => {
  const fixture = await seed(page), original = fixture.documents[1];
  let release!: () => void, requested!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const requestSeen = new Promise<void>(resolve => { requested = resolve; });
  await page.route(/\/word\/src\/main\.tsx/, async route => { requested(); await held; await route.continue(); });
  try {
    await page.goto(`/${fixture.workspace}/${original.id}`, { waitUntil: 'domcontentloaded' });
    await requestSeen;
    await expect(page.locator('[data-entry-state="loading"]')).toBeVisible();
    await expect(page.getByRole('status')).toContainText('원본을 확인');
    const style = await page.locator('.office-entry-status > header').evaluate(element => ({ height: element.getBoundingClientRect().height, background: getComputedStyle(element).backgroundColor }));
    expect(style.height).toBe(48); expect(style.background).not.toBe('rgba(0, 0, 0, 0)');
    await expect(page.locator('.ow-native-slot > #root')).toHaveCount(0);
    release(); await expectOriginal(page, original.product, original.id);
  } finally { release(); await page.unrouteAll({ behavior: 'wait' }); }
});


test('a retired startup address cannot install or mark either Word original as recently opened', async ({ page }) => {
  const fixture = await seed(page), original = fixture.documents[1];
  const other = await page.evaluate(async ({ module, workspace }) => {
    const { OfficeWorkspace } = await import(module) as typeof import('@barocss/office-workspace');
    return new OfficeWorkspace(workspace).create('word', 'Retired startup destination');
  }, { module: workspaceModule, workspace: fixture.workspace });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(/\/word\/src\/main\.tsx/, async route => { await held; await route.continue(); });
  try {
    await page.goto(`/${fixture.workspace}/${original.id}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-entry-state="loading"]')).toBeVisible();
    await page.evaluate(path => history.replaceState(history.state, '', path), `/${fixture.workspace}/${other}`);
    release();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.locator('.ow-entry-status')).toHaveCount(0);
    const persisted = await page.evaluate(async ({ module, workspace, id, other }) => {
      const { OfficeWorkspace } = await import(module) as typeof import('@barocss/office-workspace');
      const library = new OfficeWorkspace(workspace);
      return { text: (await library.require('word', id)).text,
        opened: (await Promise.all([id, other].map(value => library.meta(`word:${value}`)))).map(meta => meta.openedAt) };
    }, { module: workspaceModule, workspace: fixture.workspace, id: original.id, other });
    expect(persisted.text).toBe(original.text);
    expect(persisted.opened).toEqual([0, 0]);
    await expect(page).toHaveURL(new URL(`/${fixture.workspace}/${other}`, page.url()).href);
  } finally { release(); await page.unrouteAll({ behavior: 'wait' }); }
});

for (const change of ['address', 'missing', 'trash'] as const) test(`held Note startup refuses a ${change} original without opening another page`, async ({ page }) => {
  const fixture = await seed(page), original = fixture.documents[0];
  const other = await page.evaluate(async ({ module, workspace }) => {
    const { OfficeWorkspace } = await import(module) as typeof import('@barocss/office-workspace');
    const library = new OfficeWorkspace(workspace), id = await library.create('note', 'Other original must stay closed');
    return { id, text: (await library.require('note', id)).text };
  }, { module: workspaceModule, workspace: fixture.workspace });
  await page.addInitScript(() => {
    const state = window as typeof window & { __heldNote?: boolean; __releaseNote?: () => void };
    const getAll = IDBObjectStore.prototype.getAll;
    const complete = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete')!;
    IDBObjectStore.prototype.getAll = function (...args) {
      const request = getAll.apply(this, args);
      if (this.transaction.db.name === 'barocss-note' && document.querySelector('.nw-shell') && !state.__heldNote) {
        state.__heldNote = true;
        const transaction = this.transaction;
        Object.defineProperty(transaction, 'oncomplete', {
          configurable: true, get() { return complete.get!.call(transaction); },
          set(callback) { complete.set!.call(transaction, (event: Event) => { state.__releaseNote = () => callback?.call(transaction, event); }); }
        });
      }
      return request;
    };
  });
  await page.goto(`/${fixture.workspace}/${original.id}`);
  await expect.poll(() => page.evaluate(() => typeof (window as typeof window & { __releaseNote?: () => void }).__releaseNote)).toBe('function');
  await expect(page.locator('.ow-entry-status')).toBeVisible();
  await expect(page.locator('.ow-native-slot > #root')).toHaveAttribute('inert', '');
  await page.evaluate(async ({ module, workspace, id, change }) => {
    if (change === 'address') history.replaceState(history.state, '', `/${workspace}/different-note`);
    else {
      const { OfficeWorkspace, productStore } = await import(module) as typeof import('@barocss/office-workspace');
      if (change === 'missing') await productStore('note').drop(id);
      else await new OfficeWorkspace(workspace).update(`note:${id}`, { trashedAt: Date.now() });
    }
    (window as typeof window & { __releaseNote?: () => void }).__releaseNote!();
  }, { module: workspaceModule, workspace: fixture.workspace, id: original.id, change });
  await expect(page.locator('.ow-entry-status')).toHaveAttribute('role', 'alert');
  await expect(page.locator('.ow-native-slot > #root')).toHaveAttribute('inert', '');
  expect(await page.evaluate(async ({ module, workspace, id }) => {
    const { OfficeWorkspace } = await import(module) as typeof import('@barocss/office-workspace');
    return (await new OfficeWorkspace(workspace).meta(`note:${id}`)).openedAt;
  }, { module: workspaceModule, workspace: fixture.workspace, id: original.id })).toBe(0);
  expect(await page.evaluate(async ({ module, shared, workspace, original, other }) => {
    const { OfficeWorkspace, productStore } = await import(module) as typeof import('@barocss/office-workspace');
    const { productDocumentHost } = await import(shared) as typeof import('@barocss/shared');
    const library = new OfficeWorkspace(workspace);
    return { mountedOther: productDocumentHost()?.id() === other.id,
      otherText: (await library.require('note', other.id)).text,
      originalText: (await productStore('note').read(original.id))?.text ?? null,
      count: (await productStore('note').rows()).length };
  }, { module: workspaceModule, shared: sharedModule, workspace: fixture.workspace, original, other })).toEqual({
    mountedOther: false, otherText: other.text, originalText: change === 'missing' ? null : original.text, count: change === 'missing' ? 1 : 2
  });
});
