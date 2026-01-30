import type { Editor } from './editor';

export interface EditorPlugin {
  name: string;
  version: string;
  install(editor: Editor): void;
  uninstall?(): void;
}

export class PluginManager {
  private _plugins = new Map<string, EditorPlugin>();
  private _editor: Editor | null = null;

  constructor(editor: Editor) {
    this._editor = editor;
  }

  install(plugin: EditorPlugin): boolean {
    if (this._plugins.has(plugin.name)) {
      console.warn(`Plugin '${plugin.name}' is already installed`);
      return false;
    }

    try {
      plugin.install(this._editor!);
      this._plugins.set(plugin.name, plugin);
      return true;
    } catch (error) {
      console.error(`Failed to install plugin '${plugin.name}':`, error);
      return false;
    }
  }

  uninstall(pluginName: string): boolean {
    const plugin = this._plugins.get(pluginName);
    if (!plugin) {
      console.warn(`Plugin '${pluginName}' is not installed`);
      return false;
    }

    try {
      plugin.uninstall?.();
      this._plugins.delete(pluginName);
      return true;
    } catch (error) {
      console.error(`Failed to uninstall plugin '${pluginName}':`, error);
      return false;
    }
  }

  get(pluginName: string): EditorPlugin | undefined {
    return this._plugins.get(pluginName);
  }

  getAll(): EditorPlugin[] {
    return Array.from(this._plugins.values());
  }

  has(pluginName: string): boolean {
    return this._plugins.has(pluginName);
  }
}

export class KeyboardShortcutsPlugin implements EditorPlugin {
  name = 'keyboard-shortcuts';
  version = '1.0.0';

  install(_editor: Editor): void {
    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case 'b':
            event.preventDefault();
            break;
          case 'i':
            event.preventDefault();
            break;
          case 'u':
            event.preventDefault();
            break;
        }
      }
    });
  }
}

export class AutoSavePlugin implements EditorPlugin {
  name = 'auto-save';
  version = '1.0.0';
  private _intervalId: number | null = null;

  install(editor: Editor): void {
    this._intervalId = window.setInterval(() => {
      const document = editor.document;
      console.log('Auto-saving document:', document.type);
    }, 30000); // Every 30 seconds
  }

  uninstall(): void {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }
}
