import { chromium } from '@playwright/test';
const shots = '/private/tmp/claude-501/-Users-user-github-barocss-barocss-editor/5b060fff-9d61-4603-ab50-29c21b1a64fd/scratchpad';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1680, height: 1000 } });
p.on('console', (m) => { if (m.text().startsWith('[up]') || m.text().startsWith('[key]')) console.log(m.text().slice(0, 200)); });
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await p.goto('http://localhost:5182/', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);

const titles = () => p.locator('[data-frame="desktop"] .st-page > .st-stack').nth(1).locator('h3').allTextContents();
console.log('before:', await titles());

const cards = p.locator('[data-frame="desktop"] .st-page > .st-stack').nth(1).locator('.st-stack');
const first = await cards.nth(0).boundingBox();
const third = await cards.nth(2).boundingBox();

// pick up the first card and carry it past the third
await p.mouse.move(first.x + 10, first.y + 10);
await p.mouse.down();
await p.mouse.move(first.x + 60, first.y + 20, { steps: 5 });
await p.waitForTimeout(150);
console.log('line while carrying:', await p.locator('.st-mark-landing').count());
await p.mouse.move(third.x + third.width - 12, third.y + 20, { steps: 8 });
await p.waitForTimeout(200);
console.log('landing index at drop:', await p.locator('[data-frame="desktop"] .st-overlay').getAttribute('data-landing'));
await p.screenshot({ path: `${shots}/site-drag.png` });
await p.mouse.up();
await p.waitForTimeout(500);
console.log('after :', await titles());

// duplicate and delete
await p.locator('[data-frame="desktop"] .st-page > .st-stack').nth(1).locator('h3').first().click({ force: true });
await p.waitForTimeout(300);
await p.keyboard.press('Control+d');
await p.waitForTimeout(400);
console.log('after duplicate:', await p.locator('[data-frame="desktop"] .st-page > .st-stack').count());
await p.keyboard.press('Delete');
await p.waitForTimeout(400);
console.log('after delete   :', await p.locator('[data-frame="desktop"] .st-page > .st-stack').count());
await b.close();
