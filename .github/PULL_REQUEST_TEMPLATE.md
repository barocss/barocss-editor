## What changed

- **Scope**: (e.g. new feature `insertList` / fix insertParagraph selection / E2E only)
- **Packages or apps touched**: (e.g. model, extensions, apps/editor-react)

## Verification (run before opening PR)

- [ ] Unit tests: `pnpm --filter @barocss/<package> test:run` for each touched package (see `.cursor/AGENTS.md` § What you changed → what to run)
- [ ] E2E (if model/extension/view touched): `pnpm test:e2e:react` or `pnpm test:e2e`
- [ ] CI will run: `pnpm install`, `pnpm lint`, `pnpm type-check`, `pnpm test` (and optionally E2E if enabled)

## Related

- Issue: (link or "none")
- Ref: `.cursor/AGENTS.md` (verification by scenario), `docs/testing-verification.md`
