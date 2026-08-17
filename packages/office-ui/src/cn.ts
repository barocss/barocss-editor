import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Join class names, letting a later Tailwind class win over an earlier one.
 *
 * Plain concatenation does not: `px-2` and `px-4` both end up in the string and
 * which applies depends on the order in the stylesheet rather than the order at
 * the call site, so a component's own padding cannot be overridden by the caller.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
