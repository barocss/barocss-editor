import { expect, type Frame, type Locator, type Page } from '@playwright/test';

/** Enter the owner's public menu, including its portalled action list. */
export async function projectFeedbackAction(owner: Page | Locator | Frame, name: string, portalOwner?: Frame) {
  // Frame.page() returns the outer page; its portals still belong to the frame.
  const surface = portalOwner ?? ('parentFrame' in owner ? owner : 'page' in owner ? owner.page() : owner);
  const trigger = owner.getByRole('menuitem', { name: '프로젝트 메뉴', exact: true });
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  const role = name === '프로젝트 의견 남기기' ? 'menuitem' : 'menuitemcheckbox';
  const action = surface.getByRole('menu', { name: '프로젝트 메뉴', exact: true }).getByRole(role, { name, exact: true });
  await expect(action).toBeVisible();
  return action;
}
