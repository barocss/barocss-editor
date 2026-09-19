/** Column measurements are twips. Keep the total exact when distributing rounding. */
export function equalColumnWidths(total: number, count: number): number[] {
  if (!Number.isInteger(count) || count < 1 || !Number.isFinite(total) || total < count) return [];
  const rounded = Math.round(total);
  const base = Math.floor(rounded / count);
  return Array.from({ length: count }, (_, i) => base + (i < rounded % count ? 1 : 0));
}

export function tableDimensionGrid(count: number, stored: number[], measured: number[], fallbackTotal: number): number[] {
  const valid = (grid: number[]) => grid.length === count && grid.every(n => Number.isFinite(n) && n > 0);
  if (valid(stored)) return stored.map(Math.round);
  if (valid(measured)) return measured.map(Math.round);
  return equalColumnWidths(fallbackTotal, count);
}
