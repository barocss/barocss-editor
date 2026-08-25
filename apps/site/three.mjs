import { chromium } from '@playwright/test';
const shots = '/private/tmp/claude-501/-Users-user-github-barocss-barocss-editor/5b060fff-9d61-4603-ab50-29c21b1a64fd/scratchpad';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1680, height: 1000 } });
await p.goto('http://localhost:5182/', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
await p.screenshot({ path: `${shots}/site-styled.png` });
await b.close();
