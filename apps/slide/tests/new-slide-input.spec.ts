import { expect, test, type Page } from '@playwright/test';
import { openDeck, pickMenu } from './helpers';

test.use({ screenshot: 'only-on-failure', trace: 'retain-on-failure' });
test.describe.configure({ retries: 0 });

interface StoredNode {
  sid: string;
  stype: string;
  text?: string;
  marks?: unknown[];
  attributes?: Record<string, unknown>;
  content?: string[];
}

interface TreeSnapshot {
  sid: string;
  stype: string;
  text?: string;
  attributes: Record<string, unknown>;
  marks: unknown[];
  content: TreeSnapshot[];
}

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const editor = (window as unknown as {
      editor: {
        getRootId(): string;
        dataStore: { getNode(id: string): StoredNode | undefined };
        selection: unknown;
      };
    }).editor;
    const store = editor.dataStore;
    const tree = (sid: string): TreeSnapshot => {
      const node = store.getNode(sid);
      if (!node) throw new Error(`Missing slide descendant: ${sid}`);
      return {
        sid: node.sid,
        stype: node.stype,
        ...(typeof node.text === 'string' ? { text: node.text } : {}),
        attributes: node.attributes ?? {},
        marks: node.marks ?? [],
        content: (node.content ?? []).map(tree),
      };
    };
    const plainText = (node: TreeSnapshot): string =>
      typeof node.text === 'string' ? node.text.replace(/\uFEFF/g, '') : node.content.map(plainText).join('');
    const textFrames = (node: TreeSnapshot): Array<{ sid: string; text: string }> =>
      node.stype === 'textFrame' ? [{ sid: node.sid, text: plainText(node) }] : node.content.flatMap(textFrames);
    const slides = (store.getNode(editor.getRootId())?.content ?? [])
      .filter(sid => {
        const node = store.getNode(sid);
        return node?.stype === 'surface' && node.attributes?.kind === 'slide';
      })
      .map(sid => {
        const content = tree(sid);
        return { sid, content, textFrames: textFrames(content) };
      });
    const selection = document.getSelection();
    return {
      slides,
      activeSlide: document.querySelector('.sl-filmstrip button[data-current="true"]')?.getAttribute('data-slide'),
      editorSelection: editor.selection,
      domSelection: {
        anchorText: selection?.anchorNode?.textContent,
        anchorOffset: selection?.anchorOffset,
        focusText: selection?.focusNode?.textContent,
        focusOffset: selection?.focusOffset,
      },
      focused: document.activeElement?.outerHTML.slice(0, 1500),
      saveStatus: document.querySelector('[data-slide-save-status]')?.textContent,
      beforeInputEvents: (window as unknown as { newSlideInputEvents?: unknown[] }).newSlideInputEvents ?? [],
    };
  });
}

async function recordInputDiagnostics(page: Page) {
  await page.evaluate(() => {
    const observed = window as unknown as {
      editor: { selection: unknown };
      newSlideInputEvents: unknown[];
    };
    observed.newSlideInputEvents = [];
    const nodeDetails = (node: Node | null | undefined) => {
      const element = node instanceof Element ? node : node?.parentElement;
      return {
        sid: element?.closest('[data-bc-sid]')?.getAttribute('data-bc-sid'),
        slide: element?.closest('.sl-slide')?.getAttribute('data-bc-sid'),
        text: node?.textContent?.slice(0, 200),
      };
    };
    document.addEventListener('beforeinput', event => {
      const selection = document.getSelection();
      observed.newSlideInputEvents.push({
        data: event.data,
        inputType: event.inputType,
        modelSelection: JSON.parse(JSON.stringify(observed.editor.selection ?? null)),
        activeSlide: document.querySelector('.sl-filmstrip button[data-current="true"]')?.getAttribute('data-slide'),
        domSelection: {
          anchor: nodeDetails(selection?.anchorNode),
          anchorOffset: selection?.anchorOffset,
          focus: nodeDetails(selection?.focusNode),
          focusOffset: selection?.focusOffset,
        },
        target: nodeDetails(event.target instanceof Node ? event.target : null),
        ranges: event.getTargetRanges().map(range => ({
          start: nodeDetails(range.startContainer), startOffset: range.startOffset,
          end: nodeDetails(range.endContainer), endOffset: range.endOffset,
        })),
      });
    }, true);
  });
}

type Snapshot = Awaited<ReturnType<typeof snapshot>>;

function expectOriginalSlidesUnchanged(current: Snapshot, original: Snapshot) {
  const originalIds = new Set(original.slides.map(slide => slide.sid));
  expect(current.slides.filter(slide => originalIds.has(slide.sid))).toEqual(original.slides);
}

function persistentContent(node: TreeSnapshot): unknown {
  return {
    stype: node.stype,
    text: node.text,
    attributes: node.attributes,
    marks: node.marks,
    content: node.content.map(persistentContent),
  };
}

const marker = 'STABLECASE';
const saved = (page: Page) => expect(page.locator('[data-slide-save-status]')).toHaveText('저장됨');

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  try {
    await info.attach('new-slide-input-state', {
      body: JSON.stringify(await snapshot(page), null, 2),
      contentType: 'application/json',
    });
  } catch (error) {
    await info.attach('new-slide-input-diagnostic-error', { body: String(error), contentType: 'text/plain' });
  }
});

for (const deck of ['sample', 'blank'] as const) {
  for (const delay of [0, 9000] as const) {
    test(`${deck} deck keeps ${delay === 0 ? 'immediate' : 'nine-second delayed'} toolbar-new-slide typing on the new slide through undo, redo and reload`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await openDeck(page);
      if (deck === 'blank') {
        // This visible File menu entry invokes file.new and creates an empty deck.
        await pickMenu(page, 'file.document.0');
        await expect(page.locator('.sl-count')).toHaveText('1 / 1');
      }
      await saved(page);
      const original = await snapshot(page);
      if (deck === 'sample') expect(original.slides.length).toBeGreaterThanOrEqual(4);
      else expect(original.slides).toHaveLength(1);
      const originalIds = new Set(original.slides.map(slide => slide.sid));
      await recordInputDiagnostics(page);

      await page.locator('.sl-toolbar').getByRole('menuitem', { name: '슬라이드', exact: true }).click();
      await page.getByRole('menuitem', { name: '새 슬라이드', exact: true }).click();
      // Only the explicitly delayed scenario waits. No click, focus call, or model command follows insertion.
      if (delay) await page.waitForTimeout(delay);
      await page.keyboard.type(marker, { delay: 50 });

      await expect.poll(async () => (await snapshot(page)).slides.length).toBe(original.slides.length + 1);
      const typed = await snapshot(page);
      const added = typed.slides.filter(slide => !originalIds.has(slide.sid));
      expect(added).toHaveLength(1);
      const newSlide = added[0];
      expect(typed.activeSlide).toBe(newSlide.sid);
      expectOriginalSlidesUnchanged(typed, original);
      const writtenFrames = newSlide.textFrames.filter(frame => frame.text.includes(marker));
      expect(writtenFrames).toHaveLength(1);
      // The sample layout contains real title text; insertion must preserve it. The blank layout is empty.
      expect(writtenFrames[0].text).toBe(marker + (deck === 'sample' ? 'Click to add a title' : ''));
      expect(typed.slides.flatMap(slide => slide.textFrames).filter(frame => frame.text.includes(marker))).toHaveLength(1);
      await expect(page.locator(`.sl-stage [data-bc-sid="${writtenFrames[0].sid}"]`)).toContainText(marker);

      await page.keyboard.press('ControlOrMeta+z');
      await expect.poll(async () => (await snapshot(page)).slides.find(slide => slide.sid === newSlide.sid)?.textFrames)
        .not.toEqual(newSlide.textFrames);
      const undone = await snapshot(page);
      expect(undone.activeSlide).toBe(newSlide.sid);
      expect(undone.slides.map(slide => slide.sid)).toEqual(typed.slides.map(slide => slide.sid));
      expectOriginalSlidesUnchanged(undone, original);

      await page.keyboard.press('ControlOrMeta+Shift+z');
      await expect.poll(async () => (await snapshot(page)).slides).toEqual(typed.slides);
      expect((await snapshot(page)).activeSlide).toBe(newSlide.sid);
      await page.keyboard.press('Escape');
      await saved(page);
      const beforeReload = await snapshot(page);
      expect(beforeReload.slides).toEqual(typed.slides);
      const documentUrl = page.url();
      await page.reload();
      await saved(page);
      expect(page.url()).toBe(documentUrl);
      const restored = await snapshot(page);
      // Import allocates session-local SIDs. Compare every slide's ordered content and formatting.
      expect(restored.slides.map(slide => persistentContent(slide.content)))
        .toEqual(beforeReload.slides.map(slide => persistentContent(slide.content)));
      const restoredIds = restored.slides.map(slide => slide.sid);
      expect(restoredIds.every(sid => typeof sid === 'string' && sid.length > 0)).toBe(true);
      expect(new Set(restoredIds).size).toBe(restoredIds.length);
      await test.info().attach('slide-ids-before-and-after-reload', {
        body: JSON.stringify({
          documentUrl,
          before: beforeReload.slides.map(slide => slide.sid),
          after: restoredIds,
        }, null, 2),
        contentType: 'application/json',
      });
    });
  }
}
