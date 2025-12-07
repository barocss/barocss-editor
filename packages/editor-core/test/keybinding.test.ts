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

      // Get from contextProvider even if context is not provided
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

      // Provided context takes priority
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

      // If no contextProvider and no context provided, evaluate with empty context
      const result = registry.resolve('Ctrl+b');
      expect(result).toHaveLength(0);
    });
  });

  describe('setCurrentSource and automatic source assignment', () => {
    it('should use current source when setCurrentSource is called', () => {
      const registry = new KeybindingRegistryImpl();
      
      // Simulate Extension registration
      registry.setCurrentSource('extension');
      registry.register({
        key: 'Mod+b',
        command: 'toggleBold'
        // source is automatically 'extension'
      });
      registry.setCurrentSource(null);
      
      const result = registry.resolve('Mod+b', {});
      expect(result).toHaveLength(1);
      expect(result[0].command).toBe('toggleBold');
      
      // Verify source is internally set to 'extension'
      // (difficult to verify directly, but can verify by priority)
    });

    it('should use user as default when setCurrentSource is not called', () => {
      const registry = new KeybindingRegistryImpl();
      
      // Register without calling setCurrentSource
      registry.register({
        key: 'Ctrl+d',
        command: 'deleteSelection'
        // source is automatically 'user' (default)
      });
      
      // Verify user source has higher priority than core
      registry.setCurrentSource('core');
      registry.register({
        key: 'Ctrl+d',
        command: 'coreDelete'
      });
      registry.setCurrentSource(null);
      
      const result = registry.resolve('Ctrl+d', {});
      expect(result).toHaveLength(2);
      // user should have higher priority than core
      expect(result[0].command).toBe('deleteSelection'); // user
      expect(result[1].command).toBe('coreDelete'); // core
    });

    it('should override explicit source when current source is set', () => {
      const registry = new KeybindingRegistryImpl();
      
      // Even if source: 'user' is explicitly specified during Extension registration, it is ignored
      registry.setCurrentSource('extension');
      registry.register({
        key: 'Mod+b',
        command: 'toggleBold',
        source: 'user'  // Explicitly specified but ignored
      });
      registry.setCurrentSource(null);
      
      // Compare with one registered with user source
      registry.register({
        key: 'Mod+b',
        command: 'userBold',
        source: 'user'
      });
      
      const result = registry.resolve('Mod+b', {});
      expect(result).toHaveLength(2);
      // user should have higher priority than extension
      expect(result[0].command).toBe('userBold'); // user
      expect(result[1].command).toBe('toggleBold'); // extension (current context takes priority)
    });

    it('should handle core keybinding registration', () => {
      const registry = new KeybindingRegistryImpl();
      
      // Simulate Core registration
      registry.setCurrentSource('core');
      registry.register({
        key: 'Enter',
        command: 'insertParagraph'
        // source is automatically 'core'
      });
      registry.setCurrentSource(null);
      
      // Extension registration
      registry.setCurrentSource('extension');
      registry.register({
        key: 'Enter',
        command: 'extensionEnter'
      });
      registry.setCurrentSource(null);
      
      // Register user
      registry.register({
        key: 'Enter',
        command: 'userEnter'
        // source is automatically 'user'
      });
      
      const result = registry.resolve('Enter', {});
      expect(result).toHaveLength(3);
      // Priority: user > extension > core
      expect(result[0].command).toBe('userEnter');
      expect(result[1].command).toBe('extensionEnter');
      expect(result[2].command).toBe('insertParagraph');
    });

    it('should handle Extension onCreate simulation', () => {
      const registry = new KeybindingRegistryImpl();
      
      // Simulate Extension's onCreate
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
      
      // Verify all keybindings are registered with extension source
      const boldResult = registry.resolve('Mod+b', {});
      const italicResult = registry.resolve('Mod+i', {});
      
      expect(boldResult).toHaveLength(1);
      expect(italicResult).toHaveLength(1);
      
      // Registering with user source should have higher priority
      registry.register({
        key: 'Mod+b',
        command: 'userBold'
        // source is automatically 'user'
      });
      
      const finalResult = registry.resolve('Mod+b', {});
      expect(finalResult).toHaveLength(2);
      expect(finalResult[0].command).toBe('userBold'); // user has priority
      expect(finalResult[1].command).toBe('toggleBold'); // extension
    });
  });

  describe('Mod key expansion and matching', () => {
    it('Mod+b keybinding should also match Ctrl+b', () => {
      const registry = new KeybindingRegistryImpl();
      
      // Register Mod+b
      registry.register({
        key: 'Mod+b',
        command: 'toggleBold'
      });
      
      // Should match when resolving Ctrl+b
      const result = registry.resolve('Ctrl+b', {});
      expect(result).toHaveLength(1);
      expect(result[0].command).toBe('toggleBold');
    });

    it('Mod+b keybinding should also match Cmd+b', () => {
      const registry = new KeybindingRegistryImpl();
      
      // Register Mod+b
      registry.register({
        key: 'Mod+b',
        command: 'toggleBold'
      });
      
      // Should match when resolving Cmd+b
      const result = registry.resolve('Cmd+b', {});
      expect(result).toHaveLength(1);
      expect(result[0].command).toBe('toggleBold');
    });

    it('Ctrl+b registered keybinding should also match Mod+b', () => {
      const registry = new KeybindingRegistryImpl();
      
      // Register Ctrl+b
      registry.register({
        key: 'Ctrl+b',
        command: 'toggleBold'
      });
      
      // Should match when resolving Mod+b
      const result = registry.resolve('Mod+b', {});
      expect(result).toHaveLength(1);
      expect(result[0].command).toBe('toggleBold');
    });

    it('Cmd+b registered keybinding should also match Mod+b', () => {
      const registry = new KeybindingRegistryImpl();
      
      // Register Cmd+b
      registry.register({
        key: 'Cmd+b',
        command: 'toggleBold'
      });
      
      // Should match when resolving Mod+b
      const result = registry.resolve('Mod+b', {});
      expect(result).toHaveLength(1);
      expect(result[0].command).toBe('toggleBold');
    });

    it('explicitly registered Cmd+b should take priority over Mod+b', () => {
      const registry = new KeybindingRegistryImpl();
      
      // Register Mod+b
      registry.register({
        key: 'Mod+b',
        command: 'modBold',
        source: 'core'
      });
      
      // Explicitly register Cmd+b
      registry.register({
        key: 'Cmd+b',
        command: 'cmdBold',
        source: 'extension'
      });
      
      // Explicit Cmd+b should match when resolving Cmd+b
      const result = registry.resolve('Cmd+b', {});
      expect(result).toHaveLength(2);
      // Cmd+b is explicitly registered, so it takes priority
      expect(result[0].command).toBe('cmdBold'); // extension (higher priority)
      expect(result[1].command).toBe('modBold'); // core
    });

    it('Mod+Shift+z keybinding should also match Ctrl+Shift+z', () => {
      const registry = new KeybindingRegistryImpl();
      
      // Register with Mod+Shift+z
      registry.register({
        key: 'Mod+Shift+z',
        command: 'redo'
      });
      
      // Should match when resolving with Ctrl+Shift+z
      const result = registry.resolve('Ctrl+Shift+z', {});
      expect(result).toHaveLength(1);
      expect(result[0].command).toBe('redo');
    });
  });

  describe('Key string case normalization', () => {
    it('should match keybindings regardless of case', () => {
      const registry = new KeybindingRegistryImpl();
      
      // Register with lowercase
      registry.register({
        key: 'Mod+b',
        command: 'toggleBold'
      });
      
      // Should match when resolving with uppercase
      const result1 = registry.resolve('Ctrl+B', {});
      expect(result1).toHaveLength(1);
      expect(result1[0].command).toBe('toggleBold');
      
      // Should match when resolving with lowercase
      const result2 = registry.resolve('Ctrl+b', {});
      expect(result2).toHaveLength(1);
      expect(result2[0].command).toBe('toggleBold');
    });

    it('should normalize modifier case', () => {
      const registry = new KeybindingRegistryImpl();
      
      // Register with uppercase modifier
      registry.register({
        key: 'CTRL+B',
        command: 'toggleBold'
      });
      
      // Should match when resolving with lowercase modifier
      const result = registry.resolve('ctrl+b', {});
      expect(result).toHaveLength(1);
      expect(result[0].command).toBe('toggleBold');
    });

    it('should handle mixed case', () => {
      const registry = new KeybindingRegistryImpl();
      
      // Register with lowercase
      registry.register({
        key: 'mod+shift+z',
        command: 'redo'
      });
      
      // Should match when resolving with uppercase
      const result = registry.resolve('Mod+Shift+Z', {});
      expect(result).toHaveLength(1);
      expect(result[0].command).toBe('redo');
    });
  });
});

