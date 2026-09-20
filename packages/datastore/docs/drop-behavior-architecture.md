# Drop Behavior API Removal

The unused global drop behavior system was removed in #274. This replaces the previous hybrid architecture proposal.

Removed APIs:

- `defineDropBehavior` and its global registry.
- `DropBehavior`, `DropContext`, and `DropBehaviorDefinition`.
- `DataStore.getDropBehavior` and its built-in defaults.
- Schema `dropBehaviorRules`.
- The empty default-rule initializer.

No compatibility adapter remains. Repository product code did not register or query these APIs. Public consumers must remove their imports, calls, and schema properties when upgrading. This is a breaking API change.

New fragment editing uses `defineEditingRule`, `defineEditingPolicy`, and `FragmentEditor` from `@barocss/model`. A policy belongs to one editor. It distinguishes source copy/move intent from target structure decisions. An old `merge` label is not a complete editing plan and cannot be translated automatically.

See the [editing guide](../../../docs/schema-editing-guide.md) for policy ownership, custom schema examples, planning, validation, and application. See the [policy specification](../../../docs/specs/schema-editing-policy.md) for supported cases and rejection rules.

Actual DND input, drop coordinates, and move/copy application still require [#265](https://github.com/barocss/barocss-editor/issues/265). Removing these APIs does not connect existing drag handlers to the new planner. Existing view and reorder paths remain unchanged.
