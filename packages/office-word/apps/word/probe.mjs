import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
await page.goto('http://localhost:5177/');
await page.waitForTimeout(3000);
console.log(JSON.stringify(await page.evaluate(() => {
  const ed = window.editor;
  const store = ed.dataStore;
  const root = store.getNode(ed.getRootId());
  const surface = (root.content ?? []).map((s) => store.getNode(s)).find((n) => n?.stype === 'surface');
  const heads = [];
  const walk = (sid, d) => { const n = store.getNode(sid); if (!n || d > 40) return; if (n.stype === 'heading') heads.push({ sid: n.sid, style: n.attributes?.styleId, numId: n.attributes?.numId ?? null, level: n.attributes?.level }); for (const c of n.content ?? []) if (typeof c === 'string') walk(c, d + 1); };
  walk(surface.sid, 0);
  return { headings: heads.slice(0, 5), count: heads.length };
}), null, 1));
await browser.close();
