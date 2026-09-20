/** Convert a product's post-removal slot to the common planner's original child gap. */
export function gapBeforeRemoval(content: readonly string[], movedIds: readonly string[], index: number): number {
  const moved = new Set(movedIds), remaining = content.filter(id => !moved.has(id));
  if (!Number.isInteger(index) || index < 0 || index > remaining.length) throw new Error('Invalid post-removal position');
  return index === remaining.length ? content.length : content.indexOf(remaining[index]);
}
