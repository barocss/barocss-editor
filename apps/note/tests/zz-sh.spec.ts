import { test } from '@playwright/test';
test('Shift+→ 가 블록을 넘을 때', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1400 });
  await page.goto('/');
  await page.waitForFunction(() => document.querySelectorAll('[data-note-body] .on-doc').length === 3);
  await page.waitForTimeout(400);
  const c = page.locator('[data-case="long"]');
  await c.locator('[data-note-body] p').first().click();
  await page.waitForTimeout(250);
  const say = (t: string) => page.evaluate((tag) => {
    const ed: any = (window as any).__notes.long.editor; const s = ed.selection;
    const at = (sid?: string) => { if (!sid) return '?'; const n = ed.dataStore.getNode(sid);
      return `${sid.split(':')[1]}:${n?.stype}(${typeof n?.text === 'string' ? JSON.stringify(n.text.slice(0,4)) : '—'})`; };
    return `${tag} ${at(s?.startNodeId)}:${s?.startOffset} → ${at(s?.endNodeId)}:${s?.endOffset} dir=${s?.direction} dom=${(document.getSelection()?.toString() ?? '').length}`;
  }, t);
  console.log(await say('시작'));
  let last = '';
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(60);
    const now = await say(`+${i + 1}`);
    const bad = now.includes('dom=0') || /(\d+)\(.*\):\d+ → /.test(now) && (() => {
      const m = now.match(/ (\d+)\(.*?\):(\d+) → (\d+)\(/); return m ? Number(m[1]) > Number(m[3]) : false;
    })();
    if (bad) { console.log('직전:', last); console.log('뒤집힘:', now); break; }
    last = now;
  }
});
