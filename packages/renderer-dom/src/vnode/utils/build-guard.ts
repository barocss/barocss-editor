let buildInProgress = false;

export function getBuildInProgressFlag(): boolean {
  return buildInProgress;
}

export function setBuildInProgressFlag(value: boolean): void {
  buildInProgress = value;
}

export function clearBuildInProgressFlag(): void {
  buildInProgress = false;
}

