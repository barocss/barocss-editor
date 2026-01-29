---
name: package-shared
description: Shared utilities (platform, key string, key binding, i18n). Use when adding or using platform detection, keybind string normalization, or placeholder/locale helpers.
---

# @barocss/shared

## Scope

- **Platform**: `IS_MAC`, `IS_LINUX`, `IS_WINDOWS` (boolean).
- **Key string**: `getKeyString(event: KeyboardEvent)` → e.g. `Mod+b`, `Alt+ArrowLeft`; modifiers normalized.
- **Key binding**: `normalizeKeyString(key)` (case-insensitive, sort modifiers); `expandModKey(key, isMac)` → `Mod` to Cmd/Ctrl.
- **i18n**: `replacePlaceholders(template, values)` for `{name}`; `normalizeLocale(locale)`.

## Rules

1. **Mod**: use `expandModKey('Mod+b', IS_MAC)` for display or platform-specific binding; editor-core uses `Mod` in keybindings and expands internally.
2. **Key events**: use `getKeyString(event)` to match against keybinding strings (after normalizeKeyString if needed).
3. **References**: `packages/shared/`; consumed by editor-core (keybinding), extensions, and any package needing platform/key/i18n.

## Quick reference

- Package: `packages/shared/`
- Exports: IS_MAC, IS_LINUX, IS_WINDOWS, getKeyString, normalizeKeyString, expandModKey, replacePlaceholders, normalizeLocale
- No deps (leaf utility package)
