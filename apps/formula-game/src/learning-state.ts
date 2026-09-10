import { database } from "./database/index.ts";
import { getViewerId, readHistory } from "./history.ts";
import { readPresets } from "./presets.ts";
import { readProgress } from "./game.ts";
import { derivationStorageKey, readDerivation } from "./derivations.ts";

export async function loadLearningState() {
  const viewerId = await getViewerId();
  const [history, presets, progress, derivations] = await Promise.all([
    readHistory(viewerId),
    readPresets(viewerId),
    readProgress(),
    Promise.all(
      database.listDerivations().map(async (definition) => {
        const questions = database.getDerivationQuestions(definition.id);
        const key = derivationStorageKey(
          viewerId,
          definition,
          questions[0].formula.revision,
        );
        return [definition.id, await readDerivation(key, questions)] as const;
      }),
    ),
  ]);
  return {
    viewerId,
    history,
    presets,
    progress,
    derivations: Object.fromEntries(derivations),
  };
}
export type LearningState = Awaited<ReturnType<typeof loadLearningState>>;

// Share initialization across StrictMode mounts. A failed load can be retried.
export function createLearningLoader(prepare: () => Promise<void>) {
  let pending: Promise<LearningState> | undefined;
  return () =>
    (pending ??= prepare()
      .then(loadLearningState)
      .catch((error: unknown) => {
        pending = undefined;
        throw error;
      }));
}
