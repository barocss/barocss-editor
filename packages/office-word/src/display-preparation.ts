/** Product display projections must be present before pagination measures the DOM. */
const preparations = new WeakMap<HTMLElement, () => void>();

export function registerWordDisplayPreparation(container: HTMLElement, prepare: () => void): () => void {
  preparations.set(container, prepare);
  return () => { if (preparations.get(container) === prepare) preparations.delete(container); };
}

export function prepareWordDisplay(container: HTMLElement): void {
  preparations.get(container)?.();
}
