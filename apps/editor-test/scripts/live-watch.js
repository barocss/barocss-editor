// Live watch: stream browser console + contenteditable HTML to terminal
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';

const BASE_URL = 'http://localhost:5173';
const CONTENT_SEL = '[data-bc-layer="content"]';

// Optional: set expected HTML to assert against
const EXPECTED_HTML = null; // e.g., '<p ...>Hello</p>'

function waitForPort(port, host = '127.0.0.1', timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const socket = net.connect({ port, host }, () => {
        socket.end();
        resolve(true);
      });
      socket.on('error', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error('timeout'));
        else setTimeout(tryOnce, 500);
      });
    };
    tryOnce();
  });
}

async function main() {
  // Start Vite dev server if not running
  const server = spawn('pnpm', ['dev'], { stdio: 'inherit', cwd: process.cwd() });
  let serverRunning = false;
  try {
    await waitForPort(5173);
    serverRunning = true;
  } catch (e) {
    console.error('[live-watch] dev server failed to start in time');
    process.exit(1);
  }
  process.on('exit', () => { try { server.kill(); } catch {} });
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    console.log(`[browser:${type}] ${text}`);
  });

  if (serverRunning) {
    await page.goto(BASE_URL);
  }

  let lastHash = '';
  async function dump() {
    const html = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return el ? el.innerHTML : '';
    }, CONTENT_SEL);

    const hash = String(html.length) + ':' + (html?.slice(0, 64) || '');
    if (hash !== lastHash) {
      console.log('[snapshot] content.innerHTML changed\n', html);
      lastHash = hash;
      if (EXPECTED_HTML != null) {
        const norm = (s) => s.replace(/\s+/g, ' ').trim();
        const ok = norm(html) === norm(EXPECTED_HTML);
        console.log(ok ? '[assert] PASS' : '[assert] FAIL');
      }
    }
  }

  await dump();
  setInterval(dump, 500);

  console.log('[live-watch] watching... Ctrl+C to exit.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


