# Declarative Editor Rendering - Performance & Errors

## Performance
- Key-based reconciliation (`data-bc-sid`): moves/reuses nodes instead of re-creating
- Minimal mutations: diff attrs/style/text/children only where changed
- Namespaces: correct creation ensures fewer surprises in SVG/MathML
- Exclusion: overlays/decorators out of core reconcile simplify hot paths

## Error Handling
- Best-effort: errors are reported and reconcile continues when possible
- Isolation: one failing node does not cascade to the whole tree
- Diagnostics: collect errors with phase (insert/remove/replace/update/children)

### Pseudocode: Error Reporting
```pseudo
try:
  updateAttributes(target, prev, next)
catch err:
  onError({ phase: 'update', vnode: next, error: err, recovered: false })
```

## Recommendations
- Provide stable keys
- Avoid deep dynamic structural changes without keys
- Use scheduler to group changes
- Measure, then mutate
