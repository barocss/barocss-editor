import { test, expect, type Page } from '@playwright/test';
import { slidesPanelRows } from '@barocss/office-slides';
import { visibleBoxes } from './helpers';

/**
 * The panel the deck draws, against the panel it declares.
 *
 * ## Why this exists rather than being unnecessary
 *
 * The site builder's panel is *drawn from* its declaration — `inspector.tsx` maps over
 * `sitePanelRows()`, so there is nothing for the declaration to drift from. The deck's is 2,863
 * lines of JSX that still draw their own rows, and `panel-model.ts` was written by reading them. A
 * declaration written by reading code is exactly the hand-kept list this repository's harness
 * replaced — unless something checks it.
 *
 * This is that check. It is weaker than construction and it is honest about which: mapping over the
 * model makes drift *impossible*, and this makes drift *caught*. The conformance harness now answers
 * "which attributes can a reader set" out of that declaration, so a declaration that has quietly
 * stopped being true would make the harness confidently wrong — which is worse than the silence it
 * replaced.
 *
 * ## What it asks
 *
 * One direction: **every row the model declares is a control the panel draws.** The other direction —
 * every control the panel draws is declared — is not asked here, because the panel generates rows
 * from the document (a fill per fill, a variable row per bindable attribute) and their names are the
 * document's rather than the model's.
 */

const panel = (page: Page) => page.locator('.sl-properties');

const ready = async (page: Page) => {
  await page.goto('/');
  await page.waitForSelector('.sl-stage');
  await page.waitForTimeout(400);
};

/** Select the first box of a kind, wherever on the deck it is, and say what was selected. */
async function selectKind(page: Page, kind: string): Promise<string | null> {
  const slides = await page.locator('.sl-filmstrip button').count();
  for (let index = 0; index < slides; index += 1) {
    await page.locator('.sl-filmstrip button').nth(index).click();
    await page.waitForTimeout(250);
    for (const box of await visibleBoxes(page, '.sl-stage [data-bc-sid]')) {
      await page.mouse.click(box.x, box.y);
      await page.waitForTimeout(150);
      const stype = await page.evaluate(() => {
        const editor = (window as any).editor;
        const sid = editor?.selection?.nodeIds?.[0];
        return sid ? (editor.dataStore.getNode(sid)?.stype as string) : null;
      });
      if (stype === kind) return stype;
    }
  }
  return null;
}

/*
 * Two kinds, and they are the two the sample deck actually holds in quantity — 18 text frames and 2
 * frames. A test that hunts for a shape the sample has none of passes by finding nothing to look at,
 * which is the failure this whole harness is named after: the connector rows are held by
 * `connector.spec.ts`, which *makes* one.
 */
for (const kind of ['textFrame', 'frame']) {
  test(`every row the model declares for a ${kind} is a control the panel draws`, async ({ page }) => {
    await ready(page);
    const found = await selectKind(page, kind);
    // A kind the sample deck does not contain is a gap in the *sample*, and saying so beats a test
    // that passes by finding nothing to look at.
    expect(found, `the sample deck has no ${kind} to select`).toBe(kind);

    const missing: string[] = [];
    for (const row of slidesPanelRows(kind, 'style')) {
      /*
       * A row that only appears inside a definition is not expected on a shape sitting on a slide —
       * and the model says which those are, so this is reading a declaration rather than knowing
       * something about the panel. `components.spec.ts` is where a part is selected.
       */
      if (row.inside) continue;
      /*
       * And a row that belongs to one arrangement rather than to the group — a grid's 열. The
       * sample's frames are not grids, and a check that demanded the row anyway would be demanding
       * a control that would be wrong to draw.
       */
      if (row.when) continue;
      /*
       * A `binds` row draws one control per bindable attribute, named after the attribute — `X 문서
       * 변수`, `색 문서 변수` — so the declared name is a suffix rather than a whole label. Asked as
       * "is there at least one", which is the claim the row actually makes.
       */
      /*
       * **Exact**, and it had to be said: Playwright's `getByLabel(string)` matches a *substring*, so
       * asking for `간격` found `간격 문서 변수` — the variable-binding row — and the check passed
       * over a control that was not drawn at all. A check that can pass by finding the wrong thing is
       * worse than no check, because it is believed.
       */
      const found =
        row.control === 'binds'
          ? await panel(page).getByLabel(new RegExp(`${row.ariaLabel}$`)).count()
          : await panel(page).getByLabel(row.ariaLabel, { exact: true }).count();
      if (found === 0) missing.push(`${row.group} › ${row.ariaLabel}`);
    }

    expect(missing, `declared in panel-model.ts and not drawn for a ${kind}`).toEqual([]);
  });
}
