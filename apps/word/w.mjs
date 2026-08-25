import { chromium } from '@playwright/test';
const shots = '/private/tmp/claude-501/-Users-user-github-barocss-barocss-editor/5b060fff-9d61-4603-ab50-29c21b1a64fd/scratchpad';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto('http://localhost:5180/', { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
await p.screenshot({ path: `${shots}/word-now.png` });
await b.close();
