---
name: package-converter
description: Document format conversion (HTML, Markdown, LaTeX, Office/Google/Notion HTML) to/from Barocss model (INode). Use when adding or changing conversion rules, parsers, or cleaners.
---

# @barocss/converter

## Scope

- **Converters**: HTMLConverter, MarkdownConverter, LatexConverter; `toModel(string)` → INode[]; `toHTML`/`toMarkdown`/`toLatex(nodes)` → string.
- **Cleaners**: OfficeHTMLCleaner, GoogleDocsHTMLCleaner, NotionHTMLCleaner; `clean(html)` → cleaned HTML before conversion.
- **Rules**: `registerDefaultHTMLRules()`, `registerDefaultMarkdownRules()`, etc.; custom: `defineParser(name, { match, parse })`, `defineConverter(stype, { toHTML, toMarkdown, ... })`, `defineASTConverter(stype, { fromAST, toAST })`.

## Rules

1. **Parser**: match DOM/node and return model-shaped object (`stype`, `attributes`, `content`/text); register with `defineParser`.
2. **Converter**: map `stype` to output format; implement `toHTML` (and optionally `toMarkdown`, `toLatex`) for `defineConverter`.
3. **AST**: use `defineASTConverter` when format has an intermediate AST (e.g. Markdown AST).
4. **Output**: conversion produces INode[] (often single root) or string; DataStore expects root node and children.
5. **References**: `packages/converter/`; rule registries and default rules in src.

## Quick reference

- Package: `packages/converter/`
- Deps: schema/datastore types for INode
- API: HTMLConverter, MarkdownConverter, LatexConverter, *Cleaner, registerDefault*Rules, defineParser, defineConverter, defineASTConverter
