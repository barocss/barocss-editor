// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ColorPalette } from "../src/palette";
import { Toolbar } from "../src/toolbar";

let mount: HTMLDivElement, root: Root;
const pick = vi.fn();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => new DOMRect(100, 100, 180, 40)
  );
  mount = document.createElement("div");
  document.body.append(mount);
  root = createRoot(mount);
  pick.mockClear();
  act(() =>
    root.render(
      createElement(Toolbar, {
        label: "Formatting",
        children: createElement(ColorPalette, {
          id: "text",
          label: "Text colour",
          icon: "A",
          value: null,
          swatches: [{ value: "FF0000", label: "Red" }],
          onPick: pick,
        }),
      })
    )
  );
});
afterEach(() => {
  act(() => root.unmount());
  mount.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const trigger = () =>
  mount.querySelector<HTMLButtonElement>('[data-control="text"]')!;

it("accepts keyboard activation and delivers a colour choice only once", () => {
  act(() => {
    trigger().focus();
    trigger().click();
  });
  const swatch = mount.querySelector<HTMLButtonElement>(
    '[data-swatch="FF0000"]'
  );
  expect(swatch).not.toBeNull();
  act(() => {
    swatch!.focus();
    swatch!.click();
  });
  expect(pick).toHaveBeenCalledTimes(1);
  expect(pick).toHaveBeenCalledWith("FF0000");
  expect(mount.querySelector("[data-palette]")).toBeNull();
  expect(document.activeElement).toBe(trigger());
});

it("returns owned input focus on Escape without delivering a colour edit", () => {
  act(() => {
    trigger().focus();
    trigger().dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, cancelable: true })
    );
  });
  if (!mount.querySelector("[data-palette]")) act(() => trigger().click());
  const field = mount.querySelector<HTMLInputElement>('input[type="color"]')!;
  act(() => field.focus());
  const escape = new KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    cancelable: true,
  });
  act(() => field.dispatchEvent(escape));
  expect(mount.querySelector("[data-palette]")).toBeNull();
  expect(document.activeElement).toBe(trigger());
  expect(escape.defaultPrevented).toBe(true);
  expect(pick).not.toHaveBeenCalled();
});
