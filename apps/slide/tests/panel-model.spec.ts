import { test, expect, type Page } from '@playwright/test';
import { getSlidesSchemaDefinition, slidesPanelRows } from '@barocss/office-slides';
import { createSchema } from '@barocss/schema';
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

/**
 * Where a row belongs is the **schema's** answer, so this asks it the same way the panel does.
 *
 * Asking without it returns every row for every box, and the check then demands a `휘어짐` on a text
 * frame — a control it would be wrong to draw. The lists this replaced got 27 such entries wrong,
 * which is why the question moved to the schema in the first place.
 */
const schema = createSchema('slides', getSlidesSchemaDefinition() as never) as never as {
  nodes: Map<string, { attrs?: Record<string, unknown> }>;
};
const declares = (stype: string, attr: string) => schema.nodes.get(stype)?.attrs?.[attr] !== undefined;

/**
 * How many controls the panel draws for a row.
 *
 * Three ways of asking, because a row is not always a labelled field:
 *
 * - a **binds** row draws one control per bindable attribute, named after the attribute — `X 문서
 *   변수` — so the declared name is a suffix;
 * - an **action** row is a button whose accessible name is its own words (지우기, 뒤집기), which is
 *   a *role* question rather than a label one;
 * - everything else is a field with an accessible name, asked **exactly** — Playwright's
 *   `getByLabel(string)` matches a substring, and asking for `간격` once found `간격 문서 변수` and
 *   passed over a control that was not drawn at all.
 */
async function drawn(page: Page, row: { control: string; ariaLabel: string }): Promise<number> {
  if (row.control === 'binds') return panel(page).getByLabel(new RegExp(`${row.ariaLabel}$`)).count();
  if (row.control === 'action') return panel(page).getByRole('button', { name: row.ariaLabel }).count();
  return panel(page).getByLabel(row.ariaLabel, { exact: true }).count();
}

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
/**
 * A connector, made rather than looked for.
 *
 * The sample deck holds none, so a check that only selects what is already there had **nothing to
 * look at** for eleven declared rows — and four of them were wrong: `경로` declared as
 * `연결선 모양`, `흐름` as `화살표`, `구부리기` as `휘어짐`. A check that passes by finding nothing
 * is the failure this harness is named after.
 */
async function joinTwoShapes(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const editor = (window as any).editor;
    await editor.executeCommand('insertRectangle', { x: 1200, y: 1200, width: 3000, height: 1500 });
    const a = editor.selection?.nodeIds?.[0];
    await editor.executeCommand('insertEllipse', { x: 9000, y: 6000, width: 3000, height: 1500 });
    const b = editor.selection?.nodeIds?.[0];
    // In order, because a connector has a direction: the arrowhead is on the end.
    editor.setNode({ nodeIds: [a, b] });
    await editor.executeCommand('insertConnector', {});
  });
  await page.waitForTimeout(500);
}

test('every row the model declares for a connector is a control the panel draws', async ({ page }) => {
  await ready(page);
  await joinTwoShapes(page);

  const stype = await page.evaluate(() => {
    const editor = (window as any).editor;
    const sid = editor?.selection?.nodeIds?.[0];
    return sid ? (editor.dataStore.getNode(sid)?.stype as string) : null;
  });
  expect(stype, 'the connector is what is selected after it is made').toBe('connector');

  /*
   * And a **label**, so the three rows that only appear once there is one are checked rather than
   * skipped. A conditional row skipped by every check is a row nobody has ever looked at — which is
   * how `이름표 크기`, `이름표 색` and `이름표 굵게` came to be declared without anyone knowing
   * whether the panel drew them.
   */
  await panel(page).getByLabel('이름표', { exact: true }).fill('가는 길');
  await panel(page).getByLabel('이름표', { exact: true }).press('Enter');
  await page.waitForTimeout(400);

  const missing: string[] = [];
  for (const row of slidesPanelRows('connector', 'style', declares)) {
    // A waypoint is placed by dragging the line, which is a gesture `connector.spec.ts` holds.
    if (row.inside || row.attr === 'waypoints') continue;
    const found = await drawn(page, row);
    if (found === 0) missing.push(`${row.group} › ${row.ariaLabel}`);
  }
  expect(missing, 'declared in panel-model.ts and not drawn for a connector').toEqual([]);
});

for (const kind of ['textFrame', 'frame']) {
  test(`every row the model declares for a ${kind} is a control the panel draws`, async ({ page }) => {
    await ready(page);
    const found = await selectKind(page, kind);
    // A kind the sample deck does not contain is a gap in the *sample*, and saying so beats a test
    // that passes by finding nothing to look at.
    expect(found, `the sample deck has no ${kind} to select`).toBe(kind);

    const missing: string[] = [];
    for (const row of slidesPanelRows(kind, 'style', declares)) {
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
      if ((await drawn(page, row)) === 0) missing.push(`${row.group} › ${row.ariaLabel}`);
    }

    expect(missing, `declared in panel-model.ts and not drawn for a ${kind}`).toEqual([]);
  });
}
