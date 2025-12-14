# @barocss/shared

Shared utilities and constants used across Barocss Editor packages.

## Purpose

Provides common utilities that are used by multiple packages:
- Platform detection (macOS, Linux, Windows)
- Key string normalization and expansion
- i18n utilities (placeholder replacement, locale normalization)

## Key Exports

- `IS_MAC`, `IS_LINUX`, `IS_WINDOWS` - Platform detection constants
- `getKeyString()` - Convert keyboard event to key string
- `normalizeKeyString()` - Normalize key string format
- `expandModKey()` - Expand Mod to platform-specific modifier
- `replacePlaceholders()` - Replace placeholders in strings
- `normalizeLocale()` - Normalize locale strings

## Platform Detection

Detect the operating system:

```typescript
import { IS_MAC, IS_LINUX, IS_WINDOWS } from '@barocss/shared';

if (IS_MAC) {
  // macOS specific code
  const modifier = 'Cmd';
} else if (IS_WINDOWS) {
  // Windows specific code
  const modifier = 'Ctrl';
} else if (IS_LINUX) {
  // Linux specific code
  const modifier = 'Ctrl';
}
```

## Key String Normalization

Convert keyboard events to normalized key strings:

```typescript
import { getKeyString } from '@barocss/shared';

element.addEventListener('keydown', (event) => {
  const key = getKeyString(event);
  // Examples: 'Mod+b', 'Alt+ArrowLeft', 'Shift+Enter', 'Escape'
  
  if (key === 'Mod+b') {
    // Toggle bold
  }
});
```

**Key string format:**
- Modifiers: `Ctrl`, `Cmd`, `Alt`, `Shift`
- Keys: `A-Z`, `0-9`, `Enter`, `Escape`, `Backspace`, `Delete`, `Tab`, `ArrowLeft`, etc.
- Format: `Modifier+Key` (e.g., `Mod+b`, `Alt+ArrowLeft`)

## Key Binding Utilities

Normalize and expand key strings:

```typescript
import { normalizeKeyString, expandModKey, IS_MAC } from '@barocss/shared';

// Normalize key string (case-insensitive, sort modifiers)
const normalized = normalizeKeyString('ctrl+shift+b');
// Result: 'Ctrl+Shift+b'

// Expand Mod key to platform-specific modifier
const expanded = expandModKey('Mod+b', IS_MAC);
// macOS: 'Cmd+b'
// Windows/Linux: 'Ctrl+b'
```

## i18n Utilities

Internationalization utilities:

```typescript
import { replacePlaceholders, normalizeLocale } from '@barocss/shared';

// Replace placeholders in strings
const message = replacePlaceholders('Hello {name}!', { name: 'World' });
// Result: 'Hello World!'

// Normalize locale string
const locale = normalizeLocale('en-US');
// Result: 'en-US'
```

## Usage in Editor

The shared package is used throughout the editor:

- **Editor Core**: Keybinding system uses key normalization
- **Extensions**: Platform detection for OS-specific shortcuts
- **Editor View DOM**: Key event handling uses key string conversion
- **i18n**: Placeholder replacement for localized messages

## When to Use

- **Platform-Specific Code**: Detect OS for conditional logic
- **Key Event Handling**: Normalize keyboard events
- **Keybinding Registration**: Normalize key strings for keybindings
- **i18n Support**: Replace placeholders in localized strings

## Related

- [Editor Core](./editor-core) - Uses key normalization for keybindings
- [Extensions](./extensions) - Uses platform detection for shortcuts
