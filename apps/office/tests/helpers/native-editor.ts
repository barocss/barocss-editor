import { expect, type Frame, type Page } from '@playwright/test';

/** UI and prototype mutations must use the active native document's Window. */
export const nativeEditor = (page: Page) => page.frameLocator('iframe[data-local-native-frame="active"]');
export async function nativeFrame(page: Page): Promise<Frame> {
  const element = page.locator('iframe[data-local-native-frame="active"]');
  await expect(element).toHaveCount(1);
  const frame = await (await element.elementHandle())?.contentFrame();
  if (!frame) throw new Error('The active native document is not connected.');
  return frame;
}
