import { describe, it, expect } from 'vitest';
import { normalizeKeyString, expandModKey } from './key-binding';

describe('normalizeKeyString', () => {
  it('should normalize modifiers to first letter uppercase', () => {
    expect(normalizeKeyString('ctrl+b')).toBe('Ctrl+b');
    expect(normalizeKeyString('CTRL+B')).toBe('Ctrl+b');
    expect(normalizeKeyString('Cmd+i')).toBe('Cmd+i');
    expect(normalizeKeyString('CMD+I')).toBe('Cmd+i');
    expect(normalizeKeyString('alt+arrowleft')).toBe('Alt+arrowleft');
    expect(normalizeKeyString('shift+enter')).toBe('Shift+enter');
  });

  it('should normalize alphabet keys to lowercase', () => {
    expect(normalizeKeyString('Ctrl+B')).toBe('Ctrl+b');
    expect(normalizeKeyString('Ctrl+Shift+Z')).toBe('Ctrl+Shift+z');
    expect(normalizeKeyString('Mod+A')).toBe('Mod+a');
  });

  it('should preserve special keys as-is', () => {
    expect(normalizeKeyString('Enter')).toBe('Enter');
    expect(normalizeKeyString('Escape')).toBe('Escape');
    expect(normalizeKeyString('Ctrl+Enter')).toBe('Ctrl+Enter');
    expect(normalizeKeyString('Shift+Escape')).toBe('Shift+Escape');
    expect(normalizeKeyString('F1')).toBe('F1');
    expect(normalizeKeyString('Ctrl+F1')).toBe('Ctrl+F1');
  });

  it('should handle multiple modifiers', () => {
    expect(normalizeKeyString('ctrl+shift+alt+b')).toBe('Ctrl+Shift+Alt+b');
    expect(normalizeKeyString('CMD+SHIFT+Z')).toBe('Cmd+Shift+z');
  });

  it('should handle Mod modifier', () => {
    expect(normalizeKeyString('mod+b')).toBe('Mod+b');
    expect(normalizeKeyString('MOD+B')).toBe('Mod+b');
  });

  it('should handle keys without modifiers', () => {
    expect(normalizeKeyString('b')).toBe('b');
    expect(normalizeKeyString('B')).toBe('b');
    expect(normalizeKeyString('Enter')).toBe('Enter');
  });

  it('should trim whitespace', () => {
    expect(normalizeKeyString('Ctrl + b')).toBe('Ctrl+b');
    expect(normalizeKeyString('  Ctrl  +  b  ')).toBe('Ctrl+b');
  });
});

describe('expandModKey', () => {
  it('should expand Mod+key to Ctrl+key and Cmd+key', () => {
    const result = expandModKey('Mod+b');
    expect(result).toContain('Mod+b');
    expect(result).toContain('Ctrl+b');
    expect(result).toContain('Cmd+b');
    expect(result).toHaveLength(3);
  });

  it('should expand Ctrl+key to include Mod+key', () => {
    const result = expandModKey('Ctrl+b');
    expect(result).toContain('Ctrl+b');
    expect(result).toContain('Mod+b');
    expect(result).toHaveLength(2);
  });

  it('should expand Cmd+key to include Mod+key', () => {
    const result = expandModKey('Cmd+b');
    expect(result).toContain('Cmd+b');
    expect(result).toContain('Mod+b');
    expect(result).toHaveLength(2);
  });

  it('should handle keys without Mod/Ctrl/Cmd', () => {
    const result = expandModKey('Alt+b');
    expect(result).toEqual(['Alt+b']);
  });

  it('should handle complex key combinations', () => {
    const result = expandModKey('Mod+Shift+z');
    expect(result).toContain('Mod+Shift+z');
    expect(result).toContain('Ctrl+Shift+z');
    expect(result).toContain('Cmd+Shift+z');
    expect(result).toHaveLength(3);
  });

  it('should handle Enter and other special keys', () => {
    const result = expandModKey('Mod+Enter');
    expect(result).toContain('Mod+Enter');
    expect(result).toContain('Ctrl+Enter');
    expect(result).toContain('Cmd+Enter');
  });
});

