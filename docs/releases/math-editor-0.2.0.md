# math-editor 0.2.0 release record

Scope: only `@barocss/math-editor` and its dedicated static website. No Note, Word, Slide or other product publication. Note inline editing is resolved according to the user and is outside this release.

Changeset `math-editor-latex-release` selected a minor release. Changesets generated 0.2.0 in an isolated math-only workspace so dependent products were not versioned. The consumed summary is in the package changelog.

Validation:
- Formatting, types, 388 unit tests, package build and eight packed entry points passed.
- Final 379-case Chromium run: 378 passed; the remaining stale collapsed-toolbar test passed in the corrected full 20-case wrapping rerun.
- Documentation links/anchors and production build passed.
- Packed static-site smoke: 12 cases passed across native/framework adapters, equation import/edit and both bundled locales.

Artifact SHA-512 integrity:
`sha512-EFR2XoPYuOpPeByXV1mLm1Q/IwBxU7jH0MKFk434cwqmJ74PbbgkNd3MGljMUq4btDedhA1wvlp8MB003FSWOw==`

npm publication verified: `latest` is 0.2.0 and registry integrity matches the artifact above. The site was rebuilt from the downloaded npm tarball; its output matches the tested candidate except the build timestamp.

Website commit: `3a6d727bcbe1f2e29fdb6ca0699be46ebde74bb8` in `barocss/math-editor-site`, pushed to `main`. GitHub Pages build completed for this commit. The live domain release.json reports 0.2.0 and the identical npm integrity. Live index, guide and entry assets passed HTTP checks. The public guide identifies version 0.2.0.

Live Playwright navigation was unavailable (`ERR_INTERNET_DISCONNECTED` in the browser runtime). The identical packaged static build passed the 12-case local production smoke before deployment; no live-browser interaction claim is made.
