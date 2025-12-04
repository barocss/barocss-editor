# @barocss/shared

Shared utilities and constants used across BaroCSS Editor packages.

## Overview

`@barocss/shared` provides:

- **Platform Detection**: Detect operating system (macOS, Linux, Windows)
- **Key String Normalization**: Normalize keyboard event keys
- **Key Binding Utilities**: Expand modifier keys (Mod → Cmd/Ctrl)
- **i18n Utilities**: Placeholder replacement and locale normalization

## Installation

```bash
pnpm add @barocss/shared
```

## Usage

### Platform Detection

```typescript
import { IS_MAC, IS_LINUX, IS_WINDOWS } from '@barocss/shared';

if (IS_MAC) {
  // macOS specific code
  const modifier = 'Cmd';
} else {
  // Windows/Linux
  const modifier = 'Ctrl';
}
```

### Key String Normalization

```typescript
import { getKeyString } from '@barocss/shared';

// Normalize keyboard event to key string
const keyString = getKeyString(event);
// Examples: 'Mod+b', 'Alt+ArrowLeft', 'Shift+Enter'
```

### Key Binding Utilities

```typescript
import { normalizeKeyString, expandModKey } from '@barocss/shared';

// Normalize key string (case-insensitive, sort modifiers)
const normalized = normalizeKeyString('ctrl+shift+b');
// Result: 'Ctrl+Shift+b'

// Expand Mod key to platform-specific modifier
const expanded = expandModKey('Mod+b', IS_MAC);
// macOS: 'Cmd+b'
// Windows/Linux: 'Ctrl+b'
```

### i18n Utilities

```typescript
import { replacePlaceholders, normalizeLocale } from '@barocss/shared';

// Replace placeholders in strings
const message = replacePlaceholders('Hello {name}!', { name: 'World' });
// Result: 'Hello World!'

// Normalize locale string
const locale = normalizeLocale('en-US');
// Result: 'en-US'
```

## API Reference

### Platform Detection

```typescript
export const IS_MAC: boolean;
export const IS_LINUX: boolean;
export const IS_WINDOWS: boolean;
```

### Key String Functions

```typescript
getKeyString(event: KeyboardEvent): string;
```

Normalizes a keyboard event to a key string format:
- Modifiers: `Ctrl`, `Cmd`, `Alt`, `Shift`
- Keys: `A-Z`, `0-9`, `Enter`, `Escape`, `Backspace`, `Delete`, `Tab`, `ArrowLeft`, etc.
- Format: `Modifier+Key` (e.g., `Mod+b`, `Alt+ArrowLeft`)

### Key Binding Functions

```typescript
normalizeKeyString(key: string): string;
```

Normalizes a key string:
- Case-insensitive
- Sorts modifiers alphabetically
- Removes duplicates

```typescript
expandModKey(key: string, isMac: boolean): string;
```

Expands `Mod` to platform-specific modifier:
- macOS: `Mod` → `Cmd`
- Windows/Linux: `Mod` → `Ctrl`

### i18n Functions

```typescript
replacePlaceholders(template: string, values: Record<string, any>): string;
```

Replaces `{key}` placeholders with values.

```typescript
normalizeLocale(locale: string): string;
```

Normalizes locale string to standard format.

## Examples

### Platform-Specific Key Bindings

```typescript
import { IS_MAC, expandModKey } from '@barocss/shared';

const keyBinding = expandModKey('Mod+z', IS_MAC);
// macOS: 'Cmd+z'
// Windows/Linux: 'Ctrl+z'
```

### Key Event Handling

```typescript
import { getKeyString } from '@barocss/shared';

element.addEventListener('keydown', (event) => {
  const key = getKeyString(event);
  
  if (key === 'Mod+b') {
    // Toggle bold
  } else if (key === 'Escape') {
    // Cancel
  }
});
```

## License

MIT

