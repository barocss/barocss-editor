/**
 * Pattern-based decorator configuration manager.
 * Manages pattern configs and passes them to the pattern runner for execution.
 */

/**
 * Pattern-based decorator configuration type.
 */
export interface PatternDecoratorConfig {
  sid: string;
  stype: string;
  category: 'inline' | 'block' | 'layer';
  pattern:
    | RegExp
    | ((text: string) => Array<{
        match: string;
        index: number;
        groups?: RegExpMatchArray['groups'];
        [key: number]: string | undefined;
      }>);
  extractData: (match: RegExpMatchArray) => Record<string, unknown>;
  createDecorator: (
    nodeId: string,
    startOffset: number,
    endOffset: number,
    extractedData: Record<string, unknown>
  ) =>
    | {
        sid: string;
        target: { sid: string; startOffset: number; endOffset: number };
        data?: Record<string, unknown>;
        category?: 'inline' | 'block' | 'layer';
        layerTarget?: 'content' | 'decorator' | 'selection' | 'context' | 'custom';
      }
    | Array<{
        sid: string;
        target: { sid: string; startOffset: number; endOffset: number };
        data?: Record<string, unknown>;
        category?: 'inline' | 'block' | 'layer';
        layerTarget?: 'content' | 'decorator' | 'selection' | 'context' | 'custom';
      }>;
  priority?: number;
  enabled?: boolean;
}

export class PatternDecoratorConfigManager {
  private configs: PatternDecoratorConfig[] = [];

  setConfigs(configs: PatternDecoratorConfig[]): void {
    this.configs = [...configs];
  }

  addConfig(config: PatternDecoratorConfig): void {
    const existingIndex = this.configs.findIndex((c) => c.sid === config.sid);
    if (existingIndex >= 0) {
      this.configs[existingIndex] = config;
    } else {
      this.configs.push(config);
    }
  }

  removeConfig(sid: string): boolean {
    const index = this.configs.findIndex((c) => c.sid === sid);
    if (index >= 0) {
      this.configs.splice(index, 1);
      return true;
    }
    return false;
  }

  getConfigs(enabledOnly: boolean = false): PatternDecoratorConfig[] {
    const configs = [...this.configs];
    if (enabledOnly) {
      return configs.filter((c) => c.enabled !== false);
    }
    return configs;
  }

  setConfigEnabled(sid: string, enabled: boolean): boolean {
    const config = this.configs.find((c) => c.sid === sid);
    if (config) {
      config.enabled = enabled;
      return true;
    }
    return false;
  }

  isConfigEnabled(sid: string): boolean {
    const config = this.configs.find((c) => c.sid === sid);
    return config?.enabled !== false;
  }

  clear(): void {
    this.configs = [];
  }
}
