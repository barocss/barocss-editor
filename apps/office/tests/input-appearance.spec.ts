import { expect, test, type Locator, type Page } from '@playwright/test';

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await Promise.all(document.getAnimations().filter(animation =>
      animation.effect?.getComputedTiming().iterations !== Infinity
    ).map(animation => animation.finished.catch(() => {})));
  });
}

async function paint(field: Locator) {
  return field.evaluate(element => {
    const style = getComputedStyle(element), rect = element.getBoundingClientRect();
    return {
      width: rect.width, height: rect.height,
      padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft],
      borderWidth: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
      borderColor: style.borderTopColor, shadow: style.boxShadow,
      outlineStyle: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth),
      outlineOffset: parseFloat(style.outlineOffset), focusVisible: element.matches(':focus-visible'),
    };
  });
}

// Resolve actual color-mix/alpha paint against the field or the outside surface.
async function contrast(field: Locator, property: string, outside = false) {
  return field.evaluate((element, options) => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    const rgba = (color: string) => {
      context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    };
    const blend = (front: number[], back: number[]) => [0, 1, 2]
      .map(index => front[index] * front[3] / 255 + back[index] * (1 - front[3] / 255)).concat(255);
    const ancestors: Element[] = [];
    for (let node: Element | null = options.outside ? element.parentElement : element; node; node = node.parentElement) ancestors.unshift(node);
    const background = ancestors.reduce((back, node) => blend(rgba(getComputedStyle(node).backgroundColor), back), [255, 255, 255, 255]);
    const foreground = blend(rgba(getComputedStyle(element).getPropertyValue(options.property)), background);
    const luminance = (color: number[]) => {
      const linear = color.slice(0, 3).map(channel => {
        const value = channel / 255;
        return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
      });
      return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
    };
    const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
    return (values[1] + .05) / (values[0] + .05);
  }, { property, outside });
}

async function keyboardFocus(page: Page, field: Locator) {
  // Use the real tab order to return to the field, as in shared-foundations.spec.ts.
  await field.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(field).toBeFocused();
  await settle(page);
  const current = await paint(field);
  expect(current.focusVisible).toBe(true);
  expect(current.outlineStyle).toBe('solid');
  expect(current.outlineWidth).toBeGreaterThanOrEqual(2);
  expect(current.outlineOffset).toBeGreaterThanOrEqual(2);
  expect(current.shadow).toBe('none');
  expect(await contrast(field, 'outline-color', true)).toBeGreaterThanOrEqual(3);
  return current;
}

function stableGeometry(current: Awaited<ReturnType<typeof paint>>, normal: Awaited<ReturnType<typeof paint>>) {
  expect(current.width).toBe(normal.width);
  expect(current.height).toBe(normal.height);
  expect(current.padding).toEqual(normal.padding);
  expect(current.borderWidth).toEqual(normal.borderWidth);
}

for (const theme of ['light', 'dark']) {
  test.describe(`${theme} input appearance`, () => {
    test.use({ viewport: { width: 1280, height: 900 } });
    test.beforeEach(async ({ page }) => {
      await page.goto('/design-system/index.html#fields');
      await page.getByRole('combobox', { name: '시스템 테마' }).click();
      await page.getByRole('option', { name: theme === 'light' ? '밝은 테마' : '어두운 테마', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await settle(page);
    });

    test('text, number and multiline have one thin edge and separate keyboard focus without resizing', async ({ page }, info) => {
      const readings: Record<string, unknown> = {};
      for (const [section, role, name, padding] of [
        ['fields', 'textbox', '확정형 문서 이름', '4px'],
        ['fields', 'spinbutton', '정밀한 길이', '4px'],
        ['multiline', 'textbox', '확정형 여러 줄', '8px'],
      ] as const) {
        await page.locator(`.ds-navigation a[href="#${section}"]`).click();
        const field = page.locator(`#${section}`).getByRole(role, { name, exact: true });
        await field.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        await field.evaluate(element => (element as HTMLElement).blur());
        await settle(page);
        const normal = await paint(field);
        expect(normal.shadow, name).toBe('none');
        expect(normal.borderWidth, name).toEqual(['1px', '1px', '1px', '1px']);
        expect([normal.padding[1], normal.padding[3]], name).toEqual([padding, padding]);
        expect(await contrast(field, 'color')).toBeGreaterThanOrEqual(4.5);
        expect(await contrast(field, 'border-top-color')).toBeGreaterThanOrEqual(3);
        await field.hover(); await settle(page);
        const hover = await paint(field);
        expect(hover.shadow, name).toBe('none');
        stableGeometry(hover, normal);
        const focus = await keyboardFocus(page, field);
        stableGeometry(focus, normal);
        if (role === 'spinbutton' || section === 'multiline') {
          // Prefix/unit and textarea wrappers must not add a second painted edge.
          const wrapper = await paint(field.locator('..'));
          expect(wrapper.shadow, `${name} wrapper`).toBe('none');
          expect(wrapper.borderWidth, `${name} wrapper`).toEqual(['0px', '0px', '0px', '0px']);
        }
        readings[name] = { normal, hover, focus };
      }
      await info.attach(`input-paint-${theme}`, { body: JSON.stringify(readings, null, 2), contentType: 'application/json' });
    });

    test('invalid input keeps its danger edge and description during separate keyboard focus', async ({ page }) => {
      const field = page.getByRole('textbox', { name: '오류 입력 예시', exact: true });
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      await expect(field).toHaveAttribute('aria-describedby', 'field-example-error');
      await expect(page.locator('#field-example-error')).toHaveText('이름을 입력하세요.');
      const danger = await field.evaluate(element => {
        const probe = document.createElement('span'); probe.style.color = 'var(--ou-danger)';
        element.parentElement!.append(probe);
        const color = getComputedStyle(probe).color; probe.remove(); return color;
      });
      await field.scrollIntoViewIfNeeded(); await page.mouse.move(0, 0); await settle(page);
      const normal = await paint(field);
      expect(normal.borderColor).toBe(danger);
      expect(normal.shadow).toBe('none');
      expect(await contrast(field, 'border-top-color')).toBeGreaterThanOrEqual(3);
      expect(await contrast(page.locator('#field-example-error'), 'color')).toBeGreaterThanOrEqual(4.5);
      await field.hover(); await settle(page);
      const hover = await paint(field);
      expect(hover.borderColor).toBe(danger); stableGeometry(hover, normal);
      const focus = await keyboardFocus(page, field);
      expect(focus.borderColor).toBe(danger); stableGeometry(focus, normal);
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      await expect(field).toHaveAttribute('aria-describedby', 'field-example-error');
    });

    test('readonly and disabled inputs retain native semantics; explicit property padding survives states', async ({ page }) => {
      for (const [section, readonlyName, disabledName] of [
        ['fields', '읽기 전용 예시', '비활성 입력 예시'],
        ['multiline', '읽기 전용 여러 줄', '비활성 여러 줄'],
      ]) {
        await page.locator(`.ds-navigation a[href="#${section}"]`).click();
        const readonly = page.getByRole('textbox', { name: readonlyName, exact: true });
        const disabled = page.getByRole('textbox', { name: disabledName, exact: true });
        await expect(readonly).toHaveAttribute('readonly', '');
        await expect(readonly).not.toBeDisabled();
        const value = await readonly.inputValue();
        await keyboardFocus(page, readonly); await page.keyboard.type('changed');
        await expect(readonly).toHaveValue(value);
        await expect(disabled).toBeDisabled();
        await disabled.evaluate(element => (element as HTMLElement).focus());
        await expect(disabled).not.toBeFocused();
        expect((await paint(disabled)).shadow).toBe('none');
      }
      await page.locator('.ds-navigation a[href="#properties"]').click();
      const property = page.getByRole('spinbutton', { name: '예시 너비', exact: true });
      await property.scrollIntoViewIfNeeded(); await page.mouse.move(0, 0); await settle(page);
      const normal = await paint(property);
      // PropertyNumber supplies padding="px-1.5"; comfortable paint must preserve it.
      expect([normal.padding[1], normal.padding[3]]).toEqual(['6px', '6px']);
      await property.hover(); await settle(page); stableGeometry(await paint(property), normal);
      stableGeometry(await keyboardFocus(page, property), normal);
    });
  });
}
