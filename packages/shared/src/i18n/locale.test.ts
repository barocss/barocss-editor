import { describe, it, expect } from 'vitest';
import { normalizeLocale } from './locale';

describe('normalizeLocale', () => {
  it('should normalize locale with region', () => {
    expect(normalizeLocale('ko-KR')).toBe('ko');
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('zh-CN')).toBe('zh');
    expect(normalizeLocale('ja-JP')).toBe('ja');
  });

  it('should return lowercase locale without region', () => {
    expect(normalizeLocale('ko')).toBe('ko');
    expect(normalizeLocale('en')).toBe('en');
    expect(normalizeLocale('ja')).toBe('ja');
  });

  it('should handle uppercase locale', () => {
    expect(normalizeLocale('KO-KR')).toBe('ko');
    expect(normalizeLocale('EN-US')).toBe('en');
    expect(normalizeLocale('JA')).toBe('ja');
  });

  it('should handle mixed case locale', () => {
    expect(normalizeLocale('Ko-Kr')).toBe('ko');
    expect(normalizeLocale('En-Us')).toBe('en');
  });

  it('should return first part when multiple dashes', () => {
    expect(normalizeLocale('en-US-POSIX')).toBe('en');
    expect(normalizeLocale('zh-Hans-CN')).toBe('zh');
  });

  it('should return "en" as fallback for empty string', () => {
    expect(normalizeLocale('')).toBe('en');
  });

  it('should handle locale with script', () => {
    expect(normalizeLocale('zh-Hans')).toBe('zh');
    expect(normalizeLocale('zh-Hant')).toBe('zh');
  });
});

