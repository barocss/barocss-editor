import { describe, it, expect } from 'vitest';
import { getKeyString } from './key-string';

/**
 * Helper to create mock KeyboardEvent
 */
function createKeyboardEvent(key: string, options: {
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
} = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: options.ctrlKey || false,
    metaKey: options.metaKey || false,
    altKey: options.altKey || false,
    shiftKey: options.shiftKey || false
  });
  return event;
}

describe('getKeyString', () => {
  it('should convert simple key to string', () => {
    const event = createKeyboardEvent('Enter');
    expect(getKeyString(event)).toBe('Enter');
  });

  it('should convert Ctrl+b to Ctrl+b', () => {
    const event = createKeyboardEvent('b', { ctrlKey: true });
    expect(getKeyString(event)).toBe('Ctrl+b');
  });

  it('should convert Cmd+b to Cmd+b (Mac) or Meta+b (non-Mac)', () => {
    const event = createKeyboardEvent('b', { metaKey: true });
    const result = getKeyString(event);
    // Cmd+b on Mac, Meta+b otherwise
    expect(result).toMatch(/^(Cmd|Meta)\+b$/);
  });

  it('should normalize Space key', () => {
    const event = createKeyboardEvent(' ');
    expect(getKeyString(event)).toBe('Space');
  });

  it('should normalize Arrow keys', () => {
    const upEvent = createKeyboardEvent('ArrowUp');
    expect(getKeyString(upEvent)).toBe('Up');

    const downEvent = createKeyboardEvent('ArrowDown');
    expect(getKeyString(downEvent)).toBe('Down');

    const leftEvent = createKeyboardEvent('ArrowLeft');
    expect(getKeyString(leftEvent)).toBe('Left');

    const rightEvent = createKeyboardEvent('ArrowRight');
    expect(getKeyString(rightEvent)).toBe('Right');
  });

  it('should handle multiple modifiers', () => {
    const event = createKeyboardEvent('z', {
      ctrlKey: true,
      shiftKey: true
    });
    expect(getKeyString(event)).toBe('Ctrl+Shift+z');
  });

  it('should handle Alt modifier', () => {
    const event = createKeyboardEvent('1', {
      altKey: true,
      ctrlKey: true
    });
    expect(getKeyString(event)).toBe('Ctrl+Alt+1');
  });

  it('should normalize alphabet keys to lowercase', () => {
    // Shift can produce uppercase, but normalized to lowercase
    const eventB = createKeyboardEvent('B', { ctrlKey: true });
    expect(getKeyString(eventB)).toBe('Ctrl+b');
    
    const eventb = createKeyboardEvent('b', { ctrlKey: true });
    expect(getKeyString(eventb)).toBe('Ctrl+b');
  });
});

