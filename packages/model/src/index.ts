export * from './types';
export * from './transaction';
export * from './transaction-dsl';
export * from './position';
export * from './create-transaction-context';
export * from './selection-context';
export * from './operations';

/*
 * There is no `./operation-dsl` any more, and its absence is worth a line.
 *
 * It held a **second** `defineOperation` — `defineOperation(type, { validate, translate })`, with a
 * registry of its own — beside the one every operation in this package actually uses,
 * `defineOperation(name, executor)`. Two contracts under one name, and they never collided only
 * because `operations/index.ts` exported nothing. The moment it exported the operations, the
 * ambiguity was a compile error.
 *
 * Measured before removing it: `applyOperation`, `DSLLibraryEntry` and `ModelContext` had no callers
 * anywhere in the repository, and neither did `utils/dsl-context.ts`, the only file that imported
 * them. An empty registry with a name that shadows the real one is worse than nothing at all.
 */
