import { expect, test, type Frame, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { openLocalLibrary } from './helpers/local-library';

const workspaceModule = `/@fs${fileURLToPath(new URL('../../../packages/office-workspace/src/index.ts', import.meta.url))}`;
const sharedModule = `/@fs${fileURLToPath(new URL('../../../packages/shared/src/index.ts', import.meta.url))}`;
const products = ['note', 'word', 'slides'] as const;
type Product = typeof products[number];
async function seed(page: Page) {
  await page.goto('/'); await openLocalLibrary(page);
  return page.evaluate(async module => {
    const { OfficeWorkspace, workspaceIdentity } = await import(module) as typeof import('@barocss/office-workspace');
    const workspace = new OfficeWorkspace(workspaceIdentity());
    const ids = {} as Record<Product, string>;
    for (const product of ['note', 'word', 'slides'] as const) ids[product] = await workspace.create(product, `Mixed ${product}`);
    return { workspace: workspace.id, ids };
  }, workspaceModule);
}
async function active(page: Page, product: Product, id: string): Promise<Frame> {
  await expect(page.locator(`.ow-file-navigation [data-original="${product}:${id}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('iframe[data-local-native-frame="active"]')).toHaveCount(1);
  await expect(page.locator('iframe[data-local-native-frame="staged"]')).toHaveCount(0);
  await expect(page.locator('.ow-entry-status')).toHaveCount(0);
  await expect.poll(() => page.evaluate(async module => {
    const { captureProductNavigation } = await import(module) as typeof import('@barocss/shared');
    const guard = captureProductNavigation(); return guard && guard.isCurrent() ? [guard.product, guard.id] : null;
  }, sharedModule)).toEqual([product, id]);
  const frame = await (await page.locator('iframe[data-local-native-frame="active"]').elementHandle())!.contentFrame();
  expect(frame).not.toBeNull();
  expect(new URL(page.url()).searchParams.has('__native_frame')).toBe(false);
  expect(new URL(frame!.url()).searchParams.has('__native_frame')).toBe(true);
  await expect(frame!.locator('.ow-file-navigation')).toHaveCount(0);
  await expect(frame!.locator('.office-editor-header')).toHaveCount(1);
  return frame!;
}
async function open(page: Page, product: Product, id: string) {
  await page.locator(`.ow-file-navigation [data-original="${product}:${id}"]`).first().click();
  return active(page, product, id);
}
async function stored(page: Page, workspace: string, product: Product, id: string) {
  return page.evaluate(async ({ module, workspace, product, id }) => {
    const { OfficeWorkspace } = await import(module) as typeof import('@barocss/office-workspace');
    return (await new OfficeWorkspace(workspace).require(product, id)).text;
  }, { module: workspaceModule, workspace, product, id });
}
async function wordState(frame: Frame) {
  return frame.evaluate(() => {
    const editor = (window as unknown as { editor: { exportDocument(): unknown; getHistoryStats(): unknown; selection: unknown } }).editor;
    const selection = getSelection();
    return { native: editor.exportDocument(), history: editor.getHistoryStats(), selection: editor.selection,
      domSelection: selection ? { anchor: selection.anchorNode?.parentElement?.getAttribute('data-bc-sid'), anchorOffset: selection.anchorOffset,
        focus: selection.focusNode?.parentElement?.getAttribute('data-bc-sid'), focusOffset: selection.focusOffset, text: selection.toString() } : null };
  });
}

test('local Note → Word → Slides → Note retains the shell and exact saved originals', async ({ page }) => {
  const fixture = await seed(page);
  await page.goto(`/${fixture.workspace}/${fixture.ids.note}`);
  let frame = await active(page, 'note', fixture.ids.note);
  const tree = await page.locator('.ow-file-navigation').elementHandle();
  const note = frame.locator('.on-doc .w-paragraph').last();
  await note.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' FINAL MIXED NOTE');
  await expect(note).toContainText('FINAL MIXED NOTE');
  frame = await open(page, 'word', fixture.ids.word);
  const noteBytes = await stored(page, fixture.workspace, 'note', fixture.ids.note);
  expect(noteBytes).toContain('FINAL MIXED NOTE');
  const paragraph = frame.locator('.w-paragraph').last();
  await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' FINAL MIXED WORD');
  await expect(paragraph).toContainText('FINAL MIXED WORD');
  await open(page, 'slides', fixture.ids.slides);
  const wordBytes = await stored(page, fixture.workspace, 'word', fixture.ids.word);
  expect(wordBytes).toContain('FINAL MIXED WORD');
  const slidesBytes = await stored(page, fixture.workspace, 'slides', fixture.ids.slides);
  frame = await open(page, 'note', fixture.ids.note);
  await expect(frame.locator('.on-doc .w-paragraph').last()).toContainText('FINAL MIXED NOTE');
  expect(await stored(page, fixture.workspace, 'note', fixture.ids.note)).toBe(noteBytes);
  expect(await stored(page, fixture.workspace, 'word', fixture.ids.word)).toBe(wordBytes);
  expect(await stored(page, fixture.workspace, 'slides', fixture.ids.slides)).toBe(slidesBytes);
  expect(await tree!.evaluate(element => element.isConnected)).toBe(true);
  frame = await open(page, 'word', fixture.ids.word);
  await expect(frame.locator('.w-paragraph').last()).toContainText('FINAL MIXED WORD');
  expect(await stored(page, fixture.workspace, 'word', fixture.ids.word)).toBe(wordBytes);
});

test('failed target code preserves the actual Word window, native document, history and selection', async ({ page }) => {
  const fixture = await seed(page);
  await page.goto(`/${fixture.workspace}/${fixture.ids.word}`);
  const frame = await active(page, 'word', fixture.ids.word);
  const iframe = await page.locator('iframe[data-local-native-frame="active"]').elementHandle();
  const paragraph = frame.locator('.w-paragraph').last();
  await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' RETAINED TARGET FAILURE');
  await page.keyboard.press('Shift+ArrowLeft');
  await expect.poll(async () => (await wordState(frame)).selection).toMatchObject({ collapsed: false });
  const before = await wordState(frame), originalURL = page.url(), nativeNode = await paragraph.elementHandle();
  await page.route('**/apps/slide/src/main.tsx*', route => route.abort('failed'));
  await page.locator(`.ow-file-navigation [data-original="slides:${fixture.ids.slides}"]`).first().click();
  await expect(page.getByRole('alert').filter({ hasText: /import|fetch|자료|열/ }).first()).toBeVisible();
  await expect(page.locator('iframe[data-local-native-frame="staged"]')).toHaveCount(0);
  expect(page.url()).toBe(originalURL); expect(await wordState(frame)).toEqual(before);
  expect(await iframe!.evaluate(element => element.isConnected)).toBe(true);
  expect(await nativeNode!.evaluate(element => element.isConnected)).toBe(true);
  await expect(paragraph).toContainText('RETAINED TARGET FAILURE');
  await expect(page.locator('.ow-native-slot > div')).not.toHaveAttribute('inert', '');
});

test('direct reload and native header return use clean parent routes', async ({ page }) => {
  const fixture = await seed(page);
  const url = `/${fixture.workspace}/${fixture.ids.word}`;
  await page.goto(url); await active(page, 'word', fixture.ids.word);
  await page.reload(); const frame = await active(page, 'word', fixture.ids.word);
  await frame.getByRole('menubar', { name: '작업 공간 메뉴', exact: true }).getByRole('menuitem').click();
  await frame.getByRole('menuitem', { name: '자료함', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${fixture.workspace}\\?view=library$`));
  await expect(page.getByRole('heading', { name: '전체 자료', exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.has('__native_frame')).toBe(false);
});

test('final source preparation saves native input delivered during held target validation', async ({ page }) => {
  const fixture = await seed(page);
  await page.goto(`/${fixture.workspace}/${fixture.ids.word}`);
  const frame = await active(page, 'word', fixture.ids.word);
  const paragraph = frame.locator('.w-paragraph').last();
  await paragraph.click(); await page.keyboard.press('End');
  await expect.poll(async () => (await wordState(frame)).selection).toMatchObject({ collapsed: true });
  await frame.evaluate(() => {
    const original = window.setTimeout;
    // Hold only the product's known 300ms autosave. The transition must deliver/save.
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
      original(handler, timeout === 300 ? 3_600_000 : timeout, ...args)) as typeof window.setTimeout;
  });
  await page.evaluate(async module => {
    const { OfficeWorkspace } = await import(module) as typeof import('@barocss/office-workspace');
    const original = OfficeWorkspace.prototype.require;
    const state = window as typeof window & { __releaseTargetValidation?: () => void };
    OfficeWorkspace.prototype.require = async function (...args) {
      const result = await original.apply(this, args);
      if (args[0] === 'slides' && document.querySelector('iframe[data-local-native-frame="staged"]')) {
        OfficeWorkspace.prototype.require = original;
        await new Promise<void>(resolve => { state.__releaseTargetValidation = resolve; });
      }
      return result;
    };
  }, workspaceModule);
  await page.locator(`.ow-file-navigation [data-original="slides:${fixture.ids.slides}"]`).first().click();
  await expect.poll(() => page.evaluate(() => typeof (window as typeof window & { __releaseTargetValidation?: () => void }).__releaseTargetValidation)).toBe('function');
  // The source remains usable while the target's final native read is held.
  await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' HELD TARGET LATE SOURCE');
  await expect(paragraph).toContainText('HELD TARGET LATE SOURCE');
  expect(await stored(page, fixture.workspace, 'word', fixture.ids.word)).not.toContain('HELD TARGET LATE SOURCE');
  await page.evaluate(() => (window as typeof window & { __releaseTargetValidation?: () => void }).__releaseTargetValidation!());
  await active(page, 'slides', fixture.ids.slides);
  const saved = await stored(page, fixture.workspace, 'word', fixture.ids.word);
  expect(saved).toContain('HELD TARGET LATE SOURCE');
  const restored = await open(page, 'word', fixture.ids.word);
  await expect(restored.locator('.w-paragraph').last()).toContainText('HELD TARGET LATE SOURCE');
  expect(await stored(page, fixture.workspace, 'word', fixture.ids.word)).toBe(saved);
});

test('invalid or unowned private frame entries refuse native code before import', async ({ page }) => {
  const fixture = await seed(page);
  let nativeImports = 0;
  await page.route('**/apps/word/src/main.tsx*', route => { nativeImports++; return route.abort('failed'); });
  for (const token of ['invalid', '00000000-0000-0000-0000-000000000000']) {
    await page.goto(`/${fixture.workspace}/${fixture.ids.word}?__native_frame=${token}`);
    await expect(page.getByRole('alert').first()).toBeVisible();
    await expect(page.locator('.office-editor-header')).toHaveCount(0);
    await expect(page.locator('iframe[data-local-native-frame]')).toHaveCount(0);
    expect(nativeImports).toBe(0);
  }
});

test('retired source bridge callbacks cannot change the installed target or its route', async ({ page }) => {
  await page.addInitScript(() => {
    type Connection = { isCurrent(): boolean; ready(guard: unknown): void; changed(guard: unknown): void; error(error: unknown): void; navigate(url: string): Promise<boolean> };
    const callbacks = new WeakMap<HTMLIFrameElement, (child: Window, token: string, bridge: unknown) => Connection | undefined>();
    const state = window as typeof window & { __nativeConnections?: Array<{ element: HTMLIFrameElement; connection: Connection }> };
    state.__nativeConnections = [];
    Object.defineProperty(HTMLIFrameElement.prototype, '__wonfficeNativeFrameConnect', {
      configurable: true,
      get() { return callbacks.get(this); },
      set(callback: (child: Window, token: string, bridge: unknown) => Connection | undefined) {
        const element = this as HTMLIFrameElement;
        callbacks.set(element, (child, token, bridge) => {
          const connection = callback(child, token, bridge);
          if (connection) state.__nativeConnections!.push({ element, connection });
          return connection;
        });
      }
    });
  });
  const fixture = await seed(page);
  await page.goto(`/${fixture.workspace}/${fixture.ids.note}`); await active(page, 'note', fixture.ids.note);
  const frame = await open(page, 'word', fixture.ids.word), url = page.url(), before = await wordState(frame);
  const refused = await page.evaluate(async ({ module, destination }) => {
    const { captureProductNavigation } = await import(module) as typeof import('@barocss/shared');
    type Connection = { isCurrent(): boolean; ready(guard: unknown): void; changed(guard: unknown): void; error(error: unknown): void; navigate(url: string): Promise<boolean> };
    const records = (window as typeof window & { __nativeConnections: Array<{ element: HTMLIFrameElement; connection: Connection }> }).__nativeConnections;
    const retired = records.find(record => !record.element.isConnected)!;
    const installed = captureProductNavigation()!;
    retired.connection.ready(installed); retired.connection.changed(installed); retired.connection.error(new Error('Retired source error'));
    return { current: retired.connection.isCurrent(), navigated: await retired.connection.navigate(destination) };
  }, { module: sharedModule, destination: `/${fixture.workspace}/${fixture.ids.note}` });
  expect(refused).toEqual({ current: false, navigated: false });
  expect(page.url()).toBe(url); expect(await wordState(frame)).toEqual(before);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('initial native code failure offers owned retry and a reachable library return', async ({ page }) => {
  const fixture = await seed(page);
  const original = await stored(page, fixture.workspace, 'word', fixture.ids.word);
  await page.route('**/apps/word/src/main.tsx*', route => route.abort('failed'));
  await page.goto(`/${fixture.workspace}/${fixture.ids.word}`);
  const failure = page.locator('[data-local-native-failure]');
  await expect(failure).toBeVisible();
  expect(await stored(page, fixture.workspace, 'word', fixture.ids.word)).toBe(original);
  await page.unroute('**/apps/word/src/main.tsx*');
  await failure.getByRole('button', { name: '다시 불러오기', exact: true }).click();
  await active(page, 'word', fixture.ids.word);
  await expect(failure).toHaveCount(0);
  expect(await stored(page, fixture.workspace, 'word', fixture.ids.word)).toBe(original);
  await page.route('**/apps/word/src/main.tsx*', route => route.abort('failed'));
  await page.reload(); await expect(failure).toBeVisible();
  await failure.getByRole('button', { name: '자료함', exact: true }).click();
  await expect(page.getByRole('heading', { name: '전체 자료', exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.has('__native_frame')).toBe(false);
  expect(await stored(page, fixture.workspace, 'word', fixture.ids.word)).toBe(original);
});

test('legacy product entry joins the same frame lifecycle only after exact native readiness', async ({ page }) => {
  const fixture = await seed(page);
  await page.goto(`/products/word/index.html?workspace=${fixture.workspace}#word=${fixture.ids.word}`);
  await active(page, 'word', fixture.ids.word);
  expect(new URL(page.url()).pathname).toBe(`/${fixture.workspace}/${fixture.ids.word}`);
  expect(new URL(page.url()).hash).toBe('');
  await open(page, 'slides', fixture.ids.slides);
});

test('a ready target document reload cannot promote the old WindowProxy guard', async ({ page }) => {
  const fixture = await seed(page);
  await page.goto(`/${fixture.workspace}/${fixture.ids.word}`);
  const frame = await active(page, 'word', fixture.ids.word);
  const paragraph = frame.locator('.w-paragraph').last();
  await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' READY TARGET OWNER RETAINED');
  await expect(paragraph).toContainText('READY TARGET OWNER RETAINED');
  await page.keyboard.press('Shift+ArrowLeft');
  await expect.poll(async () => (await wordState(frame)).selection).toMatchObject({ collapsed: false, direction: 'backward' });
  const before = await wordState(frame), originalURL = page.url();
  await frame.evaluate(async module => {
    const { productDocumentHost } = await import(module) as typeof import('@barocss/shared');
    const host = productDocumentHost()!, original = host.beforeNavigate;
    const state = window as typeof window & { __releaseSourcePrepare?: () => void };
    host.beforeNavigate = async () => {
      await new Promise<void>(resolve => { state.__releaseSourcePrepare = resolve; });
      host.beforeNavigate = original;
      return await original.call(host);
    };
  }, sharedModule);
  await page.locator(`.ow-file-navigation [data-original="slides:${fixture.ids.slides}"]`).first().click();
  await expect.poll(() => frame.evaluate(() => typeof (window as typeof window & { __releaseSourcePrepare?: () => void }).__releaseSourcePrepare)).toBe('function');
  await page.evaluate(() => {
    const target = document.querySelector<HTMLIFrameElement>('iframe[data-local-native-frame="staged"]')!;
    const state = window as typeof window & { __targetDocument?: Document };
    state.__targetDocument = target.contentDocument!;
    target.contentWindow!.location.reload();
  });
  await expect.poll(() => page.evaluate(() => {
    const target = document.querySelector<HTMLIFrameElement>('iframe[data-local-native-frame="staged"]');
    return !!target?.contentDocument && target.contentDocument !== (window as typeof window & { __targetDocument?: Document }).__targetDocument && target.contentDocument.readyState === 'complete';
  })).toBe(true);
  await frame.evaluate(() => (window as typeof window & { __releaseSourcePrepare?: () => void }).__releaseSourcePrepare!());
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(page.locator('iframe[data-local-native-frame="staged"]')).toHaveCount(0);
  expect(page.url()).toBe(originalURL); expect(await wordState(frame)).toEqual(before);
  await active(page, 'word', fixture.ids.word);
});

test('actual native restore read failure never registers a fallback original and retry reads the same saved bytes', async ({ page }) => {
  const fixture = await seed(page), original = await stored(page, fixture.workspace, 'word', fixture.ids.word);
  await page.evaluate(() => sessionStorage.setItem('test.nativeRestoreFailure', '1'));
  await page.addInitScript(() => {
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (key) {
      if (this.transaction.db.name === 'barocss-word' && document.querySelector('.w-shell') && sessionStorage.getItem('test.nativeRestoreFailure') === '1')
        throw new DOMException('Controlled native restore read failure', 'UnknownError');
      return get.call(this, key);
    };
  });
  await page.goto(`/${fixture.workspace}/${fixture.ids.word}`);
  const failure = page.locator('[data-local-native-failure]'); await expect(failure).toBeVisible();
  expect(await page.evaluate(async module => {
    const { captureProductNavigation } = await import(module) as typeof import('@barocss/shared');
    return captureProductNavigation()?.id ?? null;
  }, sharedModule)).toBeNull();
  expect(await stored(page, fixture.workspace, 'word', fixture.ids.word)).toBe(original);
  await page.evaluate(() => sessionStorage.removeItem('test.nativeRestoreFailure'));
  await failure.getByRole('button', { name: '다시 불러오기', exact: true }).click();
  await active(page, 'word', fixture.ids.word);
  expect(await stored(page, fixture.workspace, 'word', fixture.ids.word)).toBe(original);
});

test('native save failure cancels the staged target and retains the source draft until owned retry', async ({ page }) => {
  const fixture = await seed(page);
  await page.goto(`/${fixture.workspace}/${fixture.ids.word}`);
  const frame = await active(page, 'word', fixture.ids.word);
  await frame.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    const state = window as typeof window & { __restoreNativePut?: () => void };
    state.__restoreNativePut = () => { IDBObjectStore.prototype.put = put; };
    IDBObjectStore.prototype.put = function (...args) {
      if (this.transaction.db.name === 'barocss-word') throw new DOMException('Controlled native save failure', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  const paragraph = frame.locator('.w-paragraph').last();
  await paragraph.click(); await page.keyboard.press('End'); await page.keyboard.insertText(' RETAINED LOCAL SAVE DRAFT');
  await expect(paragraph).toContainText('RETAINED LOCAL SAVE DRAFT');
  await page.keyboard.press('Shift+ArrowLeft');
  await expect.poll(async () => (await wordState(frame)).selection).toMatchObject({ collapsed: false, direction: 'backward' });
  const before = await wordState(frame), url = page.url();
  await page.locator(`.ow-file-navigation [data-original="slides:${fixture.ids.slides}"]`).first().click();
  await expect(page.getByRole('alert').filter({ hasText: '마지막 입력을 저장하지 못했습니다' }).first()).toBeVisible();
  await expect(page.locator('iframe[data-local-native-frame="staged"]')).toHaveCount(0);
  expect(page.url()).toBe(url); expect(await wordState(frame)).toEqual(before);
  await active(page, 'word', fixture.ids.word);
  await frame.evaluate(() => (window as typeof window & { __restoreNativePut?: () => void }).__restoreNativePut!());
  await open(page, 'slides', fixture.ids.slides);
  const saved = await stored(page, fixture.workspace, 'word', fixture.ids.word);
  expect(saved).toContain('RETAINED LOCAL SAVE DRAFT');
  const restored = await open(page, 'word', fixture.ids.word);
  await expect(restored.locator('.w-paragraph').last()).toContainText('RETAINED LOCAL SAVE DRAFT');
  expect(await stored(page, fixture.workspace, 'word', fixture.ids.word)).toBe(saved);
});

test('a child-realm trash error retains its exact reason and owned retry and library return', async ({ page }) => {
  const fixture = await seed(page), url = `/${fixture.workspace}/${fixture.ids.note}`;
  const original = await stored(page, fixture.workspace, 'note', fixture.ids.note);
  let release!: () => void, held = false;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route(url => url.searchParams.has('__native_frame'), async route => {
    if (route.request().isNavigationRequest() && route.request().frame().parentFrame()) { held = true; await pending; }
    await route.continue();
  });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' }); await expect.poll(() => held).toBe(true);
    await page.evaluate(async ({ module, workspace, id }) => {
      const { OfficeWorkspace } = await import(module) as typeof import('@barocss/office-workspace');
      await new OfficeWorkspace(workspace).update(`note:${id}`, { trashedAt: Date.now() });
    }, { module: workspaceModule, workspace: fixture.workspace, id: fixture.ids.note });
    release();
    const failure = page.locator('[data-local-native-failure]');
    await expect(failure).toContainText('휴지통에 있는 자료입니다. 자료함에서 복원하세요.');
    await expect(page.locator('.ow-entry-status')).toHaveCount(0);
    expect(page.url()).toBe(new URL(url, page.url()).href);
    expect(await stored(page, fixture.workspace, 'note', fixture.ids.note)).toBe(original);
    expect(await page.evaluate(async shared => {
      const { captureProductNavigation } = await import(shared) as typeof import('@barocss/shared');
      return captureProductNavigation()?.isCurrent() === true;
    }, sharedModule)).toBe(false);
    await expect(failure.getByRole('button', { name: '다시 불러오기', exact: true })).toBeEnabled();
    const escape = failure.getByRole('button', { name: '자료함', exact: true });
    await escape.focus(); await expect(escape).toBeFocused(); await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: '전체 자료', exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.has('__native_frame')).toBe(false);
    expect(await stored(page, fixture.workspace, 'note', fixture.ids.note)).toBe(original);
  } finally { release(); await page.unrouteAll({ behavior: 'wait' }); }
});

for (const kind of ['dom-exception', 'opaque'] as const) test(`an owned child ${kind} failure copies only a genuine error message`, async ({ page }) => {
  const fixture = await seed(page);
  await page.goto(`/${fixture.workspace}/${fixture.ids.word}`);
  const frame = await active(page, 'word', fixture.ids.word), before = await wordState(frame), url = page.url();
  const original = await stored(page, fixture.workspace, 'word', fixture.ids.word);
  const touched = await frame.evaluate(kind => {
    let touched = false;
    const error = kind === 'dom-exception' ? new DOMException('Controlled child DOM failure', 'UnknownError')
      : { get message() { touched = true; throw new Error('Opaque payload must not be read'); } };
    const element = window.frameElement as HTMLIFrameElement & { __wonfficeNativeFrameFailure?: (child: Window, token: string, error: unknown) => void };
    element.__wonfficeNativeFrameFailure!(window, new URL(location.href).searchParams.get('__native_frame')!, error);
    return touched;
  }, kind);
  expect(touched).toBe(false);
  await expect(page.getByRole('alert').filter({ hasText: kind === 'dom-exception' ? 'Controlled child DOM failure' : '자료를 열지 못했습니다.' })).toBeVisible();
  expect(page.url()).toBe(url); expect(await wordState(frame)).toEqual(before);
  expect(await stored(page, fixture.workspace, 'word', fixture.ids.word)).toBe(original);
});
