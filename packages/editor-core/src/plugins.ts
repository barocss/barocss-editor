import { Editor } from './types';

// 플러그인 인터페이스
export interface EditorPlugin {
  name: string;
  version: string;
  install(editor: Editor): void;
  uninstall?(): void;
}

// 플러그인 매니저
export class PluginManager {
  private _plugins = new Map<string, EditorPlugin>();
  private _editor: Editor | null = null;

  constructor(editor: Editor) {
    this._editor = editor;
  }

  // 플러그인 설치
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

  // 플러그인 제거
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

  // 플러그인 가져오기
  get(pluginName: string): EditorPlugin | undefined {
    return this._plugins.get(pluginName);
  }

  // 모든 플러그인 가져오기
  getAll(): EditorPlugin[] {
    return Array.from(this._plugins.values());
  }

  // 플러그인 존재 확인
  has(pluginName: string): boolean {
    return this._plugins.has(pluginName);
  }
}

// 기본 플러그인들
export class KeyboardShortcutsPlugin implements EditorPlugin {
  name = 'keyboard-shortcuts';
  version = '1.0.0';

  install(_editor: Editor): void {
    // 키보드 단축키 로직
    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case 'b':
            event.preventDefault();
            // 굵게 토글
            break;
          case 'i':
            event.preventDefault();
            // 기울임꼴 토글
            break;
          case 'u':
            event.preventDefault();
            // 밑줄 토글
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
    // 자동 저장 로직
    this._intervalId = window.setInterval(() => {
      const document = editor.document;
      // 저장 로직
      console.log('Auto-saving document:', document.type);
    }, 30000); // 30초마다
  }

  uninstall(): void {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }
}
