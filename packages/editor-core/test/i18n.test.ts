import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getLocalizedMessage,
  registerLocaleMessages,
  setDefaultLocale,
  getDefaultLocale,
  hasLocaleMessages,
  loadLocaleMessages,
  initializeI18n,
} from '../src/i18n';

describe('i18n', () => {
  beforeEach(() => {
    // Reset default locale to 'en' before each test
    setDefaultLocale('en');
  });

  describe('getLocalizedMessage', () => {
    it('should return English message by default', () => {
      const message = getLocalizedMessage('context.editorFocus.description');
      expect(message).toBe('Whether the editor has focus');
    });

    it('should return Korean message when locale is specified', () => {
      const message = getLocalizedMessage(
        'context.editorFocus.description',
        undefined,
        'ko'
      );
      expect(message).toBe('에디터가 포커스를 가지고 있는지 여부');
    });

    it('should use default locale when locale is not specified', () => {
      setDefaultLocale('ko');
      const message = getLocalizedMessage('context.editorFocus.description');
      expect(message).toBe('에디터가 포커스를 가지고 있는지 여부');
    });

    it('should fallback to English when message not found in specified locale', () => {
      const message = getLocalizedMessage(
        'context.editorFocus.description',
        undefined,
        'ja' // Japanese is not registered
      );
      expect(message).toBe('Whether the editor has focus'); // Fallback to English
    });

    it('should return message ID when message not found in any locale', () => {
      const message = getLocalizedMessage('non.existent.message');
      expect(message).toBe('non.existent.message');
    });

    it('should replace placeholders', () => {
      // Register temporary message for testing
      registerLocaleMessages('en', {
        'test.message': 'Hello, {name}! Count: {count}',
      });

      const message = getLocalizedMessage('test.message', {
        name: 'World',
        count: 42,
      });
      expect(message).toBe('Hello, World! Count: 42');
    });

    it('should handle missing placeholder params', () => {
      registerLocaleMessages('en', {
        'test.message': 'Hello, {name}! {missing}',
      });

      const message = getLocalizedMessage('test.message', { name: 'World' });
      expect(message).toBe('Hello, World! {missing}');
    });
  });

  describe('registerLocaleMessages', () => {
    it('should register new locale messages', () => {
      registerLocaleMessages('ja', {
        'test.message': 'テストメッセージ',
      });

      expect(hasLocaleMessages('ja')).toBe(true);
      const message = getLocalizedMessage('test.message', undefined, 'ja');
      expect(message).toBe('テストメッセージ');
    });

    it('should merge messages for same locale', () => {
      registerLocaleMessages('ja', {
        'test.message1': 'メッセージ1',
      });

      registerLocaleMessages('ja', {
        'test.message2': 'メッセージ2',
      });

      expect(getLocalizedMessage('test.message1', undefined, 'ja')).toBe(
        'メッセージ1'
      );
      expect(getLocalizedMessage('test.message2', undefined, 'ja')).toBe(
        'メッセージ2'
      );
    });

    it('should overwrite existing message with same ID', () => {
      registerLocaleMessages('ja', {
        'test.message': 'メッセージ1',
      });

      registerLocaleMessages('ja', {
        'test.message': 'メッセージ2',
      });

      expect(getLocalizedMessage('test.message', undefined, 'ja')).toBe(
        'メッセージ2'
      );
    });
  });

  describe('setDefaultLocale / getDefaultLocale', () => {
    it('should set and get default locale', () => {
      setDefaultLocale('ko');
      expect(getDefaultLocale()).toBe('ko');

      setDefaultLocale('ja');
      expect(getDefaultLocale()).toBe('ja');
    });

    it('should use default locale in getLocalizedMessage', () => {
      setDefaultLocale('ko');
      const message = getLocalizedMessage('context.editorFocus.description');
      expect(message).toBe('에디터가 포커스를 가지고 있는지 여부');
    });
  });

  describe('hasLocaleMessages', () => {
    it('should return true for built-in locales', () => {
      expect(hasLocaleMessages('en')).toBe(true);
      expect(hasLocaleMessages('ko')).toBe(true);
    });

    it('should return false for unregistered locales (before registration)', () => {
      // This test should run before registerLocaleMessages is called
      // Other tests may have registered 'ja', so use an unregistered locale
      expect(hasLocaleMessages('fr')).toBe(false);
      expect(hasLocaleMessages('de')).toBe(false);
    });

    it('should return true after registering locale', () => {
      registerLocaleMessages('zh-CN', {
        'test.message': '测试',
      });
      expect(hasLocaleMessages('zh-CN')).toBe(true);
    });
  });

  describe('loadLocaleMessages', () => {
    it('should load and register locale messages from URL', async () => {
      const mockMessages = {
        'test.message': 'テストメッセージ',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockMessages,
      });

      await loadLocaleMessages('ja', '/i18n/messages.ja.json');

      expect(global.fetch).toHaveBeenCalledWith('/i18n/messages.ja.json');
      expect(hasLocaleMessages('ja')).toBe(true);
      expect(getLocalizedMessage('test.message', undefined, 'ja')).toBe(
        'テストメッセージ'
      );
    });

    it('should throw error when fetch fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Not Found',
      });

      await expect(
        loadLocaleMessages('ja', '/i18n/messages.ja.json')
      ).rejects.toThrow('Failed to load language pack for ja: Not Found');
    });

    it('should throw error when network fails', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(
        loadLocaleMessages('ja', '/i18n/messages.ja.json')
      ).rejects.toThrow('Network error');
    });
  });

  describe('initializeI18n', () => {
    it('should detect browser locale when autoDetect is true', () => {
      // Mock navigator.language
      Object.defineProperty(global, 'navigator', {
        value: {
          language: 'ko-KR',
          languages: ['ko-KR', 'en'],
        },
        writable: true,
        configurable: true,
      });

      initializeI18n({ autoDetect: true });
      expect(getDefaultLocale()).toBe('ko');
    });

    it('should not detect browser locale when autoDetect is false', () => {
      setDefaultLocale('en');
      initializeI18n({ autoDetect: false });
      expect(getDefaultLocale()).toBe('en');
    });

    it('should detect browser locale by default', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          language: 'ja-JP',
          languages: ['ja-JP', 'en'],
        },
        writable: true,
        configurable: true,
      });

      initializeI18n();
      expect(getDefaultLocale()).toBe('ja');
    });
  });
});

