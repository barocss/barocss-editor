---
"@barocss/datastore": major
"@barocss/schema": major
---

Remove the unused global drop behavior API without compatibility shims: `defineDropBehavior`, `DropBehavior`, `DropContext`, `DropBehaviorDefinition`, `DataStore.getDropBehavior`, and schema `dropBehaviorRules`. Remove old imports, calls, and schema properties when upgrading.

Use editor-scoped `defineEditingRule`, `defineEditingPolicy`, and `FragmentEditor` from `@barocss/model` for fragment planning. Old behavior labels cannot be automatically converted into validated plans. DND input integration remains a separate follow-up; current drag handlers are unchanged. See `docs/schema-editing-guide.md`.
