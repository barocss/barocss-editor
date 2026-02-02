/**
 * Simple EventEmitter for DecoratorManager. No external dependency.
 */

export class EventEmitter<T extends Record<string, (...args: any[]) => void>> {
  private listeners = new Map<keyof T, Array<T[keyof T]>>();

  on<K extends keyof T>(event: K, listener: T[K]): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  off<K extends keyof T>(event: K, listener: T[K]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index !== -1) {
        eventListeners.splice(index, 1);
      }
    }
  }

  emit<K extends keyof T>(event: K, ...args: Parameters<T[K]>): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach((listener) => {
        try {
          listener(...args);
        } catch (error) {
          console.error(`Error in event listener for ${String(event)}:`, error);
        }
      });
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}
