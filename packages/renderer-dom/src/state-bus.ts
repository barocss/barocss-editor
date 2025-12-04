let rerenderCallback: (() => void) | null = null;

export function setOnRerenderCallback(cb: () => void): void {
  rerenderCallback = cb;
}

export function triggerRerender(): void {
  if (rerenderCallback) rerenderCallback();
}


