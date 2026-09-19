# Math repository boundary

Math development moved to the private `barocss/math` repository on 2026-09-19. The local checkout is normally a sibling directory named `math`.

This Office workspace keeps Word, Note, Slide and Site code, their shared packages, and Office-specific math bridges and tests. `office-word`, `office-text` and `office-editor-ui` use the published `@barocss/math-editor` range `^0.8.0`. CI and ordinary installs require no sibling checkout.

## Joint local development

For a temporary source link, add this override to the root package.json and run `pnpm install --no-frozen-lockfile`:

```json
{
  "pnpm": {
    "overrides": {
      "@barocss/math-editor": "link:../math/packages/math-editor"
    }
  }
}
```

Merge it with any existing pnpm settings. Install dependencies in the math checkout first. The linked package uses its source exports; no npm publication is needed. Do not commit the temporary override or its lockfile changes. Remove the override and run `pnpm install --no-frozen-lockfile` to return to the published version. Preserve unrelated changes when updating these files.

Run math package releases and math site builds from the math repository. Existing npm names and public URLs are unchanged.

## Migration backup

The original working files and generated artifacts were moved to `output/math-migration-20260919/original/` after a source hash comparison. This ignored local backup is not a second active workspace. Unrelated working changes were retained.

## Verification

After switching to npm core 0.8.0, Word and Note production builds and 21 math bridge/display unit tests passed. The Note legacy-LaTeX edit/apply/persist browser case passed. Older broad browser specs have stale Office chrome selectors; they are not reported as passing. Detailed migration evidence is in `output/math-migration-20260919/`.
