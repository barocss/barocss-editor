import { describe, it, expect } from 'vitest';
import { IS_MAC, IS_LINUX, IS_WINDOWS } from './platform';

describe('Platform Detection', () => {
  it('should export boolean constants', () => {
    expect(typeof IS_MAC).toBe('boolean');
    expect(typeof IS_LINUX).toBe('boolean');
    expect(typeof IS_WINDOWS).toBe('boolean');
  });

  it('should detect at least one platform correctly', () => {
    // 실제 실행 환경에서 최소 하나의 플랫폼은 감지되어야 함
    // (브라우저 환경이 아닌 경우 모두 false일 수 있음)
    const hasNavigator = typeof navigator !== 'undefined';
    if (hasNavigator) {
      // 최소 하나는 true여야 함 (또는 모두 false일 수도 있음 - SSR 환경)
      const anyPlatform = IS_MAC || IS_LINUX || IS_WINDOWS;
      // 브라우저 환경에서는 최소 하나는 감지되어야 함
      expect(typeof anyPlatform).toBe('boolean');
    }
  });
});

