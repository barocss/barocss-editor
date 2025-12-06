/**
 * Pattern-based Decorator configuration manager
 * 
 * Manages pattern configurations as an array and passes them to DOMRenderer.
 */

/**
 * Pattern-based Decorator configuration type
 */
export interface PatternDecoratorConfig {
  /** Pattern identifier (unified as sid) */
  sid: string;
  
  /** Decorator type (unified as stype) */
  stype: string;
  
  /** Decorator category */
  category: 'inline' | 'block' | 'layer';
  
  /** Regex pattern or function pattern */
  pattern: RegExp | ((text: string) => Array<{
    match: string;
    index: number;
    groups?: RegExpMatchArray['groups'];
    [key: number]: string | undefined;
  }>);
  
  /** Extract data from matched text */
  extractData: (match: RegExpMatchArray) => Record<string, any>;
  
  /** Decorator creation function */
  createDecorator: (
    nodeId: string,
    startOffset: number,
    endOffset: number,
    extractedData: Record<string, any>
  ) => {
    sid: string;
    target: {
      sid: string;
      startOffset: number;
      endOffset: number;
    };
    data?: Record<string, any>;
    category?: 'inline' | 'block' | 'layer'; // Can be specified in createDecorator (uses config's category if missing)
    layerTarget?: 'content' | 'decorator' | 'selection' | 'context' | 'custom'; // Can render to other layers
  } | Array<{
    sid: string;
    target: {
      sid: string;
      startOffset: number;
      endOffset: number;
    };
    data?: Record<string, any>;
    category?: 'inline' | 'block' | 'layer';
    layerTarget?: 'content' | 'decorator' | 'selection' | 'context' | 'custom';
  }>; // If array is returned, can create multiple decorators from one match
  
  /** Priority (lower is higher priority, default: 100) */
  priority?: number;
  
  /** Whether enabled (default: true) */
  enabled?: boolean;
}

/**
 * Pattern-based Decorator configuration manager
 * 
 * Stores and manages pattern configurations as an array.
 * Enable/disable of each pattern is managed by config.enabled.
 */
export class PatternDecoratorConfigManager {
  /** Pattern configuration array */
  private configs: PatternDecoratorConfig[] = [];
  
  /**
   * Set pattern configuration array
   * 
   * @param configs - Pattern configuration array
   */
  setConfigs(configs: PatternDecoratorConfig[]): void {
    this.configs = [...configs];
  }
  
  /**
   * Add pattern configuration
   * 
   * @param config - Pattern configuration
   */
  addConfig(config: PatternDecoratorConfig): void {
    const existingIndex = this.configs.findIndex(c => c.sid === config.sid);
    if (existingIndex >= 0) {
      this.configs[existingIndex] = config;
    } else {
      this.configs.push(config);
    }
  }
  
  /**
   * Remove pattern configuration
   * 
   * @param sid - Pattern SID
   */
  removeConfig(sid: string): boolean {
    const index = this.configs.findIndex(c => c.sid === sid);
    if (index >= 0) {
      this.configs.splice(index, 1);
      return true;
    }
    return false;
  }
  
  /**
   * Get all pattern configurations
   * 
   * @param enabledOnly - If true, return only enabled ones (default: false)
   * @returns Pattern configuration array (copy)
   */
  getConfigs(enabledOnly: boolean = false): PatternDecoratorConfig[] {
    const configs = [...this.configs];
    if (enabledOnly) {
      return configs.filter(config => config.enabled !== false); // Default is true
    }
    return configs;
  }
  
  /**
   * Enable/disable pattern configuration
   * 
   * @param sid - Pattern SID
   * @param enabled - Whether enabled
   */
  setConfigEnabled(sid: string, enabled: boolean): boolean {
    const config = this.configs.find(c => c.sid === sid);
    if (config) {
      config.enabled = enabled;
      return true;
    }
    return false;
  }
  
  /**
   * Check if pattern configuration is enabled
   * 
   * @param sid - Pattern SID
   * @returns Whether enabled (default: true)
   */
  isConfigEnabled(sid: string): boolean {
    const config = this.configs.find(c => c.sid === sid);
    return config?.enabled !== false; // Default is true
  }
  
  /**
   * Clear pattern configurations
   */
  clear(): void {
    this.configs = [];
  }
}

