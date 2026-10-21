# Wonffice localization

All built-in translations belong to `packages/shared/src/i18n/locales/<language>.json`.
Use stable, namespaced message keys. Do not put language catalogs or label-to-code
maps in components. Both catalogs must have identical keys and placeholders.
Parameterized messages declare their required arguments in the shared schema.

Shared translation functions are pure. They normalize region locales (for example,
`ko-KR`), use English for unsupported languages, and accept interpolation values as
text. React renders that text without HTML interpretation. Never render translated
messages with `dangerouslySetInnerHTML`.

`OfficeLocaleProvider` owns the application UI language. Product roots use that
boundary. `useOfficeLocale()` provides `locale`, `setLocale`, and `t`. A controlled
provider accepts `locale` and `onLocaleChange`; an uncontrolled provider accepts
`defaultLocale`. The existing product default is Korean. Changing locale rerenders
labels, without rebuilding document sessions or changing document identity.
Multiple hosts can use different locales at the same time.

DocumentSession emits only stable status codes. Consumers use those codes for
retry, conflict and recovery behavior; UI translates them at render time. The old
Korean callback contract has been removed at the owner's request. The migration is
source-level only: native documents, library records, frozen server attempts and
recovery data retain their existing bytes and schema.

This first migration covers core context descriptions, shared local document
storage/recovery controls, and Word save status/actions/help. Other product copy
still needs catalog migration. A product-wide language picker, persistent language
preference, extension pack changes, RTL layout and complete four-product language
coverage are not implemented by this slice. The core's existing extension locale
registration API remains available and reads the same built-in JSON catalogs.

Verification uses catalog key/placeholder parity, explicit translation expectations,
independent providers, locale changes with unchanged status/action/document identity,
and actual desktop autosave/recovery behavior. Keep tests focused on changed
boundaries; run repository preflight before serial local integration.

Site inspector declarations use explicit `groupId` values. Gating, selected
headings, grouping and folding use those IDs. Their display headings come from
`site.inspector.group.*` in the same JSON catalogs. PropertySheet uses IDs as
React keys, so translated or equal headings do not replace focused child editors.
Existing other-product declarations without IDs retain their current grouping.
JSON imports declare their type for Node22 tools as well as browser bundlers.
