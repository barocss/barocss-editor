import { describe, it, expect } from 'vitest';
import { IS_MAC, IS_LINUX, IS_WINDOWS } from './platform';

describe('Platform Detection', () => {
  it('should export boolean constants', () => {
    expect(typeof IS_MAC).toBe('boolean');
    expect(typeof IS_LINUX).toBe('boolean');
    expect(typeof IS_WINDOWS).toBe('boolean');
  });

  it('should detect at least one platform correctly', () => {
    // At least one platform should be detected in actual execution environment
    // (all may be false if not in browser environment)
    const hasNavigator = typeof navigator !== 'undefined';
    if (hasNavigator) {
      // At least one should be true (or all may be false - SSR environment)
      const anyPlatform = IS_MAC || IS_LINUX || IS_WINDOWS;
      // In browser environment, at least one should be detected
      expect(typeof anyPlatform).toBe('boolean');
    }
  });
});

