import {
  test,
  expect,
  type Page,
  type Locator,
  type TestInfo,
} from "@playwright/test";
import { settled } from "./helpers";
import { readFileSync } from "node:fs";

const prefix = "This paragraph takes its ";
const tools = (page: Page) =>
  page.getByRole("group", { name: "선택한 Word 글 서식", exact: true });
const native = (page: Page) =>
  page.evaluate(() => JSON.stringify(window.editor.exportDocument()));
const prose = (page: Page) =>
  page.locator("#editor .w-paragraph").filter({ hasText: prefix }).first();
const savedFiles = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const request = indexedDB.open("barocss-word");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const rows = db
            .transaction("documents")
            .objectStore("documents")
            .getAll();
          rows.onerror = () => {
            db.close();
            reject(rows.error);
          };
          rows.onsuccess = () => {
            const files = rows.result.map((row: { text: string }) => row.text);
            db.close();
            resolve(files);
          };
        };
      })
  );
async function selectText(page: Page) {
  await prose(page).click({ position: { x: 8, y: 10 } });
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+ArrowLeft" : "Home"
  );
  await page.keyboard.down("Shift");
  for (let i = 0; i < prefix.length; i++)
    await page.keyboard.press("ArrowRight");
  await page.keyboard.up("Shift");
  await expect
    .poll(() => page.evaluate(() => getSelection()?.toString()))
    .toBe(prefix);
  await expect
    .poll(() => page.evaluate(() => window.editor.selection?.endOffset))
    .toBe(prefix.length);
}
async function open(page: Page, width: number, height: number, theme: string) {
  await page.setViewportSize({ width, height });
  await page.goto("/?sample");
  await settled(page);
  await expect(page.locator("[data-word-save-status]")).toHaveText("저장됨");
  await page.evaluate((value) => {
    document.documentElement.dataset.theme = value;
  }, theme);
  await expect(
    page.getByRole("button", { name: "전체 도구 펼치기", exact: true })
  ).toHaveCSS(
    "color",
    theme === "dark" ? "rgb(238, 241, 245)" : "rgb(32, 37, 45)"
  );
}
async function state(page: Page) {
  return page.evaluate(() => ({
    document: window.editor.exportDocument(),
    selection: window.editor.selection,
    undo: window.editor.canRun("undo"),
    redo: window.editor.canRun("redo"),
    dom: {
      text: getSelection()?.toString(),
      anchor: getSelection()?.anchorOffset,
      focus: getSelection()?.focusOffset,
    },
  }));
}
async function record(surface: Locator, info: TestInfo, name: string) {
  await expect(surface).toBeVisible();
  await surface.evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => {}))
    );
  });
  const geometry = await surface.evaluate((element) => ({
    box: element.getBoundingClientRect().toJSON(),
    radius: getComputedStyle(element).borderRadius,
    controls: [
      ...element.querySelectorAll<HTMLElement>(
        'button,input,[role="combobox"]'
      ),
    ]
      .filter((control) => !!control.getClientRects().length)
      .map((control) => {
        const box = control.getBoundingClientRect();
        const hit = document.elementFromPoint(
          box.x + box.width / 2,
          box.y + box.height / 2
        );
        return {
          name: control.getAttribute("aria-label") ?? control.textContent,
          box: box.toJSON(),
          hit: !!hit && control.contains(hit),
        };
      }),
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  await info.attach(`${name}-geometry.json`, {
    body: JSON.stringify(geometry),
    contentType: "application/json",
  });
  return geometry;
}
async function compact(surface: Locator, info: TestInfo, name: string) {
  const geometry = await record(surface, info, name);
  expect(geometry.box.height).toBeGreaterThanOrEqual(40);
  expect(geometry.box.height).toBeLessThanOrEqual(44);
  expect(geometry.radius).toBe("20px");
  expect(geometry.box.width).toBeLessThanOrEqual(480);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
  for (const control of geometry.controls) {
    expect(
      control.box.height,
      control.name ?? "control"
    ).toBeGreaterThanOrEqual(32);
    expect(control.box.width, control.name ?? "control").toBeGreaterThanOrEqual(
      32
    );
    expect(control.box.top).toBeGreaterThanOrEqual(geometry.box.top);
    expect(control.box.bottom).toBeLessThanOrEqual(geometry.box.bottom);
    expect(control.box.left - geometry.box.left).toBeGreaterThanOrEqual(12);
    expect(geometry.box.right - control.box.right).toBeGreaterThanOrEqual(12);
    expect(control.hit, control.name ?? "control").toBe(true);
  }
}
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
])
  for (const theme of ["light", "dark"]) {
    const label = `${viewport.width}-${theme}`;
    test(`Word primary text stays one compact reachable row (${label})`, async ({
      page,
    }, info) => {
      await open(page, viewport.width, viewport.height, theme);
      const initial = await state(page);
      await info.attach("initial-native-selection-history.json", {
        body: JSON.stringify(initial),
        contentType: "application/json",
      });
      await page.screenshot({ path: info.outputPath("idle.png") });
      const header = await record(
        page.locator(".w-document-header"),
        info,
        "header"
      );
      expect(header.box.height).toBeLessThanOrEqual(56);
      const zoom = await record(
        page.locator(".w-document-header .w-zoom-control"),
        info,
        "header-zoom"
      );
      for (const control of zoom.controls) {
        expect(
          control.box.height,
          control.name ?? "zoom"
        ).toBeGreaterThanOrEqual(32);
        expect(
          control.box.width,
          control.name ?? "zoom"
        ).toBeGreaterThanOrEqual(32);
        expect(control.hit, control.name ?? "zoom").toBe(true);
      }
      expect(
        (await page
          .locator(".w-document-header .doc-title-docTitle")
          .boundingBox())!.height
      ).toBeGreaterThanOrEqual(32);
      await selectText(page);
      await expect(tools(page)).toBeVisible();
      const selected = await state(page);
      expect(selected.document).toEqual(initial.document);
      await compact(tools(page), info, "selected-text");
      await page.screenshot({ path: info.outputPath("selected-text.png") });
      await tools(page).locator(".w-toolbar-style").focus();
      await expect(page.getByRole("tooltip")).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(tools(page)).toHaveCount(0);
      expect(await state(page)).toEqual(selected);
      await selectText(page);
      await expect(tools(page)).toBeVisible();
      expect(await native(page)).toBe(JSON.stringify(initial.document));
    });
    test(`Word selected table stays one compact reachable row (${label})`, async ({
      page,
    }, info) => {
      await open(page, viewport.width, viewport.height, theme);
      const before = await native(page);
      await page.locator("#editor .w-cell").first().click();
      const surface = page.getByLabel("선택한 표 도구", { exact: true });
      await expect(surface).toBeVisible();
      expect(await native(page)).toBe(before);
      await compact(surface, info, "selected-table");
      await page.screenshot({ path: info.outputPath("selected-table.png") });
    });
    test(`Word whole tools are temporary and preserve document body space (${label})`, async ({
      page,
    }, info) => {
      await open(page, viewport.width, viewport.height, theme);
      const before = await state(page);
      const bodyBefore = await page.locator(".w-shell-body").boundingBox();
      await page
        .getByRole("button", { name: "전체 도구 펼치기", exact: true })
        .click();
      await expect(
        page.getByRole("tab", { name: "홈", exact: true })
      ).toBeVisible();
      const detail = page.locator("[data-word-detail]");
      await detail.evaluate(async element => {
        await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})));
      });
      await expect.poll(() => detail.evaluate(element => getComputedStyle(element).opacity)).toBe("1");
      await page.screenshot({ path: info.outputPath("whole-tools.png") });
      const bodyAfter = await page.locator(".w-shell-body").boundingBox();
      await info.attach("whole-tools-layout.json", {
        body: JSON.stringify({
          bodyBefore,
          bodyAfter,
          chrome: await page.locator(".w-chrome").boundingBox(),
        }),
        contentType: "application/json",
      });
      expect(await native(page)).toBe(JSON.stringify(before.document));
      expect(bodyAfter).toEqual(bodyBefore);
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("tab", { name: "홈", exact: true })
      ).not.toBeVisible();
      await expect(page.locator("[data-word-detail]")).toHaveAttribute(
        "inert",
        ""
      );
      await expect(page.locator("[data-word-detail]")).toHaveAttribute(
        "hidden",
        ""
      );
    });
  }

test("More closes as an owned layer and its real underline edit survives undo and reopen", async ({
  page,
}, info) => {
  await open(page, 1440, 900, "light");
  // Export through the actual file menu. The initial stored row can predate its runtime restore.
  await page.getByRole("menuitem", { name: "문서 메뉴", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "저장", exact: true }).click();
  const path = await (await download).path();
  if (!path) throw new Error("Native Word file download unavailable");
  const currentFile = JSON.parse(readFileSync(path, "utf8"));
  await prose(page).locator(".mark-code").dblclick();
  await expect
    .poll(() => page.evaluate(() => getSelection()?.toString()))
    .toBe("Normal");
  await expect
    .poll(() => page.evaluate(() => window.editor.selection?.endOffset))
    .toBe(6);
  const before = await state(page);
  const sourceBefore = currentFile as { document: typeof before.document };
  await info.attach("exported-current-before-edit-native.json", {
    body: JSON.stringify(sourceBefore.document),
    contentType: "application/json",
  });
  const more = page.getByLabel("추가 Word 서식", { exact: true });
  const trigger = tools(page).getByRole("button", {
    name: "추가 서식",
    exact: true,
  });
  await trigger.click();
  await expect(more).toBeVisible();
  await expect
    .poll(() =>
      more.evaluate((element) => element.contains(document.activeElement))
    )
    .toBe(true);
  const font = await more.locator(".w-toolbar-font-family").elementHandle();
  expect(font).not.toBeNull();
  await more.locator(".w-toolbar-font-family").click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(more).not.toBeVisible();
  await expect(more).toHaveAttribute("hidden", "");
  await expect(more).toHaveAttribute("inert", "");
  await expect(trigger).toBeFocused();
  await expect(tools(page)).toBeVisible();
  expect(await font!.evaluate((element) => element.isConnected)).toBe(true);
  expect(await state(page)).toEqual(before);
  for (const tip of await page.getByRole("tooltip").all()) {
    expect(
      await tip.evaluate((element) =>
        [...document.querySelectorAll<HTMLElement>("[aria-describedby]")].some(
          (control) =>
            control
              .getAttribute("aria-describedby")
              ?.split(" ")
              .includes(element.id) && !!control.getClientRects().length
        )
      )
    ).toBe(true);
  }
  await trigger.click();
  await expect(more).toBeVisible();
  await expect
    .poll(() =>
      more.evaluate((element) => element.contains(document.activeElement))
    )
    .toBe(true);
  expect(
    await font!.evaluate(
      (element) =>
        element ===
        document.querySelector("[data-secondary-popup] .w-toolbar-font-family")
    )
  ).toBe(true);
  await more.getByRole("button", { name: "Underline", exact: true }).click();
  const expected = structuredClone(before.document);
  const mark = (node: {
    text?: string;
    marks?: { stype: string; range: number[] }[];
    content?: unknown[];
  }): boolean => {
    if (
      node.text === "Normal" &&
      node.marks?.some((value) => value.stype === "code")
    ) {
      node.marks = [
        { stype: "code", range: [0, 6] },
        { stype: "underline", range: [0, 6] },
      ];
      return true;
    }
    return (node.content ?? []).some((child) => mark(child as typeof node));
  };
  expect(mark(expected)).toBe(true);
  await expect.poll(() => native(page)).toBe(JSON.stringify(expected));
  await expect(prose(page).locator(".mark-underline")).toHaveText("Normal");
  await page.locator('#editor [contenteditable="true"]').first().focus();
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+z" : "Control+z"
  );
  await expect.poll(() => native(page)).toBe(JSON.stringify(before.document));
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+Shift+z" : "Control+Shift+z"
  );
  await expect.poll(() => native(page)).toBe(JSON.stringify(expected));
  // Start from explicit existing marks. Sparse imported-mark undo is a separate known limit.
  await prose(page).locator(".mark-code").dblclick();
  await expect
    .poll(() => page.evaluate(() => getSelection()?.toString()))
    .toBe("Normal");
  await expect
    .poll(() => page.evaluate(() => window.editor.selection?.endOffset))
    .toBe(6);
  const colour = tools(page).getByRole("button", {
    name: "Text colour",
    exact: true,
  });
  await colour.focus();
  await page.keyboard.press("Enter");
  const palette = page.getByRole("group", { name: "Text colour", exact: true });
  await expect(palette).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).not.toBeVisible();
  await expect(colour).toBeFocused();
  await expect(tools(page)).toBeVisible();
  expect(await native(page)).toBe(JSON.stringify(expected));
  await page.keyboard.press("Enter");
  await expect(palette).toBeVisible();
  for (let step = 0; step < 20; step++) {
    if (
      await palette
        .getByRole("button", { name: "Red", exact: true })
        .evaluate((element) => element === document.activeElement)
    )
      break;
    await page.keyboard.press("Tab");
  }
  await expect(
    palette.getByRole("button", { name: "Red", exact: true })
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(palette).not.toBeVisible();
  const coloured = structuredClone(expected);
  const setExpectedColour = (node: {
    text?: string;
    marks?: {
      stype: string;
      range: number[];
      attrs?: Record<string, string>;
    }[];
    content?: unknown[];
  }): boolean => {
    if (
      node.text === "Normal" &&
      node.marks?.some((value) => value.stype === "code")
    ) {
      node.marks.push({
        stype: "fontColor",
        attrs: { color: "FF0000" },
        range: [0, 6],
      });
      return true;
    }
    return (node.content ?? []).some((child) =>
      setExpectedColour(child as typeof node)
    );
  };
  expect(setExpectedColour(coloured)).toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.editor.exportDocument()))
    .toEqual(coloured);
  await expect(prose(page).locator(".mark-fontColor")).toHaveCSS(
    "color",
    "rgb(255, 0, 0)"
  );
  await page.locator('#editor [contenteditable="true"]').first().focus();
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+z" : "Control+z"
  );
  await expect.poll(() => native(page)).toBe(JSON.stringify(expected));
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+Shift+z" : "Control+Shift+z"
  );
  await expect
    .poll(() => page.evaluate(() => window.editor.exportDocument()))
    .toEqual(coloured);
  await expect(page.locator("[data-word-save-status]")).toHaveText("저장됨");
  const expectedSource = structuredClone(sourceBefore.document);
  const setExpectedSourceMarks = (node: {
    text?: string;
    marks?: {
      stype: string;
      range: number[];
      attrs?: Record<string, string>;
    }[];
    content?: unknown[];
  }): boolean => {
    if (
      node.text === "Normal" &&
      node.marks?.some((value) => value.stype === "code")
    ) {
      node.marks = [
        { stype: "code", range: [0, 6] },
        { stype: "underline", range: [0, 6] },
        { stype: "fontColor", attrs: { color: "FF0000" }, range: [0, 6] },
      ];
      return true;
    }
    return (node.content ?? []).some((child) =>
      setExpectedSourceMarks(child as typeof node)
    );
  };
  expect(setExpectedSourceMarks(expectedSource)).toBe(true);
  await expect
    .poll(async () =>
      (await savedFiles(page)).map((text) => JSON.parse(text).document)
    )
    .toEqual([expectedSource]);
  const savedBytes = await savedFiles(page);
  await info.attach("expected-canonical-native.json", {
    body: JSON.stringify(expectedSource),
    contentType: "application/json",
  });
  await info.attach("saved-native-files.json", {
    body: JSON.stringify(savedBytes),
    contentType: "application/json",
  });
  await info.attach("expected-coloured-native.json", {
    body: JSON.stringify(coloured),
    contentType: "application/json",
  });
  await expect(page.locator("[data-word-save-status]")).toHaveText("저장됨");
  await info.attach("expected-underlined-native.json", {
    body: JSON.stringify(expected),
    contentType: "application/json",
  });
  await page.reload();
  await settled(page);
  expect(await savedFiles(page)).toEqual(savedBytes);
  await expect(prose(page).locator(".mark-underline")).toHaveText("Normal");
  await expect(prose(page).locator(".mark-fontColor")).toHaveCSS(
    "color",
    "rgb(255, 0, 0)"
  );
});

test("whole tools preserve space and show the actual ruler only by explicit choice", async ({
  page,
}, info) => {
  await open(page, 1440, 900, "light");
  const before = await native(page);
  const body = await page.locator(".w-shell-body").boundingBox();
  await page
    .getByRole("button", { name: "전체 도구 펼치기", exact: true })
    .click();
  const detail = page.getByLabel("전체 Word 도구", { exact: true });
  await expect(detail).toBeVisible();
  expect(await page.locator(".w-shell-body").boundingBox()).toEqual(body);
  await detail.getByRole("tab", { name: "보기", exact: true }).click();
  const ruler = detail.getByRole("button", { name: "눈금자", exact: true });
  await expect(ruler).toHaveAttribute("aria-pressed", "false");
  await ruler.click();
  await expect(page.locator(".w-ruler")).toBeVisible();
  await expect(ruler).toHaveAttribute("aria-pressed", "true");
  expect(await native(page)).toBe(before);
  await ruler.click();
  await expect(page.locator(".w-ruler")).toHaveCount(0);
  expect(await page.locator(".w-shell-body").boundingBox()).toEqual(body);
  await page.keyboard.press("Escape");
  await expect(detail).not.toBeVisible();
  await expect(detail).toHaveAttribute("inert", "");
  expect(await native(page)).toBe(before);
  await info.attach("ruler-tool-only-native.json", {
    body: before,
    contentType: "application/json",
  });
});

test("retired full-tool font completion cannot edit after close and reopen", async ({
  page,
}, info) => {
  await open(page, 1440, 900, "light");
  const prose = page
    .locator("#editor .w-paragraph")
    .filter({ hasText: "This paragraph takes its " })
    .first();
  await prose.locator(".mark-code").dblclick();
  await expect
    .poll(() => page.evaluate(() => getSelection()?.toString()))
    .toBe("Normal");
  await expect
    .poll(() => page.evaluate(() => window.editor.selection?.endOffset))
    .toBe(6);
  const before = await page.evaluate(() =>
    JSON.stringify(window.editor.exportDocument())
  );
  await page
    .getByRole("button", { name: "전체 도구 펼치기", exact: true })
    .click();
  const detail = page.getByLabel("전체 Word 도구", { exact: true });
  await expect(detail).toBeVisible();
  await page.evaluate(() => {
    const loader = window.wordFonts;
    if (!loader) throw new Error("Missing real loader");
    const original = loader.ensure.bind(loader);
    let release: () => void = () => {};
    loader.ensure = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
    Object.assign(window, {
      releaseWordFont: () => {
        loader.ensure = original;
        release();
      },
    });
  });
  await detail.locator(".w-toolbar-font-family").click();
  await page.getByRole("option", { name: "Arial", exact: true }).click();
  await page
    .getByRole("button", { name: "전체 도구 접기", exact: true })
    .click();
  await expect(detail).not.toBeVisible();
  await page
    .getByRole("button", { name: "전체 도구 펼치기", exact: true })
    .click();
  await expect(detail).toBeVisible();
  const retained = await page.evaluate(() =>
    JSON.stringify(window.editor.exportDocument())
  );
  expect(retained).toBe(before);
  await page.evaluate(() =>
    (window as unknown as { releaseWordFont(): void }).releaseWordFont()
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
  const after = await page.evaluate(() =>
    JSON.stringify(window.editor.exportDocument())
  );
  await info.attach("before-native.json", {
    body: before,
    contentType: "application/json",
  });
  await info.attach("after-native.json", {
    body: after,
    contentType: "application/json",
  });
  await page.screenshot({ path: info.outputPath("retired-font.png") });
  expect(after).toBe(before);
});

test("a long title preserves the compact dark header and owned secondary tools at 1280", async ({
  page,
}, info) => {
  await open(page, 1280, 800, "dark");
  const title =
    "검증 문서 — Long document title with a complete retained value ".repeat(8);
  const input = page.locator(".w-document-header .doc-title-docTitle");
  await input.fill(title);
  await input.press("Tab");
  await expect(page.locator("[data-word-save-status]")).toHaveText("저장됨");
  await expect(input).toHaveValue(title);
  const before = await native(page);
  const header = await record(
    page.locator(".w-document-header"),
    info,
    "long-title-header"
  );
  expect(header.box.height).toBeLessThanOrEqual(56);
  expect(header.scrollWidth).toBeLessThanOrEqual(header.clientWidth);
  for (const control of header.controls) {
    expect(control.box.left).toBeGreaterThanOrEqual(0);
    expect(control.box.right).toBeLessThanOrEqual(1280);
    expect(control.box.top).toBeGreaterThanOrEqual(header.box.top);
    expect(control.box.bottom).toBeLessThanOrEqual(header.box.bottom);
    expect(control.hit, control.name ?? "header control").toBe(true);
  }
  await selectText(page);
  await compact(tools(page), info, "long-title-selected");
  await tools(page)
    .getByRole("button", { name: "추가 서식", exact: true })
    .click();
  const more = page.getByLabel("추가 Word 서식", { exact: true });
  await expect(more).toBeVisible();
  await expect
    .poll(() =>
      more.evaluate((element) => element.contains(document.activeElement))
    )
    .toBe(true);
  await info.attach("secondary-initial-focus.json", {
    body: JSON.stringify(await page.evaluate(() => ({
      active: document.activeElement?.outerHTML,
      tips: [...document.querySelectorAll('[data-office-tooltip]')].map(element => ({ id: element.id, text: element.textContent })),
    }))), contentType: "application/json",
  });
  await expect(more.getByRole("button", { name: "Underline", exact: true })).toBeFocused();
  await expect(page.getByRole("tooltip")).toHaveText("Underline");
  // The initial enabled action has its own tooltip layer before the popup.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(more).toBeVisible();
  await expect(tools(page)).toBeVisible();
  expect(await native(page)).toBe(before);
  await page.keyboard.press("Escape");
  await expect(more).not.toBeVisible();
  await expect(tools(page).getByRole("button", { name: "추가 서식", exact: true })).toBeFocused();
  await expect(tools(page)).toBeVisible();
  expect(await native(page)).toBe(before);
  await page.screenshot({ path: info.outputPath("long-title-dark.png") });
  await page.reload();
  await settled(page);
  await expect(input).toHaveValue(title);
});
