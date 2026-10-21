# Original Wonffice on Sites

This adapter builds the existing `apps/office` application with its original Vite config.
The entry remains `apps/office/src/main.tsx`, `WorkspaceHome` and the original Note, Word,
Slides and Site product entry modules. It preserves the original UI and IndexedDB storage;
it does not mount the separate Note trial workspace or replace product screens.

`VITE_OFFICE_AUTH_MODE=local` is set explicitly for the build, even if the builder inherited
an OIDC setting. The original browser workspace ID stays in localStorage and documents stay
in this browser/origin's IndexedDB. This is not server synchronization or cross-device save.
Keep the same owner-private Site `appgprj_6ad87b804224819184add84f015d82ba` and its existing
`d1: "DB", r2: null` manifest. The previous trial's API and D1 data remain available unchanged;
Office's browser-local mode does not call that API. Existing Drizzle files are copied only
when absent and must match byte-for-byte when already present. No schema or data is deleted.

## Source-based remote build

The parent owns synchronization/publication with the official Sites workflow. Preserve the
separate Sites checkout's `.git`, root hosting manifest, audience and applied migrations.
Export the exact pushed GitHub source into it, then change **only the derived Sites source**
root `package.json` build script to:

```json
"build": "node apps/office/sites/build-sites-target.mjs"
```

Do not use the previous `apps/note/cloud-workspace/build-sites-target.mjs` entry for this app.
No dependency/lock/engine change or artifact attachment is needed. Save the pushed Sites SHA
through the supported source-only remote-build fallback and deploy that saved version using
the owner-private operation. Keep the GitHub SHA and Sites source SHA/version distinct.

The new target resolves installed Vite CLIs and runs them with `process.execPath`; no global
pnpm/npm/npx executable is required by the target. It builds schema, the unchanged Office
HTML inputs, then the hosting Worker. Output is `dist/server/index.js` plus the retained
`dist/.openai/hosting.json` and root `drizzle/` for official hosting. There is no static+D1 mode.

All six original HTML entries are retained: root, design-system and
`products/{note,word,slides,site}/index.html`, together with all emitted assets. The Worker
serves `/{workspaceId}` and `/{workspaceId}/{itemId}` in place from the root HTML without a
redirect, keeping query parameters and `__native_frame`. Missing assets and APIs return
non-HTML errors. It adds no iframe sandbox or frame-denial header; original same-origin
native-frame handshakes and browser history remain owned by Office.

## Verification

Run after building in the derived checkout, using already-installed dependencies:

```sh
node --experimental-vm-modules --test apps/office/sites/worker.test.mjs
pnpm --dir apps/office exec playwright test --config sites/playwright.config.ts --reporter=line
```

The browser harness is loopback-only, uses installed CLOUD Chromium, supplies no fake
identity, and never ships in the Worker. `OFFICE_WORKER_PATH` may point to a separately built
Worker when the tests run from the GitHub checkout. Browser tests create labelled QA data
only in a fresh local browser context. They cover original home/library/project persistence,
four-product create/edit/undo/redo, IndexedDB save/reopen, compact URL reload, active native
iframes and back/forward navigation. They also reject local API/OIDC calls. The unchanged
Site sample preview attempts its `barocss.example` video asset; this is recorded separately.

The actual target passed with an empty PATH on Node 22.22.0 and 24.19.0, including an inherited
OIDC-mode variable. The recorded build has 127 assets, Worker size 9,466,194 bytes and gzip
3,500,326 bytes. The full preflight previously running on `f2771237` completed with exit 0;
the Worker SHA-256 is `fce81ca8e8411e2474cb44f9a6d363c97a12865a0188bc1dacf7f6e516db0220`.
This adapter uses targeted lint, Office type checks, the Worker contract and browser checks.
No lint/type budget is raised and no whole-repository or whole-product scenario-green claim
is made. Original scenario debt, physical OS IME and mobile-device QA remain separate.

These are CLOUD production-build tests on loopback, not hosted identity/D1 acceptance.
The previous attempt to reach the real Sites origin from this CLOUD failed with Chromium
`ERR_TUNNEL_CONNECTION_FAILED` and DNS `EAI_AGAIN`. It was not retried or bypassed. The parent
must publish this new entry and verify the hosted original app; this child does not deploy.
