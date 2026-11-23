# UI007 evidence preservation

This folder preserves existing results only. No tests, runtime, browser, or product source changes were performed.

- Source: `0071616f7be0cb99ec8b0cc7b3ae2e96525ab98b`.
- Found original25-model logs and explicit types/tests/lint subprocess exit0 at raw transcript lines3769/3771/3772. Copies are byte-identical to the three named `/tmp/533-account-logout-*.log` files.
- Found final four-root types/lint commands at lines3834/3836/3837. TypeScript reports0 diagnostics. The final lint command has no separate exit receipt; the enclosing shell ends with an unrelated successful documentation write.
- GAP: four RED→GREEN reopen checks and30 complete session checks are helper-reported at line3831. Original execution stdout and exact run hashes were not found in the provided parent transcript or named/tmp logs. They are not promoted to independently verified PASS.
- The25-model run preceded final007. Its imported durable-session source later changed. Source bindings and the exact restore fix are preserved, but no exact whole-import-graph runtime hash was recorded at that run.
- Genuine OIDC, PostgreSQL, currentACL, browser/IDB, relay logout/restart and physical IME remain NOT RUN by this preservation. Integration owns actual account-browser proof.

`receipt.json` records origin line numbers, raw line hashes, environment, source hashes, result limits and all artifact SHA256/byte counts. Original files remain unchanged.
