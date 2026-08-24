import { documentVar, isVarRef, varNameOf } from '@barocss/office-word';
import { isThemeRef, resolveThemeValue, themeFor } from './theme';
import type { DeckAccess, DeckNode } from './deck';

/**
 * A value that **names** something, resolved: a theme slot, or one of the document's variables.
 *
 * ## Why one walk and not two
 *
 * Both are written the same way — a prefix where the value goes, `theme:accent1` beside
 * `var:강조` beside `#0ea5e9` — and both hide in the same places: an attribute, a paint in a list
 * of paints, a stop in a gradient. Two walks would be two chances for one of them to miss the
 * gradient stop, which is exactly what happened the first time the theme's own walk was written
 * (it read the top level only, so picking a theme colour for a fill made the shape lose its
 * colour). So the traversal is one function and what counts as a reference is its argument.
 *
 * ## Why a variable may hold a theme slot
 *
 * `variable 강조 = theme:accent1` is a document saying "my accent is the design's accent", and it
 * composes exactly the way a card's default naming a variable does. So resolution follows the
 * chain, depth-limited: a document that pointed two variables at each other must not take the
 * editor down with it.
 */

/** What counts as a reference, and what it resolves to. */
export interface Named {
  isRef: (value: unknown) => boolean;
  resolve: (value: unknown) => string | undefined;
}

/**
 * Every value in a set of attributes, with its references filled in.
 *
 * The whole map at once, because a shape's paint is read as a map — the gradient
 * ends, the stroke, the shadow — and resolving them one at a time would mean
 * every caller knowing which of its keys can hold a reference.
 */
export function resolveNamedAttrs<T extends Record<string, unknown>>(
  named: Named,
  attrs: T | undefined
): T {
  if (!attrs) return {} as T;

  let touched = false;
  const out: Record<string, unknown> = { ...attrs };
  for (const [key, value] of Object.entries(attrs)) {
    /**
     * Into the lists, too.
     *
     * A shape's paints and effects are arrays of objects, and a reference inside one
     * — `{ kind: 'solid', color: 'theme:accent1' }` — is exactly as much a
     * reference as `fill: 'theme:accent1'` was. Walking only the top level meant
     * a reader could pick a theme colour for a fill and watch the shape lose its
     * colour entirely, because `theme:accent1` is not a colour any browser
     * knows.
     *
     * One level of objects inside one level of arrays, which is the shape the
     * model actually has. Deeper would be inventing a traversal for a document
     * that cannot exist.
     */
    if (Array.isArray(value)) {
      const mapped = value.map((entry) => {
        if (!entry || typeof entry !== 'object') return entry;
        let changed = false;
        const copy: Record<string, unknown> = { ...(entry as Record<string, unknown>) };
        for (const [innerKey, innerValue] of Object.entries(copy)) {
          if (Array.isArray(innerValue)) {
            // A gradient's stops: objects one level further down, and the last
            // place a colour can hide.
            const stops = innerValue.map((stop) => {
              if (!stop || typeof stop !== 'object') return stop;
              const stopCopy = { ...(stop as Record<string, unknown>) };
              for (const [stopKey, stopValue] of Object.entries(stopCopy)) {
                if (!named.isRef(stopValue)) continue;
                changed = true;
                const resolved = named.resolve(stopValue);
                if (resolved === undefined) delete stopCopy[stopKey];
                else stopCopy[stopKey] = resolved;
              }
              return stopCopy;
            });
            copy[innerKey] = stops;
            continue;
          }
          if (!named.isRef(innerValue)) continue;
          changed = true;
          const resolved = named.resolve(innerValue);
          if (resolved === undefined) delete copy[innerKey];
          else copy[innerKey] = resolved;
        }
        return changed ? copy : entry;
      });

      if (mapped.some((entry, index) => entry !== value[index])) {
        touched = true;
        out[key] = mapped;
      }
      continue;
    }

    if (!named.isRef(value)) continue;
    touched = true;
    const resolved = named.resolve(value);
    if (resolved === undefined) delete out[key];
    else out[key] = resolved;
  }

  return (touched ? out : attrs) as T;
}

/** The theme's half on its own, for the callers that have a theme and no document. */
export function resolveThemeAttrs<T extends Record<string, unknown>>(
  theme: DeckNode | undefined,
  attrs: T | undefined
): T {
  return resolveNamedAttrs(
    { isRef: isThemeRef, resolve: (value) => resolveThemeValue(theme, value) },
    attrs
  );
}

/** Whether a value names anything at all — a theme slot or a variable. */
export function isNamedRef(value: unknown): boolean {
  return isThemeRef(value) || isVarRef(value);
}

/**
 * One value, resolved through **both** — and through a chain of them.
 *
 * A variable may hold a theme slot, so the answer is followed until it is no longer a reference.
 * Depth-limited rather than trusted: a document is an author's, and two variables pointing at each
 * other is a file this must survive rather than a case this can rule out.
 */
export function resolveDeckValue(
  doc: DeckAccess,
  masterId: string | undefined,
  value: unknown,
  depth = 0
): string | undefined {
  if (depth > 4) return undefined;

  if (isVarRef(value)) {
    const found = documentVar(doc, varNameOf(value))?.value;
    if (found === undefined || found === '') return undefined;
    return resolveDeckValue(doc, masterId, found, depth + 1);
  }

  const themed = resolveThemeValue(themeFor(doc, masterId), value);
  // A theme slot may not name a variable — the theme's values are colours and faces, and a slot
  // holding `var:x` would be a document inventing a second indirection this cannot check.
  return themed;
}

/** Every value in a set of attributes, resolved through both. */
export function resolveDeckAttrs<T extends Record<string, unknown>>(
  doc: DeckAccess,
  masterId: string | undefined,
  attrs: T | undefined
): T {
  return resolveNamedAttrs(
    { isRef: isNamedRef, resolve: (value) => resolveDeckValue(doc, masterId, value) },
    attrs
  );
}
