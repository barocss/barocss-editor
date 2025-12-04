import { describe, it, expect } from 'vitest';
import { KeybindingRegistryImpl, type Keybinding } from '../src/keybinding';

describe('KeybindingRegistry', () => {
  describe('register and resolve', () => {
    it('should register and resolve keybindings', () => {
      const registry = new KeybindingRegistryImpl();
      const binding: Keybinding = {
        key: 'Ctrl+b',
        command: 'toggleBold',
        when: 'editorFocus && editorEditable'
      };
      registry.register(binding);

      const result = registry.resolve('Ctrl+b', { editorFocus: true, editorEditable: true });
      expect(result).toHaveLength(1);
      expect(result[0].command).toBe('toggleBold');
    });

    it('should filter by when clause', () => {
      const registry = new KeybindingRegistryImpl();
      registry.register({
        key: 'Ctrl+b',
        command: 'toggleBold',
        when: 'editorFocus && editorEditable'
      });

      expect(registry.resolve('Ctrl+b', { editorFocus: true, editorEditable: true })).toHaveLength(1);
      expect(registry.resolve('Ctrl+b', { editorFocus: true, editorEditable: false })).toHaveLength(0);
      expect(registry.resolve('Ctrl+b', { editorFocus: false, editorEditable: true })).toHaveLength(0);
    });

    it('should return empty array for non-matching key', () => {
      const registry = new KeybindingRegistryImpl();
      registry.register({
        key: 'Ctrl+b',
        command: 'toggleBold'
      });

      expect(registry.resolve('Ctrl+i', {})).toHaveLength(0);
    });
  });

  describe('source priority', () => {
    it('should prioritize user > extension > core', () => {
      const registry = new KeybindingRegistryImpl();
      registry.register({ key: 'Ctrl+b', command: 'coreBold', source: 'core' });
      registry.register({ key: 'Ctrl+b', command: 'extensionBold', source: 'extension' });
      registry.register({ key: 'Ctrl+b', command: 'userBold', source: 'user' });

      const result = registry.resolve('Ctrl+b', {});
      expect(result).toHaveLength(3);
      expect(result[0].command).toBe('userBold');
      expect(result[1].command).toBe('extensionBold');
      expect(result[2].command).toBe('coreBold');
    });

    it('should prioritize later registrations within same source', () => {
      const registry = new KeybindingRegistryImpl();
      registry.register({ key: 'Ctrl+b', command: 'first', source: 'extension' });
      registry.register({ key: 'Ctrl+b', command: 'second', source: 'extension' });
      registry.register({ key: 'Ctrl+b', command: 'third', source: 'extension' });

      const result = registry.resolve('Ctrl+b', {});
      expect(result).toHaveLength(3);
      expect(result[0].command).toBe('third');
      expect(result[1].command).toBe('second');
      expect(result[2].command).toBe('first');
    });
  });

  describe('unregister and clear', () => {
    it('should unregister specific binding', () => {
      const registry = new KeybindingRegistryImpl();
      const binding: Keybinding = {
        key: 'Ctrl+b',
        command: 'toggleBold',
        source: 'extension'
      };
      registry.register(binding);
      expect(registry.resolve('Ctrl+b', {})).toHaveLength(1);

      registry.unregister(binding);
      expect(registry.resolve('Ctrl+b', {})).toHaveLength(0);
    });

    it('should clear all bindings', () => {
      const registry = new KeybindingRegistryImpl();
      registry.register({ key: 'Ctrl+b', command: 'toggleBold', source: 'core' });
      registry.register({ key: 'Ctrl+i', command: 'toggleItalic', source: 'extension' });
      registry.clear();

      expect(registry.resolve('Ctrl+b', {})).toHaveLength(0);
      expect(registry.resolve('Ctrl+i', {})).toHaveLength(0);
    });

    it('should clear bindings by source', () => {
      const registry = new KeybindingRegistryImpl();
      registry.register({ key: 'Ctrl+b', command: 'coreBold', source: 'core' });
      registry.register({ key: 'Ctrl+i', command: 'extensionItalic', source: 'extension' });
      registry.clear('core');

      expect(registry.resolve('Ctrl+b', {})).toHaveLength(0);
      expect(registry.resolve('Ctrl+i', {})).toHaveLength(1);
    });
  });

  describe('context provider', () => {
    it('should use context provider when context is not provided', () => {
      const registry = new KeybindingRegistryImpl();
      const contextProvider = {
        getContext: () => ({
          editorFocus: true,
          editorEditable: true
        })
      };
      registry.setContextProvider(contextProvider);
      registry.register({
        key: 'Ctrl+b',
        command: 'toggleBold',
        when: 'editorFocus && editorEditable'
      });

      // context를 제공하지 않아도 contextProvider에서 가져옴
      const result = registry.resolve('Ctrl+b');
      expect(result).toHaveLength(1);
      expect(result[0].command).toBe('toggleBold');
    });

    it('should prefer provided context over context provider', () => {
      const registry = new KeybindingRegistryImpl();
      const contextProvider = {
        getContext: () => ({
          editorFocus: true,
          editorEditable: true
        })
      };
      registry.setContextProvider(contextProvider);
      registry.register({
        key: 'Ctrl+b',
        command: 'toggleBold',
        when: 'editorFocus && editorEditable'
      });

      // 제공된 context가 우선
      const result = registry.resolve('Ctrl+b', { editorFocus: false, editorEditable: true });
      expect(result).toHaveLength(0);
    });

    it('should return empty array when no context provider and no context provided', () => {
      const registry = new KeybindingRegistryImpl();
      registry.register({
        key: 'Ctrl+b',
        command: 'toggleBold',
        when: 'editorFocus && editorEditable'
      });

      // contextProvider도 없고 context도 없으면 빈 context로 평가
      const result = registry.resolve('Ctrl+b');
      expect(result).toHaveLength(0);
    });
  });

  describe('setCurrentSource and automatic source assignment', () => {
    it('should use current source when setCurrentSource is called', () => {
      const registry = new KeybindingRegistryImpl();
      
      // Extension 등록 시뮬레이션
      registry.setCurrentSource('extension');
      registry.register({
        key: 'Mod+b',
        command: 'toggleBold'
        // source는 자동으로 'extension'
      });
      registry.setCurrentSource(null);
      
      const result = registry.resolve('Mod+b', {});
      expect(result).toHaveLength(1);
      expect(result[0].command).toBe('toggleBold');
      
      // 내부적으로 source가 'extension'으로 설정되었는지 확인
      // (직접 확인은 어렵지만, 우선순위로 확인 가능)
    });

    it('should use user as default when setCurrentSource is not called', () => {
      const registry = new KeybindingRegistryImpl();
      
      // setCurrentSource를 호출하지 않고 등록
      registry.register({
        key: 'Ctrl+d',
        command: 'deleteSelection'
        // source는 자동으로 'user' (기본값)
      });
      
      // user source가 core보다 우선순위가 높은지 확인
      registry.setCurrentSource('core');
      registry.register({
        key: 'Ctrl+d',
        command: 'coreDelete'
      });
      registry.setCurrentSource(null);
      
      const result = registry.resolve('Ctrl+d', {});
      expect(result).toHaveLength(2);
      // user가 core보다 우선순위가 높아야 함
      expect(result[0].command).toBe('deleteSelection'); // user
      expect(result[1].command).toBe('coreDelete'); // core
    });

    it('should override explicit source when current source is set', () => {
      const registry = new KeybindingRegistryImpl();
      
      // Extension 등록 중에 source: 'user'를 명시적으로 지정해도 무시됨
      registry.setCurrentSource('extension');
      registry.register({
        key: 'Mod+b',
        command: 'toggleBold',
        source: 'user'  // 명시적으로 지정해도 무시됨
      });
      registry.setCurrentSource(null);
      
      // user source로 등록된 것과 비교
      registry.register({
        key: 'Mod+b',
        command: 'userBold',
        source: 'user'
      });
      
      const result = registry.resolve('Mod+b', {});
      expect(result).toHaveLength(2);
      // user가 extension보다 우선순위가 높아야 함
      expect(result[0].command).toBe('userBold'); // user
      expect(result[1].command).toBe('toggleBold'); // extension (현재 컨텍스트가 우선)
    });

    it('should handle core keybinding registration', () => {
      const registry = new KeybindingRegistryImpl();
      
      // Core 등록 시뮬레이션
      registry.setCurrentSource('core');
      registry.register({
        key: 'Enter',
        command: 'insertParagraph'
        // source는 자동으로 'core'
      });
      registry.setCurrentSource(null);
      
      // Extension 등록
      registry.setCurrentSource('extension');
      registry.register({
        key: 'Enter',
        command: 'extensionEnter'
      });
      registry.setCurrentSource(null);
      
      // User 등록
      registry.register({
        key: 'Enter',
        command: 'userEnter'
        // source는 자동으로 'user'
      });
      
      const result = registry.resolve('Enter', {});
      expect(result).toHaveLength(3);
      // 우선순위: user > extension > core
      expect(result[0].command).toBe('userEnter');
      expect(result[1].command).toBe('extensionEnter');
      expect(result[2].command).toBe('insertParagraph');
    });

    it('should handle Extension onCreate simulation', () => {
      const registry = new KeybindingRegistryImpl();
      
      // Extension의 onCreate 시뮬레이션
      registry.setCurrentSource('extension');
      registry.register({
        key: 'Mod+b',
        command: 'toggleBold'
      });
      registry.register({
        key: 'Mod+i',
        command: 'toggleItalic'
      });
      registry.setCurrentSource(null);
      
      // 모든 keybinding이 extension source로 등록되었는지 확인
      const boldResult = registry.resolve('Mod+b', {});
      const italicResult = registry.resolve('Mod+i', {});
      
      expect(boldResult).toHaveLength(1);
      expect(italicResult).toHaveLength(1);
      
      // user source로 등록하면 우선순위가 높아야 함
      registry.register({
        key: 'Mod+b',
        command: 'userBold'
        // source는 자동으로 'user'
      });
      
      const finalResult = registry.resolve('Mod+b', {});
      expect(finalResult).toHaveLength(2);
      expect(finalResult[0].command).toBe('userBold'); // user가 우선
      expect(finalResult[1].command).toBe('toggleBold'); // extension
    });
  });

  describe('Mod 키 확장 및 매칭', () => {
    it('Mod+b keybinding이 Ctrl+b로도 매칭되어야 함', () => {
      const registry = new KeybindingRegistryImpl();
      
      // Mod+b로 등록
      registry.register({
        key: 'Mod+b',
        command: 'toggleBold'
      });
      
      // Ctrl+b로 resolve하면 매칭되어야 함
      const result = registry.resolve('Ctrl+b', {});
      expect(result).toHaveLength(1);
      expect(result[0].command).toBe('toggleBold');
    });

    it('Mod+b keybinding이 Cmd+b로도 매칭되어야 함', () => {
      const registry = new KeybindingRegistryImpl();
      
      // Mod+b로 등록
      registry.register({
        key: 'Mod+b',
        command: 'toggleBold'
      });
      
      // Cmd+b로 resolve하면 매칭되어야 함
      const result = registry.resolve('Cmd+b', {});
      expect(result).toHaveLength(1);
      expect(result[0].command).toBe('toggleBold');
    });

    it('Ctrl+b로 등록된 keybinding이 Mod+b로도 매칭되어야 함', () => {
      const registry = new KeybindingRegistryImpl();
      
      // Ctrl+b로 등록
      registry.register({
        key: 'Ctrl+b',
        command: 'toggleBold'
      });
      
      // Mod+b로 resolve하면 매칭되어야 함
      const result = registry.resolve('Mod+b', {});
      expect(result).toHaveLength(1);
      expect(result[0].command).toBe('toggleBold');
    });

    it('Cmd+b로 등록된 keybinding이 Mod+b로도 매칭되어야 함', () => {
      const registry = new KeybindingRegistryImpl();
      
      // Cmd+b로 등록
      registry.register({
        key: 'Cmd+b',
        command: 'toggleBold'
      });
      
      // Mod+b로 resolve하면 매칭되어야 함
      const result = registry.resolve('Mod+b', {});
      expect(result).toHaveLength(1);
      expect(result[0].command).toBe('toggleBold');
    });

    it('Cmd+b로 명시적으로 등록하면 Mod+b보다 우선해야 함', () => {
      const registry = new KeybindingRegistryImpl();
      
      // Mod+b로 등록
      registry.register({
        key: 'Mod+b',
        command: 'modBold',
        source: 'core'
      });
      
      // Cmd+b로 명시적으로 등록
      registry.register({
        key: 'Cmd+b',
        command: 'cmdBold',
        source: 'extension'
      });
      
      // Cmd+b로 resolve하면 명시적인 Cmd+b가 매칭되어야 함
      const result = registry.resolve('Cmd+b', {});
      expect(result).toHaveLength(2);
      // Cmd+b가 명시적으로 등록되어 있으므로 우선
      expect(result[0].command).toBe('cmdBold'); // extension (우선순위 높음)
      expect(result[1].command).toBe('modBold'); // core
    });

    it('Mod+Shift+z keybinding이 Ctrl+Shift+z로도 매칭되어야 함', () => {
      const registry = new KeybindingRegistryImpl();
      
      // Mod+Shift+z로 등록
      registry.register({
        key: 'Mod+Shift+z',
        command: 'redo'
      });
      
      // Ctrl+Shift+z로 resolve하면 매칭되어야 함
      const result = registry.resolve('Ctrl+Shift+z', {});
      expect(result).toHaveLength(1);
      expect(result[0].command).toBe('redo');
    });
  });

  describe('Key string case normalization', () => {
    it('should match keybindings regardless of case', () => {
      const registry = new KeybindingRegistryImpl();
      
      // 소문자로 등록
      registry.register({
        key: 'Mod+b',
        command: 'toggleBold'
      });
      
      // 대문자로 resolve해도 매칭되어야 함
      const result1 = registry.resolve('Ctrl+B', {});
      expect(result1).toHaveLength(1);
      expect(result1[0].command).toBe('toggleBold');
      
      // 소문자로 resolve해도 매칭되어야 함
      const result2 = registry.resolve('Ctrl+b', {});
      expect(result2).toHaveLength(1);
      expect(result2[0].command).toBe('toggleBold');
    });

    it('should normalize modifier case', () => {
      const registry = new KeybindingRegistryImpl();
      
      // 대문자 modifier로 등록
      registry.register({
        key: 'CTRL+B',
        command: 'toggleBold'
      });
      
      // 소문자 modifier로 resolve해도 매칭되어야 함
      const result = registry.resolve('ctrl+b', {});
      expect(result).toHaveLength(1);
      expect(result[0].command).toBe('toggleBold');
    });

    it('should handle mixed case', () => {
      const registry = new KeybindingRegistryImpl();
      
      // 소문자로 등록
      registry.register({
        key: 'mod+shift+z',
        command: 'redo'
      });
      
      // 대문자로 resolve해도 매칭되어야 함
      const result = registry.resolve('Mod+Shift+Z', {});
      expect(result).toHaveLength(1);
      expect(result[0].command).toBe('redo');
    });
  });
});

