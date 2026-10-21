import { expect, it, vi } from 'vitest';
import { createPrintPages } from '../src/print-pages';

it('keeps a prepared inactive editor out of browser printing until it becomes active', () => {
  const source = document.createElement('div');
  source.innerHTML = '<p>Original text</p><div class="w-sheet"></div>';
  document.body.append(source);
  const before = source.innerHTML;
  let active = false;
  const restore = vi.fn(), prepare = vi.fn(() => restore);
  const printer = createPrintPages(() => source, document, { isActive: () => active, prepare });
  const detach = printer.attach();
  try {
    window.dispatchEvent(new Event('beforeprint'));
    expect(prepare).not.toHaveBeenCalled();
    expect(document.querySelector('.w-print-pages')).toBeNull();
    expect(source.innerHTML).toBe(before);
    active = true;
    window.dispatchEvent(new Event('beforeprint'));
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.w-print-page')?.textContent).toContain('Original text');
    expect(source.innerHTML).toBe(before);
    window.dispatchEvent(new Event('afterprint'));
    expect(document.querySelector('.w-print-pages')).toBeNull();
  } finally { detach(); source.remove(); }
});
