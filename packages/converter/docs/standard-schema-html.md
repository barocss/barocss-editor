# Standard schema HTML conversion

HTML conversion rules for Barocss standard schema node types: **emoji** and **paragraph placeholder**. Registered by `registerDefaultHTMLRules()`.

## Emoji

- **Model**: `stype: 'emoji'`, inline atom; attrs: `shortcode?`, `unicode?`.
- **HTML → Model (parser)**  
  - Matches `<span data-emoji>` (optionally with `data-shortcode`, `data-unicode`).  
  - Attributes: `shortcode` from `data-shortcode`, `unicode` from `data-unicode` or from element text content.
- **Model → HTML (converter)**  
  - Output: `<span data-emoji data-shortcode="..." data-unicode="...">…</span>`.  
  - Inner text is the unicode character or shortcode when present.

Round-trip: paste/export HTML with `<span data-emoji data-shortcode=":smile:" data-unicode="😀">😀</span>` and parse back to an `emoji` node with the same attrs.

## Paragraph placeholder

- **Model**: `paragraph` with optional `attributes.placeholder` (empty-block hint).
- **HTML → Model (parser)**  
  - On `<p>`, reads `data-placeholder` and sets `attributes.placeholder`.
- **Model → HTML (converter)**  
  - On paragraph, if `node.attributes.placeholder` is set, outputs `<p data-placeholder="...">PLACEHOLDER_CONTENT</p>`.

Round-trip: `<p data-placeholder="Write something…">...</p>` parses to a paragraph with `attributes.placeholder === "Write something…"` and exports back with the same attribute.

## References

- Standard schema: `docs/specs/standard-schema.md` (§4.2 paragraph, §4.6 emoji).
- Rules: `packages/converter/src/rules/default-html-rules.ts`.
