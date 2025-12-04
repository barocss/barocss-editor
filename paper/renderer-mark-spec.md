## Renderer Mark & Decorator Spec (Draft)

### Scope
This document clarifies responsibilities and integration points for text marks and decorators in the DOM renderer.

### Definitions
- Mark: Persisted, inline, range-bound semantic styling or metadata stored in the model. Examples: bold, italic, underline, strike, code, link(href/title), color, sub, sup, mention.
- Decorator: Non-semantic/adornments that may be transient or derived from runtime state. Examples: spell/grammar highlights, search matches, selection mirrors, hover annotations, inline comment pins, placeholders.

### Principles
- Model owns truth. Only whitelisted mark types are saved in the model. Decorators should not be inserted into model marks.
- Renderer is presentation-only. It renders given marks as nested wrappers and applies decorators according to their type and placement.
- One split, many consumers. Text is split into runs once using the union of mark ranges and (inline) decorator ranges.

### Mark Rendering (summary)
- Inside-out nesting based on active types for each run (e.g., `<strong><em>text</em></strong>`).
- `defineMark(type, template)` templates treat the first `data('text')` as an implicit slot for inner content. If missing, `slot('content')` is used; otherwise, append.
- All marks receive an auto `mark-<type>` class merged with template classes.

### Decorator Model
- Decoration: `{ type: 'inlineWrapper' | 'overlay' | 'blockOverlay' | 'gutter', range: [from, to], side?: 'before'|'after'|'inside', template|component?, attrs? }`
- DecorationProvider: `{ getDecorations(viewState, model): Decoration[] | Promise<Decoration[]>, onDidChange(cb): void }`

### Pipeline
1) Collect marks from the model for the current node.
2) Collect decorations from all providers for the same node (sync/async; first pass may render without late results).
3) Compute split boundaries = union of mark ranges + inlineWrapper decoration ranges (overlay/gutter do not require splitting).
4) Build runs and render:
   - Marks: wrap inside-out using either custom templates or default tag map (strong/em/u/s/code/sub/sup), merging `mark-<type>` classes.
   - Inline wrapper decorators: inject widgets at `before`/`after`/`inside` positions relative to the run content.
   - Overlay/gutter decorators: render to separate layers without altering content structure.

### Ordering & Priority
- Process order per run:
  1) Mark wrappers (semantic)
  2) Decorator injections (visual/UI)
- Provide `decorationPriority?: Record<string, number>` to resolve conflicts for multiple decorators targeting the same position.

### Incremental & Async
- Initial render may omit async decorations; providers fire `onDidChange` to trigger a cheap re-injection or, if ranges changed, a re-split of affected nodes.
- Cache by `{nodeId, modelVersion, viewStateKey}` for stable results; invalidate on relevant edits/view changes.

### Integration API (renderer)
- `render(container, model, { decorations?: Decoration[], decorationPriority?: Record<string, number> })`
- Optionally: `setDecorationProviders(providers: DecorationProvider[])`

### Schema Guidance
- Mark whitelist in schema; validators reject non-persisted UI flags.
- Promote/demote: Features can start as decorators; if persistence becomes necessary, migrate to marks.

### Examples (conceptual)
- Color swatch (inlineWrapper): `{ type:'inlineWrapper', range:[0,3], side:'before', template: element('span', { className:'swatch', style:{ backgroundColor: '#f00' } }, []) }`
- Spell highlight (overlay): `{ type:'overlay', range:[5,9], attrs:{ className:'spell-underline' } }`

### Notes
- This spec complements `renderer-dom-spec.md` and `renderer-dom-dsl-spec.md` by defining how marks and decorators share the split/render pipeline without conflating model persistence.


