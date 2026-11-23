import { createRequire } from 'node:module';
const root = "/Users/user/.codex/worktrees/slides-m0-baseline/barocss-editor";
const require = createRequire(root + '/package.json');
const { defineConfig, devices } = require('@playwright/test');
export default defineConfig({
  testDir: root + '/apps/slide/tests', testMatch: 'connector.spec.ts',
  grep: new RegExp("draws\\ a\\ line\\ between\\ them,\\ and\\ the\\ button\\ waits\\ for\\ two$|takes\\ its\\ route\\ and\\ its\\ ends\\ from\\ the\\ panel$|is\\ typed\\ in\\ the\\ panel,\\ drawn\\ on\\ the\\ line,\\ and\\ can\\ be\\ cleared$|is\\ switched\\ on\\ from\\ the\\ panel$|says\\ how\\ many\\ there\\ are,\\ and\\ gives\\ them\\ all\\ back$|swaps\\ the\\ ends\\ from\\ the\\ panel,\\ and\\ the\\ drawing\\ follows$|moves\\ the\\ arrowhead\\ to\\ the\\ other\\ shape$|the\\ later\\ line\\ hops\\ over\\ the\\ earlier\\ one,\\ and\\ only\\ it$|draws\\ exactly\\ one\\ hop\\ for\\ one\\ crossing$|keeps\\ it\\ out\\ of\\ the\\ document,\\ because\\ a\\ crossing\\ is\\ not\\ a\\ decision$|goes\\ away\\ when\\ the\\ lines\\ no\\ longer\\ cross$|is\\ typed\\ in\\ the\\ panel\\ and\\ drawn\\ on\\ the\\ line$|takes\\ the\\ pill\\ with\\ it,\\ so\\ the\\ word\\ is\\ not\\ wider\\ than\\ its\\ own\\ background$|takes\\ a\\ colour,\\ and\\ a\\ theme\\ slot\\ resolves\\ to\\ one$|lets\\ a\\ line\\ take\\ a\\ theme\\ colour\\ for\\ its\\ stroke\\ as\\ well$|is\\ typed\\ in\\ the\\ panel\\ and\\ drawn\\ at\\ its\\ own\\ end$|is\\ clear\\ of\\ the\\ line,\\ and\\ of\\ the\\ label\\ in\\ the\\ middle$|is\\ set\\ in\\ the\\ same\\ type\\ as\\ the\\ rest\\ of\\ the\\ line\u2019s\\ words$|goes\\ when\\ the\\ field\\ is\\ cleared$|passes\\ through\\ the\\ point\\ rather\\ than\\ leaning\\ towards\\ it$|offers\\ the\\ grips\\ a\\ curve\\ could\\ not\\ have\\ before$|takes\\ the\\ bow\\ grip\\ away\\ once\\ a\\ point\\ is\\ placed$"),
  timeout: 30000, globalTimeout: 120000, workers: 1, retries: 0, forbidOnly: true,
  reporter: [['line'], ['json', { outputFile: "/Users/user/barocss-editor/.omx/m0/slides538-browser-v1/result.json" }]],
  outputDir: "/Users/user/barocss-editor/.omx/m0/slides538-browser-v1/artifacts",
  use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:55261', headless: true,
    launchOptions: { executablePath: '/Users/user/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell' },
    screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: '/Users/user/.nvm/versions/node/v22.22.0/bin/node ' + root + '/apps/slide/node_modules/vite/bin/vite.js --config /Users/user/barocss-editor/.omx/m0/slides538-browser-v1/vite.config.mjs --host 127.0.0.1 --port 55261 --strictPort',
    cwd: root + '/apps/slide', url: 'http://127.0.0.1:55261', reuseExistingServer: false, timeout: 60000 }
});
