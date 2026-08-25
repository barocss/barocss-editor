import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await p.goto('http://localhost:5182/', { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
console.log(await p.evaluate(() => {
  const ed = window.editor;
  const names = ['setNode', 'insertSection', 'setStackFormat', 'removeBlocks', 'duplicateBlocks', 'moveBlockInto'];
  return names.map((n) => n + '=' + (ed.hasCommand?.(n) ?? (typeof ed.getCommand === 'function' ? !!ed.getCommand(n) : '?')));
}));
console.log(await p.evaluate(async () => {
  const ed = window.editor;
  const st = ed.dataStore;
  const walk = (sid, out = []) => { const n = st.getNode(sid); if (!n) return out;
    if (n.stype === 'frame') out.push(sid); for (const c of n.content ?? []) if (typeof c === 'string') walk(c, out); return out; };
  const frames = walk(ed.getRootId());
  const row = frames.find((f) => (st.getNode(f).content ?? []).length === 3);
  const kids = st.getNode(row).content.slice();
  const ok = await ed.executeCommand('moveBlockInto', { nodeId: kids[0], parentId: row, index: 2 });
  return { ok, before: kids.join(','), after: st.getNode(row).content.join(',') };
}));
await b.close();
