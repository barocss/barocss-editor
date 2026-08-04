import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Editor, type Extension } from '../src/index';
import { DEFAULT_KEYBINDINGS } from '../src/keybinding/default-keybindings';

describe('Editor', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      editable: true
    });
  });

  describe('기본 기능', () => {
    it('에디터가 생성되어야 함', () => {
      expect(editor).toBeDefined();
      expect(editor.isEditable).toBe(true);
      expect(editor.isFocused).toBe(false);
    });

    it('문서 상태에 접근할 수 있어야 함', () => {
      const document = editor.document;
      expect(document).toBeDefined();
      expect(document.type).toBe('document');
    });

    it('선택 상태에 접근할 수 있어야 함', () => {
      const selection = editor.selection;
      // selection is ModelSelection | null (model-level; no DOM anchorNode)
      expect(selection === null || typeof selection === 'object').toBe(true);
      if (selection) {
        expect(selection.startNodeId).toBeDefined();
        expect(selection.startOffset).toBeDefined();
        expect(selection.endNodeId).toBeDefined();
        expect(selection.endOffset).toBeDefined();
      }
    });

    it('contentEditable 요소를 설정할 수 있어야 함', () => {
      const mockElement = document.createElement('div');
      expect(() => {
        editor.setContentEditableElement(mockElement);
      }).not.toThrow();
    });
  });

  describe('이벤트 시스템', () => {
    it('이벤트 리스너를 등록하고 제거할 수 있어야 함', () => {
      const listener = () => {};
      
      editor.on('contentChange', listener);
      expect(() => editor.off('contentChange', listener)).not.toThrow();
    });

    it('이벤트를 발생시킬 수 있어야 함', () => {
      let eventFired = false;
      const listener = () => { eventFired = true; };
      
      editor.on('contentChange', listener);
      editor.emit('contentChange', { content: editor.document, transaction: null });
      
      expect(eventFired).toBe(true);
    });
  });

  describe('Context 관리', () => {
    it('setContext로 context를 설정할 수 있어야 함', () => {
      editor.setContext('test.key', true);
      const context = editor.getContext();
      expect(context['test.key']).toBe(true);
    });

    it('should be able to query specific key with getContext(key)', () => {
      editor.setContext('test.key', 'value');
      
      // Query specific key
      const value = editor.getContext('test.key');
      expect(value).toBe('value');
      
      // Return undefined for non-existent key
      const unknown = editor.getContext('unknown.key');
      expect(unknown).toBeUndefined();
    });

    it('both getContext() and getContext(key) should work', () => {
      editor.setContext('test.key1', 'value1');
      editor.setContext('test.key2', 'value2');
      
      // Query entire context
      const context = editor.getContext();
      expect(context['test.key1']).toBe('value1');
      expect(context['test.key2']).toBe('value2');
      
      // Query specific key
      expect(editor.getContext('test.key1')).toBe('value1');
      expect(editor.getContext('test.key2')).toBe('value2');
    });

    it('setContext 변경 시 일반 이벤트가 발생해야 함', () => {
      const listener = vi.fn();
      editor.on('editor:context.change', listener);
      
      editor.setContext('test.key', 'value');
      
      expect(listener).toHaveBeenCalledWith({
        key: 'test.key',
        value: 'value',
        oldValue: undefined
      });
    });

    it('should be able to subscribe to events for specific key only', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      
      // Subscribe to specific key only
      editor.on('editor:context.change:test.key1', listener1);
      editor.on('editor:context.change:test.key2', listener2);
      
      editor.setContext('test.key1', 'value1');
      editor.setContext('test.key2', 'value2');
      
      // listener1 only receives test.key1
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener1).toHaveBeenCalledWith({
        key: 'test.key1',
        value: 'value1',
        oldValue: undefined
      });
      
      // listener2 only receives test.key2
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledWith({
        key: 'test.key2',
        value: 'value2',
        oldValue: undefined
      });
    });

    it('should be able to subscribe to specific key only with onContextChange convenience method', () => {
      const listener = vi.fn();
      const unsubscribe = editor.onContextChange('test.key', listener);
      
      editor.setContext('test.key', 'value1');
      editor.setContext('other.key', 'value2'); // Other keys are ignored
      editor.setContext('test.key', 'value3');
      
      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenNthCalledWith(1, {
        key: 'test.key',
        value: 'value1',
        oldValue: undefined
      });
      expect(listener).toHaveBeenNthCalledWith(2, {
        key: 'test.key',
        value: 'value3',
        oldValue: 'value1'
      });
      
      // Test unsubscribe
      unsubscribe();
      editor.setContext('test.key', 'value4');
      expect(listener).toHaveBeenCalledTimes(2); // No longer called
    });

    it('setContext command로 context를 설정할 수 있어야 함', async () => {
      const result = await editor.executeCommand('setContext', {
        key: 'test.key',
        value: 'command-value'
      });
      
      expect(result).toBe(true);
      const context = editor.getContext();
      expect(context['test.key']).toBe('command-value');
    });

    it('should be able to remove context key with null or undefined', () => {
      // Set context key
      editor.setContext('test.key', 'value');
      expect(editor.getContext()['test.key']).toBe('value');
      
      // Remove with null
      editor.setContext('test.key', null);
      expect(editor.getContext()['test.key']).toBeUndefined();
      
      // Set again
      editor.setContext('test.key', 'value2');
      expect(editor.getContext()['test.key']).toBe('value2');
      
      // Remove with undefined
      editor.setContext('test.key', undefined);
      expect(editor.getContext()['test.key']).toBeUndefined();
    });

    it('context key 제거 시 이벤트가 발생해야 함', () => {
      editor.setContext('test.key', 'value');
      
      const listener = vi.fn();
      editor.on('editor:context.change', listener);
      
      editor.setContext('test.key', null);
      
      expect(listener).toHaveBeenCalledWith({
        key: 'test.key',
        value: null,
        oldValue: 'value'
      });
    });
  });

  describe('명령어 시스템', () => {
    const defaultKeybindingCommands = Array.from(new Set(
      DEFAULT_KEYBINDINGS.map(binding => binding.command).filter(Boolean)
    ));

    it('명령어를 등록할 수 있어야 함', () => {
      const command = {
        name: 'testCommand',
        execute: () => true,
        canExecute: () => true
      };

      expect(() => editor.registerCommand(command)).not.toThrow();
    });

    it('등록된 명령어를 실행할 수 있어야 함', async () => {
      let executed = false;
      const command = {
        name: 'testCommand',
        execute: () => { executed = true; return true; },
        canExecute: () => true
      };

      editor.registerCommand(command);
      const result = await editor.executeCommand('testCommand');
      
      expect(result).toBe(true);
      expect(executed).toBe(true);
    });

    it('존재하지 않는 명령어 실행 시 false를 반환해야 함', async () => {
      const result = await editor.executeCommand('nonExistentCommand');
      expect(result).toBe(false);
    });

    it('명령어 체이닝이 작동해야 함', () => {
      const chain = editor.chain();
      expect(chain).toBeDefined();
      expect(typeof chain.insertText).toBe('function');
      expect(typeof chain.focus).toBe('function');
      expect(typeof chain.toggleBold).toBe('function');
      expect(typeof chain.toggleItalic).toBe('function');
      expect(typeof chain.toggleUnderline).toBe('function');
      expect(typeof chain.toggleStrikeThrough).toBe('function');
      expect(typeof chain.run).toBe('function');
    });

    it('엔진 단독으로는 편집 커맨드를 갖지 않아야 함 (키트가 제공)', () => {
      // The engine no longer installs an extension set of its own: knowing that
      // `bold` or `toggleBulletList` exist is a product decision, not an engine
      // one. A bare Editor has only the core commands below; editing commands
      // arrive with a kit (see createEditor / createDefaultExtensions in
      // @barocss/extensions). Products can therefore pick different kits on the
      // same engine.
      const registeredCommands = new Set(Array.from((editor as any)._commands.keys()));

      // Editing commands come from a kit and must be absent here...
      for (const command of ['toggleBold', 'toggleItalic', 'setHeading1', 'toggleBulletList', 'insertParagraph']) {
        expect(registeredCommands.has(command)).toBe(false);
      }
      // ...while the engine's own commands stay available.
      for (const command of ['historyUndo', 'historyRedo', 'undo', 'redo', 'focus']) {
        expect(registeredCommands.has(command)).toBe(true);
      }
    });

    it('기본 커맨드 셋(focus/history 포함)이 등록되어야 함', () => {
      const registeredCommands = new Set(Array.from((editor as any)._commands.keys()));

      expect(registeredCommands.has('insertText')).toBe(true);
      expect(registeredCommands.has('deleteSelection')).toBe(true);
      expect(registeredCommands.has('focus')).toBe(true);
      expect(registeredCommands.has('historyUndo')).toBe(true);
      expect(registeredCommands.has('historyRedo')).toBe(true);
      expect(registeredCommands.has('undo')).toBe(true);
      expect(registeredCommands.has('redo')).toBe(true);
      expect(registeredCommands.has('setRange')).toBe(true);
      expect(registeredCommands.has('setNode')).toBe(true);
      expect(registeredCommands.has('setAbsolutePos')).toBe(true);
      expect(registeredCommands.has('clearSelection')).toBe(true);
    });

    it('undo/redo alias 명령어가 동작해야 함', async () => {
      const rootId = editor.getRootId();
      expect(rootId).toBeDefined();

      await editor.transaction([
        {
          type: 'addChild',
          payload: {
            parentId: rootId!,
            child: {
              stype: 'paragraph',
              content: [
                { stype: 'inline-text', text: 'Hello' }
              ]
            }
          }
        }
      ]).commit();

      expect(editor.canUndo()).toBe(true);

      const undoResult = await editor.executeCommand('undo');
      expect(undoResult).toBe(true);
      expect(editor.canUndo()).toBe(false);
      expect(editor.canRedo()).toBe(true);

      const redoResult = await editor.executeCommand('redo');
      expect(redoResult).toBe(true);
      expect(editor.canRedo()).toBe(false);
    });

    it('setRange / setNode / setAbsolutePos / clearSelection 명령어가 selection 제어에 동작해야 함', async () => {
      const rootId = editor.getRootId();
      expect(rootId).toBeDefined();

      await editor.transaction([
        {
          type: 'addChild',
          payload: {
            parentId: rootId!,
            child: {
              stype: 'paragraph',
              content: [
                { stype: 'inline-text', text: 'Hello' }
              ]
            }
          }
        }
      ]).commit();

      const rootNode = editor.dataStore.getNode(rootId!);
      const paragraphNodeId = Array.isArray(rootNode?.content) ? rootNode!.content[0] : null;
      expect(paragraphNodeId).toBeDefined();

      const paragraphNode = editor.dataStore.getNode(paragraphNodeId as string);
      const textNodeId = Array.isArray(paragraphNode?.content) ? paragraphNode!.content[0] : null;
      expect(textNodeId).toBeDefined();

      const setRangeResult = await editor.executeCommand('setRange', {
        type: 'range',
        startNodeId: textNodeId as string,
        startOffset: 1,
        endNodeId: textNodeId as string,
        endOffset: 1
      });
      expect(setRangeResult).toBe(true);
      expect(editor.selection).toMatchObject({
        type: 'range',
        startNodeId: textNodeId,
        startOffset: 1,
        endNodeId: textNodeId,
        endOffset: 1
      });

      const setNodeResult = await editor.executeCommand('setNode', {
        nodeId: paragraphNodeId as string
      });
      expect(setNodeResult).toBe(true);
      expect(editor.selection).toMatchObject({
        type: 'node',
        startNodeId: paragraphNodeId,
        endNodeId: paragraphNodeId
      });

      const setAbsolutePosResult = await editor.executeCommand('setAbsolutePos', {
        type: 'range',
        startNodeId: textNodeId as string,
        startOffset: 0,
        endNodeId: textNodeId as string,
        endOffset: 2
      });
      expect(setAbsolutePosResult).toBe(true);
      expect(editor.selection).toMatchObject({
        type: 'range',
        startNodeId: textNodeId,
        startOffset: 0,
        endNodeId: textNodeId,
        endOffset: 2
      });

      const clearSelectionResult = await editor.executeCommand('clearSelection');
      expect(clearSelectionResult).toBe(true);
      expect(editor.selection).toBeNull();
    });

    it('setNode 명령어 실행 시 node 타입의 editor:selection.model 이벤트가 emit되어야 함', async () => {
      const rootId = editor.getRootId();
      expect(rootId).toBeDefined();

      await editor.transaction([
        {
          type: 'addChild',
          payload: {
            parentId: rootId!,
            child: {
              stype: 'paragraph',
              content: [
                { stype: 'inline-text', text: 'Hello' }
              ]
            }
          }
        }
      ]).commit();

      const rootNode = editor.dataStore.getNode(rootId!);
      const paragraphNodeId = Array.isArray(rootNode?.content) ? rootNode!.content[0] : null;
      expect(paragraphNodeId).toBeDefined();

      const onSelectionModel = vi.fn();
      editor.on('editor:selection.model', onSelectionModel);

      const result = await editor.executeCommand('setNode', {
        nodeId: paragraphNodeId as string
      });

      expect(result).toBe(true);
      expect(onSelectionModel).toHaveBeenCalledTimes(1);
      expect(onSelectionModel).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'node',
          startNodeId: paragraphNodeId,
          startOffset: 0,
          endNodeId: paragraphNodeId,
          endOffset: 0
        })
      );
    });

    it('setRange 명령어 실행 시 로컬 payload는 editor:selection.model 래핑되지 않아야 함', async () => {
      const rootId = editor.getRootId();
      expect(rootId).toBeDefined();

      await editor.transaction([
        {
          type: 'addChild',
          payload: {
            parentId: rootId!,
            child: {
              stype: 'paragraph',
              content: [
                { stype: 'inline-text', text: 'Hello' }
              ]
            }
          }
        }
      ]).commit();

      const rootNode = editor.dataStore.getNode(rootId!);
      const paragraphNodeId = Array.isArray(rootNode?.content) ? rootNode!.content[0] : null;
      const paragraphNode = paragraphNodeId ? editor.dataStore.getNode(paragraphNodeId) : null;
      const textNodeId = Array.isArray(paragraphNode?.content) ? paragraphNode!.content[0] : null;
      expect(textNodeId).toBeDefined();

      const onSelectionModel = vi.fn();
      editor.on('editor:selection.model', onSelectionModel);

      const result = await editor.executeCommand('setRange', {
        type: 'range',
        startNodeId: textNodeId as string,
        startOffset: 0,
        endNodeId: textNodeId as string,
        endOffset: 1
      });

      expect(result).toBe(true);
      expect(onSelectionModel).toHaveBeenCalledTimes(1);
      const event = onSelectionModel.mock.calls[0]?.[0];
      expect(event).toMatchObject({
        type: 'range',
        startNodeId: textNodeId,
        startOffset: 0,
        endNodeId: textNodeId,
        endOffset: 1
      });
      expect(event).not.toHaveProperty('selection');
      expect(event).not.toHaveProperty('applySelectionToView');
      expect(event).not.toHaveProperty('source');
    });

    it('updateSelection selection 래퍼에서 source=remote이면 applySelectionToView는 false로 강제되어야 함', async () => {
      const rootId = editor.getRootId();
      expect(rootId).toBeDefined();

      await editor.transaction([
        {
          type: 'addChild',
          payload: {
            parentId: rootId!,
            child: {
              stype: 'paragraph',
              content: [
                { stype: 'inline-text', text: 'Hello' }
              ]
            }
          }
        }
      ]).commit();

      const rootNode = editor.dataStore.getNode(rootId!);
      const paragraphNodeId = Array.isArray(rootNode?.content) ? rootNode!.content[0] : null;
      const paragraphNode = paragraphNodeId ? editor.dataStore.getNode(paragraphNodeId) : null;
      const textNodeId = Array.isArray(paragraphNode?.content) ? paragraphNode!.content[0] : null;
      expect(textNodeId).toBeDefined();

      const onSelectionModel = vi.fn();
      editor.on('editor:selection.model', onSelectionModel);

      editor.updateSelection({
        selection: {
          type: 'range',
          startNodeId: textNodeId as string,
          startOffset: 0,
          endNodeId: textNodeId as string,
          endOffset: 1
        },
        source: 'remote',
        applySelectionToView: true
      });

      expect(onSelectionModel).toHaveBeenCalledTimes(1);
      const event = onSelectionModel.mock.calls[0]?.[0];
      expect(event).toMatchObject({
        selection: {
          type: 'range',
          startNodeId: textNodeId,
          startOffset: 0,
          endNodeId: textNodeId,
          endOffset: 1
        }
      });
      expect(event).toMatchObject({
        source: 'remote',
        applySelectionToView: false
      });
    });

    it('updateSelection에서 존재하지 않는 노드로 selection을 설정하면 선택이 clear되어야 함', async () => {
      const onSelectionModel = vi.fn();
      const onSelectionChange = vi.fn();
      editor.on('editor:selection.model', onSelectionModel);
      editor.on('editor:selection.change', onSelectionChange);

      editor.updateSelection({
        type: 'range',
        startNodeId: 'missing',
        startOffset: 0,
        endNodeId: 'missing',
        endOffset: 1
      });

      expect(editor.selection).toBeNull();
      expect(onSelectionModel).toHaveBeenCalledTimes(0);
      expect(onSelectionChange).toHaveBeenCalledTimes(0);
    });
  });

  describe('확장 시스템', () => {
    it('확장을 추가할 수 있어야 함', () => {
      const extension = {
        name: 'testExtension',
        onCreate: () => {},
        onDestroy: () => {}
      };

      expect(() => editor.use(extension)).not.toThrow();
    });

    it('확장을 제거할 수 있어야 함', () => {
      const extension = {
        name: 'testExtension',
        onCreate: () => {},
        onDestroy: () => {}
      };

      editor.use(extension);
      expect(() => editor.unuse(extension)).not.toThrow();
    });

    it('중복 확장 등록 시 경고해야 함', () => {
      const extension = {
        name: 'testExtension',
        onCreate: () => {},
        onDestroy: () => {}
      };

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      editor.use(extension);
      editor.use(extension);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Extension testExtension is already installed')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('히스토리 관리', () => {
    it('초기 상태에서 undo/redo가 불가능해야 함', () => {
      expect(editor.canUndo()).toBe(false);
      expect(editor.canRedo()).toBe(false);
    });

    it('undo/redo 메서드가 존재해야 함', () => {
      expect(typeof editor.undo).toBe('function');
      expect(typeof editor.undo).toBe('function');
    });
  });

  describe('생명주기', () => {
    it('에디터를 정리할 수 있어야 함', () => {
      expect(() => editor.destroy()).not.toThrow();
    });
  });
});

// Extension sets (createBasicExtensions, ExtensionSets) live in @barocss/extensions; tested there.
describe.skip('Extension Sets', () => {
  it('placeholder', () => {});
});

describe('Editor Keybinding 등록', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      editable: true
    });
  });

  it('Editor 생성 시 기본 keybinding이 등록되어야 함', () => {
    const result = editor.keybindings.resolve('Enter', {
      editorFocus: true,
      editorEditable: true
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].command).toBe('insertParagraph');
  });

  it('Extension 등록 시 keybinding이 자동으로 extension source로 등록되어야 함', () => {
    class TestExtension implements Extension {
      name = 'test';
      onCreate(ed: Editor): void {
        ed.keybindings.register({
          key: 'Mod+b',
          command: 'testBold'
          // source is automatically 'extension'
        });
      }
    }

    const testEditor = new Editor({
      extensions: [new TestExtension()]
    });

    const result = testEditor.keybindings.resolve('Mod+b', {
      editorFocus: true,
      editorEditable: true
    });
    const testBold = result.filter(r => r.command === 'testBold');
    expect(testBold.length).toBeGreaterThanOrEqual(1);
    expect(testBold[0].command).toBe('testBold');
  });

  it('User keybinding이 Extension keybinding보다 우선순위가 높아야 함', () => {
    class TestExtension implements Extension {
      name = 'test';
      onCreate(ed: Editor): void {
        ed.keybindings.register({
          key: 'Mod+b',
          command: 'extensionBold'
        });
      }
    }

    const testEditor = new Editor({
      extensions: [new TestExtension()]
    });

    // Register User keybinding (automatically 'user' if setCurrentSource is not called)
    testEditor.keybindings.register({
      key: 'Mod+b',
      command: 'userBold'
    });

    const result = testEditor.keybindings.resolve('Mod+b', {
      editorFocus: true,
      editorEditable: true
    });
    const userBold = result.find(r => r.command === 'userBold');
    const extensionBold = result.find(r => r.command === 'extensionBold');
    expect(userBold).toBeDefined();
    expect(extensionBold).toBeDefined();
    expect(result.indexOf(userBold!)).toBeLessThan(result.indexOf(extensionBold!)); // user takes priority
  });

  it('should ignore Extension attempts to manipulate source', () => {
    class TestExtension implements Extension {
      name = 'test';
      onCreate(ed: Editor): void {
        // Even if source: 'user' is specified during Extension registration, it is ignored
        ed.keybindings.register({
          key: 'Mod+b',
          command: 'extensionBold',
          source: 'user'  // Explicitly specified but ignored
        });
      }
    }

    const testEditor = new Editor({
      extensions: [new TestExtension()]
    });

    // Register User keybinding
    testEditor.keybindings.register({
      key: 'Mod+b',
      command: 'userBold'
    });

    const result = testEditor.keybindings.resolve('Mod+b', {
      editorFocus: true,
      editorEditable: true
    });
    const userBold = result.find(r => r.command === 'userBold');
    const extensionBold = result.find(r => r.command === 'extensionBold');
    expect(userBold).toBeDefined();
    expect(extensionBold).toBeDefined();
    expect(result.indexOf(userBold!)).toBeLessThan(result.indexOf(extensionBold!)); // user has higher priority
  });
});
